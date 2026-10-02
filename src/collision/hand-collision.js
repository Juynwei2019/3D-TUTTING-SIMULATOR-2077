import * as THREE from "three";
import { D, R, clampNum } from "../math/angles.js";
import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";
import { solveCCDChain } from "../ik/ccd.js";

// Live host getters preserve shared rig and playback coordination.
export function createHandCollision(context){
const _hcAB = new THREE.Vector3();

const _hcAP = new THREE.Vector3();

const _hcClosest = new THREE.Vector3();

const _hcTargetPos = new THREE.Vector3();

const _hhPosR = new THREE.Vector3();

const _hhPosL = new THREE.Vector3();

const _hhPushDir = new THREE.Vector3();

const _hhTargetR = new THREE.Vector3();

const _hhTargetL = new THREE.Vector3();

function closestPointOnSegment(p, a, b, outPoint){
  _hcAB.copy(b).sub(a);
  const lenSq = _hcAB.lengthSq();
  if (lenSq < 1e-10) return outPoint.copy(a); // a、b幾乎重合，線段退化成一點
  _hcAP.copy(p).sub(a);
  const t = clampNum(_hcAP.dot(_hcAB) / lenSq, 0, 1);
  return outPoint.copy(a).addScaledVector(_hcAB, t);
}

function solveHandBodyCollision(){
  if (!context.handCollisionEnabled || context.waveRun || context.isBakedWavePlaying()) return;
  for (const limb of context.HAND_COLLISION_LIMBS){
    if (context.ikEnabled[limb]) continue; // 該手已由IK目標球明確指定位置，不跟它搶
    const chain = IK_CHAINS[limb];
    const rootBone = context.bones[chain.root], midBone = context.bones[chain.mid], handBone = context.bones[chain.end];
    if (!rootBone || !midBone || !handBone) continue;
    if (context.draggingKey === chain.root || context.draggingKey === chain.mid || context.draggingKey === chain.end || context.draggingKey === chain.shoulder) continue;

    handBone.getWorldPosition(context._hcHandPos);

    // 找出穿模最深的那一段障礙物（軀幹膠囊／腿部膠囊／頭部退化膠囊，同一套清單一起比較）
    let deepestPenetration = 0;
    let found = false;
    for (const cap of context.ALL_BODY_CAPSULES){
      const boneA = context.bones[cap.boneA], boneB = context.bones[cap.boneB];
      if (!boneA || !boneB) continue;
      boneA.getWorldPosition(context._hcA);
      boneB.getWorldPosition(context._hcB);
      closestPointOnSegment(context._hcHandPos, context._hcA, context._hcB, _hcClosest);
      const dist = context._hcHandPos.distanceTo(_hcClosest);
      const penetration = (cap.radius + context.HAND_COLLISION_RADIUS) - dist;
      if (penetration > deepestPenetration){
        deepestPenetration = penetration;
        found = true;
        context._hcPushDir.copy(context._hcHandPos).sub(_hcClosest);
        if (context._hcPushDir.lengthSq() < 1e-8) context._hcPushDir.set(1, 0, 0); // 剛好在中心線上，隨便挑個方向避免除零
        context._hcPushDir.normalize();
        _hcTargetPos.copy(_hcClosest).addScaledVector(context._hcPushDir, cap.radius + context.HAND_COLLISION_RADIUS);
      }
    }
    if (!found) continue;

    // 輕量 CCD：只帶上臂＋前臂兩節，damping調低讓效果像「頂住」而不是「瞬間彈開」
    solveCCDChain([rootBone, midBone], handBone, _hcTargetPos, 3, 0.35);
    context.syncTargetFromBone(chain.root);
    context.syncTargetFromBone(chain.mid);
  }
}

function isLimbHandMovable(limb){
  if (context.ikEnabled[limb]) return false;
  const chain = IK_CHAINS[limb];
  return context.draggingKey !== chain.root && context.draggingKey !== chain.mid && context.draggingKey !== chain.end && context.draggingKey !== chain.shoulder;
}

function solveHandHandCollision(){
  if (!context.handHandCollisionEnabled || context.waveRun || context.isBakedWavePlaying()) return;
  const rChain = IK_CHAINS.rArm, lChain = IK_CHAINS.lArm;
  const rHandBone = context.bones[rChain.end], lHandBone = context.bones[lChain.end];
  const rRoot = context.bones[rChain.root], rMid = context.bones[rChain.mid];
  const lRoot = context.bones[lChain.root], lMid = context.bones[lChain.mid];
  if (!rHandBone || !lHandBone || !rRoot || !rMid || !lRoot || !lMid) return;

  const rMovable = isLimbHandMovable("rArm");
  const lMovable = isLimbHandMovable("lArm");
  if (!rMovable && !lMovable) return; // 兩手都鎖定，不介入

  rHandBone.getWorldPosition(_hhPosR);
  lHandBone.getWorldPosition(_hhPosL);
  const minDist = context.HAND_COLLISION_RADIUS * 2;
  const dist = _hhPosR.distanceTo(_hhPosL);
  if (dist >= minDist) return; // 沒有穿模

  _hhPushDir.copy(_hhPosR).sub(_hhPosL);
  if (_hhPushDir.lengthSq() < 1e-8) _hhPushDir.set(1, 0, 0); // 兩手剛好重合，隨便挑個方向避免除零
  _hhPushDir.normalize();
  const penetration = minDist - dist;

  if (rMovable && lMovable){
    // 兩手都可動：各退穿模量的一半，像兩顆球互相推開
    _hhTargetR.copy(_hhPosR).addScaledVector(_hhPushDir, penetration * 0.5);
    _hhTargetL.copy(_hhPosL).addScaledVector(_hhPushDir, -penetration * 0.5);
  } else if (rMovable){
    // 只有右手可動：把右手整個推到「貼齊左手（固定）表面」的位置
    _hhTargetR.copy(_hhPosL).addScaledVector(_hhPushDir, minDist);
  } else {
    // 只有左手可動
    _hhTargetL.copy(_hhPosR).addScaledVector(_hhPushDir, -minDist);
  }

  if (rMovable){
    solveCCDChain([rRoot, rMid], rHandBone, _hhTargetR, 3, 0.35);
    context.syncTargetFromBone(rChain.root);
    context.syncTargetFromBone(rChain.mid);
  }
  if (lMovable){
    solveCCDChain([lRoot, lMid], lHandBone, _hhTargetL, 3, 0.35);
    context.syncTargetFromBone(lChain.root);
    context.syncTargetFromBone(lChain.mid);
  }
}
return { closestPointOnSegment, solveHandBodyCollision, isLimbHandMovable, solveHandHandCollision };
}
