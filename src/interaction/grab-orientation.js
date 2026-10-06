import * as THREE from 'three';

// Outward normal at a contact point. At sharp edges use a deterministic face.
export function grabSurfaceNormal(type, p, params){
  if (type === 'sphere') return p.lengthSq() > 1e-12 ? p.clone().normalize() : new THREE.Vector3(1,0,0);
  if (type === 'cylinder') {
    const radial = Math.hypot(p.x,p.z);
    if (Math.abs(Math.abs(p.y)-params.h/2) < Math.abs(radial-params.r)) return new THREE.Vector3(0,p.y<0?-1:1,0);
    return radial > 1e-6 ? new THREE.Vector3(p.x/radial,0,p.z/radial) : new THREE.Vector3(1,0,0);
  }
  const distances = [Math.abs(Math.abs(p.x)-params.w/2),Math.abs(Math.abs(p.y)-params.h/2),Math.abs(Math.abs(p.z)-params.d/2)];
  const axis = distances.indexOf(Math.min(...distances)), normal = new THREE.Vector3();
  normal.setComponent(axis,p.getComponent(axis)<0?-1:1);
  return normal;
}

export function grabPalmQuaternion(bones, limb, outward, fingerHint, twist=0){
  const side = limb==='rArm'?'r':'l', sign=side==='r'?1:-1;
  if (!['Hand','Middle1','Index1','Pinky1'].every(key=>bones?.[side+key])) return null;
  const hand=bones[side+'Hand'], origin=hand.getWorldPosition(new THREE.Vector3());
  const inverse=hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  const localFinger=bones[side+'Middle1'].getWorldPosition(new THREE.Vector3()).sub(origin).applyQuaternion(inverse).normalize();
  const localAcross=bones[side+'Index1'].getWorldPosition(new THREE.Vector3()).sub(bones[side+'Pinky1'].getWorldPosition(new THREE.Vector3())).applyQuaternion(inverse);
  localAcross.addScaledVector(localFinger,-localAcross.dot(localFinger)).normalize();
  if (localFinger.lengthSq()<.5 || localAcross.lengthSq()<.5 || outward.lengthSq()<1e-12) return null;
  const localNormal=new THREE.Vector3().crossVectors(localAcross,localFinger).normalize();
  const palm=outward.clone().normalize().negate();
  const finger=fingerHint.clone().addScaledVector(palm,-fingerHint.dot(palm));
  if(finger.lengthSq()<1e-8){
    const helper=Math.abs(palm.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
    finger.copy(helper).addScaledVector(palm,-helper.dot(palm));
  }
  finger.normalize().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(palm,THREE.MathUtils.degToRad(twist)*sign));
  const across=new THREE.Vector3().crossVectors(palm,finger).multiplyScalar(sign).normalize();
  const normal=new THREE.Vector3().crossVectors(across,finger).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,finger,normal)
    .multiply(new THREE.Matrix4().makeBasis(localAcross,localFinger,localNormal).invert()));
}
