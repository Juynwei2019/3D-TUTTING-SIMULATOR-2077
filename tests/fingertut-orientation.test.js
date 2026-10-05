import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { palmDirections,cleanPalmOrientation } from '../src/fingertut/orientation.js';
const frame={right:new THREE.Vector3(1,0,0),up:new THREE.Vector3(0,1,0),forward:new THREE.Vector3(0,0,1)};
test('palm presets face down, up, inward and outward on the correct anatomical side',()=>{
  for(const side of ['r','l']){
    assert.ok(palmDirections(frame,side,{preset:'down'}).palm.y<-.99);
    assert.ok(palmDirections(frame,side,{preset:'up'}).palm.y>.99);
    assert.ok(palmDirections(frame,side,{preset:'in'}).palm.x*(side==='r'?1:-1)>.99);
    assert.ok(palmDirections(frame,side,{preset:'out'}).palm.x*(side==='r'?1:-1)<-.99);
  }
  assert.deepEqual(frame.forward.toArray(),[0,0,1]);
});
test('combined wrist controls mirror across the chest plane and remain orthonormal',()=>{
  const r=palmDirections(frame,'r',{preset:'down',flip:43,tilt:28,yaw:32});
  const l=palmDirections(frame,'l',{preset:'down',flip:43,tilt:28,yaw:32});
  for(const key of ['finger','palm'])assert.ok(l[key].distanceTo(new THREE.Vector3(-r[key].x,r[key].y,r[key].z))<1e-8);
  assert.ok(Math.abs(r.finger.dot(r.palm))<1e-8);assert.ok(Math.abs(r.palm.length()-1)<1e-8);
});
test('camera presets handle a camera directly above the palm without singularities',()=>{
  for(const cameraPalm of [[0,1,0],[0,0,1],[1,2,3]]){
    const result=palmDirections(frame,'r',{preset:'camera',cameraPalm});
    assert.ok(result.palm.distanceTo(new THREE.Vector3(...cameraPalm).normalize())<1e-8);
    assert.ok(Math.abs(result.finger.dot(result.palm))<1e-8);
    assert.ok(result.finger.toArray().every(Number.isFinite));
  }
  assert.deepEqual(cleanPalmOrientation({cameraPalm:[0,0,0],flip:Infinity}).cameraPalm,[0,0,1]);
});
