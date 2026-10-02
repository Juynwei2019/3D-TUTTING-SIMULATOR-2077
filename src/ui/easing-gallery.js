import { EASINGS, EASING_GROUPS } from "../math/easings.js";
import { clampNum } from "../math/angles.js";

// 依取樣點畫出 Easing 曲線的 SVG path（y 軸範圍放大到 -0.4~1.4 以容納 Back/Elastic 的 overshoot）
function easingSVGPath(fn, w, h, pad){
  const steps = 32, yMin = -0.4, yMax = 1.4;
  let d = "";
  for (let i = 0; i <= steps; i++){
    const t = i/steps;
    let y = fn(t);
    if (!isFinite(y)) y = 0;
    const x = pad + t*(w - 2*pad);
    const yn = (y - yMin)/(yMax - yMin);
    const yy = (h - pad) - yn*(h - 2*pad);
    d += (i===0 ? "M" : "L") + x.toFixed(1) + "," + yy.toFixed(1) + " ";
  }
  return d;
}

// 快取：buildEasingSVG 只跟 (name, w, h) 三個參數有關，且呼叫端固定只用兩種尺寸
// （64x34 預覽框、26x15 拍點縮圖）× 32 種 easing，組合數很小，算過一次就能重複利用，
// 不用每次新增/刪除拍點、切換 easing 選項時把「沒變」的其他拍點縮圖也重新產生一次 SVG 字串。
const _easingSVGCache = new Map();
function buildEasingSVG(name, w, h){
  const cacheKey = name + "_" + w + "_" + h;
  const cached = _easingSVGCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const fn = EASINGS[name] || EASINGS.linear;
  const pad = 3;
  const path = easingSVGPath(fn, w, h, pad);
  // 輔助虛線：0 與 1 的水平基準線，方便判讀 overshoot 幅度
  const y0 = (h - pad) - ((0 - (-0.4))/1.8)*(h - 2*pad);
  const y1 = (h - pad) - ((1 - (-0.4))/1.8)*(h - 2*pad);
  const svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
    + `<line x1="${pad}" y1="${y0.toFixed(1)}" x2="${w-pad}" y2="${y0.toFixed(1)}" stroke="#33335a" stroke-width="1" stroke-dasharray="2,2"/>`
    + `<line x1="${pad}" y1="${y1.toFixed(1)}" x2="${w-pad}" y2="${y1.toFixed(1)}" stroke="#33335a" stroke-width="1" stroke-dasharray="2,2"/>`
    + `<path d="${path}" fill="none" stroke="#7fe0ff" stroke-width="1.6" stroke-linecap="round"/>`
    + `</svg>`;
  _easingSVGCache.set(cacheKey, svg);
  return svg;
}

function buildEasingSelectOptions(){
  return EASING_GROUPS.map(g => {
    const opts = g.items.map(([val,label]) => `<option value="${val}">${label}</option>`).join("");
    return `<optgroup label="${g.label}">${opts}</optgroup>`;
  }).join("");
}

// ======================================================================
// Easing 圖鑑分頁 — 32 種緩動函式的曲線 + 移動圓點 + 下方軌道小球，全部同步循環播放
// （跑 EG_DURATION 毫秒、停 EG_PAUSE 毫秒後重來），方便跟時間軸分頁的轉場選單對照挑選。
// ======================================================================
const EG_W = 84, EG_H = 42, EG_PAD = 5, EG_Y_MIN = -0.4, EG_Y_MAX = 1.4;
const EG_DURATION = 1400, EG_PAUSE = 500, EG_CYCLE = EG_DURATION + EG_PAUSE;
let easingGalleryCardRefs = null;   // 建好之後快取，分頁沒開過就不用先建
let easingGalleryPlaying = false;   // 預設關閉；由「暫停/播放」按鈕與 prefers-reduced-motion 共同控制
let easingGalleryStartTime = null;  // 目前這輪循環的起點時間戳（rAF timestamp）

// 卡片內部小型 SVG：格線 + 對角參考虛線 + 曲線本體（沿用 easingSVGPath，尺寸跟主選單預覽不同）
function buildEasingGalleryCardSVG(fn){
  const path = easingSVGPath(fn, EG_W, EG_H, EG_PAD);
  const y0 = (EG_H - EG_PAD) - ((0 - EG_Y_MIN)/(EG_Y_MAX - EG_Y_MIN))*(EG_H - 2*EG_PAD);
  const y1 = (EG_H - EG_PAD) - ((1 - EG_Y_MIN)/(EG_Y_MAX - EG_Y_MIN))*(EG_H - 2*EG_PAD);
  const diag = `M${EG_PAD},${(EG_H-EG_PAD).toFixed(1)} L${(EG_W-EG_PAD).toFixed(1)},${EG_PAD}`;
  return `<svg class="egSvg" viewBox="0 0 ${EG_W} ${EG_H}">`
    + `<line x1="${EG_PAD}" y1="${y0.toFixed(1)}" x2="${EG_W-EG_PAD}" y2="${y0.toFixed(1)}" stroke="#26264a" stroke-width="1"/>`
    + `<line x1="${EG_PAD}" y1="${y1.toFixed(1)}" x2="${EG_W-EG_PAD}" y2="${y1.toFixed(1)}" stroke="#26264a" stroke-width="1"/>`
    + `<path d="${diag}" fill="none" stroke="#33335a" stroke-width="1" stroke-dasharray="2,2"/>`
    + `<path d="${path}" fill="none" stroke="#7fe0ff" stroke-width="1.6" stroke-linecap="round"/>`
    + `<circle class="egDot" r="3" fill="#ff2f7e"></circle>`
    + `</svg>`;
}

