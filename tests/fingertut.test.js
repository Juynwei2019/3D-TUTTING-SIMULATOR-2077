import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fingerTutFrame,createFingerTut } from '../src/fingertut/controller.js';
test('FingerTut chest frame follows translated and rotated characters',()=>{
  const model=new THREE.Group(),bones={};
  for(const [key,xyz]of Object.entries({spine:[0,1,0],spine2:[0,1.3,0],neck:[0,1.5,0],rArm:[-.2,1.4,0],lArm:[.2,1.4,0]})){
    const bone=new THREE.Bone();bone.position.fromArray(xyz);model.add(bone);bones[key]=bone;
  }
  model.position.set(3,2,-4);model.rotation.y=Math.PI/2;model.updateMatrixWorld(true);
  const f=fingerTutFrame(bones);
  assert.ok(f.center.distanceTo(new THREE.Vector3(3,3.3,-4))<1e-8);
  assert.ok(f.forward.distanceTo(new THREE.Vector3(1,0,0))<1e-8);
  assert.ok(f.right.distanceTo(new THREE.Vector3(0,0,-1))<1e-8);
  assert.ok(Math.abs(f.forward.dot(f.up))<1e-8);
});
test('FingerTut ignores entry and positioning until the required rig is ready',()=>{
  let edits=0;const controller=createFingerTut({bones:{},pushHistory(){edits++;}});
  assert.equal(controller.enter(),false);assert.equal(controller.adjust({spacing:32}),false);controller.exit();controller.restore();
  assert.equal(controller.active,false);assert.equal(edits,0);
});
test('FingerTut refuses entry and repositioning while a hand is held by the grab controller',()=>{
  const keys=['spine','spine2','neck',...['r','l'].flatMap(s=>['Arm','ForeArm','Hand','Middle1','Index1','Pinky1'].map(k=>s+k))];
  let edits=0,prepared=0;
  const controller=createFingerTut({bones:Object.fromEntries(keys.map(k=>[k,new THREE.Bone()])),isGrabbing:()=>true,pushHistory(){edits++;},prepare(){prepared++;},restoreRig(){},restoreCamera(){}});
  assert.equal(controller.enter(),false);
  controller.restoreSnapshot({active:true,before:null,settings:{height:-2,distance:22,spacing:24},rig:{},camera:{}});
  assert.equal(controller.adjust({spacing:30}),false);
  assert.equal(controller.active,true);assert.equal(edits,0);assert.equal(prepared,0);
});
test('ordinary history restoration leaves camera and grab ownership untouched',()=>{
  let camera='user view',rig='held hand',restores=0;
  const controller=createFingerTut({bones:{},captureRig:()=>rig,captureCamera:()=>camera,restoreRig:value=>{rig=value;restores++;},restoreCamera:value=>{camera=value;restores++;}});
  const snapshot=controller.snapshot();camera='another user view';rig='another held hand';
  controller.restoreSnapshot(snapshot);
  assert.equal(camera,'another user view');assert.equal(rig,'another held hand');assert.equal(restores,0);
  controller.restoreSnapshot({...snapshot,revision:1});
  assert.equal(camera,'user view');assert.equal(rig,'held hand');assert.equal(restores,2);
});
