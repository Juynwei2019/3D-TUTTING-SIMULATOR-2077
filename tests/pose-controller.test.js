import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPoseController } from '../src/pose/pose-controller.js';
import { eulerToQuat } from '../src/math/quaternions.js';

function setup(clampAngles = (_key, angles) => angles) {
  let bones = {}, restQuats = {};
  const controller = createPoseController({
    jointKeys: ['arm', 'hand'], getBones: () => bones, getRestQuats: () => restQuats, clampAngles,
  });
  function loadRig() {
    bones = { arm: new THREE.Bone(), hand: new THREE.Bone() };
    restQuats = { arm: eulerToQuat([15, 10, -5]), hand: eulerToQuat([0, 5, 0]) };
    for (const key of Object.keys(bones)) bones[key].quaternion.copy(restQuats[key]);
  }
  return { controller, loadRig, get bones() { return bones; }, get restQuats() { return restQuats; } };
}

test('pose controller clamps user targets and owns independent copies of all public inputs and reads', () => {
  const { controller: pose } = setup((_key, angles) => angles.map(v => Math.max(-30, Math.min(30, v))));
  const input = [90, 10, -90];
  pose.setTarget('arm', input);
  input[1] = 99;
  assert.deepEqual(pose.getTarget('arm'), [30, 10, -30]);
  pose.getTarget('arm')[0] = 100;
  pose.getCurrent('arm')[1] = 100;
  const snapshot = pose.snapshotState();
  snapshot.target.arm[2] = 100;
  snapshot.current.arm[2] = 100;
  assert.deepEqual(pose.getTarget('arm'), [30, 10, -30]);
  assert.deepEqual(pose.getCurrent('arm'), [30, 10, -30]);
});

test('partial poses preserve untouched joints and reset keeps the original neutral/preset limit semantics', () => {
  const { controller: pose } = setup((_key, angles) => angles.map(v => Math.max(10, v)));
  pose.setJointState('hand', [20, 30, 40]);
  pose.applyPose({ arm: [0, 15, 25], name: 'partial' });
  assert.deepEqual(pose.getTarget('arm'), [10, 15, 25]);
  assert.deepEqual(pose.getTarget('hand'), [20, 30, 40]);
  pose.reset({ arm: [0, 0, 0] });
  assert.deepEqual(pose.getTarget('arm'), [10, 10, 10]);
  assert.deepEqual(pose.getTarget('hand'), [0, 0, 0]);
  assert.deepEqual(pose.getCurrent('hand'), [0, 0, 0]);
});

test('solver and preview restoration preserve exact, separate target/current values without user clamping', () => {
  const { controller: pose } = setup((_key, angles) => angles.map(() => 0));
  const target = [60.123, 0, 0], current = [15.456, 0, 0];
  pose.setJointState('arm', target, current);
  const saved = pose.snapshotState();
  target[0] = current[0] = 0;
  pose.reset();
  pose.restoreState(saved);
  saved.target.arm[0] = 0;
  assert.deepEqual(pose.getTarget('arm'), [60.123, 0, 0]);
  assert.deepEqual(pose.getCurrent('arm'), [15.456, 0, 0]);
  pose.restoreTarget({ arm: [90, 0, 0] }, { clamp: false });
  assert.deepEqual(pose.getTarget('arm'), [90, 0, 0]);
  assert.deepEqual(pose.getCurrent('arm'), [90, 0, 0]);
  pose.restoreTarget({ arm: [90, 0, 0] });
  assert.deepEqual(pose.getTarget('arm'), [0, 0, 0]);
});

test('rig getters work before and after asynchronous loading and synchronization is relative to rest pose', () => {
  const fixture = setup();
  fixture.controller.syncFromBone('arm');
  fixture.loadRig();
  fixture.bones.arm.quaternion.copy(fixture.restQuats.arm).multiply(eulerToQuat([25.123, -10.456, 0]));
  fixture.controller.syncFromBone('arm');
  assert.deepEqual(fixture.controller.getTarget('arm'), [25.1, -10.5, 0]);
  fixture.controller.syncFromBone('arm', { round: false });
  const precise = fixture.controller.getTarget('arm');
  assert.ok(Math.abs(precise[0] - 25.123) < 1e-10);
  assert.ok(Math.abs(precise[1] + 10.456) < 1e-10);
});

test('drag commit clamps both recorded angles and the visible bone rotation', () => {
  const fixture = setup((_key, angles) => angles.map(v => Math.max(-20, Math.min(20, v))));
  fixture.loadRig();
  fixture.bones.arm.quaternion.copy(fixture.restQuats.arm).multiply(eulerToQuat([60, 0, 0]));
  fixture.controller.syncFromBone('arm', { clamp: true });
  assert.deepEqual(fixture.controller.getTarget('arm'), [20, 0, 0]);
  const expected = fixture.restQuats.arm.clone().multiply(eulerToQuat([20, 0, 0]));
  assert.ok(fixture.bones.arm.quaternion.angleTo(expected) < 1e-7);
});

test('FK update preserves legacy interpolation, convergence detection and IK/drag exclusion', () => {
  const fixture = setup(); fixture.loadRig();
  const pose = fixture.controller;
  pose.setJointState('arm', [100, 0, 0], [0, 0, 0]);
  pose.setJointState('hand', [100, 0, 0], [0, 0, 0]);
  assert.equal(pose.updateBones({ draggingKey: 'hand', drivenKeys: new Set(['arm']) }), false);
  assert.deepEqual(pose.getCurrent('arm'), [0, 0, 0]);
  assert.deepEqual(pose.getCurrent('hand'), [0, 0, 0]);
  assert.equal(pose.updateBones(), true);
  assert.ok(Math.abs(pose.getCurrent('arm')[0] - 28) < 1e-12);
  const expected = fixture.restQuats.arm.clone().multiply(eulerToQuat([28, 0, 0]));
  assert.ok(fixture.bones.arm.quaternion.angleTo(expected) < 1e-7);
  for (let i = 0; i < 100; i++) pose.updateBones();
  assert.equal(pose.updateBones(), false);
});

test('applying targets for mirror operations uses desired angles without overwriting current or missing bones', () => {
  const fixture = setup(); fixture.loadRig();
  const pose = fixture.controller;
  pose.setJointState('arm', [50, 10, 0], [5, 1, 0]);
  delete fixture.bones.hand;
  pose.applyTargetsToBones();
  const expected = fixture.restQuats.arm.clone().multiply(eulerToQuat([50, 10, 0]));
  assert.ok(fixture.bones.arm.quaternion.angleTo(expected) < 1e-7);
  assert.deepEqual(pose.getCurrent('arm'), [5, 1, 0]);
});
