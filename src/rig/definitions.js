import * as THREE from "three";

const BONE_SUFFIXES = {
  hips:"Hips", spine:"Spine", spine1:"Spine1", spine2:"Spine2", neck:"Neck", head:"Head",
  rShoulder:"RightShoulder", rArm:"RightArm", rForeArm:"RightForeArm", rHand:"RightHand",
  lShoulder:"LeftShoulder", lArm:"LeftArm", lForeArm:"LeftForeArm", lHand:"LeftHand",
  rUpLeg:"RightUpLeg", rLeg:"RightLeg", rFoot:"RightFoot",
  lUpLeg:"LeftUpLeg", lLeg:"LeftLeg", lFoot:"LeftFoot"
};

// ---- 手指 FK：批次產生 30 個指節 key（左右手 x 5指 x 3節）----
// Mixamo標準命名：{Left|Right}Hand{Thumb|Index|Middle|Ring|Pinky}{1|2|3}，
// 第4節是指尖端點骨，通常沒有實質旋轉意義，不納入FK控制，只留給IK當effector用（見 FINGER_IK_CHAINS）。
// 用雙層迴圈 Object.assign 進 BONE_SUFFIXES，不手動一條條寫死；
// 必須在 ALL_JOINT_KEYS = Object.keys(BONE_SUFFIXES) 這行「之前」執行，才會被通用迴圈涵蓋到。
const FINGER_DEFS = [
  { id:"Thumb", label:"拇指" }, { id:"Index", label:"食指" }, { id:"Middle", label:"中指" },
  { id:"Ring", label:"無名指" }, { id:"Pinky", label:"小指" }
];
const HAND_SIDES = [
  { side:"r", mixamo:"Right", label:"右手" },
  { side:"l", mixamo:"Left", label:"左手" }
];
const FINGER_JOINT_LABELS = { 1:"根", 2:"中", 3:"末" }; // 面板按鈕短標籤，也用於組完整中文名稱
const FINGER_JOINT_KEYS = []; // 30 個指節 key 的清單，供 marker 半徑/顏色區分等用途查詢
for (const hs of HAND_SIDES){
  for (const fd of FINGER_DEFS){
    for (let j = 1; j <= 3; j++){
      const key = hs.side + fd.id + j; // 例："rThumb1"
      BONE_SUFFIXES[key] = hs.mixamo + "Hand" + fd.id + j; // 例："RightHandThumb1"
      FINGER_JOINT_KEYS.push(key);
    }
  }
}
const FINGER_JOINT_KEY_SET = new Set(FINGER_JOINT_KEYS);

const ALL_JOINT_KEYS = Object.keys(BONE_SUFFIXES);

const LABEL_LOOKUP = {
  hips:"骨盆", spine:"脊椎-下", spine1:"脊椎-中", spine2:"脊椎-上", neck:"頸部", head:"頭部",
  rShoulder:"右肩胛", rArm:"右上臂", rForeArm:"右前臂", rHand:"右手掌",
  lShoulder:"左肩胛", lArm:"左上臂", lForeArm:"左前臂", lHand:"左手掌",
  rUpLeg:"右大腿", rLeg:"右小腿", rFoot:"右腳掌",
  lUpLeg:"左大腿", lLeg:"左小腿", lFoot:"左腳掌"
};
// 手指指節中文標籤批次寫入（同一份雙層迴圈資料，不重複手寫）
for (const hs of HAND_SIDES){
  for (const fd of FINGER_DEFS){
    for (let j = 1; j <= 3; j++){
      LABEL_LOOKUP[hs.side + fd.id + j] = hs.label + fd.label + "-" + FINGER_JOINT_LABELS[j] + "節";
    }
  }
}

// ---- 關節總覽面板：分組定義（純資料，不含 DOM）----
// 手指兩組直接複用 FINGER_JOINT_KEYS（依 side 前綴切開），身體/四肢維持人工分組，
// 順序＝面板顯示順序，跟原本 BONE_SUFFIXES 宣告順序不同、改用更符合閱讀習慣的軀幹→左右手→左右腳→手指。
const OVERVIEW_GROUPS = [
  { id:"body",    label:"軀幹／頭部", keys:["hips","spine","spine1","spine2","neck","head"] },
  { id:"rArm",    label:"右手臂",     keys:["rShoulder","rArm","rForeArm","rHand"] },
  { id:"lArm",    label:"左手臂",     keys:["lShoulder","lArm","lForeArm","lHand"] },
  { id:"rLeg",    label:"右腳",       keys:["rUpLeg","rLeg","rFoot"] },
  { id:"lLeg",    label:"左腳",       keys:["lUpLeg","lLeg","lFoot"] },
  { id:"rFingers",label:"右手指",     keys: FINGER_JOINT_KEYS.filter(k => k.startsWith("r")), collapsedByDefault:true },
  { id:"lFingers",label:"左手指",     keys: FINGER_JOINT_KEYS.filter(k => k.startsWith("l")), collapsedByDefault:true }
];

