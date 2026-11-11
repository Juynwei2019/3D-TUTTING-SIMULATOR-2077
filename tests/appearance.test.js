import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cleanAppearance,APPEARANCE_DEFAULT,APPEARANCE_PRESETS,qualityRatio,createAppearanceController,isAppearanceProject} from '../src/scene/appearance.js';
import {validateProject} from '../src/storage/project-format.js';
import {createProjectFiles} from '../src/storage/project-file.js';

test('appearance rejects invalid values and preserves legacy defaults',()=>{
 assert.deepEqual(cleanAppearance(),APPEARANCE_DEFAULT);
 const c=cleanAppearance({background:'javascript:abc',grid:'false',rimIntensity:99,keyIntensity:NaN,quality:'economy'});
 assert.equal(c.background,APPEARANCE_DEFAULT.background);assert.equal(c.grid,true);assert.equal(c.rimIntensity,3);assert.equal(c.keyIntensity,1.2);assert.equal(c.quality,undefined);
 assert.equal(isAppearanceProject(cleanAppearance()),false);
 assert.equal(validateProject({schemaVersion:1,keyframes:[],appearance:APPEARANCE_PRESETS.bright}),null);
 assert.equal(validateProject({schemaVersion:1,keyframes:[],appearance:cleanAppearance()}),'empty');
});
test('quality caps respect device density and split view budget',()=>{
 assert.equal(qualityRatio('economy',3),1);assert.equal(qualityRatio('standard',3),1.5);assert.equal(qualityRatio('clear',3),2);
 assert.equal(qualityRatio('clear',3,true),1.5);assert.equal(qualityRatio('clear',1),1);assert.equal(qualityRatio('x',NaN),1);
});
test('appearance-only projects can export and import, while empty legacy files remain rejected',()=>{
 let data={schemaVersion:1,keyframes:[],appearance:APPEARANCE_PRESETS.neutral},downloads=0,restores=0,alerts=0;
 const files=createProjectFiles({getKeyframes:()=>[],snapshotTimelineData:()=>data,downloadJSON:()=>downloads++,readJSONFile:(_,cb)=>cb(data),restoreTimelineData:()=>restores++,pushHistory(){},scheduleAutoSave(){},alert:()=>alerts++,confirm:()=>true});
 files.exportFile();files.importFile({});assert.equal(downloads,1);assert.equal(restores,1);
 data={schemaVersion:1,keyframes:[]};files.exportFile();files.importFile({});assert.equal(downloads,1);assert.equal(restores,1);assert.equal(alerts,2);
});
test('appearance changes update shared scene and owned lights/grid without replacing geometry',()=>{
 const scene=new THREE.Scene(),grid=new THREE.GridHelper(20,20),geometry=grid.geometry;
 const lights={ambient:new THREE.AmbientLight(),key:new THREE.DirectionalLight(),rim:new THREE.DirectionalLight()};
 const controller=createAppearanceController({scene,preferences:{getItem:()=>null},refreshHelpers(){}});
 // Restore uses document only to synchronize optional UI controls.
 const old=globalThis.document;globalThis.document={getElementById:()=>null};
 try{
  controller.attachLights(lights);controller.attachGrid(grid);
  controller.restore({...APPEARANCE_PRESETS.bright,grid:false});
  assert.equal(scene.background.getHexString(),'eef1f5');assert.equal(scene.fog,null);assert.equal(grid.visible,false);
  assert.equal(lights.rim.visible,false);assert.equal(lights.ambient.color.getHexString(),'ffffff');assert.equal(grid.geometry,geometry);
  assert.equal(controller.palette.joint,0x07556b);
  const saved=controller.snapshot();saved.background='#000000';assert.equal(controller.snapshot().background,'#eef1f5');
  controller.restore();assert.equal(scene.fog.color.getHexString(),'0a0a12');assert.deepEqual(controller.snapshot(),APPEARANCE_DEFAULT);
 }finally{globalThis.document=old;grid.geometry.dispose();grid.material.dispose();}
});
