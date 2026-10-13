import * as THREE from 'three';
import { eulerToQuat } from '../math/quaternions.js';

// Xbot model-root coordinates: +X anatomical left, +Y up, +Z front.
// Root/ancestor transforms (including body position, rotation and scale) are
// excluded. Distances use model-local units; normalized errors can use length.
export const TG_CALIBRATION_VERSION = 'xbot-model-root-v1';
export const TG_SEGMENTS = Object.freeze({
  lUpperArm: Object.freeze(['lArm', 'lForeArm']),
  lForeArm: Object.freeze(['lForeArm', 'lHand']),
  rUpperArm: Object.freeze(['rArm', 'rForeArm']),
  rForeArm: Object.freeze(['rForeArm', 'rHand']),
});

const finiteVector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);

// Copy transforms only: no mesh, material, skeleton or source scene mutation.
// Rest rotations and hierarchy are captured once per evaluator. Recreate after
// replacing/recalibrating the rig. Each evaluation requires all mapped angles.
export function createTuttingGeometryEvaluator({ model, bones, restQuat }) {
  if (!model?.isObject3D) throw new Error('TG geometry: missing model');
  const copies = new Map();
  function copyTree(source, isRoot = false) {
    const node = new THREE.Object3D();
    if (!isRoot) {
      node.position.copy(source.position);
      node.quaternion.copy(source.quaternion);
      node.scale.copy(source.scale);
      node.matrixAutoUpdate = source.matrixAutoUpdate;
      node.matrix.copy(source.matrix);
    }
    copies.set(source, node);
    for (const child of source.children) node.add(copyTree(child));
    return node;
  }
  const root = copyTree(model, true);
  const joints = {};
  for (const [key, bone] of Object.entries(bones || {})) {
    const node = copies.get(bone), rest = restQuat?.[key];
    if (!node || !rest || !finiteVector(rest.toArray(), 4) || rest.lengthSq() < 1e-12)
      throw new Error(`TG geometry: invalid joint calibration ${key}`);
    node.matrixAutoUpdate = true;
    joints[key] = { node, rest: rest.clone().normalize() };
  }
  for (const keys of Object.values(TG_SEGMENTS)) for (const key of keys)
    if (!joints[key]) throw new Error(`TG geometry: missing endpoint ${key}`);

  return {
    calibrationVersion: TG_CALIBRATION_VERSION,
    evaluate(angles) {
      for (const key of Object.keys(joints)) {
        if (!finiteVector(angles?.[key], 3))
          return { ok: false, reason: 'invalid-angles', joint: key };
      }
      for (const [key, { node, rest }] of Object.entries(joints))
        node.quaternion.copy(rest).multiply(eulerToQuat(angles[key]));
      root.updateMatrixWorld(true);
      const segments = {};
      for (const [id, [startKey, endKey]] of Object.entries(TG_SEGMENTS)) {
        const start = joints[startKey].node.getWorldPosition(new THREE.Vector3());
        const end = joints[endKey].node.getWorldPosition(new THREE.Vector3());
        const direction = end.clone().sub(start), length = direction.length();
        if (!finiteVector(start.toArray(), 3) || !finiteVector(end.toArray(), 3) || !Number.isFinite(length))
          return { ok: false, reason: 'non-finite-segment', segment: id };
        if (length <= 1e-8) return { ok: false, reason: 'degenerate-segment', segment: id };
        segments[id] = { startKey, endKey, start: start.toArray(), end: end.toArray(),
          length, direction: direction.divideScalar(length).toArray() };
      }
      return { ok: true, calibrationVersion: TG_CALIBRATION_VERSION, space: 'model-root',
        axes: { left: [1, 0, 0], up: [0, 1, 0], front: [0, 0, 1] }, segments };
    },
  };
}
