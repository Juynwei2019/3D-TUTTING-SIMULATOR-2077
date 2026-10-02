import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";
import * as THREE from "three";
import { solveTwoBoneIK } from "../ik/two-bone.js";
import { eulerToQuat, applyBoneWorldQuatLock, applyWorldDeltaQuat } from "../math/quaternions.js";

// Live host getters preserve shared rig and playback coordination.
export function createFootPlant(context){
function isFootPlanted(limb) {
  return context.footPlantEnabled && !!context.ikEnabled[limb] && !!context.footPlantAnchors[limb];
}

function calibrateFootGround() {
  context.model.updateWorldMatrix(true, true);
  // Use skinned foot/toe vertices in the loaded neutral pose, not ankle Y=0.
  for (const limb of context.FOOT_PLANT_LIMBS) {
    const foot = context.bones[IK_CHAINS[limb].end];
    if (!foot) continue;
    const descendants = new Set(); foot.traverse(b => descendants.add(b));
    let minY = Infinity;
    const v = new THREE.Vector3();
    context.model.traverse(mesh => {
      if (!mesh.isSkinnedMesh || !mesh.geometry.attributes.skinWeight) return;
      mesh.skeleton.update();
      const weights = mesh.geometry.attributes.skinWeight, indices = mesh.geometry.attributes.skinIndex;
      const ids = new Set(mesh.skeleton.bones.map((b,i) => descendants.has(b) ? i : -1));
      ids.delete(-1);
      const components = ['getX','getY','getZ','getW'];
      for (let i=0; i<weights.count; i++) {
        let weight = 0;
        for (const c of components) if (ids.has(indices[c](i))) weight += weights[c](i);
        if (weight < 0.5) continue;
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        minY = Math.min(minY, v.y);
      }
    });
    const pos = foot.getWorldPosition(new THREE.Vector3());
    context.footPlantCalibration[limb] = {
      height: Number.isFinite(minY) ? Math.max(0, pos.y-minY) : Math.max(0, pos.y),
      quaternion: foot.getWorldQuaternion(new THREE.Quaternion())
    };
  }
}

function captureFootPlant(limb) {
  const foot = context.bones[IK_CHAINS[limb].end], c = context.footPlantCalibration[limb];
  if (!foot || !c) return;
  const p = foot.getWorldPosition(new THREE.Vector3()); p.y = c.height;
  // Preserve heading, use the neutral foot's pitch/roll so the sole is level.
  const now = foot.getWorldQuaternion(new THREE.Quaternion());
  const delta = now.clone().multiply(c.quaternion.clone().invert());
  const yaw = new THREE.Euler().setFromQuaternion(delta, 'YXZ').y;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yaw).multiply(c.quaternion);
  context.footPlantAnchors[limb] = {position:p, quaternion:q};
  context.ikTargetMeshes[limb].position.copy(p);
  context.footLockedWorldQuat[limb] = q.clone();
}

function setFootPlantEnabled(on) {
  if(context.waveRun&&context.waveHasBody(context.waveRun.config))context.stopWave();
  if (context.kfPlaying) { updateFootPlantUI(); return; }
  if (!on) for (const limb of context.FOOT_PLANT_LIMBS) {
    if (!isFootPlanted(limb)) continue;
    const foot = context.bones[IK_CHAINS[limb].end];
    if (foot) {
      foot.getWorldQuaternion(context.ikTargetMeshes[limb].quaternion);
      context.captureFootLock(limb);
    }
  }
  context.footPlantEnabled = !!on && (context.ikEnabled.rLeg || context.ikEnabled.lLeg);
  context.footPlantAnchors = {}; context.footPlantSafe = null; context.footPlantLimited = false; context.footPlantNotice = "";
  if (context.footPlantEnabled) {
    context.deselectJoint();
    for (const limb of context.FOOT_PLANT_LIMBS) if (context.ikEnabled[limb]) captureFootPlant(limb);
  }
  updateFootPlantUI();
}

