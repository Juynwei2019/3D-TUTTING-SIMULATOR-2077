import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { grabPresetPoints, grabChestFrame } from '../src/interaction/grab-presets.js';
import { createGrabBoxCore } from '../src/interaction/grab-core.js';
import { GRAB_SHAPE_DEFAULTS, GRAB_SHAPE_CLOSEST_POINT } from '../src/interaction/grab-shapes.js';
import { createHistory } from '../src/history/history-controller.js';

function fixture(){
  const scene = new THREE.Scene(), model = new THREE.Group(), bones = {};
  scene.add(model);
  for (const [key, xyz] of Object.entries({spine:[0,1,0],spine2:[0,1.3,0],neck:[0,1.5,0],rArm:[-.2,1.4,0],lArm:[.2,1.4,0],rHand:[-.5,1.2,0],lHand:[.5,1.2,0]})) {
    const bone = new THREE.Bone(); bone.position.fromArray(xyz); model.add(bone); bones[key] = bone;
  }
  const targets = {rArm:new THREE.Object3D(),lArm:new THREE.Object3D()}, enabled = {rArm:false,lArm:false};
  let blocked = false, pushes = 0, prepares = 0, handPrepares = 0, history;
  const core = createGrabBoxCore({ scene, camera:new THREE.PerspectiveCamera(),
    renderer:{domElement:{style:{},addEventListener(){},removeEventListener(){}}},
    getModel:()=>model, getBones:()=>bones, getHandBone:limb=>bones[limb==='rArm'?'rHand':'lHand'],
    getIKTargetMesh:limb=>targets[limb], isIKEnabled:limb=>enabled[limb],
    setIKEnabled(limb,on){enabled[limb]=on;if(!on)core.releaseHand(limb);},
    isFingerTutActive:()=>blocked, preparePose(){prepares++;},
    prepareHands(){handPrepares++;},
    pushHistory(){pushes++;history?.push();},
    captureRig:()=>Object.fromEntries(Object.keys(targets).map(limb=>[limb,{enabled:enabled[limb],target:targets[limb].position.toArray()}])),
    restoreRig(state){for(const [limb,s] of Object.entries(state)){enabled[limb]=s.enabled;if(!s.enabled)core.releaseHand(limb);targets[limb].position.fromArray(s.target);}},
  });
  history=createHistory({capture:()=>core.snapshot(),restore:s=>core.restoreSnapshot(s)});
  return {core,model,bones,targets,enabled,history,scene,block:()=>{blocked=true;},get pushes(){return pushes;},get prepares(){return prepares;},get handPrepares(){return handPrepares;},get mesh(){return scene.getObjectByName('grabBoxMesh');}};
}
const near=(a,b)=>assert.ok(a.distanceTo(b)<1e-8,`${a.toArray()} != ${b.toArray()}`);

test('both presets give distinct mirrored points on all three shape surfaces',()=>{
  for(const [type,params] of Object.entries(GRAB_SHAPE_DEFAULTS))for(const preset of ['sides','bottom']){
    const points=grabPresetPoints(type,params,preset);
    assert.ok(points.rArm.x<0&&points.lArm.x>0);
    assert.equal(points.rArm.y,points.lArm.y);
    assert.equal(points.rArm.x,-points.lArm.x);
    for(const point of Object.values(points))near(point,GRAB_SHAPE_CLOSEST_POINT[type](point,params));
    if(preset==='bottom')assert.ok(points.rArm.y<0);
  }
  assert.equal(grabPresetPoints('box',GRAB_SHAPE_DEFAULTS.box,'unknown'),null);
});

test('chest frame follows translated and turned characters and rejects missing/degenerate rigs',()=>{
  const f=fixture();f.model.position.set(3,2,-4);f.model.rotation.y=Math.PI/2;f.model.updateMatrixWorld(true);
  const frame=grabChestFrame(f.bones);
  near(frame.position,new THREE.Vector3(3.22,3.3,-4));
  near(new THREE.Vector3(0,0,1).applyQuaternion(frame.quaternion),new THREE.Vector3(1,0,0));
  assert.equal(grabChestFrame({}),null);
  f.bones.lArm.position.copy(f.bones.rArm.position);f.model.updateMatrixWorld(true);
  assert.equal(grabChestFrame(f.bones),null);
});

test('one click shows the chosen shape, enables both arms and preserves custom dimensions',()=>{
  const f=fixture();f.core.setShapeType('sphere');f.core.setShapeParam('sphere','r',.23);
  assert.equal(f.core.applyPreset('bottom'),true);
  assert.equal(f.core.getState().visible,true);assert.equal(f.core.getState().shapeType,'sphere');
  assert.equal(f.core.getState().shapeParams.sphere.r,.23);
  assert.deepEqual(f.enabled,{rArm:true,lArm:true});assert.equal(f.pushes,2);assert.equal(f.handPrepares,1);
  for(const limb of ['rArm','lArm'])near(f.targets[limb].position,grabPresetPoints('sphere',{r:.23},'bottom')[limb].applyMatrix4(f.mesh.matrixWorld));
  assert.equal(f.core.applyPreset('bad'),false);assert.equal(f.pushes,2);
});

