import * as THREE from "three";
import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";
import { D, R, clampNum } from "../math/angles.js";
import { eulerToQuat, applyBoneWorldQuatLock, applyWorldDeltaQuat } from "../math/quaternions.js";
import { solveTwoBoneIK } from "../ik/two-bone.js";

// Live host getters preserve shared rig and playback coordination.
export function createLimbController(context){
const _rflRootPos = new THREE.Vector3();

const _rflMidPos = new THREE.Vector3();

const _rflEndPos = new THREE.Vector3();

const _rflDir = new THREE.Vector3();

const _rflDesired = new THREE.Vector3();

const _rflDelta = new THREE.Vector3();

const _aeoParentQuat = new THREE.Quaternion();

const _saShoulderPos = new THREE.Vector3();

const _saArmPos = new THREE.Vector3();

const _saRestDir = new THREE.Vector3();

const _saDesiredDir = new THREE.Vector3();

const _saAxis = new THREE.Vector3();

const _saDeltaQuat = new THREE.Quaternion();

const _dhaRShoulderPos = new THREE.Vector3();

const _dhaLShoulderPos = new THREE.Vector3();

const _dhaCurSpan = new THREE.Vector3();

const _dhaTargetSpan = new THREE.Vector3();

const _dhaCurDir = new THREE.Vector3();

const _dhaTargetDir = new THREE.Vector3();

const _dhaAxis = new THREE.Vector3();

const _dhaBodyCenter = new THREE.Vector3();

const _dhaDeltaQuat = new THREE.Quaternion();

const _dhaTargetCenter = new THREE.Vector3();

function solveRootFollowForLimb(limb){
  if (!context.ikRootFollowEnabled[limb]) return;
  const chain = IK_CHAINS[limb];
  const rootBone = context.bones[chain.root], midBone = context.bones[chain.mid], endBone = context.bones[chain.end];
  if (!rootBone || !midBone || !endBone) return;

  const rootPos = _rflRootPos; rootBone.getWorldPosition(rootPos);
  const midPos = _rflMidPos; midBone.getWorldPosition(midPos);
  const endPos = _rflEndPos; endBone.getWorldPosition(endPos);
  const upperLen = rootPos.distanceTo(midPos);
  const lowerLen = midPos.distanceTo(endPos);
  const maxReach = upperLen + lowerLen;
  if (maxReach < 1e-6) return;

  const targetPos = context.ikTargetMeshes[limb].position; // 場景物件的 position，下面一律用 .copy() 讀取，不直接修改它
  const dist = rootPos.distanceTo(targetPos);
  const comfortReach = maxReach * 0.92; // 留一點餘裕，避免手臂完全打直看起來卡住

  if (dist > comfortReach){
    const dirRootToTarget = _rflDir.copy(targetPos).sub(rootPos).normalize();
    // 肩膀應該移動到的世界座標：從 target 往回退 comfortReach 距離
    const desiredRootPos = _rflDesired.copy(targetPos).sub(dirRootToTarget.multiplyScalar(comfortReach));
    const delta = _rflDelta.copy(desiredRootPos).sub(rootPos);
    context.model.position.add(delta.multiplyScalar(context.ROOT_FOLLOW_LERP_T)); // 只前進一部分，跨幀累積平滑過渡
    context.model.updateWorldMatrix(true, true); // 讓後續量測（含腿部 IK）立刻拿到新座標
  }
}

function solveShoulderAssist(limb){
  const chain = IK_CHAINS[limb];
  if (!chain.shoulder) return; // 腿沒有shoulder欄位，直接跳過
  const shoulderBone = context.bones[chain.shoulder];
  const armBone = context.bones[chain.root];
  if (!shoulderBone || !armBone) return;

  const shoulderPos = _saShoulderPos; shoulderBone.getWorldPosition(shoulderPos);
  const armPos = _saArmPos; armBone.getWorldPosition(armPos);
  const targetPos = context.ikTargetMeshes[limb].position; // 場景物件 position，只讀不改

  const restDir = _saRestDir.copy(armPos).sub(shoulderPos);
  const desiredDir = _saDesiredDir.copy(targetPos).sub(shoulderPos);
  if (restDir.lengthSq() < 1e-8 || desiredDir.lengthSq() < 1e-8) return;
  restDir.normalize(); desiredDir.normalize();

  const dot = clampNum(restDir.dot(desiredDir), -1, 1);
  let angle = Math.acos(dot);
  if (angle < 1e-5) return;
  angle = Math.min(angle, SHOULDER_ASSIST_MAX_ANGLE); // 關鍵限幅

  const axis = _saAxis.crossVectors(restDir, desiredDir);
  if (axis.lengthSq() < 1e-8) return;
  axis.normalize();

  applyWorldDeltaQuat(shoulderBone, _saDeltaQuat.setFromAxisAngle(axis, angle));
  shoulderBone.updateWorldMatrix(true, true);
  context.syncTargetFromBone(chain.shoulder);
}

function solveDualHandAnchor(){
  if (!context.dualAnchorEnabled || !context.ikEnabled.rArm || !context.ikEnabled.lArm) return;
  const rArmBone = context.bones[IK_CHAINS.rArm.root], lArmBone = context.bones[IK_CHAINS.lArm.root];
  if (!rArmBone || !lArmBone) return;

  const rShoulderPos = _dhaRShoulderPos; rArmBone.getWorldPosition(rShoulderPos);
  const lShoulderPos = _dhaLShoulderPos; lArmBone.getWorldPosition(lShoulderPos);
  const rTargetPos = context.ikTargetMeshes.rArm.position; // 場景物件 position，只讀不改
  const lTargetPos = context.ikTargetMeshes.lArm.position;

  const curSpan = _dhaCurSpan.copy(lShoulderPos).sub(rShoulderPos);
  const targetSpan = _dhaTargetSpan.copy(lTargetPos).sub(rTargetPos);
  if (curSpan.lengthSq() > 1e-8 && targetSpan.lengthSq() > 1e-8){
    const curDir = _dhaCurDir.copy(curSpan).normalize();
    const targetDir = _dhaTargetDir.copy(targetSpan).normalize();
    const dot = clampNum(curDir.dot(targetDir), -1, 1);
    let angle = Math.acos(dot);
    if (angle > 1e-4){
      const axis = _dhaAxis.crossVectors(curDir, targetDir);
      if (axis.lengthSq() > 1e-8){
        axis.normalize();
        angle *= context.ROOT_FOLLOW_LERP_T; // 只轉一部分，跨幀累積平滑過渡
        const bodyCenter = _dhaBodyCenter.copy(rShoulderPos).add(lShoulderPos).multiplyScalar(0.5);
        const deltaQuat = _dhaDeltaQuat.setFromAxisAngle(axis, angle);
        context.model.position.sub(bodyCenter);
        context.model.position.applyQuaternion(deltaQuat);
        context.model.position.add(bodyCenter);
        context.model.quaternion.premultiply(deltaQuat);
        context.model.updateWorldMatrix(true, true);
      }
    }
  }

  // rShoulderPos/lShoulderPos 到這裡已經是舊值（轉動前），重新取一次最新世界座標（沿用同一組暫存物件）
  rArmBone.getWorldPosition(rShoulderPos);
  lArmBone.getWorldPosition(lShoulderPos);
  const bodyCenter2 = _dhaBodyCenter.copy(rShoulderPos).add(lShoulderPos).multiplyScalar(0.5);
  const targetCenter = _dhaTargetCenter.copy(rTargetPos).add(lTargetPos).multiplyScalar(0.5);
  context.model.position.add(targetCenter.sub(bodyCenter2).multiplyScalar(context.ROOT_FOLLOW_LERP_T)); // 平移也只前進一部分
  context.model.updateWorldMatrix(true, true);
}

function solveIKAll(){
  let any = false;
  const dualActive = context.dualAnchorEnabled && context.ikEnabled.rArm && context.ikEnabled.lArm;
  // 雙手同時固定：優先處理，取代兩隻手臂各自獨立的 root-follow（避免兩套平移邏輯互搶）
  if (dualActive) solveDualHandAnchor();

  for (const limb of IK_LIMB_KEYS){
    if (!context.ikEnabled[limb]) continue;
    const chain = IK_CHAINS[limb];

    // 手臂類肢體：雙手固定模式已經處理過身體對齊，這裡只在「非雙手固定模式」時
    // 才跑單手各自的 root-follow，避免跟 solveDualHandAnchor 打架
    if ((limb === "rArm" || limb === "lArm") && !dualActive) solveRootFollowForLimb(limb);
    // 肩胛骨限幅輔助：在兩節IK求解前，讓Shoulder先偏一點點（僅手臂有shoulder欄位）
    // 受 shoulderAssistEnabled 開關控制，關掉就完全跳過，肩膀保持不動
    if ((limb === "rArm" || limb === "lArm") && context.shoulderAssistEnabled) solveShoulderAssist(limb);

    const rootBone = context.bones[chain.root], midBone = context.bones[chain.mid], endBone = context.bones[chain.end];
    if (!rootBone || !midBone || !endBone) continue;
    solveTwoBoneIK(rootBone, midBone, endBone, context.ikTargetMeshes[limb].position, context.ikPoleMeshes[limb].position);
    context.syncTargetFromBone(chain.root);
    context.syncTargetFromBone(chain.mid);
    // 腿部：root/mid的世界旋轉已經是本幀最新值，這時反推腳掌本地旋轉貼住鎖存值最準確
    if (limb === "rLeg" || limb === "lLeg") applyFootLock(limb);
    // Effector朝向控制：位置IK解完後，再套用目標球旋轉決定手掌/腳掌面向
    // （若開啟了腳踝鎖存，這裡會覆蓋掉鎖存值——兩者互斥概念上都是「控制末端朝向」，
    // 開啟朝向控制的那隻腳，鎖存的貼地朝向會被使用者手動指定的朝向取代）
    applyEffectorOrientation(limb);
    any = true;
  }
  if (any) updateIKPoleLines();
}

function updateIKPoleLines(){
  const v = new THREE.Vector3();
  for (const limb of IK_LIMB_KEYS){
    if (!context.ikEnabled[limb]) continue;
    const chain = IK_CHAINS[limb];
    const midBone = context.bones[chain.mid];
    if (!midBone) continue;
    midBone.getWorldPosition(v);
    const posAttr = context.ikPoleLines[limb].geometry.attributes.position;
    posAttr.setXYZ(0, v.x, v.y, v.z);
    const pp = context.ikPoleMeshes[limb].position;
    posAttr.setXYZ(1, pp.x, pp.y, pp.z);
    posAttr.needsUpdate = true;
  }
}

function captureFootLock(limb){
  const chain = IK_CHAINS[limb];
  const footBone = context.bones[chain.end];
  if (!footBone) return;
  const q = new THREE.Quaternion();
  footBone.getWorldQuaternion(q);
  context.footLockedWorldQuat[limb] = q.clone();
}

function applyFootLock(limb){
  const lockedQuat = context.footLockedWorldQuat[limb];
  if (!lockedQuat || !context.ikEnabled[limb]) return;
  const chain = IK_CHAINS[limb];
  applyBoneWorldQuatLock(context.bones[chain.end], lockedQuat);
}

function applyEffectorOrientation(limb){
  if (!context.effectorOrientEnabled[limb]) return;
  const chain = IK_CHAINS[limb];
  const endBone = context.bones[chain.end];
  const targetMesh = context.ikTargetMeshes[limb];
  if (!endBone || !endBone.parent || !targetMesh) return;
  endBone.parent.getWorldQuaternion(_aeoParentQuat);
  endBone.quaternion.copy(_aeoParentQuat.invert().multiply(targetMesh.quaternion));
  endBone.updateWorldMatrix(true, true);
  context.syncTargetFromBone(chain.end);
}

function setEffectorOrientEnabled(limb, on){
  if (context.isFootPlanted(limb)) return;
  if(on&&(limb==='rArm'||limb==='lArm'))context.setLookAtEnabled(limb==='rArm'?'rHand':'lHand',false);
  context.effectorOrientEnabled[limb] = on;
  if (on){
    const chain = IK_CHAINS[limb];
    const endBone = context.bones[chain.end];
    if (endBone){
      const q = new THREE.Quaternion();
      endBone.getWorldQuaternion(q);
      context.ikTargetMeshes[limb].quaternion.copy(q);
    }
  }
  updateEffectorOrientButtons();
}

function updateEffectorOrientButtons(){
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("orientBtn_" + limb);
    if (btn) btn.classList.toggle("active", context.effectorOrientEnabled[limb]);
  }
}

