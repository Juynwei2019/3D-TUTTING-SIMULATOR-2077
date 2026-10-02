import * as THREE from "three";
import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";

// Live host getters preserve shared rig and playback coordination.
export function createCollisionView(context){
function buildHandCollisionVizMeshes(){
  context.handCollisionVizGroup = new THREE.Group();
  context.handCollisionVizGroup.visible = false;
  context.handCollisionVizGroup.renderOrder = 997;

  const capsuleMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, transparent: true, opacity: 0.28,
    depthWrite: false, side: THREE.DoubleSide, wireframe: false
  });
  context.ALL_BODY_CAPSULES.forEach((cap) => {
    // 先給一個佔位geometry（真正尺寸在 updateHandCollisionVizMeshes() 第一次呼叫時就會依實際骨骼距離重建）
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.01, 4, 8), capsuleMat);
    mesh.userData.builtRadius = 0.01;
    mesh.userData.builtLength = 0.01;
    context.handCollisionVizCapsuleMeshes.push(mesh);
    context.handCollisionVizGroup.add(mesh);
  });

  const handMat = new THREE.MeshBasicMaterial({
    color: 0xff9500, transparent: true, opacity: 0.35,
    depthWrite: false, side: THREE.DoubleSide
  });
  for (const limb of context.HAND_COLLISION_LIMBS){
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), handMat); // 半徑1的單位球，靠 scale 表示實際半徑（球體均勻縮放不會變形，不用重建geometry）
    context.handCollisionVizHandMeshes[limb] = mesh;
    context.handCollisionVizGroup.add(mesh);
  }

  context.scene.add(context.handCollisionVizGroup);
}

function updateHandCollisionVizMeshes(){
  if (!context.handCollisionVizGroup) return;
  context.handCollisionVizGroup.visible = context.handCollisionVizEnabled;
  if (!context.handCollisionVizEnabled) return;

  context.ALL_BODY_CAPSULES.forEach((cap, i) => {
    const mesh = context.handCollisionVizCapsuleMeshes[i];
    const boneA = context.bones[cap.boneA], boneB = context.bones[cap.boneB];
    if (!boneA || !boneB){ mesh.visible = false; return; }
    mesh.visible = true;
    boneA.getWorldPosition(context._hcA);
    boneB.getWorldPosition(context._hcB);
    const length = context._hcA.distanceTo(context._hcB);

    // 半徑或長度變化夠大才重建geometry（CapsuleGeometry沒辦法像球體一樣單純靠scale表示半徑變化，
    // 非等向縮放會把兩端的半球型端蓋拉成橢圓，形狀會跑掉，所以改成必要時才重新配置頂點）
    if (Math.abs(mesh.userData.builtRadius - cap.radius) > context.HAND_COLLISION_VIZ_EPS ||
        Math.abs(mesh.userData.builtLength - length) > context.HAND_COLLISION_VIZ_EPS){
      mesh.geometry.dispose();
      mesh.geometry = new THREE.CapsuleGeometry(cap.radius, Math.max(length, 0.001), 4, 8);
      mesh.userData.builtRadius = cap.radius;
      mesh.userData.builtLength = length;
    }

    // CapsuleGeometry預設沿本地Y軸、置中在原點，這裡把它擺到 A、B 中點，並把Y軸轉向 A→B 方向
    mesh.position.copy(context._hcA).add(context._hcB).multiplyScalar(0.5);
    context._hcPushDir.copy(context._hcB).sub(context._hcA).normalize(); // 借用既有的暫存向量，跟碰撞計算不會同時用到
    if (context._hcPushDir.lengthSq() > 1e-8){
      mesh.quaternion.setFromUnitVectors(_stRefY, context._hcPushDir);
    }
  });

  for (const limb of context.HAND_COLLISION_LIMBS){
    const mesh = context.handCollisionVizHandMeshes[limb];
    const chain = IK_CHAINS[limb];
    const handBone = context.bones[chain.end];
    if (!handBone){ mesh.visible = false; continue; }
    mesh.visible = true;
    handBone.getWorldPosition(context._hcHandPos);
    mesh.position.copy(context._hcHandPos);
    mesh.scale.setScalar(context.HAND_COLLISION_RADIUS); // 單位球均勻縮放＝半徑，形狀不會失真
  }
}
return { buildHandCollisionVizMeshes, updateHandCollisionVizMeshes };
}
