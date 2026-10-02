import * as THREE from "three";
import { D } from "./angles.js";

// 共用暫存 Euler：eulerToQuat 每次呼叫都只是「讀出角度→立刻轉成四元數」，
// Euler 物件本身不需要跨呼叫保留，因此可以安全共用同一個，省掉逐幀大量 new Euler() 的配置。
const _e2qEuler = new THREE.Euler();
// outQuat 可選：熱路徑（每幀執行，如 updateBones／拍點播放）呼叫時傳入自己的暫存 Quaternion 重複寫入，
// 省掉「每個關節、每一幀」都 new 一個 Quaternion 的開銷；不傳時維持原本「回傳新物件」的行為，
// 供低頻呼叫端（如鏡像姿勢、洋蔥皮殘影）沿用，不需要跟著改寫呼叫方式。
function eulerToQuat(xyz, outQuat){
  _e2qEuler.set(D(xyz[0]), D(xyz[1]), D(xyz[2]), "XYZ");
  const q = outQuat || new THREE.Quaternion();
  return q.setFromEuler(_e2qEuler);
}

// ---- 洋蔥皮（Onion Skinning）----
// 用 SkeletonUtils.clone(model) 複製出兩份「獨立骨架」的半透明殘影模型（青色＝上一拍，
// 洋紅＝下一拍），跟主模型完全脫鉤，各自有自己的一套 THREE.Bone，所以可以同時呈現
// 三種不同姿勢（目前選取拍點 + 前一拍殘影 + 後一拍殘影）而不互相干擾。
const _lockParentWorldQuat = new THREE.Quaternion();
function applyBoneWorldQuatLock(bone, lockedQuat){
  if (!bone || !bone.parent || !lockedQuat) return;
  bone.parent.getWorldQuaternion(_lockParentWorldQuat);
  bone.quaternion.copy(_lockParentWorldQuat.clone().invert().multiply(lockedQuat));
  bone.updateWorldMatrix(true, true);
}

// 把 deltaQuat（世界空間的旋轉增量）套用到某骨骼身上，換算回它的本地四元數
// （bone.quaternion 是相對 parent 的本地旋轉，所以要先轉世界空間疊加，再轉回本地）
// 這是所有 IK 求解（兩節IK／CCD／LookAt／肩胛輔助……）共用的最底層函式，每幀呼叫次數最多，
// 改用固定的暫存 Quaternion 重複寫入，取代原本每次呼叫都 new/clone 出 4 個新物件。
// 注意：deltaQuat 是外部傳入的參數，這裡只用 .copy() 讀取它的值，不會改到呼叫端自己的暫存物件，
// 所以呼叫端可以放心把「自己的」暫存 Quaternion 傳進來，不會被這裡污染。
const _awdqParentQ = new THREE.Quaternion();
const _awdqBoneQ = new THREE.Quaternion();
const _awdqNewQ = new THREE.Quaternion();
const _awdqLocalQ = new THREE.Quaternion();
function applyWorldDeltaQuat(bone, deltaQuat){
  bone.parent.getWorldQuaternion(_awdqParentQ);
  bone.getWorldQuaternion(_awdqBoneQ);
  _awdqNewQ.copy(deltaQuat).multiply(_awdqBoneQ);
  _awdqLocalQ.copy(_awdqParentQ).invert().multiply(_awdqNewQ);
  bone.quaternion.copy(_awdqLocalQ);
}


export { eulerToQuat, applyBoneWorldQuatLock, applyWorldDeltaQuat };
