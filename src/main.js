import { createWaveform } from "./timeline/waveform.js";
import { createWaveformView } from "./ui/waveform-view.js";
import { createTimelineAudio } from "./timeline/audio-controller.js";
import { createTimelineEditor } from "./ui/timeline-editor.js";
import { createTimelinePlayback } from "./timeline/playback.js";
import { insertKeyframe, duplicateKeyframeData, reorderKeyframeData, totalKeyframeBeats, keyframeStartBeat as timelineStartBeat, locateKeyframeSegmentAtBeat as locateTimelineSegment } from "./timeline/data.js";
import { initGlobalTooltips } from "./ui/tooltips.js";
import { EASINGS, EASING_GROUPS } from "./math/easings.js";
import { D, R, clampNum } from "./math/angles.js";
import { eulerToQuat, applyBoneWorldQuatLock, applyWorldDeltaQuat } from "./math/quaternions.js";
import { buildEasingSVG, buildEasingSelectOptions, initEasingGallery } from "./ui/easing-gallery.js";
import { placeModelOnGround } from "./rig/model-utils.js";
import { findBone } from "./rig/find-bone.js";
import { solveTwoBoneIK } from "./ik/two-bone.js";
import { solveCCDChain } from "./ik/ccd.js";
import { createPoseController } from "./pose/pose-controller.js";
import { createJointLimiter } from "./pose/joint-limits.js";
import { sampleTrajectoryFromPoints } from "./motion/trajectory.js";
import { GROOVE_WAVE_EASE_PREFIX, GROOVE_WAVE_EASE_BI_PREFIX, isValidGrooveWave, grooveWaveValue, grooveWaveLabel } from "./motion/groove-wave.js";
import { TG_KEYS, TG_DEFAULT, tgCopy, cleanTGConfig, tgGenerateCandidates } from "./motion/tutting-generator.js";
import { createGrabBoxCore } from "./interaction/grab-core.js";
import { mountGrabBoxUI } from "./ui/grab-panel.js";
import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "./rig/definitions.js";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

initGlobalTooltips();

const MODEL_URL = "https://threejs.org/examples/models/gltf/Xbot.glb";

// ==== 關節角度限制（Joint Limits）====
// 涵蓋 ALL_JOINT_KEYS 全部關節（軀幹/頭/手臂/腿/手指），介面依 OVERVIEW_GROUPS 同一套分組
// 顯示、可個別收合，避免50個關節攤開成一長串。
// 每個關節、每一軸各自可獨立啟用/停用，停用的軸完全不受影響（維持原本自由旋轉）。
// 數值單位：度，相對 rest pose（跟 target/current 陣列同一套座標系）。
// 注意：因為採用歐拉角 XYZ 分軸限制，對球窩關節（肩膀/髖）在极端姿勢下只是近似值，
// 不是嚴謹的生物力學限制；請實際在畫面上轉動關節、參考「關節總覽」分頁顯示的角度，
// 抓出真正合理的最小/最大值再啟用。
const JOINT_LIMIT_KEYS = ALL_JOINT_KEYS;
const JOINT_LIMITS_STORAGE_KEY = "tuttingJointLimits";

function defaultJointLimits(){
  const obj = {};
  for (const k of JOINT_LIMIT_KEYS){
    obj[k] = {
      x: { enabled:false, min:-180, max:180 },
      y: { enabled:false, min:-180, max:180 },
      z: { enabled:false, min:-180, max:180 }
    };
  }
  return obj;
}
let JOINT_LIMITS = defaultJointLimits();
loadJointLimits(); // 開頁就從 localStorage 還原使用者上次設定的限制範圍（若有）

function loadJointLimits(){
  try {
    const raw = localStorage.getItem(JOINT_LIMITS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const k of JOINT_LIMIT_KEYS){
      if (!saved[k]) continue;
      for (const axis of ["x","y","z"]){
        if (saved[k][axis]) Object.assign(JOINT_LIMITS[k][axis], saved[k][axis]);
      }
    }
  } catch (e){ console.warn("關節限制讀取失敗:", e); }
}

function saveJointLimits(){
  try { localStorage.setItem(JOINT_LIMITS_STORAGE_KEY, JSON.stringify(JOINT_LIMITS)); }
  catch (e){ console.warn("關節限制儲存失敗:", e); }
}

// ==== Isolation（分區隨機）設定 ====
// 「動作生成」預設是把全部有啟用限制的關節一次全部重骰；開啟 Isolation 後，
// 改成每次先從 OVERVIEW_GROUPS 分組裡隨機抽幾組，只重骰被抽中分組的關節，
// 其餘關節（就算有啟用限制）這次維持不動——比較接近真人跳舞「只有一部分身體在動」的感覺。
const ISOLATION_STORAGE_KEY = "tuttingIsolationSettings";
let isolationSettings = {
  enabled: false,
  minGroups: 1,
  maxGroups: 2,
  weights: {},      // groupId -> 分組被抽中的相對權重，沒填視為1（平均機率）
  jointWeights: {}  // jointKey -> 這個關節「這次生成有沒有被摸到」的機率(0~100)，沒填視為100（一定摸到）
};
loadIsolationSettings();

function loadIsolationSettings(){
  try {
    const raw = localStorage.getItem(ISOLATION_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.enabled === "boolean") isolationSettings.enabled = saved.enabled;
    if (typeof saved.minGroups === "number") isolationSettings.minGroups = saved.minGroups;
    if (typeof saved.maxGroups === "number") isolationSettings.maxGroups = saved.maxGroups;
    if (saved.weights && typeof saved.weights === "object") Object.assign(isolationSettings.weights, saved.weights);
    if (saved.jointWeights && typeof saved.jointWeights === "object") Object.assign(isolationSettings.jointWeights, saved.jointWeights);
  } catch (e){ console.warn("Isolation設定讀取失敗:", e); }
}

function saveIsolationSettings(){
  try { localStorage.setItem(ISOLATION_STORAGE_KEY, JSON.stringify(isolationSettings)); }
  catch (e){ console.warn("Isolation設定儲存失敗:", e); }
}

function getGroupWeight(groupId){
  const w = isolationSettings.weights[groupId];
  return (typeof w === "number" && Number.isFinite(w) && w >= 0) ? w : 1;
}

// 單一關節「這次生成有沒有被摸到」的機率，單位0~100（%），沒設定過視為100＝一定摸到。
// 跟分組權重是兩層獨立機制：分組權重決定「這次抽中哪些分組」，關節機率決定「抽中的分組裡，
// 這個特定關節這次要不要真的重骰」——例如「右手臂」被抽中了，肩胛可以設低機率、手掌設高機率，
// 做出「手臂動的時候通常是手掌先動、肩膀比較少跟著大幅擺」這種細節。
function getJointWeight(key){
  const w = isolationSettings.jointWeights[key];
  return (typeof w === "number" && w >= 0 && w <= 100) ? w : 100;
}

// 加權不放回抽樣：從 pool（分組陣列）依「基準權重」抽出 count 個不重複分組。
function pickWeightedGroupsWithoutReplacement(pool, count){
  const items = pool.map(g => ({ g, w: getGroupWeight(g.id) })).filter(it=>it.w>0);
  const picked = [];
  for (let i = 0; i < count && items.length > 0; i++){
    const total = items.reduce((s, it) => s + it.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < items.length - 1; idx++){
      r -= items[idx].w;
      if (r <= 0) break;
    }
    picked.push(items[idx].g);
    items.splice(idx, 1);
  }
  return picked;
}

const { clampJointAngles } = createJointLimiter(() => JOINT_LIMITS);

// ==== 動作生成（隨機姿勢生成器）====
// 只在 JOINT_LIMIT_KEYS（全部關節）裡，該軸有「啟用限制」時才隨機取值；
// 沒啟用的軸沒有範圍可取樣，維持目前角度不動。
// 取樣策略＝格點取樣＋偏向極值：比起純連續均勻隨機，這樣角度容易卡在同一批固定刻度、
// 也有一定機率直接貼在min或max（=完全伸直/完全折死），視覺上比較接近tutting那種
// 俐落方正、卡點到位的感覺，而不是軟趴趴的隨意角度。
function sampleAxisAngle(key, axis, axisLim, gridStep, edgeProb){
  if (!axisLim || !axisLim.enabled) return null; // null＝沒有範圍，呼叫端維持原值
  let lo = axisLim.min, hi = axisLim.max;
  if (lo > hi){ const t = lo; lo = hi; hi = t; }
  if (hi - lo < 1e-6) return lo; // min===max，沒有隨機空間，直接回傳固定值

  if (Math.random() < edgeProb){
    // 貼邊界：候選值只有 [完全伸直, 完全折死] 兩個。
    return Math.random() < 0.5 ? lo : hi;
  }
  if (gridStep > 0){
    const first=Math.ceil(lo/gridStep),last=Math.floor(hi/gridStep);
    if(first>last)return null; // no zero-anchored grid point: preserve the current axis
    return (first+Math.floor(Math.random()*(last-first+1)))*gridStep;
  }
  return lo + Math.random() * (hi - lo); // gridStep<=0時退回連續均勻隨機
}

// 產生並套用一個隨機姿勢：對 JOINT_LIMIT_KEYS（全部關節）逐一判斷每一軸有沒有啟用限制。
// gridStep/edgeProb 由「關節限制」分頁的兩個輸入框即時讀取，方便你邊調參數邊按「動作生成」試感覺。
function generateRandomPose(){
  const gridStep = parseFloat(document.getElementById("jlGridStepInput")?.value) || 15;
  const edgeProbPct = parseFloat(document.getElementById("jlEdgeProbInput")?.value);
  const edgeProb = (isNaN(edgeProbPct) ? 40 : edgeProbPct) / 100;
  const statusEl = document.getElementById("jlIsolationStatus");

  // 「有資格被重骰」＝有對應骨骼、且至少一軸啟用限制；不管有沒有開Isolation都先算這份清單。
  const eligibleKeys = JOINT_LIMIT_KEYS.filter(key => {
    if (!bones[key]) return false;
    const lim = JOINT_LIMITS[key];
    return lim.x.enabled || lim.y.enabled || lim.z.enabled;
  });
  if (eligibleKeys.length === 0){
    alert(`目前全部 ${JOINT_LIMIT_KEYS.length} 個關節都還沒有啟用任何一軸的限制，沒有範圍可以隨機。\n請先在下面找到想要的關節、勾選至少一軸並填入合理的最小/最大值。`);
    return;
  }

  let keysToRoll;
  if (isolationSettings.enabled){
    const eligibleKeySet = new Set(eligibleKeys);
    // 分組裡只要有任一關節「有資格」，這組就有資格被抽中
    const eligibleGroups = OVERVIEW_GROUPS.filter(g => getGroupWeight(g.id)>0 && g.keys.some(k => eligibleKeySet.has(k)));
    if (eligibleGroups.length === 0){
      alert("目前沒有權重大於 0 且已啟用關節限制的分組，無法進行 Isolation 隨機。");
      return;
    }
    const lo = Math.max(1, Math.min(isolationSettings.minGroups, isolationSettings.maxGroups));
    const hi = Math.max(isolationSettings.minGroups, isolationSettings.maxGroups);
    const wantCount = Math.min(eligibleGroups.length, lo + Math.floor(Math.random() * (hi - lo + 1)));
    const pickedGroups = pickWeightedGroupsWithoutReplacement(eligibleGroups, wantCount);

    const pickedKeySet = new Set();
    for (const g of pickedGroups) for (const k of g.keys) if (eligibleKeySet.has(k)) pickedKeySet.add(k);
    keysToRoll = eligibleKeys.filter(k => pickedKeySet.has(k));

    if (statusEl) statusEl.textContent = "本次選中：" + pickedGroups.map(g => g.label).join("、");
  } else {
    keysToRoll = eligibleKeys;
    if (statusEl) statusEl.textContent = "";
  }

  // 第二層篩選：範圍內（分組選中／或Isolation未開啟時的全部有資格關節）的每個關節，
  // 再各自依「機率」決定這次是否真的要重骰——機率100（預設）＝一定摸到，行為跟原本一樣；
  // 機率調低可以做出「同一組裡有些關節常動、有些關節難得動一次」的細節。
  const finalKeys = keysToRoll.filter(key => Math.random() * 100 < getJointWeight(key));
  const skippedByWeight = keysToRoll.length - finalKeys.length;
  if (statusEl && skippedByWeight > 0){
    statusEl.textContent += (statusEl.textContent ? "　" : "") + `（另有 ${skippedByWeight} 個關節因機率設定這次跳過）`;
  }

  for (const key of finalKeys){
    const lim = JOINT_LIMITS[key];
    const cur = poseController.getTarget(key) || [0,0,0];
    const rawSamples = [
      sampleAxisAngle(key, "x", lim.x, gridStep, edgeProb),
      sampleAxisAngle(key, "y", lim.y, gridStep, edgeProb),
      sampleAxisAngle(key, "z", lim.z, gridStep, edgeProb)
    ];
    const xyz = rawSamples.map((v, i) => v === null ? cur[i] : v); // 沒啟用的軸（null）維持原本角度
    setTarget(key, xyz); // setTarget內部本身也會clamp，這裡等於雙重保險
  }
  setActiveBtn(-1);
  updateSelectedBar();
  updateJointLimitPanelAngles(true);

  pushHistory();
}

// ---- 律動模式：預設每個「可參與律動」關節的振盪參數（簡化版）----
// 使用者只勾選要不要參與，軸向/強度/波形/拍速倍率/相位一律用這裡的預設值——
// 之後如果要開放使用者自行微調，數值來源就是這份表，UI再加滑桿即可，不用動運算邏輯。
// axis：疊加旋轉套在哪個本地軸；amp：振幅（度）；freq：每一拍振盪幾次；
// phase：相位偏移（0~1，同一時間點不同關節錯開，做出「一節一節跟著甩」的律動感）；
// wave："bounce"＝單向彈跳（0→amp→0，像蹲下再彈起，適合膝蓋/骨盆/脊椎)，
//       "sine"＝正弦來回擺（-amp→+amp，適合肩膀/頭部這類左右/前後擺動的部位）。
const GROOVE_PRESETS = {
  hips:      { axis:"x", amp:4, freq:1, phase:0.00, wave:"bounce" },
  spine:     { axis:"x", amp:3, freq:1, phase:0.03, wave:"bounce" },
  spine1:    { axis:"x", amp:4, freq:1, phase:0.06, wave:"bounce" },
  spine2:    { axis:"x", amp:5, freq:1, phase:0.09, wave:"bounce" },
  neck:      { axis:"x", amp:4, freq:1, phase:0.12, wave:"sine"   },
  head:      { axis:"x", amp:5, freq:1, phase:0.15, wave:"sine"   },
  rShoulder: { axis:"z", amp:3, freq:1, phase:0.50, wave:"sine"   },
  lShoulder: { axis:"z", amp:3, freq:1, phase:0.00, wave:"sine"   },
  rArm:      { axis:"z", amp:4, freq:1, phase:0.50, wave:"sine"   },
  lArm:      { axis:"z", amp:4, freq:1, phase:0.00, wave:"sine"   },
  // 手臂鏈往外延伸兩節：前臂（肘）與手掌（腕）。軸向刻意沿用上臂的 z，讓整條
  // 肩胛→上臂→前臂→手掌 是同一個擺動方向、只差相位，看起來才是「一條手臂在甩」
  // 而不是各節各轉各的；相位每往外一節 +0.04 拍（跟自動生成器 GROOVE_ARM_PAIRS 的
  // lag 同一套結構），做出運動鏈由近端傳到遠端的延遲感。振幅則往外遞減（4→3→2），
  // 因為遠端關節的角度會被上游整條手臂放大成很大的位移，等幅疊加會變成甩手而不是律動。
  rForeArm:  { axis:"z", amp:3, freq:1, phase:0.54, wave:"sine"   },
  lForeArm:  { axis:"z", amp:3, freq:1, phase:0.04, wave:"sine"   },
  rHand:     { axis:"z", amp:2, freq:1, phase:0.58, wave:"sine"   },
  lHand:     { axis:"z", amp:2, freq:1, phase:0.08, wave:"sine"   }
  // rUpLeg/lUpLeg/rLeg/lLeg 刻意不放在這裡：腿是「腳掌貼地、膝蓋反算彎曲角度」的協同動作，
  // 不是單一關節可以自己決定角度的自由度，改用下面的「蹲彈律動」系統（GROOVE_SQUAT_DEFAULT
  // + applySquatGroove()），透過兩節IK＋腳踝世界旋轉鎖存來解，詳見該區塊上方註解。
};
const GROOVE_JOINT_KEYS = Object.keys(GROOVE_PRESETS);

// ---- 蹲彈律動（雙腳同步）----
// 跟上面「單關節各自振盪」的 GROOVE_PRESETS 不是同一套機制：真正的人體下肢律動是
// 「膝蓋彎曲讓身體整體上下/左右移動、腳掌固定貼地不動」，四根骨頭(大腿×2/小腿×2)加兩隻腳踝
// 要當一個系統一起解，不能像肩膀/脊椎那樣各自對自己的本地軸疊加旋轉——單獨轉大腿或小腿，
// 腳掌的世界座標只是「疊加旋轉算出來的副產物」，不是被控制的量，角度一大腳就會飄起來或插地。
// 正確作法：用 Hips 平移（左右腳同步，符合真實人體對稱蹲彈）驅動身體整體升降/側移，
// 兩腿各自用專案既有的兩節解析解 solveTwoBoneIK() 反推大腿/小腿角度，讓腳掌精準固定在
// 原地錨點；腳踝則用既有的 applyBoneWorldQuatLock()（從 applyFootLock 抽出的共用邏輯）
// 鎖住腳掌世界旋轉＝貼地。實作見下方 applySquatGroove()。
// vertAmp/lateralAmp 單位是「公分」（UI 顯示用），套用時會除以100換算成場景的公尺單位。
const GROOVE_SQUAT_DEFAULT = {
  vertAmp:5, lateralAmp:2,
  freq:1, phase:0, wave:"bounce",              // 垂直：欄位名維持不變，向下相容舊存檔/舊律動庫項目
  lateralFreq:1, lateralPhase:0, lateralWave:"sine" // 側向：新增獨立時鐘，預設值＝原本寫死的行為，不影響舊資料
};
let grooveSquatEnabled = false; // 預設關閉：這是全新機制，不希望舊使用者一開檔案就多一個沒設定過的位移效果
let grooveSquatCustom = {};     // 使用者自訂覆寫（只存改過的欄位），跟 grooveCustomParams 同一套設計哲學

function getGrooveSquatParams(){
  return Object.assign({}, GROOVE_SQUAT_DEFAULT, grooveSquatCustom);
}

// 讀檔容錯：過濾格式不對的自訂欄位，避免壞資料讓蹲彈算出 NaN 或非法波形。
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

// ---- 律動模式：使用者自訂覆寫 ----
// 只存「使用者改過的欄位」，例如 { rArm: { amp:8 } }；沒改過的欄位/關節一律沿用 GROOVE_PRESETS。
// 好處：想恢復某關節的預設值時直接刪掉這個 key 即可，不用另外維護一份「原始值備份」。
let grooveCustomParams = {};

// 取得某關節「目前實際生效」的律動參數＝預設值疊上使用者自訂覆寫（只覆寫有改過的欄位）。
// UI 編輯面板／即時預覽／播放疊加(applyGroove) 三處全部只透過這個函式讀參數，
// 避免各自讀不同來源，導致面板顯示的跟實際套用的對不起來。
function getGrooveParams(key){
  const base = GROOVE_PRESETS[key];
  if (!base) return null;
  const custom = grooveCustomParams[key];
  return custom ? Object.assign({}, base, custom) : base;
}

// 匯入/還原自動存檔時，過濾掉格式不對的自訂欄位（例如手動改壞的 JSON），
// 避免壞資料流進 grooveCustomParams 之後在 applyGroove() 算出 NaN 或非法軸向。
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

// ---- 波形系統（bounce / sine / Easing 合成波）----
// 原本只有 bounce 與 sine 兩種，對 tutting 需要的「頓點」「甩過頭」完全表達不出來。
// 這裡不另外寫新的波形數學，而是直接把專案既有的 32 條 Easing 曲線（EASINGS）當成波形素材：
//   "ease:<easingName>"   單向波，語意跟 bounce 同極性（整拍點為 0 → 半拍衝到 1 → 回到 0），
//                         只是上升/下降的曲線換成該 easing。例：ease:easeOutBack 會衝過 1 再收回來
//                         （甩過頭再回彈）；ease:easeInOutExpo 幾乎是方波（機械式硬切）。
//   "easeBi:<easingName>" 來回波，語意跟 sine 同極性同相位（整拍點為 0 → 1/4 拍 +1 → 3/4 拍 -1 → 回 0），
//                         用來取代 sine 做左右擺，但擺動的「加減速質感」可以換。
// 好處：波形庫從 2 種一次擴到 60 幾種、跟時間軸的轉場曲線共用同一份曲線與同一套視覺語彙，
// 而且 applyGroove/applySquatGroove 完全不用改——它們只呼叫這個函式拿係數。
// 注意：EASINGS 宣告在本函式下方（約 2200 行），這裡只在「執行期」讀取，不是模組載入期，沒有 TDZ 問題。
function grooveWarmupRamp(beatsElapsedTotal){
  if (!grooveWarmupEnabled || grooveWarmupBeats <= 0) return 1;
  if (beatsElapsedTotal >= grooveWarmupBeats) return 1;
  if (beatsElapsedTotal <= 0) return 0;
  const t = beatsElapsedTotal / grooveWarmupBeats;
  if (grooveWarmupCurve === "easeIn") return t * t;              // 一開始很慢，後段加速貼齊滿幅
  if (grooveWarmupCurve === "easeOut") return 1 - (1 - t) * (1 - t); // 一開始較快，後段緩和貼齊滿幅
  return t; // linear
}

// ======================================================================
// 自動生成律動（Level 1：參數級）
// ----------------------------------------------------------------------
// 設計前提：參數空間是 10 關節 ×(軸 × 振幅 × 頻率 × 相位 × 波形)，逐關節獨立均勻隨機
// 一定得到「全身各自亂顫」而不是律動。真正的律動資訊量遠低於參數量，被幾個結構約束綁住：
//   1. 相位是「鏈條」不是自由參數——骨盆→脊椎→頸→頭有固定的傳遞延遲，抽的是一個 segLag，
//      其餘由鏈序推導（內建 GROOVE_PRESETS 的 0.00/0.03/0.06/0.09/0.12/0.15 就是這個結構）。
//   2. 振幅是「包絡」不是自由參數——抽一個 baseAmp 加一條沿鏈的增益曲線 chainProfile。
//   3. 頻率必須量化成拍子的簡單有理數（freqPool 只放 0.5/1/2 這種倍半關係），否則動作會
//      跟拍子相位漂移、永遠不重複，主觀上就不成立為律動。全部取 2 的冪次比例，整段必定循環。
//   4. 左右是「對稱模式」不是兩個獨立參數：同相／反相／自由三選一，整組套用。
//   5. 整體相位偏移量化到 0 或 0.5（正拍／反拍）。鏈條內的 segLag 刻意「不」量化——
//      量化會直接毀掉傳遞延遲這個效果，這是這裡跟一般節奏量化不一樣的地方。
// 產出物刻意做成跟 captureCurrentGrooveConfig() 完全相同的形狀，因此可以直接餵進律動庫、
// 律動序列、autosave 與 sanitize，applyGroove()/applySquatGroove() 一行都不用改。
// ======================================================================

// 相位傳遞鏈：索引即鏈序，第 i 節的相位 = 起始相位 + i × segLag
const GROOVE_CHAIN_ORDER = ["hips", "spine", "spine1", "spine2", "neck", "head"];
// 左右成對的手臂關節；lag 是相對鏈條末端再往外傳的額外延遲（肩→上臂→前臂→手掌）。
// distal:true 的那兩節（前臂/手掌）是「整組一起決定要不要參與」的遠端節——由原型的
// distalProb 擲一次骰決定，不逐節各擲，否則會出現「手掌在動、前臂卻僵住」這種
// 運動鏈斷掉的怪結果。ampScale 讓振幅沿鏈往外遞減，理由同 GROOVE_PRESETS 註解。
const GROOVE_ARM_PAIRS = [
  { r:"rShoulder", l:"lShoulder", lag:0.00 },
  { r:"rArm",      l:"lArm",      lag:0.04 },
  { r:"rForeArm",  l:"lForeArm",  lag:0.08, distal:true, ampScale:0.7 },
  { r:"rHand",     l:"lHand",     lag:0.12, distal:true, ampScale:0.5 }
];
// 原型沒填 distalProb 時的保底值（例如手改過的設定物件），維持「偶爾才帶到手腕」的語意。
const GROOVE_GEN_DISTAL_PROB_FALLBACK = 0.35;
// 總能量預算：所有參與關節振幅絕對值的總和上限（度）。超過就整組等比例縮小——
// 沒有這道閘門，隨機抽到的 8~10 個關節各自 5~6 度疊起來，看起來會像抽搐而不是律動。
const GROOVE_GEN_ENERGY_BUDGET = 34;
// 帶到前臂/手腕時額外放寬的預算：這個上限本來是照「軀幹鏈＋肩＋上臂」十個關節抓的，
// 直接沿用會讓「有帶手腕的那幾組」整體被壓小約四分之一，聽起來像懲罰使用者多勾兩節。
// 遠端兩節的振幅本身已經先乘過 ampScale 衰減，加這一點額度剛好抵銷它們佔用的份額，
// 讓「有沒有帶到手腕」只改變動作的細節密度，不改變整段律動的力度。
const GROOVE_GEN_DISTAL_ENERGY_BONUS = 8;

// 可重現的偽隨機（mulberry32）：同一個 seed 必定生成同一組律動，
// 所以 seed 可以存進律動庫項目、可以手動輸入重現、也可以分享給別人。
function makeGrooveRng(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 依「關節限制」分頁的設定算出某關節某軸可用的最大振幅（度）。
// 律動是以目前姿勢為中心來回擺，所以能用的對稱擺幅＝min(|min|,|max|)。
// 該軸沒啟用限制就回傳 null＝不設限（維持既有「限制沒開就完全自由」的語意）。
// 註：這道限制只作用在「生成階段」，不是在 applyGroove 裡夾——因為 JOINT_LIMITS 是相對
// rest pose 的歐拉角，而律動是 post-multiply 疊在「已經擺好的姿勢」上，兩者座標基準不同，
// 在播放期硬夾會夾錯東西。生成階段夾則語意正確：它限制的是「這組律動參數本身有多大」。
function grooveAmpLimitFor(key, axis){
  const lim = JOINT_LIMITS[key] && JOINT_LIMITS[key][axis];
  if (!lim || !lim.enabled) return null;
  return Math.max(0, Math.min(Math.abs(lim.min), Math.abs(lim.max)));
}

// 風格原型：生成器的機率分佈來源。原型決定分佈，亂數只在分佈內取值——
// 這樣「同風格重抽 10 次」得到的是同一種律動的 10 個變體，而不是 10 種不相干的東西。
// 概念上等同「動作生成」的 Isolation 分組加權，只是加權的對象換成律動的結構參數。
const GROOVE_ARCHETYPES = {
  down: {
    label:"Down（嘻哈基本）", short:"Down",
    desc:"落點在正拍、核心主導的基本彈動。最泛用，適合當整段編舞的底。",
    chainLen:[4,6], segLag:[0.02,0.05], chainAmp:[3,6],
    chainProfile:[1.0,0.8,1.0,1.2,0.8,1.0],
    chainAxisPool:["x"],
    chainWavePool:["bounce","ease:easeOutQuad","ease:easeInOutSine"],
    freqPool:[1], phaseOffsetPool:[0],
    armProb:0.8, armAmp:[2,5], armAxisPool:["z"],
    armWavePool:["sine","easeBi:easeInOutSine","easeBi:easeOutQuad"],
    symmetryPool:["inPhase","antiPhase"],
    distalProb:0.35,
    squat:{ prob:0.9, vert:[4,8], lateral:[0,2], freqPool:[1], lateralFreqPool:[1],
            wave:"bounce", lateralWave:"sine", phasePool:[0], lateralPhasePool:[0,0.25] }
  },
  up: {
    label:"Up（反拍彈）", short:"Up",
    desc:"彈在反拍：整體相位偏移半拍，身體是「往上提」而不是「往下沉」。",
    chainLen:[4,6], segLag:[0.02,0.05], chainAmp:[3,6],
    chainProfile:[1.0,0.8,1.0,1.2,0.8,1.0],
    chainAxisPool:["x"],
    chainWavePool:["bounce","ease:easeOutCubic","ease:easeOutBack"],
    freqPool:[1], phaseOffsetPool:[0.5],
    armProb:0.8, armAmp:[2,5], armAxisPool:["z"],
    armWavePool:["sine","easeBi:easeOutQuad"],
    symmetryPool:["inPhase","antiPhase"],
    distalProb:0.35,
    squat:{ prob:0.9, vert:[4,8], lateral:[0,2], freqPool:[1], lateralFreqPool:[1],
            wave:"bounce", lateralWave:"sine", phasePool:[0.5], lateralPhasePool:[0.5,0.75] }
  },
  twostep: {
    label:"Two-step（左右重心）", short:"2Step",
    desc:"蹲兩次才側擺一次的左右重心轉移，肩膀反相交替。",
    chainLen:[4,6], segLag:[0.03,0.07], chainAmp:[3,6],
    chainProfile:[1.0,0.7,0.9,1.1,0.9,1.1],
    chainAxisPool:["x","z"],
    chainWavePool:["bounce","ease:easeInOutSine","easeBi:easeInOutSine"],
    freqPool:[1], phaseOffsetPool:[0],
    armProb:0.9, armAmp:[3,6], armAxisPool:["z"],
    armWavePool:["sine","easeBi:easeInOutQuad"],
    symmetryPool:["antiPhase"],
    distalProb:0.4,
    squat:{ prob:1.0, vert:[3,6], lateral:[4,9], freqPool:[1], lateralFreqPool:[0.5],
            wave:"bounce", lateralWave:"sine", phasePool:[0], lateralPhasePool:[0,0.25] }
  },
  wave: {
    label:"Wave（波浪傳遞）", short:"Wave",
    desc:"鏈條延遲拉大到肉眼可見：動作像一道波從骨盆傳到頭頂。",
    chainLen:[5,6], segLag:[0.10,0.17], chainAmp:[3,6],
    chainProfile:[0.6,0.8,1.0,1.2,1.3,1.4],
    chainAxisPool:["x"],
    chainWavePool:["ease:easeInOutSine","ease:easeInOutQuad","easeBi:easeInOutSine"],
    freqPool:[0.5], phaseOffsetPool:[0],
    armProb:0.6, armAmp:[3,7], armAxisPool:["z"],
    armWavePool:["easeBi:easeInOutSine"],
    symmetryPool:["inPhase","free"],
    distalProb:0.7,
    squat:{ prob:0.5, vert:[2,5], lateral:[1,4], freqPool:[0.5], lateralFreqPool:[0.5],
            wave:"sine", lateralWave:"sine", phasePool:[0], lateralPhasePool:[0.25] }
  },
  robot: {
    label:"Robot（機械頓點）", short:"Robot",
    desc:"tutting 專用：零傳遞延遲、可能雙倍頻、近方波，全身同一瞬間硬切到位。",
    chainLen:[3,5], segLag:[0,0.01], chainAmp:[2,5],
    chainProfile:[0.8,0.6,0.8,1.0,0.7,0.9],
    chainAxisPool:["x","y"],
    chainWavePool:["ease:easeInOutExpo","ease:easeInOutCirc","ease:easeInOutQuint"],
    freqPool:[1,2], phaseOffsetPool:[0],
    armProb:0.9, armAmp:[3,7], armAxisPool:["z","y"],
    armWavePool:["easeBi:easeInOutExpo","easeBi:easeInOutCirc"],
    symmetryPool:["inPhase"],
    distalProb:0.25,
    squat:{ prob:0.15, vert:[1,3], lateral:[0,1], freqPool:[1], lateralFreqPool:[1],
            wave:"bounce", lateralWave:"sine", phasePool:[0], lateralPhasePool:[0] }
  },
  headLead: {
    label:"Head-lead（點頭主導）", short:"Head",
    desc:"骨盆幾乎不動、律動集中在頸/頭，適合疊在需要手部乾淨的 tutting 段落上。",
    chainLen:[6,6], segLag:[0.01,0.04], chainAmp:[3,6],
    chainProfile:[0.15,0.3,0.5,0.8,1.2,1.5],
    chainAxisPool:["x"],
    chainWavePool:["ease:easeOutBack","ease:easeOutCubic","bounce"],
    freqPool:[1,2], phaseOffsetPool:[0],
    armProb:0.3, armAmp:[1,3], armAxisPool:["z"],
    armWavePool:["sine"],
    symmetryPool:["inPhase"],
    distalProb:0.15,
    squat:{ prob:0.2, vert:[1,3], lateral:[0,1], freqPool:[1], lateralFreqPool:[1],
            wave:"bounce", lateralWave:"sine", phasePool:[0], lateralPhasePool:[0] }
  }
};
const GROOVE_ARCHETYPE_IDS = Object.keys(GROOVE_ARCHETYPES);

// 生成出來（或從律動庫套用進來）的那組律動的來源資訊，供 UI 顯示 seed／存進律動庫項目。
// 使用者一旦手動改過任何律動欄位就清成 null——meta 宣稱「這組等於 seed X 生成的結果」，
// 手改過之後就不再成立，留著會變成假資訊。
let grooveLastGenMeta = null;

// 依原型與 seed 生成一整組律動設定。回傳形狀＝captureCurrentGrooveConfig() + meta。
function generateGrooveConfig(archetypeId, seed){
  const arcId = GROOVE_ARCHETYPES[archetypeId] ? archetypeId : "down";
  const arc = GROOVE_ARCHETYPES[arcId];
  const usedSeed = Number.isFinite(seed) ? (seed >>> 0) : ((Math.random() * 0xFFFFFFFF) >>> 0);
  const rnd = makeGrooveRng(usedSeed);

  const rf = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const qAmp = (v) => Math.round(v * 2) / 2;              // 對齊振幅滑桿的 step=0.5
  const qPhase = (v) => {                                  // 對齊相位滑桿的 step=0.01，並摺回 [0,1)
    let p = Math.round((v - Math.floor(v)) * 100) / 100;
    if (p >= 1) p = 0;
    return p;
  };

  const jointSet = [];
  const customParams = {};

  // ---- 鏈條（骨盆→頭）：共用一個頻率、一個軸、一個波形，相位沿鏈遞增 ----
  const freq = pick(arc.freqPool);
  const segLag = rf(arc.segLag[0], arc.segLag[1]);
  const phaseBase = pick(arc.phaseOffsetPool);
  const chainLen = Math.round(rf(arc.chainLen[0], arc.chainLen[1]));
  const baseAmp = rf(arc.chainAmp[0], arc.chainAmp[1]);
  const chainAxis = pick(arc.chainAxisPool);
  const chainWave = pick(arc.chainWavePool);

  for (let i = 0; i < chainLen; i++){
    const key = GROOVE_CHAIN_ORDER[i];
    if (!GROOVE_PRESETS[key]) continue;
    let amp = baseAmp * arc.chainProfile[i] * rf(0.88, 1.12);
    const cap = grooveAmpLimitFor(key, chainAxis);
    if (cap !== null) amp = Math.min(amp, cap);
    amp = qAmp(amp);
    if (Math.abs(amp) < 0.5) continue; // 小到看不出來就不列入，免得 jointSet 裡都是有勾等於沒勾的關節
    jointSet.push(key);
    customParams[key] = { axis:chainAxis, wave:chainWave, amp, freq, phase: qPhase(phaseBase + i * segLag) };
  }

  // ---- 手臂：整組決定對稱模式，兩側共用振幅、只差相位 ----
  let usedDistal = false; // 這組有沒有真的長出前臂/手掌，決定下面的能量預算要不要加額度
  if (rnd() < arc.armProb){
    const armAxis = pick(arc.armAxisPool);
    const armWave = pick(arc.armWavePool);
    const symmetry = pick(arc.symmetryPool);
    const armBase = rf(arc.armAmp[0], arc.armAmp[1]);
    // 反相＝左右交替（內建 preset 的 rShoulder 0.50 / lShoulder 0.00 就是這個）；
    // free＝兩側各走各的，量化到 1/4 拍避免產生聽不出關係的怪異錯位。
    const sideOffset = (symmetry === "antiPhase") ? 0.5
                     : (symmetry === "free")      ? (Math.round(rnd() * 4) % 4) / 4
                     : 0;
    // 手臂接在鏈條末端之後，沿用同一條傳遞延遲繼續往外傳
    const armPhaseBase = phaseBase + segLag * chainLen;
    // 前臂/手掌要不要一起參與：整組擲一次骰，且刻意用「從同一個 seed 衍生出來的另一條
    // 亂數流」而不是主流程的 rnd()——主流程多插一次 rnd() 會讓後面所有取值整個位移，
    // 舊 seed 就再也重現不出原本那組律動了。衍生流保證主流程的呼叫順序一字未動，
    // 因此舊 seed 產生的鏈條/上臂/蹲彈參數完全不變，差別只在「可能多長出前臂/手掌兩節」
    // （以及多出來的振幅被下面的總能量預算等比例縮回去）。
    const distalRnd = makeGrooveRng((usedSeed ^ 0x9E3779B9) >>> 0);
    const distalRf = (a, b) => a + (b - a) * distalRnd();
    const distalProb = Number.isFinite(arc.distalProb) ? arc.distalProb : GROOVE_GEN_DISTAL_PROB_FALLBACK;
    const includeDistal = distalRnd() < distalProb;
    usedDistal = includeDistal;

    for (const pair of GROOVE_ARM_PAIRS){
      if (pair.distal && !includeDistal) continue;
      // 遠端兩節的抖動值同樣走衍生流：連「抽幾次 rnd()」都跟舊版一模一樣，
      // 後面的蹲彈層才不會因為前面多抽兩次而整組偏掉。
      const jitter = pair.distal ? distalRf(0.9, 1.1) : rf(0.9, 1.1);
      for (const side of ["r", "l"]){
        const key = pair[side];
        if (!GROOVE_PRESETS[key]) continue;
        let amp = armBase * jitter * (pair.ampScale || 1);
        const cap = grooveAmpLimitFor(key, armAxis);
        if (cap !== null) amp = Math.min(amp, cap);
        amp = qAmp(amp);
        if (Math.abs(amp) < 0.5) continue;
        jointSet.push(key);
        customParams[key] = {
          axis: armAxis, wave: armWave, amp, freq,
          phase: qPhase(armPhaseBase + pair.lag + (side === "r" ? sideOffset : 0))
        };
      }
    }
  }

  // ---- 總能量預算：超標就整組等比例縮小 ----
  const energyBudget = GROOVE_GEN_ENERGY_BUDGET + (usedDistal ? GROOVE_GEN_DISTAL_ENERGY_BONUS : 0);
  let energy = jointSet.reduce((s, k) => s + Math.abs(customParams[k].amp), 0);
  if (energy > energyBudget && energy > 0){
    const scale = energyBudget / energy;
    for (const k of jointSet){
      const v = qAmp(customParams[k].amp * scale);
      // 縮完之後不讓任何一個關節掉到 0（那等於偷偷把它從律動裡拿掉，跟 jointSet 說的不一致）
      customParams[k].amp = (Math.abs(v) < 0.5) ? (customParams[k].amp >= 0 ? 0.5 : -0.5) : v;
    }
    energy = jointSet.reduce((s, k) => s + Math.abs(customParams[k].amp), 0);
  }

  // ---- 蹲彈層 ----
  const squatEnabled = rnd() < arc.squat.prob;
  const squatCustom = {};
  if (squatEnabled){
    squatCustom.vertAmp      = qAmp(rf(arc.squat.vert[0], arc.squat.vert[1]));
    squatCustom.lateralAmp   = qAmp(rf(arc.squat.lateral[0], arc.squat.lateral[1]));
    squatCustom.freq         = pick(arc.squat.freqPool);
    squatCustom.phase        = pick(arc.squat.phasePool);
    squatCustom.wave         = arc.squat.wave;
    squatCustom.lateralFreq  = pick(arc.squat.lateralFreqPool);
    squatCustom.lateralPhase = pick(arc.squat.lateralPhasePool);
    squatCustom.lateralWave  = arc.squat.lateralWave;
  }

  // ---- 循環長度：所有頻率都取自 {0.5,1,2} 這種 2 的冪次比例，所以最長週期就是整組的循環長度 ----
  const periods = [1 / freq];
  if (squatEnabled){ periods.push(1 / squatCustom.freq, 1 / squatCustom.lateralFreq); }
  const loopBeats = Math.max(...periods);

  return {
    jointSet, customParams, squatEnabled, squatCustom,
    meta: { seed: usedSeed, archetype: arcId, loopBeats, energy: Math.round(energy * 10) / 10 }
  };
}

// 自動命名：帶上原型短名與 seed 的 base36 尾碼，庫裡一整排自動生成的項目才分得出誰是誰。
function grooveGenAutoName(archetypeId, seed){
  const arc = GROOVE_ARCHETYPES[archetypeId];
  const short = arc ? arc.short : "Groove";
  return "自動_" + short + "_" + (seed >>> 0).toString(36).slice(-4).toUpperCase();
}

let ROOT_FOLLOW_LERP_T = ROOT_FOLLOW_LERP_T_DEFAULT;
let spineCCDDamping = SPINE_CCD_DAMPING_DEFAULT;

let scene, camera, renderer, controls, transformControls, transformControlsIK;
let bones = {}, restQuat = {};
const poseController = createPoseController({
  jointKeys: ALL_JOINT_KEYS,
  getBones: () => bones,
  getRestQuats: () => restQuat,
  clampAngles: clampJointAngles,
});
let markerMeshes = {};
let overviewRowEls = {}; // key -> { row, rot:[x,y,z spans], pos:[x,y,z spans] }，面板總覽用，切分頁/篩選時重建
let overviewGroupCollapsed = {}; // groupId -> bool，記住使用者展開/收合狀態
let markerIKHidden = {}; // 因 IK 接管而暫時隱藏的關節球（key -> bool），跟下面的分類開關各自獨立、最後在 updateMarkers() 合併
let showBodyJoints = true; // 顯示開關：身體（軀幹/四肢，不含手指）關節球
let showHandJoints = true; // 顯示開關：手部（手指指節）關節球
let showSkeleton = true; // 顯示開關：骨架連線（關節與關節之間的骨骼線段）
let skeletonLines = null; // THREE.LineSegments：整副骨架的連線
let skeletonLinePairs = []; // [[childKey, parentKey], ...]，updateSkeletonLines() 每幀依此更新線段端點
let model;
let selectedKey = null;
let draggingKey = null;
let suppressClick = false;

// ---- 手腳 IK 狀態 ----
let ikEnabled = { rArm:false, lArm:false, rLeg:false, lLeg:false };
// ---- 扶握箱核心實例（見 createGrabBoxCore）：loadModel() 內建立，跟主程式只透過方法呼叫溝通 ----
let grabBoxCore = null;
// ---- 身體跟隨（root follow）狀態：目標超出手臂伸展範圍時，允許整個角色平移去搆 ----
let ikRootFollowEnabled = { rArm:false, lArm:false };

// ---- 肩胛骨限幅輔助旋轉開關（路線B，見 solveShoulderAssist）----
// 預設開啟（跟舊行為一致：只要手臂IK開著就會自動偏一點肩膀）。
// 關掉的話手臂會維持純兩節IK的手感（肩膀完全不動，只有上臂/前臂彎），
// 適合想要更「機械」、鎖骨完全不參與的動作。
let shoulderAssistEnabled = false;

// ---- 脊椎 IK 狀態 ----
let spineIKEnabled = false;
let spineIKTargetMesh = null; // 藍色：頭部要對準/搆到的世界座標目標球
// 方向B：頭固定不動時，若身體搆不到，允許整個角色平移去湊（跟手臂 root-follow 同構）
let spineRootFollowEnabled = false;

// ---- 雙手同時固定狀態 ----
// 需要 rArm/lArm 的 ikEnabled 都開啟才會生效；開啟時取代個別手臂各自的 root-follow，
// 改成「旋轉+平移整個角色」去同時滿足兩個固定點（見 solveDualHandAnchor）。
let dualAnchorEnabled = false;

// ---- 頭/胸口 look-at 狀態 ----
// Hand aim uses a captured reference orientation, so roll is absolute, not accumulated per frame.
const HAND_AIM_NAMES=['rHand','lHand'];
const handAim={rHand:{mode:'palm',roll:0,flip:false,reference:new THREE.Quaternion()},lHand:{mode:'palm',roll:0,flip:false,reference:new THREE.Quaternion()}};
const handAimAxes={};
const handFollowSource={rHand:'free',lHand:'free'};
const handFollowLast={rHand:null,lHand:null};
let headFollowSource="free";
let laPathConfig={part:'rHand',shape:'circle',plane:'xy',size:0.12,beats:4,x:0,y:0,z:0.25};
let laPathRun=null,laPathLine=null;
let laCustomMeshes=[],laCustomDrag=null;

const LOOKAT_RANGE_NAMES=["head","chest","rHand","lHand"];
const handAimRange={head:{min:0.08,max:0.4},chest:{min:0.08,max:0.4},rHand:{min:0.08,max:0.4},lHand:{min:0.08,max:0.4}};
let handRangeDrag=null;
let handRangeHelper=null;
let lookAtEnabled = { head:false, chest:false, rHand:false, lHand:false };
let lookAtTargetMesh = { head:null, chest:null, rHand:null, lHand:null };

// ---- 身體移動狀態 ----
// 設計：控制環不直接attach到model本身（那樣會出現在model原點，通常在腳底附近，
// 貼著地板格線很難點選），改用一個「代理物件」bodyGizmoProxy放在Hips高度，
// 讓控制環視覺上出現在髖部；拖曳代理物件時，把它的位移量(delta)套用到model.position，
// 兩者用相同delta移動，代理物件與角色之間維持固定的相對位置關係。
let bodyGizmoProxy = null;
let bodyProxyLastPos = null; // 追蹤代理物件上一次位置，用來算出這次拖曳的delta
let defaultModelPosition = null; // 載入時的初始位置，供「重置身體位置」使用
let defaultModelQuaternion = null;

// ---- 腳踝旋轉鎖存（真正的「腳掌貼地」）----
// 開啟腿部IK當下抓取腳掌世界旋轉當基準，之後不管腿怎麼彎，腳掌世界旋轉都貼住這個值，
// 不會隨大腿/小腿的IK求解跟著翻轉。使用者手動拖曳調整腳掌FK角度、放開時會重新鎖存新基準
// （見 dragging-changed 事件），讓「貼地」跟「保留FK可調」兩者並存不衝突。
let footLockedWorldQuat = { rLeg:null, lLeg:null };

// Grounded feet: editing-only contact constraints, in world units.
const FOOT_PLANT_LIMBS = ["rLeg", "lLeg"];
let footPlantEnabled = false;
let footPlantAnchors = {};
let footPlantCalibration = {};
let footPlantSafe = null;
let footPlantLimited = false;
let footPlantNotice = "";
function isFootPlanted(limb) {
  return footPlantEnabled && !!ikEnabled[limb] && !!footPlantAnchors[limb];
}
function calibrateFootGround() {
  model.updateWorldMatrix(true, true);
  // Use skinned foot/toe vertices in the loaded neutral pose, not ankle Y=0.
  for (const limb of FOOT_PLANT_LIMBS) {
    const foot = bones[IK_CHAINS[limb].end];
    if (!foot) continue;
    const descendants = new Set(); foot.traverse(b => descendants.add(b));
    let minY = Infinity;
    const v = new THREE.Vector3();
    model.traverse(mesh => {
      if (!mesh.isSkinnedMesh || !mesh.geometry.attributes.skinWeight) return;
      mesh.skeleton.update();
      const weights = mesh.geometry.attributes.skinWeight, indices = mesh.geometry.attributes.skinIndex;
      const ids = new Set(mesh.skeleton.bones.map((b,i) => descendants.has(b) ? i : -1));
      ids.delete(-1);
      const components = ['getX','getY','getZ','getW'];
      for (let i=0; i<weights.count; i++) {
        let weight = 0;
        for (const c of components) if (ids.has(indices[c](i))) weight += weights[c](i);
        if (weight < 0.5) continue;
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        minY = Math.min(minY, v.y);
      }
    });
    const pos = foot.getWorldPosition(new THREE.Vector3());
    footPlantCalibration[limb] = {
      height: Number.isFinite(minY) ? Math.max(0, pos.y-minY) : Math.max(0, pos.y),
      quaternion: foot.getWorldQuaternion(new THREE.Quaternion())
    };
  }
}
function captureFootPlant(limb) {
  const foot = bones[IK_CHAINS[limb].end], c = footPlantCalibration[limb];
  if (!foot || !c) return;
  const p = foot.getWorldPosition(new THREE.Vector3()); p.y = c.height;
  // Preserve heading, use the neutral foot's pitch/roll so the sole is level.
  const now = foot.getWorldQuaternion(new THREE.Quaternion());
  const delta = now.clone().multiply(c.quaternion.clone().invert());
  const yaw = new THREE.Euler().setFromQuaternion(delta, 'YXZ').y;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yaw).multiply(c.quaternion);
  footPlantAnchors[limb] = {position:p, quaternion:q};
  ikTargetMeshes[limb].position.copy(p);
  footLockedWorldQuat[limb] = q.clone();
}
function setFootPlantEnabled(on) {
  if(waveRun&&waveHasBody(waveRun.config))stopWave();
  if (kfPlaying) { updateFootPlantUI(); return; }
  if (!on) for (const limb of FOOT_PLANT_LIMBS) {
    if (!isFootPlanted(limb)) continue;
    const foot = bones[IK_CHAINS[limb].end];
    if (foot) {
      foot.getWorldQuaternion(ikTargetMeshes[limb].quaternion);
      captureFootLock(limb);
    }
  }
  footPlantEnabled = !!on && (ikEnabled.rLeg || ikEnabled.lLeg);
  footPlantAnchors = {}; footPlantSafe = null; footPlantLimited = false; footPlantNotice = "";
  if (footPlantEnabled) {
    deselectJoint();
    for (const limb of FOOT_PLANT_LIMBS) if (ikEnabled[limb]) captureFootPlant(limb);
  }
  updateFootPlantUI();
}
function updateFootPlantUI() {
  const cb = document.getElementById('footPlantCb');
  if (!cb) return;
  cb.checked = footPlantEnabled;
  cb.disabled = !model || kfPlaying || (!ikEnabled.rLeg && !ikEnabled.lLeg);
  const active = FOOT_PLANT_LIMBS.filter(isFootPlanted);
  const label = document.getElementById('footPlantStatus');
  const message = kfPlaying ? '播放中：腳底固定暫停' : active.length
    ? (footPlantLimited ? '已達腿部伸展範圍 · ' : '已固定 · ') + active.map(l => IK_CHAINS[l].label).join('、')
    : (footPlantNotice || (ikEnabled.rLeg || ikEnabled.lLeg ? '開啟後將腳底對齊地面並固定' : '請先啟用左腳或右腳 IK'));
  if (label.textContent !== message) label.textContent = message;
  for (const limb of FOOT_PLANT_LIMBS) {
    const b = document.getElementById('orientBtn_'+limb);
    if (b) b.disabled = isFootPlanted(limb);
  }
}
function solveFootPlant() {
  if (!model || kfPlaying || !footPlantEnabled) return;
  const limbs = FOOT_PLANT_LIMBS.filter(isFootPlanted);
  if (!limbs.length) return;
  model.updateWorldMatrix(true,true);
  const startPosition = model.position.clone();
  const constraints = limbs.map(limb => {
    const c = IK_CHAINS[limb], a = bones[c.root].getWorldPosition(new THREE.Vector3());
    const b = bones[c.mid].getWorldPosition(new THREE.Vector3());
    const e = bones[c.end].getWorldPosition(new THREE.Vector3());
    const u = a.distanceTo(b), v = b.distanceTo(e);
    return {limb, offset:a.sub(model.position), min:Math.abs(u-v)+0.0002, max:u+v-0.0002};
  });
  // Alternating projections constrain the body translation to both legs' reachable shells.
  const candidate = model.position.clone();
  for (let pass=0; pass<100; pass++) {
    let error = 0;
    for (const c of constraints) {
      const anchor = footPlantAnchors[c.limb].position;
      const d = candidate.clone().add(c.offset).sub(anchor), length = d.length();
      const wanted = Math.max(c.min, Math.min(c.max,length));
      error = Math.max(error, Math.abs(wanted-length));
      if (Math.abs(wanted-length)<1e-7) continue;
      if (length<1e-9) d.set(0,1,0); else d.divideScalar(length);
      candidate.copy(anchor).addScaledVector(d,wanted).sub(c.offset);
    }
    if (error<1e-7) break;
  }
  const feasible = constraints.every(c => {
    const d = candidate.clone().add(c.offset).distanceTo(footPlantAnchors[c.limb].position);
    return d <= c.max+1e-6 && d >= c.min-1e-6;
  });
  footPlantLimited = candidate.distanceTo(startPosition)>0.00001 || !feasible;
  if (feasible) model.position.copy(candidate);
  else if (footPlantSafe) {
    model.position.fromArray(footPlantSafe.position);
    model.quaternion.fromArray(footPlantSafe.quaternion);
    for (const [key,q] of Object.entries(footPlantSafe.bones)) if (bones[key]) {
      bones[key].quaternion.fromArray(q); syncTargetFromBone(key);
    }
  } else {
    // Impossible initial contact configuration: fail explicitly rather than claim a lock.
    setFootPlantEnabled(false);
    footPlantNotice = '無法同時貼地，請先調整腿部姿勢再開啟';
    updateFootPlantUI();
    return;
  }
  model.updateWorldMatrix(true,true);
  for (const limb of limbs) {
    const c = IK_CHAINS[limb], a = footPlantAnchors[limb];
    ikTargetMeshes[limb].position.copy(a.position);
    solveTwoBoneIK(bones[c.root],bones[c.mid],bones[c.end],a.position,ikPoleMeshes[limb].position);
    applyBoneWorldQuatLock(bones[c.end],a.quaternion);
    footLockedWorldQuat[limb] = a.quaternion.clone();
    for (const key of [c.root,c.mid,c.end]) syncTargetFromBone(key);
  }
  footPlantSafe = {position:model.position.toArray(), quaternion:model.quaternion.toArray(), bones:{}};
  for (const key of ALL_JOINT_KEYS) if (bones[key]) footPlantSafe.bones[key] = bones[key].quaternion.toArray();
  // Keep the next gizmo delta relative to its corrected position (no accumulated overshoot).
  const correction = model.position.clone().sub(startPosition);
  if (selectedIK?.limb === 'body' && bodyGizmoProxy && bodyProxyLastPos) {
    bodyGizmoProxy.position.add(correction); bodyProxyLastPos.copy(bodyGizmoProxy.position);
  }
  updateIKPoleLines();
}
function snapshotFootPlant() {
  if (!model) return null;
  const state = {enabled:footPlantEnabled, body:snapshotBodyTransform(), legs:{}, angles:{}};
  if (footPlantEnabled) for (const key of ALL_JOINT_KEYS) if (bones[key]) state.angles[key]=bones[key].quaternion.toArray();
  for (const limb of FOOT_PLANT_LIMBS) {
    const a=footPlantAnchors[limb];
    state.legs[limb]={enabled:ikEnabled[limb], target:ikTargetMeshes[limb]?.position.toArray(),
      pole:ikPoleMeshes[limb]?.position.toArray(), orientation:ikTargetMeshes[limb]?.quaternion.toArray(),
      orientEnabled:effectorOrientEnabled[limb], lock:footLockedWorldQuat[limb]?.toArray(),
      anchor:a ? {position:a.position.toArray(), quaternion:a.quaternion.toArray()} : null};
  }
  return state;
}
function restoreFootPlant(state) {
  footPlantEnabled=false; footPlantAnchors={}; footPlantSafe=null; footPlantNotice="";
  const vector = (v,n) => Array.isArray(v) && v.length===n && v.every(Number.isFinite);
  const quat = q => vector(q,4) && q.reduce((a,b)=>a+b*b,0)>1e-10;
  if (!state || !model) { updateFootPlantUI(); return; }
  if (vector(state.body?.position,3) && quat(state.body?.quaternion)) applyBodyTransform(state.body);
  for (const [key,q] of Object.entries(state.angles || {})) if (bones[key] && quat(q)) {
    bones[key].quaternion.fromArray(q).normalize(); syncTargetFromBone(key);
  }
  model.updateWorldMatrix(true,true);
  for (const limb of FOOT_PLANT_LIMBS) {
    const s=state.legs?.[limb]; if (!s) continue;
    setIKEnabled(limb,s.enabled===true);
    if (vector(s.target,3)) ikTargetMeshes[limb].position.fromArray(s.target);
    if (vector(s.pole,3)) ikPoleMeshes[limb].position.fromArray(s.pole);
    if (quat(s.orientation)) ikTargetMeshes[limb].quaternion.fromArray(s.orientation).normalize();
    effectorOrientEnabled[limb]=s.orientEnabled===true;
    if (quat(s.lock)) footLockedWorldQuat[limb]=new THREE.Quaternion().fromArray(s.lock).normalize();
    if (s.enabled && vector(s.anchor?.position,3) && quat(s.anchor?.quaternion))
      footPlantAnchors[limb]={position:new THREE.Vector3().fromArray(s.anchor.position),quaternion:new THREE.Quaternion().fromArray(s.anchor.quaternion).normalize()};
  }
  footPlantEnabled=state.enabled===true && Object.keys(footPlantAnchors).length>0;
  solveFootPlant(); updateFootPlantUI(); updateEffectorOrientButtons();
}


// ---- Effector 朝向控制（手掌/腳掌不只到達位置，還能控制面向）----
// 預設關閉：關閉時，IK只解位置，末端骨骼的朝向仍照舊由FK彈簧插值控制（維持原本行為不變）。
// 開啟後，IK目標球本身的「旋轉」會被讀取，套用到手掌/腳掌的世界旋轉。
// 必須是明確opt-in——如果預設就套用，目標球初始是單位旋轉(0,0,0,1)，一開啟就會把
// 手掌轉飛到奇怪角度，所以開啟當下要先把目標球的旋轉同步成「目前手掌實際朝向」再啟用。
let effectorOrientEnabled = { rArm:false, lArm:false, rLeg:false, lLeg:false };
let ikTargetMeshes = {};   // 橘色：末端目標球（手掌/腳掌想到達的世界座標）
let ikPoleMeshes = {};     // 黃綠色八面體：彎曲極向球（手肘/膝蓋彎曲朝向）
let ikPoleLines = {};      // 輔助虛線：從 mid 骨骼連到極向球，方便理解影響對象
// Pole radius: editor-only bounds; never clamp playback solver inputs.
let poleRadiusCustom = {};
let poleDrag = null;
let poleRangeHelper = null;
function poleMid(limb){
  const b=bones[IK_CHAINS[limb]?.mid];
  return b ? b.getWorldPosition(new THREE.Vector3()) : null;
}
function poleRadius(limb){
  if (Number.isFinite(poleRadiusCustom[limb]) && poleRadiusCustom[limb]>=0.01) return poleRadiusCustom[limb];
  const c=IK_CHAINS[limb], a=bones[c.root], b=bones[c.mid], e=bones[c.end];
  if (!a || !b || !e) return 0.4;
  const x=a.getWorldPosition(new THREE.Vector3()), y=b.getWorldPosition(new THREE.Vector3()), z=e.getWorldPosition(new THREE.Vector3());
  return Math.max(0.01, (x.distanceTo(y)+y.distanceTo(z))*0.5);
}
function snapshotPoleEditor(){
  const limbs={};
  for(const limb of IK_LIMB_KEYS) limbs[limb]={enabled:ikEnabled[limb],pole:ikPoleMeshes[limb]?.position.toArray(),target:ikTargetMeshes[limb]?.position.toArray()};
  return {radii:{...poleRadiusCustom},limbs};
}
function restorePoleEditor(state){
  poleDrag=null; poleRadiusCustom={};
  for(const limb of IK_LIMB_KEYS){
    const r=state?.radii?.[limb];
    if(Number.isFinite(r)&&r>=0.01) poleRadiusCustom[limb]=r;
    const v=state?.limbs?.[limb]; if(!v) continue;
    if(typeof v.enabled==='boolean') setIKEnabled(limb,v.enabled);
    for(const [key,meshes] of [['pole',ikPoleMeshes],['target',ikTargetMeshes]])
      if(Array.isArray(v[key])&&v[key].length===3&&v[key].every(Number.isFinite)&&meshes[limb]) meshes[limb].position.fromArray(v[key]);
  }
  updatePoleRadiusUI();
}
// Reposition along the SAME solver-side direction, preserving its bend plane.
function alignPoleInRadius(limb){
  const c=IK_CHAINS[limb], mid=poleMid(limb), pole=ikPoleMeshes[limb];
  if(!mid||!pole||!bones[c.root]) return false;
  const root=bones[c.root].getWorldPosition(new THREE.Vector3());
  const axis=ikTargetMeshes[limb].position.clone().sub(root);
  if(axis.lengthSq()<1e-10) return false;
  axis.normalize();
  const side=pole.position.clone().sub(root); side.addScaledVector(axis,-side.dot(axis));
  if(side.lengthSq()<1e-8){side.copy(mid).sub(root);side.addScaledVector(axis,-side.dot(axis));}
  if(side.lengthSq()<1e-8) return false;
  side.normalize();
  const candidate=mid.clone().addScaledVector(side,poleRadius(limb)*0.8);
  const projected=candidate.clone().sub(root);projected.addScaledVector(axis,-projected.dot(axis));
  if(projected.dot(side)<=1e-6 || projected.clone().cross(side).length()>1e-5) return false;
  pole.position.copy(candidate);return true;
}
function updatePoleRadiusUI(){
  const panel=document.getElementById('poleRadiusPanel'); if(!panel) return;
  const limb=selectedIK?.role==='pole'&&IK_CHAINS[selectedIK.limb]?selectedIK.limb:null;
  panel.style.display=limb?'':'none';
  if(!limb) return;
  document.getElementById('poleRadiusTitle').textContent=IK_CHAINS[limb].label+'・極向球範圍';
  document.getElementById('poleRadiusInput').value=Number(poleRadius(limb).toFixed(4));
}
function bindPoleRadiusUI(){
  const input=document.getElementById('poleRadiusInput');
  const change=(reset)=>{
    const limb=selectedIK?.role==='pole'?selectedIK.limb:null;
    if(!IK_CHAINS[limb]||poleDrag||kfPlaying) return;
    const r=Number(input.value);
    if(!reset&&(!Number.isFinite(r)||r<0.01)){updatePoleRadiusUI();return;}
    pushHistory();
    if(reset) delete poleRadiusCustom[limb]; else poleRadiusCustom[limb]=r;
    const mid=poleMid(limb);
    const ok=!mid||ikPoleMeshes[limb].position.distanceTo(mid)<=poleRadius(limb)||alignPoleInRadius(limb);
    document.getElementById('poleRadiusNotice').textContent=ok?'':'目前方向無法安全對齊，請先調整肢體姿勢再對齊。';
    updatePoleRadiusUI();pushHistory();scheduleAutoSave();
  };
  input.onchange=()=>change(false);
  document.getElementById('poleRadiusDefault').onclick=()=>change(true);
  document.getElementById('poleRadiusAlign').onclick=()=>{
    if(selectedIK?.role!=='pole'||kfPlaying||poleDrag)return;
    pushHistory();const ok=alignPoleInRadius(selectedIK.limb);
    document.getElementById('poleRadiusNotice').textContent=ok?'已保留彎曲方向並對齊。':'肢體方向退化或不一致，請先稍微彎曲肢體再試。';
    pushHistory();scheduleAutoSave();
  };
}
function beginPoleDrag(){
  if(selectedIK?.role!=='pole'||!IK_CHAINS[selectedIK.limb]) return;
  const limb=selectedIK.limb, center=poleMid(limb), mesh=ikPoleMeshes[limb];
  if(!center)return;
  // No relocation during mouseDown: TransformControls has already captured its start position.
  if(kfPlaying||mesh.position.distanceTo(center)>poleRadius(limb)+1e-7){
    poleDrag={limb,blocked:true,start:mesh.position.clone()};
    document.getElementById('poleRadiusNotice').textContent='請先按「對齊目前彎曲方向」再拖曳；播放時請先暫停。';
    return;
  }
  pushHistory();poleDrag={limb,center,radius:poleRadius(limb)};
  document.getElementById('poleRadiusNotice').textContent='';
}
function clampPoleDrag(){
  if(!poleDrag)return;
  const p=ikPoleMeshes[poleDrag.limb].position;
  if(poleDrag.blocked){p.copy(poleDrag.start);return;}
  const delta=p.clone().sub(poleDrag.center);
  if(delta.length()>poleDrag.radius) p.copy(poleDrag.center).add(delta.setLength(poleDrag.radius));
}
function updatePoleRange(){
  const limb=selectedIK?.role==='pole'&&IK_CHAINS[selectedIK.limb]?selectedIK.limb:null;
  if(!limb||!ikPoleMeshes[limb]?.visible||kfPlaying){if(poleRangeHelper)poleRangeHelper.visible=false;return;}
  if(!poleRangeHelper){
    poleRangeHelper=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1,16,10)),new THREE.LineBasicMaterial({color:0xccff33,transparent:true,opacity:0.18,depthTest:false,depthWrite:false}));
    poleRangeHelper.renderOrder=997;scene.add(poleRangeHelper);
  }
  const center=poleDrag?.center||poleMid(limb);if(!center)return;
  poleRangeHelper.visible=true;poleRangeHelper.position.copy(center);poleRangeHelper.scale.setScalar(poleDrag?.radius||poleRadius(limb));
}

let selectedIK = null;     // { limb, role: 'target' | 'pole' | 'trajPoint', index? }

// ---- 手指 IK 狀態 ----
let fingerIKEnabled = {};        // { fingerId: boolean }，見 FINGER_IDS
let fingerIKTargetMeshes = {};   // 青色小球：每指一顆，指尖想到達的世界座標
let fingerEffectorBones = {};    // 每指IK求解讀位置用的effector骨骼（優先第4節指尖骨，找不到退回第3節）
for (const fingerId of FINGER_IDS) fingerIKEnabled[fingerId] = false;

// ---- 軌跡輔助工具狀態 ----
// 紫色控制點球：先拖橘色IK target球到位，按「+新增控制點」，新點永遠對齊target球目前座標
// （使用者明確要求的行為，不要改回自動偏移/延伸算法）。
let trajPointMeshes = { rArm:[], lArm:[], rLeg:[], lLeg:[] };
let trajLine = {};          // 紫色路徑預覽線（依目前控制點即時重繪）
let TRAJ_MODE = { rArm:"line", lArm:"line", rLeg:"line", lLeg:"line" }; // 'line' | 'curve'
let TRAJ_CLOSED = { rArm:false, lArm:false, rLeg:false, lLeg:false }; // 是否首尾相連封閉成迴圈（需≥3點才生效）
let trajActiveLimb = "rArm"; // 目前「軌跡」分頁編輯中的肢體（只有這個肢體的控制點球/路徑線會顯示）
let trajSampleCount = 8;     // 生成拍點時沿路徑等間隔取樣幾點（2~20）

let bpm = 128;   // 仍供 Keyframe 時間軸的拍數/毫秒換算使用（預設循環功能已移除）

// ---- 律動模式：執行期狀態 ----
// grooveJointSet：使用者勾選要參與律動的關節 key（GROOVE_JOINT_KEYS 的子集合）。
// grooveStartTime：按下播放拍點的那一刻設定一次，之後每一拍過渡都不重設——律動的拍子時鐘要連續，
// 不能跟著 kfStartTime 每跨一拍就歸零，否則每次跨拍律動就會卡一下、不像真的隨音樂在動。
let grooveJointSet = new Set();
let grooveStartTime = 0;
let grooveEditingKey = null;       // 目前在「自訂律動參數」編輯區顯示/可調整的關節 key（null＝尚未選取）
let groovePreviewEnabled = false;  // 即時預覽開關：不用播放拍點，原地持續套用律動看效果，方便邊調參數邊看手感
let groovePreviewStartTime = 0;    // 預覽用的獨立拍子時鐘起點，跟 grooveStartTime（播放用）分開，兩者互不干擾

// ---- 暖身漸強：執行期狀態 ----
// 只在「整段律動剛開始」的頭幾拍生效（用從 grooveStartTime/groovePreviewStartTime 算起的連續
// beatsElapsedTotal 判斷，不是段落內的 localBeats），律動序列切到第幾段都不會重複觸發，
// 避免跟段落切換的交叉淡化（見 GROOVE_XFADE_BEATS）互相打架、讓每次切換都顯得虛軟。
let grooveWarmupEnabled = true;
let grooveWarmupBeats = 1.5;   // 暖身時長（拍）：0 代表關閉效果（一開始就是滿振幅）
let grooveWarmupCurve = "linear"; // "linear" | "easeIn"（一開始慢，後段加速）| "easeOut"（一開始快，後段緩和貼齊滿幅）

// ---- 蹲彈律動：執行期狀態 ----
// grooveSquatAnchored：是否已經捕捉過腳掌原地錨點；每次重新開始播放/預覽都要重置成 false，
// 讓下一幀重新抓「目前站姿」當基準，避免沿用上次結束時的舊錨點造成瞬間跳動。
let grooveSquatAnchored = false;
let grooveSquatFootAnchor = { rLeg:null, lLeg:null };     // Vector3，腳掌世界座標錨點（蹲彈時固定不動）
let grooveSquatFootLockedQuat = { rLeg:null, lLeg:null }; // Quaternion，腳掌世界旋轉鎖存值（貼地用）
// 即時預覽（非播放拍點）模式下，model.position 不會被其他流程逐幀重設，所以每幀要先扣掉
// 上一幀疊加的位移量再加新的，避免位移一路累積漂移；播放拍點模式因為 applyKeyframeFramePose()
// 每幀都會把 model.position 重設成全新值，不需要這個機制（詳見 applySquatGroove 內的說明）。
const _squatPreviewLastDelta = new THREE.Vector3(0, 0, 0);

let poseIndex = 0; // 僅供 Undo/Redo 歷史快照結構相容用途

// ---- 鏡頭預設 / Undo-Redo / 自動存檔 狀態 ----
let modelHeight = 2; // loadModel() 完成後同步成實際使用的身高常數，供鏡頭預設換算距離
let cameraTween = null; // {fromPos, toPos, fromTarget, toTarget, start, duration}
let historyStack = [];
let historyIndex = -1;
let restoringHistory = false;
const HISTORY_MAX = 50;
let autoSaveTimer = null;
const AUTOSAVE_KEY = "tuttingAutosave_v1";
const AUTOSAVE_SCHEMA_VERSION = 1;

// ---- 洋蔥皮（Onion Skinning）狀態 ----
// ghostPrev/ghostNext 是用 SkeletonUtils.clone(model) 複製出的獨立骨架半透明殘影，
// 只在選取某個拍點、且目前在「時間軸」分頁時才顯示，分別套用「上一拍」「下一拍」的角度資料。
// 只在選取拍點變動時才重新計算殘影姿勢（不是每幀），詳見 updateOnionSkins()。
let onionSkinEnabled = false;
let ghostPrev = null, ghostNext = null;
let ghostBones = { prev:{}, next:{} };

// ---- Keyframe 時間軸狀態 ----
let kfChipEls = [];       // 對應 keyframes 索引的 chip DOM 節點快取，播放時靠這個直接切換 class，避免逐幀重建整份清單
let kfDragSrcIndex = -1;  // 拖曳排序中，目前正在被拖曳的拍點索引（-1＝沒有拖曳中）
let kfMultiSelectMode = false;    // BG-6：Timeline 多選模式（POSE / GROOVE 共用）
let kfMultiSelected = new Set();  // 多選模式下已勾選的 POSE 索引
let grooveMultiSelected = new Set(); // 多選模式下已勾選的 GROOVE 索引
let timelineClipboard = { poseItems:[], grooveItems:[] }; // 內部剪貼簿；deep-copy，不依賴系統 clipboard 權限
let keyframes = [];       // [{ angles: { jointKey: [x,y,z], ... } }, ...]
let kfEditingIndex = -1;  // 目前選取（預覽/可更新/可刪除）的拍點
let kfPlaying = false;
let kfLoop = false;
let kfIndex = 0;
let kfStartTime = 0;
// BG-5：時間範圍選取／Range Loop。range start/end 使用與 Beat Grid 相同的 0-based beat 座標。
let beatGridRangeStart = null;
let beatGridRangeEnd = null;
let beatGridRangeLoop = false;
let beatGridRangeDrag = null;
// BG-6.2：Range 剪貼簿獨立於一般 Timeline 多選剪貼簿。Range 操作以「與範圍相交的完整項目」為單位，
// 避免在目前 sequential keyframe 資料模型下把 transition 從中間切斷而產生不可表示的半段資料。
let beatGridRangeClipboard = { poseItems:[], grooveItems:[], source:{start:0,end:0}, affected:{poseTransitions:0,grooves:0} };
let kfPendingEasing = "easeInOutQuad"; // 選取拍點時即時編輯／新增拍點時的預設 Easing
let kfPendingBeats = 1;                // 選取拍點時即時編輯／新增拍點時的預設拍數


// 待機姿勢：resetPose() 用來把所有關節歸零的基準資料。
// （原本這裡是一個含 8 種預設姿勢的 POSES 陣列，但只有這筆「待機」真正被用到，
// 其餘 7 筆從未被任何程式碼讀取，屬於死資料，已一併清除。）
const IDLE_POSE = { name:"待機", rArm:[0,0,0], rForeArm:[0,0,0], rHand:[0,0,0],
                     lArm:[0,0,0], lForeArm:[0,0,0], lHand:[0,0,0], head:[0,0,0], spine:[0,0,0] };


let tgConfig=JSON.parse(JSON.stringify(TG_DEFAULT)),tgBase=null,tgCandidates=[],tgIndex=-1,tgPreview=null,tgSignature='';
function tgConflict(){
  if(!model)return '請等待角色載入';
  if(kfPlaying||waveRun||laPathRun||groovePreviewEnabled||waveTrackActive)return '請先停止時間軸、Waving、律動及軌跡預覽；若剛拖曳 WAVING 游標，請先選取一個 POSE。';
  if(Object.values(ikEnabled).some(Boolean)||spineIKEnabled||Object.values(fingerIKEnabled).some(Boolean)||Object.values(lookAtEnabled).some(Boolean)||footPlantEnabled)return '請先關閉 IK、LookAt 與腳底固定，再使用生成器。';
  if(handCollisionEnabled||handHandCollisionEnabled)return '請先關閉手部碰撞回彈，以免生成姿勢被碰撞修正改寫。';
  return '';
}
function tgSay(s){const el=document.getElementById('tgStatus');if(el)el.textContent=s;}
function tgDrawPose(p,body){if(!model)return;for(const k of ALL_JOINT_KEYS)if(bones[k]&&restQuat[k]&&p[k])bones[k].quaternion.copy(restQuat[k]).multiply(eulerToQuat(p[k]));if(body)applyBodyTransform(body);model.updateMatrixWorld(true);}
function tgCancelPreview(){if(!tgPreview)return;const old=tgPreview;tgPreview=null;tgDrawPose(poseController.snapshotTarget(),old.body);tgUI();}
function tgClear(){tgCancelPreview();tgCandidates=[];tgIndex=-1;tgSignature='';tgUI();}
function tgRuleSignature(){return JSON.stringify({config:tgConfig,limits:JOINT_LIMITS,base:tgBase});}
function tgCapture(){
  const conflict=tgConflict();if(conflict){tgSay(conflict);return;}
  tgCancelPreview();pushHistory();tgBase={angles:poseController.snapshotTarget(),body:snapshotBodyTransform()};tgClear();pushHistory();scheduleAutoSave();tgUI();tgSay('已擷取基礎姿勢。未勾選部位保留局部角度，仍可能隨上游骨骼移動。');
}
function tgGenerate(){
  const conflict=tgConflict();if(conflict){tgSay(conflict);return;}
  if(!tgReadSettings())return;
  if(!tgBase)tgCapture();if(!tgBase)return;
  tgCancelPreview();const result=tgGenerateCandidates(tgBase.angles,tgConfig,TG_KEYS.filter(k=>bones[k]),clampJointAngles);
  tgCandidates=result.results;tgIndex=tgCandidates.length?0:-1;tgSignature=tgRuleSignature();tgUI();
  tgSay(tgCandidates.length?`產生 ${tgCandidates.length}／6 個不重複候選；依總角度變化由小到大排列。${tgCandidates.length<6?'在本次搜尋上限內未找到更多結果，可換種子或放寬條件。':''}`:'本次搜尋未找到符合條件的變化。請檢查活動軸、角度集合、變化上限與關節限制；不會自動放寬規則。');
  if(tgIndex>=0)tgShow(0);
}
function tgValidCandidate(){
  if(tgIndex<0||!tgCandidates[tgIndex])return false;
  if(tgSignature!==tgRuleSignature()){tgClear();tgSay('規則或基礎姿勢已變更，請重新生成。');return false;}return true;
}
function tgShow(index){
  const conflict=tgConflict();if(conflict){tgSay(conflict);return;}
  tgIndex=Math.max(0,Math.min(tgCandidates.length-1,index));if(!tgValidCandidate())return;
  if(!tgPreview)tgPreview={body:snapshotBodyTransform()};tgDrawPose(tgCandidates[tgIndex].angles,tgBase.body);tgUI();
}
function tgTick(){if(!tgPreview)return;const conflict=tgConflict();if(conflict||tgSignature!==tgRuleSignature()){tgCancelPreview();tgSay(conflict||'規則已變更，請重新生成。');return;}tgDrawPose(tgCandidates[tgIndex].angles,tgBase.body);}
function tgCommit(toTimeline=false){
  const conflict=tgConflict();if(conflict){tgSay(conflict);return false;}if(!tgValidCandidate())return false;
  const p=tgCandidates[tgIndex];tgCancelPreview();pushHistory();
  poseController.restoreTarget(p.angles, { clamp: false });
  tgDrawPose(p.angles,tgBase.body);setActiveBtn(-1);updateSelectedBar();
  if(toTimeline)addKeyframe();pushHistory();scheduleAutoSave();tgUI();tgSay(toTimeline?'已加入一個 POSE 拍點，可用 Undo 復原。':'已套用候選姿勢，可用 Undo 復原。');return true;
}
function tgReadSettings(){
  const input=document.getElementById('tgValues'),tokens=input.value.trim().split(/[,，、\s]+/).filter(Boolean),values=tokens.map(Number);
  if(!values.length||values.length>24||values.some(v=>!Number.isFinite(v)||Math.abs(v)>180)){tgSay('請輸入 1～24 個 −180～180° 的數值，以逗號分隔。');return false;}
  const axes={};for(const k of TG_KEYS)axes[k]=['x','y','z'].filter(a=>document.getElementById('tg_'+k+'_'+a).checked);
  const maxDelta=Number(document.getElementById('tgMaxDelta').value),maxJoints=Number(document.getElementById('tgMaxJoints').value),seed=Number(document.getElementById('tgSeed').value);
  if(!Number.isFinite(maxDelta)||maxDelta<1||maxDelta>180||!Number.isInteger(maxJoints)||maxJoints<1||maxJoints>8||!Number.isInteger(seed)||seed<0||seed>4294967295){tgSay('每軸上限需為 1～180°、最多關節數為 1～8，種子為 0～4294967295 的整數。');return false;}
  const next=cleanTGConfig({mode:document.getElementById('tgMode').value,values,maxDelta,maxJoints,seed,axes});
  if(JSON.stringify(next)!==JSON.stringify(tgConfig)){tgClear();pushHistory();tgConfig=next;pushHistory();scheduleAutoSave();}
  return true;
}
function tgUI(){
  const el=document.getElementById('tgCandidateInfo');if(!el)return;
  const candidate=tgCandidates[tgIndex];el.textContent=candidate?`候選 ${tgIndex+1}／${tgCandidates.length} · 改動：${candidate.changed.map(k=>LABEL_LOOKUP[k]).join('、')} · 最大每軸變化 ${candidate.maxDelta.toFixed(1)}° · TG-1 角度／部位規則符合${tgPreview?' · 預覽中（尚未套用）':''}`:'尚未產生候選';
  for(const id of ['tgApply','tgAddPose','tgSavePose','tgPrev','tgNext','tgPreviewBtn'])document.getElementById(id).disabled=!candidate;
  document.getElementById('tgPrev').disabled=!candidate||tgIndex<=0;document.getElementById('tgNext').disabled=!candidate||tgIndex>=tgCandidates.length-1;
  document.getElementById('tgCancel').disabled=!tgPreview;
  document.getElementById('tgBaseInfo').textContent=tgBase?'已有基礎姿勢；再次生成仍以此姿勢為起點。':'尚未擷取；首次生成會使用目前姿勢。';
}
function tgConfigUI(){
  if(!document.getElementById('tgMode'))return;
  for(const [id,v]of Object.entries({tgMode:tgConfig.mode,tgValues:tgConfig.values.join(', '),tgMaxDelta:tgConfig.maxDelta,tgMaxJoints:tgConfig.maxJoints,tgSeed:tgConfig.seed}))document.getElementById(id).value=v;
  for(const k of TG_KEYS)for(const a of ['x','y','z']){const el=document.getElementById('tg_'+k+'_'+a);if(el)el.checked=tgConfig.axes[k].includes(a);}tgUI();
}
function snapshotTG(){return {config:tgCopy(tgConfig),base:tgCopy(tgBase)};}
function restoreTG(data){
  tgClear();tgConfig=cleanTGConfig(data?.config);tgBase=null;const b=data?.base;
  const vec=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
  if(b?.angles&&ALL_JOINT_KEYS.every(k=>vec(b.angles[k],3))&&vec(b.body?.position,3)&&vec(b.body?.quaternion,4))tgBase=tgCopy(b);
  tgConfigUI();
}
function snapshotGenerationRules(){return {limits:tgCopy(JOINT_LIMITS),isolation:tgCopy(isolationSettings),gridStep:Number(document.getElementById('jlGridStepInput')?.value)||15,edgeProb:Number(document.getElementById('jlEdgeProbInput')?.value)||0};}
function restoreGenerationRules(raw){
  if(!raw)return;
  const limits=defaultJointLimits();for(const k of JOINT_LIMIT_KEYS)for(const axis of ['x','y','z']){const v=raw.limits?.[k]?.[axis];if(v&&Number.isFinite(v.min)&&Number.isFinite(v.max))limits[k][axis]={enabled:v.enabled===true,min:Math.min(v.min,v.max),max:Math.max(v.min,v.max)};}JOINT_LIMITS=limits;
  const iso=raw.isolation||{};isolationSettings={enabled:iso.enabled===true,minGroups:Math.max(1,Math.min(50,Math.round(Number(iso.minGroups)||1))),maxGroups:Math.max(1,Math.min(50,Math.round(Number(iso.maxGroups)||2))),weights:{},jointWeights:{}};
  for(const [k,v]of Object.entries(iso.weights||{}))if(Number.isFinite(v)&&v>=0)isolationSettings.weights[k]=v;
  for(const [k,v]of Object.entries(iso.jointWeights||{}))if(JOINT_LIMIT_KEYS.includes(k)&&Number.isFinite(v)&&v>=0&&v<=100)isolationSettings.jointWeights[k]=v;
  document.getElementById('jlGridStepInput').value=Math.max(1,Math.min(360,Number(raw.gridStep)||15));document.getElementById('jlEdgeProbInput').value=Math.max(0,Math.min(100,Number(raw.edgeProb)||0));
  saveJointLimits();saveIsolationSettings();if(model)buildJointLimitPanel();
}
function bindTG(){
  const host=document.getElementById('tgParts');for(const k of TG_KEYS){const row=document.createElement('div');row.className='tgPart';const label=document.createElement('strong');label.textContent=LABEL_LOOKUP[k];row.append(label);
    for(const a of ['x','y','z']){const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.id='tg_'+k+'_'+a;l.append(c,a.toUpperCase());row.append(l);c.onchange=()=>tgReadSettings();}host.append(row);}
  document.getElementById('tgCapture').onclick=tgCapture;document.getElementById('tgGenerate').onclick=tgGenerate;
  document.getElementById('tgPrev').onclick=()=>tgShow(tgIndex-1);document.getElementById('tgNext').onclick=()=>tgShow(tgIndex+1);
  document.getElementById('tgPreviewBtn').onclick=()=>tgShow(tgIndex);document.getElementById('tgCancel').onclick=tgCancelPreview;
  document.getElementById('tgApply').onclick=()=>tgCommit();document.getElementById('tgAddPose').onclick=()=>tgCommit(true);
  document.getElementById('tgSavePose').onclick=()=>{if(tgCommit()){poseLibCtrl.saveCurrent(document.getElementById('tgPoseName').value.trim()||'Tutting 候選');tgSay('已套用並存入姿勢庫；姿勢庫項目沿用既有獨立保存方式。');}};
  document.getElementById('tgNewSeed').onclick=()=>{document.getElementById('tgSeed').value=(tgConfig.seed+1)>>>0;if(tgReadSettings())tgGenerate();};
  for(const id of ['tgMode','tgValues','tgMaxDelta','tgMaxJoints','tgSeed'])document.getElementById(id).onchange=()=>tgReadSettings();
  // Cancel transient preview before external UI mutations; camera orbit remains available.
  document.addEventListener('pointerdown',e=>{if(tgPreview&&e.target.closest?.('#uiCommon, .floatablePanel'))tgCancelPreview();},true);
  for(const id of ['jlGridStepInput','jlEdgeProbInput']){const el=document.getElementById(id);el.addEventListener('focus',()=>pushHistory());el.addEventListener('change',()=>{pushHistory();scheduleAutoSave();});}
  tgConfigUI();
}

// WAVING track: independent clips; sampled motion stays private to each clip.
let waveClips = [], waveClipSelected = null;
let waveTrackActive = false;
const waveClone = value => JSON.parse(JSON.stringify(value));
function syncWaveTrackTarget(k){
  poseController.syncFromBone(k, { round: false });
}
function waveTrackEnd(){return waveClips.reduce((n,c)=>Math.max(n,c.start+c.beats),0);}
function wavePlaybackEnd(){return Math.max(beatGridPoseTotalBeats(),waveTrackEnd());}
function waveTrackMessage(s){document.getElementById('waveBakeStatus').textContent=s;document.getElementById('waveTrackNotice').textContent=s;}
function waveClipOverlap(start,beats,except){return waveClips.some(c=>c.id!==except&&start<c.start+c.beats-1e-8&&start+beats>c.start+1e-8);}
function waveSnap(v){const step=Number(BEAT_GRID_SNAP)||.25;return Math.max(0,Math.round(v/step)*step);}
function waveClipWeight(c,beat){
  const local=beat-c.start;if(local<=0||local>=c.beats)return 0;
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const fadeIn=Math.min(c.fadeIn,c.beats/2),fadeOut=Math.min(c.fadeOut,c.beats/2);
  return Math.min(smooth(local/fadeIn),smooth((c.beats-local)/fadeOut));
}
function cleanWaveClips(raw){
  if(!Array.isArray(raw))return [];
  const result=[];const ids=new Set();
  const vec=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
  for(const r of raw.slice(0,128).sort((a,b)=>(a?.start||0)-(b?.start||0))){
    if(!r||!Number.isFinite(r.start)||r.start<0||!Number.isFinite(r.beats)||r.beats<.25||r.beats>1024||r.start>100000)continue;
    if(!Array.isArray(r.frames)||r.frames.length<2||r.frames.length>4097)continue;
    if(!r.frames.every(f=>f&&f.angles&&ALL_JOINT_KEYS.every(k=>vec(f.angles[k],3))&&f.body&&vec(f.body.position,3)&&vec(f.body.quaternion,4)))continue;
    if(result.some(c=>r.start<c.start+c.beats-1e-8&&r.start+r.beats>c.start+1e-8))continue;
    const id=typeof r.id==='string'&&!ids.has(r.id)?r.id:makeLibId();ids.add(id);
    result.push({id,start:r.start,beats:r.beats,cycles:Math.max(1,Math.min(8,Math.round(Number(r.cycles)||1))),config:cleanWave(r.config),
      fadeIn:Math.max(.05,Math.min(r.beats/2,Number(r.fadeIn)||.5)),fadeOut:Math.max(.05,Math.min(r.beats/2,Number(r.fadeOut)||.5)),
      keys:Array.isArray(r.keys)?r.keys.filter(k=>ALL_JOINT_KEYS.includes(k)):ALL_JOINT_KEYS.slice(),
      frames:waveClone(r.frames),feet:Array.isArray(r.feet)?waveClone(r.feet):null});
  }
  return result;
}
function waveBaseAtBeat(beat){
  if(!keyframes.length){
    const f=waveClips[0]?.frames[0];if(f){applyBodyTransform(f.body);for(const k of ALL_JOINT_KEYS)if(bones[k]&&restQuat[k])bones[k].quaternion.copy(restQuat[k]).multiply(eulerToQuat(f.angles[k]||[0,0,0]));model.updateMatrixWorld(true);}
    return new Set();
  }
  const loc=locateKeyframeSegmentAtBeat(beat);kfIndex=loc.index;
  if(keyframes.length===1){
    const f=keyframes[0];applyBodyTransform(f.body);
    for(const k of ALL_JOINT_KEYS)if(bones[k]&&restQuat[k])bones[k].quaternion.copy(restQuat[k]).multiply(eulerToQuat(f.angles[k]||[0,0,0]));
    model.updateMatrixWorld(true);return new Set();
  }
  const a=keyframes[loc.index],b=keyframes[loc.index+1];
  const t=Math.min(1,loc.localBeat/Math.max(.0001,a.beats||1));
  return applyKeyframeFramePose(a,b,(EASINGS[a.easing]||EASINGS.linear)(t));
}
function applyWaveTrackAtBeat(beat){
  waveTrackActive=false;
  const c=waveClips.find(c=>beat>=c.start&&beat<c.start+c.beats);
  document.querySelectorAll('#waveTrackList .waveClip').forEach(el=>el.classList.toggle('activeSeg',el.dataset.id===c?.id));
  if(!c)return;
  const weight=waveClipWeight(c,beat);if(weight<=0)return;
  waveTrackActive=true;
  const cursor=Math.max(0,Math.min(c.frames.length-1,(beat-c.start)/c.beats*(c.frames.length-1)));
  const i=Math.min(c.frames.length-2,Math.floor(cursor)),t=cursor-i;
  const a=c.frames[i],b=c.frames[i+1],base={},basePos=model.position.clone(),baseQuat=model.quaternion.clone();
  // Snapshot the underlying POSE + Groove before temporarily solving the wave candidate.
  for(const k of ALL_JOINT_KEYS)if(bones[k])base[k]=bones[k].quaternion.clone();
  const body=waveHasBody(c.config),keys=body?ALL_JOINT_KEYS:c.keys;
  const qa=new THREE.Quaternion(),qb=new THREE.Quaternion();
  for(const k of keys){if(!bones[k]||!restQuat[k])continue;
    eulerToQuat(a.angles[k],qa);eulerToQuat(b.angles[k],qb);
    bones[k].quaternion.copy(restQuat[k]).multiply(qa.slerp(qb,t));
  }
  if(body){
    model.position.fromArray(a.body.position).lerp(new THREE.Vector3().fromArray(b.body.position),t);
    model.quaternion.fromArray(a.body.quaternion).slerp(new THREE.Quaternion().fromArray(b.body.quaternion),t);
    model.updateMatrixWorld(true);
    if(c.feet)applyBakedWaveFeet({waveBake:{feet:c.feet}});
  }
  // Blend the solved candidate, including leg compensation. Foot locks release continuously.
  for(const k of keys)if(base[k])bones[k].quaternion.copy(base[k].slerp(bones[k].quaternion,weight));
  if(body){model.position.lerpVectors(basePos,model.position.clone(),weight);model.quaternion.copy(baseQuat.slerp(model.quaternion,weight));}
  model.updateMatrixWorld(true);
}
function updateWaveTrackPlayback(now){
  const end=wavePlaybackEnd();let beat=Math.max(0,(now-grooveStartTime)*bpm/60000);
  const range=beatGridRangeLoop&&hasBeatGridRange();
  const left=range?Math.min(beatGridRangeStart,end):0,right=range?Math.min(beatGridRangeEnd,end):end;
  if(beat>=right){
    if((range||kfLoop)&&right>left){beat=left+(beat-left)%(right-left);seekRunningPlaybackToBeat(beat,now);}
    else {waveBaseAtBeat(end);applyWaveTrackAtBeat(end);for(const k of ALL_JOINT_KEYS)syncWaveTrackTarget(k);stopKeyframePlayback();return;}
  }
  const blocked=waveBaseAtBeat(beat);
  applyGroove(now,blocked);applySquatGroove(now,grooveStartTime,false,blocked);
  applyWaveTrackAtBeat(beat);
  const loc=locateKeyframeSegmentAtBeat(beat);kfStartTime=now-loc.localBeat*60000/bpm;
  updatePlayingKeyframeHighlight();updateBeatGridPlaybackUI(now);
}
function selectWaveClip(id){
  if(kfPlaying)return;waveClipSelected=id;kfEditingIndex=-1;grooveSeqSelectedIndex=-1;kfMultiSelected.clear();grooveMultiSelected.clear();
  renderKeyframeChips();renderGrooveSeqChips();renderWaveTrack();
}
function editWaveClip(id,patch){
  if(kfPlaying)return false;const c=waveClips.find(c=>c.id===id);if(!c)return false;
  const next={...c,...patch};
  if(!Number.isFinite(next.start)||next.start<0||next.start>100000||!Number.isFinite(next.beats)||next.beats<.25||next.beats>1024||waveClipOverlap(next.start,next.beats,id)){
    waveTrackMessage('未修改：區塊不可重疊，長度需為 0.25～1024 拍。');renderWaveTrack();return false;
  }
  next.fadeIn=Math.max(.05,Math.min(next.beats/2,next.fadeIn));next.fadeOut=Math.max(.05,Math.min(next.beats/2,next.fadeOut));
  pushHistory();Object.assign(c,next);waveClips.sort((a,b)=>a.start-b.start);pushHistory();scheduleAutoSave();renderKeyframeChips();return true;
}
function deleteWaveClip(){if(kfPlaying)return;pushHistory();waveClips=waveClips.filter(c=>c.id!==waveClipSelected);waveClipSelected=null;pushHistory();scheduleAutoSave();renderKeyframeChips();}
function duplicateWaveClip(){
  if(kfPlaying)return;if(waveClips.length>=128){waveTrackMessage('最多 128 個 WAVING 區塊');return;}const c=waveClips.find(c=>c.id===waveClipSelected);if(!c)return;
  const copy=waveClone(c);copy.id=makeLibId();copy.start=c.start+c.beats;
  while(waveClipOverlap(copy.start,copy.beats,null)){const blockers=waveClips.filter(x=>copy.start<x.start+x.beats&&copy.start+copy.beats>x.start);copy.start=Math.max(...blockers.map(x=>x.start+x.beats));}
  pushHistory();waveClips.push(copy);waveClipSelected=copy.id;pushHistory();scheduleAutoSave();renderKeyframeChips();
}
function loadWaveClipSettings(){
  if(kfPlaying)return;const c=waveClips.find(c=>c.id===waveClipSelected);if(!c)return;
  stopWave();waveConfig=cleanWave(c.config);waveUI();
  document.getElementById('waveBakeCycles').value=c.cycles;
  document.getElementById('waveBakeBeats').value=c.beats/(c.cycles*(c.config.direction==='pingpong'?2:1));
  document.querySelector('.tabBtn[data-tab="waving"]').click();document.getElementById('waveBakeSection').open=true;
  waveTrackMessage('已載入選取區塊設定；調整後按「更新選取區塊」。');
}
function layoutWaveTrack(){
  const host=document.getElementById('waveTrackList');if(!host)return;
  host.style.width=Math.ceil(beatGridTimelineBeats()*BEAT_GRID_PX_PER_BEAT)+'px';
  for(const el of host.querySelectorAll('.waveClip')){const c=waveClips.find(c=>c.id===el.dataset.id);if(c){el.style.left=c.start*BEAT_GRID_PX_PER_BEAT+'px';el.style.width=Math.max(8,c.beats*BEAT_GRID_PX_PER_BEAT)+'px';}}
}
function renderWaveTrack(){
  const host=document.getElementById('waveTrackList');if(!host)return;host.replaceChildren();
  if(!waveClips.length){const hint=document.createElement('span');hint.className='small';hint.textContent='尚未加入 Waving 區塊';host.append(hint);}
  for(const c of waveClips){
    const el=document.createElement('div');el.className='waveClip'+(c.id===waveClipSelected?' selected':'');el.dataset.id=c.id;el.tabIndex=0;el.setAttribute('role','button');
    el.textContent='🌊 '+({both:'雙臂',left:'左手',right:'右手',custom:'局部',body:'身體',leftBody:'左手 → 身體',rightBody:'右手 → 身體'}[c.config.route])+' · '+Number(c.beats.toFixed(2))+' 拍';
    el.title='起點 Beat '+(c.start+1)+'；拖曳移動，右緣調長度；雙擊編輯波形';
    const handle=document.createElement('span');handle.className='waveResize';handle.title='拖曳調整長度';el.append(handle);
    el.ondblclick=()=>{selectWaveClip(c.id);loadWaveClipSettings();};
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectWaveClip(c.id);}};
    el.onpointerdown=e=>{
      if(kfPlaying||e.button!==0)return;e.preventDefault();e.stopPropagation();
      const resize=e.target===handle,startX=e.clientX,scroll=document.getElementById('beatGridScroll'),startScroll=scroll.scrollLeft,originalStart=c.start,originalBeats=c.beats;
      el.setPointerCapture(e.pointerId);let candidate=resize?originalBeats:originalStart;
      el.onpointermove=ev=>{const delta=(ev.clientX-startX+scroll.scrollLeft-startScroll)/BEAT_GRID_PX_PER_BEAT;candidate=resize?Math.max(.25,waveSnap(originalBeats+delta)):waveSnap(originalStart+delta);el.style[resize?'width':'left']=candidate*BEAT_GRID_PX_PER_BEAT+'px';};
      el.onpointerup=()=>{el.onpointermove=null;el.onpointerup=null;waveClipSelected=c.id;kfEditingIndex=-1;grooveSeqSelectedIndex=-1;
        if(candidate!==(resize?originalBeats:originalStart))editWaveClip(c.id,resize?{beats:candidate}:{start:candidate});else selectWaveClip(c.id);};
      el.onpointercancel=()=>{el.onpointermove=null;renderWaveTrack();};
    };
    host.append(el);
  }
  const c=waveClips.find(c=>c.id===waveClipSelected),panel=document.getElementById('waveClipInspector');panel.hidden=!c;
  if(c){for(const [id,v]of Object.entries({waveClipStart:c.start+1,waveClipBeats:c.beats,waveClipFadeIn:c.fadeIn,waveClipFadeOut:c.fadeOut}))document.getElementById(id).value=v;}
  document.getElementById('waveUpdateClip').disabled=!c||kfPlaying;
  layoutWaveTrack();
}
function bindWaveTrack(){
  document.getElementById('waveTrackAdd').onclick=()=>{document.querySelector('.tabBtn[data-tab="waving"]').click();document.getElementById('waveBakeSection').open=true;};
  document.getElementById('waveClipDelete').onclick=deleteWaveClip;document.getElementById('waveClipDuplicate').onclick=duplicateWaveClip;
  document.getElementById('waveClipEdit').onclick=loadWaveClipSettings;
  document.getElementById('waveUpdateClip').onclick=()=>bakeWaveToTimeline(true);
  for(const [id,key]of [['waveClipStart','start'],['waveClipBeats','beats'],['waveClipFadeIn','fadeIn'],['waveClipFadeOut','fadeOut']])document.getElementById(id).onchange=e=>{
    const value=Number(e.target.value)-(key==='start'?1:0);if(!Number.isFinite(value)){renderWaveTrack();return;}editWaveClip(waveClipSelected,{[key]:value});};
  renderWaveTrack();
}

// Arm Wave: deterministic travelling pulse, relative to a captured base pose.
const WAVE_ROUTE_NODES=[['lFinger',0,'左手指'],['lWrist',.7,'左手腕'],['lElbow',1.6,'左手肘'],['lShoulder',3.6,'左肩'],['rShoulder',4.4,'右肩'],['rElbow',6.4,'右手肘'],['rWrist',7.3,'右手腕'],['rFinger',8,'右手指']];
function waveIsRelay(c){return c.route==='leftBody'||c.route==='rightBody';}
function waveHasBody(c){return c.route==='body'||waveIsRelay(c);}
function waveBounds(c){
  const a=WAVE_ROUTE_NODES.find(n=>n[0]===c.startNode)||WAVE_ROUTE_NODES[0];
  const b=WAVE_ROUTE_NODES.find(n=>n[0]===c.endNode)||WAVE_ROUTE_NODES[7];
  return {start:a[1],end:b[1],min:Math.min(a[1],b[1]),max:Math.max(a[1],b[1]),sign:b[1]>=a[1]?1:-1};
}
function waveLocalIndex(c,side,offset){
  const global=side==='l'?offset:8-offset;
  if(c.route!=='custom')return c.route==='both'?global:offset;
  const r=waveBounds(c);return global<r.min-1e-8||global>r.max+1e-8?null:(global-r.start)*r.sign;
}
function waveSides(c){
  if(c.route==='leftBody')return ['l'];
  if(c.route==='rightBody')return ['r'];
  if(c.route==='body')return [];
  if(c.route==='custom'){const b=waveBounds(c);return ['l','r'].filter(side=>WAVE_ROUTE_NODES.some(n=>n[0][0]===side&&n[1]>=b.min&&n[1]<=b.max));}
  return c.route==='left'?['l']:c.route==='right'?['r']:['l','r'];
}
function waveRouteLength(c){if(waveIsRelay(c))return 7.6;if(c.route==='body')return 3;if(c.route==='custom'){const b=waveBounds(c);return b.max-b.min;}return c.route==='both'||!c.route?8:3.6;}
function waveNodes(c){
  if(waveIsRelay(c)){const side=c.route==='leftBody'?'左':'右';return [[0,side+'手指'],[.7,side+'手腕'],[1.6,side+'手肘'],[3.6,side+'肩'],[4.6,'胸口'],[5.6,'上腰'],[6.6,'下腰'],[7.6,'骨盆']];}
  if(c.route==='body')return [[0,'胸口'],[1,'上腰'],[2,'下腰'],[3,'骨盆']];
  if(c.route==='custom'){const b=waveBounds(c);return WAVE_ROUTE_NODES.filter(n=>n[1]>=b.min&&n[1]<=b.max).map(n=>[(n[1]-b.start)*b.sign,n[2]]).sort((a,b)=>a[0]-b[0]);}
  const left=[[0,'左手指'],[.7,'左手腕'],[1.6,'左手肘'],[3.6,'左肩']];
  if(c.route==='left')return left;
  if(c.route==='right')return left.map(([p,n])=>[p,n.replace('左','右')]);
  return [...left,[4.4,'右肩'],[6.4,'右手肘'],[7.3,'右手腕'],[8,'右手指']];
}
function updateWaveRouteUI(position){
  const c=waveRun?.config||waveConfig,nodes=waveNodes(c);
  const isBody=c.route==='body';
  document.getElementById('waveRelayNote').hidden=!waveIsRelay(c);
  document.getElementById('waveBodySettings').hidden=!waveHasBody(c);
  document.getElementById('waveArmSettings').hidden=isBody;
  document.getElementById('waveCompensationSection').hidden=isBody;
  document.getElementById('waveCustomRoute').hidden=c.route!=='custom';
  for(const [id,key]of [['waveStartNode','startNode'],['waveEndNode','endNode']]){const el=document.getElementById(id);el.value=c[key];el.disabled=!!waveRun;}
  document.getElementById('waveRouteHint').textContent='正向：'+nodes.map(n=>n[1]).join(' → ');
  const el=document.getElementById('waveLocation');
  if(!waveRun){el.textContent='尚未預覽';return;}
  const p=position??wavePosition(waveRun.phase,c);
  const locationLabel=c.mode==='bipolar'?'峰谷中心':'波峰';
  if(p<0){el.textContent=locationLabel+'：起點外側';return;}
  if(p>waveRouteLength(c)){el.textContent=locationLabel+'：終點外側';return;}
  const nearest=nodes.reduce((best,n)=>Math.abs(n[0]-p)<Math.abs(best[0]-p)?n:best);
  el.textContent=locationLabel+'附近：'+nearest[1]+(!c.fingers&&nearest[1].includes('手指')?'（手指未參與）':'');
}
function waveDurationSeconds(config,tempo){return config.beats*60/(tempo*config.speed);}
function updateWaveTiming(){
  const c=waveRun?waveRun.config:waveConfig,el=document.getElementById('waveTiming');if(!el)return;
  const seconds=waveDurationSeconds(c,bpm);
  const text='BPM '+bpm+' · 單程 '+seconds.toFixed(2)+' 秒（'+(c.beats/c.speed).toFixed(2)+' 拍）'+(c.direction==='pingpong'?' · 完整往返 '+(seconds*2).toFixed(2)+' 秒':'');
  if(el.textContent!==text)el.textContent=text;
}
function setWaveSpeed(value,now=performance.now()){
  // Advance elapsed time at the OLD speed first; never rescale accumulated phase.
  if(waveRun)tickWave(now);
  waveConfig=cleanWave({...waveConfig,speed:value});
  if(waveRun)waveRun.config.speed=waveConfig.speed;
  waveUI();scheduleAutoSave();
}
const WAVE_GAIN_FIELDS={FingerGain:'fingerGain',WristGain:'wristGain',ElbowGain:'elbowGain',ShoulderGain:'shoulderGain',Compensation:'compensation',BodyChestGain:'bodyChestGain',BodyWaistGain:'bodyWaistGain',BodyHipGain:'bodyHipGain'};
function seekWave(percent){
  if(!waveRun)startWave();
  const r=waveRun;if(!r)return;
  const u=Math.max(0,Math.min(1,Number(percent)/100));if(!Number.isFinite(u))return;
  const reverse=r.config.direction==='rl'||(r.config.direction==='pingpong'&&Math.floor(r.phase)%2===1);
  const pass=r.config.direction==='pingpong'&&reverse?1:0;
  r.phase=pass+Math.min(1-1e-9,reverse?1-u:u);r.playing=false;r.finished=false;r.last=performance.now();
  tickWave(r.last);waveUI('波峰已停格 · 可調整各部位幅度或繼續播放');
}
const WAVE_DEFAULT={mode:'unipolar',polarity:'positive',shape:'cosine',route:'both',startNode:'lFinger',endNode:'rFinger',direction:'lr',repeat:'loop',amplitude:25,width:1.4,beats:4,fingers:true,fingerGain:100,wristGain:100,elbowGain:100,shoulderGain:100,compensation:0,speed:1,bodyChestGain:100,bodyWaistGain:100,bodyHipGain:100};
let waveConfig={...WAVE_DEFAULT},waveRun=null;
function cleanWave(raw={}){
  const v=raw&&typeof raw==='object'?raw:{};
  const startNode=WAVE_ROUTE_NODES.some(n=>n[0]===v.startNode)?v.startNode:'lFinger';
  let endNode=WAVE_ROUTE_NODES.some(n=>n[0]===v.endNode)?v.endNode:'rFinger';
  if(endNode===startNode)endNode=WAVE_ROUTE_NODES[(WAVE_ROUTE_NODES.findIndex(n=>n[0]===startNode)+1)%8][0];
  const num=(k,lo,hi)=>Number.isFinite(Number(v[k]))?Math.min(hi,Math.max(lo,Number(v[k]))):WAVE_DEFAULT[k];
  return {mode:v.mode==='bipolar'?'bipolar':'unipolar',polarity:v.polarity==='negative'?'negative':'positive',shape:['cosine','gaussian','triangle','trapezoid'].includes(v.shape)?v.shape:'cosine',bodyChestGain:num('bodyChestGain',0,200),bodyWaistGain:num('bodyWaistGain',0,200),bodyHipGain:num('bodyHipGain',0,200),startNode,endNode,route:['both','left','right','custom','body','leftBody','rightBody'].includes(v.route)?v.route:'both',direction:['lr','rl','pingpong'].includes(v.direction)?v.direction:'lr',repeat:v.repeat==='once'?'once':'loop',amplitude:num('amplitude',0,60),width:num('width',.6,3),beats:num('beats',1,32),fingers:typeof v.fingers==='boolean'?v.fingers:true,fingerGain:num('fingerGain',0,200),wristGain:num('wristGain',0,200),elbowGain:num('elbowGain',0,200),shoulderGain:num('shoulderGain',0,200),compensation:num('compensation',0,100),speed:v.speed==null||v.speed===''?1:num('speed',.25,4)};
}
const WAVE_SHAPE_HINTS={
  cosine:'平滑抬起與回復，維持原版波浪質感。',
  gaussian:'波峰較集中、兩側柔和消退；高斯曲線截尾並歸零，路線兩端回復原姿勢。',
  triangle:'等速抬起與放下，峰頂轉折明顯，呈現機械稜角感。',
  trapezoid:'抬起後短暫維持最大幅度，再等速放下，呈現停留感。'
};
function wavePulse(index,position,width,shape='cosine'){
  if(!Number.isFinite(width)||width<=0)return 0;
  const d=Math.abs(index-position)/width;
  if(!Number.isFinite(d)||d>=1)return 0;
  if(shape==='triangle')return 1-d;
  if(shape==='trapezoid')return d<=.35?1:(1-d)/.65;
  if(shape==='gaussian'){
    const edge=Math.exp(-4.5);
    return (Math.exp(-4.5*d*d)-edge)/(1-edge);
  }
  return .5+.5*Math.cos(Math.PI*d);
}
// A bipolar packet fits both lobes into the original [-width, +width] support.
// Orient by travel direction so polarity controls temporal order on either pass.
function waveValue(index,position,c,phase){
  if(c.mode!=='bipolar')return wavePulse(index,position,c.width,c.shape);
  if(!Number.isFinite(c.width)||c.width<=0)return 0;
  const reverse=c.direction==='rl'||(c.direction==='pingpong'&&Math.floor(phase)%2===1);
  const d=(index-position)*(reverse?-1:1)/c.width;
  return wavePulse(d,.5,.5,c.shape)-wavePulse(d,-.5,.5,c.shape);
}
function wavePosition(phase,c){
  const pass=Math.floor(phase),u=phase-pass;
  const reverse=c.direction==='rl'||(c.direction==='pingpong'&&pass%2===1);
  const length=waveRouteLength(c);const x=-c.width+u*(length+2*c.width);return reverse?length-x:x;
}
function waveConflict(){
  if(kfPlaying)return '請先停止時間軸播放';
  if(groovePreviewEnabled)return '請先停止原有律動預覽';
  if(laPathRun)return '請先停止 LookAt 軌跡預覽';
  if(waveHasBody(waveRun?.config||waveConfig)){
    if(footPlantEnabled)return 'Body Wave：請先關閉腳底固定';
    if(Object.values(ikEnabled).some(Boolean)||FINGER_IDS.some(id=>fingerIKEnabled[id]))return 'Body Wave：請先關閉手腳及手指 IK';
    if(Object.values(lookAtEnabled).some(Boolean))return 'Body Wave：請先關閉 LookAt';
  }
  const sides=waveSides(waveRun?.config||waveConfig);
  if(sides.some(side=>ikEnabled[side+'Arm']))return '請先關閉路線內的手臂 IK';
  if(sides.some(side=>lookAtEnabled[side+'Hand']))return '請先關閉路線內的手掌 LookAt';
  if(FINGER_IDS.some(id=>sides.includes(id[0])&&fingerIKEnabled[id]))return '請先關閉路線內的手指 IK';
  if(spineIKEnabled||lookAtEnabled.chest)return '請先關閉脊椎 IK／胸口 LookAt';
  return '';
}
function waveUI(message){
  updateWaveRouteUI();
  document.getElementById('waveSpeed').value=waveConfig.speed;
  document.getElementById('waveSpeedValue').textContent=waveConfig.speed.toFixed(2)+'×';
  updateWaveTiming();
  const fields={Route:'route',Direction:'direction',Repeat:'repeat',Amplitude:'amplitude',Width:'width',Beats:'beats',Fingers:'fingers'};
  fields.Shape='shape';
  fields.Polarity='polarity';
  fields.Mode='mode';
  document.getElementById('waveShapeHint').textContent=WAVE_SHAPE_HINTS[waveConfig.shape]+' 套用整條所選路線；切換波形前請先停止預覽。';
  for(const [id,key]of Object.entries(fields)){const e=document.getElementById('wave'+id);if(!e)continue;if(key==='fingers')e.checked=waveConfig[key];else e.value=waveConfig[key];e.disabled=!!waveRun;}
  document.getElementById('waveFingers').disabled=!!waveRun||waveConfig.route==='body';
  for(const [id,key]of Object.entries(WAVE_GAIN_FIELDS)){document.getElementById('wave'+id).value=waveConfig[key];document.getElementById('wave'+id+'Value').textContent=waveConfig[key]+'%';}
  document.getElementById('wavePlay').disabled=!!waveRun?.playing;
  document.getElementById('wavePlay').textContent=waveRun?(waveRun.finished?'▶ 重播':'▶ 繼續'):'▶ Waving 預覽';
  document.getElementById('wavePause').disabled=!waveRun?.playing;
  document.getElementById('waveStop').disabled=!waveRun;
  if(message)document.getElementById('waveStatus').textContent=message;
}
// Body Wave owns temporary leg compensation; manual IK settings remain untouched.
function captureWaveFeet(){
  const feet=[];
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
  for(const side of ['l','r']){
    const keys=[side+'UpLeg',side+'Leg',side+'Foot'];
    if(keys.some(k=>!bones[k]))return null;
    const [root,mid,end]=keys.map(k=>bones[k]);
    const a=root.getWorldPosition(new THREE.Vector3()),b=mid.getWorldPosition(new THREE.Vector3()),c=end.getWorldPosition(new THREE.Vector3());
    const upper=a.distanceTo(b),lower=b.distanceTo(c);
    if(upper<.001||lower<.001)return null;
    const axis=c.clone().sub(a).normalize();
    const bend=b.clone().sub(a).addScaledVector(axis,-b.clone().sub(a).dot(axis));
    if(bend.lengthSq()<1e-7)bend.copy(forward);
    feet.push({keys,position:c,quaternion:end.getWorldQuaternion(new THREE.Quaternion()),pole:b.clone().add(bend.normalize().multiplyScalar(upper)),min:Math.abs(upper-lower)+.0002,max:upper+lower-.0002});
  }
  return {feet,position:model.position.clone()};
}
function solveWaveFeet(r,onFailure=message=>stopWave(message)){
  const g=r.ground;if(!g)return;
  model.updateMatrixWorld(true);
  const offsets=g.feet.map(f=>bones[f.keys[0]].getWorldPosition(new THREE.Vector3()).sub(model.position));
  const candidate=g.position.clone();
  // Keep both ankle targets reachable, with a small bend reserve at full extension.
  for(let pass=0;pass<100;pass++){
    let error=0;
    g.feet.forEach((f,i)=>{
      const d=candidate.clone().add(offsets[i]).sub(f.position),length=d.length();
      const wanted=Math.max(f.min,Math.min(f.max,length));error=Math.max(error,Math.abs(length-wanted));
      if(Math.abs(length-wanted)<1e-8)return;
      if(length<1e-9)d.set(0,1,0);else d.divideScalar(length);
      candidate.copy(f.position).addScaledVector(d,wanted).sub(offsets[i]);
    });
    if(error<1e-8)break;
  }
  const feasible=g.feet.every((f,i)=>{const d=candidate.clone().add(offsets[i]).distanceTo(f.position);return d>=f.min-1e-6&&d<=f.max+1e-6;});
  if(!feasible){onFailure('已停止：目前幅度無法維持雙腳固定，請降低骨盆幅度');return false;}
  model.position.copy(candidate);model.updateMatrixWorld(true);
  for(const f of g.feet){solveTwoBoneIK(...f.keys.map(k=>bones[k]),f.position,f.pole);applyBoneWorldQuatLock(bones[f.keys[2]],f.quaternion);}
  model.updateMatrixWorld(true);
  if(g.feet.some(f=>bones[f.keys[2]].getWorldPosition(new THREE.Vector3()).distanceTo(f.position)>.001)){onFailure('已停止：腿部無法維持腳掌位置，請降低幅度');return false;}
  return true;
}
function stopWave(message='已停止，回到基礎姿勢'){
  const r=waveRun;waveRun=null;
  if(r?.ground)model.position.copy(r.ground.position);
  if(r){for(const [k,v]of Object.entries(r.base)){if(!bones[k])continue;bones[k].quaternion.copy(v.q);poseController.setJointState(k, v.target, v.current);}model?.updateMatrixWorld(true);}
  if(document.getElementById('wavePlay')){document.getElementById('waveProgress').value=0;document.getElementById('waveSeek').value=0;document.getElementById('waveSeekValue').textContent='0%';waveUI(message);}
}
function startWave(){
  tgCancelPreview();
  waveTrackActive=false;
  const conflict=waveConflict();if(conflict){waveUI(conflict);return;}
  if(!model||waveSides(waveConfig).some(side=>!bones[side+'Hand'])){waveUI('請等待角色載入');return;}
  if(waveHasBody(waveConfig)&&['hips','spine','spine1','spine2'].some(k=>!bones[k]||!restQuat[k])){waveUI('Body Wave 需要骨盆及完整三節脊椎骨骼');return;}
  if(waveRun){if(waveRun.finished){waveRun.phase=0;waveRun.finished=false;}waveRun.playing=true;waveRun.last=performance.now();waveUI('播放中');return;}
  deselectJoint();model.updateMatrixWorld(true);
  const ground=waveHasBody(waveConfig)?captureWaveFeet():null;
  if(waveHasBody(waveConfig)&&!ground){waveUI('Body Wave 腳掌固定需要完整雙腿骨骼');return;}
  const base={},entries=[];
  // Capture local bend axes from current bone directions and character up.
  const up=new THREE.Vector3(0,1,0).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
  if(waveHasBody(waveConfig)){
    // Capture sagittal pitch axes in local coordinates; solve parent before child.
    const pitch=new THREE.Vector3(1,0,0).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    for(const [k,index,gain,group]of [['hips',3,-.30,'bodyHipGain'],['spine',2,.45,'bodyWaistGain'],['spine1',1,.45,'bodyWaistGain'],['spine2',0,.55,'bodyChestGain']]){
      const axis=pitch.clone().applyQuaternion(bones[k].getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
      entries.push({k,index:index+(waveIsRelay(waveConfig)?4.6:0),gain,group,axis});
    }
  }
  for(const side of waveSides(waveConfig)){
    const stages=[['Shoulder','Arm',3.6,.35],['Arm','ForeArm',2.6,.65],['ForeArm','Hand',1.6,1],['Hand','Middle1',.7,1.15]];
    for(const [part,next,offset,gain]of stages){
      const k=side+part,b=bones[k],n=bones[side+next];if(!b||!n)continue;
      const d=n.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
      const axis=new THREE.Vector3().crossVectors(d,up);
      if(axis.lengthSq()<1e-8)axis.set(0,0,1);axis.normalize().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
      const index=waveLocalIndex(waveConfig,side,offset);if(index===null)continue;
      entries.push({k,index,gain,axis,group:part==='Hand'?'wristGain':part==='ForeArm'?'elbowGain':'shoulderGain'});
    }
    if(waveConfig.fingers&&waveLocalIndex(waveConfig,side,0)!==null)for(const finger of ['Index','Middle','Ring','Pinky'])for(let j=1;j<=3;j++){
      const k=side+finger+j,b=bones[k];if(!b)continue;
      const n=b.children.find(child=>child.isBone);if(!n)continue;
      const d=n.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
      const axis=new THREE.Vector3().crossVectors(d,up);if(axis.lengthSq()<1e-8)continue;
      axis.normalize().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
      entries.push({k,index:waveLocalIndex(waveConfig,side,0),gain:.35,axis,group:'fingerGain'});
    }
  }
  for(const {k}of entries)base[k]={parentInModel:model.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(bones[k].parent.getWorldQuaternion(new THREE.Quaternion())),q:bones[k].quaternion.clone(),target:(poseController.getTarget(k)||[0,0,0]).slice(),current:(poseController.getCurrent(k)||[0,0,0]).slice()};
  if(waveIsRelay(waveConfig))for(const {k}of entries)if(k[0]==='l'||k[0]==='r')base[k].parentInChest=bones.spine2.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(bones[k].parent.getWorldQuaternion(new THREE.Quaternion()));
  if(ground)for(const f of ground.feet)for(const k of f.keys)base[k]={q:bones[k].quaternion.clone(),target:(poseController.getTarget(k)||[0,0,0]).slice(),current:(poseController.getCurrent(k)||[0,0,0]).slice()};
  waveRun={base,entries,ground,config:{...waveConfig},phase:0,last:performance.now(),playing:true};waveUI('播放中 · 波峰沿所選路線傳遞');
}
function tickWave(now){
  updateWaveTiming();
  const r=waveRun;if(!r)return;
  const conflict=waveConflict();if(conflict){stopWave('預覽停止：'+conflict);return;}
  if(r.playing){r.phase+=Math.max(0,now-r.last)*bpm*r.config.speed/(60000*r.config.beats);}
  r.last=now;
  const end=r.config.direction==='pingpong'?2:1;
  if(r.config.repeat==='once'&&r.phase>=end){r.phase=end;r.playing=false;r.finished=true;waveUI('單次完成 · 可重播或停止還原');}
  const pos=wavePosition(r.phase,r.config);
  if(r.ground){
    model.position.copy(r.ground.position);
    for(const f of r.ground.feet)for(const k of f.keys)bones[k].quaternion.copy(r.base[k].q);
    model.updateMatrixWorld(true);
  }
  for(const e of r.entries){
    const b=bones[e.k];const q=r.base[e.k].q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(e.axis,THREE.MathUtils.degToRad((r.config.polarity==='negative'?-1:1)*r.config.amplitude*e.gain*(r.config[e.group]/100)*waveValue(e.index,pos,r.config,r.phase))));
    // Solve proximal to distal. Preserve own wave, cancel inherited orientation only.
    if(r.config.compensation>0&&(e.group==='elbowGain'||e.group==='wristGain')){
      const referenceParent=r.base[e.k].parentInChest
        ?bones.spine2.getWorldQuaternion(new THREE.Quaternion()).multiply(r.base[e.k].parentInChest)
        :model.getWorldQuaternion(new THREE.Quaternion()).multiply(r.base[e.k].parentInModel);
      const desiredWorld=referenceParent.multiply(q);
      const corrected=b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desiredWorld);
      q.slerp(corrected,r.config.compensation/100).normalize();
    }
    // Respect existing per-joint limits, without writing preview back to saved targets.
    const rel=restQuat[e.k].clone().invert().multiply(q),eu=new THREE.Euler().setFromQuaternion(rel,'XYZ');
    const a=clampJointAngles(e.k,[R(eu.x),R(eu.y),R(eu.z)]);
    b.quaternion.copy(restQuat[e.k]).multiply(eulerToQuat(a));
    b.updateWorldMatrix(true,true);
  }
  model.updateMatrixWorld(true);
  solveWaveFeet(r);if(waveRun!==r)return;
  document.getElementById('waveProgress').value=r.finished?1:r.phase%1;
  const percent=Math.max(0,Math.min(100,(pos+r.config.width)/(waveRouteLength(r.config)+2*r.config.width)*100));
  document.getElementById('waveSeek').value=percent;
  document.getElementById('waveSeekValue').textContent=percent.toFixed(1)+'%';
  updateWaveRouteUI(pos);
}
// Bake actual bone rotations (preview deliberately does not write target/current).
function captureWaveTimelinePose(){
  const angles={};
  for(const k of ALL_JOINT_KEYS){
    if(bones[k]&&restQuat[k]){
      const e=new THREE.Euler().setFromQuaternion(restQuat[k].clone().invert().multiply(bones[k].quaternion),'XYZ');
      angles[k]=[R(e.x),R(e.y),R(e.z)];
    }else angles[k]=(poseController.getTarget(k)||[0,0,0]).slice();
  }
  return {angles,body:snapshotBodyTransform()};
}
function waveBakePlan(config,beats,cycles){
  beats=Number(beats);cycles=Number(cycles);
  if(!Number.isFinite(beats)||beats<.25||beats>64||!Number.isInteger(cycles)||cycles<1||cycles>8)
    throw new Error('單程拍數需介於 0.25～64，次數需為 1～8 的整數');
  const passes=(config.direction==='pingpong'?2:1)*cycles;
  const samplesPerPass=Math.ceil(Math.max(32,(waveRouteLength(config)+2*config.width)/config.width*(config.mode==='bipolar'?16:8)));
  if(samplesPerPass*passes>4096)throw new Error('拍點過多，請減少次數或增加波浪寬度');
  return {passes,samplesPerPass,count:samplesPerPass*passes,totalBeats:beats*passes,stepBeats:beats/samplesPerPass};
}
function bakeWaveToTimeline(updateSelected=false){
  updateSelected=updateSelected===true;
  const replacing=updateSelected?waveClips.find(c=>c.id===waveClipSelected):null;
  const status=document.getElementById('waveBakeStatus');
  const say=message=>status.textContent=message;
  if(kfPlaying){say('請先停止時間軸播放');return;}
  if(waveRun){say('請先停止 Waving 預覽，再加入時間軸');return;}
  const conflict=waveConflict();if(conflict){say(conflict);return;}
  if(!model){say('請等待角色載入');return;}
  if(!updateSelected&&waveClips.length>=128){say('最多 128 個 WAVING 區塊');return;}
  if(updateSelected&&!replacing){say('請先選取 WAVING 區塊');return;}
  const selected=!replacing&&document.getElementById('waveBakePlacement').value==='selected';
  if(selected&&!(kfEditingIndex>=0&&kfEditingIndex<keyframes.length)){say('請先在時間軸選取一個拍點');return;}
  let plan;
  try{plan=waveBakePlan(waveConfig,document.getElementById('waveBakeBeats').value,document.getElementById('waveBakeCycles').value);}
  catch(e){say(e.message);return;}
  const index=keyframes.length?(selected?kfEditingIndex:keyframes.length-1):-1;
  const startBeat=replacing?replacing.start:(selected?keyframeStartBeat(index):Math.max(beatGridPoseTotalBeats(),waveTrackEnd()));
  if(waveClipOverlap(startBeat,plan.totalBeats,replacing?.id)){say('此位置已有 WAVING 區塊，請移動原區塊或選擇尾端加入');return;}
  const oldFrame=index>=0?JSON.parse(JSON.stringify(keyframes[index])):null;
  const saved={body:snapshotBodyTransform(),bones:{},...poseController.snapshotState()};
  for(const k of ALL_JOINT_KEYS)if(bones[k])saved.bones[k]=bones[k].quaternion.clone();
  const frames=[];let error=null,clipKeys=[],clipFeet=null;
  const savedKfIndex=kfIndex;
  try{
    if(keyframes.length)waveBaseAtBeat(startBeat);
    startWave();const run=waveRun;
    if(!run)throw new Error(document.getElementById('waveStatus').textContent||'無法建立 Waving');
    run.playing=false;run.config.repeat='loop';
    clipKeys=Object.keys(run.base);
    const metadata={id:'wave_'+Date.now()+'_'+Math.random().toString(36).slice(2),config:cleanWave(waveConfig)};
    if(run.ground)metadata.feet=run.ground.feet.map(f=>({keys:f.keys.slice(),position:f.position.toArray(),quaternion:f.quaternion.toArray(),pole:f.pole.toArray(),min:f.min,max:f.max}));
    clipFeet=metadata.feet||null;
    for(let i=0;i<=plan.count;i++){
      run.phase=i/plan.samplesPerPass;tickWave(performance.now());
      if(waveRun!==run)throw new Error(document.getElementById('waveStatus').textContent||'腳掌固定失敗');
      const frame=captureWaveTimelinePose();
      frame.beats=plan.stepBeats;frame.easing='linear';
      if(i<plan.count)frame.waveBake=metadata;
      if(i===0)frame.label=oldFrame?.label||'🌊 Waving';
      frames.push(frame);
    }
  }catch(e){error=e;}
  finally{
    stopWave();applyBodyTransform(saved.body);
    for(const [k,q]of Object.entries(saved.bones))bones[k].quaternion.copy(q);
    poseController.restoreState(saved);
    model.updateMatrixWorld(true);kfIndex=savedKfIndex;
  }
  if(error){say('未加入：'+error.message);return;}
  const clip={id:replacing?.id||makeLibId(),start:startBeat,beats:plan.totalBeats,
    cycles:Number(document.getElementById('waveBakeCycles').value),config:cleanWave(waveConfig),
    fadeIn:Math.min(replacing?.fadeIn||.5,plan.totalBeats/2),fadeOut:Math.min(replacing?.fadeOut||.5,plan.totalBeats/2),
    keys:clipKeys,feet:clipFeet,frames:frames.map(f=>({angles:f.angles,body:f.body}))};
  pushHistory();
  if(!keyframes.length)keyframes.push({angles:waveClone(frames[0].angles),body:waveClone(frames[0].body),beats:1,easing:'linear',label:'Waving 基礎姿勢'});
  if(replacing)waveClips[waveClips.indexOf(replacing)]=clip;else waveClips.push(clip);
  waveClips.sort((a,b)=>a.start-b.start);waveClipSelected=clip.id;
  kfEditingIndex=-1;kfMultiSelected.clear();grooveMultiSelected.clear();grooveSeqSelectedIndex=-1;
  renderKeyframeChips();pushHistory();scheduleAutoSave();
  waveTrackMessage((replacing?'已更新':'已加入')+' WAVING 區塊：'+plan.totalBeats+' 拍，起點 Beat '+(startBeat+1)+'。');
}

function applyBakedWaveFeet(frame){
  const raw=frame.waveBake?.feet;
  if(!Array.isArray(raw)||raw.length!==2)return;
  const feet=[];
  for(const f of raw){
    if(!Array.isArray(f.keys)||f.keys.length!==3||!f.keys.every(k=>bones[k]))return;
    if(![f.position,f.pole].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))||!Array.isArray(f.quaternion)||f.quaternion.length!==4||!f.quaternion.every(Number.isFinite)||!Number.isFinite(f.min)||!Number.isFinite(f.max))return;
    feet.push({...f,position:new THREE.Vector3().fromArray(f.position),pole:new THREE.Vector3().fromArray(f.pole),quaternion:new THREE.Quaternion().fromArray(f.quaternion)});
  }
  solveWaveFeet({ground:{feet,position:model.position.clone()}},()=>{});
}
function isBakedWavePlaying(){return waveTrackActive||(kfPlaying&&!!keyframes[kfIndex]?.waveBake);}

function restoreWave(value){stopWave();waveConfig=cleanWave(value);waveUI('就緒 · 設定已還原');}
function bindWave(){
  bindWaveTrack();
  document.getElementById('waveBakeBtn').onclick=bakeWaveToTimeline;
  document.getElementById('waveBakeUseTiming').onclick=()=>{
    document.getElementById('waveBakeBeats').value=Math.max(.25,Math.min(64,waveConfig.beats/waveConfig.speed));
  };
  document.getElementById('waveBakeOpenTimeline').onclick=()=>document.querySelector('.tabBtn[data-tab="keyframe"]').click();
  for(const [id,key]of [['waveStartNode','startNode'],['waveEndNode','endNode']]){
    const el=document.getElementById(id);
    for(const [value,,label]of WAVE_ROUTE_NODES){const option=document.createElement('option');option.value=value;option.textContent=label;el.appendChild(option);}
    el.onchange=e=>{
      if(waveRun){waveUI();return;}
      const other=key==='startNode'?'endNode':'startNode';
      if(e.target.value===waveConfig[other]){waveUI('起點與終點不可相同，請選另一個節點');return;}
      pushHistory();waveConfig=cleanWave({...waveConfig,[key]:e.target.value});waveUI();pushHistory();scheduleAutoSave();
    };
  }
  const speedSlider=document.getElementById('waveSpeed');let speedEditing=false;
  speedSlider.oninput=e=>{
    if(!speedEditing){pushHistory();speedEditing=true;}
    setWaveSpeed(e.target.value);
  };
  const commitSpeed=()=>{if(speedEditing){pushHistory();speedEditing=false;}};
  speedSlider.onchange=commitSpeed;speedSlider.onblur=commitSpeed;
  document.getElementById('waveSpeedReset').onclick=()=>{commitSpeed();pushHistory();setWaveSpeed(1);pushHistory();};
  document.getElementById('waveSeek').oninput=e=>seekWave(e.target.value);
  for(const [id,key]of Object.entries(WAVE_GAIN_FIELDS)){
    const el=document.getElementById('wave'+id);let editing=false;
    el.oninput=e=>{
      if(!editing){pushHistory();editing=true;}
      waveConfig=cleanWave({...waveConfig,[key]:Number(e.target.value)});
      if(waveRun){waveRun.config[key]=waveConfig[key];tickWave(performance.now());}
      waveUI();scheduleAutoSave();
    };
    const commit=()=>{if(editing){pushHistory();editing=false;}};
    el.onchange=commit;el.onblur=commit;
  }

  for(const [id,key]of Object.entries({Mode:'mode',Polarity:'polarity',Shape:'shape',Route:'route',Direction:'direction',Repeat:'repeat',Amplitude:'amplitude',Width:'width',Beats:'beats',Fingers:'fingers'})){
    document.getElementById('wave'+id).onchange=e=>{if(waveRun)return;pushHistory();waveConfig=cleanWave({...waveConfig,[key]:key==='fingers'?e.target.checked:e.target.value});waveUI();pushHistory();scheduleAutoSave();};
  }
  document.getElementById('wavePlay').onclick=startWave;
  document.getElementById('wavePause').onclick=()=>{tickWave(performance.now());if(waveRun)waveRun.playing=false;waveUI('已暫停 · 可繼續或停止還原');};
  document.getElementById('waveStop').onclick=()=>stopWave();waveUI();
}


function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a12);
  scene.fog = new THREE.Fog(0x0a0a12, 12, 26);

  camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
  camera.position.set(0, 1.4, 3.2);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById("canvasHolder").appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x8899ff, 0.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(3, 5, 4);
  scene.add(keyLight);
  const rim = new THREE.DirectionalLight(0xff2f7e, 0.5);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 14;

  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setMode("rotate");
  transformControls.setSpace("local");
  transformControls.setSize(0.7);
  transformControls.setRotationSnap(D(15));
  transformControls.addEventListener("dragging-changed", (e) => {
    controls.enabled = !e.value;
    if (e.value) {
      draggingKey = selectedKey;
    } else {
      draggingKey = null;
      // 若剛放開拖曳的關節，是某條開啟中腿部IK鏈的腳掌（Foot），
      // 重新抓取當下世界旋轉當作新的鎖存基準，讓使用者的手動微調保留下來，
      // 而不是下一幀就被舊的鎖存值蓋回去。
      for (const limb of ["rLeg", "lLeg"]){
        if (ikEnabled[limb] && selectedKey === IK_CHAINS[limb].end) captureFootLock(limb);
      }
      suppressClick = true;
      setTimeout(() => suppressClick = false, 80);
      pushHistory();
    }
  });
  transformControls.addEventListener("objectChange", () => {
    if (selectedKey) commitFromBone(selectedKey);
  });
  scene.add(transformControls);

  // IK 目標球／極向球專用的平移控制環（跟關節旋轉環分開，模式固定為 translate）
  transformControlsIK = new TransformControls(camera, renderer.domElement);
  transformControlsIK.setMode("translate");
  transformControlsIK.setSpace("world");
  transformControlsIK.setSize(0.7);
  transformControlsIK.addEventListener("dragging-changed", (e) => {
    controls.enabled = !e.value;
    if(selectedIK?.role==='laPoint'){
      if(e.value){pushHistory();laCustomDrag={center:laCustomCenter()};}
      else {laCustomDrag=null;renderLACustomList();pushHistory();scheduleAutoSave();}
    }
    const handName=selectedIK?.limb?.startsWith('lookAt_')?selectedIK.limb.slice(7):null;
    if(LOOKAT_RANGE_NAMES.includes(handName)){
      if(!e.value){if(HAND_AIM_NAMES.includes(handName))solveHandAim(handName);else solveLookAt(handName);}
      pushHistory();if(e.value)beginHandRangeDrag(handName);else {handRangeDrag=null;scheduleAutoSave();}
    }
    if(e.value) beginPoleDrag();
    else if(poleDrag){const changed=!poleDrag.blocked;poleDrag=null;if(changed){pushHistory();scheduleAutoSave();}}
    if (footPlantEnabled) {
      if (!e.value) solveFootPlant();
      pushHistory();
      if (!e.value) scheduleAutoSave();
    }
    if (!e.value) {
      suppressClick = true;
      setTimeout(() => suppressClick = false, 80);
    }
  });
  // 身體移動：拖曳的是bodyGizmoProxy（放在Hips高度），不是model本身，
  // 這裡把每次拖曳造成的位移量(delta)同步套用到model.position，
  // 讓控制環視覺上停在髖部，但實際移動的是整個角色。
  transformControlsIK.addEventListener("objectChange", () => {
    clampPoleDrag();
    clampHandRangeDrag();
    dragLACustom();
    if (selectedIK && selectedIK.limb === "body" && bodyGizmoProxy && bodyProxyLastPos){
      const delta = bodyGizmoProxy.position.clone().sub(bodyProxyLastPos);
      model.position.add(delta);
      model.updateWorldMatrix(true, true);
      bodyProxyLastPos.copy(bodyGizmoProxy.position);
    } else if (selectedIK && selectedIK.role === "trajPoint"){
      updateTrajVisual(selectedIK.limb);
    }
  });
  scene.add(transformControlsIK);

  bodyGizmoProxy = new THREE.Object3D();
  scene.add(bodyGizmoProxy);

  window.addEventListener("resize", onResize);
  setupPickRaycaster();

  loadModel();
  requestAnimationFrame(animate);
}

function loadModel(){
  const loader = new GLTFLoader();
  loader.load(MODEL_URL, (gltf) => {
    model = gltf.scene;

    const targetHeight = 1.75;
    modelHeight = targetHeight;
    placeModelOnGround(model, targetHeight);

    scene.add(model);
    scene.add(new THREE.GridHelper(20, 20, 0x2a2a55, 0x1a1a33));

    model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });

    for (const key of ALL_JOINT_KEYS){
      bones[key] = findBone(model, BONE_SUFFIXES[key]);
      if (!bones[key]) console.warn("找不到骨骼:", BONE_SUFFIXES[key]);
    }
    for (const key of ALL_JOINT_KEYS){
      if (bones[key]) restQuat[key] = bones[key].quaternion.clone();
    }
    buildOnionGhosts();

    // 手指IK effector：優先找指尖第4節骨（只讀位置，不開放FK），模型萬一沒有這根骨頭，
    // 優雅退回用第3節自己當effector，只是精準度變差、不會整個壞掉。
    for (const fingerId of FINGER_IDS){
      const chain = FINGER_IK_CHAINS[fingerId];
      let tipBone = findBone(model, chain.tipSuffix);
      if (!tipBone){
        console.warn("找不到指尖骨骼(" + chain.tipSuffix + ")，" + chain.label + " IK 退回用第3節自身當effector，精準度會變差");
        tipBone = bones[chain.bones[2]];
      }
      fingerEffectorBones[fingerId] = tipBone;
    }

    // 記錄置中/貼地完成後的初始位置，供「重置身體位置」使用
    defaultModelPosition = model.position.clone();
    defaultModelQuaternion = model.quaternion.clone();

    calibrateFootGround();
    buildJointMarkers();
    buildSkeletonLines();
    buildHandCollisionVizMeshes();
    buildIKMarkers();
    buildSpineIKMarker();
    buildLookAtMarkers();
    buildTrajMarkers();
    buildFingerIKMarkers();
    buildFingerPanel();
    buildJointLimitPanel();
    buildOverviewPanel();
    buildJsonRefTable();
    rebuildIKDrivenKeys(); // 防呆：初始四個開關都是 false，理論上等於空集合，但不依賴這個假設

    // 扶握箱核心：依賴用「讀取用函式」注入，不直接傳物件參照，
    // 避免主程式之後改變 bones/ikTargetMeshes 時，核心還抱著舊的參照。
    grabBoxCore = createGrabBoxCore({
      scene, camera, renderer,
      orbitControls: controls,
      getModel: () => model,
      getBones: () => bones,
      getHandBone: (limb) => bones[IK_CHAINS[limb]?.end],
      getIKTargetMesh: (limb) => ikTargetMeshes[limb],
      isIKEnabled: (limb) => ikEnabled[limb],
      setIKEnabled: (limb, on) => setIKEnabled(limb, on),
    });
    grabBoxCore.buildAfterModelLoad();

    controls.target.set(0, targetHeight * 0.55, 0);
    camera.position.set(0, targetHeight * 0.75, targetHeight * 1.6);
    controls.update();

    // 用實際量測到的包圍盒重新套用一次「正面」視角，確保初始畫面就能完整照到全身
    // （包含手臂張開的寬度等，不只是單純用身高比例粗估），瞬間套用不做過渡動畫。
    goToCameraPreset("front", true);
    controls.update();

    resetPose();
    bindTopUI();
    tryLoadAutosave();
    renderKeyframeChips();
    pushHistory();

    document.getElementById("loading").style.display = "none";
    // #ui 的顯示/隱藏（flex/none）已由 bindTopUI() 內的 initUIVisibility() 依 localStorage 設定好，這裡不再覆蓋
  }, undefined, (err) => {
    document.getElementById("loading").textContent = "模型載入失敗，請檢查網路連線";
    console.error(err);
  });
}

// 必須在套用任何姿勢之前（緊接在 restQuat 算完之後）就複製，這樣殘影骨架的初始本地旋轉
// 才會等於真正的 bind pose，之後直接沿用主模型的 restQuat 幫殘影套姿勢即可，不用另外存一份。
function buildOnionGhosts(){
  const configs = [
    { key:"prev", color:0x33ccff }, // 上一拍：青色
    { key:"next", color:0xff44cc }  // 下一拍：洋紅
  ];
  for (const cfg of configs){
    const ghost = skeletonClone(model);
    ghost.traverse(o => {
      if (o.isMesh){
        o.frustumCulled = false;
        o.material = new THREE.MeshBasicMaterial({
          color: cfg.color, transparent:true, opacity:0.26,
          depthWrite:false, side:THREE.DoubleSide
        });
        o.renderOrder = 500;
      }
    });
    for (const key of ALL_JOINT_KEYS){
      const b = findBone(ghost, BONE_SUFFIXES[key]);
      if (b) ghostBones[cfg.key][key] = b;
    }
    ghost.visible = false;
    scene.add(ghost);
    if (cfg.key === "prev") ghostPrev = ghost; else ghostNext = ghost;
  }
}

// 把某份殘影骨架套成某個拍點(kf)記錄的角度＋身體位置
function poseGhostFromKeyframe(which, kf){
  const ghost = which === "prev" ? ghostPrev : ghostNext;
  const gb = ghostBones[which];
  if (!ghost || !kf) return;
  for (const key of ALL_JOINT_KEYS){
    const bone = gb[key];
    if (!bone || !restQuat[key]) continue;
    const angles = kf.angles[key] || [0,0,0];
    bone.quaternion.copy(restQuat[key]).multiply(eulerToQuat(angles));
  }
  if (kf.body){
    ghost.position.fromArray(kf.body.position);
    ghost.quaternion.fromArray(kf.body.quaternion);
  }
  ghost.updateMatrixWorld(true);
}

// 是否目前正在看「時間軸」分頁——只有在這個分頁殘影才有意義，切到別的分頁（例如手腳IK）
// 顯示兩層半透明殘影反而會干擾操作，所以離開時自動隱藏。
function isKeyframeTabActive(){
  const panel = document.getElementById("tabKeyframe");
  return !!(panel && panel.classList.contains("active"));
}

// 決定殘影目前該不該顯示、顯示哪個拍點的姿勢。呼叫時機：拍點清單重繪時（見
// renderKeyframeChips 尾端）與切換分頁時（見 switchTab），涵蓋新增/更新/刪除/選取拍點、
// Undo/Redo、自動存檔還原、拍點播放開始/結束等幾乎所有會影響「目前選取拍點」的情況；
// 播放中則額外由 updateKeyframePlayback() 在每次換到下一個過渡區段時呼叫一次（見該函式），
// 不是每幀都呼叫——播放中殘影姿勢只在「跨到下一拍」那一刻才會變，沒必要逐幀重算。
function updateOnionSkins(){
  if (!ghostPrev || !ghostNext) return;
  if (kfPlaying){
    updateOnionSkinsForPlayback();
    return;
  }
  const show = onionSkinEnabled && isKeyframeTabActive() && kfEditingIndex >= 0 && keyframes.length > 1;
  if (!show){
    ghostPrev.visible = false;
    ghostNext.visible = false;
    return;
  }
  const prevKf = keyframes[kfEditingIndex - 1];
  const nextKf = keyframes[kfEditingIndex + 1];
  if (prevKf){ poseGhostFromKeyframe("prev", prevKf); ghostPrev.visible = true; }
  else ghostPrev.visible = false;
  if (nextKf){ poseGhostFromKeyframe("next", nextKf); ghostNext.visible = true; }
  else ghostNext.visible = false;
}

// 播放模式下的殘影：此時主模型本身正在 frameA(=keyframes[kfIndex]) → frameB(=keyframes[kfIndex+1])
// 之間即時補間，這兩拍不需要殘影（模型正在顯示它們之間的過渡姿勢），所以殘影改往「再更外一層」
// 顯示：prev＝過渡起點的前一拍、next＝過渡終點的後一拍，讓使用者能預先看到動作接下來會往哪個
// 方向甩，形成一段可視化的動作軌跡，而不是編輯模式那種「單一拍點的前後對照」。
function updateOnionSkinsForPlayback(){
  const show = onionSkinEnabled && isKeyframeTabActive() && keyframes.length > 1;
  if (!show){
    ghostPrev.visible = false;
    ghostNext.visible = false;
    return;
  }
  const prevKf = keyframes[kfIndex - 1];
  const nextKf = keyframes[kfIndex + 2];
  if (prevKf){ poseGhostFromKeyframe("prev", prevKf); ghostPrev.visible = true; }
  else ghostPrev.visible = false;
  if (nextKf){ poseGhostFromKeyframe("next", nextKf); ghostNext.visible = true; }
  else ghostNext.visible = false;
}

// ---- 關節球（直接掛在骨骼上的可點擊 marker） ----
function buildJointMarkers(){
  // 修正 Xbot 身高後，維持舊版關節球相對角色的視覺比例。
  const markerSizeRatio = modelHeight / 4.600099111737363;
  const geo = new THREE.SphereGeometry(0.03 * markerSizeRatio, 14, 14);
  // 手指骨節間距很小，用原本身體關節球半徑會讓相鄰指節重疊難點選，改用更小半徑＋不同顏色區分
  const fingerGeo = new THREE.SphereGeometry(0.012 * markerSizeRatio, 10, 10);
  for (const key of ALL_JOINT_KEYS){
    if (!bones[key]) continue;
    const isFinger = FINGER_JOINT_KEY_SET.has(key);
    const mat = new THREE.MeshBasicMaterial({ color: isFinger ? 0xffa8e8 : 0x7fe0ff, transparent:true, opacity:0.9, depthTest:false });
    const marker = new THREE.Mesh(isFinger ? fingerGeo : geo, mat);
    marker.renderOrder = 999;
    marker.userData.jointKey = key;
    marker.userData.pickType = "joint";
    scene.add(marker);
    markerMeshes[key] = marker;
  }
}

// 共用暫存向量，避免每幀呼叫都 new 一個新的 Vector3（跟碰撞/CCD等熱路徑同一套習慣）。
const _markerV = new THREE.Vector3();
function updateMarkers(){
  // 兩個分類開關都關閉時，49 顆關節球全部不可見：只需要隱藏一次，
  // 不必逐一呼叫 getWorldPosition()（要沿骨骼鏈往上算世界矩陣，不是免費的）。
  if (!showHandJoints && !showBodyJoints){
    for (const key in markerMeshes) markerMeshes[key].visible = false;
    return;
  }
  for (const key in markerMeshes){
    if (!bones[key]) continue;
    const marker = markerMeshes[key];
    // 最終顯示 = 分類開關（手部/身體）開著 AND 沒有被 IK 接管而隱藏
    const isHand = FINGER_JOINT_KEY_SET.has(key);
    const categoryOn = isHand ? showHandJoints : showBodyJoints;
    marker.visible = categoryOn && !markerIKHidden[key];
    if (!marker.visible) continue; // 不可見就不必更新座標，省下這顆球的世界矩陣運算
    bones[key].getWorldPosition(_markerV);
    marker.position.copy(_markerV);
  }
}

// ---- 骨架連線（把有追蹤的關節依真實骨骼親子關係連成一條條線段）----
// 不是每個 ALL_JOINT_KEYS 的骨骼在模型階層裡都直接互為親子（例如中間可能夾著沒被追蹤的
// 輔助骨），所以每個關節往上找「最近一個也在 bones{} 追蹤清單裡的祖先」當作連線對象，
// 而不是直接假設 bone.parent 一定也是我們認得的 key。
function buildSkeletonLines(){
  const boneKeyByUuid = {};
  for (const key of ALL_JOINT_KEYS){
    if (bones[key]) boneKeyByUuid[bones[key].uuid] = key;
  }
  const pairs = [];
  for (const key of ALL_JOINT_KEYS){
    const bone = bones[key];
    if (!bone) continue;
    let p = bone.parent;
    while (p){
      const parentKey = boneKeyByUuid[p.uuid];
      if (parentKey){ pairs.push([key, parentKey]); break; }
      p = p.parent;
    }
  }
  skeletonLinePairs = pairs;
  const positions = new Float32Array(pairs.length * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x7fe0ff, transparent:true, opacity:0.55, depthTest:false });
  skeletonLines = new THREE.LineSegments(geo, mat);
  skeletonLines.renderOrder = 998; // 略低於關節球（999），視覺上線段在球體「後面」一點
  skeletonLines.frustumCulled = false;
  scene.add(skeletonLines);
}

function updateSkeletonLines(){
  if (!skeletonLines) return;
  skeletonLines.visible = showSkeleton;
  if (!showSkeleton) return;
  const posAttr = skeletonLines.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < skeletonLinePairs.length; i++){
    const [childKey, parentKey] = skeletonLinePairs[i];
    bones[childKey].getWorldPosition(v);
    posAttr.setXYZ(i*2, v.x, v.y, v.z);
    bones[parentKey].getWorldPosition(v);
    posAttr.setXYZ(i*2+1, v.x, v.y, v.z);
  }
  posAttr.needsUpdate = true;
}

// 切換「身體」或「手部」關節球分類的顯示開關；實際可見與否在 updateMarkers() 每幀合併 IK 隱藏狀態計算
function setJointCategoryVisible(category, on){
  if (category === "hand") showHandJoints = on;
  else showBodyJoints = on;
}

function highlightMarkers(){
  for (const key in markerMeshes){
    const m = markerMeshes[key];
    const isSel = key === selectedKey;
    const isFinger = FINGER_JOINT_KEY_SET.has(key);
    m.material.color.set(isSel ? 0xff2f7e : (isFinger ? 0xffa8e8 : 0x7fe0ff));
    m.scale.setScalar(isSel ? 1.6 : 1.0);
  }
  highlightFingerButtons();
  highlightOverviewRows();
}

// ---- 關節總覽面板：即時列出全部關節的旋轉角度（相對初始姿勢）與世界座標 ----
// 設計取捨：面板本身只在切到這個分頁時才逐幀更新文字內容（見 updateOverviewPanel 開頭的
// active 檢查），避免每個關節×6個數字×60fps 一直寫在使用者根本沒看的隱藏分頁上浪費效能。
function ovMatchesFilter(key){
  const input = document.getElementById("ovFilterInput");
  const kw = (input && input.value ? input.value : "").trim().toLowerCase();
  if (!kw) return true;
  const label = (LABEL_LOOKUP[key] || key).toLowerCase();
  return label.includes(kw) || key.toLowerCase().includes(kw);
}

// 重新整個重建面板 DOM（篩選條件、非零開關、展開/收合、模型剛載入完成時呼叫）；
// 逐幀更新數值走 updateOverviewPanel()，不會呼叫這支，避免每幀重建 DOM。
function buildOverviewPanel(){
  const container = document.getElementById("overviewGroups");
  const emptyHint = document.getElementById("overviewEmpty");
  if (!container) return;
  container.innerHTML = "";
  overviewRowEls = {};
  const onlyNonZero = document.getElementById("ovOnlyNonZero")?.checked;

  for (const group of OVERVIEW_GROUPS){
    const keys = group.keys.filter(k => bones[k] && ovMatchesFilter(k));
    if (keys.length === 0) continue;

    const body = document.createElement("div");
    const collapsed = overviewGroupCollapsed[group.id] ?? !!group.collapsedByDefault;
    body.className = "ovGroupBody" + (collapsed ? " collapsed" : "");

    for (const key of keys){
      if (onlyNonZero){
        const a = poseController.getTarget(key) || [0,0,0];
        if (Math.abs(a[0]) < 0.05 && Math.abs(a[1]) < 0.05 && Math.abs(a[2]) < 0.05) continue;
      }
      const row = document.createElement("div");
      row.className = "ovRow" + (key === selectedKey ? " selected" : "");
      row.dataset.jointkey = key;

      const nameEl = document.createElement("span");
      nameEl.className = "ovName";
      nameEl.textContent = LABEL_LOOKUP[key] || key;
      nameEl.title = LABEL_LOOKUP[key] || key;

      const rotX = document.createElement("span"); rotX.className = "ovRot";
      const rotY = document.createElement("span"); rotY.className = "ovRot";
      const rotZ = document.createElement("span"); rotZ.className = "ovRot";
      const divider = document.createElement("span"); divider.className = "ovDivider";
      const posX = document.createElement("span"); posX.className = "ovPos";
      const posY = document.createElement("span"); posY.className = "ovPos";
      const posZ = document.createElement("span"); posZ.className = "ovPos";

      row.append(nameEl, rotX, rotY, rotZ, divider, posX, posY, posZ);
      row.onclick = () => selectJoint(key);
      body.appendChild(row);
      overviewRowEls[key] = { row, rot:[rotX, rotY, rotZ], pos:[posX, posY, posZ] };
    }

    if (body.children.length === 0) continue; // onlyNonZero 把整組濾光了，這組標題也不顯示

    const groupEl = document.createElement("div");
    groupEl.className = "ovGroup";
    const head = document.createElement("div");
    head.className = "ovGroupHead" + (collapsed ? " collapsed" : "");
    head.innerHTML = `<span><span class="ovCaret">▾</span>${group.label}</span><span class="ovCount">${body.children.length} 個關節</span>`;
    head.onclick = () => {
      const nowCollapsed = !body.classList.contains("collapsed");
      body.classList.toggle("collapsed", nowCollapsed);
      head.classList.toggle("collapsed", nowCollapsed);
      overviewGroupCollapsed[group.id] = nowCollapsed;
    };
    groupEl.append(head, body);
    container.appendChild(groupEl);
  }

  if (emptyHint) emptyHint.style.display = Object.keys(overviewRowEls).length === 0 ? "" : "none";
  updateOverviewPanel(true); // 建完立刻填一次數值，不用等下一幀 animate() 才刷新
}

// 逐幀呼叫：只在「關節總覽」分頁目前為作用中分頁時才真的更新文字內容（force=true 時無條件更新，
// 給 buildOverviewPanel 重建完 DOM 後立刻顯示正確數值用，避免切換分頁那一瞬間看到舊值或空白）。
function updateOverviewPanel(force){
  const panel = document.getElementById("tabOverview");
  if (!panel || (!force && !panel.classList.contains("active"))) return;
  const v = new THREE.Vector3();
  for (const key in overviewRowEls){
    const bone = bones[key];
    if (!bone) continue;
    const els = overviewRowEls[key];
    const a = poseController.getTarget(key) || [0,0,0];
    els.rot[0].textContent = a[0].toFixed(1);
    els.rot[1].textContent = a[1].toFixed(1);
    els.rot[2].textContent = a[2].toFixed(1);
    bone.getWorldPosition(v);
    els.pos[0].textContent = v.x.toFixed(2);
    els.pos[1].textContent = v.y.toFixed(2);
    els.pos[2].textContent = v.z.toFixed(2);
  }
}

// 跟 highlightFingerButtons 同一批呼叫時機（見 highlightMarkers），選取狀態改變時同步反白總覽面板列
function highlightOverviewRows(){
  for (const key in overviewRowEls){
    overviewRowEls[key].row.classList.toggle("selected", key === selectedKey);
  }
}

function bindOverviewUI(){
  const filterInput = document.getElementById("ovFilterInput");
  const onlyNonZero = document.getElementById("ovOnlyNonZero");
  const expandBtn = document.getElementById("ovExpandAllBtn");
  const collapseBtn = document.getElementById("ovCollapseAllBtn");
  if (filterInput) filterInput.oninput = () => buildOverviewPanel();
  if (onlyNonZero) onlyNonZero.onchange = () => buildOverviewPanel();
  if (expandBtn) expandBtn.onclick = () => { OVERVIEW_GROUPS.forEach(g => overviewGroupCollapsed[g.id] = false); buildOverviewPanel(); };
  if (collapseBtn) collapseBtn.onclick = () => { OVERVIEW_GROUPS.forEach(g => overviewGroupCollapsed[g.id] = true); buildOverviewPanel(); };
}

// 手指面板按鈕的選取回饋（跟 highlightMarkers 同一批呼叫時機：selectJoint/deselectJoint/
// selectIKMarker/selectBodyMarker 都會呼叫 highlightMarkers，這裡搭便車一起更新）
function highlightFingerButtons(){
  document.querySelectorAll(".fingerJointBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.jointkey === selectedKey);
  });
}

// ---- 手腳 IK：目標球（橙色）＋極向球（黃綠色八面體） ----
function buildIKMarkers(){
  const targetGeo = new THREE.SphereGeometry(0.038, 16, 16);
  const poleGeo = new THREE.OctahedronGeometry(0.032, 0);

  for (const limb of IK_LIMB_KEYS){
    const targetMat = new THREE.MeshBasicMaterial({ color:0xff8c1a, transparent:true, opacity:0.95, depthTest:false });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.renderOrder = 998;
    targetMesh.visible = false;
    targetMesh.userData.pickType = "ikTarget";
    targetMesh.userData.limb = limb;
    scene.add(targetMesh);
    ikTargetMeshes[limb] = targetMesh;

    const poleMat = new THREE.MeshBasicMaterial({ color:0xccff33, transparent:true, opacity:0.95, depthTest:false });
    const poleMesh = new THREE.Mesh(poleGeo, poleMat);
    poleMesh.renderOrder = 998;
    poleMesh.visible = false;
    poleMesh.userData.pickType = "ikPole";
    poleMesh.userData.limb = limb;
    scene.add(poleMesh);
    ikPoleMeshes[limb] = poleMesh;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const lineMat = new THREE.LineBasicMaterial({ color:0xccff33, transparent:true, opacity:0.5, depthTest:false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 997;
    line.visible = false;
    scene.add(line);
    ikPoleLines[limb] = line;

    syncIKMarkersToDefault(limb);
  }
}

// 把某肢體的目標球／極向球對齊「目前姿勢」算出的預設位置（開啟 IK 當下、或按重置時呼叫，避免瞬間跳動）
function syncIKMarkersToDefault(limb){
  const chain = IK_CHAINS[limb];
  const endBone = bones[chain.end];
  const midBone = bones[chain.mid];
  if (!endBone || !midBone) return;

  const rootBone = bones[chain.root];
  const rootPos = new THREE.Vector3();
  const midPos = new THREE.Vector3();
  const endPos = new THREE.Vector3();
  if (rootBone) rootBone.getWorldPosition(rootPos);
  midBone.getWorldPosition(midPos);
  endBone.getWorldPosition(endPos);

  // 目標球：對齊目前手掌/腳掌的世界座標
  ikTargetMeshes[limb].position.copy(endPos);

  // 極向球：反推「目前 FK 姿勢」實際的彎曲方向（root→mid 相對 root→end 連線的側向分量），
  // 而不是用固定猜測方向 —— 這樣切換 FK→IK 當下的彎曲平面會對齊現有姿勢，不會瞬間跳動。
  // 只有手臂/腿完全打直（沒有側向分量可反推）時才退回用猜測方向。
  let bendDir;
  if (rootBone){
    const toEnd = endPos.clone().sub(rootPos);
    const rootToEndDir = toEnd.lengthSq() > 1e-10 ? toEnd.normalize() : new THREE.Vector3(0, 0, 1);
    const toMid = midPos.clone().sub(rootPos);
    const onAxis = rootToEndDir.clone().multiplyScalar(toMid.dot(rootToEndDir));
    const lateral = toMid.clone().sub(onAxis);
    bendDir = lateral.lengthSq() > 1e-8 ? lateral.normalize() : chain.poleOffset.clone().normalize();
  } else {
    bendDir = chain.poleOffset.clone().normalize();
  }

  const poleDist = Math.min(chain.poleOffset.length(), poleRadius(limb)*0.8);
  ikPoleMeshes[limb].position.copy(midPos.clone().add(bendDir.multiplyScalar(poleDist)));
}

// ---- 脊椎 IK 目標球（藍色實心球）----
function buildSpineIKMarker(){
  const targetGeo = new THREE.SphereGeometry(0.038, 16, 16);
  const targetMat = new THREE.MeshBasicMaterial({ color:0x33ccff, transparent:true, opacity:0.95, depthTest:false });
  const mesh = new THREE.Mesh(targetGeo, targetMat);
  mesh.renderOrder = 998;
  mesh.visible = false;
  mesh.userData.pickType = "spineIKTarget";
  scene.add(mesh);
  spineIKTargetMesh = mesh;
  syncSpineIKMarkerToDefault();
}

// 把脊椎目標球對齊「目前姿勢」頭部所在的世界座標（開啟當下、或按重置時呼叫，避免瞬間跳動）
function syncSpineIKMarkerToDefault(){
  const effectorBone = bones[SPINE_IK_CHAIN.effector];
  if (!effectorBone || !spineIKTargetMesh) return;
  const pos = new THREE.Vector3();
  effectorBone.getWorldPosition(pos);
  spineIKTargetMesh.position.copy(pos);
}

// 開關脊椎 IK：開啟時鎖住 Spine/Spine1/Spine2/Neck（隱藏它們的關節球，改由 CCD 求解），
// Head 自己的旋轉仍保留 FK 可調整（跟手腳 IK 保留末端 FK 是同樣設計）。
function setSpineIKEnabled(on){
  if(waveRun)stopWave();
  spineIKEnabled = on;
  // 緊接在賦值後重建，而不是放函式結尾：下面有跟 setLookAtEnabled 互斥的互相呼叫，
  // 內層呼叫也會各自重建一次。因為 rebuildIKDrivenKeys() 是「整份重算」而非增量更新，
  // 不管誰先誰後、重建幾次，最終結果都等於當下四個開關狀態的正解。
  rebuildIKDrivenKeys();
  if (on) syncSpineIKMarkerToDefault();
  spineIKTargetMesh.visible = on;
  for (const key of SPINE_IK_CHAIN.bones){
    if (markerMeshes[key]) markerIKHidden[key] = on;
  }
  if (on && lookAtEnabled.chest) setLookAtEnabled("chest", false);
  if (!on && selectedIK && selectedIK.limb === "spine") deselectJoint();
  updateSpineIKButton();
}

function calibrateHandAim(name){
  const b=bones[name],side=name[0],index=bones[side+'Index1'],pinky=bones[side+'Pinky1'],middle=bones[side+'Middle1'];
  if(!b||!index||!pinky||!middle)return false;
  b.updateWorldMatrix(true,true);
  const point=x=>b.worldToLocal(x.getWorldPosition(new THREE.Vector3()));
  const forward=point(middle).normalize(),across=point(index).sub(point(pinky)).normalize();
  const normal=new THREE.Vector3().crossVectors(forward,across).multiplyScalar(side==='r'?1:-1);
  if(normal.lengthSq()<1e-8||forward.lengthSq()<1e-8)return false;
  handAimAxes[name]={palm:normal.normalize(),finger:forward};return true;
}
function handAimAxis(name){return handAimAxes[name][handAim[name].mode].clone().multiplyScalar(handAim[name].flip?-1:1);}
function captureHandAim(name){
  if(!handAimAxes[name]&&!calibrateHandAim(name))return false;
  handFollowLast[name]=null;
  bones[name].getWorldQuaternion(handAim[name].reference).normalize();handAim[name].roll=0;
  LOOKAT_CONFIG[name].localForward.copy(handAimAxis(name));return true;
}
function handFollowDirection(name,pos){
  const other=name==='rHand'?'lHand':'rHand',bone=bones[other];
  if(!bone)return null;
  const point=bone.getWorldPosition(new THREE.Vector3());lookAtTargetMesh[name].position.copy(point);
  const dir=point.sub(pos),distance=dir.length();
  // Keep the last direction inside 0.01; resume beyond 0.015 to avoid boundary jitter.
  const threshold=handFollowLast[name]?.near?0.015:0.01;
  if(distance<threshold){
    if(!handFollowLast[name])handFollowLast[name]={dir:handAimAxis(name).applyQuaternion(bones[name].getWorldQuaternion(new THREE.Quaternion())).normalize(),near:true};
    handFollowLast[name].near=true;return handFollowLast[name].dir.clone();
  }
  dir.normalize();handFollowLast[name]={dir:dir.clone(),near:false};return dir;
}
function updateHandFollowUI(){
  for(const name of HAND_AIM_NAMES){
    const select=document.getElementById('handFollowSource_'+name);if(!select)continue;
    const other=name==='rHand'?'lHand':'rHand',bound=handFollowSource[name]==='other';
    select.value=handFollowSource[name];select.querySelector('option[value="other"]').disabled=!bones[other];
    for(const prefix of ['handRangeMin_','handRangeMax_','handRangeDefault_'])document.getElementById(prefix+name).disabled=bound;
    document.getElementById('handFollowStatus_'+name).textContent=bound?(lookAtEnabled[name]?'追蹤另一手的實際手腕；半徑暫停。':'追蹤已暫停。'):'';
    if(lookAtTargetMesh[name])lookAtTargetMesh[name].visible=lookAtEnabled[name]&&!bound;
  }
}
function bindHandFollowUI(){
  for(const name of HAND_AIM_NAMES)document.getElementById('handFollowSource_'+name).onchange=e=>{
    const next=e.target.value,other=name==='rHand'?'lHand':'rHand';
    if(kfPlaying||!['free','other'].includes(next)||(next==='other'&&!bones[other])){updateHandFollowUI();return;}
    pushHistory();if(selectedIK?.limb==='lookAt_'+name)deselectJoint();handRangeDrag=null;
    handFollowSource[name]=next;handFollowLast[name]=null;
    if(next==='other')setLookAtEnabled(name,true);else syncLookAtMarkerToDefault(name);
    solveHandAim(name);updateHandFollowUI();pushHistory();scheduleAutoSave();
  };
}

// Single-part editor preview. Only configuration is persisted; playback never auto-starts.
function sampleLACustom(c,phase){
  const pts=(c.points||[]).map(p=>new THREE.Vector3().fromArray(p));
  if(!pts.length)return new THREE.Vector3();if(pts.length===1)return pts[0];
  const closed=c.closed&&pts.length>=3;
  const cycle=((phase%1)+1)%1,u=closed?cycle:1-Math.abs(2*cycle-1);
  if(c.mode==='curve'&&pts.length>=3)return new THREE.CatmullRomCurve3(pts,closed,'centripetal').getPoint(u);
  const segments=closed?pts.length:pts.length-1,t=u*segments,i=Math.min(Math.floor(t),segments-1);
  return pts[i].clone().lerp(pts[(i+1)%pts.length],t-i);
}
function laCustomCenter(){const bone=bones[LOOKAT_CONFIG[laPathConfig.part]?.key];return bone?bone.getWorldPosition(new THREE.Vector3()):null;}
function selectLACustom(i){
  if(laPathRun||kfPlaying||!laCustomMeshes[i])return;
  transformControls.detach();selectedKey=null;selectedIK={limb:'laCustom',role:'laPoint',index:i};
  transformControlsIK.setMode('translate');transformControlsIK.setSpace('world');transformControlsIK.attach(laCustomMeshes[i]);
  updateSelectedBar();renderLACustomList();
}
function renderLACustomList(){
  const host=document.getElementById('laCustomList');if(!host)return;host.replaceChildren();
  const points=laPathConfig.points||[];
  points.forEach((p,i)=>{
    const group=document.createElement('span'),select=document.createElement('button'),del=document.createElement('button');
    select.textContent='P'+(i+1);select.title=p.map(x=>x.toFixed(3)).join(', ');select.disabled=!!laPathRun;
    select.classList.toggle('active',selectedIK?.role==='laPoint'&&selectedIK.index===i);select.onclick=()=>selectLACustom(i);
    del.textContent='×';del.title='刪除 P'+(i+1);del.disabled=!!laPathRun;del.onclick=()=>mutateLACustom(()=>laPathConfig.points.splice(i,1));
    group.append(select,del);host.append(group);
  });
  if(!points.length)host.textContent='尚無控制點：按「建立方形」開始，或新增控制點。';
}
function rebuildLACustomMeshes(){
  if(selectedIK?.role==='laPoint')deselectJoint();laCustomDrag=null;
  for(const m of laCustomMeshes){scene.remove(m);m.geometry.dispose();m.material.dispose();}laCustomMeshes=[];
  if(!scene)return;
  for(let i=0;i<(laPathConfig.points||[]).length;i++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.022,12,8),new THREE.MeshBasicMaterial({color:0xffaa55,depthTest:false}));
    m.renderOrder=999;m.userData.pickType='laPoint';m.userData.index=i;m.visible=false;scene.add(m);laCustomMeshes.push(m);
  }
  renderLACustomList();updateLACustomVisual();
}
function mutateLACustom(action){
  if(laPathRun||kfPlaying)return;pushHistory();if(selectedIK?.role==='laPoint')deselectJoint();
  if(!laPathConfig.points)laPathConfig.points=[];action();laPathConfig=cleanLAPath(laPathConfig);
  rebuildLACustomMeshes();updateLAPathUI();pushHistory();scheduleAutoSave();
}
function updateLACustomVisual(){
  const visible=!laPathRun&&!kfPlaying&&laPathConfig.shape==='custom'&&document.getElementById('tabLookAt')?.classList.contains('active');
  for(const m of laCustomMeshes)m.visible=visible;
  if(!visible){if(!laPathRun&&laPathLine)laPathLine.visible=false;if(selectedIK?.role==='laPoint')deselectJoint();return;}
  const center=laCustomDrag?.center||laCustomCenter();if(!center)return;
  const offset=new THREE.Vector3(laPathConfig.x,laPathConfig.y,laPathConfig.z);
  laCustomMeshes.forEach((m,i)=>{if(!(laCustomDrag&&selectedIK?.index===i))m.position.fromArray(laPathConfig.points[i]).add(offset).add(center);});
  if(!laPathLine){laPathLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffaa55,transparent:true,opacity:.8,depthTest:false}));scene.add(laPathLine);}
  const range=handAimRange[laPathConfig.part],fallback=handRangeDirection(laPathConfig.part),pts=[];
  for(let i=0;i<=96;i++)pts.push(laPathPoint(laPathConfig,i/96,center,range.min,range.max,fallback));
  laPathLine.geometry.setFromPoints(pts);laPathLine.geometry.computeBoundingSphere();laPathLine.visible=(laPathConfig.points||[]).length>=2;
}
function dragLACustom(){
  if(!laCustomDrag||selectedIK?.role!=='laPoint')return;
  const i=selectedIK.index,m=laCustomMeshes[i];if(!m)return;
  const range=handAimRange[laPathConfig.part];clampHandRangePoint(m.position,laCustomDrag.center,range.min,range.max,handRangeDirection(laPathConfig.part));
  laPathConfig.points[i]=m.position.clone().sub(laCustomDrag.center).sub(new THREE.Vector3(laPathConfig.x,laPathConfig.y,laPathConfig.z)).toArray();
  updateSelectedBar();
}
function bindLACustom(){
  document.getElementById('laCustomMode').onchange=e=>mutateLACustom(()=>laPathConfig.mode=e.target.value);
  document.getElementById('laCustomClosed').onchange=e=>mutateLACustom(()=>laPathConfig.closed=e.target.value==='closed');
  document.getElementById('laCustomSquare').onclick=()=>mutateLACustom(()=>{const r=laPathConfig.size;laPathConfig.points=[[-r,-r,0],[r,-r,0],[r,r,0],[-r,r,0]];laPathConfig.closed=true;});
  document.getElementById('laCustomAdd').onclick=()=>mutateLACustom(()=>{
    if(laPathConfig.points.length>=64)return;
    const p=laPathConfig.points.length?laPathConfig.points.at(-1).slice():[0,0,0];p[0]+=.05;laPathConfig.points.push(p);
  });
}

function cleanLAPath(v){
  const d={part:'rHand',shape:'circle',plane:'xy',size:.12,beats:4,x:0,y:0,z:.25},out={...d};
  for(const [key,values] of Object.entries({part:['rHand','lHand','head','chest'],shape:['circle','horizontal','vertical','custom'],plane:['xy','xz','yz']}))if(values.includes(v?.[key]))out[key]=v[key];
  for(const [key,min,max] of [['size',.001,5],['beats',.25,128],['x',-5,5],['y',-5,5],['z',-5,5]])if(Number.isFinite(v?.[key]))out[key]=Math.min(max,Math.max(min,v[key]));
  out.mode=v?.mode==='curve'?'curve':'line';out.closed=v?.closed===true;
  out.points=Array.isArray(v?.points)?v.points.filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)).slice(0,64).map(p=>p.slice()):[];
  return out;
}
function laPathPoint(c,phase,center,min,max,fallback){
  const t=phase*Math.PI*2,p=new THREE.Vector3(c.x,c.y,c.z);
  if(c.shape==='custom')p.add(sampleLACustom(c,phase));
  else if(c.shape==='horizontal')p.x+=c.size*Math.sin(t);
  else if(c.shape==='vertical')p.y+=c.size*Math.sin(t);
  else {p[c.plane[0]]+=c.size*Math.cos(t);p[c.plane[1]]+=c.size*Math.sin(t);}
  p.add(center);clampHandRangePoint(p,center,min,max,fallback);return p;
}
function updateLAPathUI(){
  const custom=laPathConfig.shape==='custom',panel=document.getElementById('laCustomPanel');
  if(panel){panel.style.display=custom?'':'none';document.getElementById('laCustomMode').value=laPathConfig.mode||'line';document.getElementById('laCustomClosed').value=laPathConfig.closed?'closed':'open';
    for(const id of ['laCustomMode','laCustomClosed','laCustomAdd','laCustomSquare'])document.getElementById(id).disabled=!!laPathRun;renderLACustomList();}

  const fields={Part:'part',Shape:'shape',Plane:'plane',Size:'size',Beats:'beats',X:'x',Y:'y',Z:'z'};
  for(const [id,key] of Object.entries(fields)){const el=document.getElementById('laPath'+id);if(el){el.value=laPathConfig[key];el.disabled=!!laPathRun;}}
  if(custom){document.getElementById('laPathSize').disabled=true;document.getElementById('laPathPlane').disabled=true;}
  const play=document.getElementById('laPathPlay');if(!play)return;
  play.disabled=!!laPathRun?.playing;play.textContent=laPathRun?'▶ 繼續':'▶ 播放預覽';
  document.getElementById('laPathPause').disabled=!laPathRun?.playing;
  document.getElementById('laPathStop').disabled=!laPathRun;
  // Only the owned part is locked. Other parts remain editable.
  for(const n of LOOKAT_RANGE_NAMES){
    const ids=['lookAtBtn_'+n,'handRangeMin_'+n,'handRangeMax_'+n,'handRangeDefault_'+n];
    if(n==='head')ids.push('headFollowSource');
    if(HAND_AIM_NAMES.includes(n))ids.push('handFollowSource_'+n,'handAimMode_'+n,'handAimFlip_'+n,'handAimRoll_'+n,'handAimReset_'+n);
    for(const id of ids){const el=document.getElementById(id);if(el&&laPathRun?.name===n)el.disabled=true;}
  }
}
function stopLAPath(){
  if(!laPathRun)return;
  const n=laPathRun.name;laPathRun=null;if(laPathLine)laPathLine.visible=false;
  // Clear preview locks before restoring normal availability rules.
  for(const el of document.querySelectorAll('#tabLookAt button,#tabLookAt input,#tabLookAt select'))el.disabled=false;
  if(bones[LOOKAT_CONFIG[n].key])syncTargetFromBone(LOOKAT_CONFIG[n].key);
  updateLookAtButtons();updateLAPathUI();
}
function startLAPath(reset=false){
  if(waveRun)stopWave();
  if(laPathConfig.shape==='custom'&&(laPathConfig.points||[]).length<((laPathConfig.closed||laPathConfig.mode==='curve')?3:2)){document.getElementById('laPathStatus').textContent=(laPathConfig.closed||laPathConfig.mode==='curve')?'封閉路徑或平滑曲線至少需要 3 個控制點。':'開放折線至少需要 2 個控制點。';return;}
  if(selectedIK?.role==='laPoint')deselectJoint();

  if(kfPlaying){document.getElementById('laPathStatus').textContent='請先停止時間軸播放，再啟動軌跡預覽。';return;}
  if(laPathRun){if(reset)laPathRun.phase=0;laPathRun.playing=!reset;laPathRun.last=performance.now();updateLAPathUI();return;}
  const n=laPathConfig.part,b=bones[LOOKAT_CONFIG[n].key];
  if(!b||(HAND_AIM_NAMES.includes(n)&&!handAimAxes[n])){document.getElementById('laPathStatus').textContent='模型或所需骨骼尚未就緒。';return;}
  pushHistory();if(selectedIK?.limb==='lookAt_'+n)deselectJoint();handRangeDrag=null;
  if(n==='head')headFollowSource='free';if(HAND_AIM_NAMES.includes(n))handFollowSource[n]='free';
  const roll=handAim[n]?.roll||0;setLookAtEnabled(n,true);if(handAim[n])handAim[n].roll=roll;
  const ref=HAND_AIM_NAMES.includes(n)?handAim[n].reference.clone():b.getWorldQuaternion(new THREE.Quaternion()).normalize();
  const local=HAND_AIM_NAMES.includes(n)?handAimAxis(n):LOOKAT_CONFIG[n].localForward.clone();
  laPathRun={name:n,phase:0,last:performance.now(),playing:!reset,ref,local,roll,range:{...handAimRange[n]},config:cleanLAPath(laPathConfig)};
  solveLAPath(n);updateLookAtButtons();updateLAPathUI();pushHistory();scheduleAutoSave();
  document.getElementById('laPathStatus').textContent='預覽中：路徑跟隨部位平移；橘色路徑已套用內外半徑限制。停止後可修改設定。';
}
function tickLAPath(now){
  if(!laPathRun)return;
  if(kfPlaying){stopLAPath();return;}
  const r=laPathRun;
  if(r.playing)r.phase=(r.phase+Math.max(0,now-r.last)*bpm/(60000*r.config.beats))%1;
  r.last=now;
}
function solveLAPath(name){
  const r=laPathRun;if(!r||r.name!==name)return false;
  const b=bones[LOOKAT_CONFIG[name].key],center=b.getWorldPosition(new THREE.Vector3());
  const forward=r.local.clone().applyQuaternion(r.ref).normalize();
  const point=laPathPoint(r.config,r.phase,center,r.range.min,r.range.max,forward);lookAtTargetMesh[name].position.copy(point);
  const dir=point.clone().sub(center).normalize(),swing=new THREE.Quaternion();
  if(forward.dot(dir)<-1+1e-12){const helper=Math.abs(forward.x)<.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);swing.setFromAxisAngle(new THREE.Vector3().crossVectors(forward,helper).normalize(),Math.PI);}
  else swing.setFromUnitVectors(forward,dir);
  const q=new THREE.Quaternion().setFromAxisAngle(dir,THREE.MathUtils.degToRad(r.roll)).multiply(swing).multiply(r.ref);
  const parent=b.parent?b.parent.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();b.quaternion.copy(parent.invert().multiply(q)).normalize();b.updateWorldMatrix(true,true);syncTargetFromBone(LOOKAT_CONFIG[name].key);
  if(!laPathLine){laPathLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffaa55,transparent:true,opacity:.8,depthTest:false}));laPathLine.renderOrder=990;scene.add(laPathLine);}
  const points=[];for(let i=0;i<=96;i++)points.push(laPathPoint(r.config,i/96,center,r.range.min,r.range.max,forward));
  laPathLine.geometry.setFromPoints(points);laPathLine.geometry.computeBoundingSphere();laPathLine.visible=true;
  return true;
}
function restoreLAPath(v){stopLAPath();laPathConfig=cleanLAPath(v);rebuildLACustomMeshes();updateLAPathUI();}
function bindLAPath(){
  bindLACustom();
  const fields={Part:'part',Shape:'shape',Plane:'plane',Size:'size',Beats:'beats',X:'x',Y:'y',Z:'z'};
  for(const [id,key] of Object.entries(fields))document.getElementById('laPath'+id).onchange=e=>{
    if(laPathRun||kfPlaying){updateLAPathUI();return;}
    const value=['part','shape','plane'].includes(key)?e.target.value:Number(e.target.value);
    if(typeof value==='number'&&(!Number.isFinite(value)||e.target.value.trim()==='')){updateLAPathUI();return;}
    pushHistory();laPathConfig=cleanLAPath({...laPathConfig,[key]:value});rebuildLACustomMeshes();updateLAPathUI();pushHistory();scheduleAutoSave();
  };
  document.getElementById('laPathPlay').onclick=()=>startLAPath();
  document.getElementById('laPathPause').onclick=()=>{tickLAPath(performance.now());if(laPathRun)laPathRun.playing=false;updateLAPathUI();};
  document.getElementById('laPathReset').onclick=()=>{startLAPath(true);if(laPathRun)solveLAPath(laPathRun.name);};
  document.getElementById('laPathStop').onclick=()=>{stopLAPath();pushHistory();scheduleAutoSave();document.getElementById('laPathStatus').textContent='已停止，保留目前姿勢與自由目標位置。';};
  updateLAPathUI();
}

function solveHandAim(name){
  if(solveLAPath(name))return;
  if(!lookAtEnabled[name]||!handAimAxes[name])return;
  const b=bones[name],state=handAim[name],pos=b.getWorldPosition(new THREE.Vector3());
  const dir=handFollowSource[name]==='other'?handFollowDirection(name,pos):lookAtTargetMesh[name].position.clone().sub(pos);if(!dir||dir.lengthSq()<1e-8)return;
  dir.normalize();
  const forward=handAimAxis(name).applyQuaternion(state.reference).normalize();
  const swing=new THREE.Quaternion();
  if(forward.dot(dir)<-1+1e-12){
    const local=handAimAxis(name),helper=Math.abs(local.x)<0.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
    const axis=new THREE.Vector3().crossVectors(local,helper).normalize().applyQuaternion(state.reference).normalize();
    swing.setFromAxisAngle(axis,Math.PI);
  }else swing.setFromUnitVectors(forward,dir);
  const q=new THREE.Quaternion().setFromAxisAngle(dir,THREE.MathUtils.degToRad(state.roll)).multiply(swing).multiply(state.reference);
  const parent=b.parent?b.parent.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();
  b.quaternion.copy(parent.invert().multiply(q)).normalize();b.updateWorldMatrix(true,true);syncTargetFromBone(name);
}
// Limits are an editor interaction constraint, not a change to the animation solver.
function validHandRange(min,max){return Number.isFinite(min)&&Number.isFinite(max)&&min>=0.001&&max>min;}
function clampHandRangePoint(point,center,min,max,fallback){
  const delta=point.clone().sub(center),len=delta.length();
  if(len>1e-10)delta.multiplyScalar(1/len);
  else {delta.copy(fallback);if(delta.lengthSq()<1e-12)delta.set(0,0,1);delta.normalize();}
  point.copy(center).addScaledVector(delta,Math.min(max,Math.max(min,len)));
  return delta;
}
function handRangeDirection(name){
  if(handAimAxes[name]&&bones[LOOKAT_CONFIG[name]?.key])return handAimAxis(name).applyQuaternion(bones[LOOKAT_CONFIG[name]?.key].getWorldQuaternion(new THREE.Quaternion())).normalize();
  const bone=bones[LOOKAT_CONFIG[name]?.key];
  if(bone)return LOOKAT_CONFIG[name].localForward.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())).normalize();
  return new THREE.Vector3(0,0,1);
}
function alignHandRange(name){
  if(!bones[LOOKAT_CONFIG[name]?.key]||!lookAtTargetMesh[name])return;
  const r=handAimRange[name],center=bones[LOOKAT_CONFIG[name]?.key].getWorldPosition(new THREE.Vector3());
  clampHandRangePoint(lookAtTargetMesh[name].position,center,r.min,r.max,handRangeDirection(name));
}
function beginHandRangeDrag(name){
  if(!bones[LOOKAT_CONFIG[name]?.key]||!lookAtTargetMesh[name])return;
  const p=lookAtTargetMesh[name].position,raw=p.clone(),center=bones[LOOKAT_CONFIG[name]?.key].getWorldPosition(new THREE.Vector3()),r=handAimRange[name];
  // TransformControls captured raw start before dragging-changed. Retain the correction
  // as an offset for subsequent absolute objectChange positions to prevent a second jump.
  const last=clampHandRangePoint(p,center,r.min,r.max,handRangeDirection(name));
  handRangeDrag={name,center,min:r.min,max:r.max,last,offset:p.clone().sub(raw)};
}
function clampHandRangeDrag(){
  const d=handRangeDrag;if(!d)return;
  const p=lookAtTargetMesh[d.name].position;p.add(d.offset);
  d.last.copy(clampHandRangePoint(p,d.center,d.min,d.max,d.last));
}
function bindHandRangeUI(){
  for(const name of LOOKAT_RANGE_NAMES){
    const apply=reset=>{
      if(kfPlaying||handRangeDrag){updateLookAtRangeUI();return;}
      const min=reset?0.08:Number(document.getElementById('handRangeMin_'+name).value);
      const max=reset?0.4:Number(document.getElementById('handRangeMax_'+name).value);
      const notice=document.getElementById('handRangeNotice_'+name);
      if(!validHandRange(min,max)){notice.textContent='內半徑須至少 0.001，外半徑須大於內半徑。';updateLookAtRangeUI();return;}
      pushHistory();handAimRange[name]={min,max};alignHandRange(name);
      notice.textContent='已保留目標方向並套用範圍。';updateLookAtRangeUI();pushHistory();scheduleAutoSave();
    };
    document.getElementById('handRangeMin_'+name).onchange=()=>apply(false);
    document.getElementById('handRangeMax_'+name).onchange=()=>apply(false);
    document.getElementById('handRangeDefault_'+name).onclick=()=>apply(true);
  }
}
function updateHandRangeHelper(){
  const name=selectedIK?.limb?.startsWith('lookAt_')?selectedIK.limb.slice(7):null;
  if(handFollowSource[name]==="other"||(name==="head"&&headFollowSource!=="free")||!LOOKAT_RANGE_NAMES.includes(name)||!lookAtEnabled[name]||kfPlaying){if(handRangeHelper)handRangeHelper.visible=false;return;}
  if(!handRangeHelper){
    handRangeHelper=new THREE.Group();
    const geo=new THREE.WireframeGeometry(new THREE.SphereGeometry(1,16,10));
    for(const color of [0xffb65c,0x55ffaa]){
      const mesh=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:0.16,depthTest:false,depthWrite:false}));
      mesh.renderOrder=996;handRangeHelper.add(mesh);
    }scene.add(handRangeHelper);
  }
  const d=handRangeDrag?.name===name?handRangeDrag:null,r=d||handAimRange[name];
  handRangeHelper.visible=true;handRangeHelper.position.copy(d?d.center:bones[LOOKAT_CONFIG[name]?.key].getWorldPosition(new THREE.Vector3()));
  handRangeHelper.children[0].scale.setScalar(r.min);handRangeHelper.children[1].scale.setScalar(r.max);
}

function updateLookAtRangeUI(){
  for(const name of LOOKAT_RANGE_NAMES){
    const min=document.getElementById('handRangeMin_'+name),max=document.getElementById('handRangeMax_'+name);
    if(min)min.value=handAimRange[name].min;
    if(max)max.value=handAimRange[name].max;
  }
}
// Follow the actual wrist bone, not the potentially unreachable arm IK target.
function updateHeadFollowTarget(){
  if(!lookAtEnabled.head||headFollowSource==='free')return;
  const hand=bones[headFollowSource],marker=lookAtTargetMesh.head;
  if(hand&&marker)hand.getWorldPosition(marker.position);
}
function updateHeadFollowUI(){
  const select=document.getElementById('headFollowSource');if(!select)return;
  select.value=headFollowSource;
  for(const name of ['rHand','lHand'])select.querySelector('option[value="'+name+'"]').disabled=!bones[name];
  const bound=headFollowSource!=='free';
  for(const prefix of ['handRangeMin_','handRangeMax_','handRangeDefault_']){const el=document.getElementById(prefix+'head');if(el)el.disabled=bound;}
  document.getElementById('headFollowStatus').textContent=bound?(lookAtEnabled.head?'追蹤實際手腕位置；半徑限制暫停，播放沿用拍點姿勢。':'追蹤已暫停；開啟頭部 LookAt 可繼續。'):'拖曳目標球控制方向。';
  if(lookAtTargetMesh.head)lookAtTargetMesh.head.visible=lookAtEnabled.head&&!bound;
}
function bindHeadFollowUI(){
  document.getElementById('headFollowSource').onchange=e=>{
    if(kfPlaying){updateHeadFollowUI();return;}
    const next=e.target.value;
    if(!['free','rHand','lHand'].includes(next)||(next!=='free'&&!bones[next])){updateHeadFollowUI();return;}
    pushHistory();
    if(selectedIK?.limb==='lookAt_head')deselectJoint();
    handRangeDrag=null;headFollowSource=next;
    if(next!=='free')setLookAtEnabled('head',true);
    else syncLookAtMarkerToDefault('head');
    updateHeadFollowTarget();solveLookAt('head');updateHeadFollowUI();pushHistory();scheduleAutoSave();
  };
}

function snapshotTorsoLookAt(){
  const out={};for(const name of ['head','chest'])out[name]={range:{...handAimRange[name]},enabled:lookAtEnabled[name],target:lookAtTargetMesh[name]?.position.toArray()};
  out.head.source=headFollowSource;
  return out;
}
function restoreTorsoLookAt(data){
  headFollowSource=["rHand","lHand"].includes(data?.head?.source)&&bones[data.head.source]?data.head.source:"free";
  handRangeDrag=null;
  for(const name of ['head','chest']){
    const v=data?.[name];handAimRange[name]=validHandRange(v?.range?.min,v?.range?.max)?{min:v.range.min,max:v.range.max}:{min:0.08,max:0.4};
    if(lookAtTargetMesh[name]){
      setLookAtEnabled(name,v?.enabled===true);
      if(Array.isArray(v?.target)&&v.target.length===3&&v.target.every(Number.isFinite))lookAtTargetMesh[name].position.fromArray(v.target);
    }
  }
  updateLookAtRangeUI();updateHeadFollowTarget();updateHeadFollowUI();
}

function updateHandAimUI(){
  updateHandFollowUI();
  updateLookAtRangeUI();
  for(const name of HAND_AIM_NAMES){
    const state=handAim[name],available=!!handAimAxes[name];
    const btn=document.getElementById('lookAtBtn_'+name);if(!btn)continue;
    btn.disabled=!available;btn.classList.toggle('active',lookAtEnabled[name]);
    document.getElementById('handRangeMin_'+name).value=handAimRange[name].min;
    document.getElementById('handRangeMax_'+name).value=handAimRange[name].max;
    document.getElementById('handAimMode_'+name).value=state.mode;
    document.getElementById('handAimRoll_'+name).value=state.roll;
    document.getElementById('handAimFlip_'+name).checked=state.flip;
    document.getElementById('handAimStatus_'+name).textContent=available?'':'缺少手指骨骼，無法校準';
  }
  if(laPathRun)updateLAPathUI();
}
function bindHandAimUI(){
  bindLAPath();
  bindWave();
  bindTG();
  bindHandFollowUI();
  bindHeadFollowUI();
  bindHandRangeUI();
  for(const name of HAND_AIM_NAMES){
    for(const field of ['Mode','Roll','Flip']){
      document.getElementById('handAim'+field+'_'+name).onchange=e=>{
        if(kfPlaying){updateHandAimUI();return;}pushHistory();
        const state=handAim[name];
        if(field==='Roll'){const v=Number(e.target.value);if(Number.isFinite(v))state.roll=Math.max(-180,Math.min(180,v));}
        else {if(field==='Mode')state.mode=e.target.value;else state.flip=e.target.checked;
          if(captureHandAim(name))syncLookAtMarkerToDefault(name);}
        if(lookAtEnabled[name])solveHandAim(name);
        updateHandAimUI();pushHistory();scheduleAutoSave();
      };
    }
    document.getElementById('handAimReset_'+name).onclick=()=>{
      if(kfPlaying)return;pushHistory();if(captureHandAim(name))syncLookAtMarkerToDefault(name);updateHandAimUI();pushHistory();scheduleAutoSave();
    };
  }
}
function snapshotHandAim(){
  const out={};for(const name of HAND_AIM_NAMES){const a=handAim[name];
    out[name]={source:handFollowSource[name],followLast:handFollowLast[name]?{dir:handFollowLast[name].dir.toArray(),near:handFollowLast[name].near}:null,range:{...handAimRange[name]},enabled:lookAtEnabled[name],mode:a.mode,roll:a.roll,flip:a.flip,reference:a.reference.toArray(),target:lookAtTargetMesh[name]?.position.toArray(),effector:effectorOrientEnabled[name==='rHand'?'rArm':'lArm']};}
  return out;
}
function restoreHandAim(data){
  handRangeDrag=null;
  for(const name of HAND_AIM_NAMES){
    const v=data?.[name],a=handAim[name];
    handFollowSource[name]=v?.source==='other'&&bones[name==='rHand'?'lHand':'rHand']?'other':'free';handFollowLast[name]=null;
    const last=v?.followLast;
    if(Array.isArray(last?.dir)&&last.dir.length===3&&last.dir.every(Number.isFinite)){
      const dir=new THREE.Vector3().fromArray(last.dir);if(dir.lengthSq()>1e-10)handFollowLast[name]={dir:dir.normalize(),near:last.near===true};
    }
    handAimRange[name]=validHandRange(v?.range?.min,v?.range?.max)?{min:v.range.min,max:v.range.max}:{min:0.08,max:0.4};
    a.mode=v?.mode==='finger'?'finger':'palm';a.roll=Number.isFinite(v?.roll)?Math.max(-180,Math.min(180,v.roll)):0;a.flip=v?.flip===true;
    const arr=(x,n)=>Array.isArray(x)&&x.length===n&&x.every(Number.isFinite);
    if(bones[name])bones[name].getWorldQuaternion(a.reference);
    if(arr(v?.reference,4)&&v.reference.reduce((s,x)=>s+x*x,0)>1e-10)a.reference.fromArray(v.reference).normalize();
    lookAtEnabled[name]=v?.enabled===true&&!!handAimAxes[name];
    if(lookAtTargetMesh[name]){lookAtTargetMesh[name].visible=lookAtEnabled[name];
      if(arr(v?.target,3))lookAtTargetMesh[name].position.fromArray(v.target);}
    if(handAimAxes[name])LOOKAT_CONFIG[name].localForward.copy(handAimAxis(name));
    const limb=name==='rHand'?'rArm':'lArm';
    if(v)effectorOrientEnabled[limb]=!lookAtEnabled[name]&&v.effector===true;
  }
  rebuildIKDrivenKeys();updateHandAimUI();updateEffectorOrientButtons();
}

// ---- 頭/胸口 look-at 目標球（紫色=頭，琥珀色=胸口）----
function buildLookAtMarkers(){
  const colors = { head:0xff44cc, chest:0xffcc00, rHand:0x44ffaa, lHand:0x66dd66 };
  for(const name of HAND_AIM_NAMES)calibrateHandAim(name);
  for (const name in LOOKAT_CONFIG){
    const geo = new THREE.SphereGeometry(0.035, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color:colors[name], transparent:true, opacity:0.95, depthTest:false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 998;
    mesh.visible = false;
    mesh.userData.pickType = "lookAtTarget";
    mesh.userData.lookAtName = name;
    scene.add(mesh);
    lookAtTargetMesh[name] = mesh;
    syncLookAtMarkerToDefault(name);
  }
  updateHandAimUI();
}

// 把 look-at 目標球對齊「目前姿勢下，骨骼往前方軸延伸一小段」的位置，避免開啟當下瞬間跳動
function syncLookAtMarkerToDefault(name){
  const cfg = LOOKAT_CONFIG[name];
  const bone = bones[cfg.key];
  const mesh = lookAtTargetMesh[name];
  if (!bone || !mesh) return;
  const boneWorldQuat = new THREE.Quaternion(); bone.getWorldQuaternion(boneWorldQuat);
  const worldForward = cfg.localForward.clone().applyQuaternion(boneWorldQuat).normalize();
  const bonePos = new THREE.Vector3(); bone.getWorldPosition(bonePos);
  mesh.position.copy(bonePos.clone().add(worldForward.multiplyScalar(0.4)));
  if(LOOKAT_RANGE_NAMES.includes(name))alignHandRange(name);
}

// 開關 look-at：chest 用的骨骼（spine2）也是脊椎CCD鏈的一員，兩者若同時開啟會互搶
// spine2 的旋轉權，所以互斥——開其中一個會自動關掉另一個，避免打架看起來抖動。
function setLookAtEnabled(name, on){
  if(waveRun&&(waveHasBody(waveRun.config)||name==="chest"||waveSides(waveRun.config).some(side=>name===side+"Hand")))stopWave();
  if(laPathRun?.name===name)stopLAPath();
  if(HAND_AIM_NAMES.includes(name)){
    if(on&&!captureHandAim(name))return;
    if(on){effectorOrientEnabled[name==='rHand'?'rArm':'lArm']=false;updateEffectorOrientButtons();}
  }
  lookAtEnabled[name] = on;
  rebuildIKDrivenKeys(); // 理由同 setSpineIKEnabled：兩者會互相呼叫，整份重算不怕重複
  if (on) syncLookAtMarkerToDefault(name);
  lookAtTargetMesh[name].visible = on;
  if (on && name === "chest" && spineIKEnabled) setSpineIKEnabled(false);
  if (!on && selectedIK && selectedIK.limb === "lookAt_" + name) deselectJoint();
  updateLookAtButtons();
}

function updateLookAtButtons(){
  updateHeadFollowUI();
  updateHandAimUI();
  const headBtn = document.getElementById("lookAtBtn_head");
  if (headBtn) headBtn.classList.toggle("active", lookAtEnabled.head);
  const chestBtn = document.getElementById("lookAtBtn_chest");
  if (chestBtn) chestBtn.classList.toggle("active", lookAtEnabled.chest);
}

// ==== 手指 IK：目標球（青色小球，跟手腳IK的橘色/黃綠色區分）====
function buildFingerIKMarkers(){
  const geo = new THREE.SphereGeometry(0.016, 12, 12);
  for (const fingerId of FINGER_IDS){
    const mat = new THREE.MeshBasicMaterial({ color:0x00e5ff, transparent:true, opacity:0.95, depthTest:false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 998;
    mesh.visible = false;
    mesh.userData.pickType = "fingerIKTarget";
    mesh.userData.fingerId = fingerId;
    scene.add(mesh);
    fingerIKTargetMeshes[fingerId] = mesh;
    syncFingerIKMarkerToDefault(fingerId);
  }
}

// 把某指的目標球對齊「目前姿勢」指尖(effector)所在的世界座標（開啟當下、或按重置時呼叫，避免瞬間跳動）
function syncFingerIKMarkerToDefault(fingerId){
  const effectorBone = fingerEffectorBones[fingerId];
  const mesh = fingerIKTargetMeshes[fingerId];
  if (!effectorBone || !mesh) return;
  const pos = new THREE.Vector3();
  effectorBone.getWorldPosition(pos);
  mesh.position.copy(pos);
}

// 開關某指的IK：開啟時鎖住該指3節（隱藏它們的FK關節球，改由CCD求解），
// 跟手腳/脊椎IK同樣的「開啟時同步target球到目前姿勢位置，避免瞬間跳動」設計。
function setFingerIKEnabled(fingerId, on){
  if(waveRun&&(waveHasBody(waveRun.config)||waveSides(waveRun.config).includes(fingerId[0])))stopWave();
  fingerIKEnabled[fingerId] = on;
  rebuildIKDrivenKeys(); // 必須在下面的 early return「之前」，否則指名錯誤時集合會漏更新
  const chain = FINGER_IK_CHAINS[fingerId];
  if (!chain) return;
  if (on) syncFingerIKMarkerToDefault(fingerId);
  if (fingerIKTargetMeshes[fingerId]) fingerIKTargetMeshes[fingerId].visible = on;
  for (const key of chain.bones){
    if (markerMeshes[key]) markerIKHidden[key] = on;
  }
  if (!on && selectedIK && selectedIK.limb === FINGER_IK_PREFIX + fingerId) deselectJoint();
  updateFingerIKButtons();
}

function updateFingerIKButtons(){
  for (const fingerId of FINGER_IDS){
    const btn = document.getElementById("fingerIKBtn_" + fingerId);
    if (btn) btn.classList.toggle("active", !!fingerIKEnabled[fingerId]);
  }
}

// ---- 手指 FK/IK 面板：一指一列、三節橫排（根/中/末），列尾巴加一顆 IK 切換鈕 ----
// 左右手分兩張卡片，卡片本身在 HTML 裡已放好（#fingerCard_r / #fingerCard_l），這裡只把
// 每指一列 append 進去；完整名稱放 title 屬性做 hover 提示，按鈕文字用短標籤保持可掃描性。
function buildFingerPanel(){
  const cards = { r: document.getElementById("fingerCard_r"), l: document.getElementById("fingerCard_l") };
  for (const hs of HAND_SIDES){
    const card = cards[hs.side];
    if (!card) continue;
    for (const fd of FINGER_DEFS){
      const fingerId = hs.side + fd.id;
      const row = document.createElement("div");
      row.className = "fingerRow";

      const label = document.createElement("span");
      label.className = "fingerRowLabel";
      label.textContent = fd.label;
      row.appendChild(label);

      for (let j = 1; j <= 3; j++){
        const key = hs.side + fd.id + j;
        const btn = document.createElement("button");
        btn.className = "fingerJointBtn";
        btn.textContent = FINGER_JOINT_LABELS[j];
        btn.title = LABEL_LOOKUP[key] || key;
        btn.dataset.jointkey = key;
        btn.onclick = () => selectJoint(key);
        row.appendChild(btn);
      }

      const ikBtn = document.createElement("button");
      ikBtn.className = "fingerIKToggleBtn";
      ikBtn.id = "fingerIKBtn_" + fingerId;
      ikBtn.textContent = "IK";
      ikBtn.title = hs.label + fd.label + " IK 開關：開啟後拖曳指尖目標球，整根手指自動彎曲收斂";
      ikBtn.onclick = () => setFingerIKEnabled(fingerId, !fingerIKEnabled[fingerId]);
      row.appendChild(ikBtn);

      card.appendChild(row);
    }
  }
  updateFingerIKButtons();
}

// ---- 關節限制分頁：依 OVERVIEW_GROUPS 分組建立全部關節的限制編輯 UI（可個別收合）----
let jointLimitCurAngleEls = {}; // key -> 標題旁「目前角度」的 <span>，逐幀更新用
let jointLimitGroupCollapsed = {}; // groupId -> bool，記住使用者展開/收合狀態（跟總覽分頁分開記）
let jlAdvancedVisible = false; // 進階設定（格距/貼邊機率/Isolation/每關節機率/分組權重）預設收起來，簡化介面

function jlMatchesFilter(key){
  const input = document.getElementById("jlFilterInput");
  const kw = (input && input.value ? input.value : "").trim().toLowerCase();
  if (!kw) return true;
  const label = (LABEL_LOOKUP[key] || key).toLowerCase();
  return label.includes(kw) || key.toLowerCase().includes(kw);
}

function buildJointLimitPanel(){
  const container = document.getElementById("jointLimitGroups");
  if (!container) return;
  container.innerHTML = "";
  jointLimitCurAngleEls = {};

  for (const group of OVERVIEW_GROUPS){
    const keys = group.keys.filter(k => bones[k] && jlMatchesFilter(k));
    if (keys.length === 0) continue;

    const collapsed = jointLimitGroupCollapsed[group.id] ?? !!group.collapsedByDefault;
    const body = document.createElement("div");
    body.className = "ovGroupBody jointLimitGrid" + (collapsed ? " collapsed" : "");

    for (const key of keys){
      const lim = JOINT_LIMITS[key];
      const block = document.createElement("div");
      block.className = "jlJointBlock";

      const title = document.createElement("div");
      title.className = "jlJointTitle";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = LABEL_LOOKUP[key] || key;
      const curSpan = document.createElement("span");
      curSpan.className = "jlCurAngle";
      jointLimitCurAngleEls[key] = curSpan;
      title.appendChild(nameSpan);
      title.appendChild(curSpan);
      block.appendChild(title);

      // 關節機率（Isolation第二層篩選用）：100＝一定摸到，調低代表這關節比較少被生成動到。
      // 只有進階設定展開時才顯示，簡化預設畫面。
      const weightRow = document.createElement("div");
      weightRow.className = "jlAxisRow jlAdvancedOnly";
      weightRow.style.display = jlAdvancedVisible ? "" : "none";
      const weightLabel = document.createElement("span");
      weightLabel.className = "jlAxisLabel";
      weightLabel.textContent = "機率";
      const weightInput = document.createElement("input");
      weightInput.type = "number"; weightInput.min = "0"; weightInput.max = "100"; weightInput.step = "5";
      weightInput.className = "jlNumInput";
      weightInput.value = getJointWeight(key);
      weightInput.title = "這個關節「動作生成」時被摸到的機率(0~100)，100＝一定摸到";
      weightInput.onchange = (e) => {
        const v = parseFloat(e.target.value);
        isolationSettings.jointWeights[key] = (isNaN(v) || v < 0) ? 0 : Math.min(100, v);
        saveIsolationSettings();
      };
      const weightPct = document.createElement("span");
      weightPct.textContent = "%";
      weightRow.append(weightLabel, weightInput, weightPct);
      block.appendChild(weightRow);

      for (const axis of ["x","y","z"]){
        const axisLim = lim[axis];
        const row = document.createElement("div");
        row.className = "jlAxisRow";

        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = axisLim.enabled;

        const axisLabel = document.createElement("span");
        axisLabel.className = "jlAxisLabel";
        axisLabel.textContent = axis.toUpperCase();

        // 沒啟用時把 min~max° 整組收起來，不佔版面；勾選後才展開輸入框。
        const rangeWrap = document.createElement("span");
        rangeWrap.style.display = axisLim.enabled ? "inline-flex" : "none";
        rangeWrap.style.alignItems = "center";
        rangeWrap.style.gap = "4px";

        const minInput = document.createElement("input");
        minInput.type = "number"; minInput.step = "1"; minInput.className = "jlNumInput";
        minInput.value = axisLim.min;

        const sep = document.createElement("span");
        sep.className = "jlSep"; sep.textContent = "~";

        const maxInput = document.createElement("input");
        maxInput.type = "number"; maxInput.step = "1"; maxInput.className = "jlNumInput";
        maxInput.value = axisLim.max;

        const deg = document.createElement("span");
        deg.textContent = "°";

        rangeWrap.append(minInput, sep, maxInput, deg);

        // 任何一個輸入改變，都：更新JOINT_LIMITS → 存localStorage → 立刻對目前target重新夾一次
        // （若使用者目前的姿勢剛好超出新設定的範圍，馬上收回來，不用等下次選取/拖曳才生效）。
        function onChange(){
          axisLim.enabled = chk.checked;
          axisLim.min = parseFloat(minInput.value) || 0;
          axisLim.max = parseFloat(maxInput.value) || 0;
          rangeWrap.style.display = axisLim.enabled ? "inline-flex" : "none";
          saveJointLimits();
          if (bones[key] && poseController.getTarget(key)) setTarget(key, poseController.getTarget(key));
          updateSelectedBar();
        }
        chk.onchange = onChange;
        minInput.onchange = onChange;
        maxInput.onchange = onChange;

        row.appendChild(chk);
        row.appendChild(axisLabel);
        row.appendChild(rangeWrap);
        block.appendChild(row);
      }

      body.appendChild(block);
    }

    const groupEl = document.createElement("div");
    groupEl.className = "ovGroup";
    const head = document.createElement("div");
    head.className = "ovGroupHead" + (collapsed ? " collapsed" : "");

    const leftSpan = document.createElement("span");
    leftSpan.innerHTML = `<span class="ovCaret">▾</span>${group.label}`;

    const rightWrap = document.createElement("span");
    rightWrap.style.display = "flex";
    rightWrap.style.alignItems = "center";
    rightWrap.style.gap = "6px";

    const weightWrap = document.createElement("span");
    weightWrap.className = "jlAdvancedOnly";
    weightWrap.style.display = jlAdvancedVisible ? "inline-flex" : "none";
    weightWrap.style.alignItems = "center";
    weightWrap.style.gap = "6px";

    const weightLabel = document.createElement("span");
    weightLabel.className = "ovCount";
    weightLabel.textContent = "權重";

    const weightInput = document.createElement("input");
    weightInput.type = "number"; weightInput.min = "0"; weightInput.step = "0.5";
    weightInput.value = getGroupWeight(group.id);
    weightInput.className = "jlNumInput";
    weightInput.style.width = "36px";
    weightInput.title = "Isolation模式抽中這組的相對權重（數字越大越常被抽中，預設1）";
    weightInput.onclick = (e) => e.stopPropagation(); // 避免點輸入框連帶觸發標題列的收合
    weightInput.onchange = (e) => {
      const v = parseFloat(e.target.value);
      isolationSettings.weights[group.id] = (isNaN(v) || v < 0) ? 1 : v;
      saveIsolationSettings();
    };

    const countSpan = document.createElement("span");
    countSpan.className = "ovCount";
    countSpan.textContent = `${keys.length} 個關節`;

    weightWrap.append(weightLabel, weightInput);
    rightWrap.append(weightWrap, countSpan);
    head.append(leftSpan, rightWrap);
    head.onclick = () => {
      const nowCollapsed = !body.classList.contains("collapsed");
      body.classList.toggle("collapsed", nowCollapsed);
      head.classList.toggle("collapsed", nowCollapsed);
      jointLimitGroupCollapsed[group.id] = nowCollapsed;
    };
    groupEl.append(head, body);
    container.appendChild(groupEl);
  }

  const resetBtn = document.getElementById("jlResetAllBtn");
  if (resetBtn) resetBtn.onclick = () => {
    if (!confirm(`確定要把全部 ${JOINT_LIMIT_KEYS.length} 個關節的限制都恢復成預設（停用）嗎？`)) return;
    JOINT_LIMITS = defaultJointLimits();
    saveJointLimits();
    buildJointLimitPanel();
  };

  const genBtn = document.getElementById("jlGenerateBtn");
  if (genBtn) genBtn.onclick = generateRandomPose;

  // 進階設定收合：切換時只需要顯示/隱藏區塊＋重建面板（讓每張關節卡片的機率列、
  // 分組標題的權重輸入框跟著顯示/隱藏），不需要另外維護一套顯示邏輯。
  const advancedToggleBtn = document.getElementById("jlAdvancedToggleBtn");
  const advancedSection = document.getElementById("jlAdvancedSection");
  if (advancedSection) advancedSection.style.display = jlAdvancedVisible ? "" : "none";
  if (advancedToggleBtn){
    advancedToggleBtn.textContent = jlAdvancedVisible ? "進階設定 ▴" : "進階設定 ▾";
    advancedToggleBtn.onclick = () => {
      jlAdvancedVisible = !jlAdvancedVisible;
      buildJointLimitPanel();
    };
  }

  // Isolation 控制項：初始值來自 isolationSettings，改動時更新+存檔（不用整個面板重建）
  const isoChk = document.getElementById("jlIsolationEnabledChk");
  const isoMinInput = document.getElementById("jlIsolationMinInput");
  const isoMaxInput = document.getElementById("jlIsolationMaxInput");
  if (isoChk) isoChk.checked = isolationSettings.enabled;
  if (isoMinInput) isoMinInput.value = isolationSettings.minGroups;
  if (isoMaxInput) isoMaxInput.value = isolationSettings.maxGroups;
  function onIsolationSettingChange(){
    isolationSettings.enabled = !!isoChk?.checked;
    isolationSettings.minGroups = Math.max(1, parseInt(isoMinInput?.value, 10) || 1);
    isolationSettings.maxGroups = Math.max(1, parseInt(isoMaxInput?.value, 10) || 1);
    saveIsolationSettings();
  }
  if (isoChk) isoChk.onchange = onIsolationSettingChange;
  if (isoMinInput) isoMinInput.onchange = onIsolationSettingChange;
  if (isoMaxInput) isoMaxInput.onchange = onIsolationSettingChange;

  const filterInput = document.getElementById("jlFilterInput");
  if (filterInput) filterInput.oninput = () => buildJointLimitPanel();

  const expandBtn = document.getElementById("jlExpandAllBtn");
  if (expandBtn) expandBtn.onclick = () => { OVERVIEW_GROUPS.forEach(g => jointLimitGroupCollapsed[g.id] = false); buildJointLimitPanel(); };

  const collapseBtn = document.getElementById("jlCollapseAllBtn");
  if (collapseBtn) collapseBtn.onclick = () => { OVERVIEW_GROUPS.forEach(g => jointLimitGroupCollapsed[g.id] = true); buildJointLimitPanel(); };

  updateJointLimitPanelAngles(true);
}

// 逐幀更新「目前角度」文字，只有分頁顯示時才做（跟 updateOverviewPanel 同一套節流方式）；
// force=true 給 buildJointLimitPanel 重建完 DOM 後立刻填值，不用等下一幀 animate() 才刷新。
function updateJointLimitPanelAngles(force){
  const panel = document.getElementById("tabJointLimits");
  if (!panel || (!force && !panel.classList.contains("active"))) return;
  for (const key of JOINT_LIMIT_KEYS){
    const el = jointLimitCurAngleEls[key];
    const a = poseController.getTarget(key);
    if (!el || !a) continue;
    el.textContent = `X${a[0].toFixed(0)}° Y${a[1].toFixed(0)}° Z${a[2].toFixed(0)}°`;
  }
}

// 每幀呼叫：對每根開啟IK的手指求解一次CCD，並同步回target/current（給拍點/JSON用）。
// 直接複用 solveCCDChain，不寫新的求解數學；手指鏈短、彎曲幅度通常不大，
// 迭代次數/阻尼比脊椎（8輪/0.5）略小略快。
// 每根手指的骨鏈陣列在模型載入完成後就固定不變，第一次用到時快取起來，
// 避免手指IK全開時每幀對10隻手指各自重新 map+filter 產生新陣列（10×2=20個/幀）。
const _fingerChainBonesCache = {};
function solveFingerIKAll(){
  for (const fingerId of FINGER_IDS){
    if (!fingerIKEnabled[fingerId]) continue;
    const chain = FINGER_IK_CHAINS[fingerId];
    let boneChain = _fingerChainBonesCache[fingerId];
    if (!boneChain){
      boneChain = chain.bones.map(k => bones[k]).filter(Boolean);
      _fingerChainBonesCache[fingerId] = boneChain;
    }
    const effectorBone = fingerEffectorBones[fingerId];
    const targetMesh = fingerIKTargetMeshes[fingerId];
    if (boneChain.length === 0 || !effectorBone || !targetMesh) continue;
    solveCCDChain(boneChain, effectorBone, targetMesh.position, 6, 0.6);
    for (const key of chain.bones) syncTargetFromBone(key);
  }
}

// ==== 軌跡輔助工具 ====
// 場景中每個肢體各自維護一串紫色控制點球（陣列，順序＝路徑順序）+ 一條路徑預覽線。
// 只有「軌跡」分頁目前選取中的 trajActiveLimb 那組球/線會顯示，避免四肢的點混在一起難以分辨。
function buildTrajMarkers(){
  for (const limb of IK_LIMB_KEYS){
    const lineMat = new THREE.LineBasicMaterial({ color:0x9944ff, transparent:true, opacity:0.75, depthTest:false });
    const line = new THREE.Line(new THREE.BufferGeometry(), lineMat);
    line.renderOrder = 996;
    line.visible = false;
    scene.add(line);
    trajLine[limb] = line;
  }
}

// 共用輔助：在指定世界座標建立一顆紫色控制點球並掛進場景/陣列（不含後續的視覺重繪/存檔，
// 呼叫端在整批新增完後自己統一呼叫 updateTrajVisual/renderTrajPointList/scheduleAutoSave，
// 避免形狀產生器一次生成 N 個點時重複做 N 次多餘的重繪）。
function createTrajPointAt(limb, worldPos){
  const geo = new THREE.SphereGeometry(0.026, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color:0x9944ff, transparent:true, opacity:0.9, depthTest:false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 998;
  mesh.position.copy(worldPos);
  mesh.visible = (limb === trajActiveLimb);
  mesh.userData.pickType = "trajPoint";
  mesh.userData.limb = limb;
  mesh.userData.index = trajPointMeshes[limb].length;
  scene.add(mesh);
  trajPointMeshes[limb].push(mesh);
  return mesh;
}

// 新增一顆控制點球，直接對齊該肢體目前IK target球的世界座標（明確需求：不要自動偏移/延伸）
function addTrajPoint(limb){
  const targetMesh = ikTargetMeshes[limb];
  if (!targetMesh) return;
  createTrajPointAt(limb, targetMesh.position);
  updateTrajVisual(limb);
  renderTrajPointList();
  scheduleAutoSave();
}

// ---- 形狀產生器：圓形／橢圓形／正多邊形／星形 ----
// 以「目前該肢體IK目標球的世界座標」當中心（跟手動新增控制點同一套慣例：先把橘色球拖到位），
// 在指定平面上分佈頂點，取代掉目前這個肢體既有的控制點。
// plane: 'xz'（水平面，像轉呼拉圈）｜'xy'（垂直面朝前，像畫時鐘面對鏡頭）｜'yz'（垂直面側向，手側邊畫圈）
// opts.radiusY：橢圓形的短半徑（沿 axisB 方向）；opts.innerRatio：星形內凹頂點半徑＝radius*innerRatio
const TRAJ_SHAPE_PLANE_AXES = {
  xz: [new THREE.Vector3(1,0,0), new THREE.Vector3(0,0,1)],
  xy: [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0)],
  yz: [new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)],
};
function generateShapeTrajPoints(limb, shapeType, n, radius, plane, opts = {}){
  const targetMesh = ikTargetMeshes[limb];
  if (!targetMesh){ alert("找不到「" + limb + "」的 IK 目標球，請先到「手腳 IK」分頁開啟該肢體 IK"); return; }
  if (trajPointMeshes[limb].length > 0){
    const ok = confirm("這會清除「" + limb + "」目前已有的 " + trajPointMeshes[limb].length + " 個控制點，改成產生的形狀，確定要繼續嗎？");
    if (!ok) return;
  }
  clearTrajPoints(limb); // 內部已含 updateTrajVisual/renderTrajPointList/scheduleAutoSave，但下面還會再重繪一次沒關係

  const center = targetMesh.position.clone();
  const [axisA, axisB] = TRAJ_SHAPE_PLANE_AXES[plane] || TRAJ_SHAPE_PLANE_AXES.xz;
  // 短半徑只對橢圓形有意義；其餘形狀一律 rY = rX = radius，避免呼叫端不小心傳入不相干的 radiusY
  // （例如殘留的舊欄位值）把圓形/多邊形/星形拉成歪斜的橢圓。
  const radiusY = (shapeType === "ellipse" && typeof opts.radiusY === "number" && opts.radiusY > 0) ? opts.radiusY : radius;
  const innerRatio = clampNum(opts.innerRatio ?? 0.5, 0.1, 0.9);

  // 星形：n 是「角數」，實際頂點數是 2n（外角/內凹交替），跟圓形/橢圓形/多邊形統一用
  // 「單一迴圈依角度算頂點」的寫法，只是星形多了「奇偶頂點半徑不同」這個變化。
  const vertCount = (shapeType === "star") ? Math.round(clampNum(n, 3, 24)) * 2 : Math.round(clampNum(n, 3, 48));

  for (let i = 0; i < vertCount; i++){
    // -90度(即 -PI/2)偏移只是讓第一個點落在「正上方/正前方」，視覺上比較直覺，純美觀不影響形狀本身
    const angle = (i / vertCount) * Math.PI * 2 - Math.PI / 2;
    let rX = radius, rY = radiusY;
    if (shapeType === "star" && i % 2 === 1){ rX *= innerRatio; rY *= innerRatio; } // 奇數索引＝內凹頂點
    const offset = axisA.clone().multiplyScalar(Math.cos(angle) * rX)
      .add(axisB.clone().multiplyScalar(Math.sin(angle) * rY));
    createTrajPointAt(limb, center.clone().add(offset));
  }

  // 一律用折線＋封閉路徑：圓形/橢圓形點數夠多時折線本身就非常接近圓/橢圓，且能保證所有生成點都
  // 精確落在圓周/橢圓周上；正多邊形、星形的「直邊」更是形狀定義本身。曲線模式（Catmull-Rom）為了
  // 平滑，實際路徑會些微偏離控制點，反而讓形狀不夠「正」，所以形狀產生器一律不用曲線模式。
  TRAJ_MODE[limb] = "line";
  TRAJ_CLOSED[limb] = true;

  const modeSel = document.getElementById("trajModeSelect");
  if (modeSel && limb === trajActiveLimb) modeSel.value = "line";

  updateTrajVisual(limb);
  renderTrajPointList();
  scheduleAutoSave();
  pushHistory();
}

// 刪除單一控制點；刪除後把剩餘點的 userData.index 重新編號，保持跟陣列索引一致
function removeTrajPoint(limb, idx){
  const arr = trajPointMeshes[limb];
  if (!arr[idx]) return;
  if (selectedIK && selectedIK.limb === limb && selectedIK.role === "trajPoint" && selectedIK.index === idx){
    deselectJoint();
  }
  scene.remove(arr[idx]);
  arr[idx].geometry.dispose();
  arr[idx].material.dispose();
  arr.splice(idx, 1);
  arr.forEach((m, i) => { m.userData.index = i; });
  updateTrajVisual(limb);
  renderTrajPointList();
  scheduleAutoSave();
}

function clearTrajPoints(limb){
  if (selectedIK && selectedIK.limb === limb && selectedIK.role === "trajPoint") deselectJoint();
  for (const m of trajPointMeshes[limb]){ scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  trajPointMeshes[limb] = [];
  updateTrajVisual(limb);
  renderTrajPointList();
  scheduleAutoSave();
}

// 重繪某肢體的路徑預覽線（依目前控制點世界座標 + 該肢體目前的路徑模式）
function updateTrajVisual(limb){
  const line = trajLine[limb];
  if (!line) return;
  const pts = trajPointMeshes[limb].map(m => m.position.clone());
  if (pts.length < 2){
    line.visible = false;
  } else {
    let linePts;
    const closed = TRAJ_CLOSED[limb] && pts.length >= 3; // 封閉至少需要3點才有意義，2點封閉只是來回抖動
    if (TRAJ_MODE[limb] === "curve" && pts.length >= 3){
      const curve = new THREE.CatmullRomCurve3(pts, closed);
      linePts = curve.getPoints(Math.max(20, pts.length * 10));
    } else {
      linePts = closed ? [...pts, pts[0]] : pts; // 折線封閉：預覽線多畫一段回到起點
    }
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(linePts);
    line.visible = (limb === trajActiveLimb);
  }
  updateTrajActiveVisibility();
}

// 只顯示目前編輯中肢體(trajActiveLimb)的控制點球/路徑線，其他肢體的資料仍保留在記憶體裡只是隱藏
function updateTrajActiveVisibility(){
  for (const limb of IK_LIMB_KEYS){
    const on = (limb === trajActiveLimb);
    for (const m of trajPointMeshes[limb]) m.visible = on;
    if (trajLine[limb]) trajLine[limb].visible = on && trajPointMeshes[limb].length >= 2;
  }
}

function setTrajActiveLimb(limb){
  trajActiveLimb = limb;
  updateTrajLimbButtons();
  updateTrajActiveVisibility();
  const modeSel = document.getElementById("trajModeSelect");
  if (modeSel) modeSel.value = TRAJ_MODE[limb];
  updateTrajClosedChkState();
  renderTrajPointList();
}

// 封閉路徑checkbox：點數<3時停用（2點封閉只是來回抖動沒意義），並同步目前肢體的勾選狀態。
// 呼叫時機：切換編輯中肢體、每次新增/刪除控制點（renderTrajPointList尾端）。
function updateTrajClosedChkState(){
  const chk = document.getElementById("trajClosedChk");
  if (!chk) return;
  const pts = trajPointMeshes[trajActiveLimb];
  const enoughPoints = !!pts && pts.length >= 3;
  chk.disabled = !enoughPoints;
  chk.checked = enoughPoints && TRAJ_CLOSED[trajActiveLimb];
}

function updateTrajLimbButtons(){
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("trajLimbBtn_" + limb);
    if (btn) btn.classList.toggle("active", limb === trajActiveLimb);
  }
}

// 軌跡分頁裡的控制點清單（Pxx晶片，可點選/刪除）
function renderTrajPointList(){
  const host = document.getElementById("trajPointList");
  if (!host) return;
  host.innerHTML = "";
  const pts = trajPointMeshes[trajActiveLimb];
  updateTrajClosedChkState();
  if (!pts || pts.length === 0){
    // 動態建立空清單提示文字，不依賴靜態 #trajPointEmpty 節點——
    // 該節點一旦在非空清單時被 host.innerHTML="" 清掉就永久脫離DOM，
    // 之後 getElementById 會一直回傳 null，導致清單卡死不再更新（已修正的舊bug）。
    const empty = document.createElement("span");
    empty.id = "trajPointEmpty";
    empty.textContent = "尚未新增控制點——先拖橘色目標球到位，再按「+ 新增控制點」";
    host.appendChild(empty);
    return;
  }
  pts.forEach((m, i) => {
    const chip = document.createElement("div");
    chip.className = "trajChip";
    if (selectedIK && selectedIK.limb === trajActiveLimb && selectedIK.role === "trajPoint" && selectedIK.index === i){
      chip.classList.add("active");
    }
    const sel = document.createElement("button");
    sel.className = "sel";
    sel.textContent = `P${i + 1}`;
    sel.onclick = () => selectIKMarker(trajActiveLimb, "trajPoint", i);
    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.onclick = (ev) => { ev.stopPropagation(); removeTrajPoint(trajActiveLimb, i); };
    chip.appendChild(sel);
    chip.appendChild(del);
    host.appendChild(chip);
  });
}

// ---- 純數學取樣函式：不依賴場景中的mesh是否還存在，播放時就是靠這個函式直接算座標 ----
// mode: 'line' | 'curve'；points: THREE.Vector3 或 {x,y,z} 陣列（相對座標）；t: 0~1 進度；
// closed: 是否首尾相連封閉成迴圈（點數<3時強制視為不封閉，2點封閉只是來回抖動沒有意義）

// sampleTrajectoryFromPoints 的即時預覽包裝：讀場景中 trajPointMeshes 目前的world座標
function sampleTrajectory(limb, t){
  const pts = trajPointMeshes[limb].map(m => m.position.clone());
  return sampleTrajectoryFromPoints(TRAJ_MODE[limb], pts, t, TRAJ_CLOSED[limb]);
}

// 沿目前控制點路徑等間隔取樣 trajSampleCount 個點，每點都當成一次「使用者手動擺好IK再按新增拍點」，
// 依序寫入時間軸；額外把整批共用的軌跡資料（trajId/模式/相對座標/pole/進度t）烘焙進每個拍點的
// kf.traj[limb]，播放時才能不靠取樣密度、直接連續取樣曲線本身（見 updateKeyframePlayback）。
function generateKeyframesFromTrajectory(limb){
  const pts = trajPointMeshes[limb];
  const chain = IK_CHAINS[limb];
  if (pts.length < 2){ alert("至少需要 2 個控制點才能生成軌跡拍點"); return; }
  if (!ikEnabled[limb]){ alert("請先到「手腳 IK」分頁開啟「" + chain.label + "」的 IK，再生成軌跡拍點"); return; }
  const rootBone = bones[chain.root], midBone = bones[chain.mid], endBone = bones[chain.end];
  if (!rootBone || !midBone || !endBone) return;

  const n = Math.round(clampNum(trajSampleCount, 2, 20));
  const trajId = "traj_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
  const mode = TRAJ_MODE[limb];
  const closed = TRAJ_CLOSED[limb] && pts.length >= 3;

  // 生成當下：以此刻 root 骨骼世界座標為原點，把所有控制點/pole換算成「相對root」的偏移量，
  // 這個原點只在生成當下取一次（見文件描述），之後每個取樣點都疊加在這個固定原點上。
  const rootPos = new THREE.Vector3(); rootBone.getWorldPosition(rootPos);
  const relPoints = pts.map(m => { const v = m.position.clone().sub(rootPos); return { x:v.x, y:v.y, z:v.z }; });
  const poleAbs = ikPoleMeshes[limb].position.clone();
  const poleRel = poleAbs.clone().sub(rootPos);
  const poleRelObj = { x:poleRel.x, y:poleRel.y, z:poleRel.z };

  for (let i = 0; i < n; i++){
    const t = i / (n - 1);
    const localOffset = sampleTrajectoryFromPoints(mode, relPoints, t, closed);
    const worldPos = rootPos.clone().add(localOffset);
    ikTargetMeshes[limb].position.copy(worldPos);

    solveRootFollowForLimb(limb);
    if (shoulderAssistEnabled) solveShoulderAssist(limb);
    solveTwoBoneIK(rootBone, midBone, endBone, ikTargetMeshes[limb].position, ikPoleMeshes[limb].position);
    syncTargetFromBone(chain.root);
    syncTargetFromBone(chain.mid);
    if (limb === "rLeg" || limb === "lLeg") applyFootLock(limb);
    applyEffectorOrientation(limb);

    addKeyframe();
    const kf = keyframes[keyframes.length - 1];
    kf.traj = kf.traj || {};
    kf.traj[limb] = { id: trajId, mode, points: relPoints, pole: poleRelObj, t, closed };
  }
  renderKeyframeChips();
  scheduleAutoSave();
}

// ---- 身體移動 ----
// 控制環attach到bodyGizmoProxy（放在Hips世界座標），不是直接attach到model，
// 這樣控制環會出現在髖部附近，比出現在model原點（通常在腳底/地板格線旁）好點選。
// 拖曳時透過 transformControlsIK 的 objectChange 事件把delta套用到 model.position。
// 注意：若手臂/脊椎的 root-follow 或雙手固定同時開啟，animate() 每幀仍會
// 自動用那些機制調整 model.position，但這裡的代理物件位置不會跟著自動同步，
// 可能導致控制環視覺上跟身體實際位置脫節——若發生這種情況，重新按一次
// 「移動身體」即可讓控制環重新對齊。
function selectBodyMarker(){
  selectedKey = null;
  selectedIK = { limb: "body", role: "target" };
  transformControls.detach();

  const hipsBone = bones["hips"];
  if (hipsBone){
    const hipsPos = new THREE.Vector3();
    hipsBone.getWorldPosition(hipsPos);
    bodyGizmoProxy.position.copy(hipsPos);
  } else {
    bodyGizmoProxy.position.copy(model.position);
  }
  bodyProxyLastPos = bodyGizmoProxy.position.clone();

  transformControlsIK.attach(bodyGizmoProxy);
  highlightMarkers();
  highlightIKMarkers();
  updateSelectedBar();
}

function resetBodyTransform(){
  if (!defaultModelPosition || !defaultModelQuaternion) return;
  model.position.copy(defaultModelPosition);
  model.quaternion.copy(defaultModelQuaternion);
  model.updateWorldMatrix(true, true);
  // 若目前正選取著身體控制環，重置後重新對齊代理物件到新的Hips世界座標，
  // 避免控制環還停在舊位置、跟reset後的身體視覺脫節
  if (selectedIK && selectedIK.limb === "body" && bodyGizmoProxy){
    const hipsBone = bones["hips"];
    const hipsPos = new THREE.Vector3();
    if (hipsBone) hipsBone.getWorldPosition(hipsPos); else hipsPos.copy(model.position);
    bodyGizmoProxy.position.copy(hipsPos);
    bodyProxyLastPos = hipsPos.clone();
  }
}

// 開關某肢體的 IK：開啟時鎖住 root/mid 骨骼改由 IK 求解（隱藏它們的關節球），
// 末端骨骼（手掌/腳掌自己的旋轉）仍保留 FK 可調整。
function setIKEnabled(limb, on){
  if(waveRun&&(waveHasBody(waveRun.config)||waveSides(waveRun.config).some(side=>limb===side+"Arm")))stopWave();
  if (kfPlaying) return;
  // 手動關掉某隻手的 IK → 通知扶握箱核心釋放扶握，避免殘留錯誤綁定
  if (!on && grabBoxCore && (limb === "rArm" || limb === "lArm")) grabBoxCore.releaseHand(limb);
  ikEnabled[limb] = on;
  rebuildIKDrivenKeys();
  const chain = IK_CHAINS[limb];

  if (on) syncIKMarkersToDefault(limb);

  ikTargetMeshes[limb].visible = on;
  ikPoleMeshes[limb].visible = on;
  ikPoleLines[limb].visible = on;

  if (markerMeshes[chain.root]) markerIKHidden[chain.root] = on;
  if (markerMeshes[chain.mid]) markerIKHidden[chain.mid] = on;
  if (chain.shoulder && markerMeshes[chain.shoulder]) markerIKHidden[chain.shoulder] = on;

  // 腳踝旋轉鎖存：開啟腿部IK當下抓取目前腳掌世界旋轉當基準；關閉時清空，
  // 避免下次重開時殘留舊姿勢的鎖存值造成腳掌瞬間跳動
  if (limb === "rLeg" || limb === "lLeg"){
    if (on) captureFootLock(limb);
    else footLockedWorldQuat[limb] = null;
  }

  if (!on && selectedIK && selectedIK.limb === limb) deselectJoint();
  if (FOOT_PLANT_LIMBS.includes(limb)) {
    if (on && footPlantEnabled) captureFootPlant(limb);
    else delete footPlantAnchors[limb];
    footPlantSafe = null;
    if (!ikEnabled.rLeg && !ikEnabled.lLeg) footPlantEnabled = false;
    updateFootPlantUI();
  }
  updateIKButtons();
}

// 抓取「目前」腳掌世界旋轉，存成鎖存基準
function captureFootLock(limb){
  const chain = IK_CHAINS[limb];
  const footBone = bones[chain.end];
  if (!footBone) return;
  const q = new THREE.Quaternion();
  footBone.getWorldQuaternion(q);
  footLockedWorldQuat[limb] = q.clone();
}

// 每幀呼叫：把腳掌的本地旋轉，反推成「能讓世界旋轉貼住鎖存值」的值。
// 必須在該腿的 solveTwoBoneIK 算完 root/mid 新世界旋轉「之後」執行，
// 這樣才是用本幀最新的父骨骼世界旋轉反推，不會有一幀落差。
function applyFootLock(limb){
  const lockedQuat = footLockedWorldQuat[limb];
  if (!lockedQuat || !ikEnabled[limb]) return;
  const chain = IK_CHAINS[limb];
  applyBoneWorldQuatLock(bones[chain.end], lockedQuat);
}

// 核心數學：讓某根骨骼的「世界旋轉」貼住指定的鎖存值，作法是用父骨骼目前的世界旋轉反推出
// 需要的本地旋轉。從 applyFootLock 抽出來，蹲彈律動（applySquatGroove）也需要同一套邏輯，
// 但套用時機/鎖存來源不同（不是靠 ikEnabled 開關），所以拆成不吃開關判斷的純函式共用。
function selectIKMarker(limb, role, index){
  tgCancelPreview();
  waveTrackActive=false;
  if(waveRun)stopWave();
  if(laPathRun&&limb==="lookAt_"+laPathRun.name)return;
  if(limb==="lookAt_head"&&headFollowSource!=="free")return;
  if(limb.startsWith("lookAt_")&&handFollowSource[limb.slice(7)]==="other")return;
  if (isFootPlanted(limb) && role === "target") return;
  selectedKey = null;
  transformControls.detach();
  selectedIK = (role === "trajPoint") ? { limb, role, index } : { limb, role };
  let mesh;
  if (limb === "spine") mesh = spineIKTargetMesh;
  else if (limb.startsWith("lookAt_")) mesh = lookAtTargetMesh[limb.slice(7)];
  else if (limb.startsWith(FINGER_IK_PREFIX)) mesh = fingerIKTargetMeshes[limb.slice(FINGER_IK_PREFIX.length)];
  else if (role === "trajPoint") mesh = trajPointMeshes[limb][index];
  else mesh = role === "target" ? ikTargetMeshes[limb] : ikPoleMeshes[limb];
  if (!mesh) { selectedIK = null; return; }
  transformControlsIK.attach(mesh);
  highlightMarkers();
  highlightIKMarkers();
  updateSelectedBar();
  renderTrajPointList();
}

function highlightIKMarkers(){
  for (const limb of IK_LIMB_KEYS){
    const isTargetSel = !!(selectedIK && selectedIK.limb === limb && selectedIK.role === "target");
    const isPoleSel = !!(selectedIK && selectedIK.limb === limb && selectedIK.role === "pole");
    if (ikTargetMeshes[limb]) ikTargetMeshes[limb].scale.setScalar(isTargetSel ? 1.5 : 1.0);
    if (ikPoleMeshes[limb]) ikPoleMeshes[limb].scale.setScalar(isPoleSel ? 1.5 : 1.0);
  }
  if (spineIKTargetMesh){
    const isSpineSel = !!(selectedIK && selectedIK.limb === "spine");
    spineIKTargetMesh.scale.setScalar(isSpineSel ? 1.5 : 1.0);
  }
  for (const name of Object.keys(LOOKAT_CONFIG)){
    if (!lookAtTargetMesh[name]) continue;
    const isSel = !!(selectedIK && selectedIK.limb === "lookAt_" + name);
    lookAtTargetMesh[name].scale.setScalar(isSel ? 1.5 : 1.0);
  }
  for (const limb of IK_LIMB_KEYS){
    trajPointMeshes[limb].forEach((m, idx) => {
      const isSel = !!(selectedIK && selectedIK.limb === limb && selectedIK.role === "trajPoint" && selectedIK.index === idx);
      m.scale.setScalar(isSel ? 1.6 : 1.0);
    });
  }
  for (const fingerId of FINGER_IDS){
    if (!fingerIKTargetMeshes[fingerId]) continue;
    const isSel = !!(selectedIK && selectedIK.limb === FINGER_IK_PREFIX + fingerId);
    fingerIKTargetMeshes[fingerId].scale.setScalar(isSel ? 1.5 : 1.0);
  }
}

function updateSpineIKButton(){
  const btn = document.getElementById("spineIKBtn");
  if (btn) btn.classList.toggle("active", spineIKEnabled);
}

function updateIKButtons(){
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("ikBtn_" + limb);
    if (btn) btn.classList.toggle("active", ikEnabled[limb]);
  }
}

function bindGrabBoxUI(){
  if (!grabBoxCore) return;
  mountGrabBoxUI(document.getElementById("tabGrabBox"), grabBoxCore);
}

function bindIKUI(){
  document.getElementById("footPlantCb").onchange = e => {
    pushHistory();
    setFootPlantEnabled(e.target.checked);
    solveFootPlant();
    pushHistory(); scheduleAutoSave();
  };
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("ikBtn_" + limb);
    if (btn) btn.onclick = () => { pushHistory(); setIKEnabled(limb, !ikEnabled[limb]); pushHistory(); scheduleAutoSave(); };
  }
  updateIKButtons();

  const spineBtn = document.getElementById("spineIKBtn");
  if (spineBtn) spineBtn.onclick = () => setSpineIKEnabled(!spineIKEnabled);
  updateSpineIKButton();

  const spineRootFollowCb = document.getElementById("rootFollow_spine");
  if (spineRootFollowCb) spineRootFollowCb.onchange = (e) => { spineRootFollowEnabled = e.target.checked; };

  for (const limb of ["rArm", "lArm"]){
    const cb = document.getElementById("rootFollow_" + limb);
    if (cb) cb.onchange = (e) => { ikRootFollowEnabled[limb] = e.target.checked; };
  }

  for (const name of Object.keys(LOOKAT_CONFIG)){
    const btn = document.getElementById("lookAtBtn_" + name);
    if (btn) btn.onclick = () => {if(kfPlaying)return;pushHistory();setLookAtEnabled(name, !lookAtEnabled[name]);pushHistory();scheduleAutoSave();};
  }
  updateLookAtButtons();

  const dualAnchorCb = document.getElementById("dualAnchorCb");
  if (dualAnchorCb) dualAnchorCb.onchange = (e) => { dualAnchorEnabled = e.target.checked; };
  const shoulderAssistCb = document.getElementById("shoulderAssistCb");
  if (shoulderAssistCb) shoulderAssistCb.onchange = (e) => { shoulderAssistEnabled = e.target.checked; };
  const handCollisionCb = document.getElementById("handCollisionCb");
  if (handCollisionCb) handCollisionCb.onchange = (e) => { handCollisionEnabled = e.target.checked; };
  const handHandCollisionCb = document.getElementById("handHandCollisionCb");
  if (handHandCollisionCb) handHandCollisionCb.onchange = (e) => { handHandCollisionEnabled = e.target.checked; };

  // ---- 手部-身體碰撞：膠囊/球半徑滑桿（4段軀幹 + 4段腿 + 1顆頭 + 1個手掌球），
  // 即時寫回 ALL_BODY_CAPSULES（其實就是 TORSO_CAPSULES/LEG_CAPSULES/HEAD_CAPSULES 的物件參照）/ HAND_COLLISION_RADIUS ----
  function refreshHandCollisionSliderUI(){
    ALL_BODY_CAPSULES.forEach((cap, i) => {
      const s = document.getElementById("hcRadiusSlider_" + i);
      const v = document.getElementById("hcRadiusVal_" + i);
      if (s) s.value = String(cap.radius);
      if (v) v.textContent = cap.radius.toFixed(3);
    });
    const hs = document.getElementById("hcHandRadiusSlider");
    const hv = document.getElementById("hcHandRadiusVal");
    if (hs) hs.value = String(HAND_COLLISION_RADIUS);
    if (hv) hv.textContent = HAND_COLLISION_RADIUS.toFixed(3);
  }
  refreshHandCollisionSliderUI(); // 開頁先把滑桿位置同步成 loadHandCollisionRadii() 還原出來的值

  ALL_BODY_CAPSULES.forEach((cap, i) => {
    const slider = document.getElementById("hcRadiusSlider_" + i);
    const val = document.getElementById("hcRadiusVal_" + i);
    if (!slider) return;
    slider.oninput = (e) => {
      cap.radius = parseFloat(e.target.value);
      if (val) val.textContent = cap.radius.toFixed(3);
      saveHandCollisionRadii();
    };
  });
  const hcHandRadiusSlider = document.getElementById("hcHandRadiusSlider");
  const hcHandRadiusVal = document.getElementById("hcHandRadiusVal");
  if (hcHandRadiusSlider) hcHandRadiusSlider.oninput = (e) => {
    HAND_COLLISION_RADIUS = parseFloat(e.target.value);
    if (hcHandRadiusVal) hcHandRadiusVal.textContent = HAND_COLLISION_RADIUS.toFixed(3);
    saveHandCollisionRadii();
  };
  const hcRadiusResetBtn = document.getElementById("hcRadiusResetBtn");
  if (hcRadiusResetBtn) hcRadiusResetBtn.onclick = () => {
    ALL_BODY_CAPSULES.forEach((cap, i) => { cap.radius = ALL_BODY_CAPSULE_RADIUS_DEFAULTS[i]; });
    HAND_COLLISION_RADIUS = HAND_COLLISION_RADIUS_DEFAULT;
    refreshHandCollisionSliderUI();
    saveHandCollisionRadii();
  };

  // ---- 進階/阻尼設定：身體跟隨阻尼、脊椎CCD阻尼 ----
  const rootFollowDampSlider = document.getElementById("rootFollowDampSlider");
  const rootFollowDampVal = document.getElementById("rootFollowDampVal");
  const spineCCDDampSlider = document.getElementById("spineCCDDampSlider");
  const spineCCDDampVal = document.getElementById("spineCCDDampVal");
  if (rootFollowDampSlider) rootFollowDampSlider.oninput = (e) => {
    ROOT_FOLLOW_LERP_T = parseFloat(e.target.value);
    if (rootFollowDampVal) rootFollowDampVal.textContent = ROOT_FOLLOW_LERP_T.toFixed(2);
  };
  if (spineCCDDampSlider) spineCCDDampSlider.oninput = (e) => {
    spineCCDDamping = parseFloat(e.target.value);
    if (spineCCDDampVal) spineCCDDampVal.textContent = spineCCDDamping.toFixed(2);
  };
  const resetDampingBtn = document.getElementById("resetDampingBtn");
  if (resetDampingBtn) resetDampingBtn.onclick = () => {
    ROOT_FOLLOW_LERP_T = ROOT_FOLLOW_LERP_T_DEFAULT;
    spineCCDDamping = SPINE_CCD_DAMPING_DEFAULT;
    if (rootFollowDampSlider) rootFollowDampSlider.value = String(ROOT_FOLLOW_LERP_T_DEFAULT);
    if (spineCCDDampSlider) spineCCDDampSlider.value = String(SPINE_CCD_DAMPING_DEFAULT);
    if (rootFollowDampVal) rootFollowDampVal.textContent = ROOT_FOLLOW_LERP_T_DEFAULT.toFixed(2);
    if (spineCCDDampVal) spineCCDDampVal.textContent = SPINE_CCD_DAMPING_DEFAULT.toFixed(2);
  };

  const selectBodyBtn = document.getElementById("selectBodyBtn");
  if (selectBodyBtn) selectBodyBtn.onclick = selectBodyMarker;

  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("orientBtn_" + limb);
    if (btn) btn.onclick = () => {if(kfPlaying)return;pushHistory();setEffectorOrientEnabled(limb, !effectorOrientEnabled[limb]);pushHistory();scheduleAutoSave();};
  }
  updateEffectorOrientButtons();

  const ikModeBtn = document.getElementById("ikModeBtn");
  if (ikModeBtn) ikModeBtn.onclick = () => {
    const newMode = transformControlsIK.getMode() === "translate" ? "rotate" : "translate";
    transformControlsIK.setMode(newMode);
    updateSelectedBar();
  };
}

// ---- 軌跡分頁 UI 綁定 ----
function bindTrajUI(){
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("trajLimbBtn_" + limb);
    if (btn) btn.onclick = () => setTrajActiveLimb(limb);
  }
  updateTrajLimbButtons();

  const modeSel = document.getElementById("trajModeSelect");
  if (modeSel){
    modeSel.value = TRAJ_MODE[trajActiveLimb];
    modeSel.onchange = (e) => {
      TRAJ_MODE[trajActiveLimb] = e.target.value;
      updateTrajVisual(trajActiveLimb);
      scheduleAutoSave();
    };
  }

  const closedChk = document.getElementById("trajClosedChk");
  if (closedChk){
    closedChk.onchange = (e) => {
      TRAJ_CLOSED[trajActiveLimb] = e.target.checked;
      updateTrajVisual(trajActiveLimb);
      scheduleAutoSave();
    };
  }

  const addBtn = document.getElementById("trajAddPointBtn");
  if (addBtn) addBtn.onclick = () => addTrajPoint(trajActiveLimb);

  const clearBtn = document.getElementById("trajClearPointsBtn");
  if (clearBtn) clearBtn.onclick = () => clearTrajPoints(trajActiveLimb);

  const sampleSlider = document.getElementById("trajSampleSlider");
  const sampleVal = document.getElementById("trajSampleVal");
  if (sampleSlider){
    sampleSlider.value = String(trajSampleCount);
    sampleSlider.oninput = (e) => {
      trajSampleCount = parseInt(e.target.value, 10);
      if (sampleVal) sampleVal.textContent = String(trajSampleCount);
    };
  }
  if (sampleVal) sampleVal.textContent = String(trajSampleCount);

  const genBtn = document.getElementById("trajGenerateBtn");
  if (genBtn) genBtn.onclick = () => { generateKeyframesFromTrajectory(trajActiveLimb); pushHistory(); };

  bindTrajShapeGenUI();
  renderTrajPointList();
}

// 形狀產生器（圓形／橢圓形／正多邊形／星形）綁定：跟其他軌跡控制項獨立拆出來，因為切換
// 「形狀類型」需要連動顯示/隱藏對應欄位（橢圓的短半徑、星形的內凹比例）並調整點數/邊數的預設範圍，
// 邏輯比其他單純的 onchange 多一點。
function bindTrajShapeGenUI(){
  const typeSel = document.getElementById("trajShapeTypeSelect");
  const sidesInput = document.getElementById("trajShapeSidesInput");
  const sidesLabel = document.getElementById("trajShapeSidesLabel");
  const radiusInput = document.getElementById("trajShapeRadiusInput");
  const radiusLabel = document.getElementById("trajShapeRadiusLabel");
  const radiusYInput = document.getElementById("trajShapeRadiusYInput");
  const radiusYLabel = document.getElementById("trajShapeRadiusYLabel");
  const innerRatioInput = document.getElementById("trajShapeInnerRatioInput");
  const innerRatioLabel = document.getElementById("trajShapeInnerRatioLabel");
  const planeSel = document.getElementById("trajShapePlaneSelect");
  const genShapeBtn = document.getElementById("trajGenShapeBtn");
  if (!typeSel || !sidesInput || !genShapeBtn) return;

  // 依形狀類型切換：點數/邊數欄位的標籤與合理範圍、半徑欄位的標籤、要顯示哪些額外欄位
  // （橢圓形要顯示短半徑；星形要顯示內凹比例；圓形/多邊形都不需要，維持隱藏）。
  function syncFieldsForType(){
    const type = typeSel.value;
    radiusYLabel.style.display = (type === "ellipse") ? "" : "none";
    radiusYInput.style.display = (type === "ellipse") ? "" : "none";
    innerRatioLabel.style.display = (type === "star") ? "" : "none";
    innerRatioInput.style.display = (type === "star") ? "" : "none";
    radiusLabel.textContent = (type === "ellipse") ? "長半徑(公尺)" : "半徑(公尺)";

    if (type === "circle" || type === "ellipse"){
      sidesLabel.textContent = "點數";
      sidesInput.min = "8"; sidesInput.max = "48";
      if (parseInt(sidesInput.value, 10) < 8) sidesInput.value = "20";
    } else if (type === "star"){
      sidesLabel.textContent = "角數";
      sidesInput.min = "3"; sidesInput.max = "12";
      if (parseInt(sidesInput.value, 10) > 12) sidesInput.value = "5";
    } else { // polygon
      sidesLabel.textContent = "邊數";
      sidesInput.min = "3"; sidesInput.max = "12";
      if (parseInt(sidesInput.value, 10) > 12) sidesInput.value = "5";
    }
  }
  typeSel.onchange = syncFieldsForType;
  syncFieldsForType();

  genShapeBtn.onclick = () => {
    const shapeType = typeSel.value;
    const n = parseInt(sidesInput.value, 10) || (shapeType === "star" ? 5 : (shapeType === "polygon" ? 5 : 20));
    const radius = parseFloat(radiusInput.value) || 0.15;
    const plane = planeSel.value;
    // 短半徑（radiusY）只有橢圓形才有意義；圓形/多邊形/星形一律不傳，讓 rX/rY 都等於 radius，
    // 避免隱藏欄位裡殘留的舊數值（例如上次用橢圓形留下的 0.08）污染到其他形狀，
    // 造成「明明選圓形/星形，卻被拉成橢圓、放大後越來越狹長」的問題。
    const opts = {
      radiusY: (shapeType === "ellipse") ? (parseFloat(radiusYInput.value) || radius) : radius,
      innerRatio: parseFloat(innerRatioInput.value) || 0.5,
    };
    generateShapeTrajPoints(trajActiveLimb, shapeType, n, radius, plane, opts);
  };
}

// 所有目前「可被點擊」的球（關節球 + 可見的 IK 目標球／極向球），自己過濾 visible，
// 不依賴 Raycaster 是否會自動跳過隱藏物件。
function allPickableMeshes(){
  const list = laCustomMeshes.filter(m=>m.visible);
  for (const key in markerMeshes){ if (markerMeshes[key].visible) list.push(markerMeshes[key]); }
  for (const limb of IK_LIMB_KEYS){
    if (ikTargetMeshes[limb] && ikTargetMeshes[limb].visible) list.push(ikTargetMeshes[limb]);
    if (ikPoleMeshes[limb] && ikPoleMeshes[limb].visible) list.push(ikPoleMeshes[limb]);
  }
  if (spineIKTargetMesh && spineIKTargetMesh.visible) list.push(spineIKTargetMesh);
  for (const name of Object.keys(LOOKAT_CONFIG)){
    if (lookAtTargetMesh[name] && lookAtTargetMesh[name].visible) list.push(lookAtTargetMesh[name]);
  }
  for (const limb of IK_LIMB_KEYS){
    for (const m of trajPointMeshes[limb]) if (m.visible) list.push(m);
  }
  for (const fingerId of FINGER_IDS){
    if (fingerIKTargetMeshes[fingerId] && fingerIKTargetMeshes[fingerId].visible) list.push(fingerIKTargetMeshes[fingerId]);
  }
  return list;
}

// ---- 點擊選取關節 ----
function setupPickRaycaster(){
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let downX = 0, downY = 0;

  const dom = renderer.domElement;
  dom.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });

  dom.addEventListener("pointerup", (e) => {
    // suppressClick 會在剛拖完控制環之後短暫為 true，避免放開拖曳的那次 click 被誤判成「點空白處」
    if (suppressClick || transformControls.dragging || transformControlsIK.dragging || kfPlaying) return;
    const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (dist > 6) return;

    const rect = dom.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(allPickableMeshes());
    if (hits.length > 0){
      const obj = hits[0].object;
      const pickType = obj.userData.pickType;
      if (pickType === "laPoint") selectLACustom(obj.userData.index);
      else if (pickType === "ikTarget") selectIKMarker(obj.userData.limb, "target");
      else if (pickType === "ikPole") selectIKMarker(obj.userData.limb, "pole");
      else if (pickType === "spineIKTarget") selectIKMarker("spine", "target");
      else if (pickType === "lookAtTarget") selectIKMarker("lookAt_" + obj.userData.lookAtName, "target");
      else if (pickType === "trajPoint") selectIKMarker(obj.userData.limb, "trajPoint", obj.userData.index);
      else if (pickType === "fingerIKTarget") selectIKMarker(FINGER_IK_PREFIX + obj.userData.fingerId, "target");
      else selectJoint(obj.userData.jointKey);
    } else if (selectedKey || selectedIK){
      // 點到模型本身或空白處（沒點中任何球）：視為取消選取，收起控制環
      deselectJoint();
    }
  });

  // 按 Esc 取消目前選取，收起控制環（拍點播放中或沒有選取時忽略）
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (kfPlaying || (!selectedKey && !selectedIK)) return;
    deselectJoint();
  });
}

function selectJoint(key){
  tgCancelPreview();
  if(waveRun)stopWave();
  if (FOOT_PLANT_LIMBS.some(l => isFootPlanted(l) && IK_CHAINS[l].end === key)) return;
  if (!bones[key]) return;
  selectedIK = null;
  transformControlsIK.detach();
  selectedKey = key;
  transformControls.attach(bones[key]);
  highlightMarkers();
  highlightIKMarkers();
  updateSelectedBar();
}

function deselectJoint(){
  laCustomDrag=null;
  selectedKey = null;
  selectedIK = null;
  transformControls.detach();
  transformControlsIK.detach();
  highlightMarkers();
  highlightIKMarkers();
  updateSelectedBar();
  renderTrajPointList();
}

function updateSelectedBar(){
  updatePoleRadiusUI();
  const label = document.getElementById("selectedLabel");
  const angles = document.getElementById("selectedAngles");
  const spaceBtn = document.getElementById("spaceBtn");
  const snapLabel = document.getElementById("snapLabel");
  const snapSelect = document.getElementById("snapSelect");
  const zeroBtn = document.getElementById("zeroJointBtn");
  if(zeroBtn)zeroBtn.disabled=false;
  if(selectedIK?.role==='laPoint'){
    const m=laCustomMeshes[selectedIK.index];if(!m)return;
    label.textContent='LookAt 控制點 P'+(selectedIK.index+1);angles.textContent='X '+m.position.x.toFixed(3)+' Y '+m.position.y.toFixed(3)+' Z '+m.position.z.toFixed(3);
    for(const el of [spaceBtn,snapLabel,snapSelect,document.getElementById('ikModeBtn')])if(el)el.style.display='none';
    if(zeroBtn){zeroBtn.disabled=true;zeroBtn.textContent='請由控制點清單刪除';}return;
  }
  if (selectedIK){
    let labelText, mesh;
    if (selectedIK.limb === "spine"){
      labelText = `${SPINE_IK_CHAIN.label}・頭部目標球`;
      mesh = spineIKTargetMesh;
    } else if (selectedIK.limb.startsWith("lookAt_")){
      const name = selectedIK.limb.replace("lookAt_", "");
      labelText = `${LOOKAT_CONFIG[name].label}・Look-At目標球`;
      mesh = lookAtTargetMesh[name];
    } else if (selectedIK.limb.startsWith(FINGER_IK_PREFIX)){
      const fingerId = selectedIK.limb.slice(FINGER_IK_PREFIX.length);
      labelText = `${FINGER_IK_CHAINS[fingerId].label}・指尖目標球`;
      mesh = fingerIKTargetMeshes[fingerId];
    } else if (selectedIK.limb === "body"){
      labelText = "身體位置（整個角色，控制環顯示於髖部）";
      mesh = bodyGizmoProxy;
    } else if (selectedIK.role === "trajPoint"){
      const chain = IK_CHAINS[selectedIK.limb];
      const idx = selectedIK.index || 0;
      labelText = `${chain.label}・軌跡控制點 #${idx + 1}`;
      mesh = trajPointMeshes[selectedIK.limb][idx];
      if (!mesh){ deselectJoint(); return; }
    } else {
      const chain = IK_CHAINS[selectedIK.limb];
      labelText = `${chain.label}・${selectedIK.role === "target" ? "IK目標球" : "彎曲極向球"}`;
      mesh = selectedIK.role === "target" ? ikTargetMeshes[selectedIK.limb] : ikPoleMeshes[selectedIK.limb];
    }
    label.textContent = labelText;
    angles.textContent = `X ${mesh.position.x.toFixed(2)}  Y ${mesh.position.y.toFixed(2)}  Z ${mesh.position.z.toFixed(2)}`;
    if (spaceBtn) spaceBtn.style.display = "none";
    if (snapLabel) snapLabel.style.display = "none";
    if (snapSelect) snapSelect.style.display = "none";
    if (zeroBtn) zeroBtn.textContent = "重置此球位置";

    // 「位置/朝向」切換按鈕：只有手腳IK的目標球、且該肢體有開啟Effector朝向控制時才顯示，
    // 其他標記球（脊椎/look-at/極向球/身體）旋轉環拖了也沒有對應的求解邏輯讀取，顯示了只會困惑使用者
    const ikModeBtn = document.getElementById("ikModeBtn");
    const isArmLegTarget = IK_CHAINS[selectedIK.limb] && selectedIK.role === "target";
    if (ikModeBtn){
      if (isArmLegTarget && effectorOrientEnabled[selectedIK.limb]){
        ikModeBtn.style.display = "";
        ikModeBtn.textContent = "切換：" + (transformControlsIK.getMode() === "translate" ? "位置" : "朝向");
      } else {
        ikModeBtn.style.display = "none";
        transformControlsIK.setMode("translate"); // 離開這類標記球時強制切回位置模式，避免殘留旋轉模式影響其他標記球
      }
    }
    return;
  }

  if (spaceBtn) spaceBtn.style.display = "";
  if (snapLabel) snapLabel.style.display = "";
  if (snapSelect) snapSelect.style.display = "";
  if (zeroBtn) zeroBtn.textContent = "此關節歸零";
  const ikModeBtnHide = document.getElementById("ikModeBtn");
  if (ikModeBtnHide) ikModeBtnHide.style.display = "none";

  if (!selectedKey){
    label.textContent = "未選取";
    angles.textContent = "";
    return;
  }
  label.textContent = LABEL_LOOKUP[selectedKey] || selectedKey;
  const a = poseController.getTarget(selectedKey) || [0,0,0];
  angles.textContent = `X ${a[0].toFixed(1)}°  Y ${a[1].toFixed(1)}°  Z ${a[2].toFixed(1)}°`;
}

// 從骨骼目前的四元數反推「相對 rest pose」的角度，寫回 target/current
// 若換算出的角度超出關節限制，除了寫回 target/current 之外，也要把限制後的角度重新
// 寫回 bone.quaternion——否則拖曳關節球時骨骼視覺上已經轉超過上限，放開滑鼠才彈回去，
// 手感會很奇怪；直接在拖曳過程中把骨骼「頂」在限制邊界，才是使用者預期的卡住感。
function commitFromBone(key){
  if (!bones[key] || !restQuat[key]) return;
  poseController.syncFromBone(key, { clamp: true });
  setActiveBtn(-1);
  updateSelectedBar();
}

// ---- 姿勢套用 ----
// 統一入口：套用姿勢庫／JSON匯入／關鍵影格編輯時的角度賦值都經過這裡，
// 會先依 JOINT_LIMITS 夾緊角度，確保不管從哪個管道寫入都不會超出限制。
function setTarget(name, xyz){
  tgCancelPreview();
  poseController.setTarget(name, xyz);
}

function applyPose(p){
  waveTrackActive=false;
  if(waveRun)stopWave();
  if (ALL_JOINT_KEYS.some(key => p[key])) tgCancelPreview();
  poseController.applyPose(p);
  updateSelectedBar();
}

function resetPose(){
  if(waveRun)stopWave();
  poseController.reset();
  applyPose(IDLE_POSE);
  resetBodyTransform();
  poseIndex = 0;
  setActiveBtn(0);
}

// 註：這裡原本會去切換 #poseBtns 底下按鈕的 active 樣式，但頁面上已經沒有
// id="poseBtns" 這個容器了（姿勢快捷按鈕功能已移除），這行查詢一定是空清單、
// 完全不會有效果，屬於死程式碼，故清空函式內容。呼叫端（各處 setActiveBtn(...)）
// 保留不動，維持呼叫介面相容，之後如果要恢復姿勢按鈕功能可以直接在這裡補回邏輯。
function setActiveBtn(i){
}

// ---- JSON 匯出/匯入（單一姿勢） ----
function refreshJsonArea(){
  const out = {};
  for (const k of ALL_JOINT_KEYS) out[k] = poseController.getTarget(k).map(v => Math.round(v*10)/10);
  document.getElementById("jsonArea").value = JSON.stringify(out, null, 2);
  updateJsonRefTable(); // 文字框內容變了（重新整理/切分頁進來），對照表也要跟著同步
}

function applyJson(){
  if(waveRun)stopWave();
  try {
    const parsed = JSON.parse(document.getElementById("jsonArea").value);
    for (const k of ALL_JOINT_KEYS){
      if (Array.isArray(parsed[k]) && parsed[k].length === 3) setTarget(k, parsed[k]);
    }
    setActiveBtn(-1);
    updateSelectedBar();
    return true;
  } catch (e){
    alert("JSON 格式錯誤：" + e.message);
    return false;
  }
}

// ---- JSON 面板：中文對照表 ----
// 目的：使用者不需要記得 "rForeArm"、"lHandThumb1" 這類內部英文 key 對應身體哪個部位，
// 也能在動手改 JSON 文字時「即時」核對每個 key 打的角度對不對、格式有沒有錯。
// 設計上刻意不做成表單（不直接綁定雙向輸入），維持「文字框仍是唯一編輯真相來源」，
// 對照表純顯示＋即時解析回饋，跟原本「複製貼上一整份 JSON」的工作流程完全相容。
let jsonRefRowEls = {}; // key -> 值那一格的 <span>
let jsonRefGroupCollapsed = {}; // groupId -> bool，跟總覽面板各自獨立的展開/收合狀態

// 重建對照表 DOM 結構（分組、順序沿用 OVERVIEW_GROUPS，不重複定義一份）；
// 只在模型載入完成、或使用者按展開/收合全部時呼叫，逐字輸入時走 updateJsonRefTable() 純更新文字。
function buildJsonRefTable(){
  const container = document.getElementById("jsonRefTable");
  if (!container) return;
  container.innerHTML = "";
  jsonRefRowEls = {};

  for (const group of OVERVIEW_GROUPS){
    const keys = group.keys.filter(k => bones[k]);
    if (keys.length === 0) continue;

    const body = document.createElement("div");
    const collapsed = jsonRefGroupCollapsed[group.id] ?? !!group.collapsedByDefault;
    body.className = "jrGroupBody" + (collapsed ? " collapsed" : "");

    for (const key of keys){
      const row = document.createElement("div");
      row.className = "jrRow";
      const nameEl = document.createElement("span");
      nameEl.className = "jrName"; nameEl.textContent = LABEL_LOOKUP[key] || key; nameEl.title = LABEL_LOOKUP[key] || key;
      const keyEl = document.createElement("span");
      keyEl.className = "jrKey"; keyEl.textContent = key; keyEl.title = "JSON 裡對應的 key：\"" + key + "\"";
      const valEl = document.createElement("span");
      valEl.className = "jrVal jrDim"; valEl.textContent = "—";
      row.append(nameEl, keyEl, valEl);
      body.appendChild(row);
      jsonRefRowEls[key] = valEl;
    }

    const groupEl = document.createElement("div");
    groupEl.className = "jrGroup";
    const head = document.createElement("div");
    head.className = "ovGroupHead" + (collapsed ? " collapsed" : "");
    head.innerHTML = `<span><span class="ovCaret">▾</span>${group.label}</span><span class="ovCount">${keys.length} 個關節</span>`;
    head.onclick = () => {
      const nowCollapsed = !body.classList.contains("collapsed");
      body.classList.toggle("collapsed", nowCollapsed);
      head.classList.toggle("collapsed", nowCollapsed);
      jsonRefGroupCollapsed[group.id] = nowCollapsed;
    };
    groupEl.append(head, body);
    container.appendChild(groupEl);
  }

  updateJsonRefTable();
}

// 純粹讀取目前 jsonArea 文字框內容並嘗試解析，更新對照表每一列的顯示文字/顏色，
// 完全不寫回 target、不影響模型——真正套用仍要按「套用 JSON」鈕，維持單一真相來源。
function updateJsonRefTable(){
  const area = document.getElementById("jsonArea");
  const errBanner = document.getElementById("jsonRefError");
  if (!area || Object.keys(jsonRefRowEls).length === 0) return;

  let parsed = null, parseOk = true;
  try {
    parsed = JSON.parse(area.value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("最外層必須是物件");
  } catch (e){
    parseOk = false;
  }
  if (errBanner) errBanner.style.display = parseOk ? "none" : "";

  for (const key in jsonRefRowEls){
    const el = jsonRefRowEls[key];
    el.classList.remove("jrOk", "jrErr", "jrDim");
    if (!parseOk){
      el.textContent = "（JSON 尚未寫完整或有語法錯誤）";
      el.classList.add("jrDim");
      continue;
    }
    const v = parsed[key];
    if (v === undefined){
      el.textContent = "未設定（套用時會維持原角度）";
      el.classList.add("jrDim");
      continue;
    }
    if (!Array.isArray(v) || v.length !== 3 || v.some(n => typeof n !== "number" || !isFinite(n))){
      el.textContent = "格式錯誤，應為 [X,Y,Z] 三個數字";
      el.classList.add("jrErr");
      continue;
    }
    el.textContent = `X ${v[0].toFixed(1)}°  Y ${v[1].toFixed(1)}°  Z ${v[2].toFixed(1)}°`;
    el.classList.add("jrOk");
  }
}

function bindJsonRefUI(){
  const area = document.getElementById("jsonArea");
  if (area) area.addEventListener("input", updateJsonRefTable);
  const expandBtn = document.getElementById("jsonRefExpandAllBtn");
  const collapseBtn = document.getElementById("jsonRefCollapseAllBtn");
  if (expandBtn) expandBtn.onclick = () => { OVERVIEW_GROUPS.forEach(g => jsonRefGroupCollapsed[g.id] = false); buildJsonRefTable(); };
  if (collapseBtn) collapseBtn.onclick = () => { OVERVIEW_GROUPS.forEach(g => jsonRefGroupCollapsed[g.id] = true); buildJsonRefTable(); };
}

// ---- 動作姿勢庫／掌指手勢庫：共用小工具 ----
// 姿勢庫存「身體」關節（ALL_JOINT_KEYS 扣掉手指30鍵）；手勢庫只存手指30鍵，
// 兩者互相獨立，套用姿勢不會動到手指、套用手勢不會動到身體，可以自由混搭。
const POSE_LIB_KEY = "tuttingPoseLibrary_v1";
const GESTURE_LIB_KEY = "tuttingGestureLibrary_v1";
const BODY_LIB_JOINT_KEYS = ALL_JOINT_KEYS.filter(k => !FINGER_JOINT_KEY_SET.has(k));

function makeLibId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---- 資料庫 schema 版本控管 ----
// 目前寫入 localStorage 的格式固定為 { v: CURRENT_LIB_SCHEMA_VERSION, items: [...] }。
// 舊版（本次更新之前）直接把陣列存進 localStorage，沒有版本欄位；讀取時偵測到「純陣列」
// 就視為 legacy 格式自動轉換，之後存回去就會變成新的 envelope 格式。
// 未來如果要調整 items 內部資料結構，把版本號 +1，並在 LIB_MIGRATIONS 加一個
// `[舊版本號]: (items) => 轉換後的items` 的函式即可，不會讓舊使用者的資料讀壞或消失。
const CURRENT_LIB_SCHEMA_VERSION = 1;
const LIB_MIGRATIONS = {
  // 範例（尚未使用）： 2: (items) => items.map(it => ({...it, someNewField: ""}))
};

function migrateLibraryItems(fromVersion, items){
  let v = fromVersion;
  let out = items;
  while (v < CURRENT_LIB_SCHEMA_VERSION){
    const step = LIB_MIGRATIONS[v];
    if (typeof step === "function") out = step(out);
    v++;
  }
  return out;
}

function loadLibraryFromStorage(key){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)){
      // legacy 格式（無版本號的純陣列）：視為版本 1，跑一次遷移（目前版本=1所以不會做任何事，
      // 但保留這個分支是為了未來版本升級時舊資料仍然讀得到）。
      return migrateLibraryItems(1, parsed);
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)){
      const fromV = Number.isFinite(parsed.v) ? parsed.v : 1;
      return migrateLibraryItems(fromV, parsed.items);
    }
    return [];
  } catch (e){
    console.warn("讀取資料庫失敗，可能是儲存內容毀損：", key, e);
    return [];
  }
}

// 粗估這個 key 目前佔用的位元組數（localStorage 是 UTF-16，字元數*2估算）。
function estimateKeyBytes(key){
  const raw = localStorage.getItem(key);
  return raw ? raw.length * 2 : 0;
}
const LIB_STORAGE_KEYS = () => [POSE_LIB_KEY, GESTURE_LIB_KEY, MOVE_LIB_KEY, GROOVE_LIB_KEY];
// 大多數瀏覽器每個來源(origin)的 localStorage 上限落在 5–10MB，這裡保守抓 5MB 當警戒基準。
const ESTIMATED_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;
function formatBytes(n){
  if (n < 1024) return n + " B";
  if (n < 1024*1024) return (n/1024).toFixed(1) + " KB";
  return (n/1024/1024).toFixed(2) + " MB";
}
function getTotalLibraryStorageBytes(){
  return LIB_STORAGE_KEYS().reduce((sum, k) => sum + estimateKeyBytes(k), 0);
}

function saveLibraryToStorage(key, arr){
  const payload = JSON.stringify({ v: CURRENT_LIB_SCHEMA_VERSION, items: arr });
  try {
    localStorage.setItem(key, payload);
    renderStorageUsageIndicator();
    return true;
  } catch (e){
    console.warn("儲存庫寫入 localStorage 失敗：", e);
    // 寫入失敗時（通常是空間已滿）：記憶體裡的 items 其實還在（呼叫端還沒重整頁面），
    // 立刻自動幫使用者匯出一份 JSON 備份，避免這次的異動在重新整理後直接消失。
    try {
      downloadJSON(arr, "招式庫備份_寫入失敗_" + Date.now() + ".json");
      alert("儲存空間已滿，這次的變更無法存進瀏覽器！\n已自動幫你匯出一份 JSON 備份到下載資料夾，請先用「匯出全部」清出一些舊招式（例如刪除不需要的、或匯出後在別的裝置匯入），再繼續使用。");
    } catch (e2){
      alert("儲存失敗（瀏覽器儲存空間可能已滿），且自動備份也失敗了：" + e.message + "\n建議立即手動使用「匯出全部」把目前看得到的內容存下來。");
    }
    renderStorageUsageIndicator();
    return false;
  }
}

// 在畫面上顯示目前姿勢庫／手勢庫／招式庫共用的 localStorage 用量，並在快滿時提早示警
// （三個庫共用同一個瀏覽器儲存空間，所以用量要一起看，不能只看單一庫）。
function renderStorageUsageIndicator(){
  const used = getTotalLibraryStorageBytes();
  const pct = Math.min(100, Math.round(used / ESTIMATED_STORAGE_QUOTA_BYTES * 100));
  let text = `💾 姿勢／手勢／招式／律動庫共用空間：約 ${formatBytes(used)}（估計上限約 5MB 的 ${pct}%）`;
  const color = pct >= 90 ? "#ff6b6b" : (pct >= 70 ? "#f0b060" : "#6a6a9a");
  if (pct >= 90) text += "　⚠ 空間快滿了，建議盡快匯出備份並刪除不需要的項目";
  // 姿勢/手勢/招式庫分頁跟律動庫分頁各自有一個提示 span，共用同一份文字/顏色，不用分開算兩次。
  for (const id of ["libStorageUsageHint", "libStorageUsageHint2"]){
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = text;
    el.style.color = color;
  }
}
function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function sanitizeFilename(name){
  const s = String(name || "").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 40);
  return s || "未命名";
}
function readJSONFile(file, cb){
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { cb(JSON.parse(reader.result)); }
    catch (e){ alert("JSON 檔案解析失敗：" + e.message); }
  };
  reader.onerror = () => alert("讀取檔案失敗。");
  reader.readAsText(file);
}

// 渲染單一庫（姿勢庫或手勢庫）的清單 chips，共用同一套 DOM 結構／樣式（.libChip，見CSS）
// 修正說明：原本這裡是 `const empty = document.getElementById(emptyElId); host.innerHTML="";
// if (items.length===0) host.appendChild(empty);` ——一旦清單曾經「從空變有項目」，上面的
// host.innerHTML="" 就會把這個空狀態節點徹底踢出畫面，且沒有任何變數留著參照，下次清單又變回
// 空的時候 document.getElementById(emptyElId) 只會抓到 null，host.appendChild(null) 直接
// 拋例外，讓 render() 在跑到「更新項目筆數徽章」那行之前就中斷——這就是刪光最後一個項目後
// 徽章數字卡住不變、要重新整理頁面才會恢復正常的成因。改成不依賴任何可能已消失的舊節點，
// 每次都用呼叫端傳入、在 controller 剛建立、DOM 還是原始樣子時就先存好的文字重新建立節點。
function renderLibList(items, listElId, emptyElId, handlers, emptyText){
  const host = document.getElementById(listElId);
  host.innerHTML = "";
  if (items.length === 0){
    const empty = document.createElement("span");
    empty.id = emptyElId;
    empty.className = "libEmpty";
    empty.textContent = emptyText || "";
    host.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "libChip";

    const sel = document.createElement("button");
    sel.className = "sel";
    sel.title = "套用「" + item.name + "」";
    sel.onclick = () => handlers.apply(item);
    const nameSpan = document.createElement("span");
    nameSpan.className = "selName";
    nameSpan.textContent = item.name;
    sel.appendChild(nameSpan);
    if (typeof handlers.subtitle === "function"){
      const subText = handlers.subtitle(item);
      if (subText){
        const subSpan = document.createElement("span");
        subSpan.className = "selSub";
        subSpan.textContent = subText;
        sel.appendChild(subSpan);
      }
    }
    chip.appendChild(sel);

    if (typeof handlers.rename === "function"){
      const ren = document.createElement("button");
      ren.className = "ren";
      ren.textContent = "✎";
      ren.title = "重新命名「" + item.name + "」";
      ren.onclick = (ev) => { ev.stopPropagation(); handlers.rename(item); };
      chip.appendChild(ren);
    }

    const exp = document.createElement("button");
    exp.className = "exp";
    exp.textContent = "⬇";
    exp.title = "匯出「" + item.name + "」為 JSON 檔";
    exp.onclick = (ev) => { ev.stopPropagation(); handlers.exportOne(item); };
    chip.appendChild(exp);

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.title = "刪除「" + item.name + "」";
    del.onclick = (ev) => { ev.stopPropagation(); handlers.del(item); };
    chip.appendChild(del);

    host.appendChild(chip);
  });
}

// 工廠函式：產生一個獨立運作的「庫」控制器（姿勢庫／手勢庫／招式庫各建一個實例，邏輯完全共用不重複寫）
function createLibraryController(opts){
  // opts: { storageKey, captureFn, applyFn, listElId, emptyElId, filePrefix, itemLabel, subtitleFn?, extraDeleteWarning? }
  // extraDeleteWarning(item)：可選，回傳一段字串就會附加在刪除確認對話框裡（例如提醒這個項目正被別處引用）；不提供或回傳空值則維持原本的確認文字。
  let items = loadLibraryFromStorage(opts.storageKey);
  let filterText = "";

  // 空狀態提示文字：趁 controller 剛建立、DOM 還是 HTML 原始樣子時就先存起來，之後
  // renderLibList 顯示空狀態一律用這份文字重新建立節點，不再依賴可能已經被清空、找不到的舊節點
  // （見 renderLibList 內的修正說明）。
  const emptyOrigEl = document.getElementById(opts.emptyElId);
  const emptyText = emptyOrigEl ? emptyOrigEl.textContent : "";

  function persist(){ saveLibraryToStorage(opts.storageKey, items); }

  function render(){
    const q = filterText.trim().toLowerCase();
    const filtered = q ? items.filter(it => it.name.toLowerCase().includes(q)) : items;

    if (filtered.length === 0 && items.length > 0){
      // 清單本身不是空的，只是搜尋沒有結果——顯示不同提示，不要跟「從來沒存過」的空狀態混在一起
      const host = document.getElementById(opts.listElId);
      host.innerHTML = "";
      const msg = document.createElement("span");
      msg.className = "libEmpty";
      msg.textContent = `沒有符合「${filterText.trim()}」的${opts.itemLabel}。`;
      host.appendChild(msg);
    } else {
      renderLibList(filtered, opts.listElId, opts.emptyElId, {
        apply: (item) => { opts.applyFn(item.data); pushHistory(); },
        del: (item) => {
          let msg = `刪除${opts.itemLabel}「${item.name}」？此動作無法復原。`;
          if (typeof opts.extraDeleteWarning === "function"){
            const extra = opts.extraDeleteWarning(item);
            if (extra) msg += "\n\n" + extra;
          }
          if (!confirm(msg)) return;
          items = items.filter(x => x.id !== item.id);
          persist(); render();
        },
        exportOne: (item) => downloadJSON(item, opts.filePrefix + "_" + sanitizeFilename(item.name) + ".json"),
        subtitle: opts.subtitleFn,
        rename: (item) => {
          const next = prompt(`重新命名「${item.name}」為：`, item.name);
          if (next === null) return; // 使用者取消
          const clean = next.trim();
          if (!clean){ alert("名稱不能是空的。"); return; }
          item.name = clean;
          persist(); render();
        }
      }, emptyText);
    }
    if (typeof opts.onRender === "function") opts.onRender(items.length);
  }

  function setFilter(text){ filterText = text || ""; render(); }

  function saveCurrent(name){
    const clean = (name || "").trim() || ("未命名" + opts.itemLabel);
    items.push({ id: makeLibId(), name: clean, savedAt: Date.now(), data: opts.captureFn() });
    persist(); render();
  }

  function exportAll(){
    if (items.length === 0){ alert(`${opts.itemLabel}庫目前是空的，沒有可匯出的內容。`); return; }
    downloadJSON(items, opts.filePrefix + "庫_全部_" + Date.now() + ".json");
  }

  function importOne(file){
    readJSONFile(file, (obj) => {
      if (!obj || typeof obj !== "object" || !obj.data || typeof obj.data !== "object"){
        alert("檔案格式錯誤：找不到有效的" + opts.itemLabel + "資料（需含 data 欄位）。"); return;
      }
      items.push({ id: makeLibId(), name: (obj.name || ("匯入" + opts.itemLabel)), savedAt: Date.now(), data: obj.data });
      persist(); render();
    });
  }

  function importAll(file){
    readJSONFile(file, (arr) => {
      if (!Array.isArray(arr)){ alert("檔案格式錯誤：整批匯入需要一個 JSON 陣列。"); return; }
      const cleaned = arr
        .filter(x => x && typeof x === "object" && x.data && typeof x.data === "object")
        .map(x => ({ id: makeLibId(), name: (x.name || ("匯入" + opts.itemLabel)), savedAt: Date.now(), data: x.data }));
      if (cleaned.length === 0){ alert("檔案內沒有找到任何有效項目。"); return; }
      const merge = confirm(`偵測到 ${cleaned.length} 筆${opts.itemLabel}。\n按「確定」＝合併進現有清單；按「取消」＝整批取代現有清單。`);
      items = merge ? items.concat(cleaned) : cleaned;
      persist(); render();
    });
  }

  function saveData(name, data){
    const clean = (name || "").trim() || ("未命名" + opts.itemLabel);
    items.push({ id: makeLibId(), name: clean, savedAt: Date.now(), data });
    persist(); render();
  }

  return { render, saveCurrent, saveData, exportAll, importOne, importAll, setFilter, getItems: () => items.slice() };
}

// -- 動作姿勢庫：只讀寫身體關節（BODY_LIB_JOINT_KEYS），完全不碰手指 --
function captureCurrentBodyPose(){
  const data = {};
  for (const k of BODY_LIB_JOINT_KEYS) data[k] = (poseController.getTarget(k) || [0,0,0]).map(v => Math.round(v*10)/10);
  return data;
}
function applyBodyPoseData(data){
  for (const k of BODY_LIB_JOINT_KEYS){
    if (Array.isArray(data[k]) && data[k].length === 3) setTarget(k, data[k]);
  }
  setActiveBtn(-1);
  updateSelectedBar();
}

// -- 掌指手勢庫：只讀寫30個手指指節（FINGER_JOINT_KEYS），完全不碰身體 --
function captureCurrentGesture(){
  const data = {};
  for (const k of FINGER_JOINT_KEYS) data[k] = (poseController.getTarget(k) || [0,0,0]).map(v => Math.round(v*10)/10);
  return data;
}
function applyGestureData(data){
  if(waveRun)stopWave();
  for (const k of FINGER_JOINT_KEYS){
    if (Array.isArray(data[k]) && data[k].length === 3) setTarget(k, data[k]);
  }
  updateSelectedBar();
}

// -- 招式庫清單的輔助顯示：拍數／預估秒數／儲存時間，讓使用者不用點開就知道這招大概是什麼 --
function formatRelativeSavedTime(ts){
  if (!ts) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return "剛剛";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return diffMin + "分鐘前";
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return diffHr + "小時前";
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return diffDay + "天前";
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
function moveLibSubtitle(item){
  const frames = (item.data && Array.isArray(item.data.frames)) ? item.data.frames : [];
  const frameCount = frames.length;
  const totalBeats = frames.reduce((s, f) => s + (f && f.beats ? f.beats : 1), 0);
  // 用目前的 BPM 換算預估秒數；如果之後 BPM 改了，實際套用時長度會跟著新 BPM 走，這裡只是抓個大概。
  const ms = Math.round((60000 / bpm) * totalBeats);
  const sec = (ms / 1000).toFixed(1);
  const when = formatRelativeSavedTime(item.savedAt);
  return `${frameCount}拍・約${sec}秒${when ? "・" + when : ""}`;
}

// -- 招式庫：存「時間軸上一小段連續拍點」（一組動作組合），套用方式是「插入」而非「覆蓋」--
const MOVE_LIB_KEY = "tuttingMoveLibrary_v1";

// 讀「起始拍／結束拍」輸入框（1-based，對應畫面上的 F1、F2……），擷取那段拍點深拷貝存起來，
// 之後即使原本時間軸被編輯，已存的招式也不會被連動改到。
function captureSelectedMove(){
  const total = keyframes.length;
  if (total === 0){ alert("目前時間軸沒有任何拍點，請先到「拍點」分頁排好動作。"); return null; }
  const startEl = document.getElementById("moveLibStartInput");
  const endEl = document.getElementById("moveLibEndInput");
  let a = parseInt(startEl.value, 10);
  let b = parseInt(endEl.value, 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)){
    alert("請輸入有效的起始拍與結束拍（例如 1、4）。"); return null;
  }
  if (a > b) { const t = a; a = b; b = t; }
  a = Math.max(1, Math.min(a, total));
  b = Math.max(1, Math.min(b, total));
  const frames = JSON.parse(JSON.stringify(keyframes.slice(a - 1, b)));
  if (frames.length === 0) return null;
  return { frames };
}

// 插入到「目前選取拍點」之後；若沒有選取任何拍點，就接在整份編舞最尾端（方便依序把招式串成一整支舞）。
// 每次插入都重新深拷貝一份，避免同一招式插入兩次時，兩處拍點共用同一個物件參考。
function insertMoveData(data){
  if (!data || !Array.isArray(data.frames) || data.frames.length === 0){
    alert("這個招式資料格式錯誤或是空的。"); return;
  }
  const cloned = JSON.parse(JSON.stringify(data.frames));
  const insertAt = (kfEditingIndex >= 0 && kfEditingIndex < keyframes.length) ? kfEditingIndex + 1 : keyframes.length;
  keyframes.splice(insertAt, 0, ...cloned);
  kfEditingIndex = insertAt + cloned.length - 1;
  syncEasingControlsFromSelection();
  renderKeyframeChips();
  scheduleAutoSave();
}

function updateMoveLibRangeHint(){
  const hint = document.getElementById("moveLibRangeHint");
  if (hint) hint.textContent = `（目前時間軸共 ${keyframes.length} 拍）`;
}

// -- 律動庫：把「目前所有律動設定」（參與律動的關節＋各自振盪參數＋蹲彈律動開關與參數）整組
// 打包存成一個命名項目，供下面的「律動序列」依名稱取用（例如存一個「A律動」、一個「B律動」）。
// 跟姿勢庫／手勢庫／招式庫共用同一套 createLibraryController 架構，只是 capture/apply 的
// 對象換成律動系統的幾個全域變數而已，互動邏輯（存/套用/刪除/重新命名/匯出入）完全不用重寫。
const GROOVE_LIB_KEY = "tuttingGrooveLibrary_v1";

function captureCurrentGrooveConfig(){
  const out = {
    jointSet: Array.from(grooveJointSet),
    customParams: JSON.parse(JSON.stringify(grooveCustomParams)),
    squatEnabled: grooveSquatEnabled,
    squatCustom: JSON.parse(JSON.stringify(grooveSquatCustom))
  };
  // 若目前這組律動是自動生成出來、且之後沒被手動改過，就把來源（原型＋seed）一起存進去，
  // 之後才能「這組不錯，但我想再抖一點」——從同一個 seed 重現後微調，而不是整組重抽。
  if (grooveLastGenMeta) out.meta = JSON.parse(JSON.stringify(grooveLastGenMeta));
  return out;
}

// 讀檔容錯：過濾格式不對的欄位，避免壞資料（例如手動改壞的匯入JSON、或來自不同版本的檔案）
// 讓律動庫項目在套用/序列播放時算出 NaN 或非法波形。跟 restoreTimelineData 同一套防呆原則。
function sanitizeGrooveLibConfigData(data){
  const out = { jointSet: [], customParams: {}, squatEnabled: false, squatCustom: {} };
  if (!data || typeof data !== "object") return out;
  if (Array.isArray(data.jointSet)) out.jointSet = data.jointSet.filter(k => GROOVE_PRESETS[k]);
  if (data.customParams && typeof data.customParams === "object"){
    for (const key of Object.keys(data.customParams)){
      if (!GROOVE_PRESETS[key]) continue;
      const cleaned = sanitizeGrooveCustomEntry(data.customParams[key]);
      if (Object.keys(cleaned).length > 0) out.customParams[key] = cleaned;
    }
  }
  out.squatEnabled = !!data.squatEnabled;
  out.squatCustom = sanitizeGrooveSquatCustomEntry(data.squatCustom);
  // 自動生成來源（原型＋seed）：白名單放行，否則會跟其他未知欄位一起被濾掉，
  // 導致存進律動庫的自動生成項目一讀回來就失去「可重現」這個唯一好處。
  if (data.meta && typeof data.meta === "object"){
    const m = {};
    if (Number.isFinite(data.meta.seed)) m.seed = data.meta.seed >>> 0;
    if (typeof data.meta.archetype === "string" && GROOVE_ARCHETYPES[data.meta.archetype]) m.archetype = data.meta.archetype;
    if (Number.isFinite(data.meta.loopBeats) && data.meta.loopBeats > 0) m.loopBeats = data.meta.loopBeats;
    if (Number.isFinite(data.meta.energy)) m.energy = data.meta.energy;
    if (m.seed !== undefined && m.archetype !== undefined) out.meta = m; // 兩者缺一就無法重現，不留半套資料
  }
  return out;
}

// 「套用」一個律動庫項目＝把它整組寫回目前的手動全域設定（grooveJointSet 等），
// 效果等同使用者自己重新勾選/調整一次。只在「手動/舊版單一設定」模式下有意義；
// 若已經建立「律動序列」，播放時序列會直接讀庫項目資料本身，不透過這幾個全域變數。
function applyGrooveConfigData(rawData){
  const data = sanitizeGrooveLibConfigData(rawData);
  grooveJointSet = new Set(data.jointSet);
  grooveCustomParams = data.customParams;
  grooveSquatEnabled = data.squatEnabled;
  grooveSquatCustom = data.squatCustom;
  grooveLastGenMeta = data.meta || null; // 套用非自動生成的項目時會被清成 null，正確：那組確實沒有 seed 可重現
  refreshGrooveJointUI();
  renderGrooveSquatUI();
  scheduleAutoSave();
}

// 律動庫清單 chip 副標題：一眼看出這組律動包含幾個關節、蹲彈律動有沒有開，不用點開才知道內容。
function grooveLibSubtitle(item){
  const data = item.data || {};
  const jointCount = Array.isArray(data.jointSet) ? data.jointSet.length : 0;
  const squatTag = data.squatEnabled ? "蹲彈開" : "蹲彈關";
  const when = formatRelativeSavedTime(item.savedAt);
  // 自動生成的項目標上原型名稱：庫裡混了手調與自動生成時，一眼看得出哪些是機器抽的
  const m = data.meta;
  const genTag = (m && GROOVE_ARCHETYPES[m.archetype]) ? ("🤖" + GROOVE_ARCHETYPES[m.archetype].short + "・") : "";
  return `${genTag}${jointCount}個關節・${squatTag}${when ? "・" + when : ""}`;
}

// 直接把一組拍點推到時間軸最尾端（批次生成排舞用，不動 kfEditingIndex，效能較好，最後統一 render 一次）。
function appendMoveFrames(frames){
  const cloned = JSON.parse(JSON.stringify(frames));
  keyframes.push(...cloned);
}

// 從招式庫隨機抽 N 個招式接龍成一份排舞。replace=true 會先清空目前時間軸，false 則接在尾端繼續往後長。
function generateChoreographyFromMoves(replace){
  const items = moveLibCtrl.getItems();
  if (items.length === 0){ alert("招式庫目前是空的，請先在上面儲存至少一個招式。"); return; }

  const countEl = document.getElementById("moveGenCountInput");
  let count = parseInt(countEl.value, 10);
  if (!Number.isFinite(count) || count < 1) count = 1;
  count = Math.min(count, 50);
  const allowRepeat = document.getElementById("moveGenAllowRepeatChk").checked;

  if (replace){
    if (keyframes.length > 0 && !confirm("這會清空目前時間軸上所有拍點，改用招式庫隨機生成一份新的，確定嗎？")) return;
    keyframes = [];
  }

  let lastId = null;
  for (let i = 0; i < count; i++){
    let pick;
    if (items.length === 1 || allowRepeat){
      pick = items[Math.floor(Math.random() * items.length)];
    } else {
      const pool = items.filter(x => x.id !== lastId); // 避免連續兩段選到同一招式
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    lastId = pick.id;
    if (pick.data && Array.isArray(pick.data.frames) && pick.data.frames.length > 0){
      appendMoveFrames(pick.data.frames);
    }
  }

  kfEditingIndex = keyframes.length - 1;
  stopKeyframePlayback();
  syncEasingControlsFromSelection();
  renderKeyframeChips();
  scheduleAutoSave();
  pushHistory();
}

// 自動生成招式：連續呼叫 N 次既有的「動作生成」（沿用關節限制範圍／Isolation分組／機率設定），
// 每呼叫一次就記錄一格拍點快照，串成一個多拍的招式；只存進招式庫，不會動到目前時間軸上的內容。
function autoGenerateMove(frameCount){
  const eligibleKeys = JOINT_LIMIT_KEYS.filter(key => {
    if (!bones[key]) return false;
    const lim = JOINT_LIMITS[key];
    return lim.x.enabled || lim.y.enabled || lim.z.enabled;
  });
  if (eligibleKeys.length === 0){
    alert("目前沒有任何關節啟用限制範圍，請先到「關節限制」分頁至少設定一個關節的角度限制，才有範圍可以自動生成。");
    return null;
  }
  const frames = [];
  for (let i = 0; i < frameCount; i++){
    generateRandomPose(); // 沿用關節限制/Isolation設定隨機擺一個姿勢
    frames.push({
      angles: snapshotCurrentAngles(),
      body: snapshotBodyTransform(),
      easing: kfPendingEasing,
      beats: kfPendingBeats
    });
  }
  return frames;
}

let poseLibCtrl = null;
let gestureLibCtrl = null;
let moveLibCtrl = null;
let grooveLibCtrl = null;

function bindLibraryUI(){
  poseLibCtrl = createLibraryController({
    storageKey: POSE_LIB_KEY, captureFn: captureCurrentBodyPose, applyFn: applyBodyPoseData,
    listElId: "poseLibList", emptyElId: "poseLibEmpty", filePrefix: "姿勢", itemLabel: "姿勢"
  });
  gestureLibCtrl = createLibraryController({
    storageKey: GESTURE_LIB_KEY, captureFn: captureCurrentGesture, applyFn: applyGestureData,
    listElId: "gestureLibList", emptyElId: "gestureLibEmpty", filePrefix: "手勢", itemLabel: "手勢"
  });

  const poseNameInput = document.getElementById("poseLibNameInput");
  document.getElementById("poseLibSaveBtn").onclick = () => {
    poseLibCtrl.saveCurrent(poseNameInput.value);
    poseNameInput.value = "";
  };
  poseNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("poseLibSaveBtn").click(); });
  document.getElementById("poseLibExportAllBtn").onclick = () => poseLibCtrl.exportAll();
  document.getElementById("poseLibImportAllBtn").onclick = () => document.getElementById("poseLibImportAllFile").click();
  document.getElementById("poseLibImportAllFile").onchange = (e) => { poseLibCtrl.importAll(e.target.files[0]); e.target.value = ""; };
  document.getElementById("poseLibImportOneBtn").onclick = () => document.getElementById("poseLibImportOneFile").click();
  document.getElementById("poseLibImportOneFile").onchange = (e) => { poseLibCtrl.importOne(e.target.files[0]); e.target.value = ""; };

  const gestureNameInput = document.getElementById("gestureLibNameInput");
  document.getElementById("gestureLibSaveBtn").onclick = () => {
    gestureLibCtrl.saveCurrent(gestureNameInput.value);
    gestureNameInput.value = "";
  };
  gestureNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("gestureLibSaveBtn").click(); });
  document.getElementById("gestureLibExportAllBtn").onclick = () => gestureLibCtrl.exportAll();
  document.getElementById("gestureLibImportAllBtn").onclick = () => document.getElementById("gestureLibImportAllFile").click();
  document.getElementById("gestureLibImportAllFile").onchange = (e) => { gestureLibCtrl.importAll(e.target.files[0]); e.target.value = ""; };
  document.getElementById("gestureLibImportOneBtn").onclick = () => document.getElementById("gestureLibImportOneFile").click();
  document.getElementById("gestureLibImportOneFile").onchange = (e) => { gestureLibCtrl.importOne(e.target.files[0]); e.target.value = ""; };

  moveLibCtrl = createLibraryController({
    storageKey: MOVE_LIB_KEY, captureFn: captureSelectedMove, applyFn: insertMoveData,
    listElId: "moveLibList", emptyElId: "moveLibEmpty", filePrefix: "招式", itemLabel: "招式",
    subtitleFn: moveLibSubtitle,
    onRender: (count) => {
      const badge = document.getElementById("moveLibCount");
      if (badge) badge.textContent = count;
    }
  });
  const moveSearchInput = document.getElementById("moveLibSearchInput");
  if (moveSearchInput) moveSearchInput.addEventListener("input", () => moveLibCtrl.setFilter(moveSearchInput.value));

  const moveNameInput = document.getElementById("moveLibNameInput");
  document.getElementById("moveLibSaveBtn").onclick = () => {
    moveLibCtrl.saveCurrent(moveNameInput.value);
    moveNameInput.value = "";
  };
  moveNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("moveLibSaveBtn").click(); });
  document.getElementById("moveLibExportAllBtn").onclick = () => moveLibCtrl.exportAll();
  document.getElementById("moveLibImportAllBtn").onclick = () => document.getElementById("moveLibImportAllFile").click();
  document.getElementById("moveLibImportAllFile").onchange = (e) => { moveLibCtrl.importAll(e.target.files[0]); e.target.value = ""; };
  document.getElementById("moveLibImportOneBtn").onclick = () => document.getElementById("moveLibImportOneFile").click();
  document.getElementById("moveLibImportOneFile").onchange = (e) => { moveLibCtrl.importOne(e.target.files[0]); e.target.value = ""; };

  document.getElementById("moveLibUseCurAsStartBtn").onclick = () => {
    if (kfEditingIndex < 0){ alert("請先到「拍點」分頁點選一個拍點。"); return; }
    document.getElementById("moveLibStartInput").value = kfEditingIndex + 1;
  };
  document.getElementById("moveLibUseCurAsEndBtn").onclick = () => {
    if (kfEditingIndex < 0){ alert("請先到「拍點」分頁點選一個拍點。"); return; }
    document.getElementById("moveLibEndInput").value = kfEditingIndex + 1;
  };

  updateMoveLibRangeHint();
  document.getElementById("moveGenAppendBtn").onclick = () => generateChoreographyFromMoves(false);
  document.getElementById("moveGenReplaceBtn").onclick = () => generateChoreographyFromMoves(true);

  document.getElementById("moveAutoGenBtn").onclick = () => {
    const countEl = document.getElementById("moveAutoGenFrameCountInput");
    let n = parseInt(countEl.value, 10);
    if (!Number.isFinite(n) || n < 2) n = 2;
    n = Math.min(n, 12);
    const frames = autoGenerateMove(n);
    if (!frames) return;
    const nameEl = document.getElementById("moveAutoGenNameInput");
    const name = (nameEl.value || "").trim() || `自動招式_${moveLibCtrl.getItems().length + 1}`;
    moveLibCtrl.saveData(name, { frames });
    nameEl.value = "";
    updateSelectedBar();
  };

  poseLibCtrl.render();
  gestureLibCtrl.render();
  moveLibCtrl.render();
  renderStorageUsageIndicator();
}

// ---- 鏡像（左右對稱姿勢）----
// 左右成對的關節：鏡像時互換＋做世界空間鏡射；中軸關節（hips/spine系列/neck/head）：原地鏡射。
// 採用「世界四元數鏡射」而非針對各關節猜測要negate哪一軸角度——後者需要對這個特定rig
// 逐一試錯校準才知道對不對；世界四元數鏡射公式則是通用的數學結果，對任何bind pose都成立。
// 公式推導：改用「先算出鏡像後的目標世界四元數，再由上而下依骨架階層換算回本地旋轉」，
// 已用 Node.js 合成一個左右鏡像對稱的骨架模擬驗證：套任意FK姿勢後，鏡像結果的世界位置/朝向
// 誤差都在浮點極限(<1e-15)內，且雙重鏡像（右→左→右）能完全還原回原本姿勢（冪等性）。
const MIRROR_PAIR_KEYS = [
  ["rShoulder","lShoulder"], ["rArm","lArm"], ["rForeArm","lForeArm"], ["rHand","lHand"],
  ["rUpLeg","lUpLeg"], ["rLeg","lLeg"], ["rFoot","lFoot"]
];
const MIRROR_SELF_KEYS = ["hips","spine","spine1","spine2","neck","head"];

function reflectWorldQuat(q){
  // 世界空間對「角色左右中線」（X=0 平面，模型載入時已置中對齊）鏡射：
  // X、W 分量不變，Y、Z 分量反號（可由 R' = M·R·M 對可逆反射矩陣 M=diag(-1,1,1) 的
  // 共軛關係推導：鏡射會保留繞X軸的分量、但反轉繞Y/Z軸分量的旋轉手性）。
  return new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
}

// 鏡像「目前姿勢」（target[] 對應的FK角度）。若某肢體正開著IK，鏡像後下一幀該肢體的
// root/mid骨骼會被IK即時解算蓋回原本角度（IK目標球位置不會跟著鏡像）——這是刻意的範圍限制，
// 避免鏡像功能還要連動處理IK目標球/朝向控制球的鏡射，複雜度不成比例。若要鏡像IK姿勢，
// 建議先關閉該肢體IK，或鏡像後自行把目標球也拖到對稱位置。
function mirrorPose(){
  if (!model) return;

  // Step A：先把所有骨骼的本地旋轉設成「目前 target[] 對應的姿勢」（不是還在lerp中的current，
  // 也不是IK即時解算的殘留值），確保鏡像的是使用者當下設定的目標角度。
  poseController.applyTargetsToBones();
  model.updateMatrixWorld(true);

  // Step B：讀出每根骨骼目前的世界旋轉
  const worldQuats = {};
  for (const k of ALL_JOINT_KEYS){
    const bone = bones[k];
    if (!bone) continue;
    worldQuats[k] = bone.getWorldQuaternion(new THREE.Quaternion());
  }

  // Step C：決定每根骨骼「鏡像後應有」的世界旋轉——左右成對的互換＋鏡射，中軸骨骼原地鏡射
  const desiredWorldQuats = {};
  for (const k of MIRROR_SELF_KEYS){
    if (worldQuats[k]) desiredWorldQuats[k] = reflectWorldQuat(worldQuats[k]);
  }
  for (const [rk, lk] of MIRROR_PAIR_KEYS){
    if (worldQuats[rk]) desiredWorldQuats[lk] = reflectWorldQuat(worldQuats[rk]);
    if (worldQuats[lk]) desiredWorldQuats[rk] = reflectWorldQuat(worldQuats[lk]);
  }

  // Step D：由上而下（ALL_JOINT_KEYS 已是父在前、子在後的拓樸順序）把「鏡像後世界旋轉」
  // 換算回每根骨骼的本地旋轉並實際套用——子骨骼換算時，父骨骼的世界旋轉已經是鏡像後的新值。
  for (const k of ALL_JOINT_KEYS){
    const bone = bones[k];
    const desired = desiredWorldQuats[k];
    if (!bone || !desired) continue;
    if (bone.parent){
      const parentWorldQuat = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(parentWorldQuat.clone().invert().multiply(desired));
    } else {
      bone.quaternion.copy(desired);
    }
    bone.updateWorldMatrix(true, true);
  }

  // Step E：把套用後的本地旋轉反推回 target/current，讓鏡像結果可以被「新增拍點」記錄、
  // 也能在 JSON 分頁看到（跟兩節IK求解後 syncTargetFromBone 的用法一致）。
  for (const k of ALL_JOINT_KEYS) syncTargetFromBone(k);

  setActiveBtn(-1);
  updateSelectedBar();
}

// 對稱姿勢：跟「鏡像姿勢」共用同一套世界四元數鏡射機制，差別在於——
// 鏡像是「整體姿勢左右互換」，這個是「單向套用」：固定以右手/右腳目前角度為準，
// 把鏡射後的角度套到左手/左腳，右側跟中軸骨骼（hips/spine系列/neck/head）完全不動。
// 適合「已經擺好慣用（右）側的姿勢，想讓另一側變成對稱鏡像」的情境。
function symmetrizePose(){
  if (!model) return;

  poseController.applyTargetsToBones();
  model.updateMatrixWorld(true);

  const worldQuats = {};
  for (const k of ALL_JOINT_KEYS){
    const bone = bones[k];
    if (!bone) continue;
    worldQuats[k] = bone.getWorldQuaternion(new THREE.Quaternion());
  }

  // 只計算左側（lk）該套用的目標世界旋轉，右側（rk）跟中軸骨骼維持原樣不列入
  const desiredWorldQuats = {};
  for (const [rk, lk] of MIRROR_PAIR_KEYS){
    if (worldQuats[rk]) desiredWorldQuats[lk] = reflectWorldQuat(worldQuats[rk]);
  }

  for (const k of ALL_JOINT_KEYS){
    const bone = bones[k];
    const desired = desiredWorldQuats[k];
    if (!bone || !desired) continue;
    if (bone.parent){
      const parentWorldQuat = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(parentWorldQuat.clone().invert().multiply(desired));
    } else {
      bone.quaternion.copy(desired);
    }
    bone.updateWorldMatrix(true, true);
  }

  for (const k of ALL_JOINT_KEYS) syncTargetFromBone(k);

  setActiveBtn(-1);
  updateSelectedBar();
}

// ---- Undo / Redo（角度層級：關節角度＋拍點時間軸資料＋律動序列）----
// 刻意不涵蓋 IK 目標球/極向球位置、IK 開關狀態、身體(model)即時位置——
// 這些狀態要正確復原需要連動重建一堆求解邏輯（見各 setXxxEnabled 函式），
// 複雜度/風險不成比例，先聚焦在最常誤操作、價值最高的
// 「姿勢庫切換／JSON套用／拍點增刪改／律動序列增刪改排序」這幾類動作。
// 律動庫項目本身（勾關節/振幅波形等）跟其他素材庫一樣，刪除時走 confirm() 對話框而不進這裡，
// 兩者是不同層級的保護：素材庫刪除用「確認」防呆，時間軸上的排序操作用「復原」防呆。
function snapshotAngleState(){
  const targetClone = poseController.snapshotTarget();
  return {
    tuttingGenerator: snapshotTG(),
    generationRules: snapshotGenerationRules(),
    waveClips: waveClone(waveClips),
    waving: cleanWave(waveConfig),
    lookAtPath: cleanLAPath(laPathConfig),
    torsoLookAt: snapshotTorsoLookAt(),
    handAim: snapshotHandAim(),
    poleEditor: snapshotPoleEditor(),
    target: targetClone,
    footPlant: snapshotFootPlant(),
    keyframes: JSON.parse(JSON.stringify(keyframes)),
    grooveSequence: JSON.parse(JSON.stringify(grooveSequence)), // 律動序列跟拍點清單共用同一套 undo/redo，見下方 restoreSnapshot
    kfEditingIndex,
    poseIndex,
    kfPendingEasing,
    kfPendingBeats
  };
}

function pushHistory(){
  if (restoringHistory) return;
  const snap = snapshotAngleState();
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(snap);
  if (historyStack.length > HISTORY_MAX) historyStack.shift();
  historyIndex = historyStack.length - 1;
  updateUndoRedoButtons();
}

function restoreSnapshot(snap){
  tgCancelPreview();restoreGenerationRules(snap.generationRules);restoreTG(snap.tuttingGenerator);
  waveClips=cleanWaveClips(snap.waveClips);waveClipSelected=null;waveTrackActive=false;
  restoreWave(snap.waving);
  restoreLAPath(snap.lookAtPath);
  restoringHistory = true;
  poseController.restoreTarget(snap.target);
  restoreFootPlant(snap.footPlant);
  restorePoleEditor(snap.poleEditor);
  restoreHandAim(snap.handAim);
  restoreTorsoLookAt(snap.torsoLookAt);
  keyframes = JSON.parse(JSON.stringify(snap.keyframes));
  grooveSequence = JSON.parse(JSON.stringify(snap.grooveSequence || [])); // 舊快照(修正前存的)沒有這個欄位時，退回空序列，不影響復原其他狀態
  kfEditingIndex = snap.kfEditingIndex;
  kfMultiSelected.clear(); grooveMultiSelected.clear();
  grooveSeqSelectedIndex = -1;
  poseIndex = snap.poseIndex;
  kfPendingEasing = snap.kfPendingEasing;
  kfPendingBeats = snap.kfPendingBeats;
  setActiveBtn(-1);
  updateSelectedBar();
  syncEasingControlsFromSelection();
  updateKfMultiSelectBar();
  renderKeyframeChips();
  renderGrooveSeqChips();
  scheduleAutoSave();
  restoringHistory = false;
}

function undo(){
  if (kfPlaying || historyIndex <= 0) return;
  historyIndex--;
  restoreSnapshot(historyStack[historyIndex]);
  updateUndoRedoButtons();
}

function redo(){
  if (kfPlaying || historyIndex >= historyStack.length - 1) return;
  historyIndex++;
  restoreSnapshot(historyStack[historyIndex]);
  updateUndoRedoButtons();
}

function updateUndoRedoButtons(){
  const u = document.getElementById("undoBtn");
  const r = document.getElementById("redoBtn");
  if (u) u.disabled = historyIndex <= 0;
  if (r) r.disabled = historyIndex >= historyStack.length - 1;
}

function bindHistoryUI(){
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  if (undoBtn) undoBtn.onclick = undo;
  if (redoBtn) redoBtn.onclick = redo;
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "z") return;
    const modKey = e.metaKey || e.ctrlKey;
    if (!modKey) return;
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    if (typing) return;
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  });
  window.addEventListener("keydown", (e) => {
    const modKey = e.metaKey || e.ctrlKey;
    if (!modKey) return;
    const key = e.key.toLowerCase();
    if (!["c","x","v"].includes(key)) return;
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (typing) return;
    if (key === "c"){ if (copyTimelineSelection()) e.preventDefault(); }
    else if (key === "x"){ if (cutTimelineSelection()) e.preventDefault(); }
    else if (key === "v"){ if (pasteTimelineClipboard()) e.preventDefault(); }
  });
  updateUndoRedoButtons();
}

// ---- 自動存檔（localStorage）----
// 只存「資料層」：拍點時間軸(keyframes，含traj metadata)、軌跡控制點座標、
// 路徑模式、BPM、目前選取中的Easing/拍數預設值。不存IK開關/即時marker狀態，
// 理由跟undo一樣：那些狀態要正確復原需要連動重建一堆求解邏輯，複雜度不成比例。
function scheduleAutoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(doAutoSave, 1500);
}

// 組出一份完整的「編舞資料快照」——自動存檔與手動匯出共用同一個格式，
// 這樣匯出的檔案將來也能直接被拿來當自動存檔還原，兩條路徑資料互通。
function snapshotTimelineData(){
  const data = {
    schemaVersion: AUTOSAVE_SCHEMA_VERSION,
    tuttingGenerator: snapshotTG(),
    generationRules: snapshotGenerationRules(),
    waveClips: waveClone(waveClips),
    waving: cleanWave(waveConfig),
    lookAtPath: cleanLAPath(laPathConfig),
    torsoLookAt: snapshotTorsoLookAt(),
    handAim: snapshotHandAim(),
    poleEditor: snapshotPoleEditor(),
    footPlant: snapshotFootPlant(),
    savedAt: Date.now(),
    keyframes,
    trajPoints: {},
    trajMode: TRAJ_MODE,
    trajClosed: TRAJ_CLOSED,
    bpm,
    kfPendingEasing,
    kfPendingBeats,
    grooveJoints: Array.from(grooveJointSet),
    grooveCustom: grooveCustomParams,
    grooveSquatEnabled,
    grooveSquatCustom,
    grooveWarmupEnabled,
    grooveWarmupBeats,
    grooveWarmupCurve,
    grooveSequence // 律動序列是編舞的一部分（哪幾拍用哪個律動庫項目），存進專案檔；律動庫本身仍存 localStorage，不隨專案檔走
  };
  for (const limb of IK_LIMB_KEYS){
    data.trajPoints[limb] = trajPointMeshes[limb].map(m => ({ x:m.position.x, y:m.position.y, z:m.position.z }));
  }
  return data;
}

function doAutoSave(){
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshotTimelineData()));
    showAutosaveIndicator();
  } catch (e){
    console.warn("自動存檔失敗：", e);
  }
}

function showAutosaveIndicator(){
  const el = document.getElementById("autosaveIndicator");
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  el.textContent = `已自動儲存 ${hh}:${mm}:${ss}`;
  el.style.opacity = "1";
  clearTimeout(showAutosaveIndicator._t);
  showAutosaveIndicator._t = setTimeout(() => { el.style.opacity = "0"; }, 2000);
}

// 把一份「編舞資料快照」（snapshotTimelineData 格式）套用回場景——自動存檔還原／
// 手動匯入檔案共用同一套邏輯，只有「資料從哪裡來、要不要跳確認框」不一樣。
// 呼叫前務必先確認 data 已通過基本驗證（見 tryLoadAutosave / importTimelineFromFile）。
function restoreTimelineData(data){
  tgCancelPreview();restoreGenerationRules(data.generationRules);restoreTG(data.tuttingGenerator);
  waveClips=cleanWaveClips(data.waveClips);waveClipSelected=null;waveTrackActive=false;
  restoreWave(data.waving);
  restoreLAPath(data.lookAtPath);
  keyframes = data.keyframes;
  kfMultiSelected.clear(); grooveMultiSelected.clear();
  grooveSeqSelectedIndex = -1;
  kfEditingIndex = keyframes.length > 0 ? 0 : -1;
  if (data.trajMode) Object.assign(TRAJ_MODE, data.trajMode);
  // 舊版（沒有封閉路徑功能）存的資料沒有這個欄位：Object.assign不到就維持目前值（預設false），
  // 不會憑空冒出使用者從沒設定過的封閉路徑，跟trajMode同一套處理方式。
  if (data.trajClosed) Object.assign(TRAJ_CLOSED, data.trajClosed);
  if (typeof data.bpm === "number") bpm = data.bpm;
  if (data.kfPendingEasing) kfPendingEasing = data.kfPendingEasing;
  if (typeof data.kfPendingBeats === "number") kfPendingBeats = data.kfPendingBeats;
  // 舊版律動總開關已停用，載入時忽略；預覽與播放直接依律動設定執行。
  // 沒有關節設定的舊資料維持空集合，避免加入使用者未設定的律動。
  grooveJointSet = new Set(Array.isArray(data.grooveJoints) ? data.grooveJoints.filter(k => GROOVE_PRESETS[k]) : []);
  // 專案檔存的是「律動設定本身」而不是生成來源，讀回來一律視為手調內容（沒有可重現的種子）。
  // 自動生成的來源資訊只跟著律動庫項目走，見 sanitizeGrooveLibConfigData 的 meta 白名單。
  grooveLastGenMeta = null;
  // 舊版（沒有客製化功能）存的資料沒有 grooveCustom 欄位：自訂覆寫維持空物件，全部沿用預設值。
  grooveCustomParams = {};
  if (data.grooveCustom && typeof data.grooveCustom === "object"){
    for (const key of Object.keys(data.grooveCustom)){
      if (!GROOVE_PRESETS[key]) continue; // 忽略不存在的關節 key（例如檔案來自不同版本）
      const cleaned = sanitizeGrooveCustomEntry(data.grooveCustom[key]);
      if (Object.keys(cleaned).length > 0) grooveCustomParams[key] = cleaned;
    }
  }
  // 舊版（沒有蹲彈律動功能）存的資料沒有這兩個欄位：維持預設關閉、自訂覆寫清空，
  // 避免舊檔案一讀進來就憑空多出使用者從沒設定過的蹲彈效果。
  grooveSquatEnabled = (typeof data.grooveSquatEnabled === "boolean") ? data.grooveSquatEnabled : false;
  grooveSquatCustom = {};
  if (data.grooveSquatCustom && typeof data.grooveSquatCustom === "object"){
    const cleanedSquat = sanitizeGrooveSquatCustomEntry(data.grooveSquatCustom);
    if (Object.keys(cleanedSquat).length > 0) grooveSquatCustom = cleanedSquat;
  }
  // 舊版（沒有暖身漸強功能）存的資料沒有這三個欄位：退回預設值（啟用、1.5拍、線性），
  // 跟其他律動子功能同一套「舊檔案讀進來維持合理預設，不憑空冒出使用者沒設定過的東西」原則——
  // 這裡預設是「啟用」而不是「關閉」，因為暖身漸強屬於讓動作更自然的效果，跟蹲彈律動這種
  // 「使用者要主動選擇是否啟用的額外機能」性質不同。
  grooveWarmupEnabled = (typeof data.grooveWarmupEnabled === "boolean") ? data.grooveWarmupEnabled : true;
  grooveWarmupBeats = (typeof data.grooveWarmupBeats === "number" && data.grooveWarmupBeats >= 0) ? Math.min(4, data.grooveWarmupBeats) : 1.5;
  grooveWarmupCurve = ["linear", "easeIn", "easeOut"].includes(data.grooveWarmupCurve) ? data.grooveWarmupCurve : "linear";
  // 舊版（沒有律動序列功能）存的資料沒有這個欄位：維持空陣列，退回「單一全域設定」行為，
  // 不會憑空冒出使用者從沒排過的律動序列。只過濾資料格式，不檢查 libId 是否還存在——
  // 律動庫存在 localStorage、跟專案檔是分開的儲存空間，讀檔當下 grooveLibCtrl 可能還沒初始化，
  // 引用到已刪除項目的段落交給 applyGroove/renderGrooveSeqChips 執行期判斷（見 missingLib 樣式）。
  grooveSequence = Array.isArray(data.grooveSequence)
    ? data.grooveSequence
        .filter(e => e && typeof e.libId === "string" && Number.isFinite(e.beats) && e.beats > 0)
        .map(e => ({ id: (typeof e.id === "string" && e.id) ? e.id : makeLibId(), libId: e.libId, beats: Math.max(1, Math.min(64, Math.round(e.beats))) }))
    : [];
  renderGrooveSeqChips();
  resetSquatFootAnchors(); // 換了一份資料，姿勢可能整個變了，蹲彈錨點要重新捕捉
  refreshGrooveJointUI();

  // 先清空目前場景上既有的軌跡控制點球，避免匯入後新舊控制點疊在一起
  for (const limb of IK_LIMB_KEYS) clearTrajPoints(limb);

  if (data.trajPoints){
    for (const limb of IK_LIMB_KEYS){
      const pts = data.trajPoints[limb];
      if (!Array.isArray(pts)) continue;
      for (const p of pts){
        const geo = new THREE.SphereGeometry(0.026, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ color:0x9944ff, transparent:true, opacity:0.9, depthTest:false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 998;
        mesh.position.set(p.x, p.y, p.z);
        mesh.visible = (limb === trajActiveLimb);
        mesh.userData.pickType = "trajPoint";
        mesh.userData.limb = limb;
        mesh.userData.index = trajPointMeshes[limb].length;
        scene.add(mesh);
        trajPointMeshes[limb].push(mesh);
      }
      updateTrajVisual(limb);
    }
  }

  if (keyframes.length > 0){
    applyPose(keyframes[0].angles);
    applyBodyTransform(keyframes[0].body);
  }

  restoreFootPlant(data.footPlant);
  restorePoleEditor(data.poleEditor);
  restoreHandAim(data.handAim);
  restoreTorsoLookAt(data.torsoLookAt);
  const bpmSlider = document.getElementById("bpmSlider");
  if (bpmSlider) bpmSlider.value = String(bpm);
  const bpmVal = document.getElementById("bpmVal");
  if (bpmVal) bpmVal.value = String(bpm);
  updateBeatMsHint();
  syncEasingControlsFromSelection();
  renderKeyframeChips();
  renderTrajPointList();
}

// 頁面載入完成後檢查是否有自動存檔，詢問使用者是否還原（避免靜默覆蓋讓人誤以為是全新畫布）
function tryLoadAutosave(){
  let raw = null;
  try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return; }
  if (!raw) return;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return; }
  if (!data || data.schemaVersion !== AUTOSAVE_SCHEMA_VERSION) return;
  if (!Array.isArray(data.keyframes) || (data.keyframes.length === 0 && !data.footPlant?.enabled)) return;

  const savedDate = data.savedAt ? new Date(data.savedAt) : null;
  const timeStr = savedDate
    ? `${savedDate.getMonth()+1}/${savedDate.getDate()} ${String(savedDate.getHours()).padStart(2,"0")}:${String(savedDate.getMinutes()).padStart(2,"0")}`
    : "";
  const ok = confirm(
    `偵測到自動存檔（${data.keyframes.length} 個拍點${timeStr ? "，" + timeStr : ""}），要還原上次的編輯進度嗎？\n按「取消」會保留目前的空白畫布，並清除這份自動存檔。`
  );
  if (!ok){
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {}
    return;
  }

  restoreTimelineData(data);
}

// ---- 時間軸（拍點）匯出／匯入為 JSON 檔案 ----
// 匯出：跟自動存檔同一份快照格式（snapshotTimelineData），直接下載成檔案，
// 方便備份、分享給別人、或搬到別的瀏覽器/裝置。
function exportTimeline(){
  if (keyframes.length === 0){
    alert("目前時間軸是空的，沒有可匯出的拍點。");
    return;
  }
  const data = snapshotTimelineData();
  downloadJSON(data, "tutting編舞_" + Date.now() + ".json");
}

// 匯入：讀檔 → 基本結構驗證 → 詢問是否覆蓋目前時間軸 → 套用（與自動存檔還原共用 restoreTimelineData）。
function importTimelineFromFile(file){
  readJSONFile(file, (data) => {
    if (!data || typeof data !== "object" || !Array.isArray(data.keyframes)){
      alert("匯入失敗：這個檔案不是有效的「編舞時間軸」JSON（缺少 keyframes 陣列）。");
      return;
    }
    if (data.schemaVersion !== AUTOSAVE_SCHEMA_VERSION){
      alert("匯入失敗：檔案版本（schemaVersion）不符，可能是舊版或不相容的檔案。");
      return;
    }
    if (data.keyframes.length === 0){
      alert("這個檔案裡的時間軸是空的，沒有可匯入的拍點。");
      return;
    }
    const ok = confirm(
      `即將匯入 ${data.keyframes.length} 個拍點，這會覆蓋目前時間軸上的全部內容（含拍點與軌跡控制點），此動作無法復原（可用 Ctrl+Z 復原）。確定要匯入嗎？`
    );
    if (!ok) return;
    restoreTimelineData(data);
    pushHistory();
    scheduleAutoSave();
  });
}

// ---- Keyframe 拍點時間軸 ----
function snapshotCurrentAngles(){
  return poseController.snapshotTarget();
}

// 身體位置/朝向獨立於骨骼角度另外快照（model.position是平移、model.quaternion是絕對旋轉，
// 跟骨骼的「相對rest pose歐拉角」性質不同，不適合塞進同一個 angles 字典）
function snapshotBodyTransform(){
  if(tgPreview)return tgCopy(tgPreview.body);
  return { position: model.position.toArray(), quaternion: model.quaternion.toArray() };
}

function applyBodyTransform(bodyData){
  if (!bodyData) return; // 舊拍點/匯入的JSON可能沒有body欄位，容錯跳過，不動body
  model.position.fromArray(bodyData.position);
  model.quaternion.fromArray(bodyData.quaternion);
  model.updateWorldMatrix(true, true);
}

// 「+ 新增拍點」：若目前有選取某個拍點，插入在它後面（方便在中間補一拍）；
// 沒有選取（例如剛清空、或使用者按了 Esc 取消選取）則加到最尾端。
// 依序連續新增時，每次新增後 kfEditingIndex 都會指向剛新增的那個（也就是最後一個），
// 所以下一次新增仍然等同「加到最尾端」，原本的操作習慣不會被打斷。
function addKeyframe(){
  const newKf = { angles: snapshotCurrentAngles(), body: snapshotBodyTransform(), easing: kfPendingEasing, beats: kfPendingBeats };
  kfEditingIndex = insertKeyframe(keyframes, newKf, kfEditingIndex);
  renderKeyframeChips();
  scheduleAutoSave();
}

// 複製第 i 個拍點（含角度、身體位置、Easing/拍數、軌跡資料），插入緊接在它後面。
// 用深拷貝，複製出來的拍點之後各自修改不會互相影響。
function duplicateKeyframe(i){
  const index = duplicateKeyframeData(keyframes, i);
  if (index === null) return;
  kfEditingIndex = index;
  renderKeyframeChips();
  scheduleAutoSave();
}

// 拖曳排序：把 from 移到 to 的位置。跟著調整 kfEditingIndex，讓選取狀態黏著在
// 「同一個邏輯拍點」上，而不是黏著在原本的數字位置上（否則拖曳完選取會跳到別的拍點去）。
function reorderKeyframe(from, to){
  const index = reorderKeyframeData(keyframes, from, to, kfEditingIndex);
  if (index === null) return;
  kfEditingIndex = index;
  renderKeyframeChips();
  scheduleAutoSave();
}

// 拍點備註：用 prompt() 編輯，跟既有的「姿勢庫／手勢庫」重新命名同一套互動方式。
// 留空即清除備註（chip 上改顯示 ✎ 提示可以新增）。長度限制24字，避免橫向清單被一則超長備註撐爆。
function renameKeyframeLabel(i){
  if (!keyframes[i]) return;
  const current = keyframes[i].label || "";
  const next = prompt("拍點備註（例如「插腰」「收拍」），留空即可清除：", current);
  if (next === null) return; // 使用者按取消，不變動
  const trimmed = next.trim().slice(0, 24);
  if (trimmed) keyframes[i].label = trimmed; else delete keyframes[i].label;
  renderKeyframeChips();
  scheduleAutoSave();
}

// 拍點清單標題旁的總時長：只加總「有下一段轉場」的拍點（最後一拍沒有輸出轉場，不計入），
// 算法跟 updateBeatMsHint() 單一拍點的算法一致，這裡是整份時間軸的加總。
function updateKfTotalDurationLabel(){
  const el = document.getElementById("kfTotalDuration");
  if (!el) return;
  if(waveClips.length){const total=wavePlaybackEnd();el.textContent=`${keyframes.length} 個姿勢・${waveClips.length} 個 Waving・${total.toFixed(2)} beats・約 ${(total*60/bpm).toFixed(1)} 秒`;return;}
  if (keyframes.length < 2){ el.textContent = keyframes.length === 1 ? "1 個姿勢・0 beat" : ""; return; }
  let totalMs = 0;
  let totalBeats = 0;
  for (let i = 0; i < keyframes.length - 1; i++){
    const beats = Number(keyframes[i].beats || 1);
    totalBeats += beats;
    totalMs += (60000 / bpm) * beats;
  }
  el.textContent = `${keyframes.length} 個姿勢・${totalBeats} beats・約 ${(totalMs / 1000).toFixed(1)} 秒（${bpm} BPM）`;
  updateGrooveSeqTotalLabel(); // 編舞總拍數變了，下面「律動序列」的總拍數比對文字要跟著重算
}

// 編舞（拍點清單）的真實總拍數：加總每段轉場各自的「拍數」設定，跟 updateKfTotalDurationLabel()
// 算 totalMs 用的是同一份資料，只是這裡要的是拍子數而不是換算成毫秒，供跟律動序列總拍數互相比對。
function kfTotalBeats(){
  return totalKeyframeBeats(keyframes);
}

// ---- 多選批次刪除 ----
function timelineClipboardCount(){
  return (timelineClipboard.poseItems?.length || 0) + (timelineClipboard.grooveItems?.length || 0);
}
function updateKfMultiSelectBar(){
  const bar = document.getElementById("kfMultiSelectBar");
  const btn = document.getElementById("kfMultiSelectBtn");
  const countEl = document.getElementById("kfMultiSelectCount");
  const delBtn = document.getElementById("kfMultiSelectDeleteBtn");
  const copyBtn = document.getElementById("kfMultiSelectCopyBtn");
  const cutBtn = document.getElementById("kfMultiSelectCutBtn");
  const pasteBtn = document.getElementById("kfMultiSelectPasteBtn");
  const total = kfMultiSelected.size + grooveMultiSelected.size;
  if (btn) btn.classList.toggle("active", kfMultiSelectMode);
  if (bar) bar.style.display = kfMultiSelectMode ? "inline-flex" : "none";
  if (countEl){
    const parts = [];
    if (kfMultiSelected.size) parts.push(`POSE ${kfMultiSelected.size}`);
    if (grooveMultiSelected.size) parts.push(`GROOVE ${grooveMultiSelected.size}`);
    countEl.textContent = total ? `已選 ${parts.join(" · ")}` : "已選 0 個";
  }
  if (delBtn) delBtn.disabled = total === 0;
  if (copyBtn) copyBtn.disabled = total === 0;
  if (cutBtn) cutBtn.disabled = total === 0;
  if (pasteBtn) pasteBtn.disabled = timelineClipboardCount() === 0;
}

function setKfMultiSelectMode(on){
  kfMultiSelectMode = on;
  kfMultiSelected.clear();
  grooveMultiSelected.clear();
  if (on){
    kfEditingIndex = -1;
    grooveSeqSelectedIndex = -1;
    syncEasingControlsFromSelection();
    if (kfPlaying) stopKeyframePlayback();
  }
  updateKfMultiSelectBar();
  renderKeyframeChips();
  renderGrooveSeqChips();
}

function toggleKfMultiSelectItem(i){
  if (kfMultiSelected.has(i)) kfMultiSelected.delete(i); else kfMultiSelected.add(i);
  updateKfMultiSelectBar();
  renderKeyframeChips();
}
function toggleGrooveMultiSelectItem(i){
  if (grooveMultiSelected.has(i)) grooveMultiSelected.delete(i); else grooveMultiSelected.add(i);
  updateKfMultiSelectBar();
  renderGrooveSeqChips();
}

function kfMultiSelectAll(){
  kfMultiSelected = new Set(keyframes.map((_, i) => i));
  grooveMultiSelected = new Set(grooveSequence.map((_, i) => i));
  updateKfMultiSelectBar();
  renderKeyframeChips();
  renderGrooveSeqChips();
}

function kfMultiSelectNone(){
  kfMultiSelected.clear();
  grooveMultiSelected.clear();
  updateKfMultiSelectBar();
  renderKeyframeChips();
  renderGrooveSeqChips();
}

function deepCloneTimelineItem(item){
  return JSON.parse(JSON.stringify(item));
}
function currentTimelineClipboardSelection(){
  let poseIndices = [];
  let grooveIndices = [];
  if (kfMultiSelectMode){
    poseIndices = Array.from(kfMultiSelected).filter(i => keyframes[i]).sort((a,b)=>a-b);
    grooveIndices = Array.from(grooveMultiSelected).filter(i => grooveSequence[i]).sort((a,b)=>a-b);
  } else if (kfEditingIndex >= 0 && keyframes[kfEditingIndex]){
    poseIndices = [kfEditingIndex];
  } else if (grooveSeqSelectedIndex >= 0 && grooveSequence[grooveSeqSelectedIndex]){
    grooveIndices = [grooveSeqSelectedIndex];
  }
  return { poseIndices, grooveIndices };
}
function copyTimelineSelection(){
  const {poseIndices, grooveIndices} = currentTimelineClipboardSelection();
  if (!poseIndices.length && !grooveIndices.length) return false;
  timelineClipboard = {
    poseItems: poseIndices.map(i => deepCloneTimelineItem(keyframes[i])),
    grooveItems: grooveIndices.map(i => deepCloneTimelineItem(grooveSequence[i]))
  };
  updateKfMultiSelectBar();
  const hud = document.getElementById("timelineDragHud");
  if (hud){
    const parts=[];
    if (timelineClipboard.poseItems.length) parts.push(`${timelineClipboard.poseItems.length} POSE`);
    if (timelineClipboard.grooveItems.length) parts.push(`${timelineClipboard.grooveItems.length} GROOVE`);
    hud.textContent = `已複製 ${parts.join(" + ")}`;
    hud.style.left = "50%"; hud.style.top = "16px"; hud.style.transform = "translateX(-50%)"; hud.style.display="block";
    clearTimeout(copyTimelineSelection._t); copyTimelineSelection._t=setTimeout(()=>{hud.style.display="none"; hud.style.transform="";},900);
  }
  return true;
}
function deleteTimelineSelection({confirmDelete=true, push=true}={}){
  const {poseIndices, grooveIndices} = currentTimelineClipboardSelection();
  const total = poseIndices.length + grooveIndices.length;
  if (!total) return false;
  if (confirmDelete && !confirm(`確定要刪除已選取的 ${total} 個 Timeline 項目嗎？此動作可用 Ctrl+Z 復原。`)) return false;
  poseIndices.slice().sort((a,b)=>b-a).forEach(i => keyframes.splice(i,1));
  grooveIndices.slice().sort((a,b)=>b-a).forEach(i => grooveSequence.splice(i,1));
  kfEditingIndex = -1; grooveSeqSelectedIndex = -1;
  kfMultiSelected.clear(); grooveMultiSelected.clear();
  if (kfPlaying && keyframes.length < 2) stopKeyframePlayback();
  updateKfMultiSelectBar(); syncEasingControlsFromSelection();
  renderKeyframeChips(); renderGrooveSeqChips(); scheduleAutoSave();
  if (push) pushHistory();
  return true;
}
function deleteKfMultiSelected(){ return deleteTimelineSelection({confirmDelete:true, push:true}); }
function cutTimelineSelection(){
  if (kfPlaying) return false;
  if (!copyTimelineSelection()) return false;
  return deleteTimelineSelection({confirmDelete:false, push:true});
}
function pasteTimelineClipboard(){
  if (kfPlaying || timelineClipboardCount() === 0) return false;
  const poseCopies = (timelineClipboard.poseItems || []).map(deepCloneTimelineItem);
  const grooveCopies = (timelineClipboard.grooveItems || []).map(it => Object.assign(deepCloneTimelineItem(it), {id:makeLibId()}));
  let poseAt = keyframes.length;
  let grooveAt = grooveSequence.length;
  if (kfMultiSelectMode && kfMultiSelected.size) poseAt = Math.max(...kfMultiSelected) + 1;
  else if (kfEditingIndex >= 0) poseAt = kfEditingIndex + 1;
  if (kfMultiSelectMode && grooveMultiSelected.size) grooveAt = Math.max(...grooveMultiSelected) + 1;
  else if (grooveSeqSelectedIndex >= 0) grooveAt = grooveSeqSelectedIndex + 1;
  if (poseCopies.length) keyframes.splice(poseAt, 0, ...poseCopies);
  if (grooveCopies.length) grooveSequence.splice(grooveAt, 0, ...grooveCopies);

  if (kfMultiSelectMode){
    kfMultiSelected = new Set(poseCopies.map((_,j)=>poseAt+j));
    grooveMultiSelected = new Set(grooveCopies.map((_,j)=>grooveAt+j));
    kfEditingIndex = -1; grooveSeqSelectedIndex = -1;
  } else if (poseCopies.length){
    kfEditingIndex = poseAt + poseCopies.length - 1; grooveSeqSelectedIndex = -1;
  } else if (grooveCopies.length){
    grooveSeqSelectedIndex = grooveAt + grooveCopies.length - 1; kfEditingIndex = -1;
  }
  updateKfMultiSelectBar(); syncEasingControlsFromSelection();
  renderKeyframeChips(); renderGrooveSeqChips(); scheduleAutoSave(); pushHistory();
  return true;
}

function updateKeyframe(){
  if (kfEditingIndex < 0 || !keyframes[kfEditingIndex]) return;
  keyframes[kfEditingIndex].angles = snapshotCurrentAngles();
  keyframes[kfEditingIndex].body = snapshotBodyTransform();
  renderKeyframeChips();
  scheduleAutoSave();
}

// 選取拍點的轉場 Easing / 拍數即時編輯（不需按「更新選取拍點」，因為不影響角度資料）
function setKeyframeEasing(name){
  kfPendingEasing = name;
  if (kfEditingIndex >= 0 && keyframes[kfEditingIndex]) keyframes[kfEditingIndex].easing = name;
  updateEasingPreview();
  renderKeyframeChips();
  scheduleAutoSave();
}

function setKeyframeBeats(val){
  const snapped = snapTimelineBeats(val);
  kfPendingBeats = snapped;
  if (kfEditingIndex >= 0 && keyframes[kfEditingIndex]) keyframes[kfEditingIndex].beats = snapped;
  updateBeatMsHint();
  renderKeyframeChips();
  scheduleAutoSave();
}

// 把 Easing / 拍數控制項同步成目前選取拍點的值（沒選取時維持上一次的預設值）
function updateBeatGridPoseInspector(){
  const mode = document.getElementById("kfInspectorMode");
  const updateBtn = document.getElementById("kfUpdateBtn");
  const hasSelection = kfEditingIndex >= 0 && !!keyframes[kfEditingIndex] && !kfMultiSelectMode;
  if (mode){
    if (hasSelection){
      const isEnd = kfEditingIndex === keyframes.length - 1;
      mode.textContent = `F${kfEditingIndex + 1} ${isEnd ? "終點／下一段預設" : "轉場"}`;
      mode.setAttribute("data-tooltip", isEnd
        ? "最後一個 POSE 目前沒有下一段；Easing／拍數會保存在此拍點，之後若在後方新增 POSE 就會成為轉場設定。"
        : `正在編輯 F${kfEditingIndex + 1} → F${kfEditingIndex + 2} 的轉場設定`);
    } else {
      mode.textContent = kfMultiSelectMode ? "POSE 多選" : "新增預設";
      mode.setAttribute("data-tooltip", kfMultiSelectMode
        ? "多選模式中不顯示單一 POSE 的更新控制。"
        : "未選取 POSE；目前 Easing／拍數會作為下一個新增拍點的預設值。" );
    }
  }
  if (updateBtn) updateBtn.style.display = hasSelection ? "inline-flex" : "none";
}

function syncEasingControlsFromSelection(){
  const kf = kfEditingIndex >= 0 ? keyframes[kfEditingIndex] : null;
  kfPendingEasing = kf ? (kf.easing || "easeInOutQuad") : kfPendingEasing;
  kfPendingBeats = kf ? (kf.beats || 1) : kfPendingBeats;
  const easeSel = document.getElementById("kfEasingSelect");
  const beatsSel = document.getElementById("kfBeatsSelect");
  if (easeSel) easeSel.value = kfPendingEasing;
  if (beatsSel) syncBeatSelectValue(beatsSel, kfPendingBeats);
  updateEasingPreview();
  updateBeatMsHint();
  updateBeatGridPoseInspector();
}

function updateEasingPreview(){
  const host = document.getElementById("kfEasingPreview");
  if (host) host.innerHTML = buildEasingSVG(kfPendingEasing, 64, 34);
}

function updateBeatMsHint(){
  const hint = document.getElementById("kfBeatMsHint");
  if (!hint) return;
  const ms = Math.round((60000/bpm) * kfPendingBeats);
  const sec = (ms / 1000).toFixed(ms >= 1000 ? 2 : 3).replace(/0+$/, "").replace(/\.$/, "");
  hint.textContent = `${sec}s · ${bpm} BPM`;
  hint.setAttribute("data-tooltip", `${kfPendingBeats} 拍 = ${ms} ms（${bpm} BPM）`);
}

function deleteKeyframe(i){
  keyframes.splice(i, 1);
  // 選取的拍點被刪了：改選同一個位置的下一個（沒有的話往前一個）；
  // 選取的拍點還在但排在被刪除的後面：索引要跟著往前移一格，否則選取會跳到別的拍點身上。
  if (kfEditingIndex === i) kfEditingIndex = Math.min(i, keyframes.length - 1);
  else if (kfEditingIndex > i) kfEditingIndex -= 1;
  if (kfPlaying && keyframes.length < 2) stopKeyframePlayback();
  syncEasingControlsFromSelection();
  renderKeyframeChips();
  scheduleAutoSave();
}

function clearKeyframes(){
  keyframes = [];
  kfEditingIndex = -1;
  stopKeyframePlayback();
  renderKeyframeChips();
  scheduleAutoSave();
}

function selectKeyframeStateOnly(i){
  waveClipSelected=null;renderWaveTrack();
  if (i < 0 || i >= keyframes.length) return;
  kfEditingIndex = i;
  grooveSeqSelectedIndex = -1;
  if (!kfMultiSelectMode) grooveMultiSelected.clear();
  for (const el of grooveSeqChipEls) if (el) el.classList.remove("selected");
  for (let n = 0; n < kfChipEls.length; n++){
    const el = kfChipEls[n];
    if (el) el.classList.toggle("active", !kfMultiSelectMode && n === i);
  }
  applyPose(keyframes[i].angles);
  setActiveBtn(-1);
  syncEasingControlsFromSelection();
  updateOnionSkins();
}

function selectKeyframe(i){
  waveTrackActive=false;waveClipSelected=null;renderWaveTrack();
  if(waveRun)stopWave();
  selectKeyframeStateOnly(i);
  renderKeyframeChips();
}

// 建立/重建整份拍點清單的 DOM（結構性變動才呼叫：新增、刪除、清空、選取、Easing/拍數變更……）。
// 播放中每幀要做的「高亮目前播放到哪一拍」不要走這裡——見下面的 updatePlayingKeyframeHighlight()，
// 否則等於每秒 60 次 innerHTML="" 整份重建 + 重新產生 easing SVG，會造成明顯卡頓。
// 拍點清單改成單列橫向捲動後，拍點一多，目前選取/播放中的那一格很容易在可視範圍外，
// 統一用這個小工具捲進畫面（inline:"nearest" 表示已經在可視範圍內就不會多此一舉地捲動）。
let BEAT_GRID_PX_PER_BEAT = 72;
const BEAT_GRID_SUBDIV = 0.25; // ruler visual subdivision stays at 1/4 beat
let BEAT_GRID_SNAP = 0.25;
const BEAT_GRID_LABEL_W = 96;
const BEAT_GRID_ZOOM_LEVELS = [36, 54, 72, 108, 144];

function nearestBeatGridZoomLevel(px){
  return BEAT_GRID_ZOOM_LEVELS.reduce((best, v) => Math.abs(v - px) < Math.abs(best - px) ? v : best, BEAT_GRID_ZOOM_LEVELS[0]);
}

function refreshBeatGridZoomLayout(){
  // Resize / scrub / ruler / waveform 全部讀同一個 BEAT_GRID_PX_PER_BEAT；
  // 這裡只做幾何重排，不改 keyframes / grooveSequence 的任何時間資料。
  updateKeyframeClipLayoutOnly();
  updateGrooveClipLayoutOnly();
  drawKfWaveform();
  if (kfPlaying) updateBeatGridPlaybackUI(performance.now());
  else updateBeatGridMusicPreviewPlayhead();
}

function setBeatGridZoomPx(nextPx, anchorViewportX = null){
  const scroller = document.getElementById("beatGridScroll");
  const select = document.getElementById("beatGridZoomSelect");
  const oldPx = BEAT_GRID_PX_PER_BEAT;
  const newPx = nearestBeatGridZoomLevel(Number(nextPx) || oldPx);
  if (!scroller){
    BEAT_GRID_PX_PER_BEAT = newPx;
    if (select) syncBeatGridZoomSelect(newPx);
    refreshBeatGridZoomLayout();
    return;
  }

  const viewportX = anchorViewportX == null
    ? scroller.clientWidth * 0.5
    : Math.max(BEAT_GRID_LABEL_W, Math.min(scroller.clientWidth, anchorViewportX));
  const anchorBeat = Math.max(0, (scroller.scrollLeft + viewportX - BEAT_GRID_LABEL_W) / Math.max(1, oldPx));

  BEAT_GRID_PX_PER_BEAT = newPx;
  if (select) syncBeatGridZoomSelect(newPx);
  refreshBeatGridZoomLayout();

  // 讓縮放前位於視窗中心（或滑鼠下方）的 Beat，縮放後仍留在同一螢幕位置，
  // 避免每次放大都被拉回時間軸左端。
  const desired = BEAT_GRID_LABEL_W + anchorBeat * newPx - viewportX;
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  scroller.scrollLeft = Math.max(0, Math.min(maxScroll, desired));
}

function stepBeatGridZoom(direction, anchorViewportX = null){
  const current = nearestBeatGridZoomLevel(BEAT_GRID_PX_PER_BEAT);
  let idx = BEAT_GRID_ZOOM_LEVELS.indexOf(current);
  if (idx < 0) idx = 2;
  idx = Math.max(0, Math.min(BEAT_GRID_ZOOM_LEVELS.length - 1, idx + (direction > 0 ? 1 : -1)));
  setBeatGridZoomPx(BEAT_GRID_ZOOM_LEVELS[idx], anchorViewportX);
}

function keyframeStartBeat(index){
  return timelineStartBeat(keyframes, index);
}

function grooveSegmentStartBeat(index){
  let beat = 0;
  for (let i = 0; i < index; i++) beat += Math.max(0, Number(grooveSequence[i].beats) || 0);
  return beat;
}

function beatGridPoseTotalBeats(){
  if (keyframes.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < keyframes.length - 1; i++) total += Number(keyframes[i].beats || 1);
  return total;
}

function beatGridAudioTotalBeats(){
  if (!(waveform.duration > 0)) return 0;
  const offsetEl = document.getElementById("kfMusicOffset");
  const offset = offsetEl ? (parseFloat(offsetEl.value) || 0) : 0;
  const remainSec = Math.max(0, waveform.duration - offset);
  return remainSec * bpm / 60;
}

function beatGridTimelineBeats(){
  return Math.max(4, beatGridPoseTotalBeats(), waveTrackEnd(), grooveSeqTotalBeats(), beatGridAudioTotalBeats());
}

function updateBeatGridGeometry(){
  const inner = document.getElementById("beatGridInner");
  const ruler = document.getElementById("beatGridRuler");
  const kfHost = document.getElementById("kfList");
  const grooveHost = document.getElementById("grooveSeqList");
  const waveformTrack = document.getElementById("beatGridWaveformTrack");
  const waveformCanvas = document.getElementById("kfWaveformCanvas");
  if (!inner || !ruler || !kfHost || !grooveHost) return;
  const totalBeats = beatGridTimelineBeats();
  const timelinePx = Math.ceil(totalBeats * BEAT_GRID_PX_PER_BEAT);
  inner.style.width = `${BEAT_GRID_LABEL_W + timelinePx}px`;
  kfHost.style.width = `${timelinePx}px`;
  grooveHost.style.width = `${timelinePx}px`;
  if (waveformTrack) waveformTrack.style.width = `${timelinePx}px`;
  if (waveformCanvas) waveformCanvas.style.width = `${timelinePx}px`;

  ruler.innerHTML = "";
  ruler.style.marginLeft = `${BEAT_GRID_LABEL_W}px`;
  ruler.style.width = `${timelinePx}px`;
  const steps = Math.ceil(totalBeats / BEAT_GRID_SUBDIV);
  for (let s = 0; s <= steps; s++){
    const beat = s * BEAT_GRID_SUBDIV;
    const x = beat * BEAT_GRID_PX_PER_BEAT;
    const tick = document.createElement("span");
    const isMajor = Math.abs(beat - Math.round(beat)) < 1e-6;
    const isHalf = !isMajor && Math.abs((beat * 2) - Math.round(beat * 2)) < 1e-6;
    tick.className = "beatGridTick" + (isMajor ? " major" : (isHalf ? " half" : ""));
    tick.style.left = `${x}px`;
    ruler.appendChild(tick);
    if (isMajor && beat < totalBeats + 1e-6){
      const label = document.createElement("span");
      label.className = "beatGridTickLabel";
      label.style.left = `${x}px`;
      label.textContent = String(Math.round(beat) + 1);
      ruler.appendChild(label);
    }
  }
  updateBeatGridRangeUI();
  layoutWaveTrack();
}

function hasBeatGridRange(){
  return Number.isFinite(beatGridRangeStart) && Number.isFinite(beatGridRangeEnd) && beatGridRangeEnd - beatGridRangeStart > 1e-6;
}

function normalizeBeatGridRange(a, b){
  const total = beatGridTimelineBeats();
  let start = clampNum(Math.min(Number(a) || 0, Number(b) || 0), 0, total);
  let end = clampNum(Math.max(Number(a) || 0, Number(b) || 0), 0, total);
  const step = Number(BEAT_GRID_SNAP) || 0;
  const snap = (v) => step > 0 ? clampNum(Number((Math.round(v / step) * step).toFixed(4)), 0, total) : clampNum(Number(v.toFixed(4)), 0, total);
  start = snap(start); end = snap(end);
  if (end < start){ const t = start; start = end; end = t; }
  return [start, end];
}

function formatRangeBeatLabel(beat){
  return formatBeatValue((Number(beat) || 0) + 1);
}


function beatGridRangeClipboardCount(){
  return (beatGridRangeClipboard.poseItems?.length || 0) + (beatGridRangeClipboard.grooveItems?.length || 0);
}

// 回傳目前 Range 實際會影響的資料索引。POSE 以 transition interval 判斷相交；
// GROOVE 以 clip interval 判斷相交。這裡刻意不切半段，確保既有 sequential timeline schema 不變。
function getBeatGridRangeAffectedItems(start = beatGridRangeStart, end = beatGridRangeEnd){
  const result = { poseTransitions:[], poseFrameStart:-1, poseFrameEnd:-1, grooveIndices:[] };
  if (!(Number.isFinite(start) && Number.isFinite(end) && end - start > 1e-6)) return result;
  const eps = 1e-7;
  let acc = 0;
  for (let i = 0; i < keyframes.length - 1; i++){
    const dur = Math.max(0.0001, Number(keyframes[i].beats || 1));
    const a = acc, b = acc + dur;
    if (b > start + eps && a < end - eps) result.poseTransitions.push(i);
    acc = b;
  }
  if (result.poseTransitions.length){
    result.poseFrameStart = result.poseTransitions[0];
    // 要保留最後一個 transition 的 target frame，所以 frameEnd = last transition + 1（inclusive）。
    result.poseFrameEnd = result.poseTransitions[result.poseTransitions.length - 1] + 1;
  }
  acc = 0;
  for (let i = 0; i < grooveSequence.length; i++){
    const dur = Math.max(0, Number(grooveSequence[i].beats) || 0);
    const a = acc, b = acc + dur;
    if (dur > 0 && b > start + eps && a < end - eps) result.grooveIndices.push(i);
    acc = b;
  }
  return result;
}

function showRangeEditHud(message, ms=1100){
  const hud = document.getElementById("timelineDragHud");
  if (!hud) return;
  hud.textContent = message;
  hud.style.left = "50%"; hud.style.top = "16px"; hud.style.transform = "translateX(-50%)"; hud.style.display = "block";
  clearTimeout(showRangeEditHud._t);
  showRangeEditHud._t = setTimeout(() => { hud.style.display="none"; hud.style.transform=""; }, ms);
}

function copyBeatGridRange(){
  if (!hasBeatGridRange()) return false;
  const hit = getBeatGridRangeAffectedItems();
  const poseItems = hit.poseFrameStart >= 0
    ? keyframes.slice(hit.poseFrameStart, hit.poseFrameEnd + 1).map(deepCloneTimelineItem)
    : [];
  const grooveItems = hit.grooveIndices.map(i => deepCloneTimelineItem(grooveSequence[i]));
  if (!poseItems.length && !grooveItems.length){
    showRangeEditHud("Range 內沒有可複製項目");
    return false;
  }
  beatGridRangeClipboard = {
    poseItems,
    grooveItems,
    source:{ start:beatGridRangeStart, end:beatGridRangeEnd },
    affected:{ poseTransitions:hit.poseTransitions.length, grooves:hit.grooveIndices.length }
  };
  updateBeatGridRangeUI();
  const parts=[];
  if (hit.poseTransitions.length) parts.push(`${hit.poseTransitions.length} POSE transition`);
  if (hit.grooveIndices.length) parts.push(`${hit.grooveIndices.length} GROOVE`);
  showRangeEditHud(`已複製 Range：${parts.join(" + ")}`);
  return true;
}

function findPoseRangeInsertIndexAtBeat(beat){
  if (!keyframes.length) return 0;
  const target = Math.max(0, Number(beat) || 0);
  for (let i = 0; i < keyframes.length; i++){
    if (keyframeStartBeat(i) >= target - 1e-7) return i;
  }
  return keyframes.length;
}
function findGrooveRangeInsertIndexAtBeat(beat){
  const target = Math.max(0, Number(beat) || 0);
  for (let i = 0; i < grooveSequence.length; i++){
    if (grooveSegmentStartBeat(i) >= target - 1e-7) return i;
  }
  return grooveSequence.length;
}

function pasteBeatGridRange({push=true, showHud=true}={}){
  if (kfPlaying || !hasBeatGridRange() || beatGridRangeClipboardCount() === 0) return false;
  const poseCopies = (beatGridRangeClipboard.poseItems || []).map(deepCloneTimelineItem);
  const grooveCopies = (beatGridRangeClipboard.grooveItems || []).map(it => Object.assign(deepCloneTimelineItem(it), {id:makeLibId()}));
  const insertBeat = beatGridRangeEnd;
  // Range 編輯採完整項目語意：若 Range 結尾落在某個 transition/clip 中間，
  // 貼上位置要放到該完整項目之後，而不是硬插進它的中間。
  const currentHit = getBeatGridRangeAffectedItems();
  const poseAt = currentHit.poseFrameEnd >= 0 ? currentHit.poseFrameEnd + 1 : findPoseRangeInsertIndexAtBeat(insertBeat);
  const grooveAt = currentHit.grooveIndices.length ? currentHit.grooveIndices[currentHit.grooveIndices.length - 1] + 1 : findGrooveRangeInsertIndexAtBeat(insertBeat);
  if (poseCopies.length) keyframes.splice(poseAt, 0, ...poseCopies);
  if (grooveCopies.length) grooveSequence.splice(grooveAt, 0, ...grooveCopies);
  kfEditingIndex = -1; grooveSeqSelectedIndex = -1;
  kfMultiSelected.clear(); grooveMultiSelected.clear();
  updateKfMultiSelectBar(); syncEasingControlsFromSelection();
  renderKeyframeChips(); renderGrooveSeqChips(); scheduleAutoSave();
  if (push) pushHistory();
  updateBeatGridRangeUI();
  if (showHud) showRangeEditHud(`已貼上 Range：${poseCopies.length ? (poseCopies.length-1)+" POSE transition" : ""}${poseCopies.length && grooveCopies.length ? " + " : ""}${grooveCopies.length ? grooveCopies.length+" GROOVE" : ""}`);
  return true;
}

function duplicateBeatGridRange(){
  if (kfPlaying || !hasBeatGridRange()) return false;
  if (!copyBeatGridRange()) return false;
  // copy 本身不寫 history；paste 只寫一次，因此整個 Duplicate 是單一 Undo transaction。
  const ok = pasteBeatGridRange({push:true, showHud:false});
  if (ok) showRangeEditHud("Range 已重複到選取範圍之後");
  return ok;
}

function deleteBeatGridRange(){
  if (kfPlaying || !hasBeatGridRange()) return false;
  const hit = getBeatGridRangeAffectedItems();
  const poseCount = hit.poseTransitions.length;
  const grooveCount = hit.grooveIndices.length;
  if (!poseCount && !grooveCount){ showRangeEditHud("Range 內沒有可刪除項目"); return false; }
  const parts=[];
  if (poseCount) parts.push(`${poseCount} 個 POSE transition`);
  if (grooveCount) parts.push(`${grooveCount} 個 GROOVE clip`);
  if (!confirm(`確定刪除 Range 相交的 ${parts.join("、")}？\n\n目前版本以完整 Timeline 項目為單位刪除，後方內容會自動前移。此動作可用 Ctrl+Z 復原。`)) return false;

  // POSE transition i 對應移除它的起始 frame i；保留最後 target frame，確保至少留下一個姿勢。
  hit.poseTransitions.slice().sort((a,b)=>b-a).forEach(i => {
    if (i >= 0 && i < keyframes.length - 1) keyframes.splice(i, 1);
  });
  hit.grooveIndices.slice().sort((a,b)=>b-a).forEach(i => {
    if (i >= 0 && i < grooveSequence.length) grooveSequence.splice(i, 1);
  });
  if (kfPlaying && keyframes.length < 2) stopKeyframePlayback();
  kfEditingIndex = -1; grooveSeqSelectedIndex = -1;
  kfMultiSelected.clear(); grooveMultiSelected.clear();
  beatGridRangeLoop = false;
  beatGridRangeStart = beatGridRangeEnd = null;
  updateKfMultiSelectBar(); syncEasingControlsFromSelection();
  renderKeyframeChips(); renderGrooveSeqChips(); scheduleAutoSave(); pushHistory();
  updateBeatGridRangeUI();
  showRangeEditHud(`已刪除 ${parts.join(" + ")}`);
  return true;
}

function updateBeatGridRangeUI(){
  const overlay = document.getElementById("beatGridRangeSelection");
  const info = document.getElementById("beatGridRangeInfo");
  const loopBtn = document.getElementById("beatGridRangeLoopBtn");
  const clearBtn = document.getElementById("beatGridRangeClearBtn");
  const copyBtn = document.getElementById("beatGridRangeCopyBtn");
  const pasteBtn = document.getElementById("beatGridRangePasteBtn");
  const duplicateBtn = document.getElementById("beatGridRangeDuplicateBtn");
  const deleteBtn = document.getElementById("beatGridRangeDeleteBtn");
  const valid = hasBeatGridRange();
  const hit = valid ? getBeatGridRangeAffectedItems() : {poseTransitions:[], grooveIndices:[]};
  const affectedCount = hit.poseTransitions.length + hit.grooveIndices.length;
  if (overlay){
    overlay.classList.toggle("active", valid);
    overlay.classList.toggle("looping", valid && beatGridRangeLoop);
    if (valid){
      overlay.style.left = `${BEAT_GRID_LABEL_W + beatGridRangeStart * BEAT_GRID_PX_PER_BEAT}px`;
      overlay.style.width = `${Math.max(2, (beatGridRangeEnd - beatGridRangeStart) * BEAT_GRID_PX_PER_BEAT)}px`;
    }
  }
  if (info){
    if (valid){
      const counts = [];
      if (hit.poseTransitions.length) counts.push(`P${hit.poseTransitions.length}`);
      if (hit.grooveIndices.length) counts.push(`G${hit.grooveIndices.length}`);
      info.textContent = `Beat ${formatRangeBeatLabel(beatGridRangeStart)}→${formatRangeBeatLabel(beatGridRangeEnd)} · ${formatBeatValue(beatGridRangeEnd - beatGridRangeStart)}拍${counts.length ? " · "+counts.join("/") : ""}`;
      info.title = `${info.textContent}
Range 編輯以與範圍相交的完整 POSE transition / GROOVE clip 為單位`;
    } else {
      info.textContent = "未選範圍";
      info.title = info.textContent;
    }
  }
  if (loopBtn){
    const poseTotal = waveClips.length?wavePlaybackEnd():beatGridPoseTotalBeats();
    const playable = valid && (keyframes.length >= 2 || waveClips.length > 0) && beatGridRangeStart < poseTotal - 1e-6;
    loopBtn.disabled = !playable;
    loopBtn.classList.toggle("active", playable && beatGridRangeLoop);
    loopBtn.textContent = playable && beatGridRangeLoop ? "⟳ Range ON" : "⟳ Range";
    loopBtn.title = playable ? "只循環播放選取範圍" : (valid ? "Range 必須與 POSE／WAVING 播放範圍重疊" : "請先在 Beat Ruler 上拖曳選取範圍");
  }
  if (copyBtn) copyBtn.disabled = !valid || affectedCount === 0 || kfPlaying;
  if (pasteBtn) pasteBtn.disabled = !valid || beatGridRangeClipboardCount() === 0 || kfPlaying;
  if (duplicateBtn) duplicateBtn.disabled = !valid || affectedCount === 0 || kfPlaying;
  if (deleteBtn) deleteBtn.disabled = !valid || affectedCount === 0 || kfPlaying;
  if (clearBtn) clearBtn.disabled = !valid;
}

function clearBeatGridRange(){
  beatGridRangeStart = null;
  beatGridRangeEnd = null;
  beatGridRangeLoop = false;
  beatGridRangeDrag = null;
  updateBeatGridRangeUI();
}

function setBeatGridRangeLoop(on){
  if (!hasBeatGridRange()) on = false;
  if (on){
    const poseTotal = waveClips.length?wavePlaybackEnd():beatGridPoseTotalBeats();
    if (!((keyframes.length >= 2 || waveClips.length > 0) && beatGridRangeStart < poseTotal - 1e-6)) on = false;
    else if (beatGridRangeEnd > poseTotal){
      beatGridRangeEnd = poseTotal;
      if (!(beatGridRangeEnd - beatGridRangeStart > 1e-6)) on = false;
    }
  }
  beatGridRangeLoop = !!on;
  if (beatGridRangeLoop){
    // Range Loop 與整段 Loop 互斥，避免播放結尾規則出現兩個來源。
    kfLoop = false;
    const fullLoopBtn = document.getElementById("kfLoopBtn");
    if (fullLoopBtn) fullLoopBtn.classList.remove("active");
  }
  updateBeatGridRangeUI();
}

function beatGridClientXToBeat(clientX){
  const ruler = document.getElementById("beatGridRuler");
  if (!ruler) return 0;
  const rect = ruler.getBoundingClientRect();
  return clampNum((clientX - rect.left) / BEAT_GRID_PX_PER_BEAT, 0, beatGridTimelineBeats());
}

function bindBeatGridRangeSelection(){
  const ruler = document.getElementById("beatGridRuler");
  if (!ruler) return;
  ruler.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (kfPlaying) stopKeyframePlayback();
    const raw = beatGridClientXToBeat(e.clientX);
    const [start] = normalizeBeatGridRange(raw, raw);
    beatGridRangeDrag = { anchor:start, pointerId:e.pointerId };
    beatGridRangeStart = start;
    beatGridRangeEnd = start;
    setBeatGridRangeLoop(false);
    ruler.classList.add("rangeDragging");
    try { ruler.setPointerCapture(e.pointerId); } catch (_) {}
    updateBeatGridRangeUI();
    e.preventDefault();
  });
  ruler.addEventListener("pointermove", (e) => {
    if (!beatGridRangeDrag) return;
    const raw = beatGridClientXToBeat(e.clientX);
    const [a,b] = normalizeBeatGridRange(beatGridRangeDrag.anchor, raw);
    beatGridRangeStart = a;
    beatGridRangeEnd = b;
    updateBeatGridRangeUI();
  });
  const finish = (e) => {
    if (!beatGridRangeDrag) return;
    const raw = beatGridClientXToBeat(e.clientX);
    let [a,b] = normalizeBeatGridRange(beatGridRangeDrag.anchor, raw);
    const minSpan = Number(BEAT_GRID_SNAP) > 0 ? Number(BEAT_GRID_SNAP) : 0.01;
    if (b - a < minSpan - 1e-8){
      // 單擊 Ruler 不建立幾乎零寬的 Range；改成一般導航/預覽。
      const target = clampNum(raw, 0, beatGridTimelineBeats());
      beatGridRangeStart = beatGridRangeEnd = null;
      beatGridRangeLoop = false;
      navigateBeatGridToBeat(target);
    } else {
      beatGridRangeStart = a;
      beatGridRangeEnd = b;
    }
    beatGridRangeDrag = null;
    ruler.classList.remove("rangeDragging");
    try { if (ruler.hasPointerCapture(e.pointerId)) ruler.releasePointerCapture(e.pointerId); } catch (_) {}
    updateBeatGridRangeUI();
  };
  ruler.addEventListener("pointerup", finish);
  ruler.addEventListener("pointercancel", (e) => {
    beatGridRangeDrag = null;
    ruler.classList.remove("rangeDragging");
    try { if (ruler.hasPointerCapture(e.pointerId)) ruler.releasePointerCapture(e.pointerId); } catch (_) {}
    updateBeatGridRangeUI();
  });
}

function locateKeyframeSegmentAtBeat(beat){
  return locateTimelineSegment(keyframes, beat, beatGridPoseTotalBeats());
}

function seekRunningPlaybackToBeat(beat, now = performance.now()){
  if (keyframes.length < 2 && !waveClips.length) return;
  const target = clampNum(Number(beat) || 0, 0, waveClips.length?wavePlaybackEnd():beatGridPoseTotalBeats());
  const loc = locateKeyframeSegmentAtBeat(target);
  kfIndex = loc.index;
  kfStartTime = now - loc.localBeat * (60000 / bpm);
  grooveStartTime = now - target * (60000 / bpm);
  grooveSquatAnchored = false;
  resetGrooveXfadeState();
  resetSquatXfadeState();
  const audioEl = document.getElementById("kfAudioEl");
  if (audioEl && audioEl.src && waveform.duration > 0){
    try {
      audioEl.currentTime = clampNum(timelineBeatToAudioTime(target), 0, waveform.duration);
      if (audioEl.paused) audioEl.play().catch(() => {});
    } catch (_) {}
  }
  updateOnionSkins();
  updatePlayingKeyframeHighlight();
  beatGridLastPreviewBeat = target;
}

function renderGrooveLoopGhosts(){
  const host = document.getElementById("grooveSeqList");
  if (!host || grooveSequence.length === 0) return;
  host.querySelectorAll(".beatGridGhost").forEach(el => el.remove());
  const seqTotal = grooveSeqTotalBeats();
  const total = beatGridPoseTotalBeats();
  if (!(seqTotal > 0 && total > seqTotal)) return;
  const libItems = grooveLibCtrl ? grooveLibCtrl.getItems() : [];
  for (let cycleStart = seqTotal; cycleStart < total; cycleStart += seqTotal){
    let local = 0;
    grooveSequence.forEach((entry) => {
      const dur = Math.max(0, Number(entry.beats) || 0);
      if (dur <= 0 || cycleStart + local >= total) { local += dur; return; }
      const visibleDur = Math.min(dur, total - (cycleStart + local));
      const ghost = document.createElement("div");
      ghost.className = "beatGridGhost";
      ghost.dataset.grooveIndex = String(grooveSequence.indexOf(entry));
      ghost.dataset.startBeat = String(cycleStart + local);
      ghost.dataset.endBeat = String(cycleStart + local + visibleDur);
      ghost.style.left = `${(cycleStart + local) * BEAT_GRID_PX_PER_BEAT}px`;
      ghost.style.width = `${Math.max(2, visibleDur * BEAT_GRID_PX_PER_BEAT - 2)}px`;
      const item = libItems.find(it => it.id === entry.libId);
      ghost.textContent = item ? `↻ ${item.name}` : "↻ ⚠";
      host.appendChild(ghost);
      local += dur;
    });
  }
}

function scrollKfChipIntoView(i){
  const chip = kfChipEls[i];
  if (chip) chip.scrollIntoView({ behavior:"smooth", inline:"nearest", block:"nearest" });
}

// BG-3.2：POSE / GROOVE 共用拖曳排序 UX。
// 拖曳期間只顯示「預計插入位置」，真正陣列 reorder 只在 drop 時執行，因此不會邊拖邊重建 DOM。
let timelineReorderDrag = null; // BG-6: supports single item or selected group
function timelineReorderItems(kind){ return kind === "pose" ? keyframes : grooveSequence; }
function timelineReorderChips(kind){ return kind === "pose" ? kfChipEls : grooveSeqChipEls; }
function timelineReorderLabel(kind){ return kind === "pose" ? "POSE" : "GROOVE"; }
function timelineSelectedSet(kind){ return kind === "pose" ? kfMultiSelected : grooveMultiSelected; }
function ensureTimelineDropIndicator(host){
  let el = host.querySelector(":scope > .timelineDropIndicator");
  if (!el){ el=document.createElement("div"); el.className="timelineDropIndicator"; host.appendChild(el); }
  return el;
}
function clearTimelineReorderVisuals(){
  document.querySelectorAll(".timelineDropIndicator").forEach(el=>el.remove());
  document.querySelectorAll(".kfChip.dragOver, .grooveSeqChip.dragOver").forEach(el=>el.classList.remove("dragOver"));
  document.querySelectorAll(".kfChip.groupDragging, .grooveSeqChip.groupDragging").forEach(el=>el.classList.remove("groupDragging"));
  const hud=document.getElementById("timelineDragHud"); if (hud) hud.style.display="none";
}
function beginTimelineReorderDrag(kind, sourceIndex, chip, ev){
  if (kfPlaying){ ev.preventDefault(); return false; }
  const host=document.getElementById(kind === "pose" ? "kfList" : "grooveSeqList");
  if (!host) return false;
  let sourceIndices=[sourceIndex];
  if (kfMultiSelectMode){
    const set=timelineSelectedSet(kind);
    if (!set.has(sourceIndex)){ ev.preventDefault(); return false; }
    sourceIndices=Array.from(set).filter(i=>timelineReorderItems(kind)[i]).sort((a,b)=>a-b);
    if (!sourceIndices.length){ ev.preventDefault(); return false; }
  }
  timelineReorderDrag={kind, sourceIndex, sourceIndices, boundary:sourceIndex, finalIndex:sourceIndex, chip, host};
  sourceIndices.forEach(i=>{ const el=timelineReorderChips(kind)[i]; if(el) el.classList.add("groupDragging"); });
  chip.classList.add("dragging");
  ev.dataTransfer.effectAllowed="move";
  try{ ev.dataTransfer.setData("text/plain", `${kind}:${sourceIndices.join(",")}`); }catch(_){}
  return true;
}
function calcTimelineReorderTarget(kind, clientX, host){
  const items=timelineReorderItems(kind), chips=timelineReorderChips(kind), rect=host.getBoundingClientRect();
  const x=clientX-rect.left;
  let boundary=items.length;
  for(let i=0;i<items.length;i++){
    const chip=chips[i]; if(!chip) continue;
    const left=parseFloat(chip.style.left)||0, width=parseFloat(chip.style.width)||chip.offsetWidth||0;
    if(x < left + width/2){ boundary=i; break; }
  }
  const srcs=timelineReorderDrag?.sourceIndices || [timelineReorderDrag?.sourceIndex ?? -1];
  const removedBefore=srcs.filter(i=>i<boundary).length;
  const remainingCount=Math.max(0, items.length-srcs.length);
  let finalIndex=Math.max(0, Math.min(remainingCount, boundary-removedBefore));
  let indicatorX=0;
  if(boundary<items.length && chips[boundary]) indicatorX=parseFloat(chips[boundary].style.left)||0;
  else if(items.length && chips[items.length-1]){
    const last=chips[items.length-1]; indicatorX=(parseFloat(last.style.left)||0)+(parseFloat(last.style.width)||last.offsetWidth||0);
  }
  return {boundary, finalIndex, indicatorX};
}
function isGroupMoveNoop(sourceIndices, finalIndex){
  if(!sourceIndices.length) return true;
  const sorted=sourceIndices.slice().sort((a,b)=>a-b);
  if(!sorted.every((v,i)=>v===sorted[0]+i)) return false;
  return finalIndex===sorted[0];
}
function updateTimelineReorderDrag(kind, ev, host){
  if(!timelineReorderDrag || timelineReorderDrag.kind!==kind) return;
  ev.preventDefault(); ev.dataTransfer.dropEffect="move";
  const t=calcTimelineReorderTarget(kind,ev.clientX,host);
  timelineReorderDrag.boundary=t.boundary; timelineReorderDrag.finalIndex=t.finalIndex;
  ensureTimelineDropIndicator(host).style.left=`${t.indicatorX}px`;
  const chips=timelineReorderChips(kind); chips.forEach(el=>{if(el)el.classList.remove("dragOver")});
  const markIndex=t.boundary<chips.length?t.boundary:chips.length-1;
  if(markIndex>=0 && chips[markIndex] && !(timelineReorderDrag.sourceIndices||[]).includes(markIndex)) chips[markIndex].classList.add("dragOver");
  const hud=document.getElementById("timelineDragHud");
  if(hud){
    const items=timelineReorderItems(kind), count=timelineReorderDrag.sourceIndices.length;
    let where=t.boundary>=items.length?"插入尾端":`插入 ${kind==="pose"?`F${t.boundary+1}`:`第${t.boundary+1}段`} 前`;
    const moved=!isGroupMoveNoop(timelineReorderDrag.sourceIndices,t.finalIndex);
    hud.textContent=`${timelineReorderLabel(kind)}${count>1?` ×${count}`:""} · ${where} · ${moved?`→ 第${t.finalIndex+1}格`:"保持原位"}`;
    hud.style.left=`${Math.min(window.innerWidth-280,ev.clientX+12)}px`; hud.style.top=`${Math.max(6,ev.clientY-30)}px`; hud.style.display="block";
  }
}
function moveTimelineGroup(kind, sourceIndices, finalIndex){
  const items=timelineReorderItems(kind), sorted=sourceIndices.slice().sort((a,b)=>a-b);
  if(!sorted.length || isGroupMoveNoop(sorted,finalIndex)) return false;
  const selectedSet=new Set(sorted), moved=sorted.map(i=>items[i]), remaining=items.filter((_,i)=>!selectedSet.has(i));
  const at=Math.max(0,Math.min(remaining.length,finalIndex));
  const next=[...remaining.slice(0,at),...moved,...remaining.slice(at)];
  if(kind==="pose") keyframes=next; else grooveSequence=next;
  const newSet=new Set(moved.map((_,j)=>at+j));
  if(kind==="pose"){
    kfMultiSelected=newSet; kfEditingIndex=-1; renderKeyframeChips();
  }else{
    grooveMultiSelected=newSet; grooveSeqSelectedIndex=-1; renderGrooveSeqChips(); renderKeyframeChips();
  }
  updateKfMultiSelectBar(); scheduleAutoSave(); return true;
}
function dropTimelineReorder(kind,ev,host){
  if(!timelineReorderDrag || timelineReorderDrag.kind!==kind) return;
  ev.preventDefault();
  const t=calcTimelineReorderTarget(kind,ev.clientX,host), srcs=timelineReorderDrag.sourceIndices.slice();
  const draggedChip=timelineReorderDrag.chip; if(draggedChip)draggedChip.classList.remove("dragging");
  clearTimelineReorderVisuals(); timelineReorderDrag=null;
  let changed=false;
  if(srcs.length>1 || kfMultiSelectMode) changed=moveTimelineGroup(kind,srcs,t.finalIndex);
  else{
    const from=srcs[0], to=t.finalIndex;
    if(from!==to){ if(kind==="pose") reorderKeyframe(from,to); else reorderGrooveSeqEntry(from,to); changed=true; }
  }
  if(changed) pushHistory();
}
function endTimelineReorderDrag(kind){
  if(!timelineReorderDrag || timelineReorderDrag.kind!==kind) return;
  const chip=timelineReorderDrag.chip; if(chip)chip.classList.remove("dragging");
  clearTimelineReorderVisuals(); timelineReorderDrag=null;
}
function bindTimelineReorderHost(kind,host){
  if(!host)return; host.ondragover=(ev)=>updateTimelineReorderDrag(kind,ev,host); host.ondrop=(ev)=>dropTimelineReorder(kind,ev,host);
}

function renderKeyframeChips(){
  timelineEditor.render();
}

// 播放時每幀呼叫：只切換既有 chip 節點的 "playing" class，不重建 DOM、不重新產生 SVG。
// 跟 highlightOverviewRows() 是同一種「結構只建一次、逐幀只動 class」的做法。
function updatePlayingKeyframeHighlight(){
  timelineEditor.updateHighlight();
}

// BG-2：目前 Pose 在共用 Beat 軸上的連續位置。
// 不使用 grooveStartTime 反推，因為 Pose 每一段可以有不同 beats；直接沿用播放核心的 kfIndex/kfStartTime，
// 保證 Playhead 與畫面正在 Slerp 的姿勢是同一個進度。
function getBeatGridPosePlayheadBeat(now){
  if(kfPlaying&&waveClips.length)return Math.min(wavePlaybackEnd(),Math.max(0,(now-grooveStartTime)*bpm/60000));
  if (!kfPlaying || keyframes.length < 2) return 0;
  const frame = keyframes[kfIndex];
  if (!frame) return 0;
  const segBeats = Math.max(0.0001, Number(frame.beats || 1));
  const segMs = (60000 / bpm) * segBeats;
  const progress = Math.max(0, Math.min(1, (now - kfStartTime) / segMs));
  return keyframeStartBeat(kfIndex) + segBeats * progress;
}

function getBeatGridGroovePlaybackInfo(now){
  if (!kfPlaying || grooveSequence.length === 0) return null;
  const beatMs = 60000 / bpm;
  const beatsElapsedTotal = Math.max(0, (now - grooveStartTime) / beatMs);
  const seg = getGrooveActiveSegment(beatsElapsedTotal);
  if (!seg) return null;
  return { beatsElapsedTotal, seg };
}

function updateBeatGridGrooveHighlight(now, poseBeat){
  const info = getBeatGridGroovePlaybackInfo(now);
  const activeIndex = info ? info.seg.segIndex : -1;
  for (let i = 0; i < grooveSeqChipEls.length; i++){
    const chip = grooveSeqChipEls[i];
    if (chip) chip.classList.toggle("activeSeg", kfPlaying && i === activeIndex);
  }

  // Ghost 代表第一輪之後在「本次 Pose 時間軸」上的重複區段。
  // 只高亮 Playhead 當下實際穿過的那一個 ghost，避免同一律動在整條軌上全部一起發亮。
  const host = document.getElementById("grooveSeqList");
  if (!host) return;
  host.querySelectorAll(".beatGridGhost").forEach(ghost => {
    const idx = Number(ghost.dataset.grooveIndex);
    const a = Number(ghost.dataset.startBeat);
    const b = Number(ghost.dataset.endBeat);
    const underPlayhead = poseBeat >= a - 1e-6 && poseBeat < b - 1e-6;
    ghost.classList.toggle("activeSeg", kfPlaying && idx === activeIndex && underPlayhead);
  });
}

function autoScrollBeatGridToPlayhead(playheadX){
  const scroller = document.getElementById("beatGridScroll");
  if (!scroller || scroller.clientWidth <= 0) return;
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  if (maxScroll <= 0) return;

  // Sticky 軌道標籤會佔掉左側固定標籤欄；把 Playhead 維持在可編輯區約 20%~78% 之間。
  const safeLeft = scroller.scrollLeft + BEAT_GRID_LABEL_W + Math.min(70, scroller.clientWidth * 0.12);
  const safeRight = scroller.scrollLeft + scroller.clientWidth - Math.min(120, scroller.clientWidth * 0.22);
  let next = scroller.scrollLeft;
  if (playheadX > safeRight){
    next = playheadX - scroller.clientWidth * 0.72;
  } else if (playheadX < safeLeft){
    next = playheadX - BEAT_GRID_LABEL_W - scroller.clientWidth * 0.12;
  }
  next = Math.max(0, Math.min(maxScroll, next));
  if (Math.abs(next - scroller.scrollLeft) > 0.5) scroller.scrollLeft = next;
}

function updateBeatGridPlaybackUI(now){
  const playhead = document.getElementById("beatGridPlayhead");
  const label = document.getElementById("beatGridPlayheadLabel");
  const scroller = document.getElementById("beatGridScroll");
  if (!playhead) return;
  if (!kfPlaying){
    playhead.classList.remove("visible");
    if (scroller) scroller.classList.remove("playing");
    updateBeatGridGrooveHighlight(now || performance.now(), -1);
    return;
  }

  const poseBeat = getBeatGridPosePlayheadBeat(now);
  const x = BEAT_GRID_LABEL_W + poseBeat * BEAT_GRID_PX_PER_BEAT;
  playhead.style.left = `${x}px`;
  playhead.classList.add("visible");
  if (label) label.textContent = `Beat ${(poseBeat + 1).toFixed(2)}`;
  if (scroller) scroller.classList.add("playing");
  updateBeatGridGrooveHighlight(now, poseBeat);
  autoScrollBeatGridToPlayhead(x);
}

function resetBeatGridPlaybackUI(){
  const playhead = document.getElementById("beatGridPlayhead");
  const scroller = document.getElementById("beatGridScroll");
  if (playhead){ playhead.classList.remove("visible"); playhead.style.left = `${BEAT_GRID_LABEL_W}px`; }
  if (scroller) scroller.classList.remove("playing");
  for (const chip of grooveSeqChipEls) if (chip) chip.classList.remove("activeSeg");
  const host = document.getElementById("grooveSeqList");
  if (host) host.querySelectorAll(".beatGridGhost.activeSeg").forEach(el => el.classList.remove("activeSeg"));
}

// 拍點清單改成單列橫向排列後，一般滑鼠的垂直滾輪天生滾不動橫向內容（要按住 Shift 才行，
// 多數使用者不會這樣做）；這裡把垂直滾動量轉成橫向捲動，滑鼠使用者可以直接滾。
// 觸控板本來就常支援直接橫向滑動（deltaX），那種情況交給瀏覽器原生處理，不要搶著轉換。
let beatGridLastPreviewBeat = 0;

function getBeatGridCurrentNavigationBeat(){
  if (kfPlaying) return getBeatGridPosePlayheadBeat(performance.now());
  const audioEl = document.getElementById("kfAudioEl");
  if (audioEl && audioEl.src && Number.isFinite(audioEl.currentTime)) return clampNum(audioTimeToTimelineBeat(audioEl.currentTime), 0, beatGridTimelineBeats());
  return clampNum(beatGridLastPreviewBeat || 0, 0, beatGridTimelineBeats());
}

function scrollBeatGridBeatToCenter(beat){
  const scroller = document.getElementById("beatGridScroll");
  if (!scroller) return;
  const x = BEAT_GRID_LABEL_W + clampNum(beat, 0, beatGridTimelineBeats()) * BEAT_GRID_PX_PER_BEAT;
  const desired = x - scroller.clientWidth * 0.5;
  const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  scroller.scrollLeft = clampNum(desired, 0, maxScroll);
}

function navigateBeatGridToBeat(beat){
  if (kfPlaying) return;
  const target = clampNum(beat, 0, beatGridTimelineBeats());
  beatGridLastPreviewBeat = target;
  applyTimelinePreviewAtElapsed(target * 60000 / bpm);
  const audioEl = document.getElementById("kfAudioEl");
  if (audioEl && audioEl.src && waveform.duration > 0){
    try { audioEl.currentTime = clampNum(timelineBeatToAudioTime(target), 0, waveform.duration); } catch (_) {}
  }
  showBeatGridScrubPlayhead(target);
  scrollBeatGridBeatToCenter(target);
}

function centerBeatGridPlayhead(){
  scrollBeatGridBeatToCenter(getBeatGridCurrentNavigationBeat());
}

function fitBeatGridTimeline(){
  const scroller = document.getElementById("beatGridScroll");
  if (!scroller) return;
  const beats = Math.max(0.25, beatGridTimelineBeats());
  const usable = Math.max(120, scroller.clientWidth - BEAT_GRID_LABEL_W - 8);
  const px = clampNum(usable / beats, 18, 144);
  const old = BEAT_GRID_PX_PER_BEAT;
  BEAT_GRID_PX_PER_BEAT = px;
  syncBeatGridZoomSelect(px, true);
  refreshBeatGridZoomLayout();
  scroller.scrollLeft = 0;
}

function syncBeatGridZoomSelect(px = BEAT_GRID_PX_PER_BEAT, custom = false){
  const select = document.getElementById("beatGridZoomSelect");
  if (!select) return;
  select.querySelectorAll('option[data-custom-zoom="1"]').forEach(o => o.remove());
  const exact = Array.from(select.options).find(o => Math.abs(Number(o.value) - px) < 0.01);
  if (exact){ select.value = exact.value; return; }
  const opt = document.createElement("option");
  opt.dataset.customZoom = "1";
  opt.value = String(px);
  opt.textContent = custom ? `Fit ${Math.round(px / 72 * 100)}%` : `${Math.round(px / 72 * 100)}%`;
  select.appendChild(opt);
  select.value = opt.value;
}

function initKfListWheelScroll(){
  const list = document.getElementById("beatGridScroll");
  if (!list) return;
  list.addEventListener("wheel", (e) => {
    // BG-4.2：Ctrl/Cmd + 滾輪縮放整條時間軸，並以滑鼠所在 Beat 當縮放錨點。
    if (e.ctrlKey || e.metaKey){
      const rect = list.getBoundingClientRect();
      const anchorX = e.clientX - rect.left;
      stepBeatGridZoom(e.deltaY < 0 ? 1 : -1, anchorX);
      e.preventDefault();
      return;
    }
    if (e.shiftKey){
      list.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      e.preventDefault();
      return;
    }
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    list.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive:false });
}

// 拍點清單鍵盤快捷鍵：只在「時間軸」分頁作用中、且沒有正在某個輸入框打字時生效，
// 避免跟其他分頁操作或打字輸入互相搶按鍵。播放中也不接管，避免跟播放狀態衝突。
// ←/→：切換選取上一拍/下一拍　Delete/Backspace：刪除目前選取的 POSE 或 GROOVE　Ctrl/Cmd+D：複製選取中的拍點
function bindKfKeyboardShortcuts(){
  window.addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (typing || !isKeyframeTabActive()) return;
    if (e.key === "Escape" && hasBeatGridRange()){ e.preventDefault(); clearBeatGridRange(); return; }
    if (!kfPlaying && e.key === "Home"){ e.preventDefault(); navigateBeatGridToBeat(0); return; }
    if (!kfPlaying && e.key === "End"){ e.preventDefault(); navigateBeatGridToBeat(beatGridTimelineBeats()); return; }
    if (!kfPlaying && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "f"){ e.preventDefault(); fitBeatGridTimeline(); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "c"){ e.preventDefault(); centerBeatGridPlayhead(); return; }
    if (kfPlaying) return;
    if(waveClipSelected){
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteWaveClip();return;}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateWaveClip();return;}
    }

    // 多選模式下，←/→切換選取跟 Ctrl+D複製都沒有明確意義（多選沒有「唯一選取中」的拍點），
    // 只保留 Delete/Backspace，行為改成刪除目前已勾選的全部拍點。
    if (kfMultiSelectMode){
      if (e.key === "Delete" || e.key === "Backspace"){
        if (kfMultiSelected.size === 0 && grooveMultiSelected.size === 0) return;
        e.preventDefault();
        deleteTimelineSelection({confirmDelete:false, push:true});
      }
      return;
    }

    if (e.key === "ArrowLeft" || e.key === "ArrowRight"){
      if (keyframes.length === 0) return;
      e.preventDefault();
      let next = kfEditingIndex < 0 ? 0 : kfEditingIndex + (e.key === "ArrowRight" ? 1 : -1);
      next = Math.max(0, Math.min(keyframes.length - 1, next));
      selectKeyframe(next);
    } else if (e.key === "Delete" || e.key === "Backspace"){
      if (grooveSeqSelectedIndex >= 0){
        e.preventDefault();
        removeGrooveSeqEntry(grooveSeqSelectedIndex);
        pushHistory();
        return;
      }
      if (kfEditingIndex < 0) return;
      e.preventDefault();
      deleteKeyframe(kfEditingIndex);
      pushHistory();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d"){
      if (kfEditingIndex < 0) return;
      e.preventDefault();
      duplicateKeyframe(kfEditingIndex);
      pushHistory();
    }
  });
}

function toggleKeyframePlayback(){
  tgCancelPreview();
  stopWave();
  stopLAPath();
  if (kfPlaying){ stopKeyframePlayback(); return; }
  if (keyframes.length < 2 && !waveClips.length){
    alert("至少需要 2 個拍點才能播放（目前只有 " + keyframes.length + " 個）");
    return;
  }
  // (預設循環功能已移除，原本這裡用來避免跟拍點播放同時搶骨骼的判斷已不再需要)
  deselectJoint();
  transformControls.enabled = false;
  kfPlaying = true;
  const playStartBeat = beatGridRangeLoop && hasBeatGridRange() ? beatGridRangeStart : 0;
  const playStartNow = performance.now();
  const startLoc = locateKeyframeSegmentAtBeat(playStartBeat);
  kfIndex = startLoc.index;
  kfStartTime = playStartNow - startLoc.localBeat * (60000 / bpm);
  grooveStartTime = playStartNow - playStartBeat * (60000 / bpm); // Range Loop 從中段開始時，Groove 相位仍與全域 Beat 軸一致
  grooveSquatAnchored = false;   // 重新對齊蹲彈的腳掌原地錨點，避免沿用上次播放結束時的舊姿勢
  resetGrooveXfadeState();       // 清掉上次播放殘留的段落切換狀態，避免這次重新開始時誤觸一次不該有的交叉淡化
  resetSquatXfadeState();
  if (playStartBeat > 0){
    const audioEl = document.getElementById("kfAudioEl");
    if (audioEl && audioEl.src){
      try { audioEl.currentTime = clampNum(timelineBeatToAudioTime(playStartBeat), 0, waveform.duration || Number.MAX_SAFE_INTEGER); } catch (_) {}
      audioEl.play().catch((e) => console.warn("音樂播放失敗（可能需要先跟頁面互動一次）：", e));
    }
  } else {
    playKfMusicIfLoaded();
  }
  document.getElementById("kfPlayBtn").classList.add("playing");
  document.getElementById("kfPlayBtn").textContent = "■ 停止";
  updateOnionSkins(); // 立刻依 kfIndex=0 顯示第一段過渡的殘影，不用等到跨到下一拍才出現
  const beatGridScroll = document.getElementById("beatGridScroll");
  if (beatGridScroll){
    if (playStartBeat > 0) scrollBeatGridBeatToCenter(playStartBeat);
    else beatGridScroll.scrollLeft = 0;
  }
  updatePlayingKeyframeHighlight();
  updateBeatGridPlaybackUI(kfStartTime);
}

function stopKeyframePlayback(){
  if(waveClips.length){for(const k of ALL_JOINT_KEYS)if(bones[k])syncWaveTrackTarget(k);}
  waveTrackActive=false;
  kfPlaying = false;
  transformControls.enabled = true;
  pauseKfMusic();
  document.getElementById("kfPlayBtn").classList.remove("playing");
  document.getElementById("kfPlayBtn").textContent = "▶ 播放";
  renderKeyframeChips();
  resetBeatGridPlaybackUI();
}

// ---- 時間軸配樂（音樂試聽）----
// 只存在這次瀏覽階段：不寫進自動存檔／匯出 JSON，重新整理頁面或匯入編舞後都需要重新匯入音樂檔。
// 理由：音樂檔通常數MB起跳，塞進localStorage容易爆容量、塞進JSON也會讓檔案暴增又難以分享。


function importKfMusic(file){
  if (!file) return;
  timelineAudio.importFile(file, parseFloat(document.getElementById("kfMusicVolume").value));
  document.getElementById("kfMusicName").textContent = file.name;
  document.getElementById("kfMusicRemoveBtn").style.display = "";
  document.getElementById("kfMusicControlsRow").style.display = "flex";
  const waveformRow = document.getElementById("beatGridWaveformRow");
  if (waveformRow) waveformRow.style.display = "grid";
  const waveformTrack = document.getElementById("beatGridWaveformTrack");
  if (waveformTrack){ waveformTrack.classList.add("waveformLoading"); waveformTrack.classList.remove("waveformError"); }
  // 音樂試聽/波形整組收合區塊平常隱藏（沒音樂時展開了也是空的沒意義），匯入後才讓它現身並自動展開，
  // 使用者不用自己再多點一次「展開」才看得到剛匯入的內容
  const details = document.getElementById("kfMusicWaveformDetails");
  if (details){ details.style.display = "block"; details.open = true; }
  syncKfMusicPreviewBtn();
  updateBeatGridGeometry();
  decodeKfWaveform(file);
}

function removeKfMusic(){
  timelineAudio.remove();
  waveform.clear();
  resetKfWaveformZoomUI();
  document.getElementById("kfMusicName").textContent = "尚未匯入音樂";
  document.getElementById("kfMusicRemoveBtn").style.display = "none";
  document.getElementById("kfMusicControlsRow").style.display = "none";
  const waveformRow = document.getElementById("beatGridWaveformRow");
  if (waveformRow) waveformRow.style.display = "none";
  const waveformTrack = document.getElementById("beatGridWaveformTrack");
  if (waveformTrack) waveformTrack.classList.remove("waveformLoading", "waveformError");
  updateBeatGridGeometry();
  if (!kfPlaying) resetBeatGridPlaybackUI();
  // 音樂移除了，連帶把整組收合區塊也藏回去，跟匯入前的初始狀態一致
  const details = document.getElementById("kfMusicWaveformDetails");
  if (details){ details.style.display = "none"; details.open = false; }
  syncKfMusicPreviewBtn();
}

// 拍點播放開始時呼叫：若已匯入音樂，跳到「起始秒數」並同步播放；沒匯入音樂則不做任何事。
function playKfMusicIfLoaded(){
  return timelineAudio.playFromOffset();
}

// 拍點播放停止時呼叫：暫停音樂（若有在播放）。
function pauseKfMusic(){
  return timelineAudio.pause();
}

// 「🎵 試聽」：單純播放/暫停音樂本身，跟拍點播放狀態無關——確認音樂內容時常常
// 還沒有任何拍點（甚至還沒開始編舞），這時「▶ 播放拍點」按不了（需要至少2個拍點），
// 所以獨立出這顆按鈕。按鈕文字用 audioEl 的 play/pause/ended 事件同步，不用自己管狀態機。
function toggleKfMusicPreview(){
  return timelineAudio.togglePreview();
}

function syncKfMusicPreviewBtn(){
  const btn = document.getElementById("kfMusicPreviewBtn");
  const audioEl = document.getElementById("kfAudioEl");
  if (!btn || !audioEl) return;
  btn.textContent = audioEl.paused ? "🎵 試聽" : "⏸ 暫停";
}

// ---- BG-4.1：Waveform 與 Beat Grid 共用時間座標／scroll／Playhead ----
// Beat 0 對應音樂 kfMusicOffset 秒；每一拍的秒數固定為 60 / bpm。
// Waveform 不再維護自己的 zoom / viewStart / scroll，所有 x 都直接使用 Beat Grid 的 pixelsPerBeat。
let kfScrubDragging = false;

function resetKfWaveformZoomUI(){ /* BG-4.1：保留空殼供舊呼叫相容；獨立 Waveform zoom 已移除。 */ }

function getKfMusicOffsetSec(){
  const el = document.getElementById("kfMusicOffset");
  return el ? Math.max(0, parseFloat(el.value) || 0) : 0;
}

function timelineBeatToAudioTime(beat){
  return timelineAudio.beatToTime(beat);
}

function audioTimeToTimelineBeat(sec){
  return timelineAudio.timeToBeat(sec);
}

async function decodeKfWaveform(file){
  const pending = waveform.decode(file);
  const track = document.getElementById("beatGridWaveformTrack");
  if (track){ track.classList.add("waveformLoading"); track.classList.remove("waveformError"); }
  drawKfWaveform();
  const result = await pending;
  if (result.status === "stale") return;
  if (result.status === "ready"){
    if (track) track.classList.remove("waveformLoading", "waveformError");
  } else {
    console.warn("波形解碼失敗（音樂仍可正常播放）：", result.error);
    if (track){ track.classList.remove("waveformLoading"); track.classList.add("waveformError"); }
  }
  updateBeatGridGeometry();
  drawKfWaveform();
}





// 只繪製目前 Beat Grid 可視範圍附近的波形到 canvas backing store，再用 CSS 把 canvas 對齊整條 timeline。
// 為避免超長歌曲建立數萬像素 canvas，backing store 上限 16384px；CSS 寬度仍等於完整 timeline 寬。
function drawKfWaveform(){
  waveformView.draw();
}

function applyTimelinePreviewAtElapsed(elapsedMs){
  if(waveClips.length){
    if(waveRun)stopWave();
    const oldIndex=kfIndex,beat=Math.max(0,elapsedMs*bpm/60000);
    waveBaseAtBeat(beat);applyWaveTrackAtBeat(beat);
    for(const k of ALL_JOINT_KEYS)syncWaveTrackTarget(k);
    kfIndex=oldIndex;return;
  }
  if(waveRun)stopWave();
  if (keyframes.length === 0) return;
  if (keyframes.length === 1 || elapsedMs <= 0){
    applyPose(keyframes[0].angles);
    applyBodyTransform(keyframes[0].body);
    return;
  }
  let acc = 0;
  for (let i = 0; i < keyframes.length - 1; i++){
    const beats = keyframes[i].beats || 1;
    const segMs = (60000 / bpm) * beats;
    const isLast = i === keyframes.length - 2;
    if (elapsedMs <= acc + segMs || isLast){
      const rawT = segMs > 0 ? (elapsedMs - acc) / segMs : 1;
      const t = clampNum(rawT, 0, 1);
      const easeFn = EASINGS[keyframes[i].easing] || EASINGS.linear;
      applyKeyframeFramePose(keyframes[i], keyframes[i + 1], easeFn(t));
      if(keyframes[i].waveBake){for(const k of ALL_JOINT_KEYS)syncWaveTrackTarget(k);}
      return;
    }
    acc += segMs;
  }
}

function showBeatGridScrubPlayhead(beat){
  beatGridLastPreviewBeat = clampNum(beat, 0, beatGridTimelineBeats());
  const playhead = document.getElementById("beatGridPlayhead");
  const label = document.getElementById("beatGridPlayheadLabel");
  if (!playhead) return;
  const x = BEAT_GRID_LABEL_W + beat * BEAT_GRID_PX_PER_BEAT;
  playhead.style.left = `${x}px`;
  playhead.classList.add("visible");
  if (label) label.textContent = `Beat ${(beat + 1).toFixed(2)}`;
  autoScrollBeatGridToPlayhead(x);
}

function seekKfTimelineFromClientX(clientX){
  const track = document.getElementById("beatGridWaveformTrack");
  if (!track || !(waveform.duration > 0)) return;
  const rect = track.getBoundingClientRect();
  const beat = clampNum((clientX - rect.left) / BEAT_GRID_PX_PER_BEAT, 0, beatGridTimelineBeats());
  const newTime = clampNum(timelineBeatToAudioTime(beat), 0, waveform.duration);
  const audioEl = document.getElementById("kfAudioEl");
  if (audioEl) audioEl.currentTime = newTime;
  applyTimelinePreviewAtElapsed(beat * 60000 / bpm);
  showBeatGridScrubPlayhead(beat);
}

function bindKfWaveformScrubbing(){
  const canvas = document.getElementById("kfWaveformCanvas");
  if (!canvas) return;
  canvas.addEventListener("pointerdown", (e) => {
    if (!(waveform.duration > 0)) return;
    if (kfPlaying) stopKeyframePlayback();
    kfScrubDragging = true;
    canvas.setPointerCapture(e.pointerId);
    seekKfTimelineFromClientX(e.clientX);
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!kfScrubDragging) return;
    seekKfTimelineFromClientX(e.clientX);
  });
  const endDrag = (e) => {
    if (!kfScrubDragging) return;
    kfScrubDragging = false;
    try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
}

function updateBeatGridMusicPreviewPlayhead(){
  if (kfPlaying || kfScrubDragging) return;
  const audioEl = document.getElementById("kfAudioEl");
  if (!audioEl || !audioEl.src) return;
  const beat = audioTimeToTimelineBeat(audioEl.currentTime || 0);
  if (beat < 0 || beat > beatGridTimelineBeats()) return;
  if (!audioEl.paused) showBeatGridScrubPlayhead(beat);
}

// ---- 軌跡播放時即時覆蓋（階段二：曲線播放時真的平滑，不是靠取樣點密度逼近）----
// 檢查 frameA/frameB 是否對同一個 limb 記錄了相同 trajId 的 traj 資料，若是，
// 代表這兩個拍點屬於同一次「生成拍點」批次，回傳這些 limb 的 root/mid 骨骼key，
// 讓上面的一般角度slerp迴圈跳過它們（改由 applyTrajOverridesDuringPlayback 接管）。
// 大多數拍點沒有軌跡資料，是最常見的情況：共用一組唯讀的空陣列/空 Set 給這個情況用，
// 呼叫端只會對它們做 .has()／.length 讀取，不會修改，所以能安全跨幀共用同一個實例。
const _EMPTY_OVERRIDE_LIMBS = [];
const _EMPTY_OVERRIDE_KEYS = new Set();
function collectTrajOverrideKeys(frameA, frameB){
  if (!frameA.traj || !frameB.traj) return { overrideLimbs: _EMPTY_OVERRIDE_LIMBS, overrideKeys: _EMPTY_OVERRIDE_KEYS };
  const overrideLimbs = [];
  const overrideKeys = new Set();
  for (const limb of IK_LIMB_KEYS){
    const a = frameA.traj[limb], b = frameB.traj[limb];
    if (a && b && a.id === b.id){
      overrideLimbs.push(limb);
      const chain = IK_CHAINS[limb];
      overrideKeys.add(chain.root);
      overrideKeys.add(chain.mid);
    }
  }
  return { overrideLimbs, overrideKeys };
}

// 對每個觸發軌跡覆蓋的 limb：在 frameA.traj[limb].t 與 frameB.traj[limb].t 之間用 et 內插出
// 目前應該落在路徑上的進度，直接用純數學的 sampleTrajectoryFromPoints 取樣出座標（不受拍點密度限制），
// 疊加上「本幀最新」的 root 骨骼世界座標，重新呼叫一次 solveTwoBoneIK。
// 末端骨骼（手掌/腳掌）本身的旋轉維持上面迴圈已經slerp好的結果，這裡不動它
// （呼應「IK只驅動root+mid，末端保留FK」的既有設計哲學）。
const _tpRootPos = new THREE.Vector3();
const _tpTargetPos = new THREE.Vector3();
const _tpPoleA = new THREE.Vector3();
const _tpPoleB = new THREE.Vector3();
const _tpPolePos = new THREE.Vector3();
function applyTrajOverridesDuringPlayback(limbs, frameA, frameB, et){
  const eClamped = clampNum(et, 0, 1); // 取樣進度用clamp過的et，避免overshoot easing把curT甩出[0,1]產生怪座標
  for (const limb of limbs){
    const chain = IK_CHAINS[limb];
    const rootBone = bones[chain.root], midBone = bones[chain.mid], endBone = bones[chain.end];
    if (!rootBone || !midBone || !endBone) continue;
    const trajA = frameA.traj[limb], trajB = frameB.traj[limb];
    const curT = trajA.t + (trajB.t - trajA.t) * eClamped;
    const mode = trajA.mode;

    // 關鍵：這裡讀到的必須是「本幀剛套用完軀幹FK/身體位置之後」的最新世界座標，
    // 呼叫端已在此之前手動跑過 model.updateMatrixWorld(true)，見 updateKeyframePlayback。
    const rootPos = _tpRootPos; rootBone.getWorldPosition(rootPos);
    const localOffset = sampleTrajectoryFromPoints(mode, trajA.points, curT, !!trajA.closed); // 內部自行配置，屬低頻呼叫（每肢體每幀一次）不特別處理；舊資料沒有closed欄位時預設false
    const targetPos = _tpTargetPos.copy(rootPos).add(localOffset);

    const poleA = _tpPoleA.set(trajA.pole.x, trajA.pole.y, trajA.pole.z);
    const poleB = _tpPoleB.set(trajB.pole.x, trajB.pole.y, trajB.pole.z);
    const poleLocal = poleA.lerp(poleB, eClamped);
    const polePos = _tpPolePos.copy(rootPos).add(poleLocal);

    solveTwoBoneIK(rootBone, midBone, endBone, targetPos, polePos);
  }
}

// 拍點播放時最熱的路徑：每幀都要跑過全部關節key（body+finger共約50個），逐key slerp。
// qa/qb 需要同時存在才能做 slerp，所以要用兩個獨立的暫存 Quaternion（不能共用同一個）。
const _kfQA = new THREE.Quaternion();
const _kfQB = new THREE.Quaternion();
const _kfQResult = new THREE.Quaternion();
const _kfBodyPosA = new THREE.Vector3();
const _kfBodyPosB = new THREE.Vector3();
const _kfBodyQA = new THREE.Quaternion();
const _kfBodyQB = new THREE.Quaternion();
// 純套用函式：把 frameA→frameB 之間、進度 et（已套過 easing）的內插姿勢套到骨架上。
// 不碰 kfIndex/kfStartTime 這些「播放狀態」，所以拍點播放（updateKeyframePlayback）跟
// 拖曳波形游標預覽（applyTimelinePreviewAtElapsed）可以共用同一套內插邏輯，不用寫兩次。
function applyKeyframeFramePose(frameA, frameB, et){
  // 這兩個limb的root/mid骨骼改由軌跡即時IK接管，下面的一般角度slerp迴圈要跳過它們
  const { overrideLimbs, overrideKeys } = collectTrajOverrideKeys(frameA, frameB);

  for (const key of ALL_JOINT_KEYS){
    if (overrideKeys.has(key)) continue;
    const bone = bones[key];
    if (!bone || !restQuat[key]) continue;
    const anglesA = frameA.angles[key] || [0,0,0];
    const anglesB = frameB.angles[key] || anglesA;
    // qa/qb 兩個結果需要同時存在（下面slerp要同時讀兩者），所以各自用獨立的暫存Quaternion，
    // 不能共用同一個（會互相覆寫）；qResult 再用第三個暫存物件裝 slerp 後的結果。
    eulerToQuat(anglesA, _kfQA);
    eulerToQuat(anglesB, _kfQB);
    const q = _kfQResult.copy(_kfQA).slerp(_kfQB, et); // 四元數球面線性插值：最短路徑、依 Easing 曲線變速
    bone.quaternion.copy(restQuat[key]).multiply(q);
  }

  // 身體位置/朝向內插：舊拍點沒有 body 欄位時容錯跳過，身體維持原地不動
  if (frameA.body && frameB.body){
    _kfBodyPosA.fromArray(frameA.body.position);
    _kfBodyPosB.fromArray(frameB.body.position);
    model.position.lerpVectors(_kfBodyPosA, _kfBodyPosB, et);
    _kfBodyQA.fromArray(frameA.body.quaternion);
    _kfBodyQB.fromArray(frameB.body.quaternion);
    model.quaternion.copy(_kfBodyQA).slerp(_kfBodyQB, et);
  }

  // ⚠️ 關鍵坑：three.js只在renderer.render()才會重算matrixWorld，上面剛套用的軀幹/身體姿勢
  // 這時候读 bone.getWorldPosition() 拿到的還是「上一幀」的舊值。若不在這裡手動刷新一次，
  // 底下算軌跡目標點用的root世界座標會跟這一幀的軀幹動作對不上，產生一幀的滯後感。
  model.updateMatrixWorld(true);

  if (overrideLimbs.length > 0){
    applyTrajOverridesDuringPlayback(overrideLimbs, frameA, frameB, et);
  }

  if(frameA.waveBake){applyBakedWaveFeet(frameA);return new Set(ALL_JOINT_KEYS);}
  return overrideKeys; // 供呼叫端疊加律動時避開這幾個被軌跡IK接管的關節（見 applyGroove）
}

// 律動模式：在拍點播放的姿勢之上，額外疊加一層隨 BPM 持續振盪的旋轉偏移。
// 用「post-multiply」的方式疊在 applyKeyframeFramePose 剛算完的 bone.quaternion 之後，
// 不動 frameA/frameB 存的角度資料本身，所以律動不會被誤存進拍點、也不影響編輯模式。
// overrideKeys：跳過目前被軌跡IK接管的關節，避免律動的旋轉偏移跟軌跡算出來的姿勢互相打架。
const _grooveEuler = [0, 0, 0];
const _grooveQuat = new THREE.Quaternion();

// ---- 律動序列段落切換的交叉淡化（crossfade）----
// 段落切換時 localBeats 歸零，若新舊段落對同一關節用不同振幅/軸向/波形，交界處會硬接跳動；
// 這裡讓切換後的一小段時間內（GROOVE_XFADE_BEATS 拍）同時算「舊段落延續下去的值」跟「新段落
// 從頭算的值」，用 Slerp 依時間比例混合，過了這段時間就恢復成只算新段落，不佔額外效能。
// 用四元數 Slerp 而不是直接內插角度數值，是因為新舊兩段可能對同一關節用不同軸向，直接內插
// 數值在這種情況下沒有意義，Slerp 對任意兩個朝向都能給出平滑的中間路徑。
const GROOVE_XFADE_BEATS = 0.3; // 交叉淡化視窗長度（拍）：太短看不出效果、太長會讓段落轉換顯得拖泥帶水
const _grooveXfadeOldQuat = new THREE.Quaternion();
const _grooveXfadeNewQuat = new THREE.Quaternion();
let grooveLastSegIndex = -1;      // 上一幀算出來是序列的第幾段，用來偵測「這一幀是不是剛切換到新段落」
let grooveLastSegSnapshot = null; // { keys, paramsFor, localBeats }：切換前那一幀的資料，當作舊段落淡出的起點
let grooveXfade = null;           // 目前是否處於交叉淡化視窗內：{ switchElapsed, fromKeys, fromParamsFor, fromLocalBeatsAtSwitch }

// 播放/預覽重新開始時呼叫，清掉上面這些跨幀狀態，避免用到「上一次播放到一半」殘留的舊段落資料
// 導致重新開始的第一瞬間出現一次不該有的交叉淡化（見 toggleKeyframePlayback／律動預覽開關）。
function resetGrooveXfadeState(){
  grooveLastSegIndex = -1;
  grooveLastSegSnapshot = null;
  grooveXfade = null;
}
// startTime 預設用播放拍點的 grooveStartTime；即時預覽呼叫時會傳自己的 groovePreviewStartTime，
// 兩條時鐘互相獨立，不會因為切換播放/預覽而互相干擾或跳拍。
// 若已建立「律動序列」（見 getGrooveActiveSegment 上方註解），這裡會整組改用序列目前解析出
// 的律動庫項目設定，覆蓋掉上面手動勾選的 grooveJointSet／grooveCustomParams；段落切換時振盪
// 相位採「歸零」策略（用 seg.localBeats 而非連續的 beatsElapsedTotal）——不同段落的關節組合／
// 振幅／軸向通常不一樣，若相位不歸零，交界處角度會硬接產生瞬間跳動，歸零則每段都從頭平順擺起。
// 沒有建立序列時完全維持原本行為（連續時鐘＋全域手動設定），向下相容舊存檔跟沒用過此功能的使用者。
// useSequence：是否允許套用律動序列——播放拍點時維持預設 true（有序列就用序列，沒有序列退回手動設定）；
// 「律動預覽」呼叫時會傳 false，讓預覽固定只看「節奏與律動」分頁目前手動勾選/調整的設定，不會被
// 序列蓋掉。理由：預覽的用途是「邊調參數邊看手感」，調的正是這些手動設定，若序列存在時被序列蓋掉，
// 使用者調滑桿會完全沒有反應（看起來像是壞掉），詳見這個參數新增時修的那個回報。
function applyGroove(now, overrideKeys, startTime = grooveStartTime, useSequence = true){
  const beatMs = 60000 / bpm; // 律動節拍固定跟目前 BPM 走，不受個別拍點自訂「拍數」影響，維持一致的律動感
  const beatsElapsedTotal = (now - startTime) / beatMs;
  const warmupRamp = grooveWarmupRamp(beatsElapsedTotal); // 只在整段律動剛開始的頭幾拍<1，之後恆為1，見 grooveWarmupRamp 上方註解

  let activeJointKeys, paramsFor, phaseClock;
  if (useSequence && grooveSequence.length > 0){
    const seg = getGrooveActiveSegment(beatsElapsedTotal);
    if (!seg) return; // 序列存在但總拍數算出來是0（理論上不會發生，拍數輸入框最小值是1），防呆保留
    let resolvedItem = seg.item;
    if (resolvedItem){
      lastValidGrooveSeqItem = resolvedItem; // 記住這次成功解析到的項目，供後面段落萬一查無項目時沿用
    } else {
      resolvedItem = lastValidGrooveSeqItem; // 這段引用的律動庫項目已被刪除：沿用上一個有效段落的設定，避免播放中途動作瞬間僵直
    }
    if (!resolvedItem) return; // 連前面都沒有任何有效段落可沿用（例如序列第一段就是壞的），只好先不套用
    const data = resolvedItem.data || {};
    activeJointKeys = Array.isArray(data.jointSet) ? data.jointSet : [];
    paramsFor = (key) => {
      const base = GROOVE_PRESETS[key];
      if (!base) return null;
      const custom = data.customParams && data.customParams[key];
      return custom ? Object.assign({}, base, custom) : base;
    };
    phaseClock = seg.localBeats; // 拍子相位仍用「目前這一段自己」的 localBeats，只有動作參數沿用舊項目，節奏不會跟著斷掉

    // 偵測是否剛切換到新段落：跟上一幀記的 segIndex 不一樣就代表換了。即使序列循環繞回同一個
    // libId 也算切換（見 getGrooveActiveSegment 上方註解），因為 localBeats 一樣會歸零。
    if (grooveLastSegIndex !== -1 && grooveLastSegIndex !== seg.segIndex && grooveLastSegSnapshot){
      grooveXfade = {
        switchElapsed: beatsElapsedTotal,
        fromKeys: grooveLastSegSnapshot.keys,
        fromParamsFor: grooveLastSegSnapshot.paramsFor,
        fromLocalBeatsAtSwitch: grooveLastSegSnapshot.localBeats
      };
    }
    grooveLastSegIndex = seg.segIndex;
    grooveLastSegSnapshot = { keys: activeJointKeys, paramsFor, localBeats: phaseClock };
  } else {
    if (grooveJointSet.size === 0) return;
    activeJointKeys = grooveJointSet;
    paramsFor = getGrooveParams; // 合併預設值+使用者自訂覆寫（見 getGrooveParams）
    phaseClock = beatsElapsedTotal;
    resetGrooveXfadeState(); // 沒有序列、或 useSequence=false（律動預覽）時都沒有「段落」這個概念，不需要交叉淡化，順便清掉殘留狀態
  }

  // 若正處於交叉淡化視窗內，算出「舊段落淡出權重」與舊段落自己延續下去的拍子時鐘；
  // 視窗結束後清掉狀態，之後單純只算新段落，跟沒有交叉淡化時完全一樣，不佔額外效能。
  let xfadeWeight = 0, fromKeys = null, fromParamsFor = null, fromPhaseClock = 0;
  if (grooveXfade){
    const elapsedSinceSwitch = beatsElapsedTotal - grooveXfade.switchElapsed;
    if (elapsedSinceSwitch >= GROOVE_XFADE_BEATS || elapsedSinceSwitch < 0){
      grooveXfade = null; // elapsedSinceSwitch<0 理論上不會發生（時間不會倒流），防呆順便清掉避免卡住
    } else {
      xfadeWeight = 1 - (elapsedSinceSwitch / GROOVE_XFADE_BEATS); // 1→0：舊段落的貢獻度隨時間線性淡出
      fromKeys = grooveXfade.fromKeys;
      fromParamsFor = grooveXfade.fromParamsFor;
      // 延續時鐘：假裝舊段落沒被打斷，讓它的相位順著原本節奏繼續走，這樣「舊段落這一側」完全
      // 不會有跳動，混合結束時貢獻度自然淡到0，不需要額外處理收尾。
      fromPhaseClock = grooveXfade.fromLocalBeatsAtSwitch + elapsedSinceSwitch;
    }
  }

  const hasFromKeys = xfadeWeight > 0 && fromKeys;
  const keysToProcess = hasFromKeys ? new Set([...activeJointKeys, ...fromKeys]) : activeJointKeys;

  for (const key of keysToProcess){
    if (overrideKeys && overrideKeys.has(key)) continue;
    const bone = bones[key];
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

// 捕捉「目前」雙腳的世界座標/世界旋轉當蹲彈的原地錨點——之後不管身體怎麼上下/左右移動，
// 兩腿IK都會反算成讓腳掌精準貼住這個點，腳踝則鎖住這個旋轉，模擬「腳掌貼地不動」。
// 呼叫時機：每次重新開始播放/預覽（grooveSquatAnchored 被重置為 false）的第一幀。
function captureSquatFootAnchors(){
  for (const limb of ["rLeg", "lLeg"]){
    const chain = IK_CHAINS[limb];
    const footBone = bones[chain.end];
    if (!footBone) continue;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    footBone.getWorldPosition(pos);
    footBone.getWorldQuaternion(quat);
    grooveSquatFootAnchor[limb] = pos;
    grooveSquatFootLockedQuat[limb] = quat;
  }
  grooveSquatAnchored = true;
}

function resetSquatFootAnchors(){
  grooveSquatAnchored = false;
  grooveSquatFootAnchor = { rLeg:null, lLeg:null };
  grooveSquatFootLockedQuat = { rLeg:null, lLeg:null };
}

// 蹲彈律動：用 Hips 平移驅動身體整體升降/側移，兩腿各自反算IK讓腳掌固定在原地錨點，
// 腳踝鎖存世界旋轉維持貼地。跟 applyGroove()（單關節旋轉疊加）是兩套獨立機制，
// 但共用同一份 BPM 時鐘/波形函式，感覺上仍是「同一個律動」的一部分。
//
// needsDriftCorrection：是否需要「先扣掉上一幀疊加的位移再加新的」。
// - 播放拍點時傳 false：因為 applyKeyframeFramePose() 每一幀都會把 model.position 重設成
//   全新的內插值，這裡的位移是疊加在「本幀全新的基準」上，不會累積，直接加就好。
// - 即時預覽（非播放）時傳 true：animate() 的閒置分支不會有任何流程重設 model.position，
//   所以每幀都要先扣掉上一幀加的量、再加這一幀新算出來的量，否則位移會逐幀疊加一路往下沉。
const _squatDeltaTmp = new THREE.Vector3();
const _squatMidPosTmp = new THREE.Vector3();
const _squatPolePosTmp = new THREE.Vector3();

// 蹲彈律動的交叉淡化狀態，跟 applyGroove 那組（grooveLastSegIndex 等）概念一樣，但蹲彈是獨立
// 系統，狀態分開存，避免兩邊互相干擾；共用同一個 GROOVE_XFADE_BEATS 視窗長度。
let squatLastSegIndex = -1;      // 上一幀是序列的第幾段
let squatLastSegSnapshot = null; // { enabled, params, localBeats }：切換前那一幀的蹲彈設定，淡出起點
let squatXfade = null;           // { switchElapsed, fromEnabled, fromParams, fromLocalBeatsAtSwitch }

function resetSquatXfadeState(){
  squatLastSegIndex = -1;
  squatLastSegSnapshot = null;
  squatXfade = null;
}

// 依「是否啟用／參數／拍子相位」算出這一幀蹲彈要疊加的位移量（公尺）；沒啟用時回傳 0，
// 這樣交叉淡化混合「啟用→停用」的段落交界時，停用那一側自然貢獻0，不需要另外特判。
// 垂直／側向各自用自己的 freq/phase/wave 算相位，可以做出「蹲一次側擺兩次」之類的複合節奏；
// 函式簽章沒變，applySquatGroove 的交叉淡化混合邏輯完全不用跟著改。
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
  const beatMs = 60000 / bpm;
  const beatsElapsedTotal = (now - startTime) / beatMs;
  let squatEnabledEff, squatParams, phaseBase;
  if (useSequence && grooveSequence.length > 0){
    const seg = getGrooveActiveSegment(beatsElapsedTotal);
    let data = (seg && seg.item) ? (seg.item.data || {}) : null;
    if (data){
      lastValidSquatSeqData = data; // 記住這次成功解析到的蹲彈設定，供後面段落萬一查無項目時沿用
    } else {
      data = lastValidSquatSeqData; // 這段引用的律動庫項目已被刪除：沿用上一個有效段落的蹲彈設定，避免蹲彈動作瞬間停止
    }
    squatEnabledEff = !!(data && data.squatEnabled);
    squatParams = Object.assign({}, GROOVE_SQUAT_DEFAULT, (data && data.squatCustom) || {});
    phaseBase = seg ? seg.localBeats : 0;

    // 偵測段落切換：跟 applyGroove 同一套 segIndex 判斷邏輯，狀態各自獨立存放。
    const segIndex = seg ? seg.segIndex : -1;
    if (squatLastSegIndex !== -1 && squatLastSegIndex !== segIndex && squatLastSegSnapshot){
      squatXfade = {
        switchElapsed: beatsElapsedTotal,
        fromEnabled: squatLastSegSnapshot.enabled,
        fromParams: squatLastSegSnapshot.params,
        fromLocalBeatsAtSwitch: squatLastSegSnapshot.localBeats
      };
    }
    squatLastSegIndex = segIndex;
    squatLastSegSnapshot = { enabled: squatEnabledEff, params: squatParams, localBeats: phaseBase };
  } else {
    squatEnabledEff = grooveSquatEnabled;
    squatParams = getGrooveSquatParams();
    phaseBase = beatsElapsedTotal;
    resetSquatXfadeState(); // 沒有序列、或 useSequence=false（律動預覽）時都不需要交叉淡化，順便清掉殘留狀態
  }

  // 交叉淡化視窗內：算出舊段落淡出權重，時間邏輯跟 applyGroove 一致。
  let squatXfadeWeight = 0, fromSquatEnabled = false, fromSquatParams = null, fromSquatPhaseClock = 0;
  if (squatXfade){
    const elapsedSinceSwitch = beatsElapsedTotal - squatXfade.switchElapsed;
    if (elapsedSinceSwitch >= GROOVE_XFADE_BEATS || elapsedSinceSwitch < 0){
      squatXfade = null;
    } else {
      squatXfadeWeight = 1 - (elapsedSinceSwitch / GROOVE_XFADE_BEATS);
      fromSquatEnabled = squatXfade.fromEnabled;
      fromSquatParams = squatXfade.fromParams;
      fromSquatPhaseClock = squatXfade.fromLocalBeatsAtSwitch + elapsedSinceSwitch; // 延續時鐘，理由同 applyGroove
    }
  }

  // active 拆成兩層：activeBase 是跟蹲彈無關的硬性條件（隨時可能讓蹲彈整個讓路，交叉淡化不該
  // 蓋過這些）；squatEnabledEff 這一層才是交叉淡化要柔化的對象——切換瞬間即使新段落沒開蹲彈，
  // 只要還在淡出舊段落的視窗內，也要視為「仍需要跑蹲彈流程」，讓位移平滑歸零而不是硬切消失。
  const activeBase = !ikEnabled.rLeg && !ikEnabled.lLeg && !legTrajOverridden;
  const active = activeBase && (squatEnabledEff || (squatXfadeWeight > 0 && fromSquatEnabled));

  // 不管現在active與否，只要上一幀有留下預覽模式的位移殘留就先清乾淨，
  // 避免「關掉蹲彈/切到手動腿部IK」那一刻角色卡在半蹲姿勢。
  if (needsDriftCorrection && _squatPreviewLastDelta.lengthSq() > 0){
    model.position.sub(_squatPreviewLastDelta);
    _squatPreviewLastDelta.set(0, 0, 0);
    model.updateMatrixWorld(true);
  }

  if (!active){
    resetSquatFootAnchors();
    return;
  }

  if (!grooveSquatAnchored) captureSquatFootAnchors();

  // 新段落的位移貢獻（沒開蹲彈就是0）；若正在交叉淡化，再跟舊段落延續下去的貢獻依權重線性混合。
  const newDelta = computeSquatDelta(squatEnabledEff, squatParams, phaseBase);
  let dx = newDelta.dx, dy = newDelta.dy;
  if (squatXfadeWeight > 0){
    const oldDelta = computeSquatDelta(fromSquatEnabled, fromSquatParams, fromSquatPhaseClock);
    dy = oldDelta.dy * squatXfadeWeight + newDelta.dy * (1 - squatXfadeWeight);
    dx = oldDelta.dx * squatXfadeWeight + newDelta.dx * (1 - squatXfadeWeight);
  }
  // 暖身漸強：只在整段律動剛開始的頭幾拍把位移壓小，理由跟 applyGroove 一致（見 grooveWarmupRamp）。
  const warmupRamp = grooveWarmupRamp(beatsElapsedTotal);
  dx *= warmupRamp;
  dy *= warmupRamp;

  _squatDeltaTmp.set(dx, dy, 0);
  model.position.add(_squatDeltaTmp);
  if (needsDriftCorrection) _squatPreviewLastDelta.copy(_squatDeltaTmp);
  model.updateMatrixWorld(true);

  // 兩腿各自反算：目標＝原地錨點（固定世界座標，不受這次平移影響），
  // 極向球＝目前膝蓋位置往「猜測的身體前方」偏移一點（沿用 IK_CHAINS 既有的 poleOffset 假設）。
  for (const limb of ["rLeg", "lLeg"]){
    const anchor = grooveSquatFootAnchor[limb];
    if (!anchor) continue;
    const chain = IK_CHAINS[limb];
    const rootBone = bones[chain.root], midBone = bones[chain.mid], endBone = bones[chain.end];
    if (!rootBone || !midBone || !endBone) continue;

    midBone.getWorldPosition(_squatMidPosTmp);
    _squatPolePosTmp.copy(_squatMidPosTmp).add(chain.poleOffset);
    solveTwoBoneIK(rootBone, midBone, endBone, anchor, _squatPolePosTmp);
    applyBoneWorldQuatLock(endBone, grooveSquatFootLockedQuat[limb]);
  }
}

// ---- 律動模式：UI ----
// 每個關節一個 chip：左邊沿用既有的「切換按鈕」決定要不要參與律動（button.active 既有樣式，
// 跟其他布林開關一致）；右邊多一顆 ⚙ 小按鈕，點了把這個關節設成「目前正在自訂參數」的對象，
// 下方共用的編輯面板（軸向/波形/幅度/頻率/相位）就會顯示、可調整這顆關節的參數。
// 用「共用一組編輯面板」而不是每個關節攤開一整組滑桿，是刻意的取捨：14個關節×5個控制項
// 會讓分頁長到不可用，共用面板只需要在切換選取關節時換一次顯示值即可。
function buildGrooveJointUI(){
  const host = document.getElementById("grooveJointsList");
  if (!host) return;
  host.innerHTML = "";
  for (const key of GROOVE_JOINT_KEYS){
    const chip = document.createElement("div");
    chip.className = "grooveChip";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "grooveToggleBtn";
    btn.textContent = LABEL_LOOKUP[key] || key;
    btn.dataset.key = key;
    btn.classList.toggle("active", grooveJointSet.has(key));
    btn.classList.toggle("customized", isGrooveJointCustomized(key));
    btn.onclick = () => {
      if (grooveJointSet.has(key)) grooveJointSet.delete(key); else grooveJointSet.add(key);
      btn.classList.toggle("active", grooveJointSet.has(key));
      invalidateGrooveGenMeta(); // 勾選/取消關節也改變了這組律動的內容，同樣讓 seed 失效
      scheduleAutoSave();
    };

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "grooveEditBtn";
    editBtn.textContent = "⚙";
    editBtn.title = "自訂「" + (LABEL_LOOKUP[key] || key) + "」的律動參數";
    editBtn.dataset.key = key;
    editBtn.classList.toggle("editing", grooveEditingKey === key);
    editBtn.onclick = () => selectGrooveEditingJoint(key);

    chip.appendChild(btn);
    chip.appendChild(editBtn);
    host.appendChild(chip);
  }
}

// 切換「目前正在自訂參數」的關節：更新所有 ⚙ 按鈕的醒目樣式，並重繪下方編輯面板的顯示值。
function selectGrooveEditingJoint(key){
  grooveEditingKey = key;
  document.querySelectorAll("#grooveJointsList .grooveEditBtn").forEach(b => {
    b.classList.toggle("editing", b.dataset.key === key);
  });
  renderGrooveEditor();
}

// 判斷某個關節目前是否有任何自訂覆寫欄位（決定 chip 上要不要顯示「已自訂」小圓點）。
function isGrooveJointCustomized(key){
  const c = grooveCustomParams[key];
  return !!c && Object.keys(c).length > 0;
}

// 只更新單一關節 chip 上的「已自訂」小圓點，不用重建整份清單——
// 跟其他按鈕自己管自己樣式的既有作法（見 buildGrooveJointUI 上方註解）一致。
function updateGrooveChipCustomizedMark(key){
  const btn = document.querySelector('#grooveJointsList .grooveToggleBtn[data-key="' + key + '"]');
  if (btn) btn.classList.toggle("customized", isGrooveJointCustomized(key));
}

// 依 grooveEditingKey 目前選取的關節，把「合併後」的參數（getGrooveParams）灌回編輯面板的
// 滑桿/按鈕顯示值。沒選取關節時顯示空狀態提示，引導使用者先點 ⚙。
function renderGrooveEditor(){
  const empty = document.getElementById("grooveEditorEmpty");
  const panel = document.getElementById("grooveEditorPanel");
  if (!empty || !panel) return;

  if (!grooveEditingKey || !GROOVE_PRESETS[grooveEditingKey]){
    empty.style.display = "";
    panel.style.display = "none";
    return;
  }
  empty.style.display = "none";
  panel.style.display = "";

  const params = getGrooveParams(grooveEditingKey);
  const label = document.getElementById("grooveEditorLabel");
  if (label) label.textContent = LABEL_LOOKUP[grooveEditingKey] || grooveEditingKey;

  document.querySelectorAll("#grooveAxisBtns button").forEach(b => {
    b.classList.toggle("active", b.dataset.axis === params.axis);
  });
  document.querySelectorAll("#grooveWaveBtns button").forEach(b => {
    b.classList.toggle("active", b.dataset.wave === params.wave);
  });

  // 合成波（ease:/easeBi:）列：拆出「極性」與「曲線名」兩個維度分別回填。
  // 目前用的是內建 bounce/sine 時，極性仍顯示對應的那一側（bounce→單向、sine→來回），
  // 讓使用者直接從選單挑一條曲線就能無痛升級，不用先想「我該按哪個極性」。
  const waveStr = String(params.wave || "");
  const isBi = waveStr.startsWith(GROOVE_WAVE_EASE_BI_PREFIX);
  const isUni = waveStr.startsWith(GROOVE_WAVE_EASE_PREFIX);
  const polarity = isBi ? GROOVE_WAVE_EASE_BI_PREFIX
                 : isUni ? GROOVE_WAVE_EASE_PREFIX
                 : (params.wave === "sine" ? GROOVE_WAVE_EASE_BI_PREFIX : GROOVE_WAVE_EASE_PREFIX);
  document.querySelectorAll("#grooveWavePolarityBtns button").forEach(b => {
    b.classList.toggle("active", b.dataset.polarity === polarity);
  });
  const easeSel = document.getElementById("grooveWaveEaseSelect");
  if (easeSel) easeSel.value = isBi ? waveStr.slice(GROOVE_WAVE_EASE_BI_PREFIX.length)
                            : isUni ? waveStr.slice(GROOVE_WAVE_EASE_PREFIX.length)
                            : "";
  const wavePrev = document.getElementById("grooveWavePreview");
  if (wavePrev) wavePrev.innerHTML = buildGrooveWaveSVG(params.wave, 72, 30);

  const ampSlider = document.getElementById("grooveAmpSlider");
  const freqSlider = document.getElementById("grooveFreqSlider");
  const phaseSlider = document.getElementById("groovePhaseSlider");
  if (ampSlider) ampSlider.value = String(params.amp);
  if (freqSlider) freqSlider.value = String(params.freq);
  if (phaseSlider) phaseSlider.value = String(params.phase);

  const ampVal = document.getElementById("grooveAmpVal");
  const freqVal = document.getElementById("grooveFreqVal");
  const phaseVal = document.getElementById("groovePhaseVal");
  if (ampVal) ampVal.textContent = params.amp + "°";
  if (freqVal) freqVal.textContent = "×" + params.freq;
  if (phaseVal) phaseVal.textContent = params.phase.toFixed(2);
}

// 畫出一個完整週期的律動波形（跟 buildEasingSVG 同風格，但畫的是 grooveWaveValue 的輸出，
// 不是 easing 本身——合成波經過鏡像/切段之後長相跟原曲線差很多，直接畫結果才看得準）。
// y 軸範圍固定 -1.25~1.25：容納 Back/Elastic 的 overshoot，同時讓不同波形之間的高度可以互相比較。
const _grooveWaveSVGCache = new Map();
function buildGrooveWaveSVG(wave, w, h){
  const cacheKey = wave + "_" + w + "_" + h;
  const cached = _grooveWaveSVGCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const pad = 3, steps = 48, yMin = -1.25, yMax = 1.25;
  let d = "";
  for (let i = 0; i <= steps; i++){
    const p = i / steps;
    let y = grooveWaveValue(wave, p);
    if (!isFinite(y)) y = 0;
    y = Math.max(yMin, Math.min(yMax, y));
    const x = pad + p * (w - 2 * pad);
    const yy = (h - pad) - ((y - yMin) / (yMax - yMin)) * (h - 2 * pad);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + yy.toFixed(1) + " ";
  }
  const zeroY = (h - pad) - ((0 - yMin) / (yMax - yMin)) * (h - 2 * pad);
  const svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;">`
    + `<line x1="${pad}" y1="${zeroY.toFixed(1)}" x2="${w-pad}" y2="${zeroY.toFixed(1)}" stroke="#33335a" stroke-width="1" stroke-dasharray="2,2"/>`
    + `<path d="${d}" fill="none" stroke="#7fe0ff" stroke-width="1.6" stroke-linecap="round"/>`
    + `</svg>`;
  _grooveWaveSVGCache.set(cacheKey, svg);
  return svg;
}

// ---- 自動生成律動：UI ----
// 選單選項只建一次（原型/曲線清單都是靜態資料），之後只更新描述與結果文字。
let _grooveGenOptionsBuilt = false;
function renderGrooveGenUI(){
  const sel = document.getElementById("grooveGenArchetypeSelect");
  if (!sel) return; // DOM 還沒建好（例如還原自動存檔時就被呼叫到），直接跳過

  if (!_grooveGenOptionsBuilt){
    sel.innerHTML = GROOVE_ARCHETYPE_IDS
      .map(id => `<option value="${id}">${GROOVE_ARCHETYPES[id].label}</option>`).join("");
    _grooveGenOptionsBuilt = true;
  }

  const arc = GROOVE_ARCHETYPES[sel.value] || GROOVE_ARCHETYPES.down;
  const desc = document.getElementById("grooveGenDesc");
  if (desc) desc.textContent = arc.desc;

  // 結果列：只有「目前這組律動確實是自動生成且沒被手動改過」時才顯示 seed，
  // 否則顯示的 seed 重現出來會是別的東西（見 invalidateGrooveGenMeta）。
  const result = document.getElementById("grooveGenResult");
  if (result){
    if (grooveLastGenMeta){
      const m = grooveLastGenMeta;
      const arcLabel = (GROOVE_ARCHETYPES[m.archetype] || {}).label || m.archetype;
      const loop = Number.isFinite(m.loopBeats) ? `・循環 ${m.loopBeats} 拍` : "";
      const energy = Number.isFinite(m.energy) ? `・總幅度 ${m.energy}°` : "";
      result.textContent = `目前：${arcLabel}・種子 ${m.seed}${loop}${energy}・${grooveJointSet.size} 個關節・蹲彈${grooveSquatEnabled ? "開" : "關"}`;
    } else {
      result.textContent = "目前的律動不是自動生成的（或已手動修改過），沒有可重現的種子。";
    }
  }

  const seedInput = document.getElementById("grooveGenSeedInput");
  if (seedInput && grooveLastGenMeta && document.activeElement !== seedInput){
    seedInput.value = String(grooveLastGenMeta.seed); // 不覆蓋使用者正在輸入的內容
  }
}

// 生成一組並立刻套用到「目前的手動律動設定」＝使用者可以馬上接著微調任何一個滑桿。
function doGrooveGenerate(seed){
  const sel = document.getElementById("grooveGenArchetypeSelect");
  const arcId = sel ? sel.value : "down";
  const cfg = generateGrooveConfig(arcId, seed);

  // applyGrooveConfigData 會跑 sanitize（順便驗證生成出來的波形/數值全部合法）、
  // 寫回 grooveJointSet/grooveCustomParams/蹲彈設定、設定 grooveLastGenMeta、刷新整個律動 UI。
  applyGrooveConfigData(cfg);
  grooveSquatAnchored = false; // 蹲彈開關/振幅可能整個換掉了，下一幀重新捕捉腳掌原地錨點

  const autoPrev = document.getElementById("grooveGenAutoPreviewChk");
  if (autoPrev && autoPrev.checked && !groovePreviewEnabled){
    const btn = document.getElementById("groovePreviewBtn");
    if (btn) btn.click(); // 沿用預覽按鈕自己的開啟流程（重設拍子起點/清 xfade 殘留），不另外複製一份邏輯
  }
  renderGrooveGenUI();
}

function bindGrooveGenUI(){
  const sel = document.getElementById("grooveGenArchetypeSelect");
  if (!sel) return;
  sel.onchange = () => renderGrooveGenUI();

  const rollBtn = document.getElementById("grooveGenRollBtn");
  if (rollBtn) rollBtn.onclick = () => doGrooveGenerate(null);
  const rerollBtn = document.getElementById("grooveGenRerollBtn");
  if (rerollBtn) rerollBtn.onclick = () => doGrooveGenerate(null);

  const seedBtn = document.getElementById("grooveGenSeedApplyBtn");
  if (seedBtn) seedBtn.onclick = () => {
    const input = document.getElementById("grooveGenSeedInput");
    const raw = (input && input.value || "").trim();
    const n = parseInt(raw, 10);
    if (!raw || !Number.isFinite(n)){ doGrooveGenerate(null); return; } // 留空/亂打＝當隨機處理，不彈錯誤打斷創作流程
    doGrooveGenerate(n >>> 0);
  };

  const saveBtn = document.getElementById("grooveGenSaveBtn");
  if (saveBtn) saveBtn.onclick = () => {
    if (!grooveLibCtrl) return;
    if (grooveJointSet.size === 0 && !grooveSquatEnabled){
      alert("目前沒有任何律動內容可存——請先按「🎲 生成並套用」。");
      return;
    }
    const name = grooveLastGenMeta
      ? grooveGenAutoName(grooveLastGenMeta.archetype, grooveLastGenMeta.seed)
      : ("手調律動_" + new Date().toLocaleTimeString("zh-TW", { hour12:false }));
    grooveLibCtrl.saveData(name, captureCurrentGrooveConfig());
  };

  const batchBtn = document.getElementById("grooveGenBatchBtn");
  if (batchBtn) batchBtn.onclick = () => {
    if (!grooveLibCtrl) return;
    const countEl = document.getElementById("grooveGenBatchCount");
    let n = parseInt(countEl ? countEl.value : "4", 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    n = Math.min(n, 20);
    const arcId = sel.value;
    for (let i = 0; i < n; i++){
      const cfg = generateGrooveConfig(arcId, null);
      grooveLibCtrl.saveData(grooveGenAutoName(arcId, cfg.meta.seed), cfg);
    }
    // 批次刻意不動目前的律動設定（跟「自動生成招式」只存進招式庫、不動時間軸同一個原則）
    alert(`已生成 ${n} 組「${GROOVE_ARCHETYPES[arcId].label}」律動並存入律動庫。\n接著可到「時間軸」分頁的「律動序列」把它們排成段落。`);
  };

  renderGrooveGenUI();
}

// 寫入目前選取關節的一個自訂欄位（只覆寫這個欄位，其餘欄位繼續沿用預設值或先前的自訂值）。
function setGrooveCustomField(key, field, value){
  if (!grooveCustomParams[key]) grooveCustomParams[key] = {};
  grooveCustomParams[key][field] = value;
  updateGrooveChipCustomizedMark(key);
  invalidateGrooveGenMeta();
  scheduleAutoSave();
}

// 使用者手動動過任何律動欄位，就不能再宣稱「這組＝seed X 生成的結果」——清掉來源資訊，
// UI 上的 seed 標記也會跟著消失，避免存進律動庫的 meta 是假的、重現時得到不一樣的東西。
function invalidateGrooveGenMeta(){
  if (!grooveLastGenMeta) return;
  grooveLastGenMeta = null;
  renderGrooveGenUI();
}

// 恢復單一關節的預設值：直接刪掉它的自訂覆寫物件即可，getGrooveParams() 自然會退回 GROOVE_PRESETS。
function resetGrooveJoint(key){
  delete grooveCustomParams[key];
  updateGrooveChipCustomizedMark(key);
  invalidateGrooveGenMeta();
  renderGrooveEditor();
  scheduleAutoSave();
}

// 恢復全部關節的預設值：清空整份自訂覆寫。有確認框，避免不小心點掉調了很久的參數。
function resetAllGrooveCustom(){
  if (Object.keys(grooveCustomParams).length === 0) return;
  const ok = confirm("確定要把所有關節的律動參數恢復成預設值嗎？此動作無法復原。");
  if (!ok) return;
  grooveCustomParams = {};
  for (const key of GROOVE_JOINT_KEYS) updateGrooveChipCustomizedMark(key);
  invalidateGrooveGenMeta();
  renderGrooveEditor();
  scheduleAutoSave();
}

// 匯入編舞／還原自動存檔後，grooveJointSet 與 grooveCustomParams 的內容整個換掉了，
// 既有按鈕的 active/editing 樣式跟編輯面板顯示值都要跟著同步，直接重建整份最簡單。
function refreshGrooveJointUI(){
  grooveEditingKey = null; // 匯入後不預設選取任何關節，避免顯示到舊選取但語意已經變的資料
  buildGrooveJointUI();
  renderGrooveEditor();
  renderGrooveSquatUI();
  renderGrooveWarmupUI();
  renderGrooveGenUI();
}

// ---- 暖身漸強：UI ----
function renderGrooveWarmupUI(){
  const chk = document.getElementById("grooveWarmupEnabledChk");
  if (chk) chk.checked = grooveWarmupEnabled;
  const slider = document.getElementById("grooveWarmupBeatsSlider");
  if (slider) slider.value = String(grooveWarmupBeats);
  const val = document.getElementById("grooveWarmupBeatsVal");
  if (val) val.textContent = grooveWarmupBeats + "拍";
  document.querySelectorAll("#grooveWarmupCurveBtns button").forEach(b => {
    b.classList.toggle("active", b.dataset.curve === grooveWarmupCurve);
  });
}

function bindGrooveUI(){
  buildGrooveJointUI();

  const warmupChk = document.getElementById("grooveWarmupEnabledChk");
  if (warmupChk) warmupChk.onchange = (e) => { grooveWarmupEnabled = e.target.checked; scheduleAutoSave(); };
  const warmupSlider = document.getElementById("grooveWarmupBeatsSlider");
  if (warmupSlider) warmupSlider.oninput = (e) => {
    grooveWarmupBeats = parseFloat(e.target.value);
    const val = document.getElementById("grooveWarmupBeatsVal");
    if (val) val.textContent = grooveWarmupBeats + "拍";
    scheduleAutoSave();
  };
  document.querySelectorAll("#grooveWarmupCurveBtns button").forEach(b => {
    b.onclick = () => {
      grooveWarmupCurve = b.dataset.curve;
      document.querySelectorAll("#grooveWarmupCurveBtns button").forEach(bb => bb.classList.toggle("active", bb === b));
      scheduleAutoSave();
    };
  });
  renderGrooveWarmupUI();

  // 即時預覽：不用播放拍點，原地持續套用律動，方便邊調滑桿邊看手感。
  // 每次重新開啟都重新對齊拍子起點（groovePreviewStartTime = now），讓每次預覽的手感一致、
  // 不會因為「上次關閉時卡在哪個相位」而每次開頭的彈動幅度都不一樣。
  const previewBtn = document.getElementById("groovePreviewBtn");
  if (previewBtn){
    previewBtn.onclick = () => {
      groovePreviewEnabled = !groovePreviewEnabled;
      if (groovePreviewEnabled){
        groovePreviewStartTime = performance.now();
        grooveSquatAnchored = false; // 重新對齊蹲彈的腳掌原地錨點
        resetGrooveXfadeState();     // 清掉上次預覽殘留的段落切換狀態，理由同 toggleKeyframePlayback
        resetSquatXfadeState();
      } else if (_squatPreviewLastDelta.lengthSq() > 0){
        // 關閉預覽的當下順手把蹲彈疊加的位移還原乾淨，避免角色卡在半蹲姿勢
        // （下一幀 animate() 就不會再呼叫 applySquatGroove 幫忙清了，這裡要主動做）
        model.position.sub(_squatPreviewLastDelta);
        _squatPreviewLastDelta.set(0, 0, 0);
        resetSquatFootAnchors();
      }
      previewBtn.classList.toggle("active", groovePreviewEnabled);
      previewBtn.textContent = groovePreviewEnabled ? "■ 停止預覽" : "▶ 律動預覽";
    };
  }

  document.querySelectorAll("#grooveAxisBtns button").forEach(b => {
    b.onclick = () => {
      if (!grooveEditingKey) return;
      setGrooveCustomField(grooveEditingKey, "axis", b.dataset.axis);
      renderGrooveEditor();
    };
  });
  document.querySelectorAll("#grooveWaveBtns button").forEach(b => {
    b.onclick = () => {
      if (!grooveEditingKey) return;
      setGrooveCustomField(grooveEditingKey, "wave", b.dataset.wave);
      renderGrooveEditor();
    };
  });

  // 合成波：極性（單向/來回）× 曲線（32 條 Easing）兩個維度組成 wave id。
  // 曲線選「—」代表不使用合成波，退回同極性的內建波形（單向→bounce、來回→sine），
  // 這樣使用者永遠有一條明確的回頭路，不會被卡在合成波裡。
  // 曲線選單在這裡就填好（不是等生成面板初始化）——renderGrooveEditor() 會在 bindGrooveGenUI()
  // 之前先跑一次，選單若那時還是空的，回填 value 會靜默失敗。
  const grooveEaseSel = document.getElementById("grooveWaveEaseSelect");
  if (grooveEaseSel && !grooveEaseSel.options.length){
    grooveEaseSel.innerHTML = `<option value="">—（用上面的 bounce／sine）</option>` + buildEasingSelectOptions();
  }
  const applyCompositeWave = () => {
    if (!grooveEditingKey) return;
    const polBtn = document.querySelector("#grooveWavePolarityBtns button.active");
    const polarity = polBtn ? polBtn.dataset.polarity : GROOVE_WAVE_EASE_PREFIX;
    const easeName = grooveEaseSel ? grooveEaseSel.value : "";
    const wave = easeName
      ? (polarity + easeName)
      : (polarity === GROOVE_WAVE_EASE_BI_PREFIX ? "sine" : "bounce");
    setGrooveCustomField(grooveEditingKey, "wave", wave);
    renderGrooveEditor();
  };
  document.querySelectorAll("#grooveWavePolarityBtns button").forEach(b => {
    b.onclick = () => {
      if (!grooveEditingKey) return;
      document.querySelectorAll("#grooveWavePolarityBtns button").forEach(bb => bb.classList.toggle("active", bb === b));
      applyCompositeWave();
    };
  });
  if (grooveEaseSel) grooveEaseSel.onchange = applyCompositeWave;

  const ampSlider = document.getElementById("grooveAmpSlider");
  if (ampSlider) ampSlider.oninput = (e) => {
    if (!grooveEditingKey) return;
    const v = parseFloat(e.target.value);
    setGrooveCustomField(grooveEditingKey, "amp", v);
    const ampVal = document.getElementById("grooveAmpVal");
    if (ampVal) ampVal.textContent = v + "°";
  };
  const freqSlider = document.getElementById("grooveFreqSlider");
  if (freqSlider) freqSlider.oninput = (e) => {
    if (!grooveEditingKey) return;
    const v = parseFloat(e.target.value);
    setGrooveCustomField(grooveEditingKey, "freq", v);
    const freqVal = document.getElementById("grooveFreqVal");
    if (freqVal) freqVal.textContent = "×" + v;
  };
  const phaseSlider = document.getElementById("groovePhaseSlider");
  if (phaseSlider) phaseSlider.oninput = (e) => {
    if (!grooveEditingKey) return;
    const v = parseFloat(e.target.value);
    setGrooveCustomField(grooveEditingKey, "phase", v);
    const phaseVal = document.getElementById("groovePhaseVal");
    if (phaseVal) phaseVal.textContent = v.toFixed(2);
  };

  const resetJointBtn = document.getElementById("grooveResetJointBtn");
  if (resetJointBtn) resetJointBtn.onclick = () => { if (grooveEditingKey) resetGrooveJoint(grooveEditingKey); };

  const resetAllBtn = document.getElementById("grooveResetAllBtn");
  if (resetAllBtn) resetAllBtn.onclick = resetAllGrooveCustom;

  renderGrooveEditor();
  bindGrooveSquatUI();
  bindGrooveLibraryUI(); // 先建立 grooveLibCtrl，下面「批次生成存入律動庫」才有對象可寫
  bindGrooveGenUI();
  bindGrooveSequenceUI();
}

// ---- 蹲彈律動：UI ----
// 只有一組共用滑桿（跟關節編輯面板的滑桿模式一致），因為蹲彈本來就是雙腳同步的單一系統，
// 不像關節列表要在14個關節之間切換——沒有「選取哪個」的問題，永遠只有一份參數可調。
function renderGrooveSquatUI(){
  const chk = document.getElementById("grooveSquatEnabledChk");
  if (chk) chk.checked = grooveSquatEnabled;

  const params = getGrooveSquatParams();
  document.querySelectorAll("#grooveSquatWaveBtns button").forEach(b => {
    b.classList.toggle("active", b.dataset.wave === params.wave);
  });
  document.querySelectorAll("#grooveSquatLateralWaveBtns button").forEach(b => {
    b.classList.toggle("active", b.dataset.wave === params.lateralWave);
  });

  const vertSlider = document.getElementById("grooveSquatVertSlider");
  const lateralSlider = document.getElementById("grooveSquatLateralSlider");
  const freqSlider = document.getElementById("grooveSquatFreqSlider");
  const phaseSlider = document.getElementById("grooveSquatPhaseSlider");
  const lateralFreqSlider = document.getElementById("grooveSquatLateralFreqSlider");
  const lateralPhaseSlider = document.getElementById("grooveSquatLateralPhaseSlider");
  if (vertSlider) vertSlider.value = String(params.vertAmp);
  if (lateralSlider) lateralSlider.value = String(params.lateralAmp);
  if (freqSlider) freqSlider.value = String(params.freq);
  if (phaseSlider) phaseSlider.value = String(params.phase);
  if (lateralFreqSlider) lateralFreqSlider.value = String(params.lateralFreq);
  if (lateralPhaseSlider) lateralPhaseSlider.value = String(params.lateralPhase);

  const vertVal = document.getElementById("grooveSquatVertVal");
  const lateralVal = document.getElementById("grooveSquatLateralVal");
  const freqVal = document.getElementById("grooveSquatFreqVal");
  const phaseVal = document.getElementById("grooveSquatPhaseVal");
  const lateralFreqVal = document.getElementById("grooveSquatLateralFreqVal");
  const lateralPhaseVal = document.getElementById("grooveSquatLateralPhaseVal");
  if (vertVal) vertVal.textContent = params.vertAmp + "cm";
  if (lateralVal) lateralVal.textContent = params.lateralAmp + "cm";
  if (freqVal) freqVal.textContent = "×" + params.freq;
  if (phaseVal) phaseVal.textContent = params.phase.toFixed(2);
  if (lateralFreqVal) lateralFreqVal.textContent = "×" + params.lateralFreq;
  if (lateralPhaseVal) lateralPhaseVal.textContent = params.lateralPhase.toFixed(2);
}

function setGrooveSquatField(field, value){
  grooveSquatCustom[field] = value;
  invalidateGrooveGenMeta();
  scheduleAutoSave();
}

function resetGrooveSquat(){
  grooveSquatCustom = {};
  invalidateGrooveGenMeta();
  renderGrooveSquatUI();
  scheduleAutoSave();
}

function bindGrooveSquatUI(){
  const chk = document.getElementById("grooveSquatEnabledChk");
  if (chk){
    chk.onchange = (e) => {
      grooveSquatEnabled = e.target.checked;
      if (grooveSquatEnabled) grooveSquatAnchored = false; // 剛打開：下一幀重新抓目前站姿當基準
      scheduleAutoSave();
    };
  }

  document.querySelectorAll("#grooveSquatWaveBtns button").forEach(b => {
    b.onclick = () => { setGrooveSquatField("wave", b.dataset.wave); renderGrooveSquatUI(); };
  });
  document.querySelectorAll("#grooveSquatLateralWaveBtns button").forEach(b => {
    b.onclick = () => { setGrooveSquatField("lateralWave", b.dataset.wave); renderGrooveSquatUI(); };
  });

  const vertSlider = document.getElementById("grooveSquatVertSlider");
  if (vertSlider) vertSlider.oninput = (e) => {
    const v = parseFloat(e.target.value);
    setGrooveSquatField("vertAmp", v);
    const el = document.getElementById("grooveSquatVertVal");
    if (el) el.textContent = v + "cm";
  };
  const lateralSlider = document.getElementById("grooveSquatLateralSlider");
  if (lateralSlider) lateralSlider.oninput = (e) => {
    const v = parseFloat(e.target.value);
    setGrooveSquatField("lateralAmp", v);
    const el = document.getElementById("grooveSquatLateralVal");
    if (el) el.textContent = v + "cm";
  };
  const freqSlider = document.getElementById("grooveSquatFreqSlider");
  if (freqSlider) freqSlider.oninput = (e) => {
    const v = parseFloat(e.target.value);
    setGrooveSquatField("freq", v);
    const el = document.getElementById("grooveSquatFreqVal");
    if (el) el.textContent = "×" + v;
  };
  const phaseSlider = document.getElementById("grooveSquatPhaseSlider");
  if (phaseSlider) phaseSlider.oninput = (e) => {
    const v = parseFloat(e.target.value);
    setGrooveSquatField("phase", v);
    const el = document.getElementById("grooveSquatPhaseVal");
    if (el) el.textContent = v.toFixed(2);
  };
  const lateralFreqSlider = document.getElementById("grooveSquatLateralFreqSlider");
  if (lateralFreqSlider) lateralFreqSlider.oninput = (e) => {
    const v = parseFloat(e.target.value);
    setGrooveSquatField("lateralFreq", v);
    const el = document.getElementById("grooveSquatLateralFreqVal");
    if (el) el.textContent = "×" + v;
  };
  const lateralPhaseSlider = document.getElementById("grooveSquatLateralPhaseSlider");
  if (lateralPhaseSlider) lateralPhaseSlider.oninput = (e) => {
    const v = parseFloat(e.target.value);
    setGrooveSquatField("lateralPhase", v);
    const el = document.getElementById("grooveSquatLateralPhaseVal");
    if (el) el.textContent = v.toFixed(2);
  };

  const resetBtn = document.getElementById("grooveSquatResetBtn");
  if (resetBtn) resetBtn.onclick = resetGrooveSquat;

  renderGrooveSquatUI();
}

// ---- 律動序列：讓「律動庫」項目依拍數接龍套用（A律動維持幾拍、B律動維持幾拍……）----
// 只認「從播放起點累積的拍子數」，完全不理會拍點清單目前播到第幾格——拍點的新增/刪除/拖曳排序
// 不會弄壞這裡的排序，也不需要每次編輯拍點時同步更新這裡。序列總拍數若比整段編舞短，
// 會依 beatsElapsed 對總拍數取模自動循環播放；如果這裡完全沒有段落，行為退回「舊版單一全域設定」，
// 直接套用上面手動勾選/調整的律動設定，向下相容不影響沒用過這個功能的舊使用者。
// entry：{ id, libId, beats }。libId 對應律動庫項目的 id；beats 是這段要維持幾拍。
let grooveSequence = [];
let grooveSeqDragIndex = -1; // 拖曳排序用，互動風格跟 #kfList 的拍點拖曳一致
let grooveSeqChipEls = [];   // BG-2：律動段 DOM 快取，播放每幀只切 activeSeg class，不重建整條 Track
let grooveSeqSelectedIndex = -1; // Beat Grid 中目前選取的律動段；Delete / Backspace 刪除此段

function selectGrooveSeqEntry(i){
  waveClipSelected=null;renderWaveTrack();
  if (i < 0 || i >= grooveSequence.length) return;
  if (kfMultiSelectMode){ toggleGrooveMultiSelectItem(i); return; }
  grooveSeqSelectedIndex = i;
  // POSE / GROOVE 採單一 timeline selection，避免按 Delete 時不知道要刪哪一軌。
  kfEditingIndex = -1;
  syncEasingControlsFromSelection();
  for (const el of kfChipEls) if (el) el.classList.remove("active");
  for (let n = 0; n < grooveSeqChipEls.length; n++){
    const el = grooveSeqChipEls[n];
    if (el) el.classList.toggle("selected", n === i);
  }
  updateOnionSkins();
}

let lastValidGrooveSeqItem = null; // 給 applyGroove 用：序列播到「查無此律動庫項目」的段落時，沿用最近一次成功解析到的項目，避免動作瞬間僵直（方案A，見下方 applyGroove/applySquatGroove）
let lastValidSquatSeqData = null; // 同上，給 applySquatGroove（蹲彈）用，另外分開存是因為兩套系統各自需要的欄位不同（jointSet/customParams vs squatEnabled/squatCustom）

function grooveSeqTotalBeats(){
  return grooveSequence.reduce((s, e) => s + ((Number(e.beats) > 0) ? Number(e.beats) : 0), 0);
}

// 依「從播放起點累積的拍數」查表，決定目前該套用序列裡的哪一段。
// 回傳 { entry, item, localBeats, segIndex } 或 null（序列是空的／總拍數是0）。
// localBeats：這一段「自己的」拍子時鐘（從0開始算)，讓 applyGroove/applySquatGroove 做「相位歸零」——
// 段落一切換，振盪相位就從頭開始擺，避免不同段落振幅/軸向不同時，交界處角度硬接產生瞬間跳動。
// segIndex：這一段在 grooveSequence 陣列裡的索引，供 applyGroove/applySquatGroove 偵測「是否剛切換到新段落」
// 用來觸發交叉淡化（crossfade），跟序列會不會循環播放無關——即使循環繞回同一個 libId，只要 segIndex 變了
// 一樣視為切換，因為 localBeats 一樣會歸零，一樣有交界跳動的風險。
function getGrooveActiveSegment(beatsElapsedTotal){
  if (grooveSequence.length === 0) return null;
  const total = grooveSeqTotalBeats();
  if (total <= 0) return null;
  let pos = beatsElapsedTotal % total;
  if (pos < 0) pos += total; // 保險：理論上 beatsElapsedTotal 不會是負的，但取模防呆一下
  let acc = 0;
  for (let i = 0; i < grooveSequence.length; i++){
    const entry = grooveSequence[i];
    const b = (Number(entry.beats) > 0) ? Number(entry.beats) : 0;
    if (b <= 0) continue;
    if (pos < acc + b || i === grooveSequence.length - 1){
      const item = grooveLibCtrl ? grooveLibCtrl.getItems().find(it => it.id === entry.libId) : null;
      return { entry, item, localBeats: pos - acc, segIndex: i };
    }
    acc += b;
  }
  return null;
}

function addGrooveSeqEntry(libId){
  if (!libId) return;
  grooveSequence.push({ id: makeLibId(), libId, beats: 4 });
  renderGrooveSeqChips();
  scheduleAutoSave();
}
function removeGrooveSeqEntry(i){
  if (i < 0 || i >= grooveSequence.length) return;
  grooveSequence.splice(i, 1);
  if (grooveSeqSelectedIndex === i) grooveSeqSelectedIndex = -1;
  else if (grooveSeqSelectedIndex > i) grooveSeqSelectedIndex -= 1;
  renderGrooveSeqChips();
  scheduleAutoSave();
}
function duplicateGrooveSeqEntry(i){
  if (i < 0 || !grooveSequence[i]) return;
  const copy = Object.assign({}, grooveSequence[i], { id: makeLibId() });
  grooveSequence.splice(i + 1, 0, copy);
  renderGrooveSeqChips();
  scheduleAutoSave();
}
function reorderGrooveSeqEntry(from, to){
  if (from < 0 || from >= grooveSequence.length || to < 0 || to >= grooveSequence.length || from === to) return;
  const [item] = grooveSequence.splice(from, 1);
  grooveSequence.splice(to, 0, item);
  if (grooveSeqSelectedIndex === from) grooveSeqSelectedIndex = to;
  else if (from < grooveSeqSelectedIndex && grooveSeqSelectedIndex <= to) grooveSeqSelectedIndex -= 1;
  else if (to <= grooveSeqSelectedIndex && grooveSeqSelectedIndex < from) grooveSeqSelectedIndex += 1;
  renderGrooveSeqChips();
  scheduleAutoSave();
}
function normalizeTimelineBeats(beats, minBeats = 0.01, maxBeats = 64){
  const raw = Number(beats);
  const safe = Number.isFinite(raw) ? raw : 1;
  return Math.max(minBeats, Math.min(maxBeats, Number(safe.toFixed(4))));
}

function snapTimelineBeats(beats, minBeats = null, maxBeats = 64){
  const step = Number(BEAT_GRID_SNAP) || 0;
  const min = minBeats == null ? (step > 0 ? step : 0.01) : minBeats;
  const safe = normalizeTimelineBeats(beats, min, maxBeats);
  if (!(step > 0)) return safe;
  return Math.max(min, Math.min(maxBeats, Number((Math.round(safe / step) * step).toFixed(4))));
}

function snapGrooveBeats(beats){
  return snapTimelineBeats(beats);
}

function formatSnapLabel(step = BEAT_GRID_SNAP){
  if (!(step > 0)) return "Off";
  if (Math.abs(step - 1) < 1e-9) return "1";
  if (Math.abs(step - .5) < 1e-9) return "1/2";
  if (Math.abs(step - .25) < 1e-9) return "1/4";
  if (Math.abs(step - .125) < 1e-9) return "1/8";
  if (Math.abs(step - .0625) < 1e-9) return "1/16";
  return formatBeatValue(step);
}

function setBeatGridSnap(step){
  const n = Number(step);
  BEAT_GRID_SNAP = Number.isFinite(n) && n >= 0 ? n : 0.25;
  const select = document.getElementById("beatGridSnapSelect");
  if (select) select.value = String(BEAT_GRID_SNAP);
  const legend = document.getElementById("beatGridSnapLegend");
  if (legend) legend.textContent = `Snap＝${formatSnapLabel()}${BEAT_GRID_SNAP > 0 ? "拍" : ""}`;
  document.querySelectorAll("#grooveSeqList .beatsInput").forEach(input => {
    input.step = BEAT_GRID_SNAP > 0 ? String(BEAT_GRID_SNAP) : "0.01";
    input.min = BEAT_GRID_SNAP > 0 ? String(BEAT_GRID_SNAP) : "0.01";
  });
  if (hasBeatGridRange()){
    const [a,b] = normalizeBeatGridRange(beatGridRangeStart, beatGridRangeEnd);
    beatGridRangeStart = a; beatGridRangeEnd = b;
  }
  updateBeatGridRangeUI();
}

function formatBeatValue(v){
  const n = Number(v) || 0;
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

// kfBeatsSelect 保留常用快速選項；Resize 若產生 2.25 / 2.75 等值，動態加一個「目前值」選項，
// 避免 Inspector 因原清單沒有該值而顯示空白。
function syncBeatSelectValue(select, beats){
  if (!select) return;
  const value = normalizeTimelineBeats(beats);
  select.querySelectorAll('option[data-custom-beat="1"]').forEach(o => o.remove());
  let match = Array.from(select.options).find(o => Math.abs(Number(o.value) - value) < 1e-9);
  if (!match){
    match = document.createElement("option");
    match.value = formatBeatValue(value);
    match.textContent = `${formatBeatValue(value)} 拍`;
    match.dataset.customBeat = "1";
    select.appendChild(match);
  }
  select.value = match.value;
}

function setGrooveSeqBeats(i, beats){
  if (!grooveSequence[i]) return;
  grooveSequence[i].beats = snapGrooveBeats(beats);
  renderGrooveSeqChips();
  renderKeyframeChips();
  scheduleAutoSave();
}
function setGrooveSeqLibId(i, libId){
  if (!grooveSequence[i]) return;
  grooveSequence[i].libId = libId;
  renderGrooveSeqChips();
  scheduleAutoSave();
}

function updateKeyframeClipLayoutOnly(){
  updateBeatGridGeometry();
  for (let i = 0; i < kfChipEls.length; i++){
    const chip = kfChipEls[i];
    const kf = keyframes[i];
    if (!chip || !kf) continue;
    const startBeat = keyframeStartBeat(i);
    const isEnd = i === keyframes.length - 1;
    const durationBeats = isEnd ? 0 : normalizeTimelineBeats(kf.beats || 1);
    const widthPx = isEnd ? 48 : Math.max(2, durationBeats * BEAT_GRID_PX_PER_BEAT - 2);
    chip.style.left = `${startBeat * BEAT_GRID_PX_PER_BEAT}px`;
    chip.style.width = `${widthPx}px`;
    chip.classList.toggle("beatGridCompact", widthPx < 92);
    const easeTag = chip.querySelector(".kfEaseTag");
    if (easeTag && !isEnd){
      const easeName = kf.easing || "easeInOutQuad";
      easeTag.title = `${easeName} · ${formatBeatValue(durationBeats)} 拍`;
      const span = easeTag.querySelector("span");
      if (span) span.textContent = `${formatBeatValue(durationBeats)}拍`;
    }
  }
  if (kfEditingIndex >= 0 && keyframes[kfEditingIndex]){
    kfPendingBeats = normalizeTimelineBeats(keyframes[kfEditingIndex].beats || 1);
    syncBeatSelectValue(document.getElementById("kfBeatsSelect"), kfPendingBeats);
    updateBeatMsHint();
    updateBeatGridPoseInspector();
  }
  updateKfTotalDurationLabel();
  renderGrooveLoopGhosts();
  drawKfWaveform();
}

function updateGrooveClipLayoutOnly(){
  updateBeatGridGeometry();
  for (let i = 0; i < grooveSeqChipEls.length; i++){
    const chip = grooveSeqChipEls[i];
    const entry = grooveSequence[i];
    if (!chip || !entry) continue;
    const startBeat = grooveSegmentStartBeat(i);
    const durationBeats = Math.max(0.01, Number(entry.beats) || 0.01);
    const widthPx = Math.max(2, durationBeats * BEAT_GRID_PX_PER_BEAT - 2);
    chip.style.left = `${startBeat * BEAT_GRID_PX_PER_BEAT}px`;
    chip.style.width = `${widthPx}px`;
    chip.classList.toggle("beatGridCompact", widthPx < 126);
    const input = chip.querySelector(".beatsInput");
    if (input && document.activeElement !== input) input.value = formatBeatValue(durationBeats);
  }
  renderGrooveLoopGhosts();
  updateGrooveSeqTotalLabel();
}

// POSE / GROOVE 共用 Resize Engine：座標換算、1/4 beat snap、HUD、Pointer Capture、
// Cancel rollback、AutoSave 與「一次拖曳＝一筆 Undo」都集中在這裡，避免兩軌各維護一套手勢。
function beginTimelineResize(e, config){
  if (kfPlaying || !config || !config.chip || !config.handle) return;
  e.preventDefault();
  e.stopPropagation();
  if (config.select) config.select();

  const chip = config.chip;
  const handle = config.handle;
  const startX = e.clientX;
  const startBeats = normalizeTimelineBeats(config.getBeats());
  let lastBeats = startBeats;
  let changed = false;
  const hud = document.getElementById("timelineResizeHud");
  const originalDraggable = chip.draggable;
  chip.draggable = false;
  chip.classList.add("resizing");
  handle.classList.add("resizing");
  try { handle.setPointerCapture(e.pointerId); } catch (_) {}

  const showHud = (ev, beats) => {
    if (!hud) return;
    const extra = config.hudExtra ? config.hudExtra(beats) : "";
    hud.textContent = `${config.label || "Duration"} · ${formatBeatValue(beats)} beat${Math.abs(beats - 1) < 1e-9 ? "" : "s"}${extra ? ` · ${extra}` : ""}`;
    hud.style.left = `${Math.min(window.innerWidth - 230, ev.clientX + 12)}px`;
    hud.style.top = `${Math.max(6, ev.clientY - 30)}px`;
    hud.style.display = "block";
  };
  showHud(e, startBeats);

  const onMove = (ev) => {
    const deltaBeats = (ev.clientX - startX) / BEAT_GRID_PX_PER_BEAT;
    const next = snapTimelineBeats(startBeats + deltaBeats);
    if (Math.abs(lastBeats - next) > 1e-9){
      config.setBeats(next);
      lastBeats = next;
      changed = Math.abs(startBeats - next) > 1e-9;
      config.updateLayout();
    }
    showHud(ev, next);
  };
  const finish = (cancelled = false) => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onCancel);
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    chip.classList.remove("resizing");
    handle.classList.remove("resizing");
    chip.draggable = originalDraggable;
    if (hud) hud.style.display = "none";
    if (cancelled){
      config.setBeats(startBeats);
      config.updateLayout();
      return;
    }
    config.updateLayout();
    if (changed){
      scheduleAutoSave();
      pushHistory();
    }
  };
  const onUp = () => finish(false);
  const onCancel = () => finish(true);
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onCancel);
}

function beginPoseResize(e, i, chip, handle){
  if (i < 0 || i >= keyframes.length - 1 || kfMultiSelectMode) return;
  beginTimelineResize(e, {
    chip, handle,
    label: `F${i+1} → F${i+2}`,
    select: () => selectKeyframeStateOnly(i),
    getBeats: () => keyframes[i] ? (keyframes[i].beats || 1) : 1,
    setBeats: (v) => { if (keyframes[i]) keyframes[i].beats = v; },
    updateLayout: updateKeyframeClipLayoutOnly,
    hudExtra: (beats) => {
      const sec = (beats * (60000 / bpm) / 1000).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
      return `${sec}s`;
    }
  });
}

function beginGrooveResize(e, i, chip, handle){
  if (i < 0 || i >= grooveSequence.length) return;
  beginTimelineResize(e, {
    chip, handle,
    label: "GROOVE",
    select: () => selectGrooveSeqEntry(i),
    getBeats: () => grooveSequence[i] ? grooveSequence[i].beats : 1,
    setBeats: (v) => { if (grooveSequence[i]) grooveSequence[i].beats = v; },
    updateLayout: updateGrooveClipLayoutOnly
  });
}

function updateGrooveSeqTotalLabel(){
  const el = document.getElementById("grooveSeqTotalBeats");
  if (!el) return;
  if (grooveSequence.length === 0){ el.textContent = ""; return; }
  const total = grooveSeqTotalBeats();
  const kfTotal = kfTotalBeats();
  let msg = `序列總拍數：${total}拍`;
  if (kfTotal > 0){
    if (Math.abs(total - kfTotal) < 1e-9){
      msg += `・跟編舞總拍數（${kfTotal}拍）一致，剛好整段循環一次`;
    } else if (total < kfTotal){
      const loops = kfTotal / total;
      msg += `・編舞共${kfTotal}拍（會循環約${loops.toFixed(1)}輪`;
      msg += Math.abs(loops - Math.round(loops)) < 1e-9 ? "，剛好整數次）" : "，最後一輪會在中途被切斷）";
    } else {
      msg += `・編舞共${kfTotal}拍（序列比編舞長，後面 ${total - kfTotal} 拍的段落播不到）`;
    }
  }
  el.textContent = msg;
}

// 渲染律動序列 chip 清單：下拉選單選律動庫項目、拍數輸入框、複製/刪除，支援拖曳排序。
// 拖曳邏輯風格跟 #kfList 的拍點拖曳一致：dragstart 記來源 index、drop 時呼叫 reorder。
function renderGrooveSeqChips(){
  const host = document.getElementById("grooveSeqList");
  const empty = document.getElementById("grooveSeqEmpty");
  if (!host) return;
  bindTimelineReorderHost("groove", host);
  updateBeatGridGeometry();
  host.innerHTML = "";
  grooveSeqChipEls = [];
  if (grooveSequence.length === 0){
    if (empty) host.appendChild(empty);
    updateBeatGridGeometry();
    updateGrooveSeqTotalLabel();
    return;
  }
  const libItems = grooveLibCtrl ? grooveLibCtrl.getItems() : [];
  grooveSequence.forEach((entry, i) => {
    const chip = document.createElement("div");
    chip.className = "grooveSeqChip";
    const startBeat = grooveSegmentStartBeat(i);
    const durationBeats = Math.max(0.01, Number(entry.beats) || 0.01);
    const widthPx = Math.max(2, durationBeats * BEAT_GRID_PX_PER_BEAT - 2);
    chip.style.left = `${startBeat * BEAT_GRID_PX_PER_BEAT}px`;
    chip.style.width = `${widthPx}px`;
    if (widthPx < 126) chip.classList.add("beatGridCompact");
    chip.draggable = !kfPlaying && (!kfMultiSelectMode || grooveMultiSelected.has(i));
    const libItem = libItems.find(it => it.id === entry.libId);
    chip.classList.toggle("missingLib", !libItem);
    chip.classList.toggle("selected", !kfMultiSelectMode && i === grooveSeqSelectedIndex);
    chip.classList.toggle("multiChecked", kfMultiSelectMode && grooveMultiSelected.has(i));
    chip.addEventListener("click", () => { if (kfMultiSelectMode) toggleGrooveMultiSelectItem(i); else selectGrooveSeqEntry(i); });
    if (kfMultiSelectMode){
      const check=document.createElement("span"); check.className="kfCheckMark"; check.textContent="✓";
      check.setAttribute("data-tooltip", grooveMultiSelected.has(i) ? "已選取；可拖曳任一已選 GROOVE 整組移動" : "點此段加入多選");
      chip.appendChild(check);
    }

    const sel = document.createElement("select");
    if (!libItem){
      // 引用到已被刪除的律動庫項目：顯示警示選項，讓使用者知道要重新指定，而不是靜默失效。
      const optMissing = document.createElement("option");
      optMissing.value = entry.libId;
      optMissing.textContent = "⚠ 已刪除的律動";
      sel.appendChild(optMissing);
    }
    libItems.forEach(it => {
      const opt = document.createElement("option");
      opt.value = it.id;
      opt.textContent = it.name;
      if (it.id === entry.libId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.title = "這段套用哪個律動庫項目";
    // clip 本身可拖曳；操作下拉選單時不要讓父層把 pointer 起手誤判成拖曳。
    sel.onpointerdown = (ev) => { ev.stopPropagation(); if (!kfMultiSelectMode) selectGrooveSeqEntry(i); };
    sel.onmousedown = (ev) => ev.stopPropagation();
    sel.onclick = (ev) => ev.stopPropagation();
    sel.onchange = (e) => { setGrooveSeqLibId(i, e.target.value); pushHistory(); };
    chip.appendChild(sel);

    const beatsInput = document.createElement("input");
    beatsInput.type = "number";
    beatsInput.className = "beatsInput";
    beatsInput.min = BEAT_GRID_SNAP > 0 ? String(BEAT_GRID_SNAP) : "0.01"; beatsInput.max = "64"; beatsInput.step = BEAT_GRID_SNAP > 0 ? String(BEAT_GRID_SNAP) : "0.01";
    beatsInput.value = formatBeatValue(entry.beats);
    beatsInput.title = "這段維持幾拍（支援 1/4 拍）；也可拖曳 clip 右側邊緣調整";
    beatsInput.draggable = false;
    // 1 拍 compact clip 空間很窄，直接操作數字框時禁止事件冒泡到可拖曳的父層。
    beatsInput.onpointerdown = (ev) => { ev.stopPropagation(); if (!kfMultiSelectMode) selectGrooveSeqEntry(i); };
    beatsInput.onmousedown = (ev) => ev.stopPropagation();
    beatsInput.onclick = (ev) => ev.stopPropagation();
    beatsInput.onchange = (e) => { setGrooveSeqBeats(i, e.target.value); pushHistory(); };
    chip.appendChild(beatsInput);

    const beatsUnit = document.createElement("span");
    beatsUnit.className = "beatUnit";
    beatsUnit.textContent = "拍";
    beatsUnit.style.cssText = "font-size:10px; color:#6a6a9a; padding:0 3px;";
    chip.appendChild(beatsUnit);

    const dup = document.createElement("button");
    dup.className = "dup"; dup.textContent = "⧉"; dup.title = "複製這段";
    dup.onclick = (ev) => { ev.stopPropagation(); duplicateGrooveSeqEntry(i); pushHistory(); };
    if (!kfMultiSelectMode) chip.appendChild(dup);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "timelineResizeHandle grooveResizeHandle";
    resizeHandle.setAttribute("data-tooltip", "拖曳左右調整這段律動長度（1/4拍吸附）");
    resizeHandle.addEventListener("pointerdown", (ev) => beginGrooveResize(ev, i, chip, resizeHandle));
    resizeHandle.addEventListener("click", (ev) => ev.stopPropagation());
    if (!kfMultiSelectMode) chip.appendChild(resizeHandle);

    chip.addEventListener("dragstart", (ev) => {
      grooveSeqDragIndex = i; // 保留舊狀態變數供相容/除錯
      if (!beginTimelineReorderDrag("groove", i, chip, ev)) grooveSeqDragIndex = -1;
    });
    chip.addEventListener("dragend", () => {
      endTimelineReorderDrag("groove");
      grooveSeqDragIndex = -1;
    });

    host.appendChild(chip);
    grooveSeqChipEls[i] = chip;
  });
  updateBeatGridGeometry();
  renderGrooveLoopGhosts();
  updateGrooveSeqTotalLabel();
}

// 律動庫的 UI 初始化：跟姿勢庫/手勢庫/招式庫共用同一套 createLibraryController，
// 差別只在 onRender 時要順便重繪律動序列（因為序列下拉選單的選項來自律動庫項目清單）。
function bindGrooveLibraryUI(){
  grooveLibCtrl = createLibraryController({
    storageKey: GROOVE_LIB_KEY, captureFn: captureCurrentGrooveConfig, applyFn: applyGrooveConfigData,
    listElId: "grooveLibList", emptyElId: "grooveLibEmpty", filePrefix: "律動", itemLabel: "律動",
    subtitleFn: grooveLibSubtitle,
    extraDeleteWarning: (item) => {
      const refCount = grooveSequence.filter(e => e.libId === item.id).length;
      if (refCount === 0) return null;
      return `⚠️「時間軸」分頁的律動序列裡有 ${refCount} 個段落正在使用這個律動，刪除後那幾段播放時會沿用前一個有效段落的設定（若前面沒有其他有效段落，則那幾拍不套用律動）。`;
    },
    onRender: (count) => {
      const badge = document.getElementById("grooveLibCount");
      if (badge) badge.textContent = count;
      renderGrooveSeqChips(); // 庫項目增/刪/改名，序列清單的下拉選單內容要跟著重繪
    }
  });
  const nameInput = document.getElementById("grooveLibNameInput");
  document.getElementById("grooveLibSaveBtn").onclick = () => {
    grooveLibCtrl.saveCurrent(nameInput.value);
    nameInput.value = "";
  };
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("grooveLibSaveBtn").click(); });
  document.getElementById("grooveLibExportAllBtn").onclick = () => grooveLibCtrl.exportAll();
  document.getElementById("grooveLibImportAllBtn").onclick = () => document.getElementById("grooveLibImportAllFile").click();
  document.getElementById("grooveLibImportAllFile").onchange = (e) => { grooveLibCtrl.importAll(e.target.files[0]); e.target.value = ""; };
  document.getElementById("grooveLibImportOneBtn").onclick = () => document.getElementById("grooveLibImportOneFile").click();
  document.getElementById("grooveLibImportOneFile").onchange = (e) => { grooveLibCtrl.importOne(e.target.files[0]); e.target.value = ""; };
  grooveLibCtrl.render();
}

function bindGrooveSequenceUI(){
  const addBtn = document.getElementById("grooveSeqAddBtn");
  if (addBtn){
    addBtn.onclick = () => {
      const items = grooveLibCtrl ? grooveLibCtrl.getItems() : [];
      if (items.length === 0){ alert("律動庫目前是空的，請先在上面「律動庫」存至少一項律動設定。"); return; }
      addGrooveSeqEntry(items[0].id);
      pushHistory();
    };
  }
  renderGrooveSeqChips();
}

// 每幀呼叫：在 keyframes[kfIndex] 與 keyframes[kfIndex+1] 之間用四元數 Slerp 平滑過渡
// 過渡時長 = 該拍點自訂的「拍數」× BPM 換算出的一拍毫秒數；過渡曲線 = 該拍點自訂的 Easing
function updateKeyframePlayback(now){
  timelinePlayback.update(now);
}

function bindTopUI(){
  bindPoleRadiusUI();
  bindHandAimUI();
  document.getElementById("mirrorBtn").onclick = () => { mirrorPose(); pushHistory(); };
  document.getElementById("symmetrizeBtn").onclick = () => { symmetrizePose(); pushHistory(); };
  document.getElementById("resetBtn").onclick = () => { resetPose(); pushHistory(); };
  document.getElementById("bpmSlider").oninput = updateBpm;
  document.getElementById("bpmVal").onchange = updateBpm;
  document.getElementById("deselectBtn").onclick = deselectJoint;
  document.getElementById("zeroJointBtn").onclick = () => {
    if (selectedIK){
      if (selectedIK.role === "laPoint" || selectedIK.role === "trajPoint") return; // 軌跡控制點沒有「預設位置」可歸零，請用清單裡的 × 刪除
      if (selectedIK.limb === "spine") syncSpineIKMarkerToDefault();
      else if (selectedIK.limb.startsWith("lookAt_")){
        const n=selectedIK.limb.slice(7);pushHistory();
        if(HAND_AIM_NAMES.includes(n))captureHandAim(n);
        syncLookAtMarkerToDefault(n);updateHandAimUI();pushHistory();scheduleAutoSave();
      }
      else if (selectedIK.limb === "body") resetBodyTransform();
      else if (selectedIK.limb.startsWith(FINGER_IK_PREFIX)) syncFingerIKMarkerToDefault(selectedIK.limb.slice(FINGER_IK_PREFIX.length));
      else if(selectedIK.role === "pole"){
        pushHistory();alignPoleInRadius(selectedIK.limb);pushHistory();scheduleAutoSave();
      } else syncIKMarkersToDefault(selectedIK.limb);
      updateSelectedBar();
      return;
    }
    if (!selectedKey) return;
    setTarget(selectedKey, [0,0,0]);
    updateSelectedBar();
    pushHistory();
  };
  document.getElementById("spaceBtn").onclick = () => {
    const isLocal = transformControls.space === "local";
    transformControls.setSpace(isLocal ? "world" : "local");
    document.getElementById("spaceBtn").textContent = "座標：" + (isLocal ? "世界" : "本地");
  };
  document.getElementById("snapSelect").onchange = (e) => {
    const deg = parseFloat(e.target.value);
    transformControls.setRotationSnap(deg > 0 ? D(deg) : null);
  };


  document.getElementById("applyJsonBtn").onclick = () => { if (applyJson()) pushHistory(); };
  document.getElementById("copyJsonBtn").onclick = () => {
    refreshJsonArea();
    const area = document.getElementById("jsonArea");
    area.select();
    document.execCommand("copy");
  };

  document.getElementById("kfPlayBtn").onclick = toggleKeyframePlayback;
  const kfLoopBtn = document.getElementById("kfLoopBtn");
  kfLoopBtn.classList.toggle("active", kfLoop); // 圖示按鈕改用 active class 表示目前是否為循環播放狀態，跟其他切換按鈕（如手指 IK）同一套視覺語言
  kfLoopBtn.onclick = () => {
    kfLoop = !kfLoop;
    if (kfLoop) setBeatGridRangeLoop(false);
    kfLoopBtn.classList.toggle("active", kfLoop);
  };
  const beatGridZoomSelect = document.getElementById("beatGridZoomSelect");
  const beatGridZoomOutBtn = document.getElementById("beatGridZoomOutBtn");
  const beatGridZoomInBtn = document.getElementById("beatGridZoomInBtn");
  if (beatGridZoomSelect){
    syncBeatGridZoomSelect(BEAT_GRID_PX_PER_BEAT);
    beatGridZoomSelect.onchange = (e) => setBeatGridZoomPx(Number(e.target.value));
  }
  if (beatGridZoomOutBtn) beatGridZoomOutBtn.onclick = () => stepBeatGridZoom(-1);
  if (beatGridZoomInBtn) beatGridZoomInBtn.onclick = () => stepBeatGridZoom(1);
  const beatGridSnapSelect = document.getElementById("beatGridSnapSelect");
  if (beatGridSnapSelect){
    beatGridSnapSelect.value = String(BEAT_GRID_SNAP);
    beatGridSnapSelect.onchange = (e) => setBeatGridSnap(Number(e.target.value));
  }
  setBeatGridSnap(BEAT_GRID_SNAP);
  const beatGridHomeBtn = document.getElementById("beatGridHomeBtn");
  const beatGridEndBtn = document.getElementById("beatGridEndBtn");
  const beatGridFitBtn = document.getElementById("beatGridFitBtn");
  const beatGridCenterBtn = document.getElementById("beatGridCenterBtn");
  if (beatGridHomeBtn) beatGridHomeBtn.onclick = () => navigateBeatGridToBeat(0);
  if (beatGridEndBtn) beatGridEndBtn.onclick = () => navigateBeatGridToBeat(beatGridTimelineBeats());
  if (beatGridFitBtn) beatGridFitBtn.onclick = fitBeatGridTimeline;
  if (beatGridCenterBtn) beatGridCenterBtn.onclick = centerBeatGridPlayhead;
  const beatGridRangeLoopBtn = document.getElementById("beatGridRangeLoopBtn");
  const beatGridRangeCopyBtn = document.getElementById("beatGridRangeCopyBtn");
  const beatGridRangePasteBtn = document.getElementById("beatGridRangePasteBtn");
  const beatGridRangeDuplicateBtn = document.getElementById("beatGridRangeDuplicateBtn");
  const beatGridRangeDeleteBtn = document.getElementById("beatGridRangeDeleteBtn");
  const beatGridRangeClearBtn = document.getElementById("beatGridRangeClearBtn");
  if (beatGridRangeLoopBtn) beatGridRangeLoopBtn.onclick = () => setBeatGridRangeLoop(!beatGridRangeLoop);
  if (beatGridRangeCopyBtn) beatGridRangeCopyBtn.onclick = copyBeatGridRange;
  if (beatGridRangePasteBtn) beatGridRangePasteBtn.onclick = () => pasteBeatGridRange();
  if (beatGridRangeDuplicateBtn) beatGridRangeDuplicateBtn.onclick = duplicateBeatGridRange;
  if (beatGridRangeDeleteBtn) beatGridRangeDeleteBtn.onclick = deleteBeatGridRange;
  if (beatGridRangeClearBtn) beatGridRangeClearBtn.onclick = clearBeatGridRange;
  bindBeatGridRangeSelection();
  updateBeatGridRangeUI();
  const onionChkDisplay = document.getElementById("onionSkinChkDisplay");
  if (onionChkDisplay){
    onionChkDisplay.checked = onionSkinEnabled;
    onionChkDisplay.onchange = (e) => { onionSkinEnabled = e.target.checked; updateOnionSkins(); };
  }
  bindGrooveUI();
  const kfMusicWaveformDetails = document.getElementById("kfMusicWaveformDetails");
  document.getElementById("kfAddBtn").onclick = () => { addKeyframe(); pushHistory(); };
  document.getElementById("kfUpdateBtn").onclick = () => { updateKeyframe(); pushHistory(); };
  document.getElementById("kfMultiSelectBtn").onclick = () => setKfMultiSelectMode(!kfMultiSelectMode);
  document.getElementById("kfMultiSelectAllBtn").onclick = kfMultiSelectAll;
  document.getElementById("kfMultiSelectNoneBtn").onclick = kfMultiSelectNone;
  document.getElementById("kfMultiSelectCopyBtn").onclick = copyTimelineSelection;
  document.getElementById("kfMultiSelectCutBtn").onclick = cutTimelineSelection;
  document.getElementById("kfMultiSelectPasteBtn").onclick = pasteTimelineClipboard;
  document.getElementById("kfMultiSelectDeleteBtn").onclick = deleteKfMultiSelected;
  updateKfMultiSelectBar();
  document.getElementById("kfExportBtn").onclick = exportTimeline;
  document.getElementById("kfImportBtn").onclick = () => document.getElementById("kfImportFile").click();
  document.getElementById("kfImportFile").onchange = (e) => {
    const file = e.target.files[0];
    if (file) importTimelineFromFile(file);
    e.target.value = ""; // 清空選取，允許連續匯入同一個檔名的檔案
  };
  document.getElementById("kfMusicImportBtn").onclick = () => document.getElementById("kfMusicFile").click();
  document.getElementById("kfMusicFile").onchange = (e) => {
    const file = e.target.files[0];
    if (file) importKfMusic(file);
    e.target.value = "";
  };
  document.getElementById("kfMusicRemoveBtn").onclick = removeKfMusic;
  document.getElementById("kfMusicVolume").oninput = (e) => {
    document.getElementById("kfAudioEl").volume = parseFloat(e.target.value);
  };
  document.getElementById("kfMusicOffset").oninput = () => {
    waveform.invalidate();
    updateBeatGridGeometry();
    drawKfWaveform();
  };
  document.getElementById("kfAudioEl").addEventListener("timeupdate", updateBeatGridMusicPreviewPlayhead);
  document.getElementById("kfMusicPreviewBtn").onclick = toggleKfMusicPreview;
  ["play", "pause", "ended"].forEach(evt => document.getElementById("kfAudioEl").addEventListener(evt, () => {
    syncKfMusicPreviewBtn();
    updateBeatGridMusicPreviewPlayhead();
  }));
  initKfListWheelScroll();
  bindKfKeyboardShortcuts();
  bindKfWaveformScrubbing();
  window.addEventListener("resize", () => { updateBeatGridGeometry(); drawKfWaveform(); });

  const easeSel = document.getElementById("kfEasingSelect");
  easeSel.innerHTML = buildEasingSelectOptions();
  easeSel.value = kfPendingEasing;
  easeSel.onchange = (e) => { setKeyframeEasing(e.target.value); pushHistory(); };

  const beatsSel = document.getElementById("kfBeatsSelect");
  beatsSel.value = String(kfPendingBeats);
  beatsSel.onchange = (e) => { setKeyframeBeats(parseFloat(e.target.value)); pushHistory(); };

  updateEasingPreview();
  updateBeatMsHint();
  updateBeatGridPoseInspector();

  initUITabs();
  initEasingGallery();
  initUIVisibility();
  initUIResize();
  initUIFloat();
  initFingerFloatPanel();
  bindIKUI();
  bindGrabBoxUI();
  bindTrajUI();
  bindHistoryUI();
  bindCameraUI();
  initSplitView();
  bindLibraryUI();
  bindOverviewUI();
  bindJsonRefUI();
  initDisplayTogglesPanel();
  initPerfPanel();
}

// ======================================================================
// 顯示設定小面板：身體/手部關節球、骨架、碰撞可視化，整合成一個浮在畫面左上角的獨立面板
// （跟右上角「分割視窗」預覽同樣是疊在3D畫面上的浮動面板），可收合避免長期擋住畫面。
// 收合狀態存 localStorage，跟其他面板（分割視窗開啟項目、UI浮動位置等）同一套持久化模式。
// ======================================================================
const DISPLAY_TOGGLES_COLLAPSED_STORAGE_KEY = "tuttingDisplayTogglesCollapsed";

function setDisplayTogglesCollapsed(collapsed){
  const panel = document.getElementById("displayTogglesPanel");
  if (panel) panel.classList.toggle("collapsed", collapsed);
  try { localStorage.setItem(DISPLAY_TOGGLES_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0"); } catch (e) {}
}

function initDisplayTogglesPanel(){
  const showBodyJointsChk = document.getElementById("showBodyJointsChk");
  if (showBodyJointsChk){
    showBodyJointsChk.checked = showBodyJoints;
    showBodyJointsChk.onchange = (e) => setJointCategoryVisible("body", e.target.checked);
  }
  const showHandJointsChk = document.getElementById("showHandJointsChk");
  if (showHandJointsChk){
    showHandJointsChk.checked = showHandJoints;
    showHandJointsChk.onchange = (e) => setJointCategoryVisible("hand", e.target.checked);
  }
  const showSkeletonChk = document.getElementById("showSkeletonChk");
  if (showSkeletonChk){
    showSkeletonChk.checked = showSkeleton;
    showSkeletonChk.onchange = (e) => { showSkeleton = e.target.checked; };
  }
  const handCollisionVizCb = document.getElementById("handCollisionVizCb");
  if (handCollisionVizCb){
    handCollisionVizCb.checked = handCollisionVizEnabled;
    handCollisionVizCb.onchange = (e) => { handCollisionVizEnabled = e.target.checked; };
  }

  const collapseBtn = document.getElementById("displayTogglesCollapseBtn");
  if (collapseBtn){
    let collapsed = false;
    try { collapsed = localStorage.getItem(DISPLAY_TOGGLES_COLLAPSED_STORAGE_KEY) === "1"; } catch (e) {}
    setDisplayTogglesCollapsed(collapsed);
    collapseBtn.onclick = () => {
      const panel = document.getElementById("displayTogglesPanel");
      setDisplayTogglesCollapsed(!panel.classList.contains("collapsed"));
    };
  }
}

// ---- 面板高度：拖曳把手手動調整 ----
const UI_HEIGHT_MIN_PX = 160;
const UI_HEIGHT_DEFAULT_RATIO = 0.46; // 對應原本的 46vh 預設
const UI_HEIGHT_MAX_RATIO = 0.85;

function initUIResize(){
  const ui = document.getElementById("ui");
  const handle = document.getElementById("uiResizeHandle");
  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  function clampHeight(px){
    const max = window.innerHeight * UI_HEIGHT_MAX_RATIO;
    return Math.min(max, Math.max(UI_HEIGHT_MIN_PX, px));
  }

  function applyHeight(px, save){
    const h = clampHeight(px);
    ui.style.height = h + "px";
    if (save){
      try { localStorage.setItem("tuttingUIHeightRatio", String(h / window.innerHeight)); } catch (e) {}
    }
  }

  function onPointerMove(e){
    if (!dragging) return;
    // 面板貼底部，往上拖（clientY 變小）要變高，所以是「起始Y - 目前Y」
    applyHeight(startHeight + (startY - e.clientY), false);
  }

  function onPointerUp(e){
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    document.body.classList.remove("uiResizing");
    applyHeight(ui.getBoundingClientRect().height, true);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    startY = e.clientY;
    startHeight = ui.getBoundingClientRect().height;
    handle.classList.add("dragging");
    document.body.classList.add("uiResizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    e.preventDefault();
  });

  // 雙擊把手：重置回預設高度
  handle.addEventListener("dblclick", () => {
    applyHeight(window.innerHeight * UI_HEIGHT_DEFAULT_RATIO, true);
  });

  // 視窗尺寸改變時，依原本比例換算成新的 px 高度，維持相對大小（浮動模式的尺寸由 initUIFloat() 自己處理，這裡略過）
  window.addEventListener("resize", () => {
    if (ui.classList.contains("uiFloating")) return;
    let ratio = UI_HEIGHT_DEFAULT_RATIO;
    try { ratio = parseFloat(localStorage.getItem("tuttingUIHeightRatio")) || UI_HEIGHT_DEFAULT_RATIO; } catch (e) {}
    applyHeight(window.innerHeight * ratio, false);
  });

  let ratio = UI_HEIGHT_DEFAULT_RATIO;
  try { ratio = parseFloat(localStorage.getItem("tuttingUIHeightRatio")) || UI_HEIGHT_DEFAULT_RATIO; } catch (e) {}
  applyHeight(window.innerHeight * ratio, false);
}

// ---- 面板浮動模式：可拖曳移動、可從右下角拖曳縮放，取代貼底整版寬的預設佈局 ----
// 沿用跟 initUIResize() 一樣的「pointerdown 記錄起點 → pointermove 即時套用 → pointerup 存檔」模式，
// 只是從單純調高度，擴充成同時處理 x/y 位置＋寬高。
const UI_FLOAT_MIN_WIDTH = 300;
const UI_FLOAT_MIN_HEIGHT = 160;
const UI_FLOAT_DEFAULT_WIDTH = 440;
const UI_FLOAT_DEFAULT_LEFT = 24;
const UI_FLOAT_DEFAULT_TOP = 64;

function initUIFloat(){
  const ui = document.getElementById("ui");
  const floatBtn = document.getElementById("uiFloatBtn");
  const dragHandle = document.getElementById("uiDragHandle");
  const resizeHandle = document.getElementById("uiFloatResizeHandle");

  // 限制浮動視窗的位置跟大小都不超出目前視窗範圍，避免拖到畫面外找不回來
  // top 的下限不能只留 4px——面板頂部那排「浮動/隱藏面板」按鈕是用往上位移 28px 的方式疊在面板外面，
  // 面板一旦貼近畫面最上緣，那排按鈕就會被推到瀏覽器可視範圍外面，完全看不到也點不到、卡在浮動模式關不掉。
  // 這裡把 top 下限拉高到留得出那排按鈕的空間，從根本避免這個位置存在。
  const UI_FLOAT_TOP_MIN = 34;

  function clampRect(left, top, width, height){
    const maxW = window.innerWidth - 8;
    const maxH = window.innerHeight - 8;
    width = Math.min(Math.max(width, UI_FLOAT_MIN_WIDTH), maxW);
    height = Math.min(Math.max(height, UI_FLOAT_MIN_HEIGHT), maxH);
    left = Math.min(Math.max(left, 4), window.innerWidth - width - 4);
    top = Math.min(Math.max(top, UI_FLOAT_TOP_MIN), window.innerHeight - height - 4);
    return { left, top, width, height };
  }

  function applyRect(rect, save){
    ui.style.left = rect.left + "px";
    ui.style.top = rect.top + "px";
    ui.style.width = rect.width + "px";
    ui.style.height = rect.height + "px";
    if (save){
      try { localStorage.setItem("tuttingUIFloatRect", JSON.stringify(rect)); } catch (e) {}
    }
  }

  function getDefaultRect(){
    return clampRect(UI_FLOAT_DEFAULT_LEFT, UI_FLOAT_DEFAULT_TOP, UI_FLOAT_DEFAULT_WIDTH, window.innerHeight * UI_HEIGHT_DEFAULT_RATIO);
  }

  function getSavedRect(){
    let rect = null;
    try { rect = JSON.parse(localStorage.getItem("tuttingUIFloatRect")); } catch (e) {}
    if (!rect || typeof rect.left !== "number") return getDefaultRect();
    return clampRect(rect.left, rect.top, rect.width, rect.height);
  }

  function setFloating(floating, save){
    ui.classList.toggle("uiFloating", floating);
    floatBtn.textContent = floating ? "📌 貼底面板" : "🗗 浮動面板";
    floatBtn.title = floating ? "切換回貼底整版寬的面板" : "切換成可拖曳移動、可縮放大小的浮動面板";
    if (floating){
      applyRect(getSavedRect(), false);
    } else {
      // 交還給貼底模式（initUIResize()）自己的 CSS/高度邏輯，這裡只要清掉浮動模式加的 inline 定位
      ui.style.left = "";
      ui.style.top = "";
      ui.style.width = "";
      let ratio = UI_HEIGHT_DEFAULT_RATIO;
      try { ratio = parseFloat(localStorage.getItem("tuttingUIHeightRatio")) || UI_HEIGHT_DEFAULT_RATIO; } catch (e) {}
      ui.style.height = (window.innerHeight * ratio) + "px";
    }
    if (save){
      try { localStorage.setItem("tuttingUIFloating", floating ? "1" : "0"); } catch (e) {}
    }
  }

  floatBtn.onclick = () => setFloating(!ui.classList.contains("uiFloating"), true);

  // ---- 拖曳移動 ----
  let dragging = false, dragStartX = 0, dragStartY = 0, dragStartLeft = 0, dragStartTop = 0;

  function onDragMove(e){
    if (!dragging) return;
    const r = ui.getBoundingClientRect();
    applyRect(clampRect(dragStartLeft + (e.clientX - dragStartX), dragStartTop + (e.clientY - dragStartY), r.width, r.height), false);
  }
  function onDragUp(){
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("uiFloatDragging");
    const r = ui.getBoundingClientRect();
    applyRect(clampRect(r.left, r.top, r.width, r.height), true);
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
  }
  dragHandle.addEventListener("pointerdown", (e) => {
    if (!ui.classList.contains("uiFloating")) return;
    dragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    const r = ui.getBoundingClientRect();
    dragStartLeft = r.left; dragStartTop = r.top;
    document.body.classList.add("uiFloatDragging");
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    e.preventDefault();
  });
  dragHandle.addEventListener("dblclick", () => {
    if (!ui.classList.contains("uiFloating")) return;
    applyRect(getDefaultRect(), true);
  });

  // ---- 拖曳右下角縮放（同時調寬高） ----
  let resizing = false, rzStartX = 0, rzStartY = 0, rzStartW = 0, rzStartH = 0, rzLeft = 0, rzTop = 0;

  function onResizeMove(e){
    if (!resizing) return;
    applyRect(clampRect(rzLeft, rzTop, rzStartW + (e.clientX - rzStartX), rzStartH + (e.clientY - rzStartY)), false);
  }
  function onResizeUp(){
    if (!resizing) return;
    resizing = false;
    document.body.classList.remove("uiFloatResizing");
    const r = ui.getBoundingClientRect();
    applyRect(clampRect(r.left, r.top, r.width, r.height), true);
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeUp);
  }
  resizeHandle.addEventListener("pointerdown", (e) => {
    if (!ui.classList.contains("uiFloating")) return;
    resizing = true;
    rzStartX = e.clientX; rzStartY = e.clientY;
    const r = ui.getBoundingClientRect();
    rzStartW = r.width; rzStartH = r.height; rzLeft = r.left; rzTop = r.top;
    document.body.classList.add("uiFloatResizing");
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp);
    e.preventDefault();
    e.stopPropagation();
  });

  // 視窗尺寸改變時，若正在浮動模式要重新 clamp，避免面板被卡在畫面外看不到、抓不回來
  window.addEventListener("resize", () => {
    if (!ui.classList.contains("uiFloating")) return;
    const r = ui.getBoundingClientRect();
    applyRect(clampRect(r.left, r.top, r.width, r.height), true);
  });

  let floating = false;
  try { floating = localStorage.getItem("tuttingUIFloating") === "1"; } catch (e) {}
  setFloating(floating, false);
}

// ======================================================================
// 通用「可浮動＋可調整大小」小面板：把某個分頁裡的內容彈出成獨立浮動視窗，
// 跟主面板（#ui）分開拖曳/縮放，收合時精準插回原本在 DOM 裡的位置。
// 沿用跟 initUIFloat() 一樣的拖曳/縮放手感，抽成參數化的通用版本方便重複使用。
// ======================================================================
function makeFloatablePanel(opts){
  const { contentEl, storageKey, title, defaultRect, minWidth = 240, minHeight = 160, onChange } = opts;
  const homeParent = contentEl.parentNode;
  const homeNextSibling = contentEl.nextSibling; // 記住原本插入點，收合時要精準插回原位，不能只 append 到最後

  const panel = document.createElement("div");
  panel.className = "floatablePanel";
  panel.style.display = "none";

  const header = document.createElement("div");
  header.className = "floatablePanelHeader";
  const grip = document.createElement("span");
  grip.className = "grip";
  const titleSpan = document.createElement("span");
  titleSpan.className = "floatablePanelTitle";
  titleSpan.textContent = title;
  const dockBtn = document.createElement("button");
  dockBtn.type = "button";
  dockBtn.className = "floatablePanelDockBtn";
  dockBtn.textContent = "📌 收合回面板";
  dockBtn.setAttribute("data-tooltip", "收合回原本的分頁");
  header.appendChild(grip);
  header.appendChild(titleSpan);
  header.appendChild(dockBtn);

  const body = document.createElement("div");
  body.className = "floatablePanelBody";

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "floatablePanelResizeHandle";
  resizeHandle.setAttribute("data-tooltip", "拖曳調整大小");

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(resizeHandle);
  document.body.appendChild(panel);

  function clampRect(left, top, width, height){
    const maxW = window.innerWidth - 8;
    const maxH = window.innerHeight - 8;
    width = Math.min(Math.max(width, minWidth), maxW);
    height = Math.min(Math.max(height, minHeight), maxH);
    left = Math.min(Math.max(left, 4), window.innerWidth - width - 4);
    top = Math.min(Math.max(top, 4), window.innerHeight - height - 4);
    return { left, top, width, height };
  }
  function applyRect(rect, save){
    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    panel.style.width = rect.width + "px";
    panel.style.height = rect.height + "px";
    if (save){
      try { localStorage.setItem(storageKey, JSON.stringify(rect)); } catch (e) {}
    }
  }
  function getDefaultRect(){
    return clampRect(defaultRect.left, defaultRect.top, defaultRect.width, defaultRect.height);
  }
  function getSavedRect(){
    let rect = null;
    try { rect = JSON.parse(localStorage.getItem(storageKey)); } catch (e) {}
    if (!rect || typeof rect.left !== "number") return getDefaultRect();
    return clampRect(rect.left, rect.top, rect.width, rect.height);
  }

  let floating = false;
  function setFloating(on){
    floating = on;
    if (on){
      body.appendChild(contentEl); // contentEl 直接搬過來，事件監聽器/選取狀態都不受影響
      panel.style.display = "flex";
      applyRect(getSavedRect(), false);
    } else {
      panel.style.display = "none";
      if (homeNextSibling && homeNextSibling.parentNode === homeParent){
        homeParent.insertBefore(contentEl, homeNextSibling);
      } else {
        homeParent.appendChild(contentEl);
      }
    }
    try { localStorage.setItem(storageKey + "_on", on ? "1" : "0"); } catch (e) {}
    if (typeof onChange === "function") onChange(on); // 不論從外部按鈕還是面板內的收合鈕觸發，都要同步通知外部狀態已改變
  }
  dockBtn.onclick = () => setFloating(false);

  // ---- 拖曳移動 ----
  let dragging = false, dsx = 0, dsy = 0, dsl = 0, dst = 0, dsw = 0, dsh = 0;
  function onDragMove(e){
    if (!dragging) return;
    // 寬高沿用拖曳開始那一刻量到的值，不要在每個 mousemove 都重新用 getBoundingClientRect() 量測——
    // 那樣量到的是含 border 的算後尺寸，若元素不是 border-box，每次搬過去當作新的 style.width/height
    // 會把 border 疊加進內容寬度，越拖越大；固定住寬高只改位置才是正確的拖曳行為。
    applyRect(clampRect(dsl + (e.clientX - dsx), dst + (e.clientY - dsy), dsw, dsh), false);
  }
  function onDragUp(){
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("uiFloatDragging");
    const r = panel.getBoundingClientRect();
    applyRect(clampRect(r.left, r.top, dsw, dsh), true);
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
  }
  header.addEventListener("pointerdown", (e) => {
    if (e.target === dockBtn) return;
    dragging = true;
    dsx = e.clientX; dsy = e.clientY;
    const r = panel.getBoundingClientRect();
    dsl = r.left; dst = r.top; dsw = r.width; dsh = r.height;
    document.body.classList.add("uiFloatDragging");
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    e.preventDefault();
  });
  header.addEventListener("dblclick", (e) => {
    if (e.target === dockBtn) return;
    applyRect(getDefaultRect(), true);
  });

  // ---- 拖曳右下角縮放 ----
  let resizing = false, rsx = 0, rsy = 0, rsw = 0, rsh = 0, rl = 0, rt = 0;
  function onResizeMove(e){
    if (!resizing) return;
    applyRect(clampRect(rl, rt, rsw + (e.clientX - rsx), rsh + (e.clientY - rsy)), false);
  }
  function onResizeUp(){
    if (!resizing) return;
    resizing = false;
    document.body.classList.remove("uiFloatResizing");
    const r = panel.getBoundingClientRect();
    applyRect(clampRect(r.left, r.top, r.width, r.height), true);
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeUp);
  }
  resizeHandle.addEventListener("pointerdown", (e) => {
    resizing = true;
    rsx = e.clientX; rsy = e.clientY;
    const r = panel.getBoundingClientRect();
    rsw = r.width; rsh = r.height; rl = r.left; rt = r.top;
    document.body.classList.add("uiFloatResizing");
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp);
    e.preventDefault();
    e.stopPropagation();
  });

  // 視窗尺寸改變時重新 clamp，避免浮動視窗被卡在畫面外
  window.addEventListener("resize", () => {
    if (!floating) return;
    const r = panel.getBoundingClientRect();
    applyRect(clampRect(r.left, r.top, r.width, r.height), true);
  });

  return {
    toggle(on){ setFloating(on === undefined ? !floating : on); },
    isFloating(){ return floating; }
  };
}

// ---- 手指面板：套用上面的通用浮動視窗，方便一邊看 3D 一邊微調手指、不被主面板佔用的畫面空間卡住 ----
function initFingerFloatPanel(){
  const grid = document.querySelector("#tabFingers .fingerHandGrid");
  const btn = document.getElementById("fingerFloatBtn");
  if (!grid || !btn) return;

  const floatable = makeFloatablePanel({
    contentEl: grid,
    storageKey: "tuttingFingerFloatRect",
    title: "✋ 手指 FK／IK",
    defaultRect: { left: Math.max(4, window.innerWidth - 400), top: 90, width: 360, height: 440 },
    minWidth: 260,
    minHeight: 220,
    onChange: () => syncLabel(), // 不管是點頁籤上的按鈕還是浮動視窗內的「收合回面板」，都要同步更新頁籤按鈕文字
  });

  function syncLabel(){
    const on = floatable.isFloating();
    btn.textContent = on ? "📌 收合回面板" : "🗗 浮動視窗";
    btn.setAttribute("data-tooltip", on
      ? "收合回「手指」分頁裡"
      : "彈出成獨立的浮動視窗，可拖曳移動、拖右下角調整大小，編輯手指時不用被主面板卡住");
  }
  btn.onclick = () => { floatable.toggle(); };

  let restoreFloating = false;
  try { restoreFloating = localStorage.getItem("tuttingFingerFloatRect_on") === "1"; } catch (e) {}
  if (restoreFloating) floatable.toggle(true);
  syncLabel();
}


// ---- 面板分頁（動作姿勢庫／JSON／時間軸） ----
function initUITabs(){
  const tabBtns = document.querySelectorAll(".tabBtn");
  const panels = document.querySelectorAll(".tabPanel");
  const validTabNames = Array.from(tabBtns).map(b => b.dataset.tab);

  function switchTab(name){
    if(name!=="tuttingGen")tgCancelPreview();
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    panels.forEach(p => p.classList.toggle("active", p.dataset.tab === name));
    if (name === "json") refreshJsonArea();
    if (name === "traj") renderTrajPointList();
    if (name === "overview") updateOverviewPanel(true);
    if (name === "jointLimits") updateJointLimitPanelAngles(true);
    if (name === "keyframe") requestAnimationFrame(drawKfWaveform); // 分頁剛顯示時canvas寬度才量得到，下一幀再畫
    try { localStorage.setItem("tuttingActiveTab", name); } catch (e) {}
    updateOnionSkins();
  }

  tabBtns.forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  let savedTab = "poseLib";
  try { savedTab = localStorage.getItem("tuttingActiveTab") || "poseLib"; } catch (e) {}
  // 舊版存的分頁名稱（例如已移除的「poses」）在目前分頁清單裡找不到時，退回預設分頁，避免面板空白
  if (!validTabNames.includes(savedTab)) savedTab = "poseLib";
  switchTab(savedTab);
}

// ---- 面板整體隱藏／顯示（快速鍵 H） ----
function initUIVisibility(){
  const ui = document.getElementById("ui");
  const hideBtn = document.getElementById("uiHideBtn");
  const showBtn = document.getElementById("uiShowBtn");

  function setHidden(hidden){
    ui.style.display = hidden ? "none" : "flex";
    showBtn.style.display = hidden ? "block" : "none";
    try { localStorage.setItem("tuttingUIHidden", hidden ? "1" : "0"); } catch (e) {}
  }

  hideBtn.onclick = () => setHidden(true);
  showBtn.onclick = () => setHidden(false);

  window.addEventListener("keydown", (e) => {
    if (e.key !== "h" && e.key !== "H") return;
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    if (typing) return;
    setHidden(ui.style.display !== "none");
  });

  let hidden = false;
  try { hidden = localStorage.getItem("tuttingUIHidden") === "1"; } catch (e) {}
  setHidden(hidden);
}

function updateBpm(event){
  const slider = document.getElementById("bpmSlider");
  const input = document.getElementById("bpmVal");
  const raw = (event?.currentTarget || slider).value;
  const next = raw.trim() === "" ? NaN : Number(raw);
  if (Number.isFinite(next)) bpm = clampNum(Math.round(next), 60, 220);
  slider.value = String(bpm);
  input.value = String(bpm);
  updateBeatMsHint();
  updateKfTotalDurationLabel(); // BPM改變總時長跟著變，這裡順便重算清單標題旁的顯示
  scheduleAutoSave();
  waveform.invalidate();
  updateBeatGridGeometry(); // 音樂秒數換算成 beats 的長度也會跟 BPM 改變
  drawKfWaveform();
}

// ---- 手腳 IK 求解（兩節解析解：root-mid-end + Pole 向量） ----

// 若 IK 目標超出「肩膀→目標」可及距離，平移整個角色 model，
// 讓肩膀貼近到「剛好可及」的距離，再交給原本的 solveTwoBoneIK 做手肘彎曲微調。
// 只動 model.position（角色剛體平移），完全不碰骨骼旋轉，跟現有 IK 求解互不衝突。
// 例：手掌固定在單槓上，身體搆不到時會整個人靠過去，而不是手臂硬拉長。
const _rflRootPos = new THREE.Vector3();
const _rflMidPos = new THREE.Vector3();
const _rflEndPos = new THREE.Vector3();
const _rflDir = new THREE.Vector3();
const _rflDesired = new THREE.Vector3();
const _rflDelta = new THREE.Vector3();
function solveRootFollowForLimb(limb){
  if (!ikRootFollowEnabled[limb]) return;
  const chain = IK_CHAINS[limb];
  const rootBone = bones[chain.root], midBone = bones[chain.mid], endBone = bones[chain.end];
  if (!rootBone || !midBone || !endBone) return;

  const rootPos = _rflRootPos; rootBone.getWorldPosition(rootPos);
  const midPos = _rflMidPos; midBone.getWorldPosition(midPos);
  const endPos = _rflEndPos; endBone.getWorldPosition(endPos);
  const upperLen = rootPos.distanceTo(midPos);
  const lowerLen = midPos.distanceTo(endPos);
  const maxReach = upperLen + lowerLen;
  if (maxReach < 1e-6) return;

  const targetPos = ikTargetMeshes[limb].position; // 場景物件的 position，下面一律用 .copy() 讀取，不直接修改它
  const dist = rootPos.distanceTo(targetPos);
  const comfortReach = maxReach * 0.92; // 留一點餘裕，避免手臂完全打直看起來卡住

  if (dist > comfortReach){
    const dirRootToTarget = _rflDir.copy(targetPos).sub(rootPos).normalize();
    // 肩膀應該移動到的世界座標：從 target 往回退 comfortReach 距離
    const desiredRootPos = _rflDesired.copy(targetPos).sub(dirRootToTarget.multiplyScalar(comfortReach));
    const delta = _rflDelta.copy(desiredRootPos).sub(rootPos);
    model.position.add(delta.multiplyScalar(ROOT_FOLLOW_LERP_T)); // 只前進一部分，跨幀累積平滑過渡
    model.updateWorldMatrix(true, true); // 讓後續量測（含腿部 IK）立刻拿到新座標
  }
}

// 從骨骼目前四元數反推「相對 rest pose」的角度，寫回 target/current（不含 UI 更新，逐幀呼叫用）
// 讓 IK 求解的結果可以跟一般 FK 一樣被「新增拍點」記錄下來、被 JSON 匯出。
// IK 接管的每個骨骼、每一幀都會呼叫一次（四肢×2、脊椎×4、手指×3×10……），改用共用暫存物件。
function syncTargetFromBone(key){
  poseController.syncFromBone(key);
}

function updateIKPoleLines(){
  const v = new THREE.Vector3();
  for (const limb of IK_LIMB_KEYS){
    if (!ikEnabled[limb]) continue;
    const chain = IK_CHAINS[limb];
    const midBone = bones[chain.mid];
    if (!midBone) continue;
    midBone.getWorldPosition(v);
    const posAttr = ikPoleLines[limb].geometry.attributes.position;
    posAttr.setXYZ(0, v.x, v.y, v.z);
    const pp = ikPoleMeshes[limb].position;
    posAttr.setXYZ(1, pp.x, pp.y, pp.z);
    posAttr.needsUpdate = true;
  }
}

// 每幀呼叫：對每個開啟 IK 的肢體求解，並把結果同步回 target/current（給拍點/JSON 用）
function solveIKAll(){
  let any = false;
  const dualActive = dualAnchorEnabled && ikEnabled.rArm && ikEnabled.lArm;
  // 雙手同時固定：優先處理，取代兩隻手臂各自獨立的 root-follow（避免兩套平移邏輯互搶）
  if (dualActive) solveDualHandAnchor();

  for (const limb of IK_LIMB_KEYS){
    if (!ikEnabled[limb]) continue;
    const chain = IK_CHAINS[limb];

    // 手臂類肢體：雙手固定模式已經處理過身體對齊，這裡只在「非雙手固定模式」時
    // 才跑單手各自的 root-follow，避免跟 solveDualHandAnchor 打架
    if ((limb === "rArm" || limb === "lArm") && !dualActive) solveRootFollowForLimb(limb);
    // 肩胛骨限幅輔助：在兩節IK求解前，讓Shoulder先偏一點點（僅手臂有shoulder欄位）
    // 受 shoulderAssistEnabled 開關控制，關掉就完全跳過，肩膀保持不動
    if ((limb === "rArm" || limb === "lArm") && shoulderAssistEnabled) solveShoulderAssist(limb);

    const rootBone = bones[chain.root], midBone = bones[chain.mid], endBone = bones[chain.end];
    if (!rootBone || !midBone || !endBone) continue;
    solveTwoBoneIK(rootBone, midBone, endBone, ikTargetMeshes[limb].position, ikPoleMeshes[limb].position);
    syncTargetFromBone(chain.root);
    syncTargetFromBone(chain.mid);
    // 腿部：root/mid的世界旋轉已經是本幀最新值，這時反推腳掌本地旋轉貼住鎖存值最準確
    if (limb === "rLeg" || limb === "lLeg") applyFootLock(limb);
    // Effector朝向控制：位置IK解完後，再套用目標球旋轉決定手掌/腳掌面向
    // （若開啟了腳踝鎖存，這裡會覆蓋掉鎖存值——兩者互斥概念上都是「控制末端朝向」，
    // 開啟朝向控制的那隻腳，鎖存的貼地朝向會被使用者手動指定的朝向取代）
    applyEffectorOrientation(limb);
    any = true;
  }
  if (any) updateIKPoleLines();
}

// ==== 手部-軀幹碰撞回彈（防穿模）====
// 目的：手部姿勢（不管是滑桿手動調、律動、關鍵影格播放）不小心讓手插進軀幹時，
// 每幀自動用一次輕量 CCD 把手往外推開，而不是放任穿模。
//
// 做法：把軀幹（Hips→Spine→Spine1→Spine2→Neck）近似成幾段「膠囊體」（兩根骨骼世界座標
// 連成的線段＋半徑），手掌視為一個球（球心＝手掌骨世界座標＋半徑）。每幀量測手掌球心到
// 各段膠囊「線段最近點」的距離，若距離小於（膠囊半徑＋手球半徑）就代表穿模，取穿模最深的
// 那一段，算出「把手推到膠囊表面剛好外側」的修正目標點，再重用既有的 solveCCDChain()
// （原本給脊椎/手指 IK 用的同一支通用 CCD 求解器）對「上臂→前臂」這條鏈跑幾輪，
// 溫和地把手肘彎一點讓手掌移出去，不是瞬間硬拉過去（damping 刻意調低，效果更像「頂住」
// 而不是「彈飛」）。
//
// 範圍限制（刻意的取捨，避免跟其他系統打架）：
// 1) 只作用在 rArm/lArm 這兩隻手臂的 root/mid（上臂/前臂），不動肩膀，這樣手肘自然彎開，
//    不會連帶整個肩膀跟著轉。
// 2) 該手臂若已開啟「手臂 IK」，代表使用者已經用目標球明確指定手要放在哪，這裡直接跳過、
//    不跟 IK 目標搶——如果手仍然穿模，代表目標球本身就放在身體裡，請使用者自行調整目標球位置。
// 3) 使用者正在用滑鼠拖曳這條手臂鏈上的任何一顆關節球時（draggingKey）也跳過，
//    避免拖曳過程中手感覺被「搶走」。
//
// 膠囊半徑／手球半徑都是概估值（單位：公尺，跟模型本身比例一致），現在可以直接在
// 「進階／阻尼設定」面板用滑桿即時調整（見 bindTopUI 內的 hcRadiusSlider_* 綁定），
// 不用再改程式碼；使用者上次調過的值會存 localStorage，開頁自動還原。
let handCollisionEnabled = false;
let HAND_COLLISION_RADIUS = 0.055; // 手掌球半徑
const HAND_COLLISION_RADIUS_DEFAULT = 0.055;
const TORSO_CAPSULES = [
  // { boneA, boneB, radius }：軀幹每一段的膠囊定義，由下往上；radius 是可變的（滑桿即時寫入這裡）
  { boneA:"hips",   boneB:"spine",  radius:0.15 },
  { boneA:"spine",  boneB:"spine1", radius:0.14 },
  { boneA:"spine1", boneB:"spine2", radius:0.16 }, // 胸口一帶通常最寬
  { boneA:"spine2", boneB:"neck",   radius:0.12 },
];
// ---- 腿部膠囊（大腿/小腿各一段，左右各一）：跟 TORSO_CAPSULES 同一套資料格式，
// 讓「手插進大腿/小腿」也能被同一套膠囊碰撞邏輯偵測到，不用另外寫一套演算法。
const LEG_CAPSULES = [
  { boneA:"rUpLeg", boneB:"rLeg",  radius:0.10 }, // 右大腿
  { boneA:"rLeg",   boneB:"rFoot", radius:0.07 }, // 右小腿
  { boneA:"lUpLeg", boneB:"lLeg",  radius:0.10 }, // 左大腿
  { boneA:"lLeg",   boneB:"lFoot", radius:0.07 }, // 左小腿
];
// ---- 頭部障礙物：刻意寫成「boneA===boneB」的退化膠囊（線段長度＝0），
// closestPointOnSegment() 對長度趨近0的線段本來就會直接回傳該點，等同於「點到球心距離」的球體碰撞，
// 完全不用另外寫一套「點 vs 球」的偵測程式碼，跟膠囊共用同一套 solveHandBodyCollision() 邏輯。
const HEAD_CAPSULES = [
  { boneA:"head", boneB:"head", radius:0.12 },
];
// 手部-身體（軀幹+腿+頭）碰撞共用的完整障礙物清單；三個陣列的物件是同一份參照，
// 滑桿改 TORSO_CAPSULES[i].radius 或 LEG_CAPSULES[i].radius 時，這裡看到的也會同步更新，不用重建陣列。
const ALL_BODY_CAPSULES = TORSO_CAPSULES.concat(LEG_CAPSULES, HEAD_CAPSULES);
const ALL_BODY_CAPSULE_RADIUS_DEFAULTS = ALL_BODY_CAPSULES.map(c => c.radius); // 存一份預設值供「恢復預設值」按鈕使用
const HAND_COLLISION_LIMBS = ["rArm", "lArm"]; // 只做手臂，沿用 IK_CHAINS 的 shoulder/root/mid/end 定義

// ---- 雙手互碰（左右手掌互相推開）----
// 跟「手-身體」是獨立開關：身體（軀幹/腿/頭）視為固定障礙物、只推手；
// 雙手互碰則兩隻手都可能移動，視雙方目前是否被IK/拖曳鎖定，決定「兩手各退一半」還是「只推可動的那隻」。
let handHandCollisionEnabled = false;

// ---- 半徑設定的 localStorage 讀寫（跟 JOINT_LIMITS 同一套模式）----
const HAND_COLLISION_RADII_STORAGE_KEY = "tuttingHandCollisionRadii";
function saveHandCollisionRadii(){
  try {
    const data = {
      hand: HAND_COLLISION_RADIUS,
      capsules: TORSO_CAPSULES.map(c => c.radius),
      legCapsules: LEG_CAPSULES.map(c => c.radius),
      headRadius: HEAD_CAPSULES[0].radius
    };
    localStorage.setItem(HAND_COLLISION_RADII_STORAGE_KEY, JSON.stringify(data));
  } catch (e){ console.warn("手部碰撞半徑儲存失敗:", e); }
}
function loadHandCollisionRadii(){
  try {
    const raw = localStorage.getItem(HAND_COLLISION_RADII_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.hand === "number") HAND_COLLISION_RADIUS = data.hand;
    if (Array.isArray(data.capsules)){
      data.capsules.forEach((r, i) => { if (typeof r === "number" && TORSO_CAPSULES[i]) TORSO_CAPSULES[i].radius = r; });
    }
    if (Array.isArray(data.legCapsules)){
      data.legCapsules.forEach((r, i) => { if (typeof r === "number" && LEG_CAPSULES[i]) LEG_CAPSULES[i].radius = r; });
    }
    if (typeof data.headRadius === "number") HEAD_CAPSULES[0].radius = data.headRadius;
  } catch (e){ console.warn("手部碰撞半徑讀取失敗:", e); }
}
loadHandCollisionRadii(); // 開頁就還原使用者上次調過的半徑（若有）

// ---- 共用暫存物件 ----
const _hcHandPos = new THREE.Vector3();
const _hcA = new THREE.Vector3();
const _hcB = new THREE.Vector3();
const _hcAB = new THREE.Vector3();
const _hcAP = new THREE.Vector3();
const _hcClosest = new THREE.Vector3();
const _hcPushDir = new THREE.Vector3();
const _hcTargetPos = new THREE.Vector3();

// 點 p 到線段 (a,b) 的最近點，寫進 outPoint，回傳 outPoint 方便串接使用
function closestPointOnSegment(p, a, b, outPoint){
  _hcAB.copy(b).sub(a);
  const lenSq = _hcAB.lengthSq();
  if (lenSq < 1e-10) return outPoint.copy(a); // a、b幾乎重合，線段退化成一點
  _hcAP.copy(p).sub(a);
  const t = clampNum(_hcAP.dot(_hcAB) / lenSq, 0, 1);
  return outPoint.copy(a).addScaledVector(_hcAB, t);
}

// 每幀呼叫：對每隻「沒開IK、沒被拖曳」的手臂做一次身體（軀幹+腿+頭）碰撞檢查＋回彈。
// 軀幹/腿/頭在這裡一律視為「固定障礙物」——只有手會被推開，不會反過來影響腿/頭的姿勢，
// 這樣才不會跟腿部IK/蹲彈律動/脊椎IK等其他系統互相打架。
function solveHandBodyCollision(){
  if (!handCollisionEnabled || waveRun || isBakedWavePlaying()) return;
  for (const limb of HAND_COLLISION_LIMBS){
    if (ikEnabled[limb]) continue; // 該手已由IK目標球明確指定位置，不跟它搶
    const chain = IK_CHAINS[limb];
    const rootBone = bones[chain.root], midBone = bones[chain.mid], handBone = bones[chain.end];
    if (!rootBone || !midBone || !handBone) continue;
    if (draggingKey === chain.root || draggingKey === chain.mid || draggingKey === chain.end || draggingKey === chain.shoulder) continue;

    handBone.getWorldPosition(_hcHandPos);

    // 找出穿模最深的那一段障礙物（軀幹膠囊／腿部膠囊／頭部退化膠囊，同一套清單一起比較）
    let deepestPenetration = 0;
    let found = false;
    for (const cap of ALL_BODY_CAPSULES){
      const boneA = bones[cap.boneA], boneB = bones[cap.boneB];
      if (!boneA || !boneB) continue;
      boneA.getWorldPosition(_hcA);
      boneB.getWorldPosition(_hcB);
      closestPointOnSegment(_hcHandPos, _hcA, _hcB, _hcClosest);
      const dist = _hcHandPos.distanceTo(_hcClosest);
      const penetration = (cap.radius + HAND_COLLISION_RADIUS) - dist;
      if (penetration > deepestPenetration){
        deepestPenetration = penetration;
        found = true;
        _hcPushDir.copy(_hcHandPos).sub(_hcClosest);
        if (_hcPushDir.lengthSq() < 1e-8) _hcPushDir.set(1, 0, 0); // 剛好在中心線上，隨便挑個方向避免除零
        _hcPushDir.normalize();
        _hcTargetPos.copy(_hcClosest).addScaledVector(_hcPushDir, cap.radius + HAND_COLLISION_RADIUS);
      }
    }
    if (!found) continue;

    // 輕量 CCD：只帶上臂＋前臂兩節，damping調低讓效果像「頂住」而不是「瞬間彈開」
    solveCCDChain([rootBone, midBone], handBone, _hcTargetPos, 3, 0.35);
    syncTargetFromBone(chain.root);
    syncTargetFromBone(chain.mid);
  }
}

// ==== 雙手互碰（防穿模）====
// 跟上面「手-身體」不同：兩隻手都可能是「可動」的一方，不能直接套用同一套「障礙物固定、只推一邊」邏輯。
// 規則：
//   1) 若某隻手已開IK或正被拖曳，視為使用者明確鎖定，這隻手在這裡不會被移動（跟手-身體碰撞同一個原則）。
//   2) 兩隻手都可動時，穿模量各退一半，感覺像兩顆球互相推擠；
//      只有一隻可動時，把可動的那隻整個推到「剛好貼齊另一隻手表面」的位置。
//   3) 兩隻手都被鎖定時完全不處理——代表使用者自己刻意把兩隻手疊在一起，尊重使用者的選擇。
const _hhPosR = new THREE.Vector3();
const _hhPosL = new THREE.Vector3();
const _hhPushDir = new THREE.Vector3();
const _hhTargetR = new THREE.Vector3();
const _hhTargetL = new THREE.Vector3();

function isLimbHandMovable(limb){
  if (ikEnabled[limb]) return false;
  const chain = IK_CHAINS[limb];
  return draggingKey !== chain.root && draggingKey !== chain.mid && draggingKey !== chain.end && draggingKey !== chain.shoulder;
}

// 每幀呼叫：偵測右手掌球與左手掌球是否互相穿模，穿模時各自（或單邊）用輕量CCD推開。
function solveHandHandCollision(){
  if (!handHandCollisionEnabled || waveRun || isBakedWavePlaying()) return;
  const rChain = IK_CHAINS.rArm, lChain = IK_CHAINS.lArm;
  const rHandBone = bones[rChain.end], lHandBone = bones[lChain.end];
  const rRoot = bones[rChain.root], rMid = bones[rChain.mid];
  const lRoot = bones[lChain.root], lMid = bones[lChain.mid];
  if (!rHandBone || !lHandBone || !rRoot || !rMid || !lRoot || !lMid) return;

  const rMovable = isLimbHandMovable("rArm");
  const lMovable = isLimbHandMovable("lArm");
  if (!rMovable && !lMovable) return; // 兩手都鎖定，不介入

  rHandBone.getWorldPosition(_hhPosR);
  lHandBone.getWorldPosition(_hhPosL);
  const minDist = HAND_COLLISION_RADIUS * 2;
  const dist = _hhPosR.distanceTo(_hhPosL);
  if (dist >= minDist) return; // 沒有穿模

  _hhPushDir.copy(_hhPosR).sub(_hhPosL);
  if (_hhPushDir.lengthSq() < 1e-8) _hhPushDir.set(1, 0, 0); // 兩手剛好重合，隨便挑個方向避免除零
  _hhPushDir.normalize();
  const penetration = minDist - dist;

  if (rMovable && lMovable){
    // 兩手都可動：各退穿模量的一半，像兩顆球互相推開
    _hhTargetR.copy(_hhPosR).addScaledVector(_hhPushDir, penetration * 0.5);
    _hhTargetL.copy(_hhPosL).addScaledVector(_hhPushDir, -penetration * 0.5);
  } else if (rMovable){
    // 只有右手可動：把右手整個推到「貼齊左手（固定）表面」的位置
    _hhTargetR.copy(_hhPosL).addScaledVector(_hhPushDir, minDist);
  } else {
    // 只有左手可動
    _hhTargetL.copy(_hhPosR).addScaledVector(_hhPushDir, -minDist);
  }

  if (rMovable){
    solveCCDChain([rRoot, rMid], rHandBone, _hhTargetR, 3, 0.35);
    syncTargetFromBone(rChain.root);
    syncTargetFromBone(rChain.mid);
  }
  if (lMovable){
    solveCCDChain([lRoot, lMid], lHandBone, _hhTargetL, 3, 0.35);
    syncTargetFromBone(lChain.root);
    syncTargetFromBone(lChain.mid);
  }
}

// ==== 手部-軀幹碰撞：膠囊體／手掌球 可視化（除錯用）====
// 純視覺輔助，跟碰撞是否真的生效（handCollisionEnabled）無關——即使沒開碰撞回彈，
// 也可以單獨打開這個可視化，一邊拖滑桿一邊看膠囊體大小/位置對不對，調完再去開回彈。
let handCollisionVizEnabled = false;
let handCollisionVizGroup = null; // 一個 Group，裝所有可視化 mesh，方便整組顯示/隱藏
const handCollisionVizCapsuleMeshes = []; // 跟 ALL_BODY_CAPSULES（軀幹+腿+頭）一一對應
const handCollisionVizHandMeshes = {}; // { rArm: mesh, lArm: mesh }
const HAND_COLLISION_VIZ_EPS = 0.001; // 半徑/長度變化小於這個值就不重建geometry，省掉沒必要的重新配置

function buildHandCollisionVizMeshes(){
  handCollisionVizGroup = new THREE.Group();
  handCollisionVizGroup.visible = false;
  handCollisionVizGroup.renderOrder = 997;

  const capsuleMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, transparent: true, opacity: 0.28,
    depthWrite: false, side: THREE.DoubleSide, wireframe: false
  });
  ALL_BODY_CAPSULES.forEach((cap) => {
    // 先給一個佔位geometry（真正尺寸在 updateHandCollisionVizMeshes() 第一次呼叫時就會依實際骨骼距離重建）
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.01, 4, 8), capsuleMat);
    mesh.userData.builtRadius = 0.01;
    mesh.userData.builtLength = 0.01;
    handCollisionVizCapsuleMeshes.push(mesh);
    handCollisionVizGroup.add(mesh);
  });

  const handMat = new THREE.MeshBasicMaterial({
    color: 0xff9500, transparent: true, opacity: 0.35,
    depthWrite: false, side: THREE.DoubleSide
  });
  for (const limb of HAND_COLLISION_LIMBS){
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), handMat); // 半徑1的單位球，靠 scale 表示實際半徑（球體均勻縮放不會變形，不用重建geometry）
    handCollisionVizHandMeshes[limb] = mesh;
    handCollisionVizGroup.add(mesh);
  }

  scene.add(handCollisionVizGroup);
}

// 每幀呼叫：只在 handCollisionVizEnabled 開啟時才更新位置/朝向/尺寸，關閉時直接跳過省效能。
function updateHandCollisionVizMeshes(){
  if (!handCollisionVizGroup) return;
  handCollisionVizGroup.visible = handCollisionVizEnabled;
  if (!handCollisionVizEnabled) return;

  ALL_BODY_CAPSULES.forEach((cap, i) => {
    const mesh = handCollisionVizCapsuleMeshes[i];
    const boneA = bones[cap.boneA], boneB = bones[cap.boneB];
    if (!boneA || !boneB){ mesh.visible = false; return; }
    mesh.visible = true;
    boneA.getWorldPosition(_hcA);
    boneB.getWorldPosition(_hcB);
    const length = _hcA.distanceTo(_hcB);

    // 半徑或長度變化夠大才重建geometry（CapsuleGeometry沒辦法像球體一樣單純靠scale表示半徑變化，
    // 非等向縮放會把兩端的半球型端蓋拉成橢圓，形狀會跑掉，所以改成必要時才重新配置頂點）
    if (Math.abs(mesh.userData.builtRadius - cap.radius) > HAND_COLLISION_VIZ_EPS ||
        Math.abs(mesh.userData.builtLength - length) > HAND_COLLISION_VIZ_EPS){
      mesh.geometry.dispose();
      mesh.geometry = new THREE.CapsuleGeometry(cap.radius, Math.max(length, 0.001), 4, 8);
      mesh.userData.builtRadius = cap.radius;
      mesh.userData.builtLength = length;
    }

    // CapsuleGeometry預設沿本地Y軸、置中在原點，這裡把它擺到 A、B 中點，並把Y軸轉向 A→B 方向
    mesh.position.copy(_hcA).add(_hcB).multiplyScalar(0.5);
    _hcPushDir.copy(_hcB).sub(_hcA).normalize(); // 借用既有的暫存向量，跟碰撞計算不會同時用到
    if (_hcPushDir.lengthSq() > 1e-8){
      mesh.quaternion.setFromUnitVectors(_stRefY, _hcPushDir);
    }
  });

  for (const limb of HAND_COLLISION_LIMBS){
    const mesh = handCollisionVizHandMeshes[limb];
    const chain = IK_CHAINS[limb];
    const handBone = bones[chain.end];
    if (!handBone){ mesh.visible = false; continue; }
    mesh.visible = true;
    handBone.getWorldPosition(_hcHandPos);
    mesh.position.copy(_hcHandPos);
    mesh.scale.setScalar(HAND_COLLISION_RADIUS); // 單位球均勻縮放＝半徑，形狀不會失真
  }
}

// 它的子孫（Spine1以下），不會改變 Spine 自己相對 Hips 的位置。也就是說
// 「Hips→Spine」這段其實不可彎曲，若把它也算進可及範圍會高估伸展能力，
// 導致平移完之後目標仍在 CCD 真正搆得到的範圍外、無法收斂。
const _srfP1 = new THREE.Vector3();
const _srfP2 = new THREE.Vector3();
const _srfPivotPos = new THREE.Vector3();
const _srfDir = new THREE.Vector3();
const _srfDesired = new THREE.Vector3();
const _srfDelta = new THREE.Vector3();
function solveSpineRootFollow(){
  if (!spineRootFollowEnabled || !spineIKEnabled) return;
  const pivotBone = bones[SPINE_IK_CHAIN.bones[0]]; // spine：CCD鏈第一個真正可旋轉的關節
  if (!pivotBone || !spineIKTargetMesh) return;

  // 只加總「可彎曲」的部分：spine→spine1→spine2→neck→head
  const chainKeys = [...SPINE_IK_CHAIN.bones, SPINE_IK_CHAIN.effector];
  let maxReach = 0;
  const p1 = _srfP1, p2 = _srfP2;
  for (let i = 0; i < chainKeys.length - 1; i++){
    const b1 = bones[chainKeys[i]], b2 = bones[chainKeys[i+1]];
    if (!b1 || !b2) continue;
    b1.getWorldPosition(p1); b2.getWorldPosition(p2);
    maxReach += p1.distanceTo(p2);
  }
  if (maxReach < 1e-6) return;

  const pivotPos = _srfPivotPos; pivotBone.getWorldPosition(pivotPos);
  const targetPos = spineIKTargetMesh.position; // 場景物件 position，只讀不改
  const dist = pivotPos.distanceTo(targetPos);
  const comfortReach = maxReach * 0.92; // 留一點餘裕，避免整條脊椎打直看起來卡住

  if (dist > comfortReach){
    const dirToTarget = _srfDir.copy(targetPos).sub(pivotPos).normalize();
    const desiredPivotPos = _srfDesired.copy(targetPos).sub(dirToTarget.multiplyScalar(comfortReach));
    const delta = _srfDelta.copy(desiredPivotPos).sub(pivotPos);
    model.position.add(delta.multiplyScalar(ROOT_FOLLOW_LERP_T)); // 只前進一部分，跨幀累積平滑過渡
    model.updateWorldMatrix(true, true); // 讓後續量測（含腿部 IK、脊椎 CCD）立刻拿到新座標
  }
}

// 每幀呼叫：脊椎鏈開啟時求解一次，並把結果同步回 target/current（給拍點/JSON 用）
// 骨鏈陣列（SPINE_IK_CHAIN.bones 對應的 Bone 物件）在模型載入完成後就固定不變，
// 不需要每幀重新 map+filter 產生新陣列，第一次用到時快取起來即可。
let _spineChainBonesCache = null;
function solveSpineIK(){
  if (!spineIKEnabled) return;
  if (!_spineChainBonesCache) _spineChainBonesCache = SPINE_IK_CHAIN.bones.map(key => bones[key]).filter(Boolean);
  const chainBones = _spineChainBonesCache;
  const effectorBone = bones[SPINE_IK_CHAIN.effector];
  if (chainBones.length === 0 || !effectorBone || !spineIKTargetMesh) return;

  solveCCDChain(chainBones, effectorBone, spineIKTargetMesh.position, 8, spineCCDDamping);

  for (const key of SPINE_IK_CHAIN.bones) syncTargetFromBone(key);
}

// ---- 頭/胸口 look-at 求解 ----
// 跟脊椎CCD不同：這裡只轉「單一骨骼」自己的朝向，讓local前方軸對準目標，
// 不影響其他骨骼位置。單步精確解（不是迭代逼近），因為單一骨骼只有「朝向」這一個
// 自由度要滿足，一次outer product轉軸就能算出精確解，且是冪等的
// （已對準時再呼叫一次，delta angle會是0，不會產生漂移）。
const _laBoneWorldQuat = new THREE.Quaternion();
const _laWorldForward = new THREE.Vector3();
const _laBonePos = new THREE.Vector3();
const _laTargetDir = new THREE.Vector3();
const _laAxis = new THREE.Vector3();
const _laDeltaQuat = new THREE.Quaternion();
function solveLookAt(name){
  if(solveLAPath(name))return;
  if (!lookAtEnabled[name]) return;
  if(name==="head")updateHeadFollowTarget();
  const cfg = LOOKAT_CONFIG[name];
  const bone = bones[cfg.key];
  const mesh = lookAtTargetMesh[name];
  if (!bone || !mesh) return;

  bone.getWorldQuaternion(_laBoneWorldQuat);
  // cfg.localForward 是設定檔常數向量，不可被 applyQuaternion 就地修改到，一律先 .copy() 出來再操作
  const worldForward = _laWorldForward.copy(cfg.localForward).applyQuaternion(_laBoneWorldQuat).normalize();

  bone.getWorldPosition(_laBonePos);
  const targetDir = _laTargetDir.copy(mesh.position).sub(_laBonePos); // mesh.position 同理，只讀不改
  if (targetDir.lengthSq() < 1e-8) return;
  targetDir.normalize();

  const dot = clampNum(worldForward.dot(targetDir), -1, 1);
  const angle = Math.acos(dot);
  if (angle < 1e-5) return;
  const axis = _laAxis.crossVectors(worldForward, targetDir);
  if (axis.lengthSq() < 1e-12){
    if(dot>0)return;
    axis.crossVectors(worldForward,Math.abs(worldForward.x)<0.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0));
  }
  axis.normalize();

  applyWorldDeltaQuat(bone, _laDeltaQuat.setFromAxisAngle(axis, angle));
  bone.updateWorldMatrix(true, true);
  syncTargetFromBone(cfg.key);
}

// ---- 肩胛骨限幅輔助旋轉（路線B）----
// 不納入兩節封閉解本身，而是在兩節IK求解「前」，讓Shoulder往target方向偏一點點，
// 但強制夾在 SHOULDER_ASSIST_MAX_ANGLE 內——真人鎖骨可動範圍本來就小（聳肩/前伸），
// 夾住角度上限比做完整CCD更貼近真實動作，也不需要額外的關節角度限制系統。
// ---- Effector 朝向控制 ----
// 開關：開啟時，先把目標球的旋轉同步成「目前手掌/腳掌實際世界朝向」，
// 避免目標球預設的單位旋轉(0,0,0,1)一啟用就把手掌轉飛。
function setEffectorOrientEnabled(limb, on){
  if (isFootPlanted(limb)) return;
  if(on&&(limb==='rArm'||limb==='lArm'))setLookAtEnabled(limb==='rArm'?'rHand':'lHand',false);
  effectorOrientEnabled[limb] = on;
  if (on){
    const chain = IK_CHAINS[limb];
    const endBone = bones[chain.end];
    if (endBone){
      const q = new THREE.Quaternion();
      endBone.getWorldQuaternion(q);
      ikTargetMeshes[limb].quaternion.copy(q);
    }
  }
  updateEffectorOrientButtons();
}

function updateEffectorOrientButtons(){
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("orientBtn_" + limb);
    if (btn) btn.classList.toggle("active", effectorOrientEnabled[limb]);
  }
}

// 每幀呼叫（在該肢體兩節IK求解「之後」執行）：把目標球目前的世界旋轉，
// 反推成末端骨骼（手掌/腳掌）該有的本地旋轉，讓它的朝向跟著目標球的旋轉環走。
// 目標球是scene的直接子物件（無父階層旋轉），所以它的quaternion本身就是世界旋轉。
const _aeoParentQuat = new THREE.Quaternion();
function applyEffectorOrientation(limb){
  if (!effectorOrientEnabled[limb]) return;
  const chain = IK_CHAINS[limb];
  const endBone = bones[chain.end];
  const targetMesh = ikTargetMeshes[limb];
  if (!endBone || !endBone.parent || !targetMesh) return;
  endBone.parent.getWorldQuaternion(_aeoParentQuat);
  endBone.quaternion.copy(_aeoParentQuat.invert().multiply(targetMesh.quaternion));
  endBone.updateWorldMatrix(true, true);
  syncTargetFromBone(chain.end);
}


// ---- 肩胛骨限幅輔助旋轉（路線B）----
// 不納入兩節封閉解本身，而是在兩節IK求解「前」，讓Shoulder往target方向偏一點點，
// 但強制夾在 SHOULDER_ASSIST_MAX_ANGLE 內——真人鎖骨可動範圍本來就小（聳肩/前伸），
// 夾住角度上限比做完整CCD更貼近真實動作，也不需要額外的關節角度限制系統。
const _saShoulderPos = new THREE.Vector3();
const _saArmPos = new THREE.Vector3();
const _saRestDir = new THREE.Vector3();
const _saDesiredDir = new THREE.Vector3();
const _saAxis = new THREE.Vector3();
const _saDeltaQuat = new THREE.Quaternion();
function solveShoulderAssist(limb){
  const chain = IK_CHAINS[limb];
  if (!chain.shoulder) return; // 腿沒有shoulder欄位，直接跳過
  const shoulderBone = bones[chain.shoulder];
  const armBone = bones[chain.root];
  if (!shoulderBone || !armBone) return;

  const shoulderPos = _saShoulderPos; shoulderBone.getWorldPosition(shoulderPos);
  const armPos = _saArmPos; armBone.getWorldPosition(armPos);
  const targetPos = ikTargetMeshes[limb].position; // 場景物件 position，只讀不改

  const restDir = _saRestDir.copy(armPos).sub(shoulderPos);
  const desiredDir = _saDesiredDir.copy(targetPos).sub(shoulderPos);
  if (restDir.lengthSq() < 1e-8 || desiredDir.lengthSq() < 1e-8) return;
  restDir.normalize(); desiredDir.normalize();

  const dot = clampNum(restDir.dot(desiredDir), -1, 1);
  let angle = Math.acos(dot);
  if (angle < 1e-5) return;
  angle = Math.min(angle, SHOULDER_ASSIST_MAX_ANGLE); // 關鍵限幅

  const axis = _saAxis.crossVectors(restDir, desiredDir);
  if (axis.lengthSq() < 1e-8) return;
  axis.normalize();

  applyWorldDeltaQuat(shoulderBone, _saDeltaQuat.setFromAxisAngle(axis, angle));
  shoulderBone.updateWorldMatrix(true, true);
  syncTargetFromBone(chain.shoulder);
}

// ---- 雙手同時固定（需 rArm/lArm 的 IK 都開啟 + dualAnchorEnabled）----
// 單手root-follow只做「平移」，兩隻手同時要湊不同的固定點時平移會沒有自由度
// 同時滿足兩個約束，所以改成「旋轉+平移整個角色」：
// 1) 算出「目前左右肩連線方向」該轉到「目前左右目標連線方向」需要的旋轉，
//    繞兩肩中點旋轉整個model（这一步讓身體「轉向」去面對兩個固定點的相對方位）
// 2) 轉完後重新量測肩膀中點，平移讓它對齊兩目標中點
// 3) 之後各手臂仍各自跑一次原本的兩節IK做手肘彎曲細部微調
// 已用Node.js模擬驗證：非對稱的雙目標（不同高度/左右不對稱）也能精確收斂（誤差0.0000）。
const _dhaRShoulderPos = new THREE.Vector3();
const _dhaLShoulderPos = new THREE.Vector3();
const _dhaCurSpan = new THREE.Vector3();
const _dhaTargetSpan = new THREE.Vector3();
const _dhaCurDir = new THREE.Vector3();
const _dhaTargetDir = new THREE.Vector3();
const _dhaAxis = new THREE.Vector3();
const _dhaBodyCenter = new THREE.Vector3();
const _dhaDeltaQuat = new THREE.Quaternion();
const _dhaTargetCenter = new THREE.Vector3();
function solveDualHandAnchor(){
  if (!dualAnchorEnabled || !ikEnabled.rArm || !ikEnabled.lArm) return;
  const rArmBone = bones[IK_CHAINS.rArm.root], lArmBone = bones[IK_CHAINS.lArm.root];
  if (!rArmBone || !lArmBone) return;

  const rShoulderPos = _dhaRShoulderPos; rArmBone.getWorldPosition(rShoulderPos);
  const lShoulderPos = _dhaLShoulderPos; lArmBone.getWorldPosition(lShoulderPos);
  const rTargetPos = ikTargetMeshes.rArm.position; // 場景物件 position，只讀不改
  const lTargetPos = ikTargetMeshes.lArm.position;

  const curSpan = _dhaCurSpan.copy(lShoulderPos).sub(rShoulderPos);
  const targetSpan = _dhaTargetSpan.copy(lTargetPos).sub(rTargetPos);
  if (curSpan.lengthSq() > 1e-8 && targetSpan.lengthSq() > 1e-8){
    const curDir = _dhaCurDir.copy(curSpan).normalize();
    const targetDir = _dhaTargetDir.copy(targetSpan).normalize();
    const dot = clampNum(curDir.dot(targetDir), -1, 1);
    let angle = Math.acos(dot);
    if (angle > 1e-4){
      const axis = _dhaAxis.crossVectors(curDir, targetDir);
      if (axis.lengthSq() > 1e-8){
        axis.normalize();
        angle *= ROOT_FOLLOW_LERP_T; // 只轉一部分，跨幀累積平滑過渡
        const bodyCenter = _dhaBodyCenter.copy(rShoulderPos).add(lShoulderPos).multiplyScalar(0.5);
        const deltaQuat = _dhaDeltaQuat.setFromAxisAngle(axis, angle);
        model.position.sub(bodyCenter);
        model.position.applyQuaternion(deltaQuat);
        model.position.add(bodyCenter);
        model.quaternion.premultiply(deltaQuat);
        model.updateWorldMatrix(true, true);
      }
    }
  }

  // rShoulderPos/lShoulderPos 到這裡已經是舊值（轉動前），重新取一次最新世界座標（沿用同一組暫存物件）
  rArmBone.getWorldPosition(rShoulderPos);
  lArmBone.getWorldPosition(lShoulderPos);
  const bodyCenter2 = _dhaBodyCenter.copy(rShoulderPos).add(lShoulderPos).multiplyScalar(0.5);
  const targetCenter = _dhaTargetCenter.copy(rTargetPos).add(lTargetPos).multiplyScalar(0.5);
  model.position.add(targetCenter.sub(bodyCenter2).multiplyScalar(ROOT_FOLLOW_LERP_T)); // 平移也只前進一部分
  model.updateWorldMatrix(true, true);
}

// ---- 「目前被 IK 接管的關節」集合 ----
// 這份集合就是舊版 isIKDrivenKey() 逐 key 現算的結果，改成「狀態變動時重建一次、
// 之後每幀只做 O(1) 查詢」。
//
// 為什麼值得改：updateBones() 每幀要跑過 ALL_JOINT_KEYS（20 身體 + 30 指節 = 50 個），
// 每個 key 都呼叫一次舊版函式，而舊版每次都要重掃 4 條肢體 + 4 節脊椎鏈 +
// 2 個 look-at + 10 根手指 × 3 節（後兩者還是 Array.includes 線性搜尋）。
// 全開時單一個 key 約 48 次比對，乘上 50 個 key 就是每幀約 2400 次比對。
//
// ⚠️ 正確性前提：ikEnabled / spineIKEnabled / lookAtEnabled / fingerIKEnabled
//    這四個狀態「只能」透過對應的 setXxxEnabled() 修改（目前確實如此，每個狀態
//    都只有一個寫入點）。若之後有人直接改這些變數而沒重建，集合就會失去同步，
//    症狀是某些關節的 FK 該跳過卻沒跳過（IK 跟 FK 每幀互搶同一根骨骼 → 抖動）。
//
// 註：不要拿現成的 markerIKHidden 來替代這份集合——兩者語意不同、內容也不相等。
//    markerIKHidden 是「關節球要不要隱藏」，不含 chain.shoulder，也完全不含 look-at
//    的 head/spine2；這份集合是「FK 要不要跳過」，兩者都要納入，是它的嚴格超集。
const ikDrivenKeys = new Set();

// 律動專用的避讓集合＝ikDrivenKeys ∪「手指IK開著的那隻手掌」。
// 為什麼手掌要另外處理：手臂IK的鏈是 root/mid/shoulder，end（手掌）不在 ikDrivenKeys 裡，
// 因為兩節IK只決定手掌「位置」、不決定它的旋轉，所以手掌轉一轉不會把手拉離目標球——
// 手腕律動跟手臂IK其實可以並存，這是刻意保留的。但手指IK不一樣：它把指節解到世界座標的
// 目標點上，而手掌是那些指節的父節點，律動排在 solveFingerIKAll() 之後才疊加旋轉，
// 會把整組已經解好的手指一起轉走、指尖離開目標。因此只在「該側手指IK開著」時才擋掉手掌。
// 兩個集合分開存而不是共用一份：ikDrivenKeys 的語意是「FK 要不要跳過」，手掌的 FK 一直
// 都該正常運作（手指IK開著時使用者仍然可以自己轉手腕），混在一起會造成行為倒退。
const grooveBlockedKeys = new Set();

// 從四個開關狀態「整份重算」（不是增量更新），所以不管呼叫順序如何都不會累積錯誤。
// 呼叫時機：四個 setXxxEnabled() 內、賦值那一行的正下方（理由見各處註解）。
function rebuildIKDrivenKeys(){
  ikDrivenKeys.clear();
  for (const limb of IK_LIMB_KEYS){
    if (!ikEnabled[limb]) continue;
    const chain = IK_CHAINS[limb];
    ikDrivenKeys.add(chain.root);
    ikDrivenKeys.add(chain.mid);
    if (chain.shoulder) ikDrivenKeys.add(chain.shoulder); // 僅手臂有鎖骨輔助
  }
  if (spineIKEnabled) for (const k of SPINE_IK_CHAIN.bones) ikDrivenKeys.add(k);
  for(const name of Object.keys(LOOKAT_CONFIG))if(lookAtEnabled[name])ikDrivenKeys.add(LOOKAT_CONFIG[name].key);
  for (const fingerId of FINGER_IDS){
    if (!fingerIKEnabled[fingerId]) continue;
    for (const k of FINGER_IK_CHAINS[fingerId].bones) ikDrivenKeys.add(k);
  }

  // 律動避讓集合跟著一起重算（同一個進入點，不會有其中一份忘了更新的可能）。
  grooveBlockedKeys.clear();
  for (const k of ikDrivenKeys) grooveBlockedKeys.add(k);
  for (const fingerId of FINGER_IDS){
    if (!fingerIKEnabled[fingerId]) continue;
    grooveBlockedKeys.add(fingerId.charAt(0) === "r" ? "rHand" : "lHand"); // finger-id 慣例："r"/"l" + 指名
  }
}

// 判斷某個關節 key 目前是否被「開啟中的 IK」接管（root/mid 骨骼），是的話 FK 迴圈要跳過它。
// 保留這個函式名當薄包裝，之後若有其他呼叫端不必跟著改寫。
function isIKDrivenKey(key){ return ikDrivenKeys.has(key); }

// 一般狀態下（未播放拍點）：非拖曳中、且未被 IK 接管的關節用彈簧式 lerp 平滑趨近目標角度
// 非播放狀態下每幀都會對全部（非IK接管的）關節跑一次，是最頻繁的路徑之一，
// 改用共用暫存 Quaternion（eulerToQuat 的 outQuat 參數）+ 原地更新 current[] 陣列的三個數字，
// 不再逐 key 配置新的 Euler/Quaternion/陣列。
function updateBones(){
  if (!model) return false;
  return poseController.updateBones({ draggingKey, drivenKeys: ikDrivenKeys });
}

// ---- 幾何鏡頭：預設視角快照 ----
// 角色面向估計為 +Z（跟 IK_CHAINS 的 poleOffset 註解假設一致）。
// 改用「即時量測模型世界座標包圍盒」來算鏡頭距離／目標點，而不是單純用身高比例粗估——
// 這樣不管目前擺什麼姿勢（例如手臂張開的 T-pose、手腳 IK 拉得很開等），
// 每個預設視角都能保證整個角色都在畫面裡，不會因為身高以外的方向（手展開的寬度等）被裁到。

// 量測模型目前的世界座標包圍盒：改用「收集所有關節骨骼的世界座標再取範圍」而不是
// THREE.Box3().setFromObject(model)——SkinnedMesh 的幾何頂點是綁定姿勢下的原始資料，
// 物件本身的 matrixWorld 不會反映骨骼目前實際的姿勢，直接對它取 Box3 量到的範圍可能
// 跟畫面上實際站著的角色對不上（甚至只量到一小塊），所以改成量測骨骼實際世界位置，
// 再加一點皮膚/服裝的估計留白，準確度更高也更直覺。
// 回傳半寬/半高/半深跟中心點，模型/骨骼還沒準備好時回傳 null
// ---- 包圍盒量測共用暫存 ----
// 這兩支量測函式（全身/單手）在分割視窗開啟時是每隔一小段時間就要跑的路徑，
// 原本每次呼叫都會 new 出 Vector3×2 + Box3，改成模組層級共用物件重複寫入。
// ⚠️ 回傳的 result 物件是「共用的」：呼叫端必須立刻把數值讀走／用掉，
//    不可以存起來跨呼叫使用，否則下一次量測就會把它覆寫掉。
//    （全身與單手各有一份獨立的 result，兩者不會互相污染。）
const _boundsVec = new THREE.Vector3();
const _boundsBox = new THREE.Box3();
const _boundsSize = new THREE.Vector3();
const _bodyBoundsResult = { halfX:0, halfY:0, halfZ:0, center: new THREE.Vector3() };
const _handBoundsResult = { halfX:0, halfY:0, halfZ:0, center: new THREE.Vector3() };

// skipMatrixUpdate=true：呼叫端保證世界矩陣已是最新（例如剛跑完 renderer.render()，
// 或同一批流程開頭已經自己更新過一次），可省掉重複的 model.updateWorldMatrix()。
// 一次要算好幾個視角時，這個旗標讓整批只更新一次而不是每個視角各更新一次。
function getModelBoundsInfo(skipMatrixUpdate){
  if (!model) return null;
  if (!skipMatrixUpdate) model.updateWorldMatrix(true, true);
  const v = _boundsVec;
  const box = _boundsBox.makeEmpty();
  let hasPoint = false;
  for (const key of ALL_JOINT_KEYS){
    const bone = bones[key];
    if (!bone) continue;
    bone.getWorldPosition(v);
    box.expandByPoint(v);
    hasPoint = true;
  }
  // 指尖 effector（比最後一節手指骨更接近真正指尖）也算進去，張開手指時範圍才夠準
  for (const fingerId of FINGER_IDS){
    const eff = fingerEffectorBones[fingerId];
    if (!eff) continue;
    eff.getWorldPosition(v);
    box.expandByPoint(v);
    hasPoint = true;
  }
  if (!hasPoint || box.isEmpty()) return null;
  // 骨骼只是關節中心點，實際外形（頭型、肩寬、腳掌長度等）會再往外一點，
  // 用身高的固定比例抓一個大概的留白，頭頂/腳底再多留一些避免貼邊。
  const pad = modelHeight * 0.09;
  box.min.x -= pad;          box.max.x += pad;
  box.min.y -= pad * 0.7;    box.max.y += pad * 1.4; // 頭頂比腳底需要更多留白
  box.min.z -= pad;          box.max.z += pad;
  box.getSize(_boundsSize);
  box.getCenter(_bodyBoundsResult.center);
  _bodyBoundsResult.halfX = _boundsSize.x/2;
  _bodyBoundsResult.halfY = _boundsSize.y/2;
  _bodyBoundsResult.halfZ = _boundsSize.z/2;
  return _bodyBoundsResult;
}

// 算出「要讓一個半寬 halfW、半高 halfH 的平面完整入鏡」所需的鏡頭距離，
// 同時考慮目前畫面的寬高比（aspect 較窄的直向手機畫面，水平視角會比垂直視角更容易先裁到）。
// marginFactor > 1 用來留一點邊界，避免角色貼著畫面邊緣。
// aspect 可選：不傳時沿用主鏡頭的長寬比（原本的行為）。分割視窗的小 canvas
// 長寬比跟主畫面完全不同（例如主畫面 2.4、預覽視窗 1.6），沿用主鏡頭的值算出來的
// 距離會太近或太遠、把角色裁掉，所以那邊改成傳入該預覽視窗自己的 aspect。
function computeFitDistance(halfW, halfH, marginFactor, aspect){
  const vFovHalf = (camera.fov * Math.PI / 180) / 2;
  const a = (typeof aspect === "number" && aspect > 0) ? aspect : camera.aspect;
  const hFovHalf = Math.atan(Math.tan(vFovHalf) * a);
  const distV = halfH / Math.tan(vFovHalf);
  const distH = halfW / Math.tan(hFovHalf);
  return Math.max(distV, distH) * (marginFactor || 1.45);
}

// 手部特寫用的包圍範圍：只抓該手掌骨本身＋該手5指指尖 effector 的目前世界座標，
// 不像 getModelBoundsInfo() 抓全身，這樣特寫時才不會因為身體其他部位太遠而把手縮得很小。
function getHandBoundsInfo(prefix, skipMatrixUpdate){ // prefix："r" 或 "l"
  if (!model) return null;
  if (!skipMatrixUpdate) model.updateWorldMatrix(true, true);
  const v = _boundsVec;
  const box = _boundsBox.makeEmpty();
  let hasPoint = false;
  const handBone = bones[prefix + "Hand"];
  if (handBone){ handBone.getWorldPosition(v); box.expandByPoint(v); hasPoint = true; }
  for (const fingerId of FINGER_IDS){
    if (fingerId[0] !== prefix) continue; // fingerId 例："rThumb"，第一個字元就是側別
    const eff = fingerEffectorBones[fingerId];
    if (!eff) continue;
    eff.getWorldPosition(v);
    box.expandByPoint(v);
    hasPoint = true;
  }
  if (!hasPoint || box.isEmpty()) return null;
  const pad = modelHeight * 0.04; // 手掌範圍本來就小，留白比例比全身鏡頭小一點即可
  box.min.x -= pad; box.max.x += pad;
  box.min.y -= pad; box.max.y += pad;
  box.min.z -= pad; box.max.z += pad;
  box.getSize(_boundsSize);
  box.getCenter(_handBoundsResult.center);
  _handBoundsResult.halfX = _boundsSize.x/2;
  _handBoundsResult.halfY = _boundsSize.y/2;
  _handBoundsResult.halfZ = _boundsSize.z/2;
  return _handBoundsResult;
}

// 算出「右手特寫」/「左手特寫」鏡頭預設值：以該手掌＋手指目前的世界座標為中心，
// 從「稍微前方、稍微上方、並往身體外側偏一點」的角度拍，比正前方更容易看清手指張合，
// 也比較不會被前臂/身體擋住。外側偏移方向用 hips 骨盆 x 座標跟手掌中心比較後自動判斷
// （而不是直接寫死 r=偏一邊、l=偏另一邊），這樣即使角色擺出交叉手臂之類的姿勢，
// 鏡頭仍會往手實際所在的那一側偏，不會反而拍到手背。
const _handHipsVec = new THREE.Vector3();
const _handDirVec = new THREE.Vector3();
function computeHandCameraPreset(prefix, skipMatrixUpdate){
  const h = modelHeight;
  const info = getHandBoundsInfo(prefix, skipMatrixUpdate);
  if (!info){
    // 模型/骨骼尚未就緒時的退回值，理論上跟全身鏡頭一樣不會真的用到
    const midY = h * 0.55;
    const sideSign = prefix === "r" ? -1 : 1;
    return { pos:[sideSign*h*0.35, midY + h*0.05, h*0.9], target:[sideSign*h*0.2, midY, 0] };
  }
  const { halfX, halfY, halfZ, center } = info;
  const hipsBone = bones.hips;
  let sideSign = prefix === "r" ? -1 : 1;
  if (hipsBone){
    const hv = _handHipsVec;
    hipsBone.getWorldPosition(hv);
    const diff = center.x - hv.x;
    if (Math.abs(diff) > 1e-4) sideSign = Math.sign(diff);
  }
  const sphereR = Math.max(halfX, halfY, halfZ, h * 0.06);
  const dist = computeFitDistance(sphereR, sphereR, 1.9);
  const dir = _handDirVec.set(sideSign * 0.45, 0.4, 1).normalize().multiplyScalar(dist);
  return {
    pos:[center.x + dir.x, center.y + dir.y, center.z + dir.z],
    target:[center.x, center.y, center.z]
  };
}

// 全身類視角（相對於 rhand/lhand 這種手部特寫）的名稱清單
const CAMERA_BODY_VIEW_NAMES = ["front", "back", "left", "right", "top", "iso"];

// 模型/骨骼尚未就緒時的退回值（跟舊版邏輯一致，只是理論上不會真的走到這裡）
function fallbackBodyCameraPreset(name){
  const h = modelHeight;
  const midY = h * 0.55;
  switch (name){
    case "front": return { pos:[0, h*0.75, h*1.6],  target:[0, midY, 0] };
    case "back":  return { pos:[0, h*0.75, -h*1.6], target:[0, midY, 0] };
    case "left":  return { pos:[-h*1.6, h*0.75, 0], target:[0, midY, 0] };
    case "right": return { pos:[h*1.6, h*0.75, 0],  target:[0, midY, 0] };
    case "top":   return { pos:[0.01, h*2.3, 0.01], target:[0, midY, 0] };
    case "iso":   return { pos:[h*1.15, h*0.95, h*1.15], target:[0, midY, 0] };
  }
  return null;
}

// 依「已經量好的包圍盒 info」算出「單一個」全身視角的鏡頭參數。
// 為什麼要拆出來只算一個：分割視窗一次要算好幾個視角，但包圍盒量測
// （getModelBoundsInfo，會遍歷 50 根骨骼＋10 個指尖）是整批共用的成本，
// 不該每個視角各量一次；更不該為了拿「正面」而順便把兩個手部特寫也算出來。
// aspect 可選：分割視窗傳自己那顆小 canvas 的長寬比，取景才不會被裁到。
const _isoDirVec = new THREE.Vector3();
function computeBodyCameraPreset(name, info, aspect){
  if (!info) return fallbackBodyCameraPreset(name);
  const { halfX, halfY, halfZ, center } = info;
  const cx = center.x, cy = center.y, cz = center.z;
  const margin = 1.45;
  switch (name){
    // 正面/背面：鏡頭沿 Z 軸看，畫面裡的「寬」對應模型 X 方向、「高」對應模型 Y 方向
    case "front": case "back": {
      const d = computeFitDistance(halfX, halfY, margin, aspect);
      const sign = name === "front" ? 1 : -1;
      return { pos:[cx, cy, cz + sign*d], target:[cx, cy, cz] };
    }
    // 左側/右側：鏡頭沿 X 軸看，畫面裡的「寬」對應模型 Z 方向（厚度）、「高」對應 Y 方向
    case "left": case "right": {
      const d = computeFitDistance(halfZ, halfY, margin, aspect);
      const sign = name === "right" ? 1 : -1;
      return { pos:[cx + sign*d, cy, cz], target:[cx, cy, cz] };
    }
    // 俯視：由上往下看 XZ 平面，兩個方向都可能被裁到，取較大者保證整個人（含手腳張開的範圍）都入鏡
    case "top": {
      const topHalf = Math.max(halfX, halfZ);
      const d = computeFitDistance(topHalf, topHalf, margin, aspect);
      // x/z 給極小偏移避免正上方 gimbal 問題
      return { pos:[cx + 0.01, cy + d, cz + 0.01], target:[cx, cy, cz] };
    }
    // 45° 斜角：用整體包圍球半徑估算，確保從任何斜角看過去都不會裁到
    case "iso": {
      const sphereR = Math.sqrt(halfX*halfX + halfY*halfY + halfZ*halfZ);
      const d = computeFitDistance(sphereR, sphereR, margin, aspect);
      const dir = _isoDirVec.set(1, 0.82, 1).normalize().multiplyScalar(d);
      return { pos:[cx + dir.x, cy + dir.y, cz + dir.z], target:[cx, cy, cz] };
    }
  }
  return null;
}

// 對外單取入口：只算被要求的那一個視角。
// 「鏡頭」下拉選單一次只切換到一個視角，過去卻要把 8 個視角（含兩次手部特寫、
// 三次完整世界矩陣重算）全部算完再丟掉 7 個——這裡直接取需要的那個就好。
function getCameraPreset(name, aspect, skipMatrixUpdate){
  if (name === "rhand") return computeHandCameraPreset("r", skipMatrixUpdate);
  if (name === "lhand") return computeHandCameraPreset("l", skipMatrixUpdate);
  return computeBodyCameraPreset(name, getModelBoundsInfo(skipMatrixUpdate), aspect);
}

// 保留「一次取得整份」的介面給真的需要全部視角的呼叫端（目前沒有，留作相容用）。
// 這裡自己先更新一次世界矩陣，下面各視角就全部帶 skipMatrixUpdate=true，
// 整批只更新一次而不是每個視角各更新一次。
function getCameraPresets(){
  if (model) model.updateWorldMatrix(true, true);
  const info = getModelBoundsInfo(true);
  const out = {};
  for (const name of CAMERA_BODY_VIEW_NAMES) out[name] = computeBodyCameraPreset(name, info);
  out.rhand = computeHandCameraPreset("r", true);
  out.lhand = computeHandCameraPreset("l", true);
  return out;
}

// 平滑過渡到某個預設視角（不直接瞬間跳，體感較不突兀）；updateCameraTween() 每幀推進。
// instant=true 時直接套用不做過渡動畫（用於初始載入模型時，避免畫面一開始還要飛一段）。
function goToCameraPreset(name, instant){
  const preset = getCameraPreset(name);
  if (!preset || !camera || !controls) return;
  const toPos = new THREE.Vector3(preset.pos[0], preset.pos[1], preset.pos[2]);
  const toTarget = new THREE.Vector3(preset.target[0], preset.target[1], preset.target[2]);
  if (instant){
    camera.position.copy(toPos);
    controls.target.copy(toTarget);
    cameraTween = null;
    return;
  }
  cameraTween = {
    fromPos: camera.position.clone(),
    toPos,
    fromTarget: controls.target.clone(),
    toTarget,
    start: performance.now(),
    duration: 500
  };
}

function updateCameraTween(now){
  if (!cameraTween) return;
  const t = clampNum((now - cameraTween.start) / cameraTween.duration, 0, 1);
  const et = EASINGS.easeInOutQuad(t);
  camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, et);
  controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, et);
  if (t >= 1) cameraTween = null;
}

function bindCameraUI(){
  const sel = document.getElementById("camSelect");
  if (sel) sel.onchange = () => goToCameraPreset(sel.value);
}

// ======================================================================
// 分割視窗（唯讀多視角預覽）— 主視窗（camera/controls/raycaster/TransformControls 等）完全不動，
// 這裡只是額外開幾個小 canvas，各自用自己的相機讀同一個 scene 渲染，跟著主視窗的姿勢即時同步，
// 不接收滑鼠事件、不做選取/拖曳。角度直接沿用 computeBodyCameraPreset()（跟「鏡頭」按鈕同一份邏輯），
// 但取景（重算包圍盒與鏡頭距離）有做節流＋阻尼跟隨，見 updateSplitViewPanes()。
// ======================================================================
const SPLIT_VIEW_MAX_PANES = 3;
const SPLIT_VIEW_NAMES = ["front", "back", "left", "right", "top", "iso"];
const SPLIT_VIEW_LABELS = { front:"正面", back:"背面", left:"左側", right:"右側", top:"俯視", iso:"45°斜角" };
let splitViewPanes = {}; // name -> { root, canvas, renderer, camera }

function createSplitPane(name){
  if (splitViewPanes[name]) return;
  const container = document.getElementById("splitViewPanes");
  if (!container) return;

  const root = document.createElement("div");
  root.className = "splitPane";
  root.dataset.name = name;
  const canvas = document.createElement("canvas");
  const label = document.createElement("div");
  label.className = "splitPaneLabel";
  label.textContent = SPLIT_VIEW_LABELS[name] || name;
  root.appendChild(canvas);
  root.appendChild(label);
  container.appendChild(root);

  const paneRenderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  paneRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // 預覽視窗解析度不用跟主視窗一樣高，省效能
  paneRenderer.outputColorSpace = THREE.SRGBColorSpace;
  const paneCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  splitViewPanes[name] = {
    root, canvas, renderer: paneRenderer, camera: paneCamera,
    // 取景狀態：desired＝最近一次重新取景算出的目標；cur＝畫面上實際使用的值（每幀朝 desired 阻尼靠近）。
    // framed=false 代表還沒取過景，第一次會直接瞬間套用，不做阻尼（避免鏡頭從原點飛過來）。
    desiredPos: new THREE.Vector3(), desiredTarget: new THREE.Vector3(),
    curPos: new THREE.Vector3(), curTarget: new THREE.Vector3(),
    framed: false
  };
  resizeSplitPane(name);
  invalidateSplitViewFraming(); // 新開的視窗下一幀就先取一次景，不用等節流時間到
  updateSplitViewCheckboxDisabled();
}

function destroySplitPane(name){
  const pane = splitViewPanes[name];
  if (!pane) return;
  pane.renderer.dispose();
  pane.root.remove();
  delete splitViewPanes[name];
  updateSplitViewCheckboxDisabled();
}

function resizeSplitPane(name){
  const pane = splitViewPanes[name];
  if (!pane) return;
  const w = pane.root.clientWidth, h = pane.root.clientHeight;
  if (w === 0 || h === 0) return;
  pane.renderer.setSize(w, h, false);
  pane.camera.aspect = w / h;
  pane.camera.updateProjectionMatrix();
}

function resizeAllSplitPanes(){
  for (const name in splitViewPanes) resizeSplitPane(name);
  // 預覽視窗的 aspect 變了，取景距離要重算，不必等節流時間到
  invalidateSplitViewFraming();
}

// 已開到上限時，把還沒勾選的其他 checkbox 先 disable 掉，避免使用者以為勾了卻沒反應。
// 已勾選的一律強制解鎖（disabled=false）——修正還原上次分割視窗設定時的競態問題：
// createSplitPane() 建立到剛好第3個（滿上限）時會在它自己的 checkbox 還沒被標記勾選前就呼叫到這裡，
// 若只在「未勾選」才更新 disabled，那個 checkbox 就會被誤鎖住，之後即使補上 checked=true 也永遠解不開、
// 使用者會發現有一個分割視窗怎麼取消勾選都沒反應、關不掉。
function updateSplitViewCheckboxDisabled(){
  const activeCount = Object.keys(splitViewPanes).length;
  const atLimit = activeCount >= SPLIT_VIEW_MAX_PANES;
  for (const name of SPLIT_VIEW_NAMES){
    const chk = document.getElementById("splitChk_" + name);
    if (!chk) continue;
    chk.disabled = chk.checked ? false : atLimit;
  }
}

function saveSplitViewState(){
  try { localStorage.setItem("tuttingSplitViewPanes", JSON.stringify(Object.keys(splitViewPanes))); } catch (e) {}
}

function bindSplitViewUI(){
  for (const name of SPLIT_VIEW_NAMES){
    const chk = document.getElementById("splitChk_" + name);
    if (!chk) continue;
    chk.onchange = () => {
      if (chk.checked) createSplitPane(name); else destroySplitPane(name);
      saveSplitViewState();
    };
  }
}

// 從 localStorage 還原上次開啟的預覽視窗（跟其他面板設定一樣的持久化模式）
function loadSplitViewState(){
  let names = [];
  try { names = JSON.parse(localStorage.getItem("tuttingSplitViewPanes")) || []; } catch (e) {}
  names.filter(n => SPLIT_VIEW_LABELS[n]).slice(0, SPLIT_VIEW_MAX_PANES).forEach(name => {
    const chk = document.getElementById("splitChk_" + name);
    if (chk) chk.checked = true; // 先勾選再建立，createSplitPane() 內部判斷是否達上限時才看得到正確的勾選狀態
    createSplitPane(name);
  });
  updateSplitViewCheckboxDisabled();
}

function initSplitView(){
  bindSplitViewUI();
  loadSplitViewState();
}

// ---- 預覽視窗的取景（重新算鏡頭距離）節流 ----
// 過去這裡每一幀都呼叫 getCameraPresets()，而那支函式會連鎖觸發：
//   getModelBoundsInfo()（updateWorldMatrix + 50 根骨骼 + 10 個指尖 getWorldPosition）
//   + computeHandCameraPreset("r")／("l")（各自「又」updateWorldMatrix 一次）
// 等於每幀 3 次完整世界矩陣重算、約 70 次 getWorldPosition、十幾個新物件配置，
// 最後卻只用得到其中最多 3 個視角，而且 rhand/lhand 這兩個手部特寫在分割視窗
// 根本用不到（SPLIT_VIEW_NAMES 裡沒有它們），純屬白算。
//
// 另外一個副作用是體感問題：每幀重新 fit 包圍盒，代表角色一動、包圍盒一變，
// 預覽鏡頭的距離就跟著抖，看起來像鏡頭在微微呼吸。
//
// 改法有兩層：
//  1) 取景（量包圍盒、算距離）降到每 SPLIT_VIEW_REFIT_INTERVAL_MS 一次，而且整批
//     只量一次包圍盒、只更新一次世界矩陣，六個視角共用同一份量測結果。
//  2) 相機不直接跳到新算出的位置，而是每幀用 SPLIT_VIEW_FOLLOW_T 阻尼靠近，
//     所以節流造成的「每 250ms 跳一次」不會被看見，反而比原本更穩。
const SPLIT_VIEW_REFIT_INTERVAL_MS = 250;
const SPLIT_VIEW_FOLLOW_T = 0.15;
let _splitRefitAt = -Infinity;

// 讓下一幀無條件重新取景（開/關預覽視窗、視窗尺寸變動時呼叫）
function invalidateSplitViewFraming(){ _splitRefitAt = -Infinity; }

// animate() 每幀在主畫面渲染完之後呼叫：場景的 matrixWorld 這一幀已經由
// renderer.render() 算好，所以量包圍盒時一律帶 skipMatrixUpdate=true。
function updateSplitViewPanes(now){
  const names = Object.keys(splitViewPanes);
  if (names.length === 0 || !scene) return;
  const t = (typeof now === "number") ? now : performance.now();

  if (t - _splitRefitAt >= SPLIT_VIEW_REFIT_INTERVAL_MS){
    _splitRefitAt = t;
    const info = getModelBoundsInfo(true); // 整批共用這一份量測結果
    for (const name of names){
      const pane = splitViewPanes[name];
      // 每個預覽視窗用自己的 aspect 算取景距離（小 canvas 的長寬比跟主畫面不同）
      const preset = computeBodyCameraPreset(name, info, pane.camera.aspect);
      if (!preset) continue;
      pane.desiredPos.set(preset.pos[0], preset.pos[1], preset.pos[2]);
      pane.desiredTarget.set(preset.target[0], preset.target[1], preset.target[2]);
      if (!pane.framed){ // 第一次取景：瞬間就位，不做阻尼
        pane.curPos.copy(pane.desiredPos);
        pane.curTarget.copy(pane.desiredTarget);
        pane.framed = true;
      }
    }
  }

  for (const name of names){
    const pane = splitViewPanes[name];
    // 防禦性檢查：正常情況一定為 true（量不到包圍盒時 computeBodyCameraPreset 會給退回值），
    // 只有視角名稱不在 CAMERA_BODY_VIEW_NAMES 裡才會是 false，那種情況就別渲染了
    if (!pane.framed) continue;
    pane.curPos.lerp(pane.desiredPos, SPLIT_VIEW_FOLLOW_T);
    pane.curTarget.lerp(pane.desiredTarget, SPLIT_VIEW_FOLLOW_T);
    pane.camera.position.copy(pane.curPos);
    pane.camera.lookAt(pane.curTarget);
    pane.renderer.render(scene, pane.camera);
  }
}

function onResize(){
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  resizeAllSplitPanes(); // 內部會呼叫 invalidateSplitViewFraming()
}

// ======================================================================
// 效能面板（Performance Panel）— 顯示 FPS／單幀耗時／Draw Calls／三角形數，
// 並標示目前是否處於下面「閒置降頻」狀態。面板只負責讀取既有的計時資訊拿來
// 顯示，完全不影響任何運算或渲染邏輯，關閉面板時連 DOM 都不會去更新。
// ======================================================================
const PERF_PANEL_STORAGE_KEY = "tuttingPerfPanelEnabled";
let perfPanelEnabled = true;

const PERF_EMA_ALPHA = 0.12; // 指數移動平均的平滑係數，避免單幀抖動讓數字一直跳

// rAF 回呼頻率：不管這一幀有沒有觸發實際渲染，每次 requestAnimationFrame 都算一次。
let _perfRafLastTime = 0;
let _perfRafEmaMs = 16.7;

// 實際渲染幀率：只有真的呼叫 renderer.render() 才算一次。閒置降頻時這個數字
// 會明顯掉到約 IDLE_RENDER_INTERVAL_MS 對應的 fps，跟上面 rAF 頻率的落差
// 正好就是「閒置降頻機制省下來的量」，方便直接驗證該機制有沒有在運作。
let _perfRenderLastTime = 0;
let _perfRenderEmaMs = 16.7;

let _perfLastDomUpdateAt = 0;
const PERF_DOM_UPDATE_INTERVAL_MS = 250; // DOM 文字更新節流，數字本身每幀都在算，只是畫面沒必要每幀都重繪文字

function initPerfPanel(){
  const chk = document.getElementById("showPerfPanelChk");
  const panel = document.getElementById("perfPanel");
  if (!chk || !panel) return;
  try {
    const raw = localStorage.getItem(PERF_PANEL_STORAGE_KEY);
    perfPanelEnabled = (raw === null) ? true : (raw === "1");
  } catch (e) { perfPanelEnabled = true; }
  chk.checked = perfPanelEnabled;
  panel.style.display = perfPanelEnabled ? "flex" : "none";
  chk.onchange = (e) => {
    perfPanelEnabled = e.target.checked;
    panel.style.display = perfPanelEnabled ? "flex" : "none";
    try { localStorage.setItem(PERF_PANEL_STORAGE_KEY, perfPanelEnabled ? "1" : "0"); } catch (err) {}
  };
}

// 每次 requestAnimationFrame 回呼「一開始」呼叫一次，量測瀏覽器實際排程給我們的頻率。
function perfTickRaf(now){
  if (_perfRafLastTime){
    const dt = now - _perfRafLastTime;
    if (dt > 0 && dt < 1000) _perfRafEmaMs += (dt - _perfRafEmaMs) * PERF_EMA_ALPHA;
  }
  _perfRafLastTime = now;
}

// 只有這一幀真的渲染了才呼叫，量測「畫面實際更新」的頻率。
function perfTickRender(now){
  if (_perfRenderLastTime){
    const dt = now - _perfRenderLastTime;
    if (dt > 0 && dt < 1000) _perfRenderEmaMs += (dt - _perfRenderEmaMs) * PERF_EMA_ALPHA;
  }
  _perfRenderLastTime = now;
}

// idle：是否正處於閒置降頻狀態（由 animate() 傳入，不在這裡重算）。
// didRenderThisFrame：這一幀是否真的跑到 renderer.render()（idle 跳幀時為 false）。
function updatePerfPanelDom(now, idle, didRenderThisFrame){
  if (!perfPanelEnabled) return;
  if (now - _perfLastDomUpdateAt < PERF_DOM_UPDATE_INTERVAL_MS) return;
  _perfLastDomUpdateAt = now;

  const rafFps = _perfRafEmaMs > 0 ? 1000 / _perfRafEmaMs : 0;
  const renderFps = _perfRenderEmaMs > 0 ? 1000 / _perfRenderEmaMs : 0;
  const info = (didRenderThisFrame && renderer) ? renderer.info.render : null;

  const panelEl = document.getElementById("perfPanel");
  const fpsEl = document.getElementById("perfFps");
  const drawEl = document.getElementById("perfDraw");

  const dot = idle ? "🟡" : "🟢";
  if (fpsEl) fpsEl.textContent = `${dot} ${renderFps.toFixed(0)} fps ・ ${_perfRenderEmaMs.toFixed(1)} ms`;
  if (info && drawEl) drawEl.textContent = `DC ${info.calls} ・ Tri ${info.triangles.toLocaleString()}`;
  if (panelEl){
    // 用既有的全站 Tooltip 系統，滑鼠移上去才看得到主循環(rAF)頻率跟閒置狀態說明，平常維持精簡
    panelEl.setAttribute("data-tooltip",
      (idle ? "🟡 閒置降頻中（約10fps）" : "🟢 全速運算中") +
      ` — 主循環(rAF) ${rafFps.toFixed(0)}fps`);
  }
}

// ======================================================================
// 閒置偵測（Idle Detection）— animate() 原本不管畫面是否真的在變化，
// 每秒都無條件把整條 FK/IK/碰撞/渲染 pipeline 跑滿 60 次，對一個「擺姿勢」
// 工具來說，使用者盯著調整的時間通常遠少於畫面靜止的時間，長時間下來對
// CPU、GPU（尤其 antialias render）、筆電風扇、行動裝置電量都是白白的負擔。
//
// 做法：每幀判斷「這一幀有沒有明確理由畫面會不一樣」（isSceneActive）；
// 連續好幾幀都沒有理由變化，就視為進入閒置狀態，把重運算與 render 降頻，
// 而不是整個停格——使用者一旦有輸入（拖曳、播放、轉鏡頭…）馬上就會偵測到
// 並恢復全速，不會有肉眼可查覺的延遲。
// ======================================================================

// current 逼近 target、OrbitControls 阻尼、分割視窗阻尼跟隨都是「指數衰減」，
// 數學上永遠不會精確等於目標值，只能用「差距是否已經小到可視為靜止」來判斷，
// 不能判斷「是否相等」。這裡沿用跟 updateBones() 一樣的閾值精神，只是換成用於相機。
const IDLE_CAMERA_CONVERGE_EPS_SQ = 1e-8; // 位置/目標點差距平方和小於這個值才算已收斂
const _idleLastCamPos = new THREE.Vector3();
const _idleLastCamTarget = new THREE.Vector3();
let _idleCamInited = false;

// 回傳這一幀相機（位置＋看點）是否還在移動中（含 OrbitControls 阻尼滑動、拖曳、滾輪縮放）。
// 呼叫端保證每幀都會呼叫一次（不能因為進入閒置模式就跳過呼叫，否則快照會停在舊值，
// 之後使用者移動相機時第一幀的 delta 會被誤判成一大段瞬移）。
function isCameraStillMoving(){
  if (!_idleCamInited){
    _idleLastCamPos.copy(camera.position);
    _idleLastCamTarget.copy(controls.target);
    _idleCamInited = true;
    return true; // 第一次呼叫（例如剛載入模型），保守視為「還在動」
  }
  const posDeltaSq = camera.position.distanceToSquared(_idleLastCamPos);
  const targetDeltaSq = controls.target.distanceToSquared(_idleLastCamTarget);
  _idleLastCamPos.copy(camera.position);
  _idleLastCamTarget.copy(controls.target);
  return posDeltaSq > IDLE_CAMERA_CONVERGE_EPS_SQ || targetDeltaSq > IDLE_CAMERA_CONVERGE_EPS_SQ;
}

// posesStillMoving：由呼叫端傳入 updateBones() 這一幀的回傳值（避免這裡重算一次）。
// 只要下列任何一項成立，這一幀就必須視為「場景活躍中」，不能被閒置降頻邏輯跳過：
function isSceneActive(posesStillMoving, cameraStillMoving){
  return !!tgPreview || !!waveRun?.playing || !!laPathRun?.playing || kfPlaying                                   // 正在播放關鍵影格
      || groovePreviewEnabled                          // 律動即時預覽開著，姿勢會持續變化
      || draggingKey !== null                           // 使用者正在拖曳某顆關節/IK球
      || (transformControls && transformControls.dragging)
      || (transformControlsIK && transformControlsIK.dragging)
      || (grabBoxCore && grabBoxCore.isDragging())      // 扶握箱專屬控制環正在被拖曳
      || cameraTween !== null                           // 「鏡頭」預設視角補間動畫進行中
      || posesStillMoving                                // current 尚未追上 target（含彈簧式lerp的收尾）
      || cameraStillMoving;                              // 相機位置/看點尚未收斂（含OrbitControls阻尼收尾）
}

const IDLE_THRESHOLD_FRAMES = 30;    // 連續約0.5秒（60fps下）沒有變化才視為進入閒置狀態，避免收斂尾段的抖動被誤判成「又活躍了」
const IDLE_RENDER_INTERVAL_MS = 100; // 閒置狀態下，重運算＋渲染降到約每100ms一次（~10fps）；一有輸入立刻恢復全速
let _idleFrameCount = 0;
let _idleLastRenderAt = 0;

function animate(now){
  requestAnimationFrame(animate);
  tickLAPath(now);
  updateLACustomVisual();
  updatePoleRange();
  updateHandRangeHelper();
  perfTickRaf(now); // 每次 rAF 回呼都要量測，不能因為閒置就跳過（道理跟下面相機收斂判斷一樣）

  // 相機收斂判斷必須「每幀都呼叫」以維持快照正確（見函式內註解），跟是否要降頻無關，成本也很低。
  const cameraStillMoving = isCameraStillMoving();

  let posesStillMoving = kfPlaying; // 播放中永遠視為「還在動」，updateBones() 這幀不會被呼叫到
  if (kfPlaying){
    updateKeyframePlayback(now);
  } else {
    posesStillMoving = updateBones();
    solveSpineRootFollow();
    if (grabBoxCore) grabBoxCore.updateEachFrame();
    solveIKAll();
    solveSpineIK();
    solveLookAt("chest");
    solveLookAt("head");
    for(const name of HAND_AIM_NAMES)solveHandAim(name);
    solveFingerIKAll();
    if (groovePreviewEnabled){
      // 🔧 修正：這裡的律動是排在 solveIKAll()／solveSpineIK()／solveLookAt() 之後跑的，
      // 若某關節正被 IK 接管（例如開著右手 IK 又勾了 rArm 律動），律動會 post-multiply 到
      // 「已經解好的」IK 結果上，把手掌轉離目標球——看起來就是 IK 失效/手一直飄。
      // 傳 grooveBlockedKeys 當 overrideKeys，讓律動主動避開這些關節（語意跟避開軌跡接管的關節一致）。
      // 用 grooveBlockedKeys 而不是 ikDrivenKeys：它多含「手指IK開著的那隻手掌」，
      // 否則腕部律動會把已經解好的手指整組轉離目標點（見該集合上方註解）。
      // 只在預覽路徑做：播放拍點路徑不會呼叫 solveIKAll，那裡的 IK 開關並沒有真的在驅動骨骼，
      // 若也跳過會變成「開著 IK 就播不出律動」的行為倒退。
      applyGroove(now, grooveBlockedKeys, groovePreviewStartTime, false);
      applySquatGroove(now, groovePreviewStartTime, true, undefined, false);
    }
  }

  tickWave(now);
  if (!kfPlaying) solveFootPlant();
  updateFootPlantUI();
  const active = isSceneActive(posesStillMoving, cameraStillMoving);
  _idleFrameCount = active ? 0 : _idleFrameCount + 1;
  const idle = _idleFrameCount > IDLE_THRESHOLD_FRAMES;

  // 閒置中還沒到下一個降頻時間點：這一幀直接跳過碰撞/渲染，省下這幀剩下的所有工作。
  // 上面 FK/IK 已經算過一次（求解本身很快，且下一幀馬上要用最新的 target/current 判斷是否已收斂，
  // 拆出來反而複雜化狀態機），真正貴的是碰撞求解＋DOM更新＋render，所以降頻只作用在這之後。
  if (idle && now - _idleLastRenderAt < IDLE_RENDER_INTERVAL_MS){
    updatePerfPanelDom(now, idle, false); // 這幀沒渲染，仍更新面板讓 rAF fps／閒置狀態即時反映
    return;
  }
  if (idle) _idleLastRenderAt = now;

  solveHandBodyCollision(); // 放在 FK/IK/律動/關鍵影格播放都跑完之後，修正「最終姿勢」，不管姿勢來源是哪裡
  solveHandHandCollision(); // 手-身體修正完之後再處理雙手互碰，避免兩套修正互相覆蓋彼此的結果
  if(!kfPlaying&&HAND_AIM_NAMES.some(n=>lookAtEnabled[n])){
    for(const name of HAND_AIM_NAMES)solveHandAim(name);
    solveFingerIKAll();
  }
  if(!kfPlaying&&headFollowSource!=="free")solveLookAt("head");
  tgTick();
  updateHandCollisionVizMeshes();
  updateMarkers();
  updateSkeletonLines();
  updateOverviewPanel();
  updateJointLimitPanelAngles();
  updateCameraTween(now);
  controls.update();
  renderer.render(scene, camera);
  perfTickRender(now);
  updateSplitViewPanes(now);
  updatePerfPanelDom(now, idle, true);
}

// All declarations are initialized before startup. Model loading remains asynchronous.
const timelinePlayback = createTimelinePlayback({
  get waveClips(){ return waveClips; },
  updateWaveTrackPlayback,
  get beatGridRangeLoop(){ return beatGridRangeLoop; },
  hasBeatGridRange,
  getBeatGridPosePlayheadBeat,
  get beatGridRangeEnd(){ return beatGridRangeEnd; },
  seekRunningPlaybackToBeat,
  get beatGridRangeStart(){ return beatGridRangeStart; },
  get keyframes(){ return keyframes; },
  get kfIndex(){ return kfIndex; },
  set kfIndex(value){ kfIndex = value; },
  get kfStartTime(){ return kfStartTime; },
  set kfStartTime(value){ kfStartTime = value; },
  get bpm(){ return bpm; },
  updateBeatGridPlaybackUI,
  get kfLoop(){ return kfLoop; },
  applyPose,
  applyBodyTransform,
  stopKeyframePlayback,
  get grooveSquatAnchored(){ return grooveSquatAnchored; },
  set grooveSquatAnchored(value){ grooveSquatAnchored = value; },
  updateOnionSkins,
  applyKeyframeFramePose,
  applyGroove,
  applySquatGroove,
  get grooveStartTime(){ return grooveStartTime; },
  updatePlayingKeyframeHighlight,
});

const timelineAudio = createTimelineAudio({
  getAudio: () => document.getElementById("kfAudioEl"),
  getOffset: getKfMusicOffsetSec,
  getBpm: () => bpm,
});
const timelineEditor = createTimelineEditor({
  renderWaveTrack,
  updateMoveLibRangeHint,
  updateKfTotalDurationLabel,
  updateBeatGridPoseInspector,
  bindTimelineReorderHost,
  updateBeatGridGeometry,
  get kfChipEls(){ return kfChipEls; },
  set kfChipEls(value){ kfChipEls = value; },
  get keyframes(){ return keyframes; },
  renderGrooveLoopGhosts,
  updateOnionSkins,
  drawKfWaveform,
  keyframeStartBeat,
  get BEAT_GRID_PX_PER_BEAT(){ return BEAT_GRID_PX_PER_BEAT; },
  get kfMultiSelectMode(){ return kfMultiSelectMode; },
  get kfEditingIndex(){ return kfEditingIndex; },
  get kfMultiSelected(){ return kfMultiSelected; },
  get kfPlaying(){ return kfPlaying; },
  get kfIndex(){ return kfIndex; },
  get kfDragSrcIndex(){ return kfDragSrcIndex; },
  set kfDragSrcIndex(value){ kfDragSrcIndex = value; },
  beginTimelineReorderDrag,
  endTimelineReorderDrag,
  toggleKfMultiSelectItem,
  selectKeyframe,
  renameKeyframeLabel,
  duplicateKeyframe,
  pushHistory,
  IK_CHAINS,
  beginPoseResize,
  scrollKfChipIntoView,
});

const waveform = createWaveform();
const waveformView = createWaveformView(waveform, {
  beatGridTimelineBeats,
  get BEAT_GRID_PX_PER_BEAT(){ return BEAT_GRID_PX_PER_BEAT; },
  beatGridAudioTotalBeats,
  getKfMusicOffsetSec,
  timelineBeatToAudioTime,
  get keyframes(){ return keyframes; },
  keyframeStartBeat,
});

init();
