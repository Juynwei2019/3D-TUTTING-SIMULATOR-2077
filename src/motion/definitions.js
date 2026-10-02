// Shared motion defaults and generation archetypes.
export const GROOVE_PRESETS = {
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

export const GROOVE_JOINT_KEYS = Object.keys(GROOVE_PRESETS);

export const GROOVE_SQUAT_DEFAULT = {
  vertAmp:5, lateralAmp:2,
  freq:1, phase:0, wave:"bounce",              // 垂直：欄位名維持不變，向下相容舊存檔/舊律動庫項目
  lateralFreq:1, lateralPhase:0, lateralWave:"sine" // 側向：新增獨立時鐘，預設值＝原本寫死的行為，不影響舊資料
};

export const GROOVE_CHAIN_ORDER = ["hips", "spine", "spine1", "spine2", "neck", "head"];

export const GROOVE_ARM_PAIRS = [
  { r:"rShoulder", l:"lShoulder", lag:0.00 },
  { r:"rArm",      l:"lArm",      lag:0.04 },
  { r:"rForeArm",  l:"lForeArm",  lag:0.08, distal:true, ampScale:0.7 },
  { r:"rHand",     l:"lHand",     lag:0.12, distal:true, ampScale:0.5 }
];

export const GROOVE_GEN_DISTAL_PROB_FALLBACK = 0.35;

export const GROOVE_GEN_ENERGY_BUDGET = 34;

export const GROOVE_GEN_DISTAL_ENERGY_BONUS = 8;

export const GROOVE_ARCHETYPES = {
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

export const GROOVE_ARCHETYPE_IDS = Object.keys(GROOVE_ARCHETYPES);

export const WAVE_ROUTE_NODES=[['lFinger',0,'左手指'],['lWrist',.7,'左手腕'],['lElbow',1.6,'左手肘'],['lShoulder',3.6,'左肩'],['rShoulder',4.4,'右肩'],['rElbow',6.4,'右手肘'],['rWrist',7.3,'右手腕'],['rFinger',8,'右手指']];

export const WAVE_GAIN_FIELDS={FingerGain:'fingerGain',WristGain:'wristGain',ElbowGain:'elbowGain',ShoulderGain:'shoulderGain',Compensation:'compensation',BodyChestGain:'bodyChestGain',BodyWaistGain:'bodyWaistGain',BodyHipGain:'bodyHipGain'};

export const WAVE_DEFAULT={mode:'unipolar',polarity:'positive',shape:'cosine',route:'both',startNode:'lFinger',endNode:'rFinger',direction:'lr',repeat:'loop',amplitude:25,width:1.4,beats:4,fingers:true,fingerGain:100,wristGain:100,elbowGain:100,shoulderGain:100,compensation:0,speed:1,bodyChestGain:100,bodyWaistGain:100,bodyHipGain:100};

export const WAVE_SHAPE_HINTS={
  cosine:'平滑抬起與回復，維持原版波浪質感。',
  gaussian:'波峰較集中、兩側柔和消退；高斯曲線截尾並歸零，路線兩端回復原姿勢。',
  triangle:'等速抬起與放下，峰頂轉折明顯，呈現機械稜角感。',
  trapezoid:'抬起後短暫維持最大幅度，再等速放下，呈現停留感。'
};

export const GROOVE_XFADE_BEATS = 0.3;
