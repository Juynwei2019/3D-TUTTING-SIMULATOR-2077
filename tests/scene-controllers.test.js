import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCameraController } from '../src/scene/camera-controller.js';
import { createAnimationLoop } from '../src/scene/animation-loop.js';

test('camera framing fits both axes and tween completion updates camera and orbit target', () => {
  const host={camera:new THREE.PerspectiveCamera(60,2),controls:{target:new THREE.Vector3()},cameraTween:null};
  const controller=createCameraController(host);
  const wide=controller.computeFitDistance(2,1,1,2),narrow=controller.computeFitDistance(2,1,1,0.5);
  assert.ok(narrow>wide);
  assert.ok(narrow>=2/Math.tan(Math.atan(Math.tan(Math.PI/6)*0.5)));
  host.cameraTween={fromPos:new THREE.Vector3(),toPos:new THREE.Vector3(4,2,0),fromTarget:new THREE.Vector3(),toTarget:new THREE.Vector3(2,0,0),start:100,duration:500};
  controller.updateCameraTween(350);assert.deepEqual(host.camera.position.toArray(),[2,1,0]);
  controller.updateCameraTween(600);assert.deepEqual(host.controls.target.toArray(),[2,0,0]);assert.equal(host.cameraTween,null);
});

test('animation retains solver ordering, one RAF chain, idle render throttling and immediate playback wakeup', () => {
  const original=globalThis.requestAnimationFrame;let scheduled=0;const calls=[];
  globalThis.requestAnimationFrame=()=>{scheduled++;};
  const values={camera:{position:new THREE.Vector3()},controls:{target:new THREE.Vector3(),update(){calls.push('orbit');}},renderer:{render(){calls.push('render');}},HAND_AIM_NAMES:[],lookAtEnabled:{},headFollowSource:'free',draggingKey:null,cameraTween:null,kfPlaying:false,IDLE_CAMERA_CONVERGE_EPS_SQ:1e-10,IDLE_THRESHOLD_FRAMES:30,IDLE_RENDER_INTERVAL_MS:100,updateBones(){calls.push('FK');return false;}};
  const host=new Proxy(values,{get(target,name){return name in target?target[name]:['tgPreview','waveRun','laPathRun','groovePreviewEnabled','transformControls','transformControlsIK','grabBoxCore','footPlantEnabled'].includes(name)?false:(...args)=>{calls.push(name);};}});
  try{
    const loop=createAnimationLoop(host);loop.animate(0);
    assert.equal(scheduled,1);
    const important=calls.filter(x=>['FK','solveIKAll','solveSpineIK','solveFingerIKAll','solveFootPlant','solveHandBodyCollision','solveHandHandCollision','render'].includes(x));
    assert.deepEqual(important,['FK','solveIKAll','solveSpineIK','solveFingerIKAll','solveFootPlant','solveHandBodyCollision','solveHandHandCollision','render']);
    for(let i=1;i<=31;i++)loop.animate(i*16);
    calls.length=0;loop.animate(497);assert.ok(!calls.includes('render'));assert.ok(calls.includes('FK'));
    values.kfPlaying=true;calls.length=0;loop.animate(498);
    assert.ok(calls.includes('updateKeyframePlayback'));assert.ok(calls.includes('render'));assert.ok(!calls.includes('FK'));
    assert.equal(scheduled,34);
  }finally{globalThis.requestAnimationFrame=original;}
});
