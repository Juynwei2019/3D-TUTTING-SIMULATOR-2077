import { cleanGrabProject } from "./storage/grab-project.js";
import { jointLabel, jointSearchText, jointCountLabel } from "./i18n/joint-labels.js";
import { bindLanguageUI, onLanguageChange, t, liveText, liveAttribute, liveHTML } from "./i18n/index.js";
import { createFingerTut } from "./fingertut/controller.js";
import { bindTouchTimelineUI } from "./ui/touch-timeline.js";
import { initMobileLayout } from "./ui/mobile-layout.js";
import { createCameraController } from "./scene/camera-controller.js";
import { createSplitView } from "./scene/split-view.js";
import { createSceneSelection } from "./scene/selection.js";
import { createTransformGizmos } from "./scene/transform-gizmos.js";
import { createFloatingPanels } from "./ui/floating-panels.js";
import { createWorkspacePanels } from "./ui/workspace-panels.js";
import { createSceneBootstrap } from "./scene/bootstrap.js";
import { createRigVisuals } from "./scene/rig-visuals.js";
import { createPerformancePanel } from "./scene/performance-panel.js";
import { createAnimationLoop } from "./scene/animation-loop.js";
import { createLibraryDomainController } from "./library/domain-controller.js";
import { createOnionSkin } from "./scene/onion-skin.js";
import { createPoseEditor } from "./timeline/pose-editor.js";
import { createTimelineInspector } from "./ui/timeline-inspector.js";
import { createTimelineReorder } from "./timeline/reorder.js";
import { createTimelineResize } from "./timeline/resize.js";
import { createBeatGrid } from "./ui/beat-grid.js";
import { createTimelineTransport } from "./timeline/transport.js";
import { createPoseInterpolator } from "./timeline/pose-interpolator.js";
import { createTimelineToolbar } from "./ui/timeline-toolbar.js";
import { GROOVE_PRESETS, GROOVE_JOINT_KEYS, GROOVE_SQUAT_DEFAULT, GROOVE_CHAIN_ORDER, GROOVE_ARM_PAIRS, GROOVE_GEN_DISTAL_PROB_FALLBACK, GROOVE_GEN_ENERGY_BUDGET, GROOVE_GEN_DISTAL_ENERGY_BONUS, GROOVE_ARCHETYPES, GROOVE_ARCHETYPE_IDS, WAVE_ROUTE_NODES, WAVE_GAIN_FIELDS, WAVE_DEFAULT, WAVE_SHAPE_HINTS, GROOVE_XFADE_BEATS } from "./motion/definitions.js";
import { createTuttingController } from "./motion/tutting-controller.js";
import { createRandomPoseGenerator } from "./motion/random-pose.js";
import { createWaveController } from "./motion/wave-controller.js";
import { createWaveTrack } from "./timeline/wave-track.js";
import { createGrooveGenerator } from "./motion/groove-generator.js";
import { createGrooveController } from "./motion/groove-controller.js";
import { createSquatController } from "./motion/squat-controller.js";
import { createGroovePanel } from "./ui/groove-panel.js";
import { createGrooveSequence } from "./timeline/groove-sequence.js";
import { createChoreographyGenerator } from "./motion/choreography-generator.js";
import { createLimbController } from "./ik/limb-controller.js";
import { createSpineController } from "./ik/spine-controller.js";
import { createFingerController } from "./ik/finger-controller.js";
import { createFootPlant } from "./ik/foot-plant.js";
import { createPoleEditor } from "./ik/pole-editor.js";
import { createOrientationController } from "./ik/orientation-controller.js";
import { createTrajectoryEditor } from "./motion/trajectory-editor.js";
import { createHandCollision } from "./collision/hand-collision.js";
import { createCollisionView } from "./collision/collision-view.js";
import { createJointOwnership } from "./ik/joint-ownership.js";
import { createTimelineSelection } from "./timeline/selection-clipboard.js";
import { createRangeEditor } from "./timeline/range-editor.js";
import { createPreferences } from "./storage/preferences.js";
import { createRigPreferences } from "./storage/rig-preferences.js";
import { createLibraryStore } from "./library/library-store.js";
import { createLibraryController as createSharedLibraryController } from "./library/library-controller.js";
import { renderLibraryList } from "./ui/library-list.js";
import { createHistory } from "./history/history-controller.js";
import { createSnapshots } from "./history/snapshot.js";
import { createAutosave } from "./storage/autosave.js";
import { createProjectFiles } from "./storage/project-file.js";
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

const preferences = createPreferences(() => localStorage);
const rigPreferences = createRigPreferences(preferences, {
  get JOINT_LIMITS_STORAGE_KEY(){ return JOINT_LIMITS_STORAGE_KEY; },
  get JOINT_LIMIT_KEYS(){ return JOINT_LIMIT_KEYS; },
  get JOINT_LIMITS(){ return JOINT_LIMITS; },
  get ISOLATION_STORAGE_KEY(){ return ISOLATION_STORAGE_KEY; },
  get isolationSettings(){ return isolationSettings; },
  get HAND_COLLISION_RADII_STORAGE_KEY(){ return HAND_COLLISION_RADII_STORAGE_KEY; },
  get HAND_COLLISION_RADIUS(){ return HAND_COLLISION_RADIUS; },
  set HAND_COLLISION_RADIUS(value){ HAND_COLLISION_RADIUS = value; },
  get TORSO_CAPSULES(){ return TORSO_CAPSULES; },
  get LEG_CAPSULES(){ return LEG_CAPSULES; },
  get HEAD_CAPSULES(){ return HEAD_CAPSULES; },
});

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
  rigPreferences.loadJointLimits();
}

function saveJointLimits(){
  rigPreferences.saveJointLimits();
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
  rigPreferences.loadIsolationSettings();
}

function saveIsolationSettings(){
  rigPreferences.saveIsolationSettings();
}

function getGroupWeight(...args){
  return randomPoseGenerator.getGroupWeight(...args);
}

// 單一關節「這次生成有沒有被摸到」的機率，單位0~100（%），沒設定過視為100＝一定摸到。
// 跟分組權重是兩層獨立機制：分組權重決定「這次抽中哪些分組」，關節機率決定「抽中的分組裡，
// 這個特定關節這次要不要真的重骰」——例如「右手臂」被抽中了，肩胛可以設低機率、手掌設高機率，
// 做出「手臂動的時候通常是手掌先動、肩膀比較少跟著大幅擺」這種細節。
function getJointWeight(...args){
  return randomPoseGenerator.getJointWeight(...args);
}

// 加權不放回抽樣：從 pool（分組陣列）依「基準權重」抽出 count 個不重複分組。
function pickWeightedGroupsWithoutReplacement(...args){
  return randomPoseGenerator.pickWeightedGroupsWithoutReplacement(...args);
}

const { clampJointAngles } = createJointLimiter(() => JOINT_LIMITS);

// ==== 動作生成（隨機姿勢生成器）====
// 只在 JOINT_LIMIT_KEYS（全部關節）裡，該軸有「啟用限制」時才隨機取值；
// 沒啟用的軸沒有範圍可取樣，維持目前角度不動。
// 取樣策略＝格點取樣＋偏向極值：比起純連續均勻隨機，這樣角度容易卡在同一批固定刻度、
// 也有一定機率直接貼在min或max（=完全伸直/完全折死），視覺上比較接近tutting那種
// 俐落方正、卡點到位的感覺，而不是軟趴趴的隨意角度。
function sampleAxisAngle(...args){
  return randomPoseGenerator.sampleAxisAngle(...args);
}

// 產生並套用一個隨機姿勢：對 JOINT_LIMIT_KEYS（全部關節）逐一判斷每一軸有沒有啟用限制。
// gridStep/edgeProb 由「關節限制」分頁的兩個輸入框即時讀取，方便你邊調參數邊按「動作生成」試感覺。
function generateRandomPose(...args){
  return randomPoseGenerator.generateRandomPose(...args);
}

// ---- 律動模式：預設每個「可參與律動」關節的振盪參數（簡化版）----
// 使用者只勾選要不要參與，軸向/強度/波形/拍速倍率/相位一律用這裡的預設值——
// 之後如果要開放使用者自行微調，數值來源就是這份表，UI再加滑桿即可，不用動運算邏輯。
// axis：疊加旋轉套在哪個本地軸；amp：振幅（度）；freq：每一拍振盪幾次；
// phase：相位偏移（0~1，同一時間點不同關節錯開，做出「一節一節跟著甩」的律動感）；
// wave："bounce"＝單向彈跳（0→amp→0，像蹲下再彈起，適合膝蓋/骨盆/脊椎)，
//       "sine"＝正弦來回擺（-amp→+amp，適合肩膀/頭部這類左右/前後擺動的部位）。



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

let grooveSquatEnabled = false; // 預設關閉：這是全新機制，不希望舊使用者一開檔案就多一個沒設定過的位移效果
let grooveSquatCustom = {};     // 使用者自訂覆寫（只存改過的欄位），跟 grooveCustomParams 同一套設計哲學

function getGrooveSquatParams(...args){
  return squatController.getGrooveSquatParams(...args);
}

// 讀檔容錯：過濾格式不對的自訂欄位，避免壞資料讓蹲彈算出 NaN 或非法波形。
function sanitizeGrooveSquatCustomEntry(...args){
  return squatController.sanitizeGrooveSquatCustomEntry(...args);
}

// ---- 律動模式：使用者自訂覆寫 ----
// 只存「使用者改過的欄位」，例如 { rArm: { amp:8 } }；沒改過的欄位/關節一律沿用 GROOVE_PRESETS。
// 好處：想恢復某關節的預設值時直接刪掉這個 key 即可，不用另外維護一份「原始值備份」。
let grooveCustomParams = {};

// 取得某關節「目前實際生效」的律動參數＝預設值疊上使用者自訂覆寫（只覆寫有改過的欄位）。
// UI 編輯面板／即時預覽／播放疊加(applyGroove) 三處全部只透過這個函式讀參數，
// 避免各自讀不同來源，導致面板顯示的跟實際套用的對不起來。
function getGrooveParams(...args){
  return grooveController.getGrooveParams(...args);
}

