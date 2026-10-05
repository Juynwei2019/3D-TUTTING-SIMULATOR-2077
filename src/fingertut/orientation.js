import * as THREE from 'three';

export const PALM_PRESETS = ['down','up','in','out','camera'];
export function defaultPalmOrientation(){return {preset:'down',flip:0,tilt:0,yaw:0,cameraPalm:[0,0,1]};}
export function cleanPalmOrientation(value={}){
  const result=defaultPalmOrientation();
  if(PALM_PRESETS.includes(value.preset))result.preset=value.preset;
  for(const key of ['flip','tilt','yaw']){
    const limit=key==='flip'?180:90;
    if(Number.isFinite(value[key]))result[key]=Math.max(-limit,Math.min(limit,value[key]));
  }
  if(Array.isArray(value.cameraPalm)&&value.cameraPalm.length===3&&value.cameraPalm.every(Number.isFinite)&&Math.hypot(...value.cameraPalm)>1e-6)result.cameraPalm=value.cameraPalm.slice();
  return result;
}

// Anatomical directions in the chest frame; both hands use mirrored angle semantics.
export function palmDirections(frame,side,value){
  const state=cleanPalmOrientation(value),sign=side==='r'?1:-1;
  let finger=frame.forward.clone(),palm=frame.up.clone().negate();
  if(state.preset==='down'||state.preset==='up'){
    finger.addScaledVector(frame.up,-.12);
    if(state.preset==='up')palm.negate();
  }else if(state.preset==='in'||state.preset==='out'){
    palm=frame.right.clone().multiplyScalar(sign*(state.preset==='in'?1:-1));
  }else{
    palm=frame.right.clone().multiplyScalar(state.cameraPalm[0]).addScaledVector(frame.up,state.cameraPalm[1]).addScaledVector(frame.forward,state.cameraPalm[2]).normalize();
    finger=frame.up.clone();
  }
  if(state.preset==='down'||state.preset==='up'){
    finger.normalize();palm.addScaledVector(finger,-palm.dot(finger));
  }else finger.addScaledVector(palm,-finger.dot(palm)/palm.lengthSq());
  if(finger.lengthSq()<1e-8){finger=frame.forward.clone().addScaledVector(palm,-frame.forward.dot(palm));}
  if(finger.lengthSq()<1e-8){finger=frame.right.clone().addScaledVector(palm,-frame.right.dot(palm));}
  finger.normalize();palm.addScaledVector(finger,-palm.dot(finger)).normalize();
  const across=new THREE.Vector3().crossVectors(palm,finger).multiplyScalar(sign).normalize();
  const rotate=(axis,degrees)=>{const q=new THREE.Quaternion().setFromAxisAngle(axis,THREE.MathUtils.degToRad(degrees));finger.applyQuaternion(q);palm.applyQuaternion(q);};
  rotate(across,state.tilt*sign);
  rotate(frame.up,state.yaw*sign);
  rotate(finger.clone(),state.flip*sign);
  return {finger,palm,across:new THREE.Vector3().crossVectors(palm,finger).multiplyScalar(sign).normalize()};
}

export function palmWorldQuaternion(bones,frame,side,state){
  const hand=bones[side+'Hand'],origin=hand.getWorldPosition(new THREE.Vector3());
  const inverse=hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  const localFinger=bones[side+'Middle1'].getWorldPosition(new THREE.Vector3()).sub(origin).applyQuaternion(inverse).normalize();
  const localAcross=bones[side+'Index1'].getWorldPosition(new THREE.Vector3()).sub(bones[side+'Pinky1'].getWorldPosition(new THREE.Vector3())).applyQuaternion(inverse);
  localAcross.addScaledVector(localFinger,-localAcross.dot(localFinger)).normalize();
  const localNormal=new THREE.Vector3().crossVectors(localAcross,localFinger).normalize();
  const localBasis=new THREE.Matrix4().makeBasis(localAcross,localFinger,localNormal);
  const {finger,across}=palmDirections(frame,side,state);
  const normal=new THREE.Vector3().crossVectors(across,finger).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,finger,normal).multiply(localBasis.invert()));
}
