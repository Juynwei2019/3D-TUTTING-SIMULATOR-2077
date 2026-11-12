import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createModelMaterials} from '../src/scene/model-materials.js';
import {cleanAppearance} from '../src/scene/appearance.js';

test('solid color changes preserve original texture, material arrays, geometry and bone transforms',()=>{
 const texture=new THREE.Texture(),original=new THREE.MeshStandardMaterial({color:0xff0000,map:texture,roughness:.4}),second=new THREE.MeshStandardMaterial({color:0x222222});
 const mesh=new THREE.SkinnedMesh(new THREE.BoxGeometry(),[original,second]),model=new THREE.Group(),bone=new THREE.Bone();model.add(mesh,bone);bone.rotation.x=.7;
 const before=bone.quaternion.toArray(),geometry=mesh.geometry,materials=mesh.material;
 const controller=createModelMaterials();controller.attach(model);
 controller.apply(cleanAppearance({modelStyle:'metal',modelColor:'#33bbff',modelRoughness:.2,modelMetalness:.75}));
 assert.notEqual(mesh.material,materials);assert.equal(mesh.material[0].color.getHexString(),'33bbff');assert.equal(mesh.material[0].map,null);
 assert.equal(mesh.material[0].roughness,.2);assert.equal(mesh.material[0].metalness,.75);
 assert.equal(original.map,texture);assert.equal(original.color.getHexString(),'ff0000');assert.equal(original.roughness,.4);
 assert.equal(mesh.geometry,geometry);assert.deepEqual(bone.quaternion.toArray(),before);
 controller.apply(cleanAppearance());assert.equal(mesh.material,materials);controller.release();geometry.dispose();original.dispose();second.dispose();texture.dispose();
});
test('repeated editing reuses materials and replacement releases only owned clones',()=>{
 const original=new THREE.MeshStandardMaterial(),a=new THREE.Mesh(new THREE.BoxGeometry(),original),b=new THREE.Mesh(a.geometry,original),model=new THREE.Group();model.add(a,b);
 const controller=createModelMaterials();controller.attach(model);const state=cleanAppearance({modelStyle:'matte'});controller.apply(state);
 const clone=a.material;assert.equal(b.material,clone);let disposed=0,originalDisposed=0;clone.addEventListener('dispose',()=>disposed++);original.addEventListener('dispose',()=>originalDisposed++);
 for(let i=0;i<20;i++)controller.apply({...state,modelRoughness:i/20});
 assert.equal(a.material,clone);controller.attach(new THREE.Group());assert.equal(disposed,1);assert.equal(originalDisposed,0);assert.equal(a.material,original);
 controller.release();assert.equal(disposed,1);a.geometry.dispose();original.dispose();
});
test('legacy and invalid material settings normalize safely',()=>{
 assert.equal(cleanAppearance({version:1,background:'#123456'}).modelStyle,'original');
 const c=cleanAppearance({modelStyle:'unknown',modelColor:'red',modelRoughness:-2,modelMetalness:7});
 assert.equal(c.modelStyle,'original');assert.equal(c.modelRoughness,0);assert.equal(c.modelMetalness,1);assert.equal(c.modelColor,'#c9ced8');
 const value=cleanAppearance({modelStyle:'custom',modelColor:'#00FF55',modelMetalness:.3});assert.deepEqual(cleanAppearance(JSON.parse(JSON.stringify(value))),value);
});
