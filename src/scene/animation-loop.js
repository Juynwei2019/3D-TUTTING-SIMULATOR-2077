import * as THREE from "three";

// Live host getters preserve shared rig and playback coordination.
export function createAnimationLoop(context){
  const _idleLastCamPos = new THREE.Vector3();

  const _idleLastCamTarget = new THREE.Vector3();

  let _idleCamInited = false;

  let _idleFrameCount = 0;

  let _idleLastRenderAt = 0;

  function isCameraStillMoving(){
    if (!_idleCamInited){
      _idleLastCamPos.copy(context.camera.position);
      _idleLastCamTarget.copy(context.controls.target);
      _idleCamInited = true;
      return true; // 第一次呼叫（例如剛載入模型），保守視為「還在動」
    }
    const posDeltaSq = context.camera.position.distanceToSquared(_idleLastCamPos);
    const targetDeltaSq = context.controls.target.distanceToSquared(_idleLastCamTarget);
    _idleLastCamPos.copy(context.camera.position);
    _idleLastCamTarget.copy(context.controls.target);
    return posDeltaSq > context.IDLE_CAMERA_CONVERGE_EPS_SQ || targetDeltaSq > context.IDLE_CAMERA_CONVERGE_EPS_SQ;
  }

  function isSceneActive(posesStillMoving, cameraStillMoving){
    return !!context.tgPreview || !!context.waveRun?.playing || !!context.laPathRun?.playing || context.kfPlaying                                   // 正在播放關鍵影格
        || context.groovePreviewEnabled                          // 律動即時預覽開著，姿勢會持續變化
        || context.draggingKey !== null                           // 使用者正在拖曳某顆關節/IK球
        || (context.transformControls && context.transformControls.dragging)
        || (context.transformControlsIK && context.transformControlsIK.dragging)
        || (context.grabBoxCore && context.grabBoxCore.isDragging())      // 扶握箱專屬控制環正在被拖曳
        || context.cameraTween !== null                           // 「鏡頭」預設視角補間動畫進行中
        || posesStillMoving                                // current 尚未追上 target（含彈簧式lerp的收尾）
        || cameraStillMoving;                              // 相機位置/看點尚未收斂（含OrbitControls阻尼收尾）
  }

  function animate(now){
    requestAnimationFrame(animate);
    context.tickLAPath(now);
    context.updateLACustomVisual();
    context.updatePoleRange();
    context.updateHandRangeHelper();
    context.perfTickRaf(now); // 每次 rAF 回呼都要量測，不能因為閒置就跳過（道理跟下面相機收斂判斷一樣）

    // 相機收斂判斷必須「每幀都呼叫」以維持快照正確（見函式內註解），跟是否要降頻無關，成本也很低。
    const cameraStillMoving = isCameraStillMoving();

    let posesStillMoving = context.kfPlaying; // 播放中永遠視為「還在動」，updateBones() 這幀不會被呼叫到
    if (context.kfPlaying){
      context.updateKeyframePlayback(now);
    } else {
      posesStillMoving = context.updateBones();
      context.solveSpineRootFollow();
      if (context.grabBoxCore) context.grabBoxCore.updateEachFrame();
      context.solveIKAll();
      context.solveSpineIK();
      context.solveLookAt("chest");
      context.solveLookAt("head");
      for(const name of context.HAND_AIM_NAMES)context.solveHandAim(name);
      context.grabBoxCore?.applyPalmOrientation?.();
      context.solveFingerIKAll();
      if (context.groovePreviewEnabled){
        // 🔧 修正：這裡的律動是排在 solveIKAll()／solveSpineIK()／solveLookAt() 之後跑的，
        // 若某關節正被 IK 接管（例如開著右手 IK 又勾了 rArm 律動），律動會 post-multiply 到
        // 「已經解好的」IK 結果上，把手掌轉離目標球——看起來就是 IK 失效/手一直飄。
        // 傳 grooveBlockedKeys 當 overrideKeys，讓律動主動避開這些關節（語意跟避開軌跡接管的關節一致）。
        // 用 grooveBlockedKeys 而不是 ikDrivenKeys：它多含「手指IK開著的那隻手掌」，
        // 否則腕部律動會把已經解好的手指整組轉離目標點（見該集合上方註解）。
        // 只在預覽路徑做：播放拍點路徑不會呼叫 solveIKAll，那裡的 IK 開關並沒有真的在驅動骨骼，
        // 若也跳過會變成「開著 IK 就播不出律動」的行為倒退。
        context.applyGroove(now, context.grooveBlockedKeys, context.groovePreviewStartTime, false);
        context.applySquatGroove(now, context.groovePreviewStartTime, true, undefined, false);
      }
    }

    context.tickWave(now);
    if (!context.kfPlaying) context.solveFootPlant();
    context.updateFootPlantUI();
    const active = isSceneActive(posesStillMoving, cameraStillMoving);
    _idleFrameCount = active ? 0 : _idleFrameCount + 1;
    const idle = _idleFrameCount > context.IDLE_THRESHOLD_FRAMES;

    // 閒置中還沒到下一個降頻時間點：這一幀直接跳過碰撞/渲染，省下這幀剩下的所有工作。
    // 上面 FK/IK 已經算過一次（求解本身很快，且下一幀馬上要用最新的 target/current 判斷是否已收斂，
    // 拆出來反而複雜化狀態機），真正貴的是碰撞求解＋DOM更新＋render，所以降頻只作用在這之後。
    if (idle && now - _idleLastRenderAt < context.IDLE_RENDER_INTERVAL_MS){
      context.updatePerfPanelDom(now, idle, false); // 這幀沒渲染，仍更新面板讓 rAF fps／閒置狀態即時反映
      return;
    }
    if (idle) _idleLastRenderAt = now;

    context.solveHandBodyCollision(); // 放在 FK/IK/律動/關鍵影格播放都跑完之後，修正「最終姿勢」，不管姿勢來源是哪裡
    context.solveHandHandCollision(); // 手-身體修正完之後再處理雙手互碰，避免兩套修正互相覆蓋彼此的結果
    if(!context.kfPlaying&&context.HAND_AIM_NAMES.some(n=>context.lookAtEnabled[n])){
      for(const name of context.HAND_AIM_NAMES)context.solveHandAim(name);
      context.solveFingerIKAll();
    }
    if(!context.kfPlaying&&context.headFollowSource!=="free")context.solveLookAt("head");
    context.tgTick();
    if(!context.kfPlaying&&context.grabBoxCore?.applyPalmOrientation?.())context.solveFingerIKAll();
    context.solveTimelineGrabHands?.();
    context.updateHandCollisionVizMeshes();
    context.updateMarkers();
    context.updateSkeletonLines();
    context.updateOverviewPanel();
    context.updateJointLimitPanelAngles();
    context.updateCameraTween(now);
    context.controls.update();
    context.renderer.render(context.scene, context.camera);
    context.perfTickRender(now);
    context.updateSplitViewPanes(now);
    context.updatePerfPanelDom(now, idle, true);
  }
  return { isCameraStillMoving, isSceneActive, animate };
}
