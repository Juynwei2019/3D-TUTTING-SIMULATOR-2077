// ---- 32 種 Easing 緩動曲線（Robert Penner 公式家族 + Linear + Smoothstep）----
// 每個函式：輸入 t ∈ [0,1] 的線性進度，回傳緩動後的進度。
// Back / Elastic 系列刻意允許輸出超出 [0,1]（overshoot），拿去 slerp 四元數會自然做出
// 「甩過頭再回彈」的頓點效果，很適合 tutting 的甩勁動作。
function easeOutBounce(t){
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1) return n1*t*t;
  if (t < 2/d1) return n1*(t -= 1.5/d1)*t + 0.75;
  if (t < 2.5/d1) return n1*(t -= 2.25/d1)*t + 0.9375;
  return n1*(t -= 2.625/d1)*t + 0.984375;
}
const EASINGS = {
  linear:        t => t,
  smoothStep:    t => t*t*(3 - 2*t),

  easeInSine:    t => 1 - Math.cos((t*Math.PI)/2),
  easeOutSine:   t => Math.sin((t*Math.PI)/2),
  easeInOutSine: t => -(Math.cos(Math.PI*t) - 1)/2,

  easeInQuad:    t => t*t,
  easeOutQuad:   t => 1 - (1-t)*(1-t),
  easeInOutQuad: t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2,

  easeInCubic:    t => t*t*t,
  easeOutCubic:   t => 1 - Math.pow(1-t, 3),
  easeInOutCubic: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2,

  easeInQuart:    t => t*t*t*t,
  easeOutQuart:   t => 1 - Math.pow(1-t, 4),
  easeInOutQuart: t => t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2, 4)/2,

  easeInQuint:    t => t*t*t*t*t,
  easeOutQuint:   t => 1 - Math.pow(1-t, 5),
  easeInOutQuint: t => t < 0.5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t+2, 5)/2,

  easeInExpo:    t => t === 0 ? 0 : Math.pow(2, 10*t - 10),
  easeOutExpo:   t => t === 1 ? 1 : 1 - Math.pow(2, -10*t),
  easeInOutExpo: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20*t-10)/2 : (2 - Math.pow(2, -20*t+10))/2,

  easeInCirc:    t => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  easeOutCirc:   t => Math.sqrt(1 - Math.pow(t-1, 2)),
  easeInOutCirc: t => t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2*t, 2)))/2 : (Math.sqrt(1 - Math.pow(-2*t+2, 2)) + 1)/2,

  easeInBack: t => { const c1=1.70158, c3=c1+1; return c3*t*t*t - c1*t*t; },
  easeOutBack: t => { const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); },
  easeInOutBack: t => {
    const c1=1.70158, c2=c1*1.525;
    return t < 0.5
      ? (Math.pow(2*t, 2) * ((c2+1)*2*t - c2)) / 2
      : (Math.pow(2*t-2, 2) * ((c2+1)*(t*2-2) + c2) + 2) / 2;
  },

  easeInElastic: t => {
    const c4 = (2*Math.PI)/3;
    return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10*t-10) * Math.sin((t*10-10.75)*c4);
  },
  easeOutElastic: t => {
    const c4 = (2*Math.PI)/3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10*t) * Math.sin((t*10-0.75)*c4) + 1;
  },
  easeInOutElastic: t => {
    const c5 = (2*Math.PI)/4.5;
    return t === 0 ? 0 : t === 1 ? 1 : t < 0.5
      ? -(Math.pow(2, 20*t-10) * Math.sin((20*t-11.125)*c5))/2
      : (Math.pow(2, -20*t+10) * Math.sin((20*t-11.125)*c5))/2 + 1;
  },

  easeOutBounce,
  easeInBounce:    t => 1 - easeOutBounce(1 - t),
  easeInOutBounce: t => t < 0.5 ? (1 - easeOutBounce(1 - 2*t))/2 : (1 + easeOutBounce(2*t - 1))/2
};

// select 選單分組用（10 家族 x In/Out/InOut = 30 + Linear + SmoothStep = 32）
const EASING_GROUPS = [
  { label:"基本", items:[["linear","Linear（線性）"],["smoothStep","SmoothStep（平滑）"]] },
  { label:"Sine",    items:[["easeInSine","In"],["easeOutSine","Out"],["easeInOutSine","InOut"]] },
  { label:"Quad",    items:[["easeInQuad","In"],["easeOutQuad","Out"],["easeInOutQuad","InOut"]] },
  { label:"Cubic",   items:[["easeInCubic","In"],["easeOutCubic","Out"],["easeInOutCubic","InOut"]] },
  { label:"Quart",   items:[["easeInQuart","In"],["easeOutQuart","Out"],["easeInOutQuart","InOut"]] },
  { label:"Quint",   items:[["easeInQuint","In"],["easeOutQuint","Out"],["easeInOutQuint","InOut"]] },
  { label:"Expo",    items:[["easeInExpo","In"],["easeOutExpo","Out"],["easeInOutExpo","InOut"]] },
  { label:"Circ",    items:[["easeInCirc","In"],["easeOutCirc","Out"],["easeInOutCirc","InOut"]] },
  { label:"Back（甩過頭）",    items:[["easeInBack","In"],["easeOutBack","Out"],["easeInOutBack","InOut"]] },
  { label:"Elastic（彈簧）",   items:[["easeInElastic","In"],["easeOutElastic","Out"],["easeInOutElastic","InOut"]] },
  { label:"Bounce（彈跳）",    items:[["easeInBounce","In"],["easeOutBounce","Out"],["easeInOutBounce","InOut"]] }
];


export { EASINGS, EASING_GROUPS };
