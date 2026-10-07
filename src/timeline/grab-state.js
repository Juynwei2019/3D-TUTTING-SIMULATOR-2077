import * as THREE from 'three';
import { cleanGrabProject } from '../storage/grab-project.js';
import { GRAB_SHAPE_DEFAULTS, GRAB_SHAPE_CLOSEST_POINT } from '../interaction/grab-shapes.js';

const defaults={shapeParams:GRAB_SHAPE_DEFAULTS,rig:null,target:null};
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=10000);

// Animation data deliberately excludes workspace rig, editing mode and revision.
export function cleanGrabFrame(raw){
  const state=cleanGrabProject(raw,defaults);
  if(!state)return null;
  const {visible,shapeType,shapeParams,position,quaternion,grabbed,grabLocal,palmAligned,palmTwist,preset,sizeTween}=state;
  const poles=Object.fromEntries(['rArm','lArm'].map(limb=>[limb,vec(raw.poles?.[limb])?raw.poles[limb].slice():null]));
  return {version:1,visible,shapeType,shapeParams,position,quaternion,grabbed,grabLocal,palmAligned,palmTwist,preset,sizeTween,poles};
}

export function sampleGrabFrame(a,b,eased,progress=eased){
  // Discrete changes use clock progress, not Back/Elastic's overshooting easing.
  const left=cleanGrabFrame(a),right=cleanGrabFrame(b);
  const state=progress>=1?right:left;
  if(!state)return null;
  if(left&&right&&progress<1){
    state.position=new THREE.Vector3().fromArray(left.position).lerp(new THREE.Vector3().fromArray(right.position),eased).toArray();
    state.quaternion=new THREE.Quaternion().fromArray(left.quaternion).slerp(new THREE.Quaternion().fromArray(right.quaternion),eased).toArray();
    if(left.sizeTween&&left.shapeType===right.shapeType){
      const type=left.shapeType,start=left.shapeParams[type],end=right.shapeParams[type];
      const amount=THREE.MathUtils.clamp(eased,0,1);
      const dimensions=Object.fromEntries(Object.keys(start).map(key=>[key,start[key]+(end[key]-start[key])*amount]));
      state.shapeParams[type]=dimensions;
      const scale=type==='box'?[dimensions.w/start.w,dimensions.h/start.h,dimensions.d/start.d]:type==='sphere'?[dimensions.r/start.r,dimensions.r/start.r,dimensions.r/start.r]:[dimensions.r/start.r,dimensions.h/start.h,dimensions.r/start.r];
      if(Object.keys(start).some(key=>start[key]!==end[key]))for(const limb of ['rArm','lArm'])if(state.grabbed[limb]){
        const point=GRAB_SHAPE_CLOSEST_POINT[type](new THREE.Vector3().fromArray(left.grabLocal[limb]),start);
        state.grabLocal[limb]=point.multiply(new THREE.Vector3(...scale)).toArray();
      }
    }
    for(const limb of ['rArm','lArm']){
      state.palmTwist[limb]=left.palmTwist[limb]+(right.palmTwist[limb]-left.palmTwist[limb])*eased;
      if(left.poles[limb]&&right.poles[limb])state.poles[limb]=new THREE.Vector3().fromArray(left.poles[limb]).lerp(new THREE.Vector3().fromArray(right.poles[limb]),eased).toArray();
    }
  }
  return state;
}
