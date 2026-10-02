import * as THREE from "three";
import { clampNum } from "../math/angles.js";
import { applyWorldDeltaQuat } from "../math/quaternions.js";

// ---- 脊椎多節 CCD IK（方向A：頭主動搆/對準目標，身體固定）----
// 跟兩節 IK（solveTwoBoneIK）不同：骨骼數不固定、沒有餘弦定理封閉解，
// 改用「循環座標下降法」（CCD）反覆逼近——每輪從鏈末端往固定端方向處理，
// 每根骨骼各自轉一點點讓 effector 更貼近 target，多輪之後收斂。
// damping（阻尼係數，每次只轉「應轉角度」的一部分）刻意不是1.0，
// 避免旋轉全部集中在最後一節（脖子），讓彎曲弧度自然分散到整條鏈，
// 而不是脖子單獨折死、其他骨骼卻幾乎不動。
// 這是脊椎IK跟每根手指IK共用的迭代求解器（最多 8 iterations × 骨鏈長度，手指全開時一幀要跑
// 好幾十次內層迴圈），原本每次 iteration 都配置 4 個新物件，改成函式層級共用暫存物件重複寫入。
// targetPos 為外部傳入（目標球 position），一律用 .copy() 讀取，不修改它本身。
const _ccdBonePos = new THREE.Vector3();
const _ccdEndPos = new THREE.Vector3();
const _ccdToEnd = new THREE.Vector3();
const _ccdToTarget = new THREE.Vector3();
const _ccdAxis = new THREE.Vector3();
const _ccdDeltaQuat = new THREE.Quaternion();
function solveCCDChain(boneChain, effectorBone, targetPos, iterations = 8, damping = 0.5){
  for (let iter = 0; iter < iterations; iter++){
    for (let i = boneChain.length - 1; i >= 0; i--){
      const bone = boneChain[i];
      bone.getWorldPosition(_ccdBonePos);
      effectorBone.getWorldPosition(_ccdEndPos);

      const toEnd = _ccdToEnd.copy(_ccdEndPos).sub(_ccdBonePos);
      const toTarget = _ccdToTarget.copy(targetPos).sub(_ccdBonePos);
      if (toEnd.lengthSq() < 1e-8 || toTarget.lengthSq() < 1e-8) continue;
      toEnd.normalize(); toTarget.normalize();

      const axis = _ccdAxis.crossVectors(toEnd, toTarget);
      const dot = clampNum(toEnd.dot(toTarget), -1, 1);
      let angle = Math.acos(dot);
      if (axis.lengthSq() < 1e-8 || angle < 1e-5) continue;
      axis.normalize();
      angle *= damping;

      const deltaQuat = _ccdDeltaQuat.setFromAxisAngle(axis, angle);
      applyWorldDeltaQuat(bone, deltaQuat);
      bone.updateWorldMatrix(true, true);
    }
    effectorBone.getWorldPosition(_ccdEndPos);
    if (_ccdEndPos.distanceTo(targetPos) < 0.005) break; // 已經夠貼近，提早結束省效能
  }
}

export { solveCCDChain };
