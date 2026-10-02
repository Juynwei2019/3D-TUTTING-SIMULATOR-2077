import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ALL_JOINT_KEYS, BONE_SUFFIXES, FINGER_IDS, FINGER_IK_CHAINS, OVERVIEW_GROUPS } from '../src/rig/definitions.js';
import { EASINGS } from '../src/math/easings.js';
import { eulerToQuat, applyBoneWorldQuatLock } from '../src/math/quaternions.js';
import { createJointLimiter } from '../src/pose/joint-limits.js';
import { sampleTrajectoryFromPoints } from '../src/motion/trajectory.js';
import { cleanTGConfig, TG_KEYS, tgGenerateCandidates } from '../src/motion/tutting-generator.js';
import { grooveWaveValue, isValidGrooveWave } from '../src/motion/groove-wave.js';
import { solveTwoBoneIK } from '../src/ik/two-bone.js';
import { solveCCDChain } from '../src/ik/ccd.js';
import { GRAB_SHAPE_CLOSEST_POINT } from '../src/interaction/grab-shapes.js';

test('rig definitions cover 50 joints and ten finger chains without missing keys', () => {
  assert.equal(ALL_JOINT_KEYS.length, 50);
  assert.equal(FINGER_IDS.length, 10);
  assert.deepEqual(new Set(OVERVIEW_GROUPS.flatMap(g => g.keys)), new Set(ALL_JOINT_KEYS));
  for (const chain of Object.values(FINGER_IK_CHAINS)) {
    assert.equal(chain.bones.length, 3);
    for (const key of chain.bones) assert.ok(BONE_SUFFIXES[key]);
  }
});

test('all 32 easings retain endpoints, finite samples and Back/Elastic overshoot', () => {
  assert.equal(Object.keys(EASINGS).length, 32);
  for (const fn of Object.values(EASINGS)) {
    assert.ok(Math.abs(fn(0)) < 1e-12);
    assert.ok(Math.abs(fn(1) - 1) < 1e-12);
    for (let i = 0; i <= 100; i++) assert.ok(Number.isFinite(fn(i / 100)));
  }
  assert.ok(EASINGS.easeOutBack(0.7) > 1);
  assert.ok(EASINGS.easeOutElastic(0.1) > 1);
});

test('quaternion output is independent across calls and supports caller-owned output', () => {
  const angles = [30, -20, 45];
  const first = eulerToQuat(angles);
  const snapshot = first.toArray();
  const out = new THREE.Quaternion();
  assert.equal(eulerToQuat([0, 0, 0], out), out);
  assert.deepEqual(first.toArray(), snapshot);
  assert.deepEqual(angles, [30, -20, 45]);
  assert.ok(first.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 6, -Math.PI / 9, Math.PI / 4))) < 1e-7);
});

const axis = (min, max, enabled = true) => ({ min, max, enabled });
test('joint limiter reads replacement settings, handles reversed bounds and leaves inputs untouched', () => {
  let limits = { rForeArm: { x: axis(20, -20), y: axis(-5, 5, false), z: axis(-10, 10) } };
  const { clampJointAngles } = createJointLimiter(() => limits);
  const input = [80, 40, -90];
  assert.deepEqual(clampJointAngles('rForeArm', input), [20, 40, -10]);
  assert.deepEqual(input, [80, 40, -90]);
  limits = { rForeArm: { x: axis(-100, 100), y: axis(-100, 100), z: axis(-100, 100) } };
  assert.deepEqual(clampJointAngles('rForeArm', input), input);
  assert.deepEqual(clampJointAngles('unknown', input), input);
});

test('ball-joint limits keep combined swing inside the cone and preserve disabled settings', () => {
  const limits = { rArm: { x: axis(-30, 30), y: axis(-20, 20), z: axis(-30, 30) } };
  const { clampJointAngles } = createJointLimiter(() => limits);
  const input = [70, 60, 70];
  const result = clampJointAngles('rArm', input);
  const q = eulerToQuat(result);
  const twist = new THREE.Quaternion(0, q.y, 0, q.w).normalize();
  const swing = q.clone().multiply(twist.clone().invert());
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(swing.w))) <= Math.PI / 6 + 0.003);
  assert.ok(Math.abs(2 * Math.atan2(twist.y, twist.w)) <= Math.PI / 9 + 0.003);
  for (const a of Object.values(limits.rArm)) a.enabled = false;
  assert.deepEqual(clampJointAngles('rArm', input), input);
});