function setIKEnabled(limb, on){
  if(context.waveRun&&(context.waveHasBody(context.waveRun.config)||context.waveSides(context.waveRun.config).some(side=>limb===side+"Arm")))context.stopWave();
  if (context.kfPlaying) return;
  // 手動關掉某隻手的 IK → 通知扶握箱核心釋放扶握，避免殘留錯誤綁定
  if (!on && context.grabBoxCore && (limb === "rArm" || limb === "lArm")) context.grabBoxCore.releaseHand(limb);
  context.ikEnabled[limb] = on;
  context.rebuildIKDrivenKeys();
  const chain = IK_CHAINS[limb];

  if (on) syncIKMarkersToDefault(limb);

  context.ikTargetMeshes[limb].visible = on;
  context.ikPoleMeshes[limb].visible = on;
  context.ikPoleLines[limb].visible = on;

  if (context.markerMeshes[chain.root]) context.markerIKHidden[chain.root] = on;
  if (context.markerMeshes[chain.mid]) context.markerIKHidden[chain.mid] = on;
  if (chain.shoulder && context.markerMeshes[chain.shoulder]) context.markerIKHidden[chain.shoulder] = on;

  // 腳踝旋轉鎖存：開啟腿部IK當下抓取目前腳掌世界旋轉當基準；關閉時清空，
  // 避免下次重開時殘留舊姿勢的鎖存值造成腳掌瞬間跳動
  if (limb === "rLeg" || limb === "lLeg"){
    if (on) captureFootLock(limb);
    else context.footLockedWorldQuat[limb] = null;
  }

  if (!on && context.selectedIK && context.selectedIK.limb === limb) context.deselectJoint();
  if (context.FOOT_PLANT_LIMBS.includes(limb)) {
    if (on && context.footPlantEnabled) context.captureFootPlant(limb);
    else delete context.footPlantAnchors[limb];
    context.footPlantSafe = null;
    if (!context.ikEnabled.rLeg && !context.ikEnabled.lLeg) context.footPlantEnabled = false;
    context.updateFootPlantUI();
  }
  updateIKButtons();
}

