import * as THREE from "three";
import { clampNum } from "../math/angles.js";
import { applyWorldDeltaQuat } from "../math/quaternions.js";

// 核心兩節 IK：給定 root/mid/end 三根骨骼目前的世界位置，
// 用餘弦定理算出能讓 end 命中 targetPos 的彎曲角度，彎曲方向由 polePos 決定，
// 再把結果換算成 root、mid 兩根骨骼各自的世界旋轉增量。
// ---- solveTwoBoneIK 專用暫存物件 ----
// 四肢 IK 開啟時每幀都會呼叫這個函式（最多4次：雙臂雙腿），原本一次呼叫內部會 new/clone
// 出10幾個 Vector3/Quaternion，改成函式專屬、可重複利用的暫存物件。
// targetPos/polePos 是外部傳入的參數（分別是目標球/極向球的 position，屬於場景物件，不可被改到），
// 下面全部改用 .copy(...) 讀取它們的值到暫存物件，絕不直接對它們呼叫會修改自身的方法。
const _ik2bRootPos = new THREE.Vector3();
const _ik2bMidPos = new THREE.Vector3();
const _ik2bEndPos = new THREE.Vector3();
const _ik2bToTarget = new THREE.Vector3();
const _ik2bClampedTargetPos = new THREE.Vector3();
const _ik2bToPole = new THREE.Vector3();
const _ik2bPoleOnAxis = new THREE.Vector3();
const _ik2bBendDir = new THREE.Vector3();
const _ik2bTmp = new THREE.Vector3();
const _ik2bBendAxis = new THREE.Vector3();
const _ik2bMidDir = new THREE.Vector3();
const _ik2bCurrentUpperDir = new THREE.Vector3();
const _ik2bCurrentLowerDir = new THREE.Vector3();
const _ik2bDesiredLowerDir = new THREE.Vector3();
const _ik2bDeltaRoot = new THREE.Quaternion();
const _ik2bDeltaMid = new THREE.Quaternion();
function solveTwoBoneIK(rootBone, midBone, endBone, targetPos, polePos){
  const rootPos = _ik2bRootPos; rootBone.getWorldPosition(rootPos);
  const midPos = _ik2bMidPos; midBone.getWorldPosition(midPos);
  const endPos = _ik2bEndPos; endBone.getWorldPosition(endPos);

  const upperLen = rootPos.distanceTo(midPos);
  const lowerLen = midPos.distanceTo(endPos);
  if (upperLen < 1e-6 || lowerLen < 1e-6) return;

  const toTarget = _ik2bToTarget.copy(targetPos).sub(rootPos);
  let dist = toTarget.length();
  const maxLen = upperLen + lowerLen - 1e-4;
  const minLen = Math.abs(upperLen - lowerLen) + 1e-4;
  dist = clampNum(dist, minLen, maxLen);
  if (toTarget.lengthSq() < 1e-10) toTarget.set(0, 0, 1);
  const targetDir = toTarget.normalize(); // 就地正規化即可，toTarget 之後不再需要原始長度
  const clampedTargetPos = _ik2bClampedTargetPos.copy(rootPos).add(_ik2bTmp.copy(targetDir).multiplyScalar(dist));

  // 餘弦定理：root 端夾角（root→mid 方向 與 root→target 方向 的夾角）
  let cosRoot = (upperLen*upperLen + dist*dist - lowerLen*lowerLen) / (2*upperLen*dist);
  cosRoot = clampNum(cosRoot, -1, 1);
  const angleRoot = Math.acos(cosRoot);

  // 彎曲平面：由 root→target 與 root→pole 兩條向量決定，pole 在平面上的垂直分量決定彎曲往哪一側
  const toPole = _ik2bToPole.copy(polePos).sub(rootPos);
  const poleOnAxis = _ik2bPoleOnAxis.copy(targetDir).multiplyScalar(toPole.dot(targetDir));
  let bendDir = _ik2bBendDir.copy(toPole).sub(poleOnAxis);
  if (bendDir.lengthSq() < 1e-8){
    // pole 剛好落在 root-target 連線上（退化情況）：退回用目前 mid 的位置當彎曲方向參考
    // 注意：這裡刻意分開兩步驟寫（先算 dot 數值、再重用另一個暫存物件當 midOnAxis），
    // 避免同一個 _ik2bTmp 在同一運算式裡「先被當作接收者、又在自己的參數裡被覆寫」而算錯。
    _ik2bTmp.copy(midPos).sub(rootPos); // tmp = mid - root
    const dotVal = _ik2bTmp.dot(targetDir);
    const midOnAxis = _ik2bPoleOnAxis.copy(targetDir).multiplyScalar(dotVal); // poleOnAxis 到這裡已不再需要，安全重用
    bendDir = _ik2bBendDir.copy(_ik2bTmp).sub(midOnAxis);
  }
  if (bendDir.lengthSq() < 1e-8) bendDir.set(0, 1, 0);
  bendDir.normalize();

  const bendAxis = _ik2bBendAxis.crossVectors(targetDir, bendDir);
  if (bendAxis.lengthSq() < 1e-8) bendAxis.set(1, 0, 0);
  else bendAxis.normalize();

  // 新的 mid 方向：把 root→target 的方向繞 bendAxis 轉 angleRoot 度，轉向 pole 那一側
  const midDir = _ik2bMidDir.copy(targetDir).applyAxisAngle(bendAxis, angleRoot);
  const newEndPos = clampedTargetPos; // 命中點（若目標超出可及範圍，會被夾在最大伸展處）

  // ---- root 骨骼：世界空間旋轉，讓「root→mid」方向對齊新的 midDir ----
  const currentUpperDir = _ik2bCurrentUpperDir.copy(midPos).sub(rootPos).normalize();
  const deltaRoot = _ik2bDeltaRoot.setFromUnitVectors(currentUpperDir, midDir);
  applyWorldDeltaQuat(rootBone, deltaRoot);
  rootBone.updateWorldMatrix(true, true); // 讓 mid/end 骨骼的世界矩陣立刻反映 root 剛剛的旋轉

  // ---- mid 骨骼：root 轉完後重新取得世界座標，再讓「mid→end」方向對齊目標點 ----
  // rootPos/midPos（轉動前的舊值）到這裡已經用不到了，直接重複利用同一組暫存物件裝「轉動後」的新座標
  midBone.getWorldPosition(midPos);
  endBone.getWorldPosition(endPos);
  const currentLowerDir = _ik2bCurrentLowerDir.copy(endPos).sub(midPos).normalize();
  const desiredLowerDir = _ik2bDesiredLowerDir.copy(newEndPos).sub(midPos).normalize();
  const deltaMid = _ik2bDeltaMid.setFromUnitVectors(currentLowerDir, desiredLowerDir);
  applyWorldDeltaQuat(midBone, deltaMid);
  midBone.updateWorldMatrix(true, true);
}


export { solveTwoBoneIK };
