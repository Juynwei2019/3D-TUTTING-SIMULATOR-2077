// Live host getters preserve shared rig and playback coordination.
export function createPerformancePanel(context){
  let _perfRafLastTime = 0;

  let _perfRafEmaMs = 16.7;

  let _perfRenderLastTime = 0;

  let _perfRenderEmaMs = 16.7;

  let _perfLastDomUpdateAt = 0;

  function initPerfPanel(){
    const chk = document.getElementById("showPerfPanelChk");
    const panel = document.getElementById("perfPanel");
    if (!chk || !panel) return;
    try {
      const raw = context.preferences.getItem(context.PERF_PANEL_STORAGE_KEY);
      context.perfPanelEnabled = (raw === null) ? true : (raw === "1");
    } catch (e) { context.perfPanelEnabled = true; }
    chk.checked = context.perfPanelEnabled;
    panel.style.display = context.perfPanelEnabled ? "flex" : "none";
    chk.onchange = (e) => {
      context.perfPanelEnabled = e.target.checked;
      panel.style.display = context.perfPanelEnabled ? "flex" : "none";
      try { context.preferences.setItem(context.PERF_PANEL_STORAGE_KEY, context.perfPanelEnabled ? "1" : "0"); } catch (err) {}
    };
  }

  function perfTickRaf(now){
    if (_perfRafLastTime){
      const dt = now - _perfRafLastTime;
      if (dt > 0 && dt < 1000) _perfRafEmaMs += (dt - _perfRafEmaMs) * context.PERF_EMA_ALPHA;
    }
    _perfRafLastTime = now;
  }

  function perfTickRender(now){
    if (_perfRenderLastTime){
      const dt = now - _perfRenderLastTime;
      if (dt > 0 && dt < 1000) _perfRenderEmaMs += (dt - _perfRenderEmaMs) * context.PERF_EMA_ALPHA;
    }
    _perfRenderLastTime = now;
  }

  function updatePerfPanelDom(now, idle, didRenderThisFrame){
    if (!context.perfPanelEnabled) return;
    if (now - _perfLastDomUpdateAt < context.PERF_DOM_UPDATE_INTERVAL_MS) return;
    _perfLastDomUpdateAt = now;

    const rafFps = _perfRafEmaMs > 0 ? 1000 / _perfRafEmaMs : 0;
    const renderFps = _perfRenderEmaMs > 0 ? 1000 / _perfRenderEmaMs : 0;
    const info = (didRenderThisFrame && context.renderer) ? context.renderer.info.render : null;

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
  return { initPerfPanel, perfTickRaf, perfTickRender, updatePerfPanelDom };
}
