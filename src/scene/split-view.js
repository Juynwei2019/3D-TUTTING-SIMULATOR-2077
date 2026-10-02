import * as THREE from "three";

// Live host getters preserve shared rig and playback coordination.
export function createSplitView(context){
  let _splitRefitAt = -Infinity;

  function createSplitPane(name){
    if (context.splitViewPanes[name]) return;
    const container = document.getElementById("splitViewPanes");
    if (!container) return;

    const root = document.createElement("div");
    root.className = "splitPane";
    root.dataset.name = name;
    const canvas = document.createElement("canvas");
    const label = document.createElement("div");
    label.className = "splitPaneLabel";
    label.textContent = context.SPLIT_VIEW_LABELS[name] || name;
    root.appendChild(canvas);
    root.appendChild(label);
    container.appendChild(root);

    const paneRenderer = new THREE.WebGLRenderer({ canvas, antialias:true });
    paneRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // 預覽視窗解析度不用跟主視窗一樣高，省效能
    paneRenderer.outputColorSpace = THREE.SRGBColorSpace;
    const paneCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    context.splitViewPanes[name] = {
      root, canvas, renderer: paneRenderer, camera: paneCamera,
      // 取景狀態：desired＝最近一次重新取景算出的目標；cur＝畫面上實際使用的值（每幀朝 desired 阻尼靠近）。
      // framed=false 代表還沒取過景，第一次會直接瞬間套用，不做阻尼（避免鏡頭從原點飛過來）。
      desiredPos: new THREE.Vector3(), desiredTarget: new THREE.Vector3(),
      curPos: new THREE.Vector3(), curTarget: new THREE.Vector3(),
      framed: false
    };
    resizeSplitPane(name);
    invalidateSplitViewFraming(); // 新開的視窗下一幀就先取一次景，不用等節流時間到
    updateSplitViewCheckboxDisabled();
  }

  function destroySplitPane(name){
    const pane = context.splitViewPanes[name];
    if (!pane) return;
    pane.renderer.dispose();
    pane.root.remove();
    delete context.splitViewPanes[name];
    updateSplitViewCheckboxDisabled();
  }

  function resizeSplitPane(name){
    const pane = context.splitViewPanes[name];
    if (!pane) return;
    const w = pane.root.clientWidth, h = pane.root.clientHeight;
    if (w === 0 || h === 0) return;
    pane.renderer.setSize(w, h, false);
    pane.camera.aspect = w / h;
    pane.camera.updateProjectionMatrix();
  }

  function resizeAllSplitPanes(){
    for (const name in context.splitViewPanes) resizeSplitPane(name);
    // 預覽視窗的 aspect 變了，取景距離要重算，不必等節流時間到
    invalidateSplitViewFraming();
  }

  function updateSplitViewCheckboxDisabled(){
    const activeCount = Object.keys(context.splitViewPanes).length;
    const atLimit = activeCount >= context.SPLIT_VIEW_MAX_PANES;
    for (const name of context.SPLIT_VIEW_NAMES){
      const chk = document.getElementById("splitChk_" + name);
      if (!chk) continue;
      chk.disabled = chk.checked ? false : atLimit;
    }
  }

  function saveSplitViewState(){
    try { context.preferences.setItem("tuttingSplitViewPanes", JSON.stringify(Object.keys(context.splitViewPanes))); } catch (e) {}
  }

  function bindSplitViewUI(){
    for (const name of context.SPLIT_VIEW_NAMES){
      const chk = document.getElementById("splitChk_" + name);
      if (!chk) continue;
      chk.onchange = () => {
        if (chk.checked) createSplitPane(name); else destroySplitPane(name);
        saveSplitViewState();
      };
    }
  }

  function loadSplitViewState(){
    let names = [];
    try { names = JSON.parse(context.preferences.getItem("tuttingSplitViewPanes")) || []; } catch (e) {}
    names.filter(n => context.SPLIT_VIEW_LABELS[n]).slice(0, context.SPLIT_VIEW_MAX_PANES).forEach(name => {
      const chk = document.getElementById("splitChk_" + name);
      if (chk) chk.checked = true; // 先勾選再建立，createSplitPane() 內部判斷是否達上限時才看得到正確的勾選狀態
      createSplitPane(name);
    });
    updateSplitViewCheckboxDisabled();
  }

  function initSplitView(){
    bindSplitViewUI();
    loadSplitViewState();
  }

  function invalidateSplitViewFraming(){ _splitRefitAt = -Infinity; }

  function updateSplitViewPanes(now){
    const names = Object.keys(context.splitViewPanes);
    if (names.length === 0 || !context.scene) return;
    const t = (typeof now === "number") ? now : performance.now();

    if (t - _splitRefitAt >= context.SPLIT_VIEW_REFIT_INTERVAL_MS){
      _splitRefitAt = t;
      const info = context.getModelBoundsInfo(true); // 整批共用這一份量測結果
      for (const name of names){
        const pane = context.splitViewPanes[name];
        // 每個預覽視窗用自己的 aspect 算取景距離（小 canvas 的長寬比跟主畫面不同）
        const preset = context.computeBodyCameraPreset(name, info, pane.camera.aspect);
        if (!preset) continue;
        pane.desiredPos.set(preset.pos[0], preset.pos[1], preset.pos[2]);
        pane.desiredTarget.set(preset.target[0], preset.target[1], preset.target[2]);
        if (!pane.framed){ // 第一次取景：瞬間就位，不做阻尼
          pane.curPos.copy(pane.desiredPos);
          pane.curTarget.copy(pane.desiredTarget);
          pane.framed = true;
        }
      }
    }

    for (const name of names){
      const pane = context.splitViewPanes[name];
      // 防禦性檢查：正常情況一定為 true（量不到包圍盒時 computeBodyCameraPreset 會給退回值），
      // 只有視角名稱不在 CAMERA_BODY_VIEW_NAMES 裡才會是 false，那種情況就別渲染了
      if (!pane.framed) continue;
      pane.curPos.lerp(pane.desiredPos, context.SPLIT_VIEW_FOLLOW_T);
      pane.curTarget.lerp(pane.desiredTarget, context.SPLIT_VIEW_FOLLOW_T);
      pane.camera.position.copy(pane.curPos);
      pane.camera.lookAt(pane.curTarget);
      pane.renderer.render(context.scene, pane.camera);
    }
  }

  function onResize(){
    context.camera.aspect = innerWidth/innerHeight;
    context.camera.updateProjectionMatrix();
    context.renderer.setSize(innerWidth, innerHeight);
    resizeAllSplitPanes(); // 內部會呼叫 invalidateSplitViewFraming()
  }
  return { createSplitPane, destroySplitPane, resizeSplitPane, resizeAllSplitPanes, updateSplitViewCheckboxDisabled, saveSplitViewState, bindSplitViewUI, loadSplitViewState, initSplitView, invalidateSplitViewFraming, updateSplitViewPanes, onResize };
}