// 匯入/還原自動存檔時，過濾掉格式不對的自訂欄位（例如手動改壞的 JSON），
// 避免壞資料流進 grooveCustomParams 之後在 applyGroove() 算出 NaN 或非法軸向。
function sanitizeGrooveCustomEntry(...args){
  return grooveController.sanitizeGrooveCustomEntry(...args);
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
function grooveWarmupRamp(...args){
  return grooveController.grooveWarmupRamp(...args);
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

// 左右成對的手臂關節；lag 是相對鏈條末端再往外傳的額外延遲（肩→上臂→前臂→手掌）。
// distal:true 的那兩節（前臂/手掌）是「整組一起決定要不要參與」的遠端節——由原型的
// distalProb 擲一次骰決定，不逐節各擲，否則會出現「手掌在動、前臂卻僵住」這種
// 運動鏈斷掉的怪結果。ampScale 讓振幅沿鏈往外遞減，理由同 GROOVE_PRESETS 註解。

// 原型沒填 distalProb 時的保底值（例如手改過的設定物件），維持「偶爾才帶到手腕」的語意。

// 總能量預算：所有參與關節振幅絕對值的總和上限（度）。超過就整組等比例縮小——
// 沒有這道閘門，隨機抽到的 8~10 個關節各自 5~6 度疊起來，看起來會像抽搐而不是律動。

// 帶到前臂/手腕時額外放寬的預算：這個上限本來是照「軀幹鏈＋肩＋上臂」十個關節抓的，
// 直接沿用會讓「有帶手腕的那幾組」整體被壓小約四分之一，聽起來像懲罰使用者多勾兩節。
// 遠端兩節的振幅本身已經先乘過 ampScale 衰減，加這一點額度剛好抵銷它們佔用的份額，
// 讓「有沒有帶到手腕」只改變動作的細節密度，不改變整段律動的力度。


// 可重現的偽隨機（mulberry32）：同一個 seed 必定生成同一組律動，
// 所以 seed 可以存進律動庫項目、可以手動輸入重現、也可以分享給別人。
function makeGrooveRng(...args){
  return grooveGenerator.makeGrooveRng(...args);
}

// 依「關節限制」分頁的設定算出某關節某軸可用的最大振幅（度）。
// 律動是以目前姿勢為中心來回擺，所以能用的對稱擺幅＝min(|min|,|max|)。
// 該軸沒啟用限制就回傳 null＝不設限（維持既有「限制沒開就完全自由」的語意）。
// 註：這道限制只作用在「生成階段」，不是在 applyGroove 裡夾——因為 JOINT_LIMITS 是相對
// rest pose 的歐拉角，而律動是 post-multiply 疊在「已經擺好的姿勢」上，兩者座標基準不同，
// 在播放期硬夾會夾錯東西。生成階段夾則語意正確：它限制的是「這組律動參數本身有多大」。
function grooveAmpLimitFor(...args){
  return grooveGenerator.grooveAmpLimitFor(...args);
}

// 風格原型：生成器的機率分佈來源。原型決定分佈，亂數只在分佈內取值——
// 這樣「同風格重抽 10 次」得到的是同一種律動的 10 個變體，而不是 10 種不相干的東西。
// 概念上等同「動作生成」的 Isolation 分組加權，只是加權的對象換成律動的結構參數。



// 生成出來（或從律動庫套用進來）的那組律動的來源資訊，供 UI 顯示 seed／存進律動庫項目。
// 使用者一旦手動改過任何律動欄位就清成 null——meta 宣稱「這組等於 seed X 生成的結果」，
// 手改過之後就不再成立，留著會變成假資訊。
let grooveLastGenMeta = null;

// 依原型與 seed 生成一整組律動設定。回傳形狀＝captureCurrentGrooveConfig() + meta。
function generateGrooveConfig(...args){
  return grooveGenerator.generateGrooveConfig(...args);
}

// 自動命名：帶上原型短名與 seed 的 base36 尾碼，庫裡一整排自動生成的項目才分得出誰是誰。
function grooveGenAutoName(...args){
  return grooveGenerator.grooveGenAutoName(...args);
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
function isFootPlanted(...args){
  return footPlantController.isFootPlanted(...args);
}
function calibrateFootGround(...args){
  return footPlantController.calibrateFootGround(...args);
}
function captureFootPlant(...args){
  return footPlantController.captureFootPlant(...args);
}
function setFootPlantEnabled(...args){
  return footPlantController.setFootPlantEnabled(...args);
}
function updateFootPlantUI(...args){
  return footPlantController.updateFootPlantUI(...args);
}
function solveFootPlant(...args){
  return footPlantController.solveFootPlant(...args);
}
function snapshotFootPlant(...args){
  return footPlantController.snapshotFootPlant(...args);
}
function restoreFootPlant(...args){
  return footPlantController.restoreFootPlant(...args);
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
function poleMid(...args){
  return poleEditorController.poleMid(...args);
}
function poleRadius(...args){
  return poleEditorController.poleRadius(...args);
}
function snapshotPoleEditor(...args){
  return poleEditorController.snapshotPoleEditor(...args);
}
function restorePoleEditor(...args){
  return poleEditorController.restorePoleEditor(...args);
}
// Reposition along the SAME solver-side direction, preserving its bend plane.
function alignPoleInRadius(...args){
  return poleEditorController.alignPoleInRadius(...args);
}
function updatePoleRadiusUI(...args){
  return poleEditorController.updatePoleRadiusUI(...args);
}
function bindPoleRadiusUI(...args){
  return poleEditorController.bindPoleRadiusUI(...args);
}
function beginPoleDrag(...args){
  return poleEditorController.beginPoleDrag(...args);
}
function clampPoleDrag(...args){
  return poleEditorController.clampPoleDrag(...args);
}
function updatePoleRange(...args){
  return poleEditorController.updatePoleRange(...args);
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
function tgConflict(...args){
  return tuttingController.tgConflict(...args);
}
function tgSay(...args){
  return tuttingController.tgSay(...args);
}
function tgDrawPose(...args){
  return tuttingController.tgDrawPose(...args);
}
function tgCancelPreview(...args){
  return tuttingController.tgCancelPreview(...args);
}
function tgClear(...args){
  return tuttingController.tgClear(...args);
}
function tgRuleSignature(...args){
  return tuttingController.tgRuleSignature(...args);
}
function tgCapture(...args){
  return tuttingController.tgCapture(...args);
}
function tgGenerate(...args){
  return tuttingController.tgGenerate(...args);
}
function tgValidCandidate(...args){
  return tuttingController.tgValidCandidate(...args);
}
function tgShow(...args){
  return tuttingController.tgShow(...args);
}
function tgTick(...args){
  return tuttingController.tgTick(...args);
}
function tgCommit(...args){
  return tuttingController.tgCommit(...args);
}
function tgReadSettings(...args){
  return tuttingController.tgReadSettings(...args);
}
function tgUI(...args){
  return tuttingController.tgUI(...args);
}
function tgConfigUI(...args){
  return tuttingController.tgConfigUI(...args);
}
function snapshotTG(...args){
  return tuttingController.snapshotTG(...args);
}
function restoreTG(...args){
  return tuttingController.restoreTG(...args);
}
function snapshotGenerationRules(...args){
  return tuttingController.snapshotGenerationRules(...args);
}
function restoreGenerationRules(...args){
  return tuttingController.restoreGenerationRules(...args);
}
function bindTG(...args){
  return tuttingController.bindTG(...args);
}

// WAVING track: independent clips; sampled motion stays private to each clip.
let waveClips = [], waveClipSelected = null;
let waveTrackActive = false;
const waveClone = value => JSON.parse(JSON.stringify(value));
function syncWaveTrackTarget(...args){
  return waveTrackController.syncWaveTrackTarget(...args);
}
function waveTrackEnd(...args){
  return waveTrackController.waveTrackEnd(...args);
}
function wavePlaybackEnd(...args){
  return waveTrackController.wavePlaybackEnd(...args);
}
function waveTrackMessage(...args){
  return waveTrackController.waveTrackMessage(...args);
}
function waveClipOverlap(...args){
  return waveTrackController.waveClipOverlap(...args);
}
function waveSnap(...args){
  return waveTrackController.waveSnap(...args);
}
function waveClipWeight(...args){
  return waveTrackController.waveClipWeight(...args);
}
function cleanWaveClips(...args){
  return waveTrackController.cleanWaveClips(...args);
}
function waveBaseAtBeat(...args){
  return waveTrackController.waveBaseAtBeat(...args);
}
function applyWaveTrackAtBeat(...args){
  return waveTrackController.applyWaveTrackAtBeat(...args);
}
function updateWaveTrackPlayback(...args){
  return waveTrackController.updateWaveTrackPlayback(...args);
}
function selectWaveClip(...args){
  return waveTrackController.selectWaveClip(...args);
}
function editWaveClip(...args){
  return waveTrackController.editWaveClip(...args);
}
function deleteWaveClip(...args){
  return waveTrackController.deleteWaveClip(...args);
}
function duplicateWaveClip(...args){
  return waveTrackController.duplicateWaveClip(...args);
}
function loadWaveClipSettings(...args){
  return waveTrackController.loadWaveClipSettings(...args);
}
function layoutWaveTrack(...args){
  return waveTrackController.layoutWaveTrack(...args);
}
function renderWaveTrack(...args){
  return waveTrackController.renderWaveTrack(...args);
}
function bindWaveTrack(...args){
  return waveTrackController.bindWaveTrack(...args);
}

// Arm Wave: deterministic travelling pulse, relative to a captured base pose.

function waveIsRelay(...args){
  return waveController.waveIsRelay(...args);
}
function waveHasBody(...args){
  return waveController.waveHasBody(...args);
}
function waveBounds(...args){
  return waveController.waveBounds(...args);
}
function waveLocalIndex(...args){
  return waveController.waveLocalIndex(...args);
}
function waveSides(...args){
  return waveController.waveSides(...args);
}
function waveRouteLength(...args){
  return waveController.waveRouteLength(...args);
}
function waveNodes(...args){
  return waveController.waveNodes(...args);
}
function updateWaveRouteUI(...args){
  return waveController.updateWaveRouteUI(...args);
}
function waveDurationSeconds(...args){
  return waveController.waveDurationSeconds(...args);
}
function updateWaveTiming(...args){
  return waveController.updateWaveTiming(...args);
}
function setWaveSpeed(...args){
  return waveController.setWaveSpeed(...args);
}

function seekWave(...args){
  return waveController.seekWave(...args);
}

let waveConfig={...WAVE_DEFAULT},waveRun=null;
function cleanWave(...args){
  return waveController.cleanWave(...args);
}

function wavePulse(...args){
  return waveController.wavePulse(...args);
}
// A bipolar packet fits both lobes into the original [-width, +width] support.
// Orient by travel direction so polarity controls temporal order on either pass.
function waveValue(...args){
  return waveController.waveValue(...args);
}
function wavePosition(...args){
  return waveController.wavePosition(...args);
}
function waveConflict(...args){
  return waveController.waveConflict(...args);
}
function waveUI(...args){
  return waveController.waveUI(...args);
}
// Body Wave owns temporary leg compensation; manual IK settings remain untouched.
function captureWaveFeet(...args){
  return waveController.captureWaveFeet(...args);
}
function solveWaveFeet(...args){
  return waveController.solveWaveFeet(...args);
}
function stopWave(...args){
  return waveController.stopWave(...args);
}
function startWave(...args){
  return waveController.startWave(...args);
}
function tickWave(...args){
  return waveController.tickWave(...args);
}
// Bake actual bone rotations (preview deliberately does not write target/current).
function captureWaveTimelinePose(...args){
  return waveController.captureWaveTimelinePose(...args);
}
function waveBakePlan(...args){
  return waveController.waveBakePlan(...args);
}
function bakeWaveToTimeline(...args){
  return waveController.bakeWaveToTimeline(...args);
}

function applyBakedWaveFeet(...args){
  return waveController.applyBakedWaveFeet(...args);
}
function isBakedWavePlaying(...args){
  return waveController.isBakedWavePlaying(...args);
}

function restoreWave(...args){
  return waveController.restoreWave(...args);
}
function bindWave(...args){
  return waveController.bindWave(...args);
}


function init(...args){
  return sceneBootstrapController.init(...args);
}

function loadModel(...args){
  return sceneBootstrapController.loadModel(...args);
}

// 必須在套用任何姿勢之前（緊接在 restQuat 算完之後）就複製，這樣殘影骨架的初始本地旋轉
// 才會等於真正的 bind pose，之後直接沿用主模型的 restQuat 幫殘影套姿勢即可，不用另外存一份。
function buildOnionGhosts(...args){
  return onionSkinController.buildOnionGhosts(...args);
}

// 把某份殘影骨架套成某個拍點(kf)記錄的角度＋身體位置
function poseGhostFromKeyframe(...args){
  return onionSkinController.poseGhostFromKeyframe(...args);
}

// 是否目前正在看「時間軸」分頁——只有在這個分頁殘影才有意義，切到別的分頁（例如手腳IK）
// 顯示兩層半透明殘影反而會干擾操作，所以離開時自動隱藏。
function isKeyframeTabActive(...args){
  return onionSkinController.isKeyframeTabActive(...args);
}

// 決定殘影目前該不該顯示、顯示哪個拍點的姿勢。呼叫時機：拍點清單重繪時（見
// renderKeyframeChips 尾端）與切換分頁時（見 switchTab），涵蓋新增/更新/刪除/選取拍點、
// Undo/Redo、自動存檔還原、拍點播放開始/結束等幾乎所有會影響「目前選取拍點」的情況；
// 播放中則額外由 updateKeyframePlayback() 在每次換到下一個過渡區段時呼叫一次（見該函式），
// 不是每幀都呼叫——播放中殘影姿勢只在「跨到下一拍」那一刻才會變，沒必要逐幀重算。
function updateOnionSkins(...args){
  return onionSkinController.updateOnionSkins(...args);
}

// 播放模式下的殘影：此時主模型本身正在 frameA(=keyframes[kfIndex]) → frameB(=keyframes[kfIndex+1])
// 之間即時補間，這兩拍不需要殘影（模型正在顯示它們之間的過渡姿勢），所以殘影改往「再更外一層」
// 顯示：prev＝過渡起點的前一拍、next＝過渡終點的後一拍，讓使用者能預先看到動作接下來會往哪個
// 方向甩，形成一段可視化的動作軌跡，而不是編輯模式那種「單一拍點的前後對照」。
function updateOnionSkinsForPlayback(...args){
  return onionSkinController.updateOnionSkinsForPlayback(...args);
}

// ---- 關節球（直接掛在骨骼上的可點擊 marker） ----
function buildJointMarkers(...args){
  return rigVisualsController.buildJointMarkers(...args);
}

// 共用暫存向量，避免每幀呼叫都 new 一個新的 Vector3（跟碰撞/CCD等熱路徑同一套習慣）。

function updateMarkers(...args){
  return rigVisualsController.updateMarkers(...args);
}

// ---- 骨架連線（把有追蹤的關節依真實骨骼親子關係連成一條條線段）----
// 不是每個 ALL_JOINT_KEYS 的骨骼在模型階層裡都直接互為親子（例如中間可能夾著沒被追蹤的
// 輔助骨），所以每個關節往上找「最近一個也在 bones{} 追蹤清單裡的祖先」當作連線對象，
// 而不是直接假設 bone.parent 一定也是我們認得的 key。
function buildSkeletonLines(...args){
  return rigVisualsController.buildSkeletonLines(...args);
}

function updateSkeletonLines(...args){
  return rigVisualsController.updateSkeletonLines(...args);
}

// 切換「身體」或「手部」關節球分類的顯示開關；實際可見與否在 updateMarkers() 每幀合併 IK 隱藏狀態計算
function setJointCategoryVisible(...args){
  return rigVisualsController.setJointCategoryVisible(...args);
}

function highlightMarkers(...args){
  return rigVisualsController.highlightMarkers(...args);
}

// ---- 關節總覽面板：即時列出全部關節的旋轉角度（相對初始姿勢）與世界座標 ----
// 設計取捨：面板本身只在切到這個分頁時才逐幀更新文字內容（見 updateOverviewPanel 開頭的
// active 檢查），避免每個關節×6個數字×60fps 一直寫在使用者根本沒看的隱藏分頁上浪費效能。
function ovMatchesFilter(key){
  const input = document.getElementById("ovFilterInput");
  const kw = (input && input.value ? input.value : "").trim().toLowerCase();
  if (!kw) return true;
  const label = jointSearchText(key);
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
      liveText(nameEl,()=>jointLabel(key));
      liveAttribute(nameEl,"title",()=>jointLabel(key));

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
    liveHTML(head,()=>`<span><span class="ovCaret">▾</span>${t(group.label)}</span><span class="ovCount">${jointCountLabel(body.children.length)}</span>`);
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
function buildIKMarkers(...args){
  return limbController.buildIKMarkers(...args);
}

// 把某肢體的目標球／極向球對齊「目前姿勢」算出的預設位置（開啟 IK 當下、或按重置時呼叫，避免瞬間跳動）
function syncIKMarkersToDefault(...args){
  return limbController.syncIKMarkersToDefault(...args);
}

// ---- 脊椎 IK 目標球（藍色實心球）----
function buildSpineIKMarker(...args){
  return spineController.buildSpineIKMarker(...args);
}

// 把脊椎目標球對齊「目前姿勢」頭部所在的世界座標（開啟當下、或按重置時呼叫，避免瞬間跳動）
function syncSpineIKMarkerToDefault(...args){
  return spineController.syncSpineIKMarkerToDefault(...args);
}

// 開關脊椎 IK：開啟時鎖住 Spine/Spine1/Spine2/Neck（隱藏它們的關節球，改由 CCD 求解），
// Head 自己的旋轉仍保留 FK 可調整（跟手腳 IK 保留末端 FK 是同樣設計）。
function setSpineIKEnabled(...args){
  return spineController.setSpineIKEnabled(...args);
}

function calibrateHandAim(...args){
  return orientationController.calibrateHandAim(...args);
}
function handAimAxis(...args){
  return orientationController.handAimAxis(...args);
}
function captureHandAim(...args){
  return orientationController.captureHandAim(...args);
}
function handFollowDirection(...args){
  return orientationController.handFollowDirection(...args);
}
function updateHandFollowUI(...args){
  return orientationController.updateHandFollowUI(...args);
}
function bindHandFollowUI(...args){
  return orientationController.bindHandFollowUI(...args);
}

// Single-part editor preview. Only configuration is persisted; playback never auto-starts.
function sampleLACustom(...args){
  return orientationController.sampleLACustom(...args);
}
function laCustomCenter(...args){
  return orientationController.laCustomCenter(...args);
}
function selectLACustom(...args){
  return orientationController.selectLACustom(...args);
}
function renderLACustomList(...args){
  return orientationController.renderLACustomList(...args);
}
function rebuildLACustomMeshes(...args){
  return orientationController.rebuildLACustomMeshes(...args);
}
function mutateLACustom(...args){
  return orientationController.mutateLACustom(...args);
}
function updateLACustomVisual(...args){
  return orientationController.updateLACustomVisual(...args);
}
function dragLACustom(...args){
  return orientationController.dragLACustom(...args);
}
function bindLACustom(...args){
  return orientationController.bindLACustom(...args);
}

function cleanLAPath(...args){
  return orientationController.cleanLAPath(...args);
}
function laPathPoint(...args){
  return orientationController.laPathPoint(...args);
}
function updateLAPathUI(...args){
  return orientationController.updateLAPathUI(...args);
}
function stopLAPath(...args){
  return orientationController.stopLAPath(...args);
}
function startLAPath(...args){
  return orientationController.startLAPath(...args);
}
function tickLAPath(...args){
  return orientationController.tickLAPath(...args);
}
function solveLAPath(...args){
  return orientationController.solveLAPath(...args);
}
function restoreLAPath(...args){
  return orientationController.restoreLAPath(...args);
}
function bindLAPath(...args){
  return orientationController.bindLAPath(...args);
}

function solveHandAim(...args){
  return orientationController.solveHandAim(...args);
}
// Limits are an editor interaction constraint, not a change to the animation solver.
function validHandRange(...args){
  return orientationController.validHandRange(...args);
}
function clampHandRangePoint(...args){
  return orientationController.clampHandRangePoint(...args);
}
function handRangeDirection(...args){
  return orientationController.handRangeDirection(...args);
}
function alignHandRange(...args){
  return orientationController.alignHandRange(...args);
}
function beginHandRangeDrag(...args){
  return orientationController.beginHandRangeDrag(...args);
}
function clampHandRangeDrag(...args){
  return orientationController.clampHandRangeDrag(...args);
}
function bindHandRangeUI(...args){
  return orientationController.bindHandRangeUI(...args);
}
function updateHandRangeHelper(...args){
  return orientationController.updateHandRangeHelper(...args);
}

function updateLookAtRangeUI(...args){
  return orientationController.updateLookAtRangeUI(...args);
}
// Follow the actual wrist bone, not the potentially unreachable arm IK target.
function updateHeadFollowTarget(...args){
  return orientationController.updateHeadFollowTarget(...args);
}
function updateHeadFollowUI(...args){
  return orientationController.updateHeadFollowUI(...args);
}
function bindHeadFollowUI(...args){
  return orientationController.bindHeadFollowUI(...args);
}

function snapshotTorsoLookAt(...args){
  return orientationController.snapshotTorsoLookAt(...args);
}
function restoreTorsoLookAt(...args){
  return orientationController.restoreTorsoLookAt(...args);
}

function updateHandAimUI(...args){
  return orientationController.updateHandAimUI(...args);
}
function bindHandAimUI(...args){
  return orientationController.bindHandAimUI(...args);
}
function snapshotHandAim(...args){
  return orientationController.snapshotHandAim(...args);
}
function restoreHandAim(...args){
  return orientationController.restoreHandAim(...args);
}

// ---- 頭/胸口 look-at 目標球（紫色=頭，琥珀色=胸口）----
function buildLookAtMarkers(...args){
  return orientationController.buildLookAtMarkers(...args);
}

// 把 look-at 目標球對齊「目前姿勢下，骨骼往前方軸延伸一小段」的位置，避免開啟當下瞬間跳動
function syncLookAtMarkerToDefault(...args){
  return orientationController.syncLookAtMarkerToDefault(...args);
}

// 開關 look-at：chest 用的骨骼（spine2）也是脊椎CCD鏈的一員，兩者若同時開啟會互搶
// spine2 的旋轉權，所以互斥——開其中一個會自動關掉另一個，避免打架看起來抖動。
function setLookAtEnabled(...args){
  return orientationController.setLookAtEnabled(...args);
}

function updateLookAtButtons(...args){
  return orientationController.updateLookAtButtons(...args);
}

// ==== 手指 IK：目標球（青色小球，跟手腳IK的橘色/黃綠色區分）====
function buildFingerIKMarkers(...args){
  return fingerController.buildFingerIKMarkers(...args);
}

// 把某指的目標球對齊「目前姿勢」指尖(effector)所在的世界座標（開啟當下、或按重置時呼叫，避免瞬間跳動）
function syncFingerIKMarkerToDefault(...args){
  return fingerController.syncFingerIKMarkerToDefault(...args);
}

// 開關某指的IK：開啟時鎖住該指3節（隱藏它們的FK關節球，改由CCD求解），
// 跟手腳/脊椎IK同樣的「開啟時同步target球到目前姿勢位置，避免瞬間跳動」設計。
function setFingerIKEnabled(...args){
  return fingerController.setFingerIKEnabled(...args);
}

function updateFingerIKButtons(...args){
  return fingerController.updateFingerIKButtons(...args);
}

// ---- 手指 FK/IK 面板：一指一列、三節橫排（根/中/末），列尾巴加一顆 IK 切換鈕 ----
// 左右手分兩張卡片，卡片本身在 HTML 裡已放好（#fingerCard_r / #fingerCard_l），這裡只把
// 每指一列 append 進去；完整名稱放 title 屬性做 hover 提示，按鈕文字用短標籤保持可掃描性。
function buildFingerPanel(...args){
  return fingerController.buildFingerPanel(...args);
}

// ---- 關節限制分頁：依 OVERVIEW_GROUPS 分組建立全部關節的限制編輯 UI（可個別收合）----
let jointLimitCurAngleEls = {}; // key -> 標題旁「目前角度」的 <span>，逐幀更新用
let jointLimitGroupCollapsed = {}; // groupId -> bool，記住使用者展開/收合狀態（跟總覽分頁分開記）
let jlAdvancedVisible = false; // 進階設定（格距/貼邊機率/Isolation/每關節機率/分組權重）預設收起來，簡化介面

function jlMatchesFilter(key){
  const input = document.getElementById("jlFilterInput");
  const kw = (input && input.value ? input.value : "").trim().toLowerCase();
  if (!kw) return true;
  const label = jointSearchText(key);
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
      liveText(nameSpan,()=>jointLabel(key));
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
      liveText(weightLabel,()=>t("機率"));
      const weightInput = document.createElement("input");
      weightInput.type = "number"; weightInput.min = "0"; weightInput.max = "100"; weightInput.step = "5";
      weightInput.className = "jlNumInput";
      weightInput.value = getJointWeight(key);
      liveAttribute(weightInput,"aria-label",()=>t("{joint} 生成機率",{joint:jointLabel(key)}));
      liveAttribute(weightInput,"title",()=>t("這個關節「動作生成」時被摸到的機率(0~100)，100＝一定摸到"));
      weightInput.onchange = (e) => {
        const v = parseFloat(e.target.value);
        isolationSettings.jointWeights[key] = (isNaN(v) || v < 0) ? 0 : Math.min(100, v);
        saveIsolationSettings();
      };
      const weightPct = document.createElement("span");
      liveText(weightPct,()=>"%");
      weightRow.append(weightLabel, weightInput, weightPct);
      block.appendChild(weightRow);

      for (const axis of ["x","y","z"]){
        const axisLim = lim[axis];
        const row = document.createElement("div");
        row.className = "jlAxisRow";

        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = axisLim.enabled;
        liveAttribute(chk,"aria-label",()=>t("啟用 {joint} {axis} 限制",{joint:jointLabel(key),axis:axis.toUpperCase()}));

        const axisLabel = document.createElement("span");
        axisLabel.className = "jlAxisLabel";
        liveText(axisLabel,()=>axis.toUpperCase());

        // 沒啟用時把 min~max° 整組收起來，不佔版面；勾選後才展開輸入框。
        const rangeWrap = document.createElement("span");
        rangeWrap.style.display = axisLim.enabled ? "inline-flex" : "none";
        rangeWrap.style.alignItems = "center";
        rangeWrap.style.gap = "4px";

        const minInput = document.createElement("input");
        minInput.type = "number"; minInput.step = "1"; minInput.className = "jlNumInput";
        minInput.value = axisLim.min;
        liveAttribute(minInput,"aria-label",()=>t("{joint} {axis} 最小角度",{joint:jointLabel(key),axis:axis.toUpperCase()}));

        const sep = document.createElement("span");
        sep.className = "jlSep"; liveText(sep,()=>"~");

        const maxInput = document.createElement("input");
        maxInput.type = "number"; maxInput.step = "1"; maxInput.className = "jlNumInput";
        maxInput.value = axisLim.max;
        liveAttribute(maxInput,"aria-label",()=>t("{joint} {axis} 最大角度",{joint:jointLabel(key),axis:axis.toUpperCase()}));

        const deg = document.createElement("span");
        liveText(deg,()=>"°");

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
    liveHTML(leftSpan,()=>`<span class="ovCaret">▾</span>${t(group.label)}`);

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
    liveText(weightLabel,()=>t("權重"));

    const weightInput = document.createElement("input");
    weightInput.type = "number"; weightInput.min = "0"; weightInput.step = "0.5";
    weightInput.value = getGroupWeight(group.id);
    liveAttribute(weightInput,"aria-label",()=>t("{group} Isolation 權重",{group:t(group.label)}));
    weightInput.className = "jlNumInput";
    weightInput.style.width = "36px";
    liveAttribute(weightInput,"title",()=>t("Isolation模式抽中這組的相對權重（數字越大越常被抽中，預設1）"));
    weightInput.onclick = (e) => e.stopPropagation(); // 避免點輸入框連帶觸發標題列的收合
    weightInput.onchange = (e) => {
      const v = parseFloat(e.target.value);
      isolationSettings.weights[group.id] = (isNaN(v) || v < 0) ? 1 : v;
      saveIsolationSettings();
    };

    const countSpan = document.createElement("span");
    countSpan.className = "ovCount";
    liveText(countSpan,()=>jointCountLabel(keys.length));

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
    if (!confirm(t("確定要把全部 {p0} 個關節的限制都恢復成預設（停用）嗎？", {p0:JOINT_LIMIT_KEYS.length}))) return;
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
    liveText(advancedToggleBtn,()=>jlAdvancedVisible ? t("進階設定 ▴") : t("進階設定 ▾"));
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

function solveFingerIKAll(...args){
  return fingerController.solveFingerIKAll(...args);
}

// ==== 軌跡輔助工具 ====
// 場景中每個肢體各自維護一串紫色控制點球（陣列，順序＝路徑順序）+ 一條路徑預覽線。
// 只有「軌跡」分頁目前選取中的 trajActiveLimb 那組球/線會顯示，避免四肢的點混在一起難以分辨。
function buildTrajMarkers(...args){
  return trajectoryEditor.buildTrajMarkers(...args);
}

// 共用輔助：在指定世界座標建立一顆紫色控制點球並掛進場景/陣列（不含後續的視覺重繪/存檔，
// 呼叫端在整批新增完後自己統一呼叫 updateTrajVisual/renderTrajPointList/scheduleAutoSave，
// 避免形狀產生器一次生成 N 個點時重複做 N 次多餘的重繪）。
function createTrajPointAt(...args){
  return trajectoryEditor.createTrajPointAt(...args);
}

// 新增一顆控制點球，直接對齊該肢體目前IK target球的世界座標（明確需求：不要自動偏移/延伸）
function addTrajPoint(...args){
  return trajectoryEditor.addTrajPoint(...args);
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
function generateShapeTrajPoints(...args){
  return trajectoryEditor.generateShapeTrajPoints(...args);
}

// 刪除單一控制點；刪除後把剩餘點的 userData.index 重新編號，保持跟陣列索引一致
function removeTrajPoint(...args){
  return trajectoryEditor.removeTrajPoint(...args);
}

function clearTrajPoints(...args){
  return trajectoryEditor.clearTrajPoints(...args);
}

// 重繪某肢體的路徑預覽線（依目前控制點世界座標 + 該肢體目前的路徑模式）
function updateTrajVisual(...args){
  return trajectoryEditor.updateTrajVisual(...args);
}

// 只顯示目前編輯中肢體(trajActiveLimb)的控制點球/路徑線，其他肢體的資料仍保留在記憶體裡只是隱藏
function updateTrajActiveVisibility(...args){
  return trajectoryEditor.updateTrajActiveVisibility(...args);
}

function setTrajActiveLimb(...args){
  return trajectoryEditor.setTrajActiveLimb(...args);
}

// 封閉路徑checkbox：點數<3時停用（2點封閉只是來回抖動沒意義），並同步目前肢體的勾選狀態。
// 呼叫時機：切換編輯中肢體、每次新增/刪除控制點（renderTrajPointList尾端）。
function updateTrajClosedChkState(...args){
  return trajectoryEditor.updateTrajClosedChkState(...args);
}

function updateTrajLimbButtons(...args){
  return trajectoryEditor.updateTrajLimbButtons(...args);
}

// 軌跡分頁裡的控制點清單（Pxx晶片，可點選/刪除）
function renderTrajPointList(...args){
  return trajectoryEditor.renderTrajPointList(...args);
}

// ---- 純數學取樣函式：不依賴場景中的mesh是否還存在，播放時就是靠這個函式直接算座標 ----
// mode: 'line' | 'curve'；points: THREE.Vector3 或 {x,y,z} 陣列（相對座標）；t: 0~1 進度；
// closed: 是否首尾相連封閉成迴圈（點數<3時強制視為不封閉，2點封閉只是來回抖動沒有意義）

// sampleTrajectoryFromPoints 的即時預覽包裝：讀場景中 trajPointMeshes 目前的world座標
function sampleTrajectory(...args){
  return trajectoryEditor.sampleTrajectory(...args);
}

// 沿目前控制點路徑等間隔取樣 trajSampleCount 個點，每點都當成一次「使用者手動擺好IK再按新增拍點」，
// 依序寫入時間軸；額外把整批共用的軌跡資料（trajId/模式/相對座標/pole/進度t）烘焙進每個拍點的
// kf.traj[limb]，播放時才能不靠取樣密度、直接連續取樣曲線本身（見 updateKeyframePlayback）。
function generateKeyframesFromTrajectory(...args){
  return trajectoryEditor.generateKeyframesFromTrajectory(...args);
}

// ---- 身體移動 ----
// 控制環attach到bodyGizmoProxy（放在Hips世界座標），不是直接attach到model，
// 這樣控制環會出現在髖部附近，比出現在model原點（通常在腳底/地板格線旁）好點選。
// 拖曳時透過 transformControlsIK 的 objectChange 事件把delta套用到 model.position。
// 注意：若手臂/脊椎的 root-follow 或雙手固定同時開啟，animate() 每幀仍會
// 自動用那些機制調整 model.position，但這裡的代理物件位置不會跟著自動同步，
// 可能導致控制環視覺上跟身體實際位置脫節——若發生這種情況，重新按一次
// 「移動身體」即可讓控制環重新對齊。
function selectBodyMarker(...args){
  return sceneSelectionController.selectBodyMarker(...args);
}

function resetBodyTransform(...args){
  return sceneSelectionController.resetBodyTransform(...args);
}

// 開關某肢體的 IK：開啟時鎖住 root/mid 骨骼改由 IK 求解（隱藏它們的關節球），
// 末端骨骼（手掌/腳掌自己的旋轉）仍保留 FK 可調整。
function setIKEnabled(...args){
  return limbController.setIKEnabled(...args);
}

// 抓取「目前」腳掌世界旋轉，存成鎖存基準
function captureFootLock(...args){
  return limbController.captureFootLock(...args);
}

// 每幀呼叫：把腳掌的本地旋轉，反推成「能讓世界旋轉貼住鎖存值」的值。
// 必須在該腿的 solveTwoBoneIK 算完 root/mid 新世界旋轉「之後」執行，
// 這樣才是用本幀最新的父骨骼世界旋轉反推，不會有一幀落差。
function applyFootLock(...args){
  return limbController.applyFootLock(...args);
}

// 核心數學：讓某根骨骼的「世界旋轉」貼住指定的鎖存值，作法是用父骨骼目前的世界旋轉反推出
// 需要的本地旋轉。從 applyFootLock 抽出來，蹲彈律動（applySquatGroove）也需要同一套邏輯，
// 但套用時機/鎖存來源不同（不是靠 ikEnabled 開關），所以拆成不吃開關判斷的純函式共用。
function selectIKMarker(...args){
  return limbController.selectIKMarker(...args);
}

function highlightIKMarkers(...args){
  return limbController.highlightIKMarkers(...args);
}

function updateSpineIKButton(...args){
  return spineController.updateSpineIKButton(...args);
}

function updateIKButtons(...args){
  return limbController.updateIKButtons(...args);
}

function bindGrabBoxUI(){
  if (!grabBoxCore) return;
  mountGrabBoxUI(document.getElementById("tabGrabBox"), grabBoxCore);
}

function bindIKUI(...args){
  return limbController.bindIKUI(...args);
}

// ---- 軌跡分頁 UI 綁定 ----
function bindTrajUI(...args){
  return trajectoryEditor.bindTrajUI(...args);
}

// 形狀產生器（圓形／橢圓形／正多邊形／星形）綁定：跟其他軌跡控制項獨立拆出來，因為切換
// 「形狀類型」需要連動顯示/隱藏對應欄位（橢圓的短半徑、星形的內凹比例）並調整點數/邊數的預設範圍，
// 邏輯比其他單純的 onchange 多一點。
function bindTrajShapeGenUI(...args){
  return trajectoryEditor.bindTrajShapeGenUI(...args);
}

// 所有目前「可被點擊」的球（關節球 + 可見的 IK 目標球／極向球），自己過濾 visible，
// 不依賴 Raycaster 是否會自動跳過隱藏物件。
function allPickableMeshes(...args){
  return sceneSelectionController.allPickableMeshes(...args);
}

// ---- 點擊選取關節 ----
function setupPickRaycaster(...args){
  return sceneSelectionController.setupPickRaycaster(...args);
}

function selectJoint(...args){
  return sceneSelectionController.selectJoint(...args);
}

function deselectJoint(...args){
  return sceneSelectionController.deselectJoint(...args);
}

function updateSelectedBar(...args){
  return sceneSelectionController.updateSelectedBar(...args);
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
    alert(t("JSON 格式錯誤：") + e.message);
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
      nameEl.className = "jrName"; liveText(nameEl,()=>jointLabel(key)); liveAttribute(nameEl,"title",()=>jointLabel(key));
      const keyEl = document.createElement("span");
      keyEl.className = "jrKey"; liveText(keyEl,()=>key); liveAttribute(keyEl,"title",()=>t("JSON 裡對應的 key：\"") + key + "\"");
      const valEl = document.createElement("span");
      valEl.className = "jrVal jrDim"; liveText(valEl,()=>"—");
      row.append(nameEl, keyEl, valEl);
      body.appendChild(row);
      jsonRefRowEls[key] = valEl;
    }

    const groupEl = document.createElement("div");
    groupEl.className = "jrGroup";
    const head = document.createElement("div");
    head.className = "ovGroupHead" + (collapsed ? " collapsed" : "");
    liveHTML(head,()=>`<span><span class="ovCaret">▾</span>${t(group.label)}</span><span class="ovCount">${jointCountLabel(keys.length)}</span>`);
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
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(t("最外層必須是物件"));
  } catch (e){
    parseOk = false;
  }
  if (errBanner) errBanner.style.display = parseOk ? "none" : "";

  for (const key in jsonRefRowEls){
    const el = jsonRefRowEls[key];
    el.classList.remove("jrOk", "jrErr", "jrDim");
    if (!parseOk){
      liveText(el,()=>t("（JSON 尚未寫完整或有語法錯誤）"));
      el.classList.add("jrDim");
      continue;
    }
    const v = parsed[key];
    if (v === undefined){
      liveText(el,()=>t("未設定（套用時會維持原角度）"));
      el.classList.add("jrDim");
      continue;
    }
    if (!Array.isArray(v) || v.length !== 3 || v.some(n => typeof n !== "number" || !isFinite(n))){
      liveText(el,()=>t("格式錯誤，應為 [X,Y,Z] 三個數字"));
      el.classList.add("jrErr");
      continue;
    }
    liveText(el,()=>`X ${v[0].toFixed(1)}°  Y ${v[1].toFixed(1)}°  Z ${v[2].toFixed(1)}°`);
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
function migrateLibraryItems(fromVersion, items){
  return libraryStore.migrateLibraryItems(fromVersion, items);
}

function loadLibraryFromStorage(key){
  return libraryStore.loadLibraryFromStorage(key);
}

// 粗估這個 key 目前佔用的位元組數（localStorage 是 UTF-16，字元數*2估算）。
function estimateKeyBytes(key){
  return libraryStore.estimateKeyBytes(key);
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
  return libraryStore.getTotalLibraryStorageBytes();
}

function saveLibraryToStorage(key, arr){
  return libraryStore.saveLibraryToStorage(key, arr);
}

// 在畫面上顯示目前姿勢庫／手勢庫／招式庫共用的 localStorage 用量，並在快滿時提早示警
// （三個庫共用同一個瀏覽器儲存空間，所以用量要一起看，不能只看單一庫）。
function renderStorageUsageIndicator(){
  const used = getTotalLibraryStorageBytes();
  const pct = Math.min(100, Math.round(used / ESTIMATED_STORAGE_QUOTA_BYTES * 100));
  const text = ()=>t("💾 姿勢／手勢／招式／律動庫共用空間：約 {used}（估計上限約 5MB 的 {pct}%）",{used:formatBytes(used),pct})+(pct>=90?t("　⚠ 空間快滿了，建議盡快匯出備份並刪除不需要的項目"):"");
  const color = pct >= 90 ? "#ff6b6b" : (pct >= 70 ? "#f0b060" : "#6a6a9a");

  // 姿勢/手勢/招式庫分頁跟律動庫分頁各自有一個提示 span，共用同一份文字/顏色，不用分開算兩次。
  for (const id of ["libStorageUsageHint", "libStorageUsageHint2"]){
    const el = document.getElementById(id);
    if (!el) continue;
    liveText(el,text);
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
    catch (e){ alert(t("JSON 檔案解析失敗：") + e.message); }
  };
  reader.onerror = () => alert(t("讀取檔案失敗。"));
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
  renderLibraryList(items, listElId, emptyElId, handlers, emptyText);
}

// 工廠函式：產生一個獨立運作的「庫」控制器（姿勢庫／手勢庫／招式庫各建一個實例，邏輯完全共用不重複寫）
function createLibraryController(opts){
  return createSharedLibraryController(opts, libraryDependencies);
}

// -- 動作姿勢庫：只讀寫身體關節（BODY_LIB_JOINT_KEYS），完全不碰手指 --
function captureCurrentBodyPose(...args){
  return libraryDomainController.captureCurrentBodyPose(...args);
}
function applyBodyPoseData(...args){
  return libraryDomainController.applyBodyPoseData(...args);
}

// -- 掌指手勢庫：只讀寫30個手指指節（FINGER_JOINT_KEYS），完全不碰身體 --
function captureCurrentGesture(...args){
  return libraryDomainController.captureCurrentGesture(...args);
}
function applyGestureData(...args){
  return libraryDomainController.applyGestureData(...args);
}

// -- 招式庫清單的輔助顯示：拍數／預估秒數／儲存時間，讓使用者不用點開就知道這招大概是什麼 --
function formatRelativeSavedTime(...args){
  return libraryDomainController.formatRelativeSavedTime(...args);
}
function moveLibSubtitle(...args){
  return libraryDomainController.moveLibSubtitle(...args);
}

// -- 招式庫：存「時間軸上一小段連續拍點」（一組動作組合），套用方式是「插入」而非「覆蓋」--
const MOVE_LIB_KEY = "tuttingMoveLibrary_v1";

// 讀「起始拍／結束拍」輸入框（1-based，對應畫面上的 F1、F2……），擷取那段拍點深拷貝存起來，
// 之後即使原本時間軸被編輯，已存的招式也不會被連動改到。
function captureSelectedMove(...args){
  return libraryDomainController.captureSelectedMove(...args);
}

// 插入到「目前選取拍點」之後；若沒有選取任何拍點，就接在整份編舞最尾端（方便依序把招式串成一整支舞）。
// 每次插入都重新深拷貝一份，避免同一招式插入兩次時，兩處拍點共用同一個物件參考。
function insertMoveData(...args){
  return libraryDomainController.insertMoveData(...args);
}

function updateMoveLibRangeHint(...args){
  return libraryDomainController.updateMoveLibRangeHint(...args);
}

// -- 律動庫：把「目前所有律動設定」（參與律動的關節＋各自振盪參數＋蹲彈律動開關與參數）整組
// 打包存成一個命名項目，供下面的「律動序列」依名稱取用（例如存一個「A律動」、一個「B律動」）。
// 跟姿勢庫／手勢庫／招式庫共用同一套 createLibraryController 架構，只是 capture/apply 的
// 對象換成律動系統的幾個全域變數而已，互動邏輯（存/套用/刪除/重新命名/匯出入）完全不用重寫。
const GROOVE_LIB_KEY = "tuttingGrooveLibrary_v1";

function captureCurrentGrooveConfig(...args){
  return libraryDomainController.captureCurrentGrooveConfig(...args);
}

// 讀檔容錯：過濾格式不對的欄位，避免壞資料（例如手動改壞的匯入JSON、或來自不同版本的檔案）
// 讓律動庫項目在套用/序列播放時算出 NaN 或非法波形。跟 restoreTimelineData 同一套防呆原則。
function sanitizeGrooveLibConfigData(...args){
  return libraryDomainController.sanitizeGrooveLibConfigData(...args);
}

// 「套用」一個律動庫項目＝把它整組寫回目前的手動全域設定（grooveJointSet 等），
// 效果等同使用者自己重新勾選/調整一次。只在「手動/舊版單一設定」模式下有意義；
// 若已經建立「律動序列」，播放時序列會直接讀庫項目資料本身，不透過這幾個全域變數。
function applyGrooveConfigData(...args){
  return libraryDomainController.applyGrooveConfigData(...args);
}

// 律動庫清單 chip 副標題：一眼看出這組律動包含幾個關節、蹲彈律動有沒有開，不用點開才知道內容。
function grooveLibSubtitle(...args){
  return libraryDomainController.grooveLibSubtitle(...args);
}

// 直接把一組拍點推到時間軸最尾端（批次生成排舞用，不動 kfEditingIndex，效能較好，最後統一 render 一次）。
function appendMoveFrames(...args){
  return choreographyGenerator.appendMoveFrames(...args);
}

// 從招式庫隨機抽 N 個招式接龍成一份排舞。replace=true 會先清空目前時間軸，false 則接在尾端繼續往後長。
function generateChoreographyFromMoves(...args){
  return choreographyGenerator.generateChoreographyFromMoves(...args);
}

// 自動生成招式：連續呼叫 N 次既有的「動作生成」（沿用關節限制範圍／Isolation分組／機率設定），
// 每呼叫一次就記錄一格拍點快照，串成一個多拍的招式；只存進招式庫，不會動到目前時間軸上的內容。
function autoGenerateMove(...args){
  return choreographyGenerator.autoGenerateMove(...args);
}

let poseLibCtrl = null;
let gestureLibCtrl = null;
let moveLibCtrl = null;
let grooveLibCtrl = null;

function bindLibraryUI(...args){
  return libraryDomainController.bindLibraryUI(...args);
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
// 姿勢／時間軸快照另包含 FingerTut 工作區狀態：雙臂與手指 IK、手掌朝向、
// 模式參數、進入前姿勢與鏡頭，讓胸前擺位及還原可以 Undo／Redo。
// 扶握箱操作另記錄形狀變換、接觸點與雙臂／手指 IK，跨越扶握箱編輯時還原。
// 其餘 IK 與即時身體位置仍依各領域的既有快照契約處理。
function snapshotAngleState(){
  return {...snapshots.captureHistory(), fingerTut:fingerTutController.snapshot(), grabBox:grabBoxCore?.snapshot()};
}

function pushHistory(){
  return history.push();
}

function restoreSnapshot(snap){
  tgCancelPreview();restoreGenerationRules(snap.generationRules);restoreTG(snap.tuttingGenerator);
  waveClips=cleanWaveClips(snap.waveClips);waveClipSelected=null;waveTrackActive=false;
  restoreWave(snap.waving);
  restoreLAPath(snap.lookAtPath);
  poseController.restoreTarget(snap.target);
  restoreFootPlant(snap.footPlant);
  restorePoleEditor(snap.poleEditor);
  restoreHandAim(snap.handAim);
  restoreTorsoLookAt(snap.torsoLookAt);
  fingerTutController.restoreSnapshot(snap.fingerTut);
  if(grabBoxCore?.restoreSnapshot(snap.grabBox)){
    // IK may have produced angles outside FK limits; preserve the captured pose.
    poseController.restoreTarget(snap.target,{clamp:false});
    poseController.applyTargetsToBones();model.updateWorldMatrix(true,true);
  }
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
}

function undo(){
  return history.undo();
}

function redo(){
  return history.redo();
}

function updateUndoRedoButtons(){
  const u = document.getElementById("undoBtn");
  const r = document.getElementById("redoBtn");
  if (u) u.disabled = !history.canUndo;
  if (r) r.disabled = !history.canRedo;
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
// FingerTut 是編輯工作區模式；成果需新增拍點／儲存手勢，工作區開關與鏡頭不隨專案存檔。
function scheduleAutoSave(){
  return autosave.schedule();
}

// 組出一份完整的「編舞資料快照」——自動存檔與手動匯出共用同一個格式，
// 這樣匯出的檔案將來也能直接被拿來當自動存檔還原，兩條路徑資料互通。
function snapshotTimelineData(){
  return snapshots.captureProject();
}

function doAutoSave(){
  return autosave.save();
}

function showAutosaveIndicator(){
  const el = document.getElementById("autosaveIndicator");
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  el.dataset.time = `${hh}:${mm}:${ss}`;
  el.textContent = t("已自動儲存 {time}", {time:el.dataset.time});
  el.style.opacity = "1";
  clearTimeout(showAutosaveIndicator._t);
  showAutosaveIndicator._t = setTimeout(() => { el.style.opacity = "0"; }, 2000);
}

// 把一份「編舞資料快照」（snapshotTimelineData 格式）套用回場景——自動存檔還原／
// 手動匯入檔案共用同一套邏輯，只有「資料從哪裡來、要不要跳確認框」不一樣。
// 呼叫前務必先確認 data 已通過基本驗證（見 tryLoadAutosave / importTimelineFromFile）。
function restoreTimelineData(data){
  fingerTutController.clear();
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
  if(grabBoxCore){
    const current=grabBoxCore.snapshot();
    const state=cleanGrabProject(data.grabBox,{...current,target:poseController.snapshotTarget()});
    if(state){
      if(state.visible){poseController.restoreTarget(state.target,{clamp:false});poseController.applyTargetsToBones();}
      state.revision=current.revision+1;
      grabBoxCore.restoreSnapshot(state,{force:true});
      model.updateWorldMatrix(true,true);
    }else{
      // Legacy projects must not inherit live bindings from the previous workspace.
      grabBoxCore.restoreSnapshot({...current,revision:current.revision+1,rig:null,visible:false,grabbed:{rArm:false,lArm:false},grabLocal:{rArm:null,lArm:null},preset:null,palmAligned:false,palmTwist:{rArm:0,lArm:0}},{force:true});
    }
  }
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
  const data = autosave.read();
  if (!data) return;

  const savedDate = data.savedAt ? new Date(data.savedAt) : null;
  const timeStr = savedDate
    ? `${savedDate.getMonth()+1}/${savedDate.getDate()} ${String(savedDate.getHours()).padStart(2,"0")}:${String(savedDate.getMinutes()).padStart(2,"0")}`
    : "";
  const ok = confirm(
    t("偵測到自動存檔（{count} 個拍點{time}），要還原上次的編輯進度（含扶握箱）嗎？\n按「取消」會保留目前的空白畫布，並清除這份自動存檔。",{count:data.keyframes.length,time:timeStr ? " · "+timeStr : ""})
  );
  if (!ok){
    autosave.clear();
    return;
  }

  restoreTimelineData(data);
}

// ---- 時間軸（拍點）匯出／匯入為 JSON 檔案 ----
// 匯出：跟自動存檔同一份快照格式（snapshotTimelineData），直接下載成檔案，
// 方便備份、分享給別人、或搬到別的瀏覽器/裝置。
function exportTimeline(){
  return projectFiles.exportFile();
}

// 匯入：讀檔 → 基本結構驗證 → 詢問是否覆蓋目前時間軸 → 套用（與自動存檔還原共用 restoreTimelineData）。
function importTimelineFromFile(file){
  return projectFiles.importFile(file);
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
function addKeyframe(...args){
  return poseEditorController.addKeyframe(...args);
}

// 複製第 i 個拍點（含角度、身體位置、Easing/拍數、軌跡資料），插入緊接在它後面。
// 用深拷貝，複製出來的拍點之後各自修改不會互相影響。
function duplicateKeyframe(...args){
  return poseEditorController.duplicateKeyframe(...args);
}

// 拖曳排序：把 from 移到 to 的位置。跟著調整 kfEditingIndex，讓選取狀態黏著在
// 「同一個邏輯拍點」上，而不是黏著在原本的數字位置上（否則拖曳完選取會跳到別的拍點去）。
function reorderKeyframe(...args){
  return poseEditorController.reorderKeyframe(...args);
}

// 拍點備註：用 prompt() 編輯，跟既有的「姿勢庫／手勢庫」重新命名同一套互動方式。
// 留空即清除備註（chip 上改顯示 ✎ 提示可以新增）。長度限制24字，避免橫向清單被一則超長備註撐爆。
function renameKeyframeLabel(...args){
  return poseEditorController.renameKeyframeLabel(...args);
}

// 拍點清單標題旁的總時長：只加總「有下一段轉場」的拍點（最後一拍沒有輸出轉場，不計入），
// 算法跟 updateBeatMsHint() 單一拍點的算法一致，這裡是整份時間軸的加總。
function updateKfTotalDurationLabel(...args){
  return timelineInspectorController.updateKfTotalDurationLabel(...args);
}

// 編舞（拍點清單）的真實總拍數：加總每段轉場各自的「拍數」設定，跟 updateKfTotalDurationLabel()
// 算 totalMs 用的是同一份資料，只是這裡要的是拍子數而不是換算成毫秒，供跟律動序列總拍數互相比對。
function kfTotalBeats(){
  return totalKeyframeBeats(keyframes);
}

// ---- 多選批次刪除 ----
function timelineClipboardCount(){
  return timelineSelection.timelineClipboardCount();
}
function updateKfMultiSelectBar(){
  return timelineSelection.updateKfMultiSelectBar();
}

function setKfMultiSelectMode(on){
  return timelineSelection.setKfMultiSelectMode(on);
}

function toggleKfMultiSelectItem(i){
  return timelineSelection.toggleKfMultiSelectItem(i);
}
function toggleGrooveMultiSelectItem(i){
  return timelineSelection.toggleGrooveMultiSelectItem(i);
}

function kfMultiSelectAll(){
  return timelineSelection.kfMultiSelectAll();
}

function kfMultiSelectNone(){
  return timelineSelection.kfMultiSelectNone();
}

function deepCloneTimelineItem(item){
  return timelineSelection.deepCloneTimelineItem(item);
}
function currentTimelineClipboardSelection(){
  return timelineSelection.currentTimelineClipboardSelection();
}
function copyTimelineSelection(){
  return timelineSelection.copyTimelineSelection();
}
function deleteTimelineSelection(options){
  return timelineSelection.deleteTimelineSelection(options);
}
function deleteKfMultiSelected(){
  return timelineSelection.deleteKfMultiSelected();
}
function cutTimelineSelection(){
  return timelineSelection.cutTimelineSelection();
}
function pasteTimelineClipboard(){
  return timelineSelection.pasteTimelineClipboard();
}

function updateKeyframe(...args){
  return poseEditorController.updateKeyframe(...args);
}

// 選取拍點的轉場 Easing / 拍數即時編輯（不需按「更新選取拍點」，因為不影響角度資料）
function setKeyframeEasing(...args){
  return poseEditorController.setKeyframeEasing(...args);
}

function setKeyframeBeats(...args){
  return poseEditorController.setKeyframeBeats(...args);
}

// 把 Easing / 拍數控制項同步成目前選取拍點的值（沒選取時維持上一次的預設值）
function updateBeatGridPoseInspector(...args){
  return timelineInspectorController.updateBeatGridPoseInspector(...args);
}

function syncEasingControlsFromSelection(...args){
  return timelineInspectorController.syncEasingControlsFromSelection(...args);
}

function updateEasingPreview(...args){
  return timelineInspectorController.updateEasingPreview(...args);
}

function updateBeatMsHint(...args){
  return timelineInspectorController.updateBeatMsHint(...args);
}

function deleteKeyframe(...args){
  return poseEditorController.deleteKeyframe(...args);
}

function clearKeyframes(...args){
  return poseEditorController.clearKeyframes(...args);
}

function selectKeyframeStateOnly(...args){
  return poseEditorController.selectKeyframeStateOnly(...args);
}

function selectKeyframe(...args){
  return poseEditorController.selectKeyframe(...args);
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

function nearestBeatGridZoomLevel(...args){
  return beatGridController.nearestBeatGridZoomLevel(...args);
}

function refreshBeatGridZoomLayout(...args){
  return beatGridController.refreshBeatGridZoomLayout(...args);
}

function setBeatGridZoomPx(...args){
  return beatGridController.setBeatGridZoomPx(...args);
}

function stepBeatGridZoom(...args){
  return beatGridController.stepBeatGridZoom(...args);
}

function keyframeStartBeat(index){
  return timelineStartBeat(keyframes, index);
}

function grooveSegmentStartBeat(...args){
  return beatGridController.grooveSegmentStartBeat(...args);
}

function beatGridPoseTotalBeats(...args){
  return beatGridController.beatGridPoseTotalBeats(...args);
}

function beatGridAudioTotalBeats(...args){
  return beatGridController.beatGridAudioTotalBeats(...args);
}

function beatGridTimelineBeats(...args){
  return beatGridController.beatGridTimelineBeats(...args);
}

function updateBeatGridGeometry(...args){
  return beatGridController.updateBeatGridGeometry(...args);
}

function hasBeatGridRange(){
  return rangeEditor.hasBeatGridRange();
}

function normalizeBeatGridRange(a, b){
  return rangeEditor.normalizeBeatGridRange(a, b);
}

function formatRangeBeatLabel(beat){
  return rangeEditor.formatRangeBeatLabel(beat);
}


function beatGridRangeClipboardCount(){
  return rangeEditor.beatGridRangeClipboardCount();
}

// 回傳目前 Range 實際會影響的資料索引。POSE 以 transition interval 判斷相交；
// GROOVE 以 clip interval 判斷相交。這裡刻意不切半段，確保既有 sequential timeline schema 不變。
function getBeatGridRangeAffectedItems(start, end){
  return rangeEditor.getBeatGridRangeAffectedItems(start, end);
}

function showRangeEditHud(message, ms){
  return rangeEditor.showRangeEditHud(message, ms);
}

function copyBeatGridRange(){
  return rangeEditor.copyBeatGridRange();
}

function findPoseRangeInsertIndexAtBeat(beat){
  return rangeEditor.findPoseRangeInsertIndexAtBeat(beat);
}
function findGrooveRangeInsertIndexAtBeat(beat){
  return rangeEditor.findGrooveRangeInsertIndexAtBeat(beat);
}

function pasteBeatGridRange(options){
  return rangeEditor.pasteBeatGridRange(options);
}

function duplicateBeatGridRange(){
  return rangeEditor.duplicateBeatGridRange();
}

function deleteBeatGridRange(){
  return rangeEditor.deleteBeatGridRange();
}

function updateBeatGridRangeUI(){
  return rangeEditor.updateBeatGridRangeUI();
}

function clearBeatGridRange(){
  return rangeEditor.clearBeatGridRange();
}

function setBeatGridRangeLoop(on){
  return rangeEditor.setBeatGridRangeLoop(on);
}

function beatGridClientXToBeat(...args){
  return beatGridController.beatGridClientXToBeat(...args);
}

function bindBeatGridRangeSelection(...args){
  return beatGridController.bindBeatGridRangeSelection(...args);
}

function locateKeyframeSegmentAtBeat(beat){
  return locateTimelineSegment(keyframes, beat, beatGridPoseTotalBeats());
}

function seekRunningPlaybackToBeat(...args){
  return timelineTransportController.seekRunningPlaybackToBeat(...args);
}

function renderGrooveLoopGhosts(...args){
  return beatGridController.renderGrooveLoopGhosts(...args);
}

function scrollKfChipIntoView(...args){
  return beatGridController.scrollKfChipIntoView(...args);
}

// BG-3.2：POSE / GROOVE 共用拖曳排序 UX。
// 拖曳期間只顯示「預計插入位置」，真正陣列 reorder 只在 drop 時執行，因此不會邊拖邊重建 DOM。
let timelineReorderDrag = null; // BG-6: supports single item or selected group
function timelineReorderItems(...args){
  return timelineReorderController.timelineReorderItems(...args);
}
function timelineReorderChips(...args){
  return timelineReorderController.timelineReorderChips(...args);
}
function timelineReorderLabel(...args){
  return timelineReorderController.timelineReorderLabel(...args);
}
function timelineSelectedSet(...args){
  return timelineReorderController.timelineSelectedSet(...args);
}
function ensureTimelineDropIndicator(...args){
  return timelineReorderController.ensureTimelineDropIndicator(...args);
}
function clearTimelineReorderVisuals(...args){
  return timelineReorderController.clearTimelineReorderVisuals(...args);
}
function beginTimelineReorderDrag(...args){
  return timelineReorderController.beginTimelineReorderDrag(...args);
}
function calcTimelineReorderTarget(...args){
  return timelineReorderController.calcTimelineReorderTarget(...args);
}
function isGroupMoveNoop(...args){
  return timelineReorderController.isGroupMoveNoop(...args);
}
function updateTimelineReorderDrag(...args){
  return timelineReorderController.updateTimelineReorderDrag(...args);
}
function moveTimelineGroup(...args){
  return timelineReorderController.moveTimelineGroup(...args);
}
function dropTimelineReorder(...args){
  return timelineReorderController.dropTimelineReorder(...args);
}
function endTimelineReorderDrag(...args){
  return timelineReorderController.endTimelineReorderDrag(...args);
}
function bindTimelineReorderHost(...args){
  return timelineReorderController.bindTimelineReorderHost(...args);
}

function renderKeyframeChips(...args){
  return beatGridController.renderKeyframeChips(...args);
}

// 播放時每幀呼叫：只切換既有 chip 節點的 "playing" class，不重建 DOM、不重新產生 SVG。
// 跟 highlightOverviewRows() 是同一種「結構只建一次、逐幀只動 class」的做法。
function updatePlayingKeyframeHighlight(...args){
  return beatGridController.updatePlayingKeyframeHighlight(...args);
}

// BG-2：目前 Pose 在共用 Beat 軸上的連續位置。
// 不使用 grooveStartTime 反推，因為 Pose 每一段可以有不同 beats；直接沿用播放核心的 kfIndex/kfStartTime，
// 保證 Playhead 與畫面正在 Slerp 的姿勢是同一個進度。
function getBeatGridPosePlayheadBeat(...args){
  return beatGridController.getBeatGridPosePlayheadBeat(...args);
}

function getBeatGridGroovePlaybackInfo(...args){
  return beatGridController.getBeatGridGroovePlaybackInfo(...args);
}

function updateBeatGridGrooveHighlight(...args){
  return beatGridController.updateBeatGridGrooveHighlight(...args);
}

function autoScrollBeatGridToPlayhead(...args){
  return beatGridController.autoScrollBeatGridToPlayhead(...args);
}

function updateBeatGridPlaybackUI(...args){
  return beatGridController.updateBeatGridPlaybackUI(...args);
}

function resetBeatGridPlaybackUI(...args){
  return beatGridController.resetBeatGridPlaybackUI(...args);
}

// 拍點清單改成單列橫向排列後，一般滑鼠的垂直滾輪天生滾不動橫向內容（要按住 Shift 才行，
// 多數使用者不會這樣做）；這裡把垂直滾動量轉成橫向捲動，滑鼠使用者可以直接滾。
// 觸控板本來就常支援直接橫向滑動（deltaX），那種情況交給瀏覽器原生處理，不要搶著轉換。
let beatGridLastPreviewBeat = 0;

function getBeatGridCurrentNavigationBeat(...args){
  return beatGridController.getBeatGridCurrentNavigationBeat(...args);
}

function scrollBeatGridBeatToCenter(...args){
  return beatGridController.scrollBeatGridBeatToCenter(...args);
}

function navigateBeatGridToBeat(...args){
  return beatGridController.navigateBeatGridToBeat(...args);
}

function centerBeatGridPlayhead(...args){
  return beatGridController.centerBeatGridPlayhead(...args);
}

function fitBeatGridTimeline(...args){
  return beatGridController.fitBeatGridTimeline(...args);
}

function syncBeatGridZoomSelect(...args){
  return beatGridController.syncBeatGridZoomSelect(...args);
}

function initKfListWheelScroll(...args){
  return beatGridController.initKfListWheelScroll(...args);
}

// 拍點清單鍵盤快捷鍵：只在「時間軸」分頁作用中、且沒有正在某個輸入框打字時生效，
// 避免跟其他分頁操作或打字輸入互相搶按鍵。播放中也不接管，避免跟播放狀態衝突。
// ←/→：切換選取上一拍/下一拍　Delete/Backspace：刪除目前選取的 POSE 或 GROOVE　Ctrl/Cmd+D：複製選取中的拍點
function bindKfKeyboardShortcuts(...args){
  return timelineToolbarController.bindKfKeyboardShortcuts(...args);
}

function toggleKeyframePlayback(...args){
  return timelineTransportController.toggleKeyframePlayback(...args);
}

function stopKeyframePlayback(...args){
  return timelineTransportController.stopKeyframePlayback(...args);
}

// ---- 時間軸配樂（音樂試聽）----
// 只存在這次瀏覽階段：不寫進自動存檔／匯出 JSON，重新整理頁面或匯入編舞後都需要重新匯入音樂檔。
// 理由：音樂檔通常數MB起跳，塞進localStorage容易爆容量、塞進JSON也會讓檔案暴增又難以分享。


function importKfMusic(file){
  if (!file) return;
  timelineAudio.importFile(file, parseFloat(document.getElementById("kfMusicVolume").value));
  liveText(document.getElementById("kfMusicName"),()=>file.name);
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
  liveText(document.getElementById("kfMusicName"),()=>t("尚未匯入音樂"));
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
  liveText(btn,()=>t(audioEl.paused ? "🎵 試聽" : "⏸ 暫停"));
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
    console.warn(t("波形解碼失敗（音樂仍可正常播放）："), result.error);
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

function applyTimelinePreviewAtElapsed(...args){
  return timelineTransportController.applyTimelinePreviewAtElapsed(...args);
}

function showBeatGridScrubPlayhead(...args){
  return timelineTransportController.showBeatGridScrubPlayhead(...args);
}

function seekKfTimelineFromClientX(...args){
  return timelineTransportController.seekKfTimelineFromClientX(...args);
}

function bindKfWaveformScrubbing(...args){
  return timelineTransportController.bindKfWaveformScrubbing(...args);
}

function updateBeatGridMusicPreviewPlayhead(...args){
  return timelineTransportController.updateBeatGridMusicPreviewPlayhead(...args);
}

// ---- 軌跡播放時即時覆蓋（階段二：曲線播放時真的平滑，不是靠取樣點密度逼近）----
// 檢查 frameA/frameB 是否對同一個 limb 記錄了相同 trajId 的 traj 資料，若是，
// 代表這兩個拍點屬於同一次「生成拍點」批次，回傳這些 limb 的 root/mid 骨骼key，
// 讓上面的一般角度slerp迴圈跳過它們（改由 applyTrajOverridesDuringPlayback 接管）。
// 大多數拍點沒有軌跡資料，是最常見的情況：共用一組唯讀的空陣列/空 Set 給這個情況用，
// 呼叫端只會對它們做 .has()／.length 讀取，不會修改，所以能安全跨幀共用同一個實例。


function collectTrajOverrideKeys(...args){
  return trajectoryEditor.collectTrajOverrideKeys(...args);
}

// 對每個觸發軌跡覆蓋的 limb：在 frameA.traj[limb].t 與 frameB.traj[limb].t 之間用 et 內插出
// 目前應該落在路徑上的進度，直接用純數學的 sampleTrajectoryFromPoints 取樣出座標（不受拍點密度限制），
// 疊加上「本幀最新」的 root 骨骼世界座標，重新呼叫一次 solveTwoBoneIK。
// 末端骨骼（手掌/腳掌）本身的旋轉維持上面迴圈已經slerp好的結果，這裡不動它
// （呼應「IK只驅動root+mid，末端保留FK」的既有設計哲學）。





function applyTrajOverridesDuringPlayback(...args){
  return trajectoryEditor.applyTrajOverridesDuringPlayback(...args);
}

// 拍點播放時最熱的路徑：每幀都要跑過全部關節key（body+finger共約50個），逐key slerp。
// qa/qb 需要同時存在才能做 slerp，所以要用兩個獨立的暫存 Quaternion（不能共用同一個）。







// 純套用函式：把 frameA→frameB 之間、進度 et（已套過 easing）的內插姿勢套到骨架上。
// 不碰 kfIndex/kfStartTime 這些「播放狀態」，所以拍點播放（updateKeyframePlayback）跟
// 拖曳波形游標預覽（applyTimelinePreviewAtElapsed）可以共用同一套內插邏輯，不用寫兩次。
function applyKeyframeFramePose(...args){
  return poseInterpolatorController.applyKeyframeFramePose(...args);
}

// 律動模式：在拍點播放的姿勢之上，額外疊加一層隨 BPM 持續振盪的旋轉偏移。
// 用「post-multiply」的方式疊在 applyKeyframeFramePose 剛算完的 bone.quaternion 之後，
// 不動 frameA/frameB 存的角度資料本身，所以律動不會被誤存進拍點、也不影響編輯模式。
// overrideKeys：跳過目前被軌跡IK接管的關節，避免律動的旋轉偏移跟軌跡算出來的姿勢互相打架。



// ---- 律動序列段落切換的交叉淡化（crossfade）----
// 段落切換時 localBeats 歸零，若新舊段落對同一關節用不同振幅/軸向/波形，交界處會硬接跳動；
// 這裡讓切換後的一小段時間內（GROOVE_XFADE_BEATS 拍）同時算「舊段落延續下去的值」跟「新段落
// 從頭算的值」，用 Slerp 依時間比例混合，過了這段時間就恢復成只算新段落，不佔額外效能。
// 用四元數 Slerp 而不是直接內插角度數值，是因為新舊兩段可能對同一關節用不同軸向，直接內插
// 數值在這種情況下沒有意義，Slerp 對任意兩個朝向都能給出平滑的中間路徑。
 // 交叉淡化視窗長度（拍）：太短看不出效果、太長會讓段落轉換顯得拖泥帶水


let grooveLastSegIndex = -1;      // 上一幀算出來是序列的第幾段，用來偵測「這一幀是不是剛切換到新段落」
let grooveLastSegSnapshot = null; // { keys, paramsFor, localBeats }：切換前那一幀的資料，當作舊段落淡出的起點
let grooveXfade = null;           // 目前是否處於交叉淡化視窗內：{ switchElapsed, fromKeys, fromParamsFor, fromLocalBeatsAtSwitch }

// 播放/預覽重新開始時呼叫，清掉上面這些跨幀狀態，避免用到「上一次播放到一半」殘留的舊段落資料
// 導致重新開始的第一瞬間出現一次不該有的交叉淡化（見 toggleKeyframePlayback／律動預覽開關）。
function resetGrooveXfadeState(...args){
  return grooveController.resetGrooveXfadeState(...args);
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
function applyGroove(...args){
  return grooveController.applyGroove(...args);
}

// 捕捉「目前」雙腳的世界座標/世界旋轉當蹲彈的原地錨點——之後不管身體怎麼上下/左右移動，
// 兩腿IK都會反算成讓腳掌精準貼住這個點，腳踝則鎖住這個旋轉，模擬「腳掌貼地不動」。
// 呼叫時機：每次重新開始播放/預覽（grooveSquatAnchored 被重置為 false）的第一幀。
function captureSquatFootAnchors(...args){
  return squatController.captureSquatFootAnchors(...args);
}

function resetSquatFootAnchors(...args){
  return squatController.resetSquatFootAnchors(...args);
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




// 蹲彈律動的交叉淡化狀態，跟 applyGroove 那組（grooveLastSegIndex 等）概念一樣，但蹲彈是獨立
// 系統，狀態分開存，避免兩邊互相干擾；共用同一個 GROOVE_XFADE_BEATS 視窗長度。
let squatLastSegIndex = -1;      // 上一幀是序列的第幾段
let squatLastSegSnapshot = null; // { enabled, params, localBeats }：切換前那一幀的蹲彈設定，淡出起點
let squatXfade = null;           // { switchElapsed, fromEnabled, fromParams, fromLocalBeatsAtSwitch }

function resetSquatXfadeState(...args){
  return squatController.resetSquatXfadeState(...args);
}

// 依「是否啟用／參數／拍子相位」算出這一幀蹲彈要疊加的位移量（公尺）；沒啟用時回傳 0，
// 這樣交叉淡化混合「啟用→停用」的段落交界時，停用那一側自然貢獻0，不需要另外特判。
// 垂直／側向各自用自己的 freq/phase/wave 算相位，可以做出「蹲一次側擺兩次」之類的複合節奏；
// 函式簽章沒變，applySquatGroove 的交叉淡化混合邏輯完全不用跟著改。
function computeSquatDelta(...args){
  return squatController.computeSquatDelta(...args);
}
function applySquatGroove(...args){
  return squatController.applySquatGroove(...args);
}

// ---- 律動模式：UI ----
// 每個關節一個 chip：左邊沿用既有的「切換按鈕」決定要不要參與律動（button.active 既有樣式，
// 跟其他布林開關一致）；右邊多一顆 ⚙ 小按鈕，點了把這個關節設成「目前正在自訂參數」的對象，
// 下方共用的編輯面板（軸向/波形/幅度/頻率/相位）就會顯示、可調整這顆關節的參數。
// 用「共用一組編輯面板」而不是每個關節攤開一整組滑桿，是刻意的取捨：14個關節×5個控制項
// 會讓分頁長到不可用，共用面板只需要在切換選取關節時換一次顯示值即可。
function buildGrooveJointUI(...args){
  return groovePanelController.buildGrooveJointUI(...args);
}

// 切換「目前正在自訂參數」的關節：更新所有 ⚙ 按鈕的醒目樣式，並重繪下方編輯面板的顯示值。
function selectGrooveEditingJoint(...args){
  return groovePanelController.selectGrooveEditingJoint(...args);
}

// 判斷某個關節目前是否有任何自訂覆寫欄位（決定 chip 上要不要顯示「已自訂」小圓點）。
function isGrooveJointCustomized(...args){
  return groovePanelController.isGrooveJointCustomized(...args);
}

// 只更新單一關節 chip 上的「已自訂」小圓點，不用重建整份清單——
// 跟其他按鈕自己管自己樣式的既有作法（見 buildGrooveJointUI 上方註解）一致。
function updateGrooveChipCustomizedMark(...args){
  return groovePanelController.updateGrooveChipCustomizedMark(...args);
}

// 依 grooveEditingKey 目前選取的關節，把「合併後」的參數（getGrooveParams）灌回編輯面板的
// 滑桿/按鈕顯示值。沒選取關節時顯示空狀態提示，引導使用者先點 ⚙。
function renderGrooveEditor(...args){
  return groovePanelController.renderGrooveEditor(...args);
}

// 畫出一個完整週期的律動波形（跟 buildEasingSVG 同風格，但畫的是 grooveWaveValue 的輸出，
// 不是 easing 本身——合成波經過鏡像/切段之後長相跟原曲線差很多，直接畫結果才看得準）。
// y 軸範圍固定 -1.25~1.25：容納 Back/Elastic 的 overshoot，同時讓不同波形之間的高度可以互相比較。

function buildGrooveWaveSVG(...args){
  return groovePanelController.buildGrooveWaveSVG(...args);
}

// ---- 自動生成律動：UI ----
// 選單選項只建一次（原型/曲線清單都是靜態資料），之後只更新描述與結果文字。

function renderGrooveGenUI(...args){
  return groovePanelController.renderGrooveGenUI(...args);
}

// 生成一組並立刻套用到「目前的手動律動設定」＝使用者可以馬上接著微調任何一個滑桿。
function doGrooveGenerate(...args){
  return groovePanelController.doGrooveGenerate(...args);
}

function bindGrooveGenUI(...args){
  return groovePanelController.bindGrooveGenUI(...args);
}

// 寫入目前選取關節的一個自訂欄位（只覆寫這個欄位，其餘欄位繼續沿用預設值或先前的自訂值）。
function setGrooveCustomField(...args){
  return groovePanelController.setGrooveCustomField(...args);
}

// 使用者手動動過任何律動欄位，就不能再宣稱「這組＝seed X 生成的結果」——清掉來源資訊，
// UI 上的 seed 標記也會跟著消失，避免存進律動庫的 meta 是假的、重現時得到不一樣的東西。
function invalidateGrooveGenMeta(...args){
  return groovePanelController.invalidateGrooveGenMeta(...args);
}

// 恢復單一關節的預設值：直接刪掉它的自訂覆寫物件即可，getGrooveParams() 自然會退回 GROOVE_PRESETS。
function resetGrooveJoint(...args){
  return groovePanelController.resetGrooveJoint(...args);
}

// 恢復全部關節的預設值：清空整份自訂覆寫。有確認框，避免不小心點掉調了很久的參數。
function resetAllGrooveCustom(...args){
  return groovePanelController.resetAllGrooveCustom(...args);
}

// 匯入編舞／還原自動存檔後，grooveJointSet 與 grooveCustomParams 的內容整個換掉了，
// 既有按鈕的 active/editing 樣式跟編輯面板顯示值都要跟著同步，直接重建整份最簡單。
function refreshGrooveJointUI(...args){
  return groovePanelController.refreshGrooveJointUI(...args);
}

// ---- 暖身漸強：UI ----
function renderGrooveWarmupUI(...args){
  return groovePanelController.renderGrooveWarmupUI(...args);
}

function bindGrooveUI(...args){
  return groovePanelController.bindGrooveUI(...args);
}

// ---- 蹲彈律動：UI ----
// 只有一組共用滑桿（跟關節編輯面板的滑桿模式一致），因為蹲彈本來就是雙腳同步的單一系統，
// 不像關節列表要在14個關節之間切換——沒有「選取哪個」的問題，永遠只有一份參數可調。
function renderGrooveSquatUI(...args){
  return groovePanelController.renderGrooveSquatUI(...args);
}

function setGrooveSquatField(...args){
  return groovePanelController.setGrooveSquatField(...args);
}

function resetGrooveSquat(...args){
  return groovePanelController.resetGrooveSquat(...args);
}

function bindGrooveSquatUI(...args){
  return groovePanelController.bindGrooveSquatUI(...args);
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

function selectGrooveSeqEntry(...args){
  return grooveSequenceController.selectGrooveSeqEntry(...args);
}

let lastValidGrooveSeqItem = null; // 給 applyGroove 用：序列播到「查無此律動庫項目」的段落時，沿用最近一次成功解析到的項目，避免動作瞬間僵直（方案A，見下方 applyGroove/applySquatGroove）
let lastValidSquatSeqData = null; // 同上，給 applySquatGroove（蹲彈）用，另外分開存是因為兩套系統各自需要的欄位不同（jointSet/customParams vs squatEnabled/squatCustom）

function grooveSeqTotalBeats(...args){
  return grooveSequenceController.grooveSeqTotalBeats(...args);
}

// 依「從播放起點累積的拍數」查表，決定目前該套用序列裡的哪一段。
// 回傳 { entry, item, localBeats, segIndex } 或 null（序列是空的／總拍數是0）。
// localBeats：這一段「自己的」拍子時鐘（從0開始算)，讓 applyGroove/applySquatGroove 做「相位歸零」——
// 段落一切換，振盪相位就從頭開始擺，避免不同段落振幅/軸向不同時，交界處角度硬接產生瞬間跳動。
// segIndex：這一段在 grooveSequence 陣列裡的索引，供 applyGroove/applySquatGroove 偵測「是否剛切換到新段落」
// 用來觸發交叉淡化（crossfade），跟序列會不會循環播放無關——即使循環繞回同一個 libId，只要 segIndex 變了
// 一樣視為切換，因為 localBeats 一樣會歸零，一樣有交界跳動的風險。
function getGrooveActiveSegment(...args){
  return grooveSequenceController.getGrooveActiveSegment(...args);
}

function addGrooveSeqEntry(...args){
  return grooveSequenceController.addGrooveSeqEntry(...args);
}
function removeGrooveSeqEntry(...args){
  return grooveSequenceController.removeGrooveSeqEntry(...args);
}
function duplicateGrooveSeqEntry(...args){
  return grooveSequenceController.duplicateGrooveSeqEntry(...args);
}
function reorderGrooveSeqEntry(...args){
  return grooveSequenceController.reorderGrooveSeqEntry(...args);
}
function normalizeTimelineBeats(...args){
  return timelineResizeController.normalizeTimelineBeats(...args);
}

function snapTimelineBeats(...args){
  return timelineResizeController.snapTimelineBeats(...args);
}

function snapGrooveBeats(...args){
  return timelineResizeController.snapGrooveBeats(...args);
}

function formatSnapLabel(...args){
  return timelineResizeController.formatSnapLabel(...args);
}

function setBeatGridSnap(...args){
  return timelineResizeController.setBeatGridSnap(...args);
}

function formatBeatValue(...args){
  return timelineResizeController.formatBeatValue(...args);
}

// kfBeatsSelect 保留常用快速選項；Resize 若產生 2.25 / 2.75 等值，動態加一個「目前值」選項，
// 避免 Inspector 因原清單沒有該值而顯示空白。
function syncBeatSelectValue(...args){
  return timelineResizeController.syncBeatSelectValue(...args);
}

function setGrooveSeqBeats(...args){
  return grooveSequenceController.setGrooveSeqBeats(...args);
}
function setGrooveSeqLibId(...args){
  return grooveSequenceController.setGrooveSeqLibId(...args);
}

function updateKeyframeClipLayoutOnly(...args){
  return timelineResizeController.updateKeyframeClipLayoutOnly(...args);
}

function updateGrooveClipLayoutOnly(...args){
  return timelineResizeController.updateGrooveClipLayoutOnly(...args);
}

// POSE / GROOVE 共用 Resize Engine：座標換算、1/4 beat snap、HUD、Pointer Capture、
// Cancel rollback、AutoSave 與「一次拖曳＝一筆 Undo」都集中在這裡，避免兩軌各維護一套手勢。
function beginTimelineResize(...args){
  return timelineResizeController.beginTimelineResize(...args);
}

function beginPoseResize(...args){
  return timelineResizeController.beginPoseResize(...args);
}

function beginGrooveResize(...args){
  return timelineResizeController.beginGrooveResize(...args);
}

function updateGrooveSeqTotalLabel(...args){
  return grooveSequenceController.updateGrooveSeqTotalLabel(...args);
}

// 渲染律動序列 chip 清單：下拉選單選律動庫項目、拍數輸入框、複製/刪除，支援拖曳排序。
// 拖曳邏輯風格跟 #kfList 的拍點拖曳一致：dragstart 記來源 index、drop 時呼叫 reorder。
function renderGrooveSeqChips(...args){
  return grooveSequenceController.renderGrooveSeqChips(...args);
}

// 律動庫的 UI 初始化：跟姿勢庫/手勢庫/招式庫共用同一套 createLibraryController，
// 差別只在 onRender 時要順便重繪律動序列（因為序列下拉選單的選項來自律動庫項目清單）。
function bindGrooveLibraryUI(...args){
  return grooveSequenceController.bindGrooveLibraryUI(...args);
}

function bindGrooveSequenceUI(...args){
  return grooveSequenceController.bindGrooveSequenceUI(...args);
}

// 每幀呼叫：在 keyframes[kfIndex] 與 keyframes[kfIndex+1] 之間用四元數 Slerp 平滑過渡
// 過渡時長 = 該拍點自訂的「拍數」× BPM 換算出的一拍毫秒數；過渡曲線 = 該拍點自訂的 Easing
function updateKeyframePlayback(...args){
  return timelineTransportController.updateKeyframePlayback(...args);
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
    document.getElementById("spaceBtn").textContent = t(isLocal ? "座標：世界" : "座標：本地");
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

  bindTimelineUI();
  bindTouchTimelineUI((kind, direction) => timelineReorderController.stepTimelineSelection(kind, direction));

  initUITabs();
  fingerTutController.bind();
  initEasingGallery();
  initUIVisibility();
  initUIResize();
  initUIFloat();
  initMobileLayout({ onLayoutChange:onResize, onInitialLayout:() => goToCameraPreset("front", true) });
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
  function refreshCommonLanguage(){
    document.getElementById('spaceBtn').textContent=t(transformControls.space==='world'?'座標：世界':'座標：本地');
    const saved=document.getElementById('autosaveIndicator');
    if(saved.dataset.time)saved.textContent=t('已自動儲存 {time}',{time:saved.dataset.time});
    updateSelectedBar();
  }
  onLanguageChange(refreshCommonLanguage);
  refreshCommonLanguage();
}

// ======================================================================
// 顯示設定小面板：身體/手部關節球、骨架、碰撞可視化，整合成一個浮在畫面左上角的獨立面板
// （跟右上角「分割視窗」預覽同樣是疊在3D畫面上的浮動面板），可收合避免長期擋住畫面。
// 收合狀態存 localStorage，跟其他面板（分割視窗開啟項目、UI浮動位置等）同一套持久化模式。
// ======================================================================
const DISPLAY_TOGGLES_COLLAPSED_STORAGE_KEY = "tuttingDisplayTogglesCollapsed";

function setDisplayTogglesCollapsed(...args){
  return workspacePanelsController.setDisplayTogglesCollapsed(...args);
}

function initDisplayTogglesPanel(...args){
  return workspacePanelsController.initDisplayTogglesPanel(...args);
}

// ---- 面板高度：拖曳把手手動調整 ----
const UI_HEIGHT_MIN_PX = 160;
const UI_HEIGHT_DEFAULT_RATIO = 0.46; // 對應原本的 46vh 預設
const UI_HEIGHT_MAX_RATIO = 0.85;

function initUIResize(...args){
  return floatingPanelsController.initUIResize(...args);
}

// ---- 面板浮動模式：可拖曳移動、可從右下角拖曳縮放，取代貼底整版寬的預設佈局 ----
// 沿用跟 initUIResize() 一樣的「pointerdown 記錄起點 → pointermove 即時套用 → pointerup 存檔」模式，
// 只是從單純調高度，擴充成同時處理 x/y 位置＋寬高。
const UI_FLOAT_MIN_WIDTH = 300;
const UI_FLOAT_MIN_HEIGHT = 220; // Keep toolbar, tabs and a usable content scroller.
const UI_FLOAT_DEFAULT_WIDTH = 440;
const UI_FLOAT_DEFAULT_LEFT = 24;
const UI_FLOAT_DEFAULT_TOP = 64;

function initUIFloat(...args){
  return floatingPanelsController.initUIFloat(...args);
}

// ======================================================================
// 通用「可浮動＋可調整大小」小面板：把某個分頁裡的內容彈出成獨立浮動視窗，
// 跟主面板（#ui）分開拖曳/縮放，收合時精準插回原本在 DOM 裡的位置。
// 沿用跟 initUIFloat() 一樣的拖曳/縮放手感，抽成參數化的通用版本方便重複使用。
// ======================================================================
function makeFloatablePanel(...args){
  return floatingPanelsController.makeFloatablePanel(...args);
}

// ---- 手指面板：套用上面的通用浮動視窗，方便一邊看 3D 一邊微調手指、不被主面板佔用的畫面空間卡住 ----
function initFingerFloatPanel(...args){
  return floatingPanelsController.initFingerFloatPanel(...args);
}


// ---- 面板分頁（動作姿勢庫／JSON／時間軸） ----
function initUITabs(...args){
  return workspacePanelsController.initUITabs(...args);
}

// ---- 面板整體隱藏／顯示（快速鍵 H） ----
function initUIVisibility(...args){
  return workspacePanelsController.initUIVisibility(...args);
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






function solveRootFollowForLimb(...args){
  return limbController.solveRootFollowForLimb(...args);
}

// 從骨骼目前四元數反推「相對 rest pose」的角度，寫回 target/current（不含 UI 更新，逐幀呼叫用）
// 讓 IK 求解的結果可以跟一般 FK 一樣被「新增拍點」記錄下來、被 JSON 匯出。
// IK 接管的每個骨骼、每一幀都會呼叫一次（四肢×2、脊椎×4、手指×3×10……），改用共用暫存物件。
function syncTargetFromBone(key){
  poseController.syncFromBone(key);
}

function updateIKPoleLines(...args){
  return limbController.updateIKPoleLines(...args);
}

// 每幀呼叫：對每個開啟 IK 的肢體求解，並把結果同步回 target/current（給拍點/JSON 用）
function solveIKAll(...args){
  return limbController.solveIKAll(...args);
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
  rigPreferences.saveHandCollisionRadii();
}
function loadHandCollisionRadii(){
  rigPreferences.loadHandCollisionRadii();
}
loadHandCollisionRadii(); // 開頁就還原使用者上次調過的半徑（若有）

// ---- 共用暫存物件 ----
const _hcHandPos = new THREE.Vector3();
const _hcA = new THREE.Vector3();
const _hcB = new THREE.Vector3();



const _hcPushDir = new THREE.Vector3();


// 點 p 到線段 (a,b) 的最近點，寫進 outPoint，回傳 outPoint 方便串接使用
function closestPointOnSegment(...args){
  return handCollisionController.closestPointOnSegment(...args);
}

// 每幀呼叫：對每隻「沒開IK、沒被拖曳」的手臂做一次身體（軀幹+腿+頭）碰撞檢查＋回彈。
// 軀幹/腿/頭在這裡一律視為「固定障礙物」——只有手會被推開，不會反過來影響腿/頭的姿勢，
// 這樣才不會跟腿部IK/蹲彈律動/脊椎IK等其他系統互相打架。
function solveHandBodyCollision(...args){
  return handCollisionController.solveHandBodyCollision(...args);
}

// ==== 雙手互碰（防穿模）====
// 跟上面「手-身體」不同：兩隻手都可能是「可動」的一方，不能直接套用同一套「障礙物固定、只推一邊」邏輯。
// 規則：
//   1) 若某隻手已開IK或正被拖曳，視為使用者明確鎖定，這隻手在這裡不會被移動（跟手-身體碰撞同一個原則）。
//   2) 兩隻手都可動時，穿模量各退一半，感覺像兩顆球互相推擠；
//      只有一隻可動時，把可動的那隻整個推到「剛好貼齊另一隻手表面」的位置。
//   3) 兩隻手都被鎖定時完全不處理——代表使用者自己刻意把兩隻手疊在一起，尊重使用者的選擇。






function isLimbHandMovable(...args){
  return handCollisionController.isLimbHandMovable(...args);
}

// 每幀呼叫：偵測右手掌球與左手掌球是否互相穿模，穿模時各自（或單邊）用輕量CCD推開。
function solveHandHandCollision(...args){
  return handCollisionController.solveHandHandCollision(...args);
}

// ==== 手部-軀幹碰撞：膠囊體／手掌球 可視化（除錯用）====
// 純視覺輔助，跟碰撞是否真的生效（handCollisionEnabled）無關——即使沒開碰撞回彈，
// 也可以單獨打開這個可視化，一邊拖滑桿一邊看膠囊體大小/位置對不對，調完再去開回彈。
let handCollisionVizEnabled = false;
let handCollisionVizGroup = null; // 一個 Group，裝所有可視化 mesh，方便整組顯示/隱藏
const handCollisionVizCapsuleMeshes = []; // 跟 ALL_BODY_CAPSULES（軀幹+腿+頭）一一對應
const handCollisionVizHandMeshes = {}; // { rArm: mesh, lArm: mesh }
const HAND_COLLISION_VIZ_EPS = 0.001; // 半徑/長度變化小於這個值就不重建geometry，省掉沒必要的重新配置

function buildHandCollisionVizMeshes(...args){
  return collisionView.buildHandCollisionVizMeshes(...args);
}

// 每幀呼叫：只在 handCollisionVizEnabled 開啟時才更新位置/朝向/尺寸，關閉時直接跳過省效能。
function updateHandCollisionVizMeshes(...args){
  return collisionView.updateHandCollisionVizMeshes(...args);
}

// 它的子孫（Spine1以下），不會改變 Spine 自己相對 Hips 的位置。也就是說
// 「Hips→Spine」這段其實不可彎曲，若把它也算進可及範圍會高估伸展能力，
// 導致平移完之後目標仍在 CCD 真正搆得到的範圍外、無法收斂。






function solveSpineRootFollow(...args){
  return spineController.solveSpineRootFollow(...args);
}

// 每幀呼叫：脊椎鏈開啟時求解一次，並把結果同步回 target/current（給拍點/JSON 用）
// 骨鏈陣列（SPINE_IK_CHAIN.bones 對應的 Bone 物件）在模型載入完成後就固定不變，
// 不需要每幀重新 map+filter 產生新陣列，第一次用到時快取起來即可。

function solveSpineIK(...args){
  return spineController.solveSpineIK(...args);
}

// ---- 頭/胸口 look-at 求解 ----
// 跟脊椎CCD不同：這裡只轉「單一骨骼」自己的朝向，讓local前方軸對準目標，
// 不影響其他骨骼位置。單步精確解（不是迭代逼近），因為單一骨骼只有「朝向」這一個
// 自由度要滿足，一次outer product轉軸就能算出精確解，且是冪等的
// （已對準時再呼叫一次，delta angle會是0，不會產生漂移）。






function solveLookAt(...args){
  return orientationController.solveLookAt(...args);
}

// ---- 肩胛骨限幅輔助旋轉（路線B）----
// 不納入兩節封閉解本身，而是在兩節IK求解「前」，讓Shoulder往target方向偏一點點，
// 但強制夾在 SHOULDER_ASSIST_MAX_ANGLE 內——真人鎖骨可動範圍本來就小（聳肩/前伸），
// 夾住角度上限比做完整CCD更貼近真實動作，也不需要額外的關節角度限制系統。
// ---- Effector 朝向控制 ----
// 開關：開啟時，先把目標球的旋轉同步成「目前手掌/腳掌實際世界朝向」，
// 避免目標球預設的單位旋轉(0,0,0,1)一啟用就把手掌轉飛。
function setEffectorOrientEnabled(...args){
  return limbController.setEffectorOrientEnabled(...args);
}

function updateEffectorOrientButtons(...args){
  return limbController.updateEffectorOrientButtons(...args);
}

// 每幀呼叫（在該肢體兩節IK求解「之後」執行）：把目標球目前的世界旋轉，
// 反推成末端骨骼（手掌/腳掌）該有的本地旋轉，讓它的朝向跟著目標球的旋轉環走。
// 目標球是scene的直接子物件（無父階層旋轉），所以它的quaternion本身就是世界旋轉。

function applyEffectorOrientation(...args){
  return limbController.applyEffectorOrientation(...args);
}


// ---- 肩胛骨限幅輔助旋轉（路線B）----
// 不納入兩節封閉解本身，而是在兩節IK求解「前」，讓Shoulder往target方向偏一點點，
// 但強制夾在 SHOULDER_ASSIST_MAX_ANGLE 內——真人鎖骨可動範圍本來就小（聳肩/前伸），
// 夾住角度上限比做完整CCD更貼近真實動作，也不需要額外的關節角度限制系統。






function solveShoulderAssist(...args){
  return limbController.solveShoulderAssist(...args);
}

// ---- 雙手同時固定（需 rArm/lArm 的 IK 都開啟 + dualAnchorEnabled）----
// 單手root-follow只做「平移」，兩隻手同時要湊不同的固定點時平移會沒有自由度
// 同時滿足兩個約束，所以改成「旋轉+平移整個角色」：
// 1) 算出「目前左右肩連線方向」該轉到「目前左右目標連線方向」需要的旋轉，
//    繞兩肩中點旋轉整個model（这一步讓身體「轉向」去面對兩個固定點的相對方位）
// 2) 轉完後重新量測肩膀中點，平移讓它對齊兩目標中點
// 3) 之後各手臂仍各自跑一次原本的兩節IK做手肘彎曲細部微調
// 已用Node.js模擬驗證：非對稱的雙目標（不同高度/左右不對稱）也能精確收斂（誤差0.0000）。










function solveDualHandAnchor(...args){
  return limbController.solveDualHandAnchor(...args);
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
function rebuildIKDrivenKeys(...args){
  return jointOwnership.rebuildIKDrivenKeys(...args);
}

// 判斷某個關節 key 目前是否被「開啟中的 IK」接管（root/mid 骨骼），是的話 FK 迴圈要跳過它。
// 保留這個函式名當薄包裝，之後若有其他呼叫端不必跟著改寫。
function isIKDrivenKey(...args){
  return jointOwnership.isIKDrivenKey(...args);
}

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






// skipMatrixUpdate=true：呼叫端保證世界矩陣已是最新（例如剛跑完 renderer.render()，
// 或同一批流程開頭已經自己更新過一次），可省掉重複的 model.updateWorldMatrix()。
// 一次要算好幾個視角時，這個旗標讓整批只更新一次而不是每個視角各更新一次。
function getModelBoundsInfo(...args){
  return cameraController.getModelBoundsInfo(...args);
}

// 算出「要讓一個半寬 halfW、半高 halfH 的平面完整入鏡」所需的鏡頭距離，
// 同時考慮目前畫面的寬高比（aspect 較窄的直向手機畫面，水平視角會比垂直視角更容易先裁到）。
// marginFactor > 1 用來留一點邊界，避免角色貼著畫面邊緣。
// aspect 可選：不傳時沿用主鏡頭的長寬比（原本的行為）。分割視窗的小 canvas
// 長寬比跟主畫面完全不同（例如主畫面 2.4、預覽視窗 1.6），沿用主鏡頭的值算出來的
// 距離會太近或太遠、把角色裁掉，所以那邊改成傳入該預覽視窗自己的 aspect。
function computeFitDistance(...args){
  return cameraController.computeFitDistance(...args);
}

// 手部特寫用的包圍範圍：只抓該手掌骨本身＋該手5指指尖 effector 的目前世界座標，
// 不像 getModelBoundsInfo() 抓全身，這樣特寫時才不會因為身體其他部位太遠而把手縮得很小。
function getHandBoundsInfo(...args){
  return cameraController.getHandBoundsInfo(...args);
}

// 算出「右手特寫」/「左手特寫」鏡頭預設值：以該手掌＋手指目前的世界座標為中心，
// 從「稍微前方、稍微上方、並往身體外側偏一點」的角度拍，比正前方更容易看清手指張合，
// 也比較不會被前臂/身體擋住。外側偏移方向用 hips 骨盆 x 座標跟手掌中心比較後自動判斷
// （而不是直接寫死 r=偏一邊、l=偏另一邊），這樣即使角色擺出交叉手臂之類的姿勢，
// 鏡頭仍會往手實際所在的那一側偏，不會反而拍到手背。


function computeHandCameraPreset(...args){
  return cameraController.computeHandCameraPreset(...args);
}

// 全身類視角（相對於 rhand/lhand 這種手部特寫）的名稱清單
const CAMERA_BODY_VIEW_NAMES = ["front", "back", "left", "right", "top", "iso"];

// 模型/骨骼尚未就緒時的退回值（跟舊版邏輯一致，只是理論上不會真的走到這裡）
function fallbackBodyCameraPreset(...args){
  return cameraController.fallbackBodyCameraPreset(...args);
}

// 依「已經量好的包圍盒 info」算出「單一個」全身視角的鏡頭參數。
// 為什麼要拆出來只算一個：分割視窗一次要算好幾個視角，但包圍盒量測
// （getModelBoundsInfo，會遍歷 50 根骨骼＋10 個指尖）是整批共用的成本，
// 不該每個視角各量一次；更不該為了拿「正面」而順便把兩個手部特寫也算出來。
// aspect 可選：分割視窗傳自己那顆小 canvas 的長寬比，取景才不會被裁到。

function computeBodyCameraPreset(...args){
  return cameraController.computeBodyCameraPreset(...args);
}

// 對外單取入口：只算被要求的那一個視角。
// 「鏡頭」下拉選單一次只切換到一個視角，過去卻要把 8 個視角（含兩次手部特寫、
// 三次完整世界矩陣重算）全部算完再丟掉 7 個——這裡直接取需要的那個就好。
function getCameraPreset(...args){
  return cameraController.getCameraPreset(...args);
}

// 保留「一次取得整份」的介面給真的需要全部視角的呼叫端（目前沒有，留作相容用）。
// 這裡自己先更新一次世界矩陣，下面各視角就全部帶 skipMatrixUpdate=true，
// 整批只更新一次而不是每個視角各更新一次。
function getCameraPresets(...args){
  return cameraController.getCameraPresets(...args);
}

// 平滑過渡到某個預設視角（不直接瞬間跳，體感較不突兀）；updateCameraTween() 每幀推進。
// instant=true 時直接套用不做過渡動畫（用於初始載入模型時，避免畫面一開始還要飛一段）。
function goToCameraPreset(...args){
  return cameraController.goToCameraPreset(...args);
}

function updateCameraTween(...args){
  return cameraController.updateCameraTween(...args);
}

function bindCameraUI(...args){
  return cameraController.bindCameraUI(...args);
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

function createSplitPane(...args){
  return splitViewController.createSplitPane(...args);
}

function destroySplitPane(...args){
  return splitViewController.destroySplitPane(...args);
}

function resizeSplitPane(...args){
  return splitViewController.resizeSplitPane(...args);
}

function resizeAllSplitPanes(...args){
  return splitViewController.resizeAllSplitPanes(...args);
}

// 已開到上限時，把還沒勾選的其他 checkbox 先 disable 掉，避免使用者以為勾了卻沒反應。
// 已勾選的一律強制解鎖（disabled=false）——修正還原上次分割視窗設定時的競態問題：
// createSplitPane() 建立到剛好第3個（滿上限）時會在它自己的 checkbox 還沒被標記勾選前就呼叫到這裡，
// 若只在「未勾選」才更新 disabled，那個 checkbox 就會被誤鎖住，之後即使補上 checked=true 也永遠解不開、
// 使用者會發現有一個分割視窗怎麼取消勾選都沒反應、關不掉。
function updateSplitViewCheckboxDisabled(...args){
  return splitViewController.updateSplitViewCheckboxDisabled(...args);
}

function saveSplitViewState(...args){
  return splitViewController.saveSplitViewState(...args);
}

function bindSplitViewUI(...args){
  return splitViewController.bindSplitViewUI(...args);
}

// 從 localStorage 還原上次開啟的預覽視窗（跟其他面板設定一樣的持久化模式）
function loadSplitViewState(...args){
  return splitViewController.loadSplitViewState(...args);
}

function initSplitView(...args){
  return splitViewController.initSplitView(...args);
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


// 讓下一幀無條件重新取景（開/關預覽視窗、視窗尺寸變動時呼叫）
function invalidateSplitViewFraming(...args){
  return splitViewController.invalidateSplitViewFraming(...args);
}

// animate() 每幀在主畫面渲染完之後呼叫：場景的 matrixWorld 這一幀已經由
// renderer.render() 算好，所以量包圍盒時一律帶 skipMatrixUpdate=true。
function updateSplitViewPanes(...args){
  return splitViewController.updateSplitViewPanes(...args);
}

function onResize(...args){
  return splitViewController.onResize(...args);
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



// 實際渲染幀率：只有真的呼叫 renderer.render() 才算一次。閒置降頻時這個數字
// 會明顯掉到約 IDLE_RENDER_INTERVAL_MS 對應的 fps，跟上面 rAF 頻率的落差
// 正好就是「閒置降頻機制省下來的量」，方便直接驗證該機制有沒有在運作。




const PERF_DOM_UPDATE_INTERVAL_MS = 250; // DOM 文字更新節流，數字本身每幀都在算，只是畫面沒必要每幀都重繪文字

function initPerfPanel(...args){
  return performancePanelController.initPerfPanel(...args);
}

// 每次 requestAnimationFrame 回呼「一開始」呼叫一次，量測瀏覽器實際排程給我們的頻率。
function perfTickRaf(...args){
  return performancePanelController.perfTickRaf(...args);
}

// 只有這一幀真的渲染了才呼叫，量測「畫面實際更新」的頻率。
function perfTickRender(...args){
  return performancePanelController.perfTickRender(...args);
}

// idle：是否正處於閒置降頻狀態（由 animate() 傳入，不在這裡重算）。
// didRenderThisFrame：這一幀是否真的跑到 renderer.render()（idle 跳幀時為 false）。
function updatePerfPanelDom(...args){
  return performancePanelController.updatePerfPanelDom(...args);
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




// 回傳這一幀相機（位置＋看點）是否還在移動中（含 OrbitControls 阻尼滑動、拖曳、滾輪縮放）。
// 呼叫端保證每幀都會呼叫一次（不能因為進入閒置模式就跳過呼叫，否則快照會停在舊值，
// 之後使用者移動相機時第一幀的 delta 會被誤判成一大段瞬移）。
function isCameraStillMoving(...args){
  return animationLoopController.isCameraStillMoving(...args);
}

// posesStillMoving：由呼叫端傳入 updateBones() 這一幀的回傳值（避免這裡重算一次）。
// 只要下列任何一項成立，這一幀就必須視為「場景活躍中」，不能被閒置降頻邏輯跳過：
function isSceneActive(...args){
  return animationLoopController.isSceneActive(...args);
}

const IDLE_THRESHOLD_FRAMES = 30;    // 連續約0.5秒（60fps下）沒有變化才視為進入閒置狀態，避免收斂尾段的抖動被誤判成「又活躍了」
const IDLE_RENDER_INTERVAL_MS = 100; // 閒置狀態下，重運算＋渲染降到約每100ms一次（~10fps）；一有輸入立刻恢復全速



function animate(...args){
  return animationLoopController.animate(...args);
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

const snapshots = createSnapshots({
  snapshotGrabProject(){
    const snapshot=grabBoxCore?.snapshot();
    if(!snapshot || snapshot.revision===0)return undefined;
    const {revision,messageKey,...state}=snapshot;
    return {...state,version:1,target:poseController.snapshotTarget()};
  },
  get poseController(){ return poseController; },
  get snapshotTG(){ return snapshotTG; },
  get snapshotGenerationRules(){ return snapshotGenerationRules; },
  get waveClone(){ return waveClone; },
  get waveClips(){ return waveClips; },
  get cleanWave(){ return cleanWave; },
  get waveConfig(){ return waveConfig; },
  get cleanLAPath(){ return cleanLAPath; },
  get laPathConfig(){ return laPathConfig; },
  get snapshotTorsoLookAt(){ return snapshotTorsoLookAt; },
  get snapshotHandAim(){ return snapshotHandAim; },
  get snapshotPoleEditor(){ return snapshotPoleEditor; },
  get snapshotFootPlant(){ return snapshotFootPlant; },
  get keyframes(){ return keyframes; },
  get grooveSequence(){ return grooveSequence; },
  get kfEditingIndex(){ return kfEditingIndex; },
  get poseIndex(){ return poseIndex; },
  get kfPendingEasing(){ return kfPendingEasing; },
  get kfPendingBeats(){ return kfPendingBeats; },
  get TRAJ_MODE(){ return TRAJ_MODE; },
  get TRAJ_CLOSED(){ return TRAJ_CLOSED; },
  get bpm(){ return bpm; },
  get grooveJointSet(){ return grooveJointSet; },
  get grooveCustomParams(){ return grooveCustomParams; },
  get grooveSquatEnabled(){ return grooveSquatEnabled; },
  get grooveSquatCustom(){ return grooveSquatCustom; },
  get grooveWarmupEnabled(){ return grooveWarmupEnabled; },
  get grooveWarmupBeats(){ return grooveWarmupBeats; },
  get grooveWarmupCurve(){ return grooveWarmupCurve; },
  get IK_LIMB_KEYS(){ return IK_LIMB_KEYS; },
  get trajPointMeshes(){ return trajPointMeshes; },
});
const history = createHistory({
  capture: snapshotAngleState, restore: restoreSnapshot,
  isBlocked: () => kfPlaying, onChange: updateUndoRedoButtons,
});
const autosave = createAutosave({
  getStorage: () => localStorage, capture: snapshotTimelineData,
  onSaved: showAutosaveIndicator,
  onError: error => console.warn(t("自動存檔失敗："), error),
});
const projectFiles = createProjectFiles({
  getKeyframes: () => keyframes, snapshotTimelineData, downloadJSON, readJSONFile,
  restoreTimelineData, pushHistory, scheduleAutoSave,
  alert: message => alert(message), confirm: message => confirm(message),
});

const libraryStore = createLibraryStore({
  getStorage: () => localStorage, getKeys: LIB_STORAGE_KEYS,
  downloadJSON, alert: message => alert(message), onUsageChange: renderStorageUsageIndicator,
});
const libraryDependencies = {
  loadLibraryFromStorage, saveLibraryToStorage, renderLibList, pushHistory,
  downloadJSON, sanitizeFilename, makeLibId, readJSONFile,
  alert: message => alert(message), confirm: message => confirm(message),
  prompt: (message, value) => prompt(message, value),
};

const timelineSelection = createTimelineSelection({
  get timelineClipboard(){ return timelineClipboard; },
  set timelineClipboard(value){ timelineClipboard = value; },
  get kfMultiSelected(){ return kfMultiSelected; },
  set kfMultiSelected(value){ kfMultiSelected = value; },
  get grooveMultiSelected(){ return grooveMultiSelected; },
  set grooveMultiSelected(value){ grooveMultiSelected = value; },
  get kfMultiSelectMode(){ return kfMultiSelectMode; },
  set kfMultiSelectMode(value){ kfMultiSelectMode = value; },
  get kfEditingIndex(){ return kfEditingIndex; },
  set kfEditingIndex(value){ kfEditingIndex = value; },
  get grooveSeqSelectedIndex(){ return grooveSeqSelectedIndex; },
  set grooveSeqSelectedIndex(value){ grooveSeqSelectedIndex = value; },
  get kfPlaying(){ return kfPlaying; },
  get keyframes(){ return keyframes; },
  get grooveSequence(){ return grooveSequence; },
  confirm: message => confirm(message),
  syncEasingControlsFromSelection,
  stopKeyframePlayback,
  renderKeyframeChips,
  renderGrooveSeqChips,
  scheduleAutoSave,
  pushHistory,
  makeLibId,
});

const rangeEditor = createRangeEditor({
  get kfMultiSelected(){ return kfMultiSelected; },
  set kfMultiSelected(value){ kfMultiSelected = value; },
  get grooveMultiSelected(){ return grooveMultiSelected; },
  set grooveMultiSelected(value){ grooveMultiSelected = value; },
  get kfEditingIndex(){ return kfEditingIndex; },
  set kfEditingIndex(value){ kfEditingIndex = value; },
  get grooveSeqSelectedIndex(){ return grooveSeqSelectedIndex; },
  set grooveSeqSelectedIndex(value){ grooveSeqSelectedIndex = value; },
  get kfPlaying(){ return kfPlaying; },
  get keyframes(){ return keyframes; },
  get grooveSequence(){ return grooveSequence; },
  get beatGridRangeStart(){ return beatGridRangeStart; },
  set beatGridRangeStart(value){ beatGridRangeStart = value; },
  get beatGridRangeEnd(){ return beatGridRangeEnd; },
  set beatGridRangeEnd(value){ beatGridRangeEnd = value; },
  get beatGridRangeClipboard(){ return beatGridRangeClipboard; },
  set beatGridRangeClipboard(value){ beatGridRangeClipboard = value; },
  get beatGridRangeLoop(){ return beatGridRangeLoop; },
  set beatGridRangeLoop(value){ beatGridRangeLoop = value; },
  get beatGridRangeDrag(){ return beatGridRangeDrag; },
  set beatGridRangeDrag(value){ beatGridRangeDrag = value; },
  get kfLoop(){ return kfLoop; },
  set kfLoop(value){ kfLoop = value; },
  get BEAT_GRID_SNAP(){ return BEAT_GRID_SNAP; },
  get BEAT_GRID_LABEL_W(){ return BEAT_GRID_LABEL_W; },
  get BEAT_GRID_PX_PER_BEAT(){ return BEAT_GRID_PX_PER_BEAT; },
  get waveClips(){ return waveClips; },
  confirm: message => confirm(message),
  syncEasingControlsFromSelection,
  stopKeyframePlayback,
  renderKeyframeChips,
  renderGrooveSeqChips,
  scheduleAutoSave,
  pushHistory,
  makeLibId,
  beatGridTimelineBeats,
  formatBeatValue,
  keyframeStartBeat,
  grooveSegmentStartBeat,
  wavePlaybackEnd,
  beatGridPoseTotalBeats,
  updateKfMultiSelectBar,
  deepCloneTimelineItem,
});

const limbController = createLimbController({
  get ikRootFollowEnabled(){ return ikRootFollowEnabled; },
  get bones(){ return bones; },
  get ikTargetMeshes(){ return ikTargetMeshes; },
  get model(){ return model; },
  get ROOT_FOLLOW_LERP_T(){ return ROOT_FOLLOW_LERP_T; },
  set ROOT_FOLLOW_LERP_T(value){ ROOT_FOLLOW_LERP_T = value; },
  get syncTargetFromBone(){ return syncTargetFromBone; },
  get dualAnchorEnabled(){ return dualAnchorEnabled; },
  set dualAnchorEnabled(value){ dualAnchorEnabled = value; },
  get ikEnabled(){ return ikEnabled; },
  get shoulderAssistEnabled(){ return shoulderAssistEnabled; },
  set shoulderAssistEnabled(value){ shoulderAssistEnabled = value; },
  get ikPoleMeshes(){ return ikPoleMeshes; },
  get ikPoleLines(){ return ikPoleLines; },
  get footLockedWorldQuat(){ return footLockedWorldQuat; },
  get effectorOrientEnabled(){ return effectorOrientEnabled; },
  get isFootPlanted(){ return isFootPlanted; },
  get setLookAtEnabled(){ return setLookAtEnabled; },
  get waveRun(){ return waveRun; },
  get waveHasBody(){ return waveHasBody; },
  get waveSides(){ return waveSides; },
  get stopWave(){ return stopWave; },
  get kfPlaying(){ return kfPlaying; },
  get grabBoxCore(){ return grabBoxCore; },
  get rebuildIKDrivenKeys(){ return rebuildIKDrivenKeys; },
  get markerMeshes(){ return markerMeshes; },
  get markerIKHidden(){ return markerIKHidden; },
  get selectedIK(){ return selectedIK; },
  set selectedIK(value){ selectedIK = value; },
  get deselectJoint(){ return deselectJoint; },
  get FOOT_PLANT_LIMBS(){ return FOOT_PLANT_LIMBS; },
  get footPlantEnabled(){ return footPlantEnabled; },
  set footPlantEnabled(value){ footPlantEnabled = value; },
  get captureFootPlant(){ return captureFootPlant; },
  get footPlantAnchors(){ return footPlantAnchors; },
  get footPlantSafe(){ return footPlantSafe; },
  set footPlantSafe(value){ footPlantSafe = value; },
  get updateFootPlantUI(){ return updateFootPlantUI; },
  get poleRadius(){ return poleRadius; },
  get scene(){ return scene; },
  get tgCancelPreview(){ return tgCancelPreview; },
  get waveTrackActive(){ return waveTrackActive; },
  set waveTrackActive(value){ waveTrackActive = value; },
  get laPathRun(){ return laPathRun; },
  get headFollowSource(){ return headFollowSource; },
  get handFollowSource(){ return handFollowSource; },
  get selectedKey(){ return selectedKey; },
  set selectedKey(value){ selectedKey = value; },
  get transformControls(){ return transformControls; },
  get spineIKTargetMesh(){ return spineIKTargetMesh; },
  get lookAtTargetMesh(){ return lookAtTargetMesh; },
  get fingerIKTargetMeshes(){ return fingerIKTargetMeshes; },
  get trajPointMeshes(){ return trajPointMeshes; },
  get transformControlsIK(){ return transformControlsIK; },
  get highlightMarkers(){ return highlightMarkers; },
  get updateSelectedBar(){ return updateSelectedBar; },
  get renderTrajPointList(){ return renderTrajPointList; },
  get pushHistory(){ return pushHistory; },
  get setFootPlantEnabled(){ return setFootPlantEnabled; },
  get solveFootPlant(){ return solveFootPlant; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get setSpineIKEnabled(){ return setSpineIKEnabled; },
  get spineIKEnabled(){ return spineIKEnabled; },
  get updateSpineIKButton(){ return updateSpineIKButton; },
  get spineRootFollowEnabled(){ return spineRootFollowEnabled; },
  set spineRootFollowEnabled(value){ spineRootFollowEnabled = value; },
  get lookAtEnabled(){ return lookAtEnabled; },
  get updateLookAtButtons(){ return updateLookAtButtons; },
  get handCollisionEnabled(){ return handCollisionEnabled; },
  set handCollisionEnabled(value){ handCollisionEnabled = value; },
  get handHandCollisionEnabled(){ return handHandCollisionEnabled; },
  set handHandCollisionEnabled(value){ handHandCollisionEnabled = value; },
  get ALL_BODY_CAPSULES(){ return ALL_BODY_CAPSULES; },
  get HAND_COLLISION_RADIUS(){ return HAND_COLLISION_RADIUS; },
  set HAND_COLLISION_RADIUS(value){ HAND_COLLISION_RADIUS = value; },
  get saveHandCollisionRadii(){ return saveHandCollisionRadii; },
  get ALL_BODY_CAPSULE_RADIUS_DEFAULTS(){ return ALL_BODY_CAPSULE_RADIUS_DEFAULTS; },
  get HAND_COLLISION_RADIUS_DEFAULT(){ return HAND_COLLISION_RADIUS_DEFAULT; },
  get spineCCDDamping(){ return spineCCDDamping; },
  set spineCCDDamping(value){ spineCCDDamping = value; },
  get selectBodyMarker(){ return selectBodyMarker; },
});

const spineController = createSpineController({
  get spineRootFollowEnabled(){ return spineRootFollowEnabled; },
  get spineIKEnabled(){ return spineIKEnabled; },
  set spineIKEnabled(value){ spineIKEnabled = value; },
  get bones(){ return bones; },
  get spineIKTargetMesh(){ return spineIKTargetMesh; },
  set spineIKTargetMesh(value){ spineIKTargetMesh = value; },
  get model(){ return model; },
  get ROOT_FOLLOW_LERP_T(){ return ROOT_FOLLOW_LERP_T; },
  get spineCCDDamping(){ return spineCCDDamping; },
  get syncTargetFromBone(){ return syncTargetFromBone; },
  get scene(){ return scene; },
  get waveRun(){ return waveRun; },
  get stopWave(){ return stopWave; },
  get rebuildIKDrivenKeys(){ return rebuildIKDrivenKeys; },
  get markerMeshes(){ return markerMeshes; },
  get markerIKHidden(){ return markerIKHidden; },
  get lookAtEnabled(){ return lookAtEnabled; },
  get setLookAtEnabled(){ return setLookAtEnabled; },
  get selectedIK(){ return selectedIK; },
  get deselectJoint(){ return deselectJoint; },
});

const fingerTutController = createFingerTut({
  get bones(){return bones;}, get model(){return model;}, get modelHeight(){return modelHeight;},
  pose:poseController, pushHistory, save:scheduleAutoSave,
  isGrabbing:()=>Object.values(grabBoxCore?.getState().grabbed||{}).some(Boolean),
  fitDistance:(w,h,m)=>cameraController.computeFitDistance(w,h,m),
  focusInset:()=>window.matchMedia('(pointer:coarse)').matches?0:.1,
  captureCamera:()=>({position:camera.position.toArray(),target:controls.target.toArray(),displayCollapsed:document.getElementById('displayTogglesPanel')?.classList.contains('collapsed')||false}),
  restoreCamera(state){cameraTween=null;camera.position.fromArray(state.position);controls.target.fromArray(state.target);if(typeof state.displayCollapsed==='boolean')setDisplayTogglesCollapsed(state.displayCollapsed);controls.update();},
  stop(){
    if(kfPlaying)stopKeyframePlayback();
    if(waveRun)stopWave();
    tgCancelPreview();
    if(groovePreviewEnabled)document.getElementById('groovePreviewBtn').click();
  },
  prepare(){
    for(const limb of ['rArm','lArm']){setIKEnabled(limb,false);setLookAtEnabled(limb==='rArm'?'rHand':'lHand',false);}
    for(const id of FINGER_IDS)setFingerIKEnabled(id,false);
    deselectJoint();
  },
  prepareOrientation(side){
    setIKEnabled(side+'Arm',false);
    setLookAtEnabled(side+'Hand',false);
    for(const id of FINGER_IDS.filter(id=>id[0]===side))setFingerIKEnabled(id,false);
    deselectJoint();
  },
  captureRig(){
    return { arms:Object.fromEntries(['rArm','lArm'].map(id=>[id,{enabled:ikEnabled[id],orient:effectorOrientEnabled[id],target:ikTargetMeshes[id]?.position.toArray(),quaternion:ikTargetMeshes[id]?.quaternion.toArray(),pole:ikPoleMeshes[id]?.position.toArray()}])),
      fingers:Object.fromEntries(FINGER_IDS.map(id=>[id,{enabled:fingerIKEnabled[id],target:fingerIKTargetMeshes[id]?.position.toArray()}])),handAim:snapshotHandAim() };
  },
  restoreRig(state){
    if(!state)return;
    restoreHandAim(state.handAim);
    for(const [id,s]of Object.entries(state.arms)){
      setIKEnabled(id,s.enabled);effectorOrientEnabled[id]=s.orient;
      if(s.target)ikTargetMeshes[id].position.fromArray(s.target);
      if(s.quaternion)ikTargetMeshes[id].quaternion.fromArray(s.quaternion);
      if(s.pole)ikPoleMeshes[id].position.fromArray(s.pole);
    }
    for(const [id,s]of Object.entries(state.fingers)){setFingerIKEnabled(id,s.enabled);if(s.target)fingerIKTargetMeshes[id].position.fromArray(s.target);}
    updateEffectorOrientButtons();rebuildIKDrivenKeys();
  }
});

const fingerController = createFingerController({
  get fingerIKEnabled(){ return fingerIKEnabled; },
  get bones(){ return bones; },
  get fingerEffectorBones(){ return fingerEffectorBones; },
  get fingerIKTargetMeshes(){ return fingerIKTargetMeshes; },
  get syncTargetFromBone(){ return syncTargetFromBone; },
  get scene(){ return scene; },
  get waveRun(){ return waveRun; },
  get waveHasBody(){ return waveHasBody; },
  get waveSides(){ return waveSides; },
  get stopWave(){ return stopWave; },
  get rebuildIKDrivenKeys(){ return rebuildIKDrivenKeys; },
  get markerMeshes(){ return markerMeshes; },
  get markerIKHidden(){ return markerIKHidden; },
  get selectedIK(){ return selectedIK; },
  get deselectJoint(){ return deselectJoint; },
  get selectJoint(){ return selectJoint; },
});

const footPlantController = createFootPlant({
  get footPlantEnabled(){ return footPlantEnabled; },
  set footPlantEnabled(value){ footPlantEnabled = value; },
  get ikEnabled(){ return ikEnabled; },
  get footPlantAnchors(){ return footPlantAnchors; },
  set footPlantAnchors(value){ footPlantAnchors = value; },
  get model(){ return model; },
  get FOOT_PLANT_LIMBS(){ return FOOT_PLANT_LIMBS; },
  get bones(){ return bones; },
  get footPlantCalibration(){ return footPlantCalibration; },
  get ikTargetMeshes(){ return ikTargetMeshes; },
  get footLockedWorldQuat(){ return footLockedWorldQuat; },
  get waveRun(){ return waveRun; },
  get waveHasBody(){ return waveHasBody; },
  get stopWave(){ return stopWave; },
  get kfPlaying(){ return kfPlaying; },
  get captureFootLock(){ return captureFootLock; },
  get footPlantSafe(){ return footPlantSafe; },
  set footPlantSafe(value){ footPlantSafe = value; },
  get footPlantLimited(){ return footPlantLimited; },
  set footPlantLimited(value){ footPlantLimited = value; },
  get footPlantNotice(){ return footPlantNotice; },
  set footPlantNotice(value){ footPlantNotice = value; },
  get deselectJoint(){ return deselectJoint; },
  get syncTargetFromBone(){ return syncTargetFromBone; },
  get ikPoleMeshes(){ return ikPoleMeshes; },
  get selectedIK(){ return selectedIK; },
  get bodyGizmoProxy(){ return bodyGizmoProxy; },
  get bodyProxyLastPos(){ return bodyProxyLastPos; },
  get updateIKPoleLines(){ return updateIKPoleLines; },
  get snapshotBodyTransform(){ return snapshotBodyTransform; },
  get effectorOrientEnabled(){ return effectorOrientEnabled; },
  get applyBodyTransform(){ return applyBodyTransform; },
  get setIKEnabled(){ return setIKEnabled; },
  get updateEffectorOrientButtons(){ return updateEffectorOrientButtons; },
});

const poleEditorController = createPoleEditor({
  get bones(){ return bones; },
  get poleRadiusCustom(){ return poleRadiusCustom; },
  set poleRadiusCustom(value){ poleRadiusCustom = value; },
  get ikEnabled(){ return ikEnabled; },
  get ikPoleMeshes(){ return ikPoleMeshes; },
  get ikTargetMeshes(){ return ikTargetMeshes; },
  get poleDrag(){ return poleDrag; },
  set poleDrag(value){ poleDrag = value; },
  get setIKEnabled(){ return setIKEnabled; },
  get selectedIK(){ return selectedIK; },
  get kfPlaying(){ return kfPlaying; },
  get pushHistory(){ return pushHistory; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get poleRangeHelper(){ return poleRangeHelper; },
  set poleRangeHelper(value){ poleRangeHelper = value; },
  get scene(){ return scene; },
});

const orientationController = createOrientationController({
  isGrabPalmAligned:name=>grabBoxCore?.isPalmAligned(name==="rHand"?"rArm":name==="lHand"?"lArm":""),
  get bones(){ return bones; },
  get handAimAxes(){ return handAimAxes; },
  get handAim(){ return handAim; },
  get handFollowLast(){ return handFollowLast; },
  get lookAtTargetMesh(){ return lookAtTargetMesh; },
  get HAND_AIM_NAMES(){ return HAND_AIM_NAMES; },
  get handFollowSource(){ return handFollowSource; },
  get lookAtEnabled(){ return lookAtEnabled; },
  get kfPlaying(){ return kfPlaying; },
  get pushHistory(){ return pushHistory; },
  get selectedIK(){ return selectedIK; },
  set selectedIK(value){ selectedIK = value; },
  get deselectJoint(){ return deselectJoint; },
  get handRangeDrag(){ return handRangeDrag; },
  set handRangeDrag(value){ handRangeDrag = value; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get laPathConfig(){ return laPathConfig; },
  set laPathConfig(value){ laPathConfig = value; },
  get laPathRun(){ return laPathRun; },
  set laPathRun(value){ laPathRun = value; },
  get laCustomMeshes(){ return laCustomMeshes; },
  set laCustomMeshes(value){ laCustomMeshes = value; },
  get transformControls(){ return transformControls; },
  get selectedKey(){ return selectedKey; },
  set selectedKey(value){ selectedKey = value; },
  get transformControlsIK(){ return transformControlsIK; },
  get updateSelectedBar(){ return updateSelectedBar; },
  get laCustomDrag(){ return laCustomDrag; },
  set laCustomDrag(value){ laCustomDrag = value; },
  get scene(){ return scene; },
  get laPathLine(){ return laPathLine; },
  set laPathLine(value){ laPathLine = value; },
  get handAimRange(){ return handAimRange; },
  get LOOKAT_RANGE_NAMES(){ return LOOKAT_RANGE_NAMES; },
  get syncTargetFromBone(){ return syncTargetFromBone; },
  get waveRun(){ return waveRun; },
  get stopWave(){ return stopWave; },
  get headFollowSource(){ return headFollowSource; },
  set headFollowSource(value){ headFollowSource = value; },
  get bpm(){ return bpm; },
  get handRangeHelper(){ return handRangeHelper; },
  set handRangeHelper(value){ handRangeHelper = value; },
  get bindWave(){ return bindWave; },
  get bindTG(){ return bindTG; },
  get effectorOrientEnabled(){ return effectorOrientEnabled; },
  get rebuildIKDrivenKeys(){ return rebuildIKDrivenKeys; },
  get updateEffectorOrientButtons(){ return updateEffectorOrientButtons; },
  get waveHasBody(){ return waveHasBody; },
  get waveSides(){ return waveSides; },
  get spineIKEnabled(){ return spineIKEnabled; },
  get setSpineIKEnabled(){ return setSpineIKEnabled; },
});

const trajectoryEditor = createTrajectoryEditor({
  get scene(){ return scene; },
  get trajLine(){ return trajLine; },
  get trajActiveLimb(){ return trajActiveLimb; },
  set trajActiveLimb(value){ trajActiveLimb = value; },
  get trajPointMeshes(){ return trajPointMeshes; },
  get ikTargetMeshes(){ return ikTargetMeshes; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get TRAJ_SHAPE_PLANE_AXES(){ return TRAJ_SHAPE_PLANE_AXES; },
  get TRAJ_MODE(){ return TRAJ_MODE; },
  get TRAJ_CLOSED(){ return TRAJ_CLOSED; },
  get pushHistory(){ return pushHistory; },
  get selectedIK(){ return selectedIK; },
  get deselectJoint(){ return deselectJoint; },
  get selectIKMarker(){ return selectIKMarker; },
  get ikEnabled(){ return ikEnabled; },
  get bones(){ return bones; },
  get trajSampleCount(){ return trajSampleCount; },
  set trajSampleCount(value){ trajSampleCount = value; },
  get ikPoleMeshes(){ return ikPoleMeshes; },
  get solveRootFollowForLimb(){ return solveRootFollowForLimb; },
  get shoulderAssistEnabled(){ return shoulderAssistEnabled; },
  get solveShoulderAssist(){ return solveShoulderAssist; },
  get syncTargetFromBone(){ return syncTargetFromBone; },
  get applyFootLock(){ return applyFootLock; },
  get applyEffectorOrientation(){ return applyEffectorOrientation; },
  get addKeyframe(){ return addKeyframe; },
  get keyframes(){ return keyframes; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
});

const handCollisionController = createHandCollision({
  get handCollisionEnabled(){ return handCollisionEnabled; },
  get waveRun(){ return waveRun; },
  get isBakedWavePlaying(){ return isBakedWavePlaying; },
  get HAND_COLLISION_LIMBS(){ return HAND_COLLISION_LIMBS; },
  get ikEnabled(){ return ikEnabled; },
  get bones(){ return bones; },
  get draggingKey(){ return draggingKey; },
  get _hcHandPos(){ return _hcHandPos; },
  get ALL_BODY_CAPSULES(){ return ALL_BODY_CAPSULES; },
  get _hcA(){ return _hcA; },
  get _hcB(){ return _hcB; },
  get HAND_COLLISION_RADIUS(){ return HAND_COLLISION_RADIUS; },
  get _hcPushDir(){ return _hcPushDir; },
  get syncTargetFromBone(){ return syncTargetFromBone; },
  get handHandCollisionEnabled(){ return handHandCollisionEnabled; },
});

const collisionView = createCollisionView({
  get handCollisionVizGroup(){ return handCollisionVizGroup; },
  set handCollisionVizGroup(value){ handCollisionVizGroup = value; },
  get ALL_BODY_CAPSULES(){ return ALL_BODY_CAPSULES; },
  get handCollisionVizCapsuleMeshes(){ return handCollisionVizCapsuleMeshes; },
  get HAND_COLLISION_LIMBS(){ return HAND_COLLISION_LIMBS; },
  get handCollisionVizHandMeshes(){ return handCollisionVizHandMeshes; },
  get scene(){ return scene; },
  get handCollisionVizEnabled(){ return handCollisionVizEnabled; },
  get bones(){ return bones; },
  get _hcA(){ return _hcA; },
  get _hcB(){ return _hcB; },
  get HAND_COLLISION_VIZ_EPS(){ return HAND_COLLISION_VIZ_EPS; },
  get _hcPushDir(){ return _hcPushDir; },
  get _hcHandPos(){ return _hcHandPos; },
  get HAND_COLLISION_RADIUS(){ return HAND_COLLISION_RADIUS; },
});

const jointOwnership = createJointOwnership({
  get ikDrivenKeys(){ return ikDrivenKeys; },
  get ikEnabled(){ return ikEnabled; },
  get spineIKEnabled(){ return spineIKEnabled; },
  get lookAtEnabled(){ return lookAtEnabled; },
  get fingerIKEnabled(){ return fingerIKEnabled; },
  get grooveBlockedKeys(){ return grooveBlockedKeys; },
});

const tuttingController = createTuttingController({
  get model(){ return model; },
  get kfPlaying(){ return kfPlaying; },
  get waveRun(){ return waveRun; },
  get laPathRun(){ return laPathRun; },
  get groovePreviewEnabled(){ return groovePreviewEnabled; },
  get waveTrackActive(){ return waveTrackActive; },
  get ikEnabled(){ return ikEnabled; },
  get spineIKEnabled(){ return spineIKEnabled; },
  get fingerIKEnabled(){ return fingerIKEnabled; },
  get lookAtEnabled(){ return lookAtEnabled; },
  get footPlantEnabled(){ return footPlantEnabled; },
  get handCollisionEnabled(){ return handCollisionEnabled; },
  get handHandCollisionEnabled(){ return handHandCollisionEnabled; },
  get bones(){ return bones; },
  get restQuat(){ return restQuat; },
  get applyBodyTransform(){ return applyBodyTransform; },
  get tgPreview(){ return tgPreview; },
  set tgPreview(value){ tgPreview = value; },
  get poseController(){ return poseController; },
  get tgCandidates(){ return tgCandidates; },
  set tgCandidates(value){ tgCandidates = value; },
  get tgIndex(){ return tgIndex; },
  set tgIndex(value){ tgIndex = value; },
  get tgSignature(){ return tgSignature; },
  set tgSignature(value){ tgSignature = value; },
  get tgConfig(){ return tgConfig; },
  set tgConfig(value){ tgConfig = value; },
  get JOINT_LIMITS(){ return JOINT_LIMITS; },
  set JOINT_LIMITS(value){ JOINT_LIMITS = value; },
  get tgBase(){ return tgBase; },
  set tgBase(value){ tgBase = value; },
  get pushHistory(){ return pushHistory; },
  get snapshotBodyTransform(){ return snapshotBodyTransform; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get clampJointAngles(){ return clampJointAngles; },
  get setActiveBtn(){ return setActiveBtn; },
  get updateSelectedBar(){ return updateSelectedBar; },
  get addKeyframe(){ return addKeyframe; },
  get isolationSettings(){ return isolationSettings; },
  set isolationSettings(value){ isolationSettings = value; },
  get defaultJointLimits(){ return defaultJointLimits; },
  get JOINT_LIMIT_KEYS(){ return JOINT_LIMIT_KEYS; },
  get saveJointLimits(){ return saveJointLimits; },
  get saveIsolationSettings(){ return saveIsolationSettings; },
  get buildJointLimitPanel(){ return buildJointLimitPanel; },
  get poseLibCtrl(){ return poseLibCtrl; },
});

const randomPoseGenerator = createRandomPoseGenerator({
  get isolationSettings(){ return isolationSettings; },
  get JOINT_LIMIT_KEYS(){ return JOINT_LIMIT_KEYS; },
  get bones(){ return bones; },
  get JOINT_LIMITS(){ return JOINT_LIMITS; },
  get poseController(){ return poseController; },
  get setTarget(){ return setTarget; },
  get setActiveBtn(){ return setActiveBtn; },
  get updateSelectedBar(){ return updateSelectedBar; },
  get updateJointLimitPanelAngles(){ return updateJointLimitPanelAngles; },
  get pushHistory(){ return pushHistory; },
});

const waveController = createWaveController({
  get WAVE_ROUTE_NODES(){ return WAVE_ROUTE_NODES; },
  get waveRun(){ return waveRun; },
  set waveRun(value){ waveRun = value; },
  get waveConfig(){ return waveConfig; },
  set waveConfig(value){ waveConfig = value; },
  get bpm(){ return bpm; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get WAVE_DEFAULT(){ return WAVE_DEFAULT; },
  get kfPlaying(){ return kfPlaying; },
  get groovePreviewEnabled(){ return groovePreviewEnabled; },
  get laPathRun(){ return laPathRun; },
  get footPlantEnabled(){ return footPlantEnabled; },
  get ikEnabled(){ return ikEnabled; },
  get fingerIKEnabled(){ return fingerIKEnabled; },
  get lookAtEnabled(){ return lookAtEnabled; },
  get spineIKEnabled(){ return spineIKEnabled; },
  get WAVE_SHAPE_HINTS(){ return WAVE_SHAPE_HINTS; },
  get WAVE_GAIN_FIELDS(){ return WAVE_GAIN_FIELDS; },
  get model(){ return model; },
  get bones(){ return bones; },
  get poseController(){ return poseController; },
  get tgCancelPreview(){ return tgCancelPreview; },
  get waveTrackActive(){ return waveTrackActive; },
  set waveTrackActive(value){ waveTrackActive = value; },
  get restQuat(){ return restQuat; },
  get deselectJoint(){ return deselectJoint; },
  get clampJointAngles(){ return clampJointAngles; },
  get snapshotBodyTransform(){ return snapshotBodyTransform; },
  get waveClips(){ return waveClips; },
  get waveClipSelected(){ return waveClipSelected; },
  set waveClipSelected(value){ waveClipSelected = value; },
  get kfEditingIndex(){ return kfEditingIndex; },
  set kfEditingIndex(value){ kfEditingIndex = value; },
  get keyframes(){ return keyframes; },
  get keyframeStartBeat(){ return keyframeStartBeat; },
  get beatGridPoseTotalBeats(){ return beatGridPoseTotalBeats; },
  get waveTrackEnd(){ return waveTrackEnd; },
  get waveClipOverlap(){ return waveClipOverlap; },
  get kfIndex(){ return kfIndex; },
  set kfIndex(value){ kfIndex = value; },
  get waveBaseAtBeat(){ return waveBaseAtBeat; },
  get applyBodyTransform(){ return applyBodyTransform; },
  get makeLibId(){ return makeLibId; },
  get pushHistory(){ return pushHistory; },
  get waveClone(){ return waveClone; },
  get kfMultiSelected(){ return kfMultiSelected; },
  get grooveMultiSelected(){ return grooveMultiSelected; },
  get grooveSeqSelectedIndex(){ return grooveSeqSelectedIndex; },
  set grooveSeqSelectedIndex(value){ grooveSeqSelectedIndex = value; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
  get waveTrackMessage(){ return waveTrackMessage; },
  get bindWaveTrack(){ return bindWaveTrack; },
});

const waveTrackController = createWaveTrack({
  get poseController(){ return poseController; },
  get waveClips(){ return waveClips; },
  set waveClips(value){ waveClips = value; },
  get beatGridPoseTotalBeats(){ return beatGridPoseTotalBeats; },
  get BEAT_GRID_SNAP(){ return BEAT_GRID_SNAP; },
  get makeLibId(){ return makeLibId; },
  get cleanWave(){ return cleanWave; },
  get waveClone(){ return waveClone; },
  get keyframes(){ return keyframes; },
  get applyBodyTransform(){ return applyBodyTransform; },
  get bones(){ return bones; },
  get restQuat(){ return restQuat; },
  get model(){ return model; },
  get locateKeyframeSegmentAtBeat(){ return locateKeyframeSegmentAtBeat; },
  get kfIndex(){ return kfIndex; },
  set kfIndex(value){ kfIndex = value; },
  get applyKeyframeFramePose(){ return applyKeyframeFramePose; },
  get waveTrackActive(){ return waveTrackActive; },
  set waveTrackActive(value){ waveTrackActive = value; },
  get waveHasBody(){ return waveHasBody; },
  get applyBakedWaveFeet(){ return applyBakedWaveFeet; },
  get grooveStartTime(){ return grooveStartTime; },
  get bpm(){ return bpm; },
  get beatGridRangeLoop(){ return beatGridRangeLoop; },
  get hasBeatGridRange(){ return hasBeatGridRange; },
  get beatGridRangeStart(){ return beatGridRangeStart; },
  get beatGridRangeEnd(){ return beatGridRangeEnd; },
  get kfLoop(){ return kfLoop; },
  get seekRunningPlaybackToBeat(){ return seekRunningPlaybackToBeat; },
  get stopKeyframePlayback(){ return stopKeyframePlayback; },
  get applyGroove(){ return applyGroove; },
  get applySquatGroove(){ return applySquatGroove; },
  get kfStartTime(){ return kfStartTime; },
  set kfStartTime(value){ kfStartTime = value; },
  get updatePlayingKeyframeHighlight(){ return updatePlayingKeyframeHighlight; },
  get updateBeatGridPlaybackUI(){ return updateBeatGridPlaybackUI; },
  get kfPlaying(){ return kfPlaying; },
  get waveClipSelected(){ return waveClipSelected; },
  set waveClipSelected(value){ waveClipSelected = value; },
  get kfEditingIndex(){ return kfEditingIndex; },
  set kfEditingIndex(value){ kfEditingIndex = value; },
  get grooveSeqSelectedIndex(){ return grooveSeqSelectedIndex; },
  set grooveSeqSelectedIndex(value){ grooveSeqSelectedIndex = value; },
  get kfMultiSelected(){ return kfMultiSelected; },
  get grooveMultiSelected(){ return grooveMultiSelected; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
  get renderGrooveSeqChips(){ return renderGrooveSeqChips; },
  get pushHistory(){ return pushHistory; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get stopWave(){ return stopWave; },
  get waveConfig(){ return waveConfig; },
  set waveConfig(value){ waveConfig = value; },
  get waveUI(){ return waveUI; },
  get beatGridTimelineBeats(){ return beatGridTimelineBeats; },
  get BEAT_GRID_PX_PER_BEAT(){ return BEAT_GRID_PX_PER_BEAT; },
  get bakeWaveToTimeline(){ return bakeWaveToTimeline; },
});

const grooveGenerator = createGrooveGenerator({
  get JOINT_LIMITS(){ return JOINT_LIMITS; },
  get GROOVE_ARCHETYPES(){ return GROOVE_ARCHETYPES; },
  get GROOVE_CHAIN_ORDER(){ return GROOVE_CHAIN_ORDER; },
  get GROOVE_PRESETS(){ return GROOVE_PRESETS; },
  get GROOVE_GEN_DISTAL_PROB_FALLBACK(){ return GROOVE_GEN_DISTAL_PROB_FALLBACK; },
  get GROOVE_ARM_PAIRS(){ return GROOVE_ARM_PAIRS; },
  get GROOVE_GEN_ENERGY_BUDGET(){ return GROOVE_GEN_ENERGY_BUDGET; },
  get GROOVE_GEN_DISTAL_ENERGY_BONUS(){ return GROOVE_GEN_DISTAL_ENERGY_BONUS; },
});

const grooveController = createGrooveController({
  get GROOVE_PRESETS(){ return GROOVE_PRESETS; },
  get grooveCustomParams(){ return grooveCustomParams; },
  get grooveWarmupEnabled(){ return grooveWarmupEnabled; },
  get grooveWarmupBeats(){ return grooveWarmupBeats; },
  get grooveWarmupCurve(){ return grooveWarmupCurve; },
  get grooveLastSegIndex(){ return grooveLastSegIndex; },
  set grooveLastSegIndex(value){ grooveLastSegIndex = value; },
  get grooveLastSegSnapshot(){ return grooveLastSegSnapshot; },
  set grooveLastSegSnapshot(value){ grooveLastSegSnapshot = value; },
  get grooveXfade(){ return grooveXfade; },
  set grooveXfade(value){ grooveXfade = value; },
  get grooveStartTime(){ return grooveStartTime; },
  get bpm(){ return bpm; },
  get grooveSequence(){ return grooveSequence; },
  get getGrooveActiveSegment(){ return getGrooveActiveSegment; },
  get lastValidGrooveSeqItem(){ return lastValidGrooveSeqItem; },
  set lastValidGrooveSeqItem(value){ lastValidGrooveSeqItem = value; },
  get grooveJointSet(){ return grooveJointSet; },
  get GROOVE_XFADE_BEATS(){ return GROOVE_XFADE_BEATS; },
  get bones(){ return bones; },
});

const squatController = createSquatController({
  get GROOVE_SQUAT_DEFAULT(){ return GROOVE_SQUAT_DEFAULT; },
  get grooveSquatCustom(){ return grooveSquatCustom; },
  get bones(){ return bones; },
  get grooveSquatFootAnchor(){ return grooveSquatFootAnchor; },
  set grooveSquatFootAnchor(value){ grooveSquatFootAnchor = value; },
  get grooveSquatFootLockedQuat(){ return grooveSquatFootLockedQuat; },
  set grooveSquatFootLockedQuat(value){ grooveSquatFootLockedQuat = value; },
  get grooveSquatAnchored(){ return grooveSquatAnchored; },
  set grooveSquatAnchored(value){ grooveSquatAnchored = value; },
  get squatLastSegIndex(){ return squatLastSegIndex; },
  set squatLastSegIndex(value){ squatLastSegIndex = value; },
  get squatLastSegSnapshot(){ return squatLastSegSnapshot; },
  set squatLastSegSnapshot(value){ squatLastSegSnapshot = value; },
  get squatXfade(){ return squatXfade; },
  set squatXfade(value){ squatXfade = value; },
  get bpm(){ return bpm; },
  get grooveSequence(){ return grooveSequence; },
  get getGrooveActiveSegment(){ return getGrooveActiveSegment; },
  get lastValidSquatSeqData(){ return lastValidSquatSeqData; },
  set lastValidSquatSeqData(value){ lastValidSquatSeqData = value; },
  get grooveSquatEnabled(){ return grooveSquatEnabled; },
  get GROOVE_XFADE_BEATS(){ return GROOVE_XFADE_BEATS; },
  get ikEnabled(){ return ikEnabled; },
  get _squatPreviewLastDelta(){ return _squatPreviewLastDelta; },
  get model(){ return model; },
  get grooveWarmupRamp(){ return grooveWarmupRamp; },
});

const groovePanelController = createGroovePanel({
  get GROOVE_JOINT_KEYS(){ return GROOVE_JOINT_KEYS; },
  get grooveJointSet(){ return grooveJointSet; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get grooveEditingKey(){ return grooveEditingKey; },
  set grooveEditingKey(value){ grooveEditingKey = value; },
  get grooveCustomParams(){ return grooveCustomParams; },
  set grooveCustomParams(value){ grooveCustomParams = value; },
  get GROOVE_PRESETS(){ return GROOVE_PRESETS; },
  get getGrooveParams(){ return getGrooveParams; },
  get GROOVE_ARCHETYPE_IDS(){ return GROOVE_ARCHETYPE_IDS; },
  get GROOVE_ARCHETYPES(){ return GROOVE_ARCHETYPES; },
  get grooveLastGenMeta(){ return grooveLastGenMeta; },
  set grooveLastGenMeta(value){ grooveLastGenMeta = value; },
  get grooveSquatEnabled(){ return grooveSquatEnabled; },
  set grooveSquatEnabled(value){ grooveSquatEnabled = value; },
  get generateGrooveConfig(){ return generateGrooveConfig; },
  get applyGrooveConfigData(){ return applyGrooveConfigData; },
  get grooveSquatAnchored(){ return grooveSquatAnchored; },
  set grooveSquatAnchored(value){ grooveSquatAnchored = value; },
  get groovePreviewEnabled(){ return groovePreviewEnabled; },
  set groovePreviewEnabled(value){ groovePreviewEnabled = value; },
  get grooveLibCtrl(){ return grooveLibCtrl; },
  get grooveGenAutoName(){ return grooveGenAutoName; },
  get captureCurrentGrooveConfig(){ return captureCurrentGrooveConfig; },
  get grooveWarmupEnabled(){ return grooveWarmupEnabled; },
  set grooveWarmupEnabled(value){ grooveWarmupEnabled = value; },
  get grooveWarmupBeats(){ return grooveWarmupBeats; },
  set grooveWarmupBeats(value){ grooveWarmupBeats = value; },
  get grooveWarmupCurve(){ return grooveWarmupCurve; },
  set grooveWarmupCurve(value){ grooveWarmupCurve = value; },
  get groovePreviewStartTime(){ return groovePreviewStartTime; },
  set groovePreviewStartTime(value){ groovePreviewStartTime = value; },
  get resetGrooveXfadeState(){ return resetGrooveXfadeState; },
  get resetSquatXfadeState(){ return resetSquatXfadeState; },
  get _squatPreviewLastDelta(){ return _squatPreviewLastDelta; },
  get model(){ return model; },
  get resetSquatFootAnchors(){ return resetSquatFootAnchors; },
  get bindGrooveLibraryUI(){ return bindGrooveLibraryUI; },
  get bindGrooveSequenceUI(){ return bindGrooveSequenceUI; },
  get getGrooveSquatParams(){ return getGrooveSquatParams; },
  get grooveSquatCustom(){ return grooveSquatCustom; },
  set grooveSquatCustom(value){ grooveSquatCustom = value; },
});

const grooveSequenceController = createGrooveSequence({
  get waveClipSelected(){ return waveClipSelected; },
  set waveClipSelected(value){ waveClipSelected = value; },
  get renderWaveTrack(){ return renderWaveTrack; },
  get grooveSequence(){ return grooveSequence; },
  get kfMultiSelectMode(){ return kfMultiSelectMode; },
  get toggleGrooveMultiSelectItem(){ return toggleGrooveMultiSelectItem; },
  get grooveSeqSelectedIndex(){ return grooveSeqSelectedIndex; },
  set grooveSeqSelectedIndex(value){ grooveSeqSelectedIndex = value; },
  get kfEditingIndex(){ return kfEditingIndex; },
  set kfEditingIndex(value){ kfEditingIndex = value; },
  get syncEasingControlsFromSelection(){ return syncEasingControlsFromSelection; },
  get kfChipEls(){ return kfChipEls; },
  get grooveSeqChipEls(){ return grooveSeqChipEls; },
  set grooveSeqChipEls(value){ grooveSeqChipEls = value; },
  get updateOnionSkins(){ return updateOnionSkins; },
  get grooveLibCtrl(){ return grooveLibCtrl; },
  set grooveLibCtrl(value){ grooveLibCtrl = value; },
  get makeLibId(){ return makeLibId; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get snapGrooveBeats(){ return snapGrooveBeats; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
  get kfTotalBeats(){ return kfTotalBeats; },
  get bindTimelineReorderHost(){ return bindTimelineReorderHost; },
  get updateBeatGridGeometry(){ return updateBeatGridGeometry; },
  get grooveSegmentStartBeat(){ return grooveSegmentStartBeat; },
  get BEAT_GRID_PX_PER_BEAT(){ return BEAT_GRID_PX_PER_BEAT; },
  get kfPlaying(){ return kfPlaying; },
  get grooveMultiSelected(){ return grooveMultiSelected; },
  get pushHistory(){ return pushHistory; },
  get BEAT_GRID_SNAP(){ return BEAT_GRID_SNAP; },
  get formatBeatValue(){ return formatBeatValue; },
  get beginGrooveResize(){ return beginGrooveResize; },
  get grooveSeqDragIndex(){ return grooveSeqDragIndex; },
  set grooveSeqDragIndex(value){ grooveSeqDragIndex = value; },
  get beginTimelineReorderDrag(){ return beginTimelineReorderDrag; },
  get endTimelineReorderDrag(){ return endTimelineReorderDrag; },
  get renderGrooveLoopGhosts(){ return renderGrooveLoopGhosts; },
  get createLibraryController(){ return createLibraryController; },
  get GROOVE_LIB_KEY(){ return GROOVE_LIB_KEY; },
  get captureCurrentGrooveConfig(){ return captureCurrentGrooveConfig; },
  get applyGrooveConfigData(){ return applyGrooveConfigData; },
  get grooveLibSubtitle(){ return grooveLibSubtitle; },
});

const choreographyGenerator = createChoreographyGenerator({
  get keyframes(){ return keyframes; },
  set keyframes(value){ keyframes = value; },
  get moveLibCtrl(){ return moveLibCtrl; },
  get kfEditingIndex(){ return kfEditingIndex; },
  set kfEditingIndex(value){ kfEditingIndex = value; },
  get stopKeyframePlayback(){ return stopKeyframePlayback; },
  get syncEasingControlsFromSelection(){ return syncEasingControlsFromSelection; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get pushHistory(){ return pushHistory; },
  get JOINT_LIMIT_KEYS(){ return JOINT_LIMIT_KEYS; },
  get bones(){ return bones; },
  get JOINT_LIMITS(){ return JOINT_LIMITS; },
  get generateRandomPose(){ return generateRandomPose; },
  get snapshotCurrentAngles(){ return snapshotCurrentAngles; },
  get snapshotBodyTransform(){ return snapshotBodyTransform; },
  get kfPendingEasing(){ return kfPendingEasing; },
  get kfPendingBeats(){ return kfPendingBeats; },
});

const libraryDomainController = createLibraryDomainController({
  get BODY_LIB_JOINT_KEYS(){ return BODY_LIB_JOINT_KEYS; },
  get poseController(){ return poseController; },
  get setTarget(){ return setTarget; },
  get setActiveBtn(){ return setActiveBtn; },
  get updateSelectedBar(){ return updateSelectedBar; },
  get waveRun(){ return waveRun; },
  get stopWave(){ return stopWave; },
  get bpm(){ return bpm; },
  get keyframes(){ return keyframes; },
  get kfEditingIndex(){ return kfEditingIndex; },
  set kfEditingIndex(value){ kfEditingIndex = value; },
  get syncEasingControlsFromSelection(){ return syncEasingControlsFromSelection; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get grooveJointSet(){ return grooveJointSet; },
  set grooveJointSet(value){ grooveJointSet = value; },
  get grooveCustomParams(){ return grooveCustomParams; },
  set grooveCustomParams(value){ grooveCustomParams = value; },
  get grooveSquatEnabled(){ return grooveSquatEnabled; },
  set grooveSquatEnabled(value){ grooveSquatEnabled = value; },
  get grooveSquatCustom(){ return grooveSquatCustom; },
  set grooveSquatCustom(value){ grooveSquatCustom = value; },
  get grooveLastGenMeta(){ return grooveLastGenMeta; },
  set grooveLastGenMeta(value){ grooveLastGenMeta = value; },
  get sanitizeGrooveCustomEntry(){ return sanitizeGrooveCustomEntry; },
  get sanitizeGrooveSquatCustomEntry(){ return sanitizeGrooveSquatCustomEntry; },
  get refreshGrooveJointUI(){ return refreshGrooveJointUI; },
  get renderGrooveSquatUI(){ return renderGrooveSquatUI; },
  get poseLibCtrl(){ return poseLibCtrl; },
  set poseLibCtrl(value){ poseLibCtrl = value; },
  get createLibraryController(){ return createLibraryController; },
  get POSE_LIB_KEY(){ return POSE_LIB_KEY; },
  get gestureLibCtrl(){ return gestureLibCtrl; },
  set gestureLibCtrl(value){ gestureLibCtrl = value; },
  get GESTURE_LIB_KEY(){ return GESTURE_LIB_KEY; },
  get moveLibCtrl(){ return moveLibCtrl; },
  set moveLibCtrl(value){ moveLibCtrl = value; },
  get MOVE_LIB_KEY(){ return MOVE_LIB_KEY; },
  get generateChoreographyFromMoves(){ return generateChoreographyFromMoves; },
  get autoGenerateMove(){ return autoGenerateMove; },
  get renderStorageUsageIndicator(){ return renderStorageUsageIndicator; },
});

const onionSkinController = createOnionSkin({
  get model(){ return model; },
  get ghostBones(){ return ghostBones; },
  get scene(){ return scene; },
  get ghostPrev(){ return ghostPrev; },
  set ghostPrev(value){ ghostPrev = value; },
  get ghostNext(){ return ghostNext; },
  set ghostNext(value){ ghostNext = value; },
  get restQuat(){ return restQuat; },
  get kfPlaying(){ return kfPlaying; },
  get onionSkinEnabled(){ return onionSkinEnabled; },
  get kfEditingIndex(){ return kfEditingIndex; },
  get keyframes(){ return keyframes; },
  get kfIndex(){ return kfIndex; },
});

const poseEditorController = createPoseEditor({
  get snapshotCurrentAngles(){ return snapshotCurrentAngles; },
  get snapshotBodyTransform(){ return snapshotBodyTransform; },
  get kfPendingEasing(){ return kfPendingEasing; },
  set kfPendingEasing(value){ kfPendingEasing = value; },
  get kfPendingBeats(){ return kfPendingBeats; },
  set kfPendingBeats(value){ kfPendingBeats = value; },
  get kfEditingIndex(){ return kfEditingIndex; },
  set kfEditingIndex(value){ kfEditingIndex = value; },
  get keyframes(){ return keyframes; },
  set keyframes(value){ keyframes = value; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get updateEasingPreview(){ return updateEasingPreview; },
  get snapTimelineBeats(){ return snapTimelineBeats; },
  get updateBeatMsHint(){ return updateBeatMsHint; },
  get kfPlaying(){ return kfPlaying; },
  get stopKeyframePlayback(){ return stopKeyframePlayback; },
  get syncEasingControlsFromSelection(){ return syncEasingControlsFromSelection; },
  get waveClipSelected(){ return waveClipSelected; },
  set waveClipSelected(value){ waveClipSelected = value; },
  get renderWaveTrack(){ return renderWaveTrack; },
  get grooveSeqSelectedIndex(){ return grooveSeqSelectedIndex; },
  set grooveSeqSelectedIndex(value){ grooveSeqSelectedIndex = value; },
  get kfMultiSelectMode(){ return kfMultiSelectMode; },
  get grooveMultiSelected(){ return grooveMultiSelected; },
  get grooveSeqChipEls(){ return grooveSeqChipEls; },
  get kfChipEls(){ return kfChipEls; },
  get applyPose(){ return applyPose; },
  get setActiveBtn(){ return setActiveBtn; },
  get updateOnionSkins(){ return updateOnionSkins; },
  get waveTrackActive(){ return waveTrackActive; },
  set waveTrackActive(value){ waveTrackActive = value; },
  get waveRun(){ return waveRun; },
  get stopWave(){ return stopWave; },
});

const timelineInspectorController = createTimelineInspector({
  get waveClips(){ return waveClips; },
  get wavePlaybackEnd(){ return wavePlaybackEnd; },
  get keyframes(){ return keyframes; },
  get bpm(){ return bpm; },
  get updateGrooveSeqTotalLabel(){ return updateGrooveSeqTotalLabel; },
  get kfEditingIndex(){ return kfEditingIndex; },
  get kfMultiSelectMode(){ return kfMultiSelectMode; },
  get kfPendingEasing(){ return kfPendingEasing; },
  set kfPendingEasing(value){ kfPendingEasing = value; },
  get kfPendingBeats(){ return kfPendingBeats; },
  set kfPendingBeats(value){ kfPendingBeats = value; },
  get syncBeatSelectValue(){ return syncBeatSelectValue; },
});

const timelineReorderController = createTimelineReorder({
  get keyframes(){ return keyframes; },
  set keyframes(value){ keyframes = value; },
  get grooveSequence(){ return grooveSequence; },
  set grooveSequence(value){ grooveSequence = value; },
  get kfChipEls(){ return kfChipEls; },
  get grooveSeqChipEls(){ return grooveSeqChipEls; },
  get kfMultiSelected(){ return kfMultiSelected; },
  set kfMultiSelected(value){ kfMultiSelected = value; },
  get grooveMultiSelected(){ return grooveMultiSelected; },
  set grooveMultiSelected(value){ grooveMultiSelected = value; },
  get kfPlaying(){ return kfPlaying; },
  get kfMultiSelectMode(){ return kfMultiSelectMode; },
  get timelineReorderDrag(){ return timelineReorderDrag; },
  set timelineReorderDrag(value){ timelineReorderDrag = value; },
  get kfEditingIndex(){ return kfEditingIndex; },
  set kfEditingIndex(value){ kfEditingIndex = value; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
  get grooveSeqSelectedIndex(){ return grooveSeqSelectedIndex; },
  set grooveSeqSelectedIndex(value){ grooveSeqSelectedIndex = value; },
  get renderGrooveSeqChips(){ return renderGrooveSeqChips; },
  get updateKfMultiSelectBar(){ return updateKfMultiSelectBar; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get reorderKeyframe(){ return reorderKeyframe; },
  get reorderGrooveSeqEntry(){ return reorderGrooveSeqEntry; },
  get pushHistory(){ return pushHistory; },
});

const timelineResizeController = createTimelineResize({
  get BEAT_GRID_SNAP(){ return BEAT_GRID_SNAP; },
  set BEAT_GRID_SNAP(value){ BEAT_GRID_SNAP = value; },
  get hasBeatGridRange(){ return hasBeatGridRange; },
  get normalizeBeatGridRange(){ return normalizeBeatGridRange; },
  get beatGridRangeStart(){ return beatGridRangeStart; },
  set beatGridRangeStart(value){ beatGridRangeStart = value; },
  get beatGridRangeEnd(){ return beatGridRangeEnd; },
  set beatGridRangeEnd(value){ beatGridRangeEnd = value; },
  get updateBeatGridRangeUI(){ return updateBeatGridRangeUI; },
  get updateBeatGridGeometry(){ return updateBeatGridGeometry; },
  get kfChipEls(){ return kfChipEls; },
  get keyframes(){ return keyframes; },
  get keyframeStartBeat(){ return keyframeStartBeat; },
  get BEAT_GRID_PX_PER_BEAT(){ return BEAT_GRID_PX_PER_BEAT; },
  get kfEditingIndex(){ return kfEditingIndex; },
  get kfPendingBeats(){ return kfPendingBeats; },
  set kfPendingBeats(value){ kfPendingBeats = value; },
  get updateBeatMsHint(){ return updateBeatMsHint; },
  get updateBeatGridPoseInspector(){ return updateBeatGridPoseInspector; },
  get updateKfTotalDurationLabel(){ return updateKfTotalDurationLabel; },
  get renderGrooveLoopGhosts(){ return renderGrooveLoopGhosts; },
  get drawKfWaveform(){ return drawKfWaveform; },
  get grooveSeqChipEls(){ return grooveSeqChipEls; },
  get grooveSequence(){ return grooveSequence; },
  get grooveSegmentStartBeat(){ return grooveSegmentStartBeat; },
  get updateGrooveSeqTotalLabel(){ return updateGrooveSeqTotalLabel; },
  get kfPlaying(){ return kfPlaying; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get pushHistory(){ return pushHistory; },
  get kfMultiSelectMode(){ return kfMultiSelectMode; },
  get selectKeyframeStateOnly(){ return selectKeyframeStateOnly; },
  get bpm(){ return bpm; },
  get selectGrooveSeqEntry(){ return selectGrooveSeqEntry; },
});

const beatGridController = createBeatGrid({
  get BEAT_GRID_ZOOM_LEVELS(){ return BEAT_GRID_ZOOM_LEVELS; },
  get updateKeyframeClipLayoutOnly(){ return updateKeyframeClipLayoutOnly; },
  get updateGrooveClipLayoutOnly(){ return updateGrooveClipLayoutOnly; },
  get drawKfWaveform(){ return drawKfWaveform; },
  get kfPlaying(){ return kfPlaying; },
  get updateBeatGridMusicPreviewPlayhead(){ return updateBeatGridMusicPreviewPlayhead; },
  get BEAT_GRID_PX_PER_BEAT(){ return BEAT_GRID_PX_PER_BEAT; },
  set BEAT_GRID_PX_PER_BEAT(value){ BEAT_GRID_PX_PER_BEAT = value; },
  get BEAT_GRID_LABEL_W(){ return BEAT_GRID_LABEL_W; },
  get grooveSequence(){ return grooveSequence; },
  get keyframes(){ return keyframes; },
  get waveform(){ return waveform; },
  get bpm(){ return bpm; },
  get waveTrackEnd(){ return waveTrackEnd; },
  get grooveSeqTotalBeats(){ return grooveSeqTotalBeats; },
  get BEAT_GRID_SUBDIV(){ return BEAT_GRID_SUBDIV; },
  get updateBeatGridRangeUI(){ return updateBeatGridRangeUI; },
  get layoutWaveTrack(){ return layoutWaveTrack; },
  get stopKeyframePlayback(){ return stopKeyframePlayback; },
  get normalizeBeatGridRange(){ return normalizeBeatGridRange; },
  get beatGridRangeDrag(){ return beatGridRangeDrag; },
  set beatGridRangeDrag(value){ beatGridRangeDrag = value; },
  get beatGridRangeStart(){ return beatGridRangeStart; },
  set beatGridRangeStart(value){ beatGridRangeStart = value; },
  get beatGridRangeEnd(){ return beatGridRangeEnd; },
  set beatGridRangeEnd(value){ beatGridRangeEnd = value; },
  get setBeatGridRangeLoop(){ return setBeatGridRangeLoop; },
  get BEAT_GRID_SNAP(){ return BEAT_GRID_SNAP; },
  get beatGridRangeLoop(){ return beatGridRangeLoop; },
  set beatGridRangeLoop(value){ beatGridRangeLoop = value; },
  get grooveLibCtrl(){ return grooveLibCtrl; },
  get kfChipEls(){ return kfChipEls; },
  get timelineEditor(){ return timelineEditor; },
  get waveClips(){ return waveClips; },
  get wavePlaybackEnd(){ return wavePlaybackEnd; },
  get grooveStartTime(){ return grooveStartTime; },
  get kfIndex(){ return kfIndex; },
  get kfStartTime(){ return kfStartTime; },
  get keyframeStartBeat(){ return keyframeStartBeat; },
  get getGrooveActiveSegment(){ return getGrooveActiveSegment; },
  get grooveSeqChipEls(){ return grooveSeqChipEls; },
  get audioTimeToTimelineBeat(){ return audioTimeToTimelineBeat; },
  get beatGridLastPreviewBeat(){ return beatGridLastPreviewBeat; },
  set beatGridLastPreviewBeat(value){ beatGridLastPreviewBeat = value; },
  get applyTimelinePreviewAtElapsed(){ return applyTimelinePreviewAtElapsed; },
  get timelineBeatToAudioTime(){ return timelineBeatToAudioTime; },
  get showBeatGridScrubPlayhead(){ return showBeatGridScrubPlayhead; },
});

const timelineTransportController = createTimelineTransport({
  get keyframes(){ return keyframes; },
  get waveClips(){ return waveClips; },
  get wavePlaybackEnd(){ return wavePlaybackEnd; },
  get beatGridPoseTotalBeats(){ return beatGridPoseTotalBeats; },
  get locateKeyframeSegmentAtBeat(){ return locateKeyframeSegmentAtBeat; },
  get kfIndex(){ return kfIndex; },
  set kfIndex(value){ kfIndex = value; },
  get kfStartTime(){ return kfStartTime; },
  set kfStartTime(value){ kfStartTime = value; },
  get bpm(){ return bpm; },
  get grooveStartTime(){ return grooveStartTime; },
  set grooveStartTime(value){ grooveStartTime = value; },
  get grooveSquatAnchored(){ return grooveSquatAnchored; },
  set grooveSquatAnchored(value){ grooveSquatAnchored = value; },
  get resetGrooveXfadeState(){ return resetGrooveXfadeState; },
  get resetSquatXfadeState(){ return resetSquatXfadeState; },
  get waveform(){ return waveform; },
  get timelineBeatToAudioTime(){ return timelineBeatToAudioTime; },
  get updateOnionSkins(){ return updateOnionSkins; },
  get updatePlayingKeyframeHighlight(){ return updatePlayingKeyframeHighlight; },
  get beatGridLastPreviewBeat(){ return beatGridLastPreviewBeat; },
  set beatGridLastPreviewBeat(value){ beatGridLastPreviewBeat = value; },
  get tgCancelPreview(){ return tgCancelPreview; },
  get stopWave(){ return stopWave; },
  get stopLAPath(){ return stopLAPath; },
  get kfPlaying(){ return kfPlaying; },
  set kfPlaying(value){ kfPlaying = value; },
  get deselectJoint(){ return deselectJoint; },
  get transformControls(){ return transformControls; },
  get beatGridRangeLoop(){ return beatGridRangeLoop; },
  get hasBeatGridRange(){ return hasBeatGridRange; },
  get beatGridRangeStart(){ return beatGridRangeStart; },
  get playKfMusicIfLoaded(){ return playKfMusicIfLoaded; },
  get scrollBeatGridBeatToCenter(){ return scrollBeatGridBeatToCenter; },
  get updateBeatGridPlaybackUI(){ return updateBeatGridPlaybackUI; },
  get bones(){ return bones; },
  get syncWaveTrackTarget(){ return syncWaveTrackTarget; },
  get waveTrackActive(){ return waveTrackActive; },
  set waveTrackActive(value){ waveTrackActive = value; },
  get pauseKfMusic(){ return pauseKfMusic; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
  get resetBeatGridPlaybackUI(){ return resetBeatGridPlaybackUI; },
  get waveRun(){ return waveRun; },
  get waveBaseAtBeat(){ return waveBaseAtBeat; },
  get applyWaveTrackAtBeat(){ return applyWaveTrackAtBeat; },
  get applyPose(){ return applyPose; },
  get applyBodyTransform(){ return applyBodyTransform; },
  get applyKeyframeFramePose(){ return applyKeyframeFramePose; },
  get beatGridTimelineBeats(){ return beatGridTimelineBeats; },
  get BEAT_GRID_LABEL_W(){ return BEAT_GRID_LABEL_W; },
  get BEAT_GRID_PX_PER_BEAT(){ return BEAT_GRID_PX_PER_BEAT; },
  get autoScrollBeatGridToPlayhead(){ return autoScrollBeatGridToPlayhead; },
  get kfScrubDragging(){ return kfScrubDragging; },
  set kfScrubDragging(value){ kfScrubDragging = value; },
  get audioTimeToTimelineBeat(){ return audioTimeToTimelineBeat; },
  get timelinePlayback(){ return timelinePlayback; },
});

const poseInterpolatorController = createPoseInterpolator({
  get collectTrajOverrideKeys(){ return collectTrajOverrideKeys; },
  get bones(){ return bones; },
  get restQuat(){ return restQuat; },
  get model(){ return model; },
  get applyTrajOverridesDuringPlayback(){ return applyTrajOverridesDuringPlayback; },
  get applyBakedWaveFeet(){ return applyBakedWaveFeet; },
});

const timelineToolbarController = createTimelineToolbar({
  get toggleKeyframePlayback(){ return toggleKeyframePlayback; },
  get kfLoop(){ return kfLoop; },
  set kfLoop(value){ kfLoop = value; },
  get setBeatGridRangeLoop(){ return setBeatGridRangeLoop; },
  get syncBeatGridZoomSelect(){ return syncBeatGridZoomSelect; },
  get BEAT_GRID_PX_PER_BEAT(){ return BEAT_GRID_PX_PER_BEAT; },
  get setBeatGridZoomPx(){ return setBeatGridZoomPx; },
  get stepBeatGridZoom(){ return stepBeatGridZoom; },
  get BEAT_GRID_SNAP(){ return BEAT_GRID_SNAP; },
  get setBeatGridSnap(){ return setBeatGridSnap; },
  get navigateBeatGridToBeat(){ return navigateBeatGridToBeat; },
  get beatGridTimelineBeats(){ return beatGridTimelineBeats; },
  get fitBeatGridTimeline(){ return fitBeatGridTimeline; },
  get centerBeatGridPlayhead(){ return centerBeatGridPlayhead; },
  get beatGridRangeLoop(){ return beatGridRangeLoop; },
  get copyBeatGridRange(){ return copyBeatGridRange; },
  get pasteBeatGridRange(){ return pasteBeatGridRange; },
  get duplicateBeatGridRange(){ return duplicateBeatGridRange; },
  get deleteBeatGridRange(){ return deleteBeatGridRange; },
  get clearBeatGridRange(){ return clearBeatGridRange; },
  get bindBeatGridRangeSelection(){ return bindBeatGridRangeSelection; },
  get updateBeatGridRangeUI(){ return updateBeatGridRangeUI; },
  get onionSkinEnabled(){ return onionSkinEnabled; },
  set onionSkinEnabled(value){ onionSkinEnabled = value; },
  get updateOnionSkins(){ return updateOnionSkins; },
  get bindGrooveUI(){ return bindGrooveUI; },
  get addKeyframe(){ return addKeyframe; },
  get pushHistory(){ return pushHistory; },
  get updateKeyframe(){ return updateKeyframe; },
  get setKfMultiSelectMode(){ return setKfMultiSelectMode; },
  get kfMultiSelectMode(){ return kfMultiSelectMode; },
  get kfMultiSelectAll(){ return kfMultiSelectAll; },
  get kfMultiSelectNone(){ return kfMultiSelectNone; },
  get copyTimelineSelection(){ return copyTimelineSelection; },
  get cutTimelineSelection(){ return cutTimelineSelection; },
  get pasteTimelineClipboard(){ return pasteTimelineClipboard; },
  get deleteKfMultiSelected(){ return deleteKfMultiSelected; },
  get updateKfMultiSelectBar(){ return updateKfMultiSelectBar; },
  get exportTimeline(){ return exportTimeline; },
  get importTimelineFromFile(){ return importTimelineFromFile; },
  get importKfMusic(){ return importKfMusic; },
  get removeKfMusic(){ return removeKfMusic; },
  get waveform(){ return waveform; },
  get updateBeatGridGeometry(){ return updateBeatGridGeometry; },
  get drawKfWaveform(){ return drawKfWaveform; },
  get updateBeatGridMusicPreviewPlayhead(){ return updateBeatGridMusicPreviewPlayhead; },
  get toggleKfMusicPreview(){ return toggleKfMusicPreview; },
  get syncKfMusicPreviewBtn(){ return syncKfMusicPreviewBtn; },
  get initKfListWheelScroll(){ return initKfListWheelScroll; },
  get bindKfWaveformScrubbing(){ return bindKfWaveformScrubbing; },
  get kfPendingEasing(){ return kfPendingEasing; },
  get setKeyframeEasing(){ return setKeyframeEasing; },
  get kfPendingBeats(){ return kfPendingBeats; },
  get setKeyframeBeats(){ return setKeyframeBeats; },
  get updateEasingPreview(){ return updateEasingPreview; },
  get updateBeatMsHint(){ return updateBeatMsHint; },
  get updateBeatGridPoseInspector(){ return updateBeatGridPoseInspector; },
  get isKeyframeTabActive(){ return isKeyframeTabActive; },
  get hasBeatGridRange(){ return hasBeatGridRange; },
  get kfPlaying(){ return kfPlaying; },
  get waveClipSelected(){ return waveClipSelected; },
  get deleteWaveClip(){ return deleteWaveClip; },
  get duplicateWaveClip(){ return duplicateWaveClip; },
  get kfMultiSelected(){ return kfMultiSelected; },
  get grooveMultiSelected(){ return grooveMultiSelected; },
  get deleteTimelineSelection(){ return deleteTimelineSelection; },
  get keyframes(){ return keyframes; },
  get kfEditingIndex(){ return kfEditingIndex; },
  get selectKeyframe(){ return selectKeyframe; },
  get grooveSeqSelectedIndex(){ return grooveSeqSelectedIndex; },
  get removeGrooveSeqEntry(){ return removeGrooveSeqEntry; },
  get deleteKeyframe(){ return deleteKeyframe; },
  get duplicateKeyframe(){ return duplicateKeyframe; },
});

const cameraController = createCameraController({
  get model(){ return model; },
  get bones(){ return bones; },
  get fingerEffectorBones(){ return fingerEffectorBones; },
  get modelHeight(){ return modelHeight; },
  get camera(){ return camera; },
  get CAMERA_BODY_VIEW_NAMES(){ return CAMERA_BODY_VIEW_NAMES; },
  get controls(){ return controls; },
  get cameraTween(){ return cameraTween; },
  set cameraTween(value){ cameraTween = value; },
});

const splitViewController = createSplitView({
  get splitViewPanes(){ return splitViewPanes; },
  get SPLIT_VIEW_LABELS(){ return SPLIT_VIEW_LABELS; },
  get SPLIT_VIEW_MAX_PANES(){ return SPLIT_VIEW_MAX_PANES; },
  get SPLIT_VIEW_NAMES(){ return SPLIT_VIEW_NAMES; },
  get preferences(){ return preferences; },
  get scene(){ return scene; },
  get SPLIT_VIEW_REFIT_INTERVAL_MS(){ return SPLIT_VIEW_REFIT_INTERVAL_MS; },
  get getModelBoundsInfo(){ return getModelBoundsInfo; },
  get computeBodyCameraPreset(){ return computeBodyCameraPreset; },
  get SPLIT_VIEW_FOLLOW_T(){ return SPLIT_VIEW_FOLLOW_T; },
  get camera(){ return camera; },
  get renderer(){ return renderer; },
});

const sceneSelectionController = createSceneSelection({
  get laCustomMeshes(){ return laCustomMeshes; },
  get markerMeshes(){ return markerMeshes; },
  get ikTargetMeshes(){ return ikTargetMeshes; },
  get ikPoleMeshes(){ return ikPoleMeshes; },
  get spineIKTargetMesh(){ return spineIKTargetMesh; },
  get lookAtTargetMesh(){ return lookAtTargetMesh; },
  get trajPointMeshes(){ return trajPointMeshes; },
  get fingerIKTargetMeshes(){ return fingerIKTargetMeshes; },
  get renderer(){ return renderer; },
  get suppressClick(){ return suppressClick; },
  get transformControls(){ return transformControls; },
  get transformControlsIK(){ return transformControlsIK; },
  get kfPlaying(){ return kfPlaying; },
  get camera(){ return camera; },
  get selectLACustom(){ return selectLACustom; },
  get selectIKMarker(){ return selectIKMarker; },
  get selectedKey(){ return selectedKey; },
  set selectedKey(value){ selectedKey = value; },
  get selectedIK(){ return selectedIK; },
  set selectedIK(value){ selectedIK = value; },
  get tgCancelPreview(){ return tgCancelPreview; },
  get waveRun(){ return waveRun; },
  get stopWave(){ return stopWave; },
  get FOOT_PLANT_LIMBS(){ return FOOT_PLANT_LIMBS; },
  get isFootPlanted(){ return isFootPlanted; },
  get bones(){ return bones; },
  get highlightMarkers(){ return highlightMarkers; },
  get highlightIKMarkers(){ return highlightIKMarkers; },
  get laCustomDrag(){ return laCustomDrag; },
  set laCustomDrag(value){ laCustomDrag = value; },
  get renderTrajPointList(){ return renderTrajPointList; },
  get updatePoleRadiusUI(){ return updatePoleRadiusUI; },
  get bodyGizmoProxy(){ return bodyGizmoProxy; },
  get effectorOrientEnabled(){ return effectorOrientEnabled; },
  get poseController(){ return poseController; },
  get model(){ return model; },
  get bodyProxyLastPos(){ return bodyProxyLastPos; },
  set bodyProxyLastPos(value){ bodyProxyLastPos = value; },
  get defaultModelPosition(){ return defaultModelPosition; },
  get defaultModelQuaternion(){ return defaultModelQuaternion; },
});

const transformGizmoController = createTransformGizmos({
  get transformControls(){ return transformControls; },
  set transformControls(value){ transformControls = value; },
  get camera(){ return camera; },
  get renderer(){ return renderer; },
  get controls(){ return controls; },
  get draggingKey(){ return draggingKey; },
  set draggingKey(value){ draggingKey = value; },
  get selectedKey(){ return selectedKey; },
  get ikEnabled(){ return ikEnabled; },
  get captureFootLock(){ return captureFootLock; },
  get suppressClick(){ return suppressClick; },
  set suppressClick(value){ suppressClick = value; },
  get pushHistory(){ return pushHistory; },
  get commitFromBone(){ return commitFromBone; },
  get scene(){ return scene; },
  get transformControlsIK(){ return transformControlsIK; },
  set transformControlsIK(value){ transformControlsIK = value; },
  get selectedIK(){ return selectedIK; },
  get laCustomDrag(){ return laCustomDrag; },
  set laCustomDrag(value){ laCustomDrag = value; },
  get laCustomCenter(){ return laCustomCenter; },
  get renderLACustomList(){ return renderLACustomList; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
  get LOOKAT_RANGE_NAMES(){ return LOOKAT_RANGE_NAMES; },
  get HAND_AIM_NAMES(){ return HAND_AIM_NAMES; },
  get solveHandAim(){ return solveHandAim; },
  get solveLookAt(){ return solveLookAt; },
  get beginHandRangeDrag(){ return beginHandRangeDrag; },
  get handRangeDrag(){ return handRangeDrag; },
  set handRangeDrag(value){ handRangeDrag = value; },
  get beginPoleDrag(){ return beginPoleDrag; },
  get poleDrag(){ return poleDrag; },
  set poleDrag(value){ poleDrag = value; },
  get footPlantEnabled(){ return footPlantEnabled; },
  get solveFootPlant(){ return solveFootPlant; },
  get clampPoleDrag(){ return clampPoleDrag; },
  get clampHandRangeDrag(){ return clampHandRangeDrag; },
  get dragLACustom(){ return dragLACustom; },
  get bodyGizmoProxy(){ return bodyGizmoProxy; },
  set bodyGizmoProxy(value){ bodyGizmoProxy = value; },
  get bodyProxyLastPos(){ return bodyProxyLastPos; },
  get model(){ return model; },
  get updateTrajVisual(){ return updateTrajVisual; },
  get kfPlaying(){ return kfPlaying; },
});

const floatingPanelsController = createFloatingPanels({
  get UI_HEIGHT_MAX_RATIO(){ return UI_HEIGHT_MAX_RATIO; },
  get UI_HEIGHT_MIN_PX(){ return UI_HEIGHT_MIN_PX; },
  get preferences(){ return preferences; },
  get UI_HEIGHT_DEFAULT_RATIO(){ return UI_HEIGHT_DEFAULT_RATIO; },
  get UI_FLOAT_MIN_WIDTH(){ return UI_FLOAT_MIN_WIDTH; },
  get UI_FLOAT_MIN_HEIGHT(){ return UI_FLOAT_MIN_HEIGHT; },
  get UI_FLOAT_DEFAULT_LEFT(){ return UI_FLOAT_DEFAULT_LEFT; },
  get UI_FLOAT_DEFAULT_TOP(){ return UI_FLOAT_DEFAULT_TOP; },
  get UI_FLOAT_DEFAULT_WIDTH(){ return UI_FLOAT_DEFAULT_WIDTH; },
});

const workspacePanelsController = createWorkspacePanels({
  get preferences(){ return preferences; },
  get DISPLAY_TOGGLES_COLLAPSED_STORAGE_KEY(){ return DISPLAY_TOGGLES_COLLAPSED_STORAGE_KEY; },
  get showBodyJoints(){ return showBodyJoints; },
  get setJointCategoryVisible(){ return setJointCategoryVisible; },
  get showHandJoints(){ return showHandJoints; },
  get showSkeleton(){ return showSkeleton; },
  set showSkeleton(value){ showSkeleton = value; },
  get handCollisionVizEnabled(){ return handCollisionVizEnabled; },
  set handCollisionVizEnabled(value){ handCollisionVizEnabled = value; },
  get tgCancelPreview(){ return tgCancelPreview; },
  get refreshJsonArea(){ return refreshJsonArea; },
  get renderTrajPointList(){ return renderTrajPointList; },
  get updateOverviewPanel(){ return updateOverviewPanel; },
  get updateJointLimitPanelAngles(){ return updateJointLimitPanelAngles; },
  get drawKfWaveform(){ return drawKfWaveform; },
  get updateOnionSkins(){ return updateOnionSkins; },
});

const sceneBootstrapController = createSceneBootstrap({
  get scene(){ return scene; },
  set scene(value){ scene = value; },
  get camera(){ return camera; },
  set camera(value){ camera = value; },
  get renderer(){ return renderer; },
  set renderer(value){ renderer = value; },
  get controls(){ return controls; },
  set controls(value){ controls = value; },
  get initTransformGizmos(){ return initTransformGizmos; },
  get onResize(){ return onResize; },
  get setupPickRaycaster(){ return setupPickRaycaster; },
  get animate(){ return animate; },
  get MODEL_URL(){ return MODEL_URL; },
  get model(){ return model; },
  set model(value){ model = value; },
  get modelHeight(){ return modelHeight; },
  set modelHeight(value){ modelHeight = value; },
  get bones(){ return bones; },
  get restQuat(){ return restQuat; },
  get buildOnionGhosts(){ return buildOnionGhosts; },
  get fingerEffectorBones(){ return fingerEffectorBones; },
  get defaultModelPosition(){ return defaultModelPosition; },
  set defaultModelPosition(value){ defaultModelPosition = value; },
  get defaultModelQuaternion(){ return defaultModelQuaternion; },
  set defaultModelQuaternion(value){ defaultModelQuaternion = value; },
  get calibrateFootGround(){ return calibrateFootGround; },
  get buildJointMarkers(){ return buildJointMarkers; },
  get buildSkeletonLines(){ return buildSkeletonLines; },
  get buildHandCollisionVizMeshes(){ return buildHandCollisionVizMeshes; },
  get buildIKMarkers(){ return buildIKMarkers; },
  get buildSpineIKMarker(){ return buildSpineIKMarker; },
  get buildLookAtMarkers(){ return buildLookAtMarkers; },
  get buildTrajMarkers(){ return buildTrajMarkers; },
  get buildFingerIKMarkers(){ return buildFingerIKMarkers; },
  get buildFingerPanel(){ return buildFingerPanel; },
  get buildJointLimitPanel(){ return buildJointLimitPanel; },
  get buildOverviewPanel(){ return buildOverviewPanel; },
  get buildJsonRefTable(){ return buildJsonRefTable; },
  get rebuildIKDrivenKeys(){ return rebuildIKDrivenKeys; },
  get grabBoxCore(){ return grabBoxCore; },
  set grabBoxCore(value){ grabBoxCore = value; },
  get ikTargetMeshes(){ return ikTargetMeshes; },
  get ikEnabled(){ return ikEnabled; },
  get setIKEnabled(){ return setIKEnabled; },
  isFingerTutActive: () => fingerTutController.active,
  prepareGrabPose(){
    if(kfPlaying)stopKeyframePlayback();
    if(waveRun)stopWave();
    tgCancelPreview();
    if(groovePreviewEnabled)document.getElementById('groovePreviewBtn').click();
    deselectJoint();
    poseController.applyTargetsToBones();model.updateWorldMatrix(true,true);
  },
  prepareGrabHands(){
    // World-space fingertip targets would change the gesture when the palms move.
    for(const id of FINGER_IDS)setFingerIKEnabled(id,false);
  },
  prepareGrabPalm(limb){
    for(const id of FINGER_IDS.filter(id=>id[0]===limb[0]))setFingerIKEnabled(id,false);
  },
  syncGrabHandPose(limb){syncTargetFromBone(limb==='rArm'?'rHand':'lHand');},
  solveGrabPose(){solveIKAll();grabBoxCore?.applyPalmOrientation();model.updateWorldMatrix(true,true);},
  captureGrabRig(){
    return { model:{position:model.position.toArray(),quaternion:model.quaternion.toArray()},
      arms:Object.fromEntries(['rArm','lArm'].map(id=>[id,{
        enabled:ikEnabled[id], target:ikTargetMeshes[id]?.position.toArray(),
        quaternion:ikTargetMeshes[id]?.quaternion.toArray(), pole:ikPoleMeshes[id]?.position.toArray(),
      }])),
      fingers:Object.fromEntries(FINGER_IDS.map(id=>[id,{enabled:fingerIKEnabled[id],target:fingerIKTargetMeshes[id]?.position.toArray()}])) };
  },
  restoreGrabRig(state){
    if(!state)return;
    model.position.fromArray(state.model.position);model.quaternion.fromArray(state.model.quaternion);
    model.updateWorldMatrix(true,true);
    for(const [id,s]of Object.entries(state.arms)){
      setIKEnabled(id,s.enabled);
      if(s.target)ikTargetMeshes[id].position.fromArray(s.target);
      if(s.quaternion)ikTargetMeshes[id].quaternion.fromArray(s.quaternion);
      if(s.pole)ikPoleMeshes[id].position.fromArray(s.pole);
    }
    for(const [id,s]of Object.entries(state.fingers)){
      setFingerIKEnabled(id,s.enabled);
      if(s.target)fingerIKTargetMeshes[id].position.fromArray(s.target);
    }
  },
  get goToCameraPreset(){ return goToCameraPreset; },
  get resetPose(){ return resetPose; },
  get bindTopUI(){ return bindTopUI; },
  get tryLoadAutosave(){ return tryLoadAutosave; },
  get renderKeyframeChips(){ return renderKeyframeChips; },
  get pushHistory(){ return pushHistory; },
  get scheduleAutoSave(){ return scheduleAutoSave; },
});

const rigVisualsController = createRigVisuals({
  get modelHeight(){ return modelHeight; },
  get bones(){ return bones; },
  get scene(){ return scene; },
  get markerMeshes(){ return markerMeshes; },
  get showHandJoints(){ return showHandJoints; },
  set showHandJoints(value){ showHandJoints = value; },
  get showBodyJoints(){ return showBodyJoints; },
  set showBodyJoints(value){ showBodyJoints = value; },
  get markerIKHidden(){ return markerIKHidden; },
  get skeletonLinePairs(){ return skeletonLinePairs; },
  set skeletonLinePairs(value){ skeletonLinePairs = value; },
  get skeletonLines(){ return skeletonLines; },
  set skeletonLines(value){ skeletonLines = value; },
  get showSkeleton(){ return showSkeleton; },
  get selectedKey(){ return selectedKey; },
  get highlightFingerButtons(){ return highlightFingerButtons; },
  get highlightOverviewRows(){ return highlightOverviewRows; },
});

const performancePanelController = createPerformancePanel({
  get preferences(){ return preferences; },
  get PERF_PANEL_STORAGE_KEY(){ return PERF_PANEL_STORAGE_KEY; },
  get perfPanelEnabled(){ return perfPanelEnabled; },
  set perfPanelEnabled(value){ perfPanelEnabled = value; },
  get PERF_EMA_ALPHA(){ return PERF_EMA_ALPHA; },
  get PERF_DOM_UPDATE_INTERVAL_MS(){ return PERF_DOM_UPDATE_INTERVAL_MS; },
  get renderer(){ return renderer; },
});

const animationLoopController = createAnimationLoop({
  get camera(){ return camera; },
  get controls(){ return controls; },
  get IDLE_CAMERA_CONVERGE_EPS_SQ(){ return IDLE_CAMERA_CONVERGE_EPS_SQ; },
  get tgPreview(){ return tgPreview; },
  get waveRun(){ return waveRun; },
  get laPathRun(){ return laPathRun; },
  get kfPlaying(){ return kfPlaying; },
  get groovePreviewEnabled(){ return groovePreviewEnabled; },
  get draggingKey(){ return draggingKey; },
  get transformControls(){ return transformControls; },
  get transformControlsIK(){ return transformControlsIK; },
  get grabBoxCore(){ return grabBoxCore; },
  get cameraTween(){ return cameraTween; },
  get tickLAPath(){ return tickLAPath; },
  get updateLACustomVisual(){ return updateLACustomVisual; },
  get updatePoleRange(){ return updatePoleRange; },
  get updateHandRangeHelper(){ return updateHandRangeHelper; },
  get perfTickRaf(){ return perfTickRaf; },
  get updateKeyframePlayback(){ return updateKeyframePlayback; },
  get updateBones(){ return updateBones; },
  get solveSpineRootFollow(){ return solveSpineRootFollow; },
  get solveIKAll(){ return solveIKAll; },
  get solveSpineIK(){ return solveSpineIK; },
  get solveLookAt(){ return solveLookAt; },
  get HAND_AIM_NAMES(){ return HAND_AIM_NAMES; },
  get solveHandAim(){ return solveHandAim; },
  get solveFingerIKAll(){ return solveFingerIKAll; },
  get applyGroove(){ return applyGroove; },
  get grooveBlockedKeys(){ return grooveBlockedKeys; },
  get groovePreviewStartTime(){ return groovePreviewStartTime; },
  get applySquatGroove(){ return applySquatGroove; },
  get tickWave(){ return tickWave; },
  get solveFootPlant(){ return solveFootPlant; },
  get updateFootPlantUI(){ return updateFootPlantUI; },
  get IDLE_THRESHOLD_FRAMES(){ return IDLE_THRESHOLD_FRAMES; },
  get IDLE_RENDER_INTERVAL_MS(){ return IDLE_RENDER_INTERVAL_MS; },
  get updatePerfPanelDom(){ return updatePerfPanelDom; },
  get solveHandBodyCollision(){ return solveHandBodyCollision; },
  get solveHandHandCollision(){ return solveHandHandCollision; },
  get lookAtEnabled(){ return lookAtEnabled; },
  get headFollowSource(){ return headFollowSource; },
  get tgTick(){ return tgTick; },
  get updateHandCollisionVizMeshes(){ return updateHandCollisionVizMeshes; },
  get updateMarkers(){ return updateMarkers; },
  get updateSkeletonLines(){ return updateSkeletonLines; },
  get updateOverviewPanel(){ return updateOverviewPanel; },
  get updateJointLimitPanelAngles(){ return updateJointLimitPanelAngles; },
  get updateCameraTween(){ return updateCameraTween; },
  get renderer(){ return renderer; },
  get scene(){ return scene; },
  get perfTickRender(){ return perfTickRender; },
  get updateSplitViewPanes(){ return updateSplitViewPanes; },
});

bindLanguageUI();
init();

function bindTimelineUI(...args){
  return timelineToolbarController.bindTimelineUI(...args);
}

function initTransformGizmos(...args){
  return transformGizmoController.initTransformGizmos(...args);
}
