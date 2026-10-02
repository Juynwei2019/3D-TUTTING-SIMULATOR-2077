import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTimelineReorder } from '../src/timeline/reorder.js';
import { createTimelineResize } from '../src/timeline/resize.js';
import { createPoseInterpolator } from '../src/timeline/pose-interpolator.js';
import { createLibraryDomainController } from '../src/library/domain-controller.js';

test('group reorder preserves non-contiguous order and rebinds selection after array replacement', () => {
  let saves=0;
  const host={keyframes:['a','b','c','d'],grooveSequence:[],kfMultiSelected:new Set(),renderKeyframeChips(){},updateKfMultiSelectBar(){},scheduleAutoSave(){saves++;}};
  const editor=createTimelineReorder(host);
  assert.equal(editor.moveTimelineGroup('pose',[0,2],2),true);
  assert.deepEqual(host.keyframes,['b','d','a','c']);
  assert.deepEqual([...host.kfMultiSelected],[2,3]);
  assert.equal(editor.moveTimelineGroup('pose',[2,3],2),false);
  host.keyframes=['x','y','z'];
  editor.moveTimelineGroup('pose',[2],0);
  assert.deepEqual(host.keyframes,['z','x','y']);
  assert.equal(saves,2);
});

test('resize snapping reads the current grid and bounds fractional and invalid durations', () => {
  const host={BEAT_GRID_SNAP:0.25};const resize=createTimelineResize(host);
  assert.equal(resize.snapTimelineBeats(1.38),1.5);
  assert.equal(resize.snapTimelineBeats(-1),0.25);
  assert.equal(resize.snapTimelineBeats(Infinity),1);
  host.BEAT_GRID_SNAP=0;
  assert.equal(resize.snapTimelineBeats(1.23456),1.2346);
  assert.equal(resize.snapTimelineBeats(100),64);
});

test('pose interpolation refreshes world transforms before trajectory overrides and preserves input frames', () => {
  const model=new THREE.Group(), bone=new THREE.Bone();model.add(bone);
  const overridden=new Set(['rHand']);let calls=[];
  const host={bones:{hips:bone},restQuat:{hips:new THREE.Quaternion()},model,collectTrajOverrideKeys(){return {overrideLimbs:['rArm'],overrideKeys:overridden};},applyTrajOverridesDuringPlayback(){calls.push(model.matrixWorld.elements[12]);},applyBakedWaveFeet(){calls.push('feet');}};
  const player=createPoseInterpolator(host);
  const a={angles:{hips:[0,0,0]},body:{position:[0,0,0],quaternion:[0,0,0,1]}};
  const b={angles:{hips:[0,90,0]},body:{position:[4,0,0],quaternion:[0,0,0,1]}};
  const before=JSON.stringify([a,b]);
  assert.equal(player.applyKeyframeFramePose(a,b,0.5),overridden);
  assert.deepEqual(calls,[2]);
  assert.ok(Math.abs(bone.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4)))<1e-7);
  a.waveBake={};assert.ok(player.applyKeyframeFramePose(a,b,1).has('hips'));
  assert.deepEqual(calls,[2,4,'feet']);
  delete a.waveBake;assert.equal(JSON.stringify([a,b]),before);
});

test('body library capture copies angles and applying a body pose leaves finger data isolated', () => {
  const target=[12.345,0,0],applied=[];
  const controller=createLibraryDomainController({BODY_LIB_JOINT_KEYS:['hips'],poseController:{getTarget(){return target;}},setTarget(k,v){applied.push([k,v]);},setActiveBtn(){},updateSelectedBar(){}});
  const captured=controller.captureCurrentBodyPose();assert.deepEqual(captured,{hips:[12.3,0,0]});captured.hips[0]=0;assert.equal(target[0],12.345);
  controller.applyBodyPoseData({hips:[1,2,3],rIndex1:[4,5,6]});assert.deepEqual(applied,[['hips',[1,2,3]]]);
});