test('hands follow translated/rotated shapes and keep preset placement when resizing or switching shape',()=>{
  const f=fixture();f.core.applyPreset('bottom');f.mesh.position.add(new THREE.Vector3(.1,.2,.3));f.mesh.rotation.y=.6;
  f.core.setShapeType('cylinder');f.core.setShapeParam('cylinder','h',.5);f.core.updateEachFrame();
  for(const limb of ['rArm','lArm'])near(f.targets[limb].position,grabPresetPoints('cylinder',f.core.getState().shapeParams.cylinder,'bottom')[limb].applyMatrix4(f.mesh.matrixWorld));
  f.core.releaseHand('rArm');assert.equal(f.core.getState().preset,null);assert.equal(f.core.getState().grabbed.lArm,true);
});

test('return to chest only changes position; rotation reset matches the torso and keeps position',()=>{
  const f=fixture();f.core.applyPreset('sides');f.mesh.position.set(2,3,4);f.mesh.rotation.set(.2,.4,.1);
  const quaternion=f.mesh.quaternion.clone();f.model.position.x=1;f.model.rotation.y=.5;
  f.core.recenter();near(f.mesh.position,grabChestFrame(f.bones).position);assert.ok(f.mesh.quaternion.equals(quaternion));
  const position=f.mesh.position.clone();f.core.resetRotation();near(f.mesh.position,position);
  assert.ok(f.mesh.quaternion.angleTo(grabChestFrame(f.bones).quaternion)<1e-7);
  assert.deepEqual(f.core.getState().grabbed,{rArm:true,lArm:true});
  assert.equal(f.handPrepares,1,"resets must not disable finger IK");
});

test('dimension reset affects only the active shape and keeps its transform and bindings',()=>{
  const f=fixture();f.core.setShapeParam('sphere','r',.4);f.core.setShapeParam('box','w',.6);f.core.applyPreset('sides');
  const position=f.mesh.position.clone(),quaternion=f.mesh.quaternion.clone();f.core.resetDimensions();
  assert.deepEqual(f.core.getState().shapeParams.box,GRAB_SHAPE_DEFAULTS.box);
  assert.equal(f.core.getState().shapeParams.sphere.r,.4);near(f.mesh.position,position);assert.ok(f.mesh.quaternion.equals(quaternion));
  assert.equal(f.core.getState().preset,'sides');assert.equal(f.core.getState().visible,true);
  f.core.setVisible(false);f.core.recenter();assert.equal(f.core.getState().visible,false);
});

test('undo/redo restores bindings, custom dimensions, transform and preexisting arm IK',()=>{
  const f=fixture();f.core.setVisible(true);f.enabled.rArm=true;f.targets.rArm.position.set(5,6,7);
  f.mesh.position.set(1,2,3);f.mesh.rotation.y=.7;f.core.setShapeParam('box','w',.5);
  const before=f.core.snapshot();f.core.applyPreset('bottom');const placed=f.core.snapshot();
  assert.equal(f.history.undo(),true);assert.deepEqual(f.core.snapshot(),before);
  assert.equal(f.history.redo(),true);assert.deepEqual(f.core.snapshot(),placed);
  f.core.resetDimensions();assert.equal(f.history.undo(),true);assert.deepEqual(f.core.snapshot(),placed);
  assert.equal(f.history.redo(),true);assert.equal(f.core.getState().shapeParams.box.w,.32);
});

test('ordinary pose history does not restore grab ownership when no quick/reset command was crossed',()=>{
  const f=fixture();f.core.setVisible(true);const before=f.core.snapshot();f.core.setGrabHand('rArm',true);
  f.core.restoreSnapshot(before);assert.equal(f.core.getState().grabbed.rArm,true);
});

test('active FingerTut and unavailable rigs refuse commands without history or pose changes',()=>{
  const f=fixture();f.block();
  for(const method of [()=>f.core.applyPreset('sides'),()=>f.core.recenter(),()=>f.core.resetRotation(),()=>f.core.resetDimensions()])assert.equal(method(),false);
  assert.equal(f.pushes,0);assert.equal(f.prepares,0);assert.equal(f.mesh,undefined);
  assert.match(f.core.getState().messageKey,/FingerTut/);
  const g=fixture();delete g.bones.neck;assert.equal(g.core.applyPreset('bottom'),false);assert.equal(g.pushes,0);
});