function updateFootPlantUI() {
  const cb = document.getElementById('footPlantCb');
  if (!cb) return;
  cb.checked = context.footPlantEnabled;
  cb.disabled = !context.model || context.kfPlaying || (!context.ikEnabled.rLeg && !context.ikEnabled.lLeg);
  const active = context.FOOT_PLANT_LIMBS.filter(isFootPlanted);
  const label = document.getElementById('footPlantStatus');
  const message = context.kfPlaying ? '播放中：腳底固定暫停' : active.length
    ? (context.footPlantLimited ? '已達腿部伸展範圍 · ' : '已固定 · ') + active.map(l => IK_CHAINS[l].label).join('、')
    : (context.footPlantNotice || (context.ikEnabled.rLeg || context.ikEnabled.lLeg ? '開啟後將腳底對齊地面並固定' : '請先啟用左腳或右腳 IK'));
  if (label.textContent !== message) label.textContent = message;
  for (const limb of context.FOOT_PLANT_LIMBS) {
    const b = document.getElementById('orientBtn_'+limb);
    if (b) b.disabled = isFootPlanted(limb);
  }
}

function solveFootPlant() {
  if (!context.model || context.kfPlaying || !context.footPlantEnabled) return;
  const limbs = context.FOOT_PLANT_LIMBS.filter(isFootPlanted);
  if (!limbs.length) return;
  context.model.updateWorldMatrix(true,true);
  const startPosition = context.model.position.clone();
  const constraints = limbs.map(limb => {
    const c = IK_CHAINS[limb], a = context.bones[c.root].getWorldPosition(new THREE.Vector3());
    const b = context.bones[c.mid].getWorldPosition(new THREE.Vector3());
    const e = context.bones[c.end].getWorldPosition(new THREE.Vector3());
    const u = a.distanceTo(b), v = b.distanceTo(e);
    return {limb, offset:a.sub(context.model.position), min:Math.abs(u-v)+0.0002, max:u+v-0.0002};
  });
  // Alternating projections constrain the body translation to both legs' reachable shells.
  const candidate = context.model.position.clone();
  for (let pass=0; pass<100; pass++) {
    let error = 0;
    for (const c of constraints) {
      const anchor = context.footPlantAnchors[c.limb].position;
      const d = candidate.clone().add(c.offset).sub(anchor), length = d.length();
      const wanted = Math.max(c.min, Math.min(c.max,length));
      error = Math.max(error, Math.abs(wanted-length));
      if (Math.abs(wanted-length)<1e-7) continue;
      if (length<1e-9) d.set(0,1,0); else d.divideScalar(length);
      candidate.copy(anchor).addScaledVector(d,wanted).sub(c.offset);
    }
    if (error<1e-7) break;
  }
  const feasible = constraints.every(c => {
    const d = candidate.clone().add(c.offset).distanceTo(context.footPlantAnchors[c.limb].position);
    return d <= c.max+1e-6 && d >= c.min-1e-6;
  });
  context.footPlantLimited = candidate.distanceTo(startPosition)>0.00001 || !feasible;
  if (feasible) context.model.position.copy(candidate);
  else if (context.footPlantSafe) {
    context.model.position.fromArray(context.footPlantSafe.position);
    context.model.quaternion.fromArray(context.footPlantSafe.quaternion);
    for (const [key,q] of Object.entries(context.footPlantSafe.bones)) if (context.bones[key]) {
      context.bones[key].quaternion.fromArray(q); context.syncTargetFromBone(key);
    }
  } else {
    // Impossible initial contact configuration: fail explicitly rather than claim a lock.
    setFootPlantEnabled(false);
    context.footPlantNotice = '無法同時貼地，請先調整腿部姿勢再開啟';
    updateFootPlantUI();
    return;
  }
  context.model.updateWorldMatrix(true,true);
  for (const limb of limbs) {
    const c = IK_CHAINS[limb], a = context.footPlantAnchors[limb];
    context.ikTargetMeshes[limb].position.copy(a.position);
    solveTwoBoneIK(context.bones[c.root],context.bones[c.mid],context.bones[c.end],a.position,context.ikPoleMeshes[limb].position);
    applyBoneWorldQuatLock(context.bones[c.end],a.quaternion);
    context.footLockedWorldQuat[limb] = a.quaternion.clone();
    for (const key of [c.root,c.mid,c.end]) context.syncTargetFromBone(key);
  }
  context.footPlantSafe = {position:context.model.position.toArray(), quaternion:context.model.quaternion.toArray(), bones:{}};
  for (const key of ALL_JOINT_KEYS) if (context.bones[key]) context.footPlantSafe.bones[key] = context.bones[key].quaternion.toArray();
  // Keep the next gizmo delta relative to its corrected position (no accumulated overshoot).
  const correction = context.model.position.clone().sub(startPosition);
  if (context.selectedIK?.limb === 'body' && context.bodyGizmoProxy && context.bodyProxyLastPos) {
    context.bodyGizmoProxy.position.add(correction); context.bodyProxyLastPos.copy(context.bodyGizmoProxy.position);
  }
  context.updateIKPoleLines();
}

