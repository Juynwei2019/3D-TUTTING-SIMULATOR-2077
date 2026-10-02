import * as THREE from "three";
import { IK_CHAINS } from "../rig/definitions.js";
import { grooveWaveValue } from "../motion/groove-wave.js";
import { solveTwoBoneIK } from "../ik/two-bone.js";
import { applyBoneWorldQuatLock } from "../math/quaternions.js";

// Live host getters preserve shared rig and playback coordination.
export function createSquatController(context){
  const _squatDeltaTmp = new THREE.Vector3();

  const _squatMidPosTmp = new THREE.Vector3();

  const _squatPolePosTmp = new THREE.Vector3();

  function getGrooveSquatParams(){
    return Object.assign({}, context.GROOVE_SQUAT_DEFAULT, context.grooveSquatCustom);
  }

  function sanitizeGrooveSquatCustomEntry(entry){
    const out = {};
    if (!entry || typeof entry !== "object") return out;
    if (typeof entry.vertAmp === "number" && isFinite(entry.vertAmp)) out.vertAmp = entry.vertAmp;
    if (typeof entry.lateralAmp === "number" && isFinite(entry.lateralAmp)) out.lateralAmp = entry.lateralAmp;
    if (typeof entry.freq === "number" && isFinite(entry.freq) && entry.freq > 0) out.freq = entry.freq;
    if (typeof entry.phase === "number" && isFinite(entry.phase)) out.phase = entry.phase;
    // 蹲彈刻意「不」開放 ease:/easeBi: 合成波（跟單關節振盪不同）：蹲彈輸出的是 Hips 的實際位移量，
    // 再由兩節 IK 反推腿部角度；Back/Elastic 這類會 overshoot 出 [0,1] 的波形會把身體推超出腿長可及範圍，
    // IK 解不到就會出現腳掌脫離錨點/膝蓋反折。旋轉疊加沒有這個問題（角度超一點只是動作大一點），所以只在那邊開放。
    if (entry.wave === "bounce" || entry.wave === "sine") out.wave = entry.wave;
    // 側向：獨立的頻率/相位/波形，驗證規則跟垂直的對應欄位一致
    if (typeof entry.lateralFreq === "number" && isFinite(entry.lateralFreq) && entry.lateralFreq > 0) out.lateralFreq = entry.lateralFreq;
    if (typeof entry.lateralPhase === "number" && isFinite(entry.lateralPhase)) out.lateralPhase = entry.lateralPhase;
    if (entry.lateralWave === "bounce" || entry.lateralWave === "sine") out.lateralWave = entry.lateralWave;
    return out;
  }

  function captureSquatFootAnchors(){
    for (const limb of ["rLeg", "lLeg"]){
      const chain = IK_CHAINS[limb];
      const footBone = context.bones[chain.end];
      if (!footBone) continue;
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      footBone.getWorldPosition(pos);
      footBone.getWorldQuaternion(quat);
      context.grooveSquatFootAnchor[limb] = pos;
      context.grooveSquatFootLockedQuat[limb] = quat;
    }
    context.grooveSquatAnchored = true;
  }

  function resetSquatFootAnchors(){
    context.grooveSquatAnchored = false;
    context.grooveSquatFootAnchor = { rLeg:null, lLeg:null };
    context.grooveSquatFootLockedQuat = { rLeg:null, lLeg:null };
  }

  function resetSquatXfadeState(){
    context.squatLastSegIndex = -1;
    context.squatLastSegSnapshot = null;
    context.squatXfade = null;
  }

  function computeSquatDelta(enabled, params, phase){
    if (!enabled || !params) return { dx: 0, dy: 0 };
    const vertBeats = phase * params.freq + params.phase;
    const lateralBeats = phase * params.lateralFreq + params.lateralPhase;
    const vertVal = grooveWaveValue(params.wave, vertBeats);         // bounce：0~1（只往下沉）；sine：-1~1
    const lateralVal = grooveWaveValue(params.lateralWave, lateralBeats);
    return {
      dy: -(params.vertAmp / 100) * vertVal,   // 蹲下＝往下沉，所以取負值；單位換算：UI是公分，場景座標是公尺
      dx: (params.lateralAmp / 100) * lateralVal
    };
  }

  function applySquatGroove(now, startTime, needsDriftCorrection, overrideKeys, useSequence = true){
    // legTrajOverridden：這一段轉場的腿正被「軌跡拍點」IK接管（見 collectTrajOverrideKeys）。
    // 修正：蹲彈律動之前沒檢查這個，會在 applyTrajOverridesDuringPlayback 剛把腳踩上軌跡路徑之後，
    // 馬上又用另一套IK把腳拉回律動的原地錨點，兩邊每幀互搶同一組骨骼，造成腳/膝蓋抖動、瞬移。
    const legTrajOverridden = !!overrideKeys && (
      overrideKeys.has(IK_CHAINS.rLeg.root) || overrideKeys.has(IK_CHAINS.rLeg.mid) ||
      overrideKeys.has(IK_CHAINS.lLeg.root) || overrideKeys.has(IK_CHAINS.lLeg.mid)
    );

    // 若有律動序列，蹲彈開關/參數跟單關節振盪（見 applyGroove）一樣改由序列目前解析出的律動庫
    // 項目決定，覆蓋掉上面手動的 grooveSquatEnabled／grooveSquatCustom；段落切換時的交叉淡化
    // 邏輯跟 applyGroove 是同一套時間窗（GROOVE_XFADE_BEATS），只是這裡混合的是位移量（dx/dy）
    // 而不是旋轉四元數，用簡單線性內插就足夠平滑，不需要 Slerp。沒有序列則維持原本行為：
    // 全域設定＋連續時鐘。useSequence 用途跟 applyGroove 一致：「律動預覽」呼叫時傳 false，
    // 讓預覽固定只看手動設定，不會被序列蓋掉。
    const beatMs = 60000 / context.bpm;
    const beatsElapsedTotal = (now - startTime) / beatMs;
    let squatEnabledEff, squatParams, phaseBase;
    if (useSequence && context.grooveSequence.length > 0){
      const seg = context.getGrooveActiveSegment(beatsElapsedTotal);
      let data = (seg && seg.item) ? (seg.item.data || {}) : null;
      if (data){
        context.lastValidSquatSeqData = data; // 記住這次成功解析到的蹲彈設定，供後面段落萬一查無項目時沿用
      } else {
        data = context.lastValidSquatSeqData; // 這段引用的律動庫項目已被刪除：沿用上一個有效段落的蹲彈設定，避免蹲彈動作瞬間停止
      }
      squatEnabledEff = !!(data && data.squatEnabled);
      squatParams = Object.assign({}, context.GROOVE_SQUAT_DEFAULT, (data && data.squatCustom) || {});
      phaseBase = seg ? seg.localBeats : 0;

      // 偵測段落切換：跟 applyGroove 同一套 segIndex 判斷邏輯，狀態各自獨立存放。
      const segIndex = seg ? seg.segIndex : -1;
      if (context.squatLastSegIndex !== -1 && context.squatLastSegIndex !== segIndex && context.squatLastSegSnapshot){
        context.squatXfade = {
          switchElapsed: beatsElapsedTotal,
          fromEnabled: context.squatLastSegSnapshot.enabled,
          fromParams: context.squatLastSegSnapshot.params,
          fromLocalBeatsAtSwitch: context.squatLastSegSnapshot.localBeats
        };
      }
      context.squatLastSegIndex = segIndex;
      context.squatLastSegSnapshot = { enabled: squatEnabledEff, params: squatParams, localBeats: phaseBase };
    } else {
      squatEnabledEff = context.grooveSquatEnabled;
      squatParams = getGrooveSquatParams();
      phaseBase = beatsElapsedTotal;
      resetSquatXfadeState(); // 沒有序列、或 useSequence=false（律動預覽）時都不需要交叉淡化，順便清掉殘留狀態
    }

    // 交叉淡化視窗內：算出舊段落淡出權重，時間邏輯跟 applyGroove 一致。
    let squatXfadeWeight = 0, fromSquatEnabled = false, fromSquatParams = null, fromSquatPhaseClock = 0;
    if (context.squatXfade){
      const elapsedSinceSwitch = beatsElapsedTotal - context.squatXfade.switchElapsed;
      if (elapsedSinceSwitch >= context.GROOVE_XFADE_BEATS || elapsedSinceSwitch < 0){
        context.squatXfade = null;
      } else {
        squatXfadeWeight = 1 - (elapsedSinceSwitch / context.GROOVE_XFADE_BEATS);
        fromSquatEnabled = context.squatXfade.fromEnabled;
        fromSquatParams = context.squatXfade.fromParams;
        fromSquatPhaseClock = context.squatXfade.fromLocalBeatsAtSwitch + elapsedSinceSwitch; // 延續時鐘，理由同 applyGroove
      }
    }

    // active 拆成兩層：activeBase 是跟蹲彈無關的硬性條件（隨時可能讓蹲彈整個讓路，交叉淡化不該
    // 蓋過這些）；squatEnabledEff 這一層才是交叉淡化要柔化的對象——切換瞬間即使新段落沒開蹲彈，
    // 只要還在淡出舊段落的視窗內，也要視為「仍需要跑蹲彈流程」，讓位移平滑歸零而不是硬切消失。
    const activeBase = !context.ikEnabled.rLeg && !context.ikEnabled.lLeg && !legTrajOverridden;
    const active = activeBase && (squatEnabledEff || (squatXfadeWeight > 0 && fromSquatEnabled));

    // 不管現在active與否，只要上一幀有留下預覽模式的位移殘留就先清乾淨，
    // 避免「關掉蹲彈/切到手動腿部IK」那一刻角色卡在半蹲姿勢。
    if (needsDriftCorrection && context._squatPreviewLastDelta.lengthSq() > 0){
      context.model.position.sub(context._squatPreviewLastDelta);
      context._squatPreviewLastDelta.set(0, 0, 0);
      context.model.updateMatrixWorld(true);
    }

    if (!active){
      resetSquatFootAnchors();
      return;
    }

    if (!context.grooveSquatAnchored) captureSquatFootAnchors();

    // 新段落的位移貢獻（沒開蹲彈就是0）；若正在交叉淡化，再跟舊段落延續下去的貢獻依權重線性混合。
    const newDelta = computeSquatDelta(squatEnabledEff, squatParams, phaseBase);
    let dx = newDelta.dx, dy = newDelta.dy;
    if (squatXfadeWeight > 0){
      const oldDelta = computeSquatDelta(fromSquatEnabled, fromSquatParams, fromSquatPhaseClock);
      dy = oldDelta.dy * squatXfadeWeight + newDelta.dy * (1 - squatXfadeWeight);
      dx = oldDelta.dx * squatXfadeWeight + newDelta.dx * (1 - squatXfadeWeight);
    }
    // 暖身漸強：只在整段律動剛開始的頭幾拍把位移壓小，理由跟 applyGroove 一致（見 grooveWarmupRamp）。
    const warmupRamp = context.grooveWarmupRamp(beatsElapsedTotal);
    dx *= warmupRamp;
    dy *= warmupRamp;

    _squatDeltaTmp.set(dx, dy, 0);
    context.model.position.add(_squatDeltaTmp);
    if (needsDriftCorrection) context._squatPreviewLastDelta.copy(_squatDeltaTmp);
    context.model.updateMatrixWorld(true);

    // 兩腿各自反算：目標＝原地錨點（固定世界座標，不受這次平移影響），
    // 極向球＝目前膝蓋位置往「猜測的身體前方」偏移一點（沿用 IK_CHAINS 既有的 poleOffset 假設）。
    for (const limb of ["rLeg", "lLeg"]){
      const anchor = context.grooveSquatFootAnchor[limb];
      if (!anchor) continue;
      const chain = IK_CHAINS[limb];
      const rootBone = context.bones[chain.root], midBone = context.bones[chain.mid], endBone = context.bones[chain.end];
      if (!rootBone || !midBone || !endBone) continue;

      midBone.getWorldPosition(_squatMidPosTmp);
      _squatPolePosTmp.copy(_squatMidPosTmp).add(chain.poleOffset);
      solveTwoBoneIK(rootBone, midBone, endBone, anchor, _squatPolePosTmp);
      applyBoneWorldQuatLock(endBone, context.grooveSquatFootLockedQuat[limb]);
    }
  }
  return { getGrooveSquatParams, sanitizeGrooveSquatCustomEntry, captureSquatFootAnchors, resetSquatFootAnchors, resetSquatXfadeState, computeSquatDelta, applySquatGroove };
}
