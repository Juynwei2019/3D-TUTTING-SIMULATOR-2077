import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanGrabFrame, sampleGrabFrame } from '../src/timeline/grab-state.js';
import { GRAB_SHAPE_DEFAULTS } from '../src/interaction/grab-shapes.js';
import { createPoseEditor } from '../src/timeline/pose-editor.js';
import { duplicateKeyframeData } from '../src/timeline/data.js';

const frame=(extra={})=>({version:1,visible:true,shapeType:'box',shapeParams:GRAB_SHAPE_DEFAULTS,position:[0,1,0],quaternion:[0,0,0,1],grabbed:{rArm:true,lArm:false},grabLocal:{rArm:[.2,0,0]},palmAligned:true,palmTwist:{rArm:0,lArm:0},poles:{rArm:[1,1,0]},...extra});
test('grab animation strips workspace data and rejects malformed geometry',()=>{
  const s=cleanGrabFrame(frame({rig:{model:'do not restore'},revision:99,target:{hips:[9,9,9]}}));
  assert.ok(s);for(const k of ['rig','revision','target','mode'])assert.equal(k in s,false);
  assert.equal(cleanGrabFrame(frame({position:[NaN,1,0]})),null);
  assert.equal(cleanGrabFrame(frame({shapeType:'unknown'})),null);
  assert.equal(cleanGrabFrame(frame({grabLocal:{rArm:[Infinity,0,0]}})).grabbed.rArm,false);
});
test('grab movement and rotation interpolate without mutating recorded states',()=>{
  const a=frame(),b=frame({position:[2,3,0],quaternion:[0,0,1,0],palmTwist:{rArm:90,lArm:0},poles:{rArm:[3,1,0]}});
  const before=JSON.stringify([a,b]);const s=sampleGrabFrame(a,b,.5,.5);
  assert.deepEqual(s.position,[1,2,0]);assert.ok(Math.abs(s.quaternion[2]-Math.SQRT1_2)<1e-8);
  assert.equal(s.palmTwist.rArm,45);assert.deepEqual(s.poles.rArm,[2,1,0]);
  assert.equal(JSON.stringify([a,b]),before);
});
test('release, shape and dimensions switch at clock boundaries despite easing overshoot',()=>{
  const a=frame(),b=frame({shapeType:'sphere',grabbed:{rArm:false,lArm:false},visible:false});
  assert.equal(sampleGrabFrame(a,b,1.1,.8).grabbed.rArm,true);
  assert.equal(sampleGrabFrame(a,b,.9,1).visible,false);
  assert.equal(sampleGrabFrame(a,b,.5,.5).shapeType,'box');
  assert.equal(sampleGrabFrame(a,b,1,1).shapeType,'sphere');
  assert.equal(sampleGrabFrame(undefined,b,.5,.5),null);
  assert.equal(sampleGrabFrame(a,undefined,1,1),null);
});
test('add/update capture independent grab data and duplicate preserves it',()=>{
  let state=frame();const c={keyframes:[],kfEditingIndex:-1,snapshotCurrentAngles:()=>({hips:[0,0,0]}),snapshotBodyTransform:()=>({position:[0,0,0]}),captureGrabFrame:()=>cleanGrabFrame(state),kfPendingEasing:'linear',kfPendingBeats:1,renderKeyframeChips(){},scheduleAutoSave(){}};
  const editor=createPoseEditor(c);editor.addKeyframe();
  state=frame({position:[1,2,3]});assert.deepEqual(c.keyframes[0].grabBox.position,[0,1,0]);
  editor.updateKeyframe();assert.deepEqual(c.keyframes[0].grabBox.position,[1,2,3]);
  duplicateKeyframeData(c.keyframes,0);c.keyframes[1].grabBox.position[0]=99;
  assert.equal(c.keyframes[0].grabBox.position[0],1);
});
