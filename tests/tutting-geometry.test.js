import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTuttingGeometryEvaluator } from '../src/motion/tutting-geometry.js';

function fixture() {
  const model = new THREE.Group(), spine = new THREE.Bone();
  model.add(spine);
  const bones = { spine }, restQuat = { spine: spine.quaternion.clone() }, angles = { spine: [0, 0, 0] };
  for (const side of ['l', 'r']) {
    let parent = spine;
    for (const name of ['Arm', 'ForeArm', 'Hand']) {
      const key = side + name, bone = new THREE.Bone();
      bone.position.set(side === 'l' ? 1 : -1, name === 'Arm' ? 2 : 0, 0);
      parent.add(bone); parent = bone;
      bones[key] = bone; restQuat[key] = bone.quaternion.clone(); angles[key] = [0, 0, 0];
    }
  }
  return { model, bones, restQuat, angles };
}
function near(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-10, `${actual} != ${expected}`));
}

test('model-root segments have explicit endpoints, lengths and anatomical directions', () => {
  const f = fixture(), g = createTuttingGeometryEvaluator(f).evaluate(f.angles);
  assert.equal(g.ok, true); assert.equal(g.space, 'model-root');
  assert.equal(Object.keys(g.segments).length, 4);
  near(g.segments.lUpperArm.start, [1, 2, 0]);
  near(g.segments.lUpperArm.end, [2, 2, 0]);
  near(g.segments.lForeArm.direction, [1, 0, 0]);
  near(g.segments.rForeArm.direction, [-1, 0, 0]);
  assert.equal(g.segments.lForeArm.length, 1);
});

test('FK includes upstream motion and rest rotation without mutating live bones or input', () => {
  const f = fixture();
  f.restQuat.lArm.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const evaluator = createTuttingGeometryEvaluator(f);
  const before = JSON.stringify(f.model.toJSON()), input = JSON.stringify(f.angles);
  near(evaluator.evaluate(f.angles).segments.lUpperArm.direction, [0, 1, 0]);
  assert.equal(JSON.stringify(f.model.toJSON()), before); assert.equal(JSON.stringify(f.angles), input);
  const rotated = structuredClone(f.angles); rotated.spine = [0, 0, 90];
  near(evaluator.evaluate(rotated).segments.lUpperArm.direction, [-1, 0, 0]);
  const a = evaluator.evaluate(f.angles); a.segments.lUpperArm.start[0] = 999;
  near(evaluator.evaluate(f.angles).segments.lUpperArm.start, [1, 2, 0]);
  assert.equal(JSON.stringify(f.model.toJSON()), before);
});

test('root and ancestor translation, rotation and scale do not change character-space output', () => {
  const f = fixture(), original = createTuttingGeometryEvaluator(f).evaluate(f.angles);
  const parent = new THREE.Group(); parent.add(f.model);
  parent.position.set(3, 7, -9); parent.rotation.y = 1.2; parent.scale.setScalar(2);
  f.model.position.set(-4, 2, 8); f.model.rotation.set(.2, .8, -.4); f.model.scale.set(2, 3, 4);
  assert.deepEqual(createTuttingGeometryEvaluator(f).evaluate(f.angles), original);
});

test('missing calibration, incomplete angles, degenerate and non-finite segments fail explicitly', () => {
  const f = fixture();
  assert.throws(() => createTuttingGeometryEvaluator({ ...f, bones: {} }), /missing endpoint/);
  assert.throws(() => createTuttingGeometryEvaluator({ ...f, restQuat: {} }), /invalid joint calibration/);
  const evaluator = createTuttingGeometryEvaluator(f);
  assert.equal(evaluator.evaluate({}).reason, 'invalid-angles');
  const invalid = structuredClone(f.angles); invalid.lArm[0] = NaN;
  assert.equal(evaluator.evaluate(invalid).reason, 'invalid-angles');
  f.bones.lForeArm.position.set(0, 0, 0);
  assert.equal(createTuttingGeometryEvaluator(f).evaluate(f.angles).reason, 'degenerate-segment');
  f.bones.lForeArm.position.x = Infinity;
  assert.equal(createTuttingGeometryEvaluator(f).evaluate(f.angles).reason, 'non-finite-segment');
});
