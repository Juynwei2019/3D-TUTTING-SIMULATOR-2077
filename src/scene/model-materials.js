import * as THREE from 'three';

export const MODEL_STYLES = Object.freeze({
  matte: {modelRoughness:.95,modelMetalness:0},
  glossy: {modelRoughness:.22,modelMetalness:0},
  metal: {modelRoughness:.3,modelMetalness:.75},
});

// Own only cloned materials. Never dispose original materials or shared textures.
export function createModelMaterials(){
  let records=[],owned=new Map();
  function release(){
    for(const {mesh,original}of records)mesh.material=original;
    for(const material of owned.values())material.dispose();
    records=[];owned.clear();
  }
  function attach(model){
    release();
    model.traverse(mesh=>{if(mesh.isMesh&&mesh.material)records.push({mesh,original:mesh.material});});
  }
  function customized(original){
    if(!owned.has(original)){
      const m=original.isMeshStandardMaterial?original.clone():new THREE.MeshStandardMaterial({side:original.side});
      m.map=null;m.roughnessMap=null;m.metalnessMap=null;m.vertexColors=false;
      owned.set(original,m);
    }return owned.get(original);
  }
  function apply(state){
    for(const {mesh,original}of records){
      if(state.modelStyle==='original'){mesh.material=original;continue;}
      const update=source=>{const m=customized(source);m.color.set(state.modelColor);m.roughness=state.modelRoughness;m.metalness=state.modelMetalness;return m;};
      mesh.material=Array.isArray(original)?original.map(update):update(original);
    }
  }
  return {attach,apply,release};
}