// 分頁第一次切到時才真的建立 DOM（32 張卡片 + SVG 沒必要在載入模型時就先建好）
function buildEasingGallery(){
  const container = document.getElementById("easingGalleryGroups");
  if (!container) return [];
  let html = "";
  EASING_GROUPS.forEach(g => {
    html += `<div class="egGroup"><div class="egGroupTitle">${g.label}</div><div class="egGrid">`;
    g.items.forEach(([name, label]) => {
      const fn = EASINGS[name] || EASINGS.linear;
      html += `<div class="egCard" data-ease="${name}">`
        + buildEasingGalleryCardSVG(fn)
        + `<div class="egTrack"><div class="egBall"></div></div>`
        + `<div class="egLabel">${label}<span class="egLabelEn">${name}</span></div>`
        + `</div>`;
    });
    html += `</div></div>`;
  });
  container.innerHTML = html;

  const refs = [];
  container.querySelectorAll(".egCard").forEach(card => {
    const fn = EASINGS[card.dataset.ease] || EASINGS.linear;
    refs.push({ fn, dot: card.querySelector(".egDot"), ball: card.querySelector(".egBall") });
  });
  return refs;
}

// 每幀依目前循環進度 t（0~1，過了 EG_DURATION 之後停在 1 直到下一輪重置）更新全部卡片
function updateEasingGalleryFrame(t, refs){
  const x = EG_PAD + t*(EG_W - 2*EG_PAD);
  for (const c of refs){
    let y = c.fn(t);
    if (!isFinite(y)) y = 0;
    const yn = (y - EG_Y_MIN)/(EG_Y_MAX - EG_Y_MIN);
    const yy = (EG_H - EG_PAD) - yn*(EG_H - 2*EG_PAD);
    c.dot.setAttribute("cx", x.toFixed(1));
    c.dot.setAttribute("cy", yy.toFixed(1));
    // 軌道小球直接用 y（緩動後的輸出值）當作沿軌道的水平位置；Back/Elastic 允許 y 略小於0或大於1，
    // 讓小球自然滑出軌道邊緣一點點，才看得出「甩過頭」的手感，軌道用 overflow:visible 不裁切。
    c.ball.style.left = (y*100).toFixed(1) + "%";
  }
}

function easingGalleryLoop(now){
  requestAnimationFrame(easingGalleryLoop);
  const panel = document.getElementById("tabEasingGallery");
  if (!panel || !panel.classList.contains("active")) { easingGalleryStartTime = null; return; }
  if (!easingGalleryCardRefs) easingGalleryCardRefs = buildEasingGallery();
  if (!easingGalleryPlaying) return;
  if (easingGalleryStartTime === null) easingGalleryStartTime = now;
  const elapsed = (now - easingGalleryStartTime) % EG_CYCLE;
  const t = elapsed <= EG_DURATION ? clampNum(elapsed/EG_DURATION, 0, 1) : 1;
  updateEasingGalleryFrame(t, easingGalleryCardRefs);
}

function initEasingGallery(){
  let reducedMotion = false;
  try { reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  easingGalleryPlaying = false; // 預設關閉動畫，需使用者按「播放動畫」才會開始
  const playBtn = document.getElementById("egPlayBtn");
  const hint = document.getElementById("egReducedMotionHint");
  if (reducedMotion && hint) hint.style.display = "";
  function syncPlayBtnLabel(){
    if (playBtn) playBtn.textContent = easingGalleryPlaying ? "⏸ 暫停動畫" : "▶ 播放動畫";
  }
  syncPlayBtnLabel();
  if (playBtn) playBtn.onclick = () => {
    easingGalleryPlaying = !easingGalleryPlaying;
    easingGalleryStartTime = null; // 重新開始算這輪循環的時間基準，避免暫停期間累積的時間差造成跳幀
    syncPlayBtnLabel();
  };
  requestAnimationFrame(easingGalleryLoop);
}


export { buildEasingSVG, buildEasingSelectOptions, initEasingGallery };
