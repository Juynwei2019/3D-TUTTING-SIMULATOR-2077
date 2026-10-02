import * as THREE from "three";

// 先縮放，再量測蒙皮後的世界座標頂點，避免沿用縮放前的貼地位移。
// 必須在保存初始位置、校準腳底及建立 IK 目標之前執行。
function placeModelOnGround(object, targetHeight) {
  const measure = () => {
    object.updateMatrixWorld(true);
    object.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
    return new THREE.Box3().setFromObject(object, true);
  };
  const initial = measure();
  const height = initial.max.y - initial.min.y;
  if (initial.isEmpty() || !Number.isFinite(height) || height <= 1e-8) return;
  object.scale.multiplyScalar(targetHeight / height);
  const scaled = measure();
  const center = scaled.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= scaled.min.y;
  object.updateMatrixWorld(true);
  object.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
}


export { placeModelOnGround };
