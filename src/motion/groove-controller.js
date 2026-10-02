import * as THREE from "three";
import { isValidGrooveWave, grooveWaveValue } from "../motion/groove-wave.js";
import { eulerToQuat } from "../math/quaternions.js";

// Live host getters preserve shared rig and playback coordination.
export function createGrooveController(context){
  const _grooveEuler = [0, 0, 0];

  const _grooveQuat = new THREE.Quaternion();

  const _grooveXfadeOldQuat = new THREE.Quaternion();

  const _grooveXfadeNewQuat = new THREE.Quaternion();

  function getGrooveParams(key){
    const base = context.GROOVE_PRESETS[key];
    if (!base) return null;
    const custom = context.grooveCustomParams[key];
    return custom ? Object.assign({}, base, custom) : base;
  }

  function sanitizeGrooveCustomEntry(entry){
    const out = {};
    if (!entry || typeof entry !== "object") return out;
    if (entry.axis === "x" || entry.axis === "y" || entry.axis === "z") out.axis = entry.axis;
    if (isValidGrooveWave(entry.wave)) out.wave = entry.wave; // 含 "ease:"/"easeBi:" 合成波，見 grooveWaveValue
    if (typeof entry.amp === "number" && isFinite(entry.amp)) out.amp = entry.amp;
    if (typeof entry.freq === "number" && isFinite(entry.freq) && entry.freq > 0) out.freq = entry.freq;
    if (typeof entry.phase === "number" && isFinite(entry.phase)) out.phase = entry.phase;
    return out;
  }

  function grooveWarmupRamp(beatsElapsedTotal){
    if (!context.grooveWarmupEnabled || context.grooveWarmupBeats <= 0) return 1;
    if (beatsElapsedTotal >= context.grooveWarmupBeats) return 1;
    if (beatsElapsedTotal <= 0) return 0;
    const t = beatsElapsedTotal / context.grooveWarmupBeats;
    if (context.grooveWarmupCurve === "easeIn") return t * t;              // 一開始很慢，後段加速貼齊滿幅
    if (context.grooveWarmupCurve === "easeOut") return 1 - (1 - t) * (1 - t); // 一開始較快，後段緩和貼齊滿幅
    return t; // linear
  }

  function resetGrooveXfadeState(){
    context.grooveLastSegIndex = -1;
    context.grooveLastSegSnapshot = null;
    context.grooveXfade = null;
  }

  function applyGroove(now, overrideKeys, startTime = context.grooveStartTime, useSequence = true){
    const beatMs = 60000 / context.bpm; // 律動節拍固定跟目前 BPM 走，不受個別拍點自訂「拍數」影響，維持一致的律動感
    const beatsElapsedTotal = (now - startTime) / beatMs;
    const warmupRamp = grooveWarmupRamp(beatsElapsedTotal); // 只在整段律動剛開始的頭幾拍<1，之後恆為1，見 grooveWarmupRamp 上方註解

    let activeJointKeys, paramsFor, phaseClock;
    if (useSequence && context.grooveSequence.length > 0){
      const seg = context.getGrooveActiveSegment(beatsElapsedTotal);
      if (!seg) return; // 序列存在但總拍數算出來是0（理論上不會發生，拍數輸入框最小值是1），防呆保留
      let resolvedItem = seg.item;
      if (resolvedItem){
        context.lastValidGrooveSeqItem = resolvedItem; // 記住這次成功解析到的項目，供後面段落萬一查無項目時沿用
      } else {
        resolvedItem = context.lastValidGrooveSeqItem; // 這段引用的律動庫項目已被刪除：沿用上一個有效段落的設定，避免播放中途動作瞬間僵直
      }
      if (!resolvedItem) return; // 連前面都沒有任何有效段落可沿用（例如序列第一段就是壞的），只好先不套用
      const data = resolvedItem.data || {};
      activeJointKeys = Array.isArray(data.jointSet) ? data.jointSet : [];
      paramsFor = (key) => {
        const base = context.GROOVE_PRESETS[key];
        if (!base) return null;
        const custom = data.customParams && data.customParams[key];
        return custom ? Object.assign({}, base, custom) : base;
      };
      phaseClock = seg.localBeats; // 拍子相位仍用「目前這一段自己」的 localBeats，只有動作參數沿用舊項目，節奏不會跟著斷掉

      // 偵測是否剛切換到新段落：跟上一幀記的 segIndex 不一樣就代表換了。即使序列循環繞回同一個
      // libId 也算切換（見 getGrooveActiveSegment 上方註解），因為 localBeats 一樣會歸零。
      if (context.grooveLastSegIndex !== -1 && context.grooveLastSegIndex !== seg.segIndex && context.grooveLastSegSnapshot){
        context.grooveXfade = {
          switchElapsed: beatsElapsedTotal,
          fromKeys: context.grooveLastSegSnapshot.keys,
          fromParamsFor: context.grooveLastSegSnapshot.paramsFor,
          fromLocalBeatsAtSwitch: context.grooveLastSegSnapshot.localBeats
        };
      }
      context.grooveLastSegIndex = seg.segIndex;
      context.grooveLastSegSnapshot = { keys: activeJointKeys, paramsFor, localBeats: phaseClock };
    } else {
      if (context.grooveJointSet.size === 0) return;
      activeJointKeys = context.grooveJointSet;
      paramsFor = getGrooveParams; // 合併預設值+使用者自訂覆寫（見 getGrooveParams）
      phaseClock = beatsElapsedTotal;
      resetGrooveXfadeState(); // 沒有序列、或 useSequence=false（律動預覽）時都沒有「段落」這個概念，不需要交叉淡化，順便清掉殘留狀態
    }

    // 若正處於交叉淡化視窗內，算出「舊段落淡出權重」與舊段落自己延續下去的拍子時鐘；
    // 視窗結束後清掉狀態，之後單純只算新段落，跟沒有交叉淡化時完全一樣，不佔額外效能。
    let xfadeWeight = 0, fromKeys = null, fromParamsFor = null, fromPhaseClock = 0;
    if (context.grooveXfade){
      const elapsedSinceSwitch = beatsElapsedTotal - context.grooveXfade.switchElapsed;
      if (elapsedSinceSwitch >= context.GROOVE_XFADE_BEATS || elapsedSinceSwitch < 0){
        context.grooveXfade = null; // elapsedSinceSwitch<0 理論上不會發生（時間不會倒流），防呆順便清掉避免卡住
      } else {
        xfadeWeight = 1 - (elapsedSinceSwitch / context.GROOVE_XFADE_BEATS); // 1→0：舊段落的貢獻度隨時間線性淡出
        fromKeys = context.grooveXfade.fromKeys;
        fromParamsFor = context.grooveXfade.fromParamsFor;
        // 延續時鐘：假裝舊段落沒被打斷，讓它的相位順著原本節奏繼續走，這樣「舊段落這一側」完全
        // 不會有跳動，混合結束時貢獻度自然淡到0，不需要額外處理收尾。
        fromPhaseClock = context.grooveXfade.fromLocalBeatsAtSwitch + elapsedSinceSwitch;
      }
    }

    const hasFromKeys = xfadeWeight > 0 && fromKeys;
    const keysToProcess = hasFromKeys ? new Set([...activeJointKeys, ...fromKeys]) : activeJointKeys;

    for (const key of keysToProcess){
      if (overrideKeys && overrideKeys.has(key)) continue;
      const bone = context.bones[key];
      if (!bone) continue;

      const inNew = Array.isArray(activeJointKeys) ? activeJointKeys.includes(key) : activeJointKeys.has(key);
      const newPreset = inNew ? paramsFor(key) : null;

      if (!hasFromKeys){
        // 沒有交叉淡化：完全比照原本行為，單一段落直接算、直接套用。
        if (!newPreset) continue;
        const v = grooveWaveValue(newPreset.wave, phaseClock * newPreset.freq + newPreset.phase) * newPreset.amp * warmupRamp;
        _grooveEuler[0] = newPreset.axis === "x" ? v : 0;
        _grooveEuler[1] = newPreset.axis === "y" ? v : 0;
        _grooveEuler[2] = newPreset.axis === "z" ? v : 0;
        bone.quaternion.multiply(eulerToQuat(_grooveEuler, _grooveQuat));
        continue;
      }

      // 交叉淡化中：新／舊段落各自算出一個「這個關節該轉到哪」的四元數（沒有這個關節的那一側視為
      // 不轉／單位四元數），再用 Slerp 依權重混合。
      if (newPreset){
        const v = grooveWaveValue(newPreset.wave, phaseClock * newPreset.freq + newPreset.phase) * newPreset.amp * warmupRamp;
        _grooveEuler[0] = newPreset.axis === "x" ? v : 0;
        _grooveEuler[1] = newPreset.axis === "y" ? v : 0;
        _grooveEuler[2] = newPreset.axis === "z" ? v : 0;
        eulerToQuat(_grooveEuler, _grooveXfadeNewQuat);
      } else {
        _grooveXfadeNewQuat.identity();
      }

      const oldPreset = fromKeys.includes(key) ? fromParamsFor(key) : null;
      if (oldPreset){
        const v = grooveWaveValue(oldPreset.wave, fromPhaseClock * oldPreset.freq + oldPreset.phase) * oldPreset.amp * warmupRamp;
        _grooveEuler[0] = oldPreset.axis === "x" ? v : 0;
        _grooveEuler[1] = oldPreset.axis === "y" ? v : 0;
        _grooveEuler[2] = oldPreset.axis === "z" ? v : 0;
        eulerToQuat(_grooveEuler, _grooveXfadeOldQuat);
      } else {
        _grooveXfadeOldQuat.identity();
      }

      _grooveQuat.copy(_grooveXfadeOldQuat).slerp(_grooveXfadeNewQuat, 1 - xfadeWeight); // weight從1(剛切換,幾乎全舊值)降到0(全新值)
      bone.quaternion.multiply(_grooveQuat);
    }
  }
  return { getGrooveParams, sanitizeGrooveCustomEntry, grooveWarmupRamp, resetGrooveXfadeState, applyGroove };
}
