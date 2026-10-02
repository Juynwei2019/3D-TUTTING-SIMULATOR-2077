// ======================================================================
// 全站自訂 Tooltip：取代所有原生 title 屬性的瀏覽器內建提示框。
// 用 document 層級事件委派攔截 mouseover/focusin，不管是寫死在 HTML 裡的
// title="..."，還是程式後續動態賦值（例如 el.title = "..."）產生的，
// 都在真正要顯示的那一刻統一「搬」成 data-tooltip 並清空原生 title
// （避免自訂的跟瀏覽器原生的兩個提示框同時疊出來），統一走同一套深色系樣式，
// 不需要逐一改寫程式裡每一處指定提示文字的地方。
// ======================================================================
function initGlobalTooltips(){
  let tooltipEl = null;
  let showTimer = null;
  let activeEl = null;

  function ensureTooltipEl(){
    if (!tooltipEl){
      tooltipEl = document.createElement("div");
      tooltipEl.className = "customTooltip";
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  function positionTooltip(target){
    const el = ensureTooltipEl();
    const rect = target.getBoundingClientRect();
    const margin = 8;
    const tw = el.offsetWidth, th = el.offsetHeight;
    let left = rect.left + rect.width/2 - tw/2;
    left = Math.max(margin, Math.min(left, innerWidth - tw - margin));
    let top = rect.top - th - margin;
    if (top < margin) top = rect.bottom + margin; // 上方放不下（元素太靠近視窗頂端）就改放下方
    el.style.left = left.toFixed(0) + "px";
    el.style.top = top.toFixed(0) + "px";
  }

  function showTooltip(target){
    const text = target.getAttribute("data-tooltip");
    if (!text) return;
    const el = ensureTooltipEl();
    el.textContent = text;
    el.classList.add("visible");
    positionTooltip(target);
  }

  function hideTooltip(){
    if (tooltipEl) tooltipEl.classList.remove("visible");
    activeEl = null;
  }

  // 把元素身上的原生 title 屬性搬到 data-tooltip、清空 title，讓瀏覽器不再顯示原生提示框。
  function migrateTitle(el){
    if (el.hasAttribute("title")){
      const t = el.getAttribute("title");
      if (t) el.setAttribute("data-tooltip", t);
      el.removeAttribute("title");
    }
  }

  function findTooltipTarget(node){
    return (node && node.nodeType === 1) ? node.closest("[title],[data-tooltip]") : null;
  }

  document.addEventListener("mouseover", (e) => {
    const target = findTooltipTarget(e.target);
    if (!target) return;
    migrateTitle(target);
    if (target === activeEl) return;
    activeEl = target;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => { if (activeEl === target) showTooltip(target); }, 150);
  });
  document.addEventListener("mouseout", (e) => {
    const target = findTooltipTarget(e.target);
    if (!target) return;
    if (e.relatedTarget && target.contains(e.relatedTarget)) return; // 還在同一個提示元素內部移動，不算離開
    clearTimeout(showTimer);
    hideTooltip();
  });
  document.addEventListener("focusin", (e) => {
    const target = findTooltipTarget(e.target);
    if (!target) return;
    migrateTitle(target);
    activeEl = target;
    showTooltip(target);
  });
  document.addEventListener("focusout", (e) => {
    if (findTooltipTarget(e.target)) hideTooltip();
  });
  document.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
}

export { initGlobalTooltips };