function snapshotFootPlant() {
  if (!context.model) return null;
  const state = {enabled:context.footPlantEnabled, body:context.snapshotBodyTransform(), legs:{}, angles:{}};
  if (context.footPlantEnabled) for (const key of ALL_JOINT_KEYS) if (context.bones[key]) state.angles[key]=context.bones[key].quaternion.toArray();
  for (const limb of context.FOOT_PLANT_LIMBS) {
    const a=context.footPlantAnchors[limb];
    state.legs[limb]={enabled:context.ikEnabled[limb], target:context.ikTargetMeshes[limb]?.position.toArray(),
      pole:context.ikPoleMeshes[limb]?.position.toArray(), orientation:context.ikTargetMeshes[limb]?.quaternion.toArray(),
      orientEnabled:context.effectorOrientEnabled[limb], lock:context.footLockedWorldQuat[limb]?.toArray(),
      anchor:a ? {position:a.position.toArray(), quaternion:a.quaternion.toArray()} : null};
  }
  return state;
}

function restoreFootPlant(state) {
  context.footPlantEnabled=false; context.footPlantAnchors={}; context.footPlantSafe=null; context.footPlantNotice="";
  const vector = (v,n) => Array.isArray(v) && v.length===n && v.every(Number.isFinite);
  const quat = q => vector(q,4) && q.reduce((a,b)=>a+b*b,0)>1e-10;
  if (!state || !context.model) { updateFootPlantUI(); return; }
  if (vector(state.body?.position,3) && quat(state.body?.quaternion)) context.applyBodyTransform(state.body);
  for (const [key,q] of Object.entries(state.angles || {})) if (context.bones[key] && quat(q)) {
    context.bones[key].quaternion.fromArray(q).normalize(); context.syncTargetFromBone(key);
  }
  context.model.updateWorldMatrix(true,true);
  for (const limb of context.FOOT_PLANT_LIMBS) {
    const s=state.legs?.[limb]; if (!s) continue;
    context.setIKEnabled(limb,s.enabled===true);
    if (vector(s.target,3)) context.ikTargetMeshes[limb].position.fromArray(s.target);
    if (vector(s.pole,3)) context.ikPoleMeshes[limb].position.fromArray(s.pole);
    if (quat(s.orientation)) context.ikTargetMeshes[limb].quaternion.fromArray(s.orientation).normalize();
    context.effectorOrientEnabled[limb]=s.orientEnabled===true;
    if (quat(s.lock)) context.footLockedWorldQuat[limb]=new THREE.Quaternion().fromArray(s.lock).normalize();
    if (s.enabled && vector(s.anchor?.position,3) && quat(s.anchor?.quaternion))
      context.footPlantAnchors[limb]={position:new THREE.Vector3().fromArray(s.anchor.position),quaternion:new THREE.Quaternion().fromArray(s.anchor.quaternion).normalize()};
  }
  context.footPlantEnabled=state.enabled===true && Object.keys(context.footPlantAnchors).length>0;
  solveFootPlant(); updateFootPlantUI(); context.updateEffectorOrientButtons();
}
return { isFootPlanted, calibrateFootGround, captureFootPlant, setFootPlantEnabled, updateFootPlantUI, solveFootPlant, snapshotFootPlant, restoreFootPlant };
}
