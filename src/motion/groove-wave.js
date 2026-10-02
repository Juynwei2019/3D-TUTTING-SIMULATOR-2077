import { EASINGS } from "../math/easings.js";

const GROOVE_WAVE_EASE_PREFIX = "ease:";
const GROOVE_WAVE_EASE_BI_PREFIX = "easeBi:";

// 波形 id 是否合法（給 sanitize 用）：內建兩種 + 前綴後面必須是真的存在的 easing 名稱，
// 避免壞資料／舊版檔案帶進不存在的曲線，在 grooveWaveValue 裡靜默退回而讓人找不到原因。
function isValidGrooveWave(w){
  if (w === "bounce" || w === "sine") return true;
  if (typeof w !== "string") return false;
  if (w.startsWith(GROOVE_WAVE_EASE_BI_PREFIX)) return !!EASINGS[w.slice(GROOVE_WAVE_EASE_BI_PREFIX.length)];
  if (w.startsWith(GROOVE_WAVE_EASE_PREFIX))    return !!EASINGS[w.slice(GROOVE_WAVE_EASE_PREFIX.length)];
  return false;
}

// 依波形種類把「拍子相位」（可以是任意實數，只取小數部分）轉成一個振幅係數：
// bounce / ease: 落在 [0,1] 附近（單峰，谷底在整拍點上；Back/Elastic 會 overshoot 出界，這是刻意保留的）；
// sine / easeBi: 落在 [-1,1] 附近（來回擺動，整拍點過零）。
function grooveWaveValue(wave, phaseRaw){
  const p = phaseRaw - Math.floor(phaseRaw); // 只取小數部分，摺回 0~1 一個週期內
  if (wave === "bounce") return (1 - Math.cos(p * Math.PI * 2)) / 2;

  if (typeof wave === "string" && wave.startsWith(GROOVE_WAVE_EASE_BI_PREFIX)){
    const fn = EASINGS[wave.slice(GROOVE_WAVE_EASE_BI_PREFIX.length)];
    if (fn){
      // 相位切成 0→+1（前1/4）、+1→-1（中間1/2）、-1→0（後1/4），跟 sine 的過零點完全對齊，
      // 所以把某關節的 sine 換成 easeBi 不會整條律動偏拍，只有擺動的加減速感覺變了。
      let v;
      if (p < 0.25)      v = fn(p * 4);
      else if (p < 0.75) v = 1 - 2 * fn((p - 0.25) * 2);
      else               v = -1 + fn((p - 0.75) * 4);
      return isFinite(v) ? v : 0;
    }
  } else if (typeof wave === "string" && wave.startsWith(GROOVE_WAVE_EASE_PREFIX)){
    const fn = EASINGS[wave.slice(GROOVE_WAVE_EASE_PREFIX.length)];
    if (fn){
      // 前半拍用 easing 升到 1、後半拍鏡像降回 0，谷底落在整拍點上＝跟 bounce 同一套落點語意。
      const v = (p < 0.5) ? fn(p * 2) : fn((1 - p) * 2);
      return isFinite(v) ? v : 0;
    }
  }
  return Math.sin(p * Math.PI * 2);
}

// 波形 id → 人看得懂的短標籤（UI 顯示用）。
function grooveWaveLabel(wave){
  if (wave === "bounce") return "彈跳 bounce";
  if (wave === "sine")   return "來回 sine";
  if (typeof wave === "string" && wave.startsWith(GROOVE_WAVE_EASE_BI_PREFIX))
    return "來回・" + wave.slice(GROOVE_WAVE_EASE_BI_PREFIX.length);
  if (typeof wave === "string" && wave.startsWith(GROOVE_WAVE_EASE_PREFIX))
    return "單向・" + wave.slice(GROOVE_WAVE_EASE_PREFIX.length);
  return String(wave);
}

// 暖身漸強：依「從律動整段開始算起的連續拍數」算出 0~1 的係數，乘在最終輸出的振幅/位移上。
// beatsElapsedTotal 刻意用連續值而不是段落內的 localBeats——這樣只有整段律動剛開始的頭幾拍會被
// 壓低，序列切到第幾段都不會重複觸發（避免跟 crossfade 疊加讓每次段落切換都顯得虛軟）。

export { GROOVE_WAVE_EASE_PREFIX, GROOVE_WAVE_EASE_BI_PREFIX, isValidGrooveWave, grooveWaveValue, grooveWaveLabel };
