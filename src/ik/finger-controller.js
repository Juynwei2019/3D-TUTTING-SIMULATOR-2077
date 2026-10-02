import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";
import { solveCCDChain } from "../ik/ccd.js";
import * as THREE from "three";

// Live host getters preserve shared rig and playback coordination.
export function createFingerController(context){
const _fingerChainBonesCache = {};

function solveFingerIKAll(){
  for (const fingerId of FINGER_IDS){
    if (!context.fingerIKEnabled[fingerId]) continue;
    const chain = FINGER_IK_CHAINS[fingerId];
    let boneChain = _fingerChainBonesCache[fingerId];
    if (!boneChain){
      boneChain = chain.bones.map(k => context.bones[k]).filter(Boolean);
      _fingerChainBonesCache[fingerId] = boneChain;
    }
    const effectorBone = context.fingerEffectorBones[fingerId];
    const targetMesh = context.fingerIKTargetMeshes[fingerId];
    if (boneChain.length === 0 || !effectorBone || !targetMesh) continue;
    solveCCDChain(boneChain, effectorBone, targetMesh.position, 6, 0.6);
    for (const key of chain.bones) context.syncTargetFromBone(key);
  }
}

function buildFingerIKMarkers(){
  const geo = new THREE.SphereGeometry(0.016, 12, 12);
  for (const fingerId of FINGER_IDS){
    const mat = new THREE.MeshBasicMaterial({ color:0x00e5ff, transparent:true, opacity:0.95, depthTest:false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 998;
    mesh.visible = false;
    mesh.userData.pickType = "fingerIKTarget";
    mesh.userData.fingerId = fingerId;
    context.scene.add(mesh);
    context.fingerIKTargetMeshes[fingerId] = mesh;
    syncFingerIKMarkerToDefault(fingerId);
  }
}

function syncFingerIKMarkerToDefault(fingerId){
  const effectorBone = context.fingerEffectorBones[fingerId];
  const mesh = context.fingerIKTargetMeshes[fingerId];
  if (!effectorBone || !mesh) return;
  const pos = new THREE.Vector3();
  effectorBone.getWorldPosition(pos);
  mesh.position.copy(pos);
}

function setFingerIKEnabled(fingerId, on){
  if(context.waveRun&&(context.waveHasBody(context.waveRun.config)||context.waveSides(context.waveRun.config).includes(fingerId[0])))context.stopWave();
  context.fingerIKEnabled[fingerId] = on;
  context.rebuildIKDrivenKeys(); // 必須在下面的 early return「之前」，否則指名錯誤時集合會漏更新
  const chain = FINGER_IK_CHAINS[fingerId];
  if (!chain) return;
  if (on) syncFingerIKMarkerToDefault(fingerId);
  if (context.fingerIKTargetMeshes[fingerId]) context.fingerIKTargetMeshes[fingerId].visible = on;
  for (const key of chain.bones){
    if (context.markerMeshes[key]) context.markerIKHidden[key] = on;
  }
  if (!on && context.selectedIK && context.selectedIK.limb === FINGER_IK_PREFIX + fingerId) context.deselectJoint();
  updateFingerIKButtons();
}

function updateFingerIKButtons(){
  for (const fingerId of FINGER_IDS){
    const btn = document.getElementById("fingerIKBtn_" + fingerId);
    if (btn) btn.classList.toggle("active", !!context.fingerIKEnabled[fingerId]);
  }
}

function buildFingerPanel(){
  const cards = { r: document.getElementById("fingerCard_r"), l: document.getElementById("fingerCard_l") };
  for (const hs of HAND_SIDES){
    const card = cards[hs.side];
    if (!card) continue;
    for (const fd of FINGER_DEFS){
      const fingerId = hs.side + fd.id;
      const row = document.createElement("div");
      row.className = "fingerRow";

      const label = document.createElement("span");
      label.className = "fingerRowLabel";
      label.textContent = fd.label;
      row.appendChild(label);

      for (let j = 1; j <= 3; j++){
        const key = hs.side + fd.id + j;
        const btn = document.createElement("button");
        btn.className = "fingerJointBtn";
        btn.textContent = FINGER_JOINT_LABELS[j];
        btn.title = LABEL_LOOKUP[key] || key;
        btn.dataset.jointkey = key;
        btn.onclick = () => context.selectJoint(key);
        row.appendChild(btn);
      }

      const ikBtn = document.createElement("button");
      ikBtn.className = "fingerIKToggleBtn";
      ikBtn.id = "fingerIKBtn_" + fingerId;
      ikBtn.textContent = "IK";
      ikBtn.title = hs.label + fd.label + " IK 開關：開啟後拖曳指尖目標球，整根手指自動彎曲收斂";
      ikBtn.onclick = () => setFingerIKEnabled(fingerId, !context.fingerIKEnabled[fingerId]);
      row.appendChild(ikBtn);

      card.appendChild(row);
    }
  }
  updateFingerIKButtons();
}
return { solveFingerIKAll, buildFingerIKMarkers, syncFingerIKMarkerToDefault, setFingerIKEnabled, updateFingerIKButtons, buildFingerPanel };
}