function syncIKMarkersToDefault(limb){
  const chain = IK_CHAINS[limb];
  const endBone = context.bones[chain.end];
  const midBone = context.bones[chain.mid];
  if (!endBone || !midBone) return;

  const rootBone = context.bones[chain.root];
  const rootPos = new THREE.Vector3();
  const midPos = new THREE.Vector3();
  const endPos = new THREE.Vector3();
  if (rootBone) rootBone.getWorldPosition(rootPos);
  midBone.getWorldPosition(midPos);
  endBone.getWorldPosition(endPos);

  // 目標球：對齊目前手掌/腳掌的世界座標
  context.ikTargetMeshes[limb].position.copy(endPos);

  // 極向球：反推「目前 FK 姿勢」實際的彎曲方向（root→mid 相對 root→end 連線的側向分量），
  // 而不是用固定猜測方向 —— 這樣切換 FK→IK 當下的彎曲平面會對齊現有姿勢，不會瞬間跳動。
  // 只有手臂/腿完全打直（沒有側向分量可反推）時才退回用猜測方向。
  let bendDir;
  if (rootBone){
    const toEnd = endPos.clone().sub(rootPos);
    const rootToEndDir = toEnd.lengthSq() > 1e-10 ? toEnd.normalize() : new THREE.Vector3(0, 0, 1);
    const toMid = midPos.clone().sub(rootPos);
    const onAxis = rootToEndDir.clone().multiplyScalar(toMid.dot(rootToEndDir));
    const lateral = toMid.clone().sub(onAxis);
    bendDir = lateral.lengthSq() > 1e-8 ? lateral.normalize() : chain.poleOffset.clone().normalize();
  } else {
    bendDir = chain.poleOffset.clone().normalize();
  }

  const poleDist = Math.min(chain.poleOffset.length(), context.poleRadius(limb)*0.8);
  context.ikPoleMeshes[limb].position.copy(midPos.clone().add(bendDir.multiplyScalar(poleDist)));
}

