import * as THREE from 'three';

// Coordinates on the actual surface, rather than projecting the current hands.
export function grabPresetPoints(type, params, preset){
  if (!['sides', 'bottom'].includes(preset)) return null;
  let x, y = 0;
  if (type === 'box') {
    x = params.w / (preset === 'sides' ? 2 : 4);
    if (preset === 'bottom') y = -params.h / 2;
  } else if (type === 'sphere') {
    x = params.r * (preset === 'sides' ? 1 : 0.5);
    if (preset === 'bottom') y = -Math.sqrt(params.r ** 2 - x ** 2);
  } else if (type === 'cylinder') {
    x = params.r * (preset === 'sides' ? 1 : 0.5);
    if (preset === 'bottom') y = -params.h / 2;
  } else return null;
  return { rArm: new THREE.Vector3(-x, y, 0), lArm: new THREE.Vector3(x, y, 0) };
}

// Shoulder and spine bones give the current torso frame, including a turned body.
export function grabChestFrame(bones){
  if (!['spine', 'spine2', 'neck', 'rArm', 'lArm'].every(key => bones?.[key])) return null;
  const point = key => bones[key].getWorldPosition(new THREE.Vector3());
  const right = point('lArm').sub(point('rArm')).normalize();
  const up = point('neck').sub(point('spine')).normalize();
  const forward = new THREE.Vector3().crossVectors(right, up).normalize();
  if (right.lengthSq() < 0.5 || forward.lengthSq() < 0.5) return null;
  up.crossVectors(forward, right).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
  return { position: point('spine2').addScaledVector(forward, 0.22), quaternion };
}
