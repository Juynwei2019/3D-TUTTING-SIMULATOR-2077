import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cleanGrabFrame,sampleGrabFrame} from '../src/timeline/grab-state.js';
import {GRAB_SHAPE_DEFAULTS,GRAB_SHAPE_CLOSEST_POINT,buildGrabShapeGeometry,resizeGrabShapeGeometry} from '../src/interaction/grab-shapes.js';
const clone=x=>structuredClone(x);
function frame(type='box',factor=1,tween=true){
 const params=clone(GRAB_SHAPE_DEFAULTS);for(const k in params[type])params[type][k]*=factor;
 const point=GRAB_SHAPE_CLOSEST_POINT[type](new THREE.Vector3(1,.03,.02),params[type]).toArray();
 return {version:1,visible:true,shapeType:type,shapeParams:params,sizeTween:tween,position:[0,1,0],quaternion:[0,0,0,1],grabbed:{rArm:true,lArm:true},grabLocal:{rArm:point,lArm:point.map((v,i)=>i===0?-v:v)},palmAligned:true};
}
test('size tween is explicit and missing legacy flag remains a step transition',()=>{
 const a=frame(),b=frame('box',1.5);delete a.sizeTween;
 assert.equal(cleanGrabFrame(a).sizeTween,false);
 assert.deepEqual(sampleGrabFrame(a,b,.5,.5).shapeParams,a.shapeParams);
 assert.deepEqual(sampleGrabFrame({...a,sizeTween:'true'},b,.5,.5).shapeParams,a.shapeParams);
});
test('all three shapes interpolate dimensions and keep normalized contacts on the surface',()=>{
 for(const type of ['box','sphere','cylinder'])for(const factor of [.65,1.5]){
  const a=frame(type),b=frame(type,factor),before=JSON.stringify([a,b]);
  for(const amount of [0,.25,.5,.75]){
   const s=sampleGrabFrame(a,b,amount,amount);
   for(const k in a.shapeParams[type])assert.ok(Math.abs(s.shapeParams[type][k]-a.shapeParams[type][k]*(1+(factor-1)*amount))<1e-12);
   for(const limb of ['rArm','lArm']){
    const p=new THREE.Vector3().fromArray(s.grabLocal[limb]);
    assert.ok(p.distanceTo(GRAB_SHAPE_CLOSEST_POINT[type](p,s.shapeParams[type]))<1e-10);
   }
  }
  assert.equal(JSON.stringify([a,b]),before);
 }
});
test('Back and Elastic overshoot cannot make geometry invalid or release hands early',()=>{
 const a=frame(),b=frame('box',1.5);b.grabbed.rArm=false;
 for(const amount of [-.4,1.3]){
  const s=sampleGrabFrame(a,b,amount,.8);assert.equal(s.grabbed.rArm,true);
  assert.equal(s.shapeParams.box.w,amount<0?a.shapeParams.box.w:b.shapeParams.box.w);
 }
 assert.equal(sampleGrabFrame(a,b,.2,1).grabbed.rArm,false);
});
test('shape changes remain discrete and exact endpoints retain their own contact configuration',()=>{
 const a=frame(),b=frame('sphere',1.5);
 assert.deepEqual(sampleGrabFrame(a,b,.5,.5).shapeParams,a.shapeParams);
 assert.equal(sampleGrabFrame(a,b,1,1).shapeType,'sphere');
 assert.deepEqual(sampleGrabFrame(a,frame('box',1.5),0,1),cleanGrabFrame(frame('box',1.5)));
});
test('in-place geometry resizing reuses buffers and is deterministic across repeated seeks',()=>{
 for(const type of ['box','sphere','cylinder']){
  const base=GRAB_SHAPE_DEFAULTS[type],next=Object.fromEntries(Object.entries(base).map(([k,v])=>[k,v*1.5]));
  const geo=buildGrabShapeGeometry(type,base),edges=new THREE.EdgesGeometry(geo),id=geo.id,buffer=geo.getAttribute('position');
  const original=buffer.array.slice();
  for(let i=0;i<100;i++)for(const params of [next,base])for(const g of [geo,edges])resizeGrabShapeGeometry(g,type,base,params);
  assert.equal(geo.id,id);assert.equal(geo.getAttribute('position'),buffer);assert.deepEqual(buffer.array,original);
  resizeGrabShapeGeometry(geo,type,base,next);
  const expected=buildGrabShapeGeometry(type,next);expected.computeBoundingBox();
  assert.ok(geo.boundingBox.max.distanceTo(expected.boundingBox.max)<1e-7);
  geo.dispose();edges.dispose();expected.dispose();
 }
});