function buildIKMarkers(){
  const targetGeo = new THREE.SphereGeometry(0.038, 16, 16);
  const poleGeo = new THREE.OctahedronGeometry(0.032, 0);

  for (const limb of IK_LIMB_KEYS){
    const targetMat = new THREE.MeshBasicMaterial({ color:0xff8c1a, transparent:true, opacity:0.95, depthTest:false });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.renderOrder = 998;
    targetMesh.visible = false;
    targetMesh.userData.pickType = "ikTarget";
    targetMesh.userData.limb = limb;
    context.scene.add(targetMesh);
    context.ikTargetMeshes[limb] = targetMesh;

    const poleMat = new THREE.MeshBasicMaterial({ color:0xccff33, transparent:true, opacity:0.95, depthTest:false });
    const poleMesh = new THREE.Mesh(poleGeo, poleMat);
    poleMesh.renderOrder = 998;
    poleMesh.visible = false;
    poleMesh.userData.pickType = "ikPole";
    poleMesh.userData.limb = limb;
    context.scene.add(poleMesh);
    context.ikPoleMeshes[limb] = poleMesh;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const lineMat = new THREE.LineBasicMaterial({ color:0xccff33, transparent:true, opacity:0.5, depthTest:false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 997;
    line.visible = false;
    context.scene.add(line);
    context.ikPoleLines[limb] = line;

    syncIKMarkersToDefault(limb);
  }
}

function selectIKMarker(limb, role, index){
  context.tgCancelPreview();
  context.waveTrackActive=false;
  if(context.waveRun)context.stopWave();
  if(context.laPathRun&&limb==="lookAt_"+context.laPathRun.name)return;
  if(limb==="lookAt_head"&&context.headFollowSource!=="free")return;
  if(limb.startsWith("lookAt_")&&context.handFollowSource[limb.slice(7)]==="other")return;
  if (context.isFootPlanted(limb) && role === "target") return;
  context.selectedKey = null;
  context.transformControls.detach();
  context.selectedIK = (role === "trajPoint") ? { limb, role, index } : { limb, role };
  let mesh;
  if (limb === "spine") mesh = context.spineIKTargetMesh;
  else if (limb.startsWith("lookAt_")) mesh = context.lookAtTargetMesh[limb.slice(7)];
  else if (limb.startsWith(FINGER_IK_PREFIX)) mesh = context.fingerIKTargetMeshes[limb.slice(FINGER_IK_PREFIX.length)];
  else if (role === "trajPoint") mesh = context.trajPointMeshes[limb][index];
  else mesh = role === "target" ? context.ikTargetMeshes[limb] : context.ikPoleMeshes[limb];
  if (!mesh) { context.selectedIK = null; return; }
  context.transformControlsIK.attach(mesh);
  context.highlightMarkers();
  highlightIKMarkers();
  context.updateSelectedBar();
  context.renderTrajPointList();
}

function highlightIKMarkers(){
  for (const limb of IK_LIMB_KEYS){
    const isTargetSel = !!(context.selectedIK && context.selectedIK.limb === limb && context.selectedIK.role === "target");
    const isPoleSel = !!(context.selectedIK && context.selectedIK.limb === limb && context.selectedIK.role === "pole");
    if (context.ikTargetMeshes[limb]) context.ikTargetMeshes[limb].scale.setScalar(isTargetSel ? 1.5 : 1.0);
    if (context.ikPoleMeshes[limb]) context.ikPoleMeshes[limb].scale.setScalar(isPoleSel ? 1.5 : 1.0);
  }
  if (context.spineIKTargetMesh){
    const isSpineSel = !!(context.selectedIK && context.selectedIK.limb === "spine");
    context.spineIKTargetMesh.scale.setScalar(isSpineSel ? 1.5 : 1.0);
  }
  for (const name of Object.keys(LOOKAT_CONFIG)){
    if (!context.lookAtTargetMesh[name]) continue;
    const isSel = !!(context.selectedIK && context.selectedIK.limb === "lookAt_" + name);
    context.lookAtTargetMesh[name].scale.setScalar(isSel ? 1.5 : 1.0);
  }
  for (const limb of IK_LIMB_KEYS){
    context.trajPointMeshes[limb].forEach((m, idx) => {
      const isSel = !!(context.selectedIK && context.selectedIK.limb === limb && context.selectedIK.role === "trajPoint" && context.selectedIK.index === idx);
      m.scale.setScalar(isSel ? 1.6 : 1.0);
    });
  }
  for (const fingerId of FINGER_IDS){
    if (!context.fingerIKTargetMeshes[fingerId]) continue;
    const isSel = !!(context.selectedIK && context.selectedIK.limb === FINGER_IK_PREFIX + fingerId);
    context.fingerIKTargetMeshes[fingerId].scale.setScalar(isSel ? 1.5 : 1.0);
  }
}

function updateIKButtons(){
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("ikBtn_" + limb);
    if (btn) btn.classList.toggle("active", context.ikEnabled[limb]);
  }
}

function bindIKUI(){
  document.getElementById("footPlantCb").onchange = e => {
    context.pushHistory();
    context.setFootPlantEnabled(e.target.checked);
    context.solveFootPlant();
    context.pushHistory(); context.scheduleAutoSave();
  };
  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("ikBtn_" + limb);
    if (btn) btn.onclick = () => { context.pushHistory(); setIKEnabled(limb, !context.ikEnabled[limb]); context.pushHistory(); context.scheduleAutoSave(); };
  }
  updateIKButtons();

  const spineBtn = document.getElementById("spineIKBtn");
  if (spineBtn) spineBtn.onclick = () => context.setSpineIKEnabled(!context.spineIKEnabled);
  context.updateSpineIKButton();

  const spineRootFollowCb = document.getElementById("rootFollow_spine");
  if (spineRootFollowCb) spineRootFollowCb.onchange = (e) => { context.spineRootFollowEnabled = e.target.checked; };

  for (const limb of ["rArm", "lArm"]){
    const cb = document.getElementById("rootFollow_" + limb);
    if (cb) cb.onchange = (e) => { context.ikRootFollowEnabled[limb] = e.target.checked; };
  }

  for (const name of Object.keys(LOOKAT_CONFIG)){
    const btn = document.getElementById("lookAtBtn_" + name);
    if (btn) btn.onclick = () => {if(context.kfPlaying)return;context.pushHistory();context.setLookAtEnabled(name, !context.lookAtEnabled[name]);context.pushHistory();context.scheduleAutoSave();};
  }
  context.updateLookAtButtons();

  const dualAnchorCb = document.getElementById("dualAnchorCb");
  if (dualAnchorCb) dualAnchorCb.onchange = (e) => { context.dualAnchorEnabled = e.target.checked; };
  const shoulderAssistCb = document.getElementById("shoulderAssistCb");
  if (shoulderAssistCb) shoulderAssistCb.onchange = (e) => { context.shoulderAssistEnabled = e.target.checked; };
  const handCollisionCb = document.getElementById("handCollisionCb");
  if (handCollisionCb) handCollisionCb.onchange = (e) => { context.handCollisionEnabled = e.target.checked; };
  const handHandCollisionCb = document.getElementById("handHandCollisionCb");
  if (handHandCollisionCb) handHandCollisionCb.onchange = (e) => { context.handHandCollisionEnabled = e.target.checked; };

  // ---- 手部-身體碰撞：膠囊/球半徑滑桿（4段軀幹 + 4段腿 + 1顆頭 + 1個手掌球），
  // 即時寫回 ALL_BODY_CAPSULES（其實就是 TORSO_CAPSULES/LEG_CAPSULES/HEAD_CAPSULES 的物件參照）/ HAND_COLLISION_RADIUS ----
  function refreshHandCollisionSliderUI(){
    context.ALL_BODY_CAPSULES.forEach((cap, i) => {
      const s = document.getElementById("hcRadiusSlider_" + i);
      const v = document.getElementById("hcRadiusVal_" + i);
      if (s) s.value = String(cap.radius);
      if (v) v.textContent = cap.radius.toFixed(3);
    });
    const hs = document.getElementById("hcHandRadiusSlider");
    const hv = document.getElementById("hcHandRadiusVal");
    if (hs) hs.value = String(context.HAND_COLLISION_RADIUS);
    if (hv) hv.textContent = context.HAND_COLLISION_RADIUS.toFixed(3);
  }
  refreshHandCollisionSliderUI(); // 開頁先把滑桿位置同步成 loadHandCollisionRadii() 還原出來的值

  context.ALL_BODY_CAPSULES.forEach((cap, i) => {
    const slider = document.getElementById("hcRadiusSlider_" + i);
    const val = document.getElementById("hcRadiusVal_" + i);
    if (!slider) return;
    slider.oninput = (e) => {
      cap.radius = parseFloat(e.target.value);
      if (val) val.textContent = cap.radius.toFixed(3);
      context.saveHandCollisionRadii();
    };
  });
  const hcHandRadiusSlider = document.getElementById("hcHandRadiusSlider");
  const hcHandRadiusVal = document.getElementById("hcHandRadiusVal");
  if (hcHandRadiusSlider) hcHandRadiusSlider.oninput = (e) => {
    context.HAND_COLLISION_RADIUS = parseFloat(e.target.value);
    if (hcHandRadiusVal) hcHandRadiusVal.textContent = context.HAND_COLLISION_RADIUS.toFixed(3);
    context.saveHandCollisionRadii();
  };
  const hcRadiusResetBtn = document.getElementById("hcRadiusResetBtn");
  if (hcRadiusResetBtn) hcRadiusResetBtn.onclick = () => {
    context.ALL_BODY_CAPSULES.forEach((cap, i) => { cap.radius = context.ALL_BODY_CAPSULE_RADIUS_DEFAULTS[i]; });
    context.HAND_COLLISION_RADIUS = context.HAND_COLLISION_RADIUS_DEFAULT;
    refreshHandCollisionSliderUI();
    context.saveHandCollisionRadii();
  };

  // ---- 進階/阻尼設定：身體跟隨阻尼、脊椎CCD阻尼 ----
  const rootFollowDampSlider = document.getElementById("rootFollowDampSlider");
  const rootFollowDampVal = document.getElementById("rootFollowDampVal");
  const spineCCDDampSlider = document.getElementById("spineCCDDampSlider");
  const spineCCDDampVal = document.getElementById("spineCCDDampVal");
  if (rootFollowDampSlider) rootFollowDampSlider.oninput = (e) => {
    context.ROOT_FOLLOW_LERP_T = parseFloat(e.target.value);
    if (rootFollowDampVal) rootFollowDampVal.textContent = context.ROOT_FOLLOW_LERP_T.toFixed(2);
  };
  if (spineCCDDampSlider) spineCCDDampSlider.oninput = (e) => {
    context.spineCCDDamping = parseFloat(e.target.value);
    if (spineCCDDampVal) spineCCDDampVal.textContent = context.spineCCDDamping.toFixed(2);
  };
  const resetDampingBtn = document.getElementById("resetDampingBtn");
  if (resetDampingBtn) resetDampingBtn.onclick = () => {
    context.ROOT_FOLLOW_LERP_T = ROOT_FOLLOW_LERP_T_DEFAULT;
    context.spineCCDDamping = SPINE_CCD_DAMPING_DEFAULT;
    if (rootFollowDampSlider) rootFollowDampSlider.value = String(ROOT_FOLLOW_LERP_T_DEFAULT);
    if (spineCCDDampSlider) spineCCDDampSlider.value = String(SPINE_CCD_DAMPING_DEFAULT);
    if (rootFollowDampVal) rootFollowDampVal.textContent = ROOT_FOLLOW_LERP_T_DEFAULT.toFixed(2);
    if (spineCCDDampVal) spineCCDDampVal.textContent = SPINE_CCD_DAMPING_DEFAULT.toFixed(2);
  };

  const selectBodyBtn = document.getElementById("selectBodyBtn");
  if (selectBodyBtn) selectBodyBtn.onclick = context.selectBodyMarker;

  for (const limb of IK_LIMB_KEYS){
    const btn = document.getElementById("orientBtn_" + limb);
    if (btn) btn.onclick = () => {if(context.kfPlaying)return;context.pushHistory();setEffectorOrientEnabled(limb, !context.effectorOrientEnabled[limb]);context.pushHistory();context.scheduleAutoSave();};
  }
  updateEffectorOrientButtons();

  const ikModeBtn = document.getElementById("ikModeBtn");
  if (ikModeBtn) ikModeBtn.onclick = () => {
    const newMode = context.transformControlsIK.getMode() === "translate" ? "rotate" : "translate";
    context.transformControlsIK.setMode(newMode);
    context.updateSelectedBar();
  };
}
return { solveRootFollowForLimb, solveShoulderAssist, solveDualHandAnchor, solveIKAll, updateIKPoleLines, captureFootLock, applyFootLock, applyEffectorOrientation, setEffectorOrientEnabled, updateEffectorOrientButtons, setIKEnabled, syncIKMarkersToDefault, buildIKMarkers, selectIKMarker, highlightIKMarkers, updateIKButtons, bindIKUI };
}
