import * as THREE from "three";
import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";
import { solveCCDChain } from "../ik/ccd.js";

// Live host getters preserve shared rig and playback coordination.
export function createSpineController(context){
const _srfP1 = new THREE.Vector3();

const _srfP2 = new THREE.Vector3();

const _srfPivotPos = new THREE.Vector3();

const _srfDir = new THREE.Vector3();

const _srfDesired = new THREE.Vector3();

const _srfDelta = new THREE.Vector3();

let _spineChainBonesCache = null;

function solveSpineRootFollow(){
  if (!context.spineRootFollowEnabled || !context.spineIKEnabled) return;
  const pivotBone = context.bones[SPINE_IK_CHAIN.bones[0]]; // spine：CCD鏈第一個真正可旋轉的關節
  if (!pivotBone || !context.spineIKTargetMesh) return;

  // 只加總「可彎曲」的部分：spine→spine1→spine2→neck→head
  const chainKeys = [...SPINE_IK_CHAIN.bones, SPINE_IK_CHAIN.effector];
  let maxReach = 0;
  const p1 = _srfP1, p2 = _srfP2;
  for (let i = 0; i < chainKeys.length - 1; i++){
    const b1 = context.bones[chainKeys[i]], b2 = context.bones[chainKeys[i+1]];
    if (!b1 || !b2) continue;
    b1.getWorldPosition(p1); b2.getWorldPosition(p2);
    maxReach += p1.distanceTo(p2);
  }
  if (maxReach < 1e-6) return;

  const pivotPos = _srfPivotPos; pivotBone.getWorldPosition(pivotPos);
  const targetPos = context.spineIKTargetMesh.position; // 場景物件 position，只讀不改
  const dist = pivotPos.distanceTo(targetPos);
  const comfortReach = maxReach * 0.92; // 留一點餘裕，避免整條脊椎打直看起來卡住

  if (dist > comfortReach){
    const dirToTarget = _srfDir.copy(targetPos).sub(pivotPos).normalize();
    const desiredPivotPos = _srfDesired.copy(targetPos).sub(dirToTarget.multiplyScalar(comfortReach));
    const delta = _srfDelta.copy(desiredPivotPos).sub(pivotPos);
    context.model.position.add(delta.multiplyScalar(context.ROOT_FOLLOW_LERP_T)); // 只前進一部分，跨幀累積平滑過渡
    context.model.updateWorldMatrix(true, true); // 讓後續量測（含腿部 IK、脊椎 CCD）立刻拿到新座標
  }
}

function solveSpineIK(){
  if (!context.spineIKEnabled) return;
  if (!_spineChainBonesCache) _spineChainBonesCache = SPINE_IK_CHAIN.bones.map(key => context.bones[key]).filter(Boolean);
  const chainBones = _spineChainBonesCache;
  const effectorBone = context.bones[SPINE_IK_CHAIN.effector];
  if (chainBones.length === 0 || !effectorBone || !context.spineIKTargetMesh) return;

  solveCCDChain(chainBones, effectorBone, context.spineIKTargetMesh.position, 8, context.spineCCDDamping);

  for (const key of SPINE_IK_CHAIN.bones) context.syncTargetFromBone(key);
}

function buildSpineIKMarker(){
  const targetGeo = new THREE.SphereGeometry(0.038, 16, 16);
  const targetMat = new THREE.MeshBasicMaterial({ color:0x33ccff, transparent:true, opacity:0.95, depthTest:false });
  const mesh = new THREE.Mesh(targetGeo, targetMat);
  mesh.renderOrder = 998;
  mesh.visible = false;
  mesh.userData.pickType = "spineIKTarget";
  context.scene.add(mesh);
  context.spineIKTargetMesh = mesh;
  syncSpineIKMarkerToDefault();
}

function syncSpineIKMarkerToDefault(){
  const effectorBone = context.bones[SPINE_IK_CHAIN.effector];
  if (!effectorBone || !context.spineIKTargetMesh) return;
  const pos = new THREE.Vector3();
  effectorBone.getWorldPosition(pos);
  context.spineIKTargetMesh.position.copy(pos);
}

function setSpineIKEnabled(on){
  if(context.waveRun)context.stopWave();
  context.spineIKEnabled = on;
  // 緊接在賦值後重建，而不是放函式結尾：下面有跟 setLookAtEnabled 互斥的互相呼叫，
  // 內層呼叫也會各自重建一次。因為 rebuildIKDrivenKeys() 是「整份重算」而非增量更新，
  // 不管誰先誰後、重建幾次，最終結果都等於當下四個開關狀態的正解。
  context.rebuildIKDrivenKeys();
  if (on) syncSpineIKMarkerToDefault();
  context.spineIKTargetMesh.visible = on;
  for (const key of SPINE_IK_CHAIN.bones){
    if (context.markerMeshes[key]) context.markerIKHidden[key] = on;
  }
  if (on && context.lookAtEnabled.chest) context.setLookAtEnabled("chest", false);
  if (!on && context.selectedIK && context.selectedIK.limb === "spine") context.deselectJoint();
  updateSpineIKButton();
}

function updateSpineIKButton(){
  const btn = document.getElementById("spineIKBtn");
  if (btn) btn.classList.toggle("active", context.spineIKEnabled);
}
return { solveSpineRootFollow, solveSpineIK, buildSpineIKMarker, syncSpineIKMarkerToDefault, setSpineIKEnabled, updateSpineIKButton };
}
