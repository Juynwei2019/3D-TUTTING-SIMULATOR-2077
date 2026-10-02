import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOOKAT_CONFIG, FINGER_IDS, FINGER_IK_CHAINS, IK_CHAINS } from '../src/rig/definitions.js';
import { createJointOwnership } from '../src/ik/joint-ownership.js';
import { createOrientationController } from '../src/ik/orientation-controller.js';
import { createTrajectoryEditor } from '../src/motion/trajectory-editor.js';
import { createHandCollision } from '../src/collision/hand-collision.js';
test('joint ownership rebuilds FK exclusions and separately blocks the palm for finger IK', () => {
  const finger = FINGER_IDS[0];
  const c = { ikDrivenKeys: new Set(), grooveBlockedKeys: new Set(), ikEnabled: { rArm: true }, spineIKEnabled: false, lookAtEnabled: {}, fingerIKEnabled: { [finger]: true } };
  const ownership = createJointOwnership(c); ownership.rebuildIKDrivenKeys();
  assert.equal(ownership.isIKDrivenKey(IK_CHAINS.rArm.root), true);
  assert.equal(ownership.isIKDrivenKey(FINGER_IK_CHAINS[finger].bones[0]), true);
  const palm = `${finger[0]}Hand`; assert.equal(c.grooveBlockedKeys.has(palm), true); assert.equal(c.ikDrivenKeys.has(palm), false);
  c.ikEnabled = {}; c.fingerIKEnabled = {}; ownership.rebuildIKDrivenKeys();
  assert.equal(c.ikDrivenKeys.size, 0); assert.equal(c.grooveBlockedKeys.size, 0);
});
test('LookAt resolves an antiparallel target without mutating target or definition vectors', () => {
  const bone = new THREE.Bone(); const parent = new THREE.Group(); parent.add(bone); parent.updateMatrixWorld(true);
  const forward = LOOKAT_CONFIG.head.localForward.clone(); const position = forward.clone().multiplyScalar(-2);
  const targetBefore = position.clone(); const synced = [];
  const c = { laPathRun: null, lookAtEnabled: { head: true }, headFollowSource: 'free', bones: { [LOOKAT_CONFIG.head.key]: bone }, lookAtTargetMesh: { head: { position } }, syncTargetFromBone: key => synced.push(key) };
  const controller = createOrientationController(c); controller.solveLookAt('head');
  const actual = forward.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(actual.distanceTo(forward.clone().negate()) < 1e-6);
  assert.deepEqual(position, targetBefore); assert.deepEqual(LOOKAT_CONFIG.head.localForward, forward);
  assert.equal(synced.length, 1);
});
test('trajectory editor samples live replacement control points and matches route ownership by ID', () => {
  const c = { trajPointMeshes: { rArm: [{ position: new THREE.Vector3(0,0,0) }, { position: new THREE.Vector3(2,0,0) }] }, TRAJ_MODE: { rArm: 'line' }, TRAJ_CLOSED: { rArm: false } };
  const editor = createTrajectoryEditor(c);
  assert.equal(editor.sampleTrajectory('rArm', .5).x, 1);
  c.trajPointMeshes = { rArm: [{ position: new THREE.Vector3(0,0,0) }, { position: new THREE.Vector3(4,0,0) }] };
  assert.equal(editor.sampleTrajectory('rArm', .5).x, 2);
  const result = editor.collectTrajOverrideKeys({ traj: { rArm: { id: 'same' } } }, { traj: { rArm: { id: 'same' } } });
  assert.deepEqual(result.overrideLimbs, ['rArm']); assert.equal(result.overrideKeys.has(IK_CHAINS.rArm.root), true);
  assert.equal(editor.collectTrajOverrideKeys({ traj: { rArm: { id: 'a' } } }, { traj: { rArm: { id: 'b' } } }).overrideKeys.size, 0);
});
test('collision projection handles zero-length capsules and respects locked or dragged hands', () => {
  const c = { ikEnabled: { rArm: true }, draggingKey: null }; const collision = createHandCollision(c);
  const p = new THREE.Vector3(2,1,0), a = new THREE.Vector3(), b = new THREE.Vector3(1,0,0), out = new THREE.Vector3();
  collision.closestPointOnSegment(p,a,b,out); assert.deepEqual(out,b); assert.equal(p.y,1);
  collision.closestPointOnSegment(p,a,a,out); assert.deepEqual(out,a);
  assert.equal(collision.isLimbHandMovable('rArm'), false);
  c.ikEnabled.rArm=false; c.draggingKey=IK_CHAINS.rArm.end; assert.equal(collision.isLimbHandMovable('rArm'),false);
  c.draggingKey=null; assert.equal(collision.isLimbHandMovable('rArm'),true);
});
