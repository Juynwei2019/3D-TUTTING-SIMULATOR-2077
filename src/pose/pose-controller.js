import * as THREE from 'three';
import { R } from '../math/angles.js';
import { eulerToQuat } from '../math/quaternions.js';

/**
 * Owns FK angle state. UI, playback mode, model transforms and history remain
 * the caller's responsibility. Rig getters are resolved at use time, after
 * asynchronous model loading. Public reads and snapshots return copies.
 */
export function createPoseController({ jointKeys, getBones, getRestQuats, clampAngles }) {
  const keys = jointKeys.slice();
  const target = {}, current = {};
  const deltaQuat = new THREE.Quaternion();
  const deltaEuler = new THREE.Euler();
  const updateQuat = new THREE.Quaternion();
  const emptyDrivenKeys = new Set();

  function getTarget(key) { return target[key]?.slice(); }
  function getCurrent(key) { return current[key]?.slice(); }

  // Solvers and preview restoration must be able to preserve already-computed
  // angles without clamping or cancelling any active application mode.
  function setJointState(key, targetAngles, currentAngles = targetAngles) {
    target[key] = targetAngles.slice();
    current[key] = currentAngles.slice();
  }

  function setTarget(key, angles) {
    setJointState(key, clampAngles(key, angles));
  }

  function applyPose(pose) {
    for (const key of keys) if (pose[key]) setTarget(key, pose[key]);
  }

  function reset(pose = {}) {
    for (const key of keys) setJointState(key, [0, 0, 0]);
    applyPose(pose);
  }

  function snapshotTarget() {
    return Object.fromEntries(keys.map(key => [key, (target[key] || [0, 0, 0]).slice()]));
  }

  function snapshotState() {
    return {
      target: snapshotTarget(),
      current: Object.fromEntries(keys.map(key => [key, (current[key] || [0, 0, 0]).slice()])),
    };
  }

  function restoreTarget(pose, { clamp = true } = {}) {
    for (const key of keys) {
      const angles = pose[key] || [0, 0, 0];
      if (clamp) setTarget(key, angles);
      else setJointState(key, angles);
    }
  }

  function restoreState(state) {
    for (const key of keys) {
      setJointState(key, state.target[key] || [0, 0, 0], state.current[key] || [0, 0, 0]);
    }
  }

  function syncFromBone(key, { clamp = false, round = true } = {}) {
    const bone = getBones()[key], rest = getRestQuats()[key];
    if (!bone || !rest) return;
    deltaQuat.copy(rest).invert().multiply(bone.quaternion);
    deltaEuler.setFromQuaternion(deltaQuat, 'XYZ');
    const degrees = [R(deltaEuler.x), R(deltaEuler.y), R(deltaEuler.z)]
      .map(value => round ? Math.round(value * 10) / 10 : value);
    const angles = clamp ? clampAngles(key, degrees) : degrees;
    if (clamp && angles.some((value, axis) => value !== degrees[axis])) {
      bone.quaternion.copy(rest).multiply(eulerToQuat(angles, updateQuat));
    }
    setJointState(key, angles);
  }

  // Mirror/symmetry operations need the target pose before world-space math.
  function applyTargetsToBones() {
    const bones = getBones(), restQuats = getRestQuats();
    for (const key of keys) {
      if (!bones[key] || !restQuats[key] || !target[key]) continue;
      bones[key].quaternion.copy(restQuats[key]).multiply(eulerToQuat(target[key], updateQuat));
    }
  }

  // Preserve the existing 0.28 per-frame interpolation and 0.01-degree activity
  // threshold. Time-based damping is a separate behavior change.
  function updateBones({ draggingKey = null, drivenKeys = emptyDrivenKeys } = {}) {
    const bones = getBones(), restQuats = getRestQuats();
    let stillMoving = false;
    for (const key of keys) {
      if (key === draggingKey || drivenKeys.has(key)) continue;
      const bone = bones[key], desired = target[key], actual = current[key];
      if (!bone || !desired) continue;
      const dx = desired[0] - actual[0], dy = desired[1] - actual[1], dz = desired[2] - actual[2];
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dz) > 0.01) stillMoving = true;
      actual[0] += dx * 0.28;
      actual[1] += dy * 0.28;
      actual[2] += dz * 0.28;
      bone.quaternion.copy(restQuats[key]).multiply(eulerToQuat(actual, updateQuat));
    }
    return stillMoving;
  }

  return {
    getTarget, getCurrent, setTarget, setJointState, applyPose, reset,
    snapshotTarget, snapshotState, restoreTarget, restoreState,
    syncFromBone, applyTargetsToBones, updateBones,
  };
}
