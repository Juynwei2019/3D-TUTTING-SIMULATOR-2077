// Live host getters preserve shared rig and playback coordination.
export function createWorkspacePanels(context){
  function setDisplayTogglesCollapsed(collapsed){
    const panel = document.getElementById("displayTogglesPanel");
    if (panel) panel.classList.toggle("collapsed", collapsed);
    try { context.preferences.setItem(context.DISPLAY_TOGGLES_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0"); } catch (e) {}
  }

  function initDisplayTogglesPanel(){
    const showBodyJointsChk = document.getElementById("showBodyJointsChk");
    if (showBodyJointsChk){
      showBodyJointsChk.checked = context.showBodyJoints;
      showBodyJointsChk.onchange = (e) => context.setJointCategoryVisible("body", e.target.checked);
    }
    const showHandJointsChk = document.getElementById("showHandJointsChk");
    if (showHandJointsChk){
      showHandJointsChk.checked = context.showHandJoints;
      showHandJointsChk.onchange = (e) => context.setJointCategoryVisible("hand", e.target.checked);
    }
    const showSkeletonChk = document.getElementById("showSkeletonChk");
    if (showSkeletonChk){
      showSkeletonChk.checked = context.showSkeleton;
      showSkeletonChk.onchange = (e) => { context.showSkeleton = e.target.checked; };
    }
    const handCollisionVizCb = document.getElementById("handCollisionVizCb");
    if (handCollisionVizCb){
      handCollisionVizCb.checked = context.handCollisionVizEnabled;
      handCollisionVizCb.onchange = (e) => { context.handCollisionVizEnabled = e.target.checked; };
    }

    const collapseBtn = document.getElementById("displayTogglesCollapseBtn");
    if (collapseBtn){
      let collapsed = false;
      try { collapsed = context.preferences.getItem(context.DISPLAY_TOGGLES_COLLAPSED_STORAGE_KEY) === "1"; } catch (e) {}
      setDisplayTogglesCollapsed(collapsed);
      collapseBtn.onclick = () => {
        const panel = document.getElementById("displayTogglesPanel");
        setDisplayTogglesCollapsed(!panel.classList.contains("collapsed"));
      };
    }
  }

  function initUITabs(){
    const tabBtns = document.querySelectorAll(".tabBtn");
    const panels = document.querySelectorAll(".tabPanel");
    const validTabNames = Array.from(tabBtns).map(b => b.dataset.tab);

    function switchTab(name){
      if(name!=="tuttingGen")context.tgCancelPreview();
      tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
      panels.forEach(p => p.classList.toggle("active", p.dataset.tab === name));
      if (name === "json") context.refreshJsonArea();
      if (name === "traj") context.renderTrajPointList();
      if (name === "overview") context.updateOverviewPanel(true);
      if (name === "jointLimits") context.updateJointLimitPanelAngles(true);
      if (name === "keyframe") requestAnimationFrame(context.drawKfWaveform); // 分頁剛顯示時canvas寬度才量得到，下一幀再畫
      try { context.preferences.setItem("tuttingActiveTab", name); } catch (e) {}
      context.updateOnionSkins();
    }

    tabBtns.forEach(b => b.onclick = () => switchTab(b.dataset.tab));

    let savedTab = "poseLib";
    try { savedTab = context.preferences.getItem("tuttingActiveTab") || "poseLib"; } catch (e) {}
    // 舊版存的分頁名稱（例如已移除的「poses」）在目前分頁清單裡找不到時，退回預設分頁，避免面板空白
    if (!validTabNames.includes(savedTab)) savedTab = "poseLib";
    switchTab(savedTab);
  }

  function initUIVisibility(){
    const ui = document.getElementById("ui");
    const hideBtn = document.getElementById("uiHideBtn");
    const showBtn = document.getElementById("uiShowBtn");

    function setHidden(hidden){
      ui.style.display = hidden ? "none" : "flex";
      showBtn.style.display = hidden ? "block" : "none";
      try { context.preferences.setItem("tuttingUIHidden", hidden ? "1" : "0"); } catch (e) {}
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
    try { hidden = context.preferences.getItem("tuttingUIHidden") === "1"; } catch (e) {}
    setHidden(hidden);
  }
  return { setDisplayTogglesCollapsed, initDisplayTogglesPanel, initUITabs, initUIVisibility };
}
