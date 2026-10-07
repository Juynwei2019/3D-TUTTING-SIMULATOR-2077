import * as THREE from 'three';
import { cleanGrabProject } from '../storage/grab-project.js';
import { GRAB_SHAPE_DEFAULTS } from '../interaction/grab-shapes.js';

const defaults={shapeParams:GRAB_SHAPE_DEFAULTS,rig:null,target:null};
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=10000);

// Animation data deliberately excludes workspace rig, editing mode and revision.
export function cleanGrabFrame(raw){
  const state=cleanGrabProject(raw,defaults);
  if(!state)return null;
  const {visible,shapeType,shapeParams,position,quaternion,grabbed,grabLocal,palmAligned,palmTwist,preset}=state;
  const poles=Object.fromEntries(['rArm','lArm'].map(limb=>[limb,vec(raw.poles?.[limb])?raw.poles[limb].slice():null]));
  return {version:1,visible,shapeType,shapeParams,position,quaternion,grabbed,grabLocal,palmAligned,palmTwist,preset,poles};
}

export function sampleGrabFrame(a,b,eased,progress=eased){
  // Discrete changes use clock progress, not Back/Elastic's overshooting easing.
  const left=cleanGrabFrame(a),right=cleanGrabFrame(b);
  const state=progress>=1?right:left;
  if(!state)return null;
  if(left&&right&&progress<1){
    state.position=new THREE.Vector3().fromArray(left.position).lerp(new THREE.Vector3().fromArray(right.position),eased).toArray();
    state.quaternion=new THREE.Quaternion().fromArray(left.quaternion).slerp(new THREE.Quaternion().fromArray(right.quaternion),eased).toArray();
    for(const limb of ['rArm','lArm']){
      state.palmTwist[limb]=left.palmTwist[limb]+(right.palmTwist[limb]-left.palmTwist[limb])*eased;
      if(left.poles[limb]&&right.poles[limb])state.poles[limb]=new THREE.Vector3().fromArray(left.poles[limb]).lerp(new THREE.Vector3().fromArray(right.poles[limb]),eased).toArray();
    }
  }
  return state;
}
