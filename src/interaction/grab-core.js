import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { applyBoneWorldQuatLock } from "../math/quaternions.js";
import { grabSurfaceNormal, grabPalmQuaternion } from "./grab-orientation.js";
import { grabPresetPoints, grabChestFrame } from "./grab-presets.js";
import { GRAB_SHAPE_DEFAULTS, GRAB_SHAPE_CLOSEST_POINT, buildGrabShapeGeometry } from "./grab-shapes.js";


// ======================================================================
// 扶握箱功能 — 核心邏輯區塊（createGrabBoxCore）
// 依 IK扶握箱-功能紀錄-v2.md 的介面設計：內部狀態全部是 closure 變數，
// 外部拿不到也改不到，只能透過回傳的方法操作；依賴用「讀取用函式」注入，
// 不直接吃物件參照，避免主程式之後改變這些物件時，核心還抱著舊的參照。
// 這個區塊完全不碰 DOM、不知道面板長什麼樣子，跟 UI 區塊（mountGrabBoxUI）解耦。
// ======================================================================
// ---- 核心工廠函式 ----
// deps: { scene, camera, renderer, orbitControls, getModel, getBones, getHandBone, getIKTargetMesh, isIKEnabled, setIKEnabled }
function createGrabBoxCore(deps){
  let visible = false;
  let mode = "translate"; // "translate" | "rotate"，對應箱子自己的 TransformControls 模式
  let shapeType = "box";
  const shapeParams = {
    box:      { ...GRAB_SHAPE_DEFAULTS.box },
    sphere:   { ...GRAB_SHAPE_DEFAULTS.sphere },
    cylinder: { ...GRAB_SHAPE_DEFAULTS.cylinder },
  };
  const grabbed = { rArm: false, lArm: false };     // 目前是否正在扶握
  const grabLocal = { rArm: null, lArm: null };      // 扶握點的「箱子本地座標」，THREE.Vector3
  let mesh = null;   // 透明箱子本體（含邊框線）
  let gizmo = null;  // 專屬於箱子的 TransformControls，跟主程式的關節/IK 控制環完全分開
  const listeners = [];
  let preset = null, revision = 0, messageKey = null, palmAligned = false;
  const palmTwist = {rArm:0,lArm:0};
  const clone = value => JSON.parse(JSON.stringify(value));

  function notify(){
    const state = getState();
    for (const fn of listeners) fn(state);
  }

  function getState(){
    return {
      visible, mode, shapeType,
      shapeParams: {
        box:      { ...shapeParams.box },
        sphere:   { ...shapeParams.sphere },
        cylinder: { ...shapeParams.cylinder },
      },
      grabbed: { ...grabbed },
      preset, messageKey, palmAligned, palmTwist:{...palmTwist},
    };
  }

  function onChange(fn){
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function rebuildGeometry(){
    if (!mesh) return;
    const newGeo = buildGrabShapeGeometry(shapeType, shapeParams[shapeType]);
    mesh.geometry.dispose();
    mesh.geometry = newGeo;
    const edges = mesh.children[0];
    if (edges){
      edges.geometry.dispose();
      edges.geometry = new THREE.EdgesGeometry(newGeo);
    }
  }

  // 箱子初始位置：胸口（Spine2）正前方，沿角色目前世界 +Z 方向偏移一小段距離
  // （+Z 面向假設跟既有 IK 極向球/Look-At 是同一個假設，見 LOOKAT_CONFIG）
  function placeAtChestDefault(){
    const bonesObj = deps.getBones();
    const chestBone = bonesObj ? bonesObj.spine2 : null;
    if (!chestBone || !mesh) return;
    const chestPos = new THREE.Vector3();
    chestBone.getWorldPosition(chestPos);
    const forward = new THREE.Vector3(0, 0, 1);
    const modelObj = deps.getModel ? deps.getModel() : null;
    if (modelObj) forward.applyQuaternion(modelObj.quaternion);
    mesh.position.copy(chestPos).addScaledVector(forward, 0.22);
    mesh.quaternion.identity();
  }

  // 模型載入完成後由主程式呼叫一次；也在 setVisible/grabHand 內當保護網重複呼叫（只會真的建一次）
  function buildAfterModelLoad(){
    if (mesh) return;
    const geometry = buildGrabShapeGeometry(shapeType, shapeParams[shapeType]);
    const material = new THREE.MeshBasicMaterial({
      color: 0x7cffb2, transparent: true, opacity: 0.22,
      depthWrite: false, side: THREE.DoubleSide,
    });
    mesh = new THREE.Mesh(geometry, material);
    mesh.name = "grabBoxMesh";
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x7cffb2, transparent: true, opacity: 0.6 })
    );
    mesh.add(edges);
    mesh.visible = false;
    deps.scene.add(mesh);
    placeAtChestDefault();

    // 箱子專屬的平移/旋轉控制環，跟主程式的 transformControls / transformControlsIK 完全分開，
    // 不進 allPickableMeshes()、不共用 selectedIK 狀態機，達成「跟主程式解耦」。
    gizmo = new TransformControls(deps.camera, deps.renderer.domElement);
    gizmo.setMode(mode);
    gizmo.setSpace("world");
    gizmo.setSize(0.6);
    gizmo.addEventListener("dragging-changed", (e) => {
      if (deps.orbitControls) deps.orbitControls.enabled = !e.value;
    });
    deps.scene.add(gizmo);
  }

  function setVisible(on){
    buildAfterModelLoad();
    visible = on;
    if (mesh) mesh.visible = on;
    if (gizmo){
      if (on) gizmo.attach(mesh); else gizmo.detach();
    }
    // 隱藏扶握箱 → 核心內部自動釋放兩手扶握（避免殘留錯誤綁定）
    if (!on){
      releaseHand("rArm");
      releaseHand("lArm");
    }
    notify();
  }

  function setMode(newMode){
    if (newMode !== "translate" && newMode !== "rotate") return;
    mode = newMode;
    if (gizmo) gizmo.setMode(mode);
    notify();
  }

  function setShapeType(type){
    if (!GRAB_SHAPE_DEFAULTS[type]) return;
    shapeType = type;
    rebuildGeometry();
    reprojectGrabbedHands();
    notify();
  }

  function setShapeParam(shape, key, value){
    if (!shapeParams[shape] || !(key in shapeParams[shape])) return;
    shapeParams[shape][key] = value;
    if (shape === shapeType) rebuildGeometry();
    reprojectGrabbedHands();
    notify();
  }

  function grabHand(limb){
    buildAfterModelLoad();
    preset = null;
    const handBone = deps.getHandBone(limb);
    if (!handBone || !mesh) return;
    mesh.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    handBone.getWorldPosition(worldPos);
    const localPos = mesh.worldToLocal(worldPos.clone());
    grabLocal[limb] = GRAB_SHAPE_CLOSEST_POINT[shapeType](localPos, shapeParams[shapeType]);
    grabbed[limb] = true;
    if(palmAligned)deps.preparePalm?.(limb);
    // 扶握時若該手 IK 尚未開啟，核心自動呼叫 setIKEnabled 開啟
    if (!deps.isIKEnabled(limb)) deps.setIKEnabled(limb, true);
    notify();
  }

  function releaseHand(limb){
    if (!grabbed[limb]) return;
    preset = null;
    grabbed[limb] = false;
    grabLocal[limb] = null;
    notify();
  }

  function setGrabHand(limb, on){
    if (on) grabHand(limb); else releaseHand(limb);
  }

  // 換形狀／改尺寸時呼叫：把正在扶著的手依「本地座標」重新投影到新的表面，
  // 不會殘留舊形狀在新形狀範圍外的本地座標。
  function reprojectGrabbedHands(){
    if (preset && grabbed.rArm && grabbed.lArm) {
      const points = grabPresetPoints(shapeType, shapeParams[shapeType], preset);
      Object.assign(grabLocal, points);
      return;
    }
    for (const limb of ["rArm", "lArm"]){
      if (!grabbed[limb] || !grabLocal[limb]) continue;
      grabLocal[limb] = GRAB_SHAPE_CLOSEST_POINT[shapeType](grabLocal[limb], shapeParams[shapeType]);
    }
  }

  // Only these new commands create history entries. Ordinary pose undo keeps
  // the existing grab ownership unless it crosses a quick/reset command.
  function command(action){
    if (deps.isFingerTutActive?.()) {
      messageKey = "請先退出 FingerTut，再調整扶握箱。";
      notify(); return false;
    }
    deps.getModel?.()?.updateWorldMatrix(true, true);
    if (!grabChestFrame(deps.getBones()) || !deps.getHandBone("rArm") || !deps.getHandBone("lArm")) {
      messageKey = "模型尚未準備完成，請稍後再試。";
      notify(); return false;
    }
    deps.preparePose?.();
    buildAfterModelLoad();
    deps.pushHistory?.();
    messageKey = null;
    action();
    revision++;
    updateEachFrame();
    deps.solvePose?.();
    deps.pushHistory?.();
    notify();
    return true;
  }

  function applyPreset(next){
    if (!['sides', 'bottom'].includes(next)) return false;
    return command(() => {
      deps.prepareHands?.();
      const frame = grabChestFrame(deps.getBones());
      mesh.position.copy(frame.position);
      mesh.quaternion.copy(frame.quaternion);
      setVisible(true);
      for (const limb of ['rArm', 'lArm']) {
        if (!deps.isIKEnabled(limb)) deps.setIKEnabled(limb, true);
        grabbed[limb] = true;
      }
      preset = next;
      Object.assign(grabLocal, grabPresetPoints(shapeType, shapeParams[shapeType], next));
    });
  }

  function setPalmAligned(on){
    if(palmAligned===!!on)return false;
    return command(()=>{
      palmAligned=!!on;
      if(palmAligned)for(const limb of ['rArm','lArm'])if(grabbed[limb])deps.preparePalm?.(limb);
    });
  }

  function setPalmTwist(limb,value){
    if(!["rArm","lArm"].includes(limb)||!Number.isFinite(value))return false;
    const next=Math.max(-180,Math.min(180,value));
    if(palmTwist[limb]===next)return false;
    return command(()=>{palmTwist[limb]=next;});
  }

  function isPalmAligned(limb){return !!(palmAligned&&visible&&grabbed[limb]&&deps.isIKEnabled(limb));}

  // Apply after arm IK, and again after collision correction, so other hand
  // solvers cannot overwrite the final palm plane. Flags remain untouched.
  function applyPalmOrientation(){
    if(!mesh||!visible||!palmAligned)return false;
    mesh.updateMatrixWorld(true);
    const rotation=mesh.getWorldQuaternion(new THREE.Quaternion());
    let applied=false;
    for(const limb of ['rArm','lArm']){
      if(!isPalmAligned(limb)||!grabLocal[limb])continue;
      const normal=grabSurfaceNormal(shapeType,grabLocal[limb],shapeParams[shapeType]);
      const hint=new THREE.Vector3(0,Math.abs(normal.y)>.75?0:1,Math.abs(normal.y)>.75?1:0);
      const quaternion=grabPalmQuaternion(deps.getBones(),limb,normal.applyQuaternion(rotation),hint.applyQuaternion(rotation),palmTwist[limb]);
      if(!quaternion)continue;
      applyBoneWorldQuatLock(deps.getHandBone(limb),quaternion);
      deps.syncHandPose?.(limb);
      applied=true;
    }
    return applied;
  }

  function recenter(){
    return command(() => mesh.position.copy(grabChestFrame(deps.getBones()).position));
  }

  function resetRotation(){
    return command(() => mesh.quaternion.copy(grabChestFrame(deps.getBones()).quaternion));
  }

  function resetDimensions(){
    return command(() => {
      shapeParams[shapeType] = { ...GRAB_SHAPE_DEFAULTS[shapeType] };
      rebuildGeometry();
      reprojectGrabbedHands();
    });
  }

  function snapshot(){
    return clone({ ...getState(), revision,
      position: mesh?.position.toArray(), quaternion: mesh?.quaternion.toArray(),
      grabLocal: Object.fromEntries(Object.entries(grabLocal).map(([key, point]) => [key, point?.toArray() || null])),
      rig: deps.captureRig?.(),
    });
  }

  function restoreSnapshot(state){
    if (!state || state.revision === revision) return;
    buildAfterModelLoad();
    // Disabling IK calls releaseHand; restore bindings after the rig is restored.
    deps.restoreRig?.(state.rig);
    visible = !!state.visible; mode = state.mode; shapeType = state.shapeType;
    for (const type of Object.keys(shapeParams)) shapeParams[type] = { ...state.shapeParams[type] };
    if (state.position) mesh.position.fromArray(state.position);
    if (state.quaternion) mesh.quaternion.fromArray(state.quaternion);
    for (const limb of ['rArm', 'lArm']) {
      grabbed[limb] = !!state.grabbed[limb];
      grabLocal[limb] = state.grabLocal[limb] ? new THREE.Vector3().fromArray(state.grabLocal[limb]) : null;
    }
    preset = state.preset; revision = state.revision; messageKey = null;
    palmAligned=!!state.palmAligned;
    Object.assign(palmTwist,{rArm:0,lArm:0},state.palmTwist);
    rebuildGeometry(); mesh.visible = visible; gizmo.setMode(mode);
    if (visible) gizmo.attach(mesh); else gizmo.detach();
    updateEachFrame();
    notify();
    return true;
  }

  // 每幀呼叫：在 solveIKAll() 之前，把扶著箱子的手的 IK 目標位置更新好，
  // 交給既有的兩節解析解 IK 求解——完全重用原本的手臂 IK 管線。
  function updateEachFrame(){
    if (!mesh || !visible) return;
    mesh.updateMatrixWorld(true);
    for (const limb of ["rArm", "lArm"]){
      if (!grabbed[limb] || !grabLocal[limb]) continue;
      const targetMesh = deps.getIKTargetMesh(limb);
      if (!targetMesh) continue;
      const worldPos = grabLocal[limb].clone().applyMatrix4(mesh.matrixWorld);
      targetMesh.position.copy(worldPos);
    }
  }

  // 供閒置偵測用：箱子專屬控制環正在被拖曳時（改變 mesh 位置/角度），扶握中的手也會跟著動，
  // 這段期間必須視為「場景活躍中」，不能被閒置降頻邏輯跳過。
  function isDragging(){ return !!(gizmo && gizmo.dragging); }

  return {
    setVisible, setMode, setShapeType, setShapeParam,
    setGrabHand, releaseHand,
    setPalmAligned, setPalmTwist, isPalmAligned, applyPalmOrientation,
    getState, onChange, applyPreset, recenter, resetRotation, resetDimensions, snapshot, restoreSnapshot,
    buildAfterModelLoad, updateEachFrame, isDragging,
  };
}

export { createGrabBoxCore };