test('trajectory sampling handles empty, repeated, open and closed paths without mutating points', () => {
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0), new THREE.Vector3(2, 2, 0)];
  const before = points.map(p => p.toArray());
  assert.deepEqual(sampleTrajectoryFromPoints('line', [], 0.5).toArray(), [0, 0, 0]);
  assert.deepEqual(sampleTrajectoryFromPoints('line', points, 0.5).toArray(), [2, 0, 0]);
  for (const mode of ['line', 'curve']) {
    assert.ok(sampleTrajectoryFromPoints(mode, points, 1, true).distanceTo(points[0]) < 1e-12);
    assert.ok(sampleTrajectoryFromPoints(mode, points, 1, false).distanceTo(points[2]) < 1e-12);
  }
  assert.deepEqual(sampleTrajectoryFromPoints('line', [points[1], points[1]], 0.7).toArray(), points[1].toArray());
  assert.deepEqual(points.map(p => p.toArray()), before);
});

test('seeded Tutting generation is deterministic, bounded and does not change the base pose', () => {
  const base = Object.fromEntries(TG_KEYS.map(k => [k, [0, 0, 0]]));
  const before = structuredClone(base);
  const config = cleanTGConfig({ seed: 2026 });
  const generate = () => tgGenerateCandidates(base, config, TG_KEYS, (_k, xyz) => xyz);
  const a = generate();
  assert.equal(a.results.length, 6);
  assert.deepEqual(a, generate());
  assert.deepEqual(base, before);
  for (const candidate of a.results) {
    assert.ok(candidate.changed.length <= config.maxJoints);
    for (const key of TG_KEYS) for (let i = 0; i < 3; i++) {
      const value = candidate.angles[key][i];
      assert.ok(Math.abs(value) <= config.maxDelta);
      if (value !== 0) assert.ok(config.axes[key].includes(['x', 'y', 'z'][i]));
    }
  }
  assert.equal(tgGenerateCandidates(base, config, [], (_k, xyz) => xyz).results.length, 0);
});

test('groove wave periods and named easing waves survive extraction', () => {
  for (const wave of ['bounce', 'sine', 'ease:easeOutBack', 'easeBi:easeInOutQuad']) {
    assert.ok(isValidGrooveWave(wave));
    assert.ok(Math.abs(grooveWaveValue(wave, -0.25) - grooveWaveValue(wave, 0.75)) < 1e-12);
  }
  assert.equal(isValidGrooveWave('ease:missing'), false);
  assert.equal(grooveWaveValue('bounce', 0.5), 1);
});

function makeChain() {
  const parent = new THREE.Object3D();
  const root = new THREE.Bone(), mid = new THREE.Bone(), end = new THREE.Bone();
  parent.add(root); root.add(mid); mid.add(end);
  mid.position.y = 1; end.position.y = 1;
  parent.updateWorldMatrix(true, true);
  return { parent, root, mid, end };
}
test('two-bone IK reaches a target and preserves target/pole inputs', () => {
  const { root, mid, end } = makeChain();
  const target = new THREE.Vector3(1, 1, 0), pole = new THREE.Vector3(0, 1, 1);
  solveTwoBoneIK(root, mid, end, target, pole);
  assert.ok(end.getWorldPosition(new THREE.Vector3()).distanceTo(target) < 1e-6);
  assert.deepEqual(target.toArray(), [1, 1, 0]);
  assert.deepEqual(pole.toArray(), [0, 1, 1]);
});
test('CCD reaches a target with explicit damping, and world-orientation lock compensates a rotated parent', () => {
  const { root, mid, end } = makeChain();
  const target = new THREE.Vector3(1, 1, 0);
  solveCCDChain([root, mid], end, target, 50, 0.6);
  assert.ok(end.getWorldPosition(new THREE.Vector3()).distanceTo(target) < 0.01);
  const locked = eulerToQuat([20, -35, 10]);
  applyBoneWorldQuatLock(end, locked);
  assert.ok(end.getWorldQuaternion(new THREE.Quaternion()).angleTo(locked) < 1e-7);
  assert.deepEqual(target.toArray(), [1, 1, 0]);
});
test('grab projection returns box and sphere surface points without changing caller vectors', () => {
  const input = new THREE.Vector3(3, 0.2, 0);
  assert.deepEqual(GRAB_SHAPE_CLOSEST_POINT.box(input, { w: 2, h: 2, d: 2 }).toArray(), [1, 0.2, 0]);
  assert.ok(Math.abs(GRAB_SHAPE_CLOSEST_POINT.sphere(input, { r: 0.5 }).length() - 0.5) < 1e-12);
  assert.deepEqual(input.toArray(), [3, 0.2, 0]);
});
