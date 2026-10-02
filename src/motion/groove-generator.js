// Live host getters preserve shared rig and playback coordination.
export function createGrooveGenerator(context){
  function makeGrooveRng(seed){
    let a = seed >>> 0;
    return function(){
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function grooveAmpLimitFor(key, axis){
    const lim = context.JOINT_LIMITS[key] && context.JOINT_LIMITS[key][axis];
    if (!lim || !lim.enabled) return null;
    return Math.max(0, Math.min(Math.abs(lim.min), Math.abs(lim.max)));
  }

  function generateGrooveConfig(archetypeId, seed){
    const arcId = context.GROOVE_ARCHETYPES[archetypeId] ? archetypeId : "down";
    const arc = context.GROOVE_ARCHETYPES[arcId];
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
      const key = context.GROOVE_CHAIN_ORDER[i];
      if (!context.GROOVE_PRESETS[key]) continue;
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
      const distalProb = Number.isFinite(arc.distalProb) ? arc.distalProb : context.GROOVE_GEN_DISTAL_PROB_FALLBACK;
      const includeDistal = distalRnd() < distalProb;
      usedDistal = includeDistal;

      for (const pair of context.GROOVE_ARM_PAIRS){
        if (pair.distal && !includeDistal) continue;
        // 遠端兩節的抖動值同樣走衍生流：連「抽幾次 rnd()」都跟舊版一模一樣，
        // 後面的蹲彈層才不會因為前面多抽兩次而整組偏掉。
        const jitter = pair.distal ? distalRf(0.9, 1.1) : rf(0.9, 1.1);
        for (const side of ["r", "l"]){
          const key = pair[side];
          if (!context.GROOVE_PRESETS[key]) continue;
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
    const energyBudget = context.GROOVE_GEN_ENERGY_BUDGET + (usedDistal ? context.GROOVE_GEN_DISTAL_ENERGY_BONUS : 0);
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

  function grooveGenAutoName(archetypeId, seed){
    const arc = context.GROOVE_ARCHETYPES[archetypeId];
    const short = arc ? arc.short : "Groove";
    return "自動_" + short + "_" + (seed >>> 0).toString(36).slice(-4).toUpperCase();
  }
  return { makeGrooveRng, grooveAmpLimitFor, generateGrooveConfig, grooveGenAutoName };
}
