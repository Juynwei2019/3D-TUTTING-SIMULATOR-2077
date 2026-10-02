import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
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
    const handBone = deps.getHandBone(limb);
    if (!handBone || !mesh) return;
    mesh.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    handBone.getWorldPosition(worldPos);
    const localPos = mesh.worldToLocal(worldPos.clone());
    grabLocal[limb] = GRAB_SHAPE_CLOSEST_POINT[shapeType](localPos, shapeParams[shapeType]);
    grabbed[limb] = true;
    // 扶握時若該手 IK 尚未開啟，核心自動呼叫 setIKEnabled 開啟
    if (!deps.isIKEnabled(limb)) deps.setIKEnabled(limb, true);
    notify();
  }

  function releaseHand(limb){
    if (!grabbed[limb]) return;
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
    for (const limb of ["rArm", "lArm"]){
      if (!grabbed[limb] || !grabLocal[limb]) continue;
      grabLocal[limb] = GRAB_SHAPE_CLOSEST_POINT[shapeType](grabLocal[limb], shapeParams[shapeType]);
    }
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
    getState, onChange,
    buildAfterModelLoad, updateEachFrame, isDragging,
  };
}

export { createGrabBoxCore };