// ---- 手腳 IK 四肢鏈設定 ----
// root→mid→end 對應「肩/肘/手」或「髖/膝/腳」三根骨骼，用兩節解析解 IK 求解。
// poleOffset 是「開啟 IK 當下」極向球預設放置位置（world 空間，相對 mid 骨骼），
// 方向是合理猜測（角色面向估計為 +Z），若彎曲方向不對，直接拖曳極向球到另一側即可。
// shoulder（僅手臂有）：鎖骨輔助關節，見 solveShoulderAssist，走「限幅輔助旋轉」路線，
// 不納入兩節封閉解本身，避免解剖學上不合理的過度旋轉。
const IK_CHAINS = {
  rArm: { shoulder:"rShoulder", root:"rArm", mid:"rForeArm", end:"rHand", label:"右手", poleOffset:new THREE.Vector3(0,-0.15,0.35) },
  lArm: { shoulder:"lShoulder", root:"lArm", mid:"lForeArm", end:"lHand", label:"左手", poleOffset:new THREE.Vector3(0,-0.15,0.35) },
  rLeg: { root:"rUpLeg", mid:"rLeg", end:"rFoot", label:"右腳", poleOffset:new THREE.Vector3(0,0,0.4) },
  lLeg: { root:"lUpLeg", mid:"lLeg", end:"lFoot", label:"左腳", poleOffset:new THREE.Vector3(0,0,0.4) }
};
const IK_LIMB_KEYS = Object.keys(IK_CHAINS);
// 鎖骨限幅輔助旋轉的最大偏轉角（路線B，見分析：鎖骨真實可動範圍小，強制夾住避免穿幫）
// 註：這裡不能用下面才宣告的 D() 輔助函式（const 宣告順序問題／TDZ），直接寫弧度算式
const SHOULDER_ASSIST_MAX_ANGLE = 20 * Math.PI / 180;
// root-follow（手臂/脊椎身體平移、雙手固定）的阻尼係數：每幀只往目標位置前進一部分，
// 跨幀累積收斂，避免瞬間跳動。已用Node.js模擬驗證：0.3約10~15幀（167~250ms）收斂完成，
// 跟現有FK彈簧插值(t=0.28)手感量級一致。
// 改成 let + 可調整（見「進階/阻尼設定」面板），DEFAULT 常數留著給「恢復預設值」按鈕用。
const ROOT_FOLLOW_LERP_T_DEFAULT = 0.3;
// 脊椎 CCD（solveCCDChain）的阻尼係數預設值，同樣可調整，理由見該函式上方註解。
const SPINE_CCD_DAMPING_DEFAULT = 0.5;

// ---- 脊椎鏈設定（方向A：多節 CCD IK，頭主動搆/對準目標，身體固定）----
// 依「固定端→可動端」排列，Hips 本身不進鏈（視為整條鏈的固定支點，不旋轉）。
// effector（Head）只讀世界座標當「目前指到哪」，本身不被 CCD 直接旋轉，
// 保留給使用者事後用一般 FK 對頭做最後微調（跟手臂 IK 保留手掌 FK 是同樣設計）。
const SPINE_IK_CHAIN = { bones:["spine","spine1","spine2","neck"], effector:"head", label:"脊椎" };

// ---- 頭/胸口 look-at 設定 ----
// 跟脊椎CCD不同：look-at只轉「單一骨骼」自己的朝向去對準目標，不影響其他骨骼位置/彎曲。
// localForward 是「合理猜測」的骨骼局部前方軸（角色rest pose下head/spine2朝哪個方向算前方），
// 跟架構文件提到的頭部/胸口朝向同樣屬於「無法實際渲染驗證，靠試錯調整」的猜測值。
// chest 用 spine2（脊椎最上段）代理，這支單檔版沒有獨立的Chest骨骼。
const LOOKAT_CONFIG = {
  head:  { key:"head",  label:"頭部", localForward:new THREE.Vector3(0,0,1) },
  chest: { key:"spine2", label:"胸口", localForward:new THREE.Vector3(0,0,1) },
  rHand: {key:"rHand",label:"右手掌",localForward:new THREE.Vector3(0,0,1)},
  lHand: {key:"lHand",label:"左手掌",localForward:new THREE.Vector3(0,0,1)},
};

// ---- 手指 IK：每指一條 3 節 CCD 鏈（見任務三）----
// 跟脊椎同構——手指只有一個自然彎曲方向，不像手臂需要pole球指定彎曲側，所以直接複用
// solveCCDChain()，不做pole球（刻意設計取捨）。用 finger-id（例："rThumb"）為 key 的字典，
// 不寫死10條重複設定。effector優先用指尖第4節骨（只讀位置，不參與旋轉，不開放FK），
// 找不到時 loadModel() 會優雅退回用第3節自己當effector（見 fingerEffectorBones 賦值處）。
const FINGER_IK_CHAINS = {};
for (const hs of HAND_SIDES){
  for (const fd of FINGER_DEFS){
    const fingerId = hs.side + fd.id; // 例："rThumb"
    FINGER_IK_CHAINS[fingerId] = {
      bones: [hs.side + fd.id + "1", hs.side + fd.id + "2", hs.side + fd.id + "3"],
      tipSuffix: hs.mixamo + "Hand" + fd.id + "4", // 例："RightHandThumb4"，只讀位置用
      label: hs.label + fd.label
    };
  }
}
const FINGER_IDS = Object.keys(FINGER_IK_CHAINS);
const FINGER_IK_PREFIX = "fingerIK_"; // selectedIK.limb 前綴慣例，跟 "lookAt_"+name 同風格


export { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX };
