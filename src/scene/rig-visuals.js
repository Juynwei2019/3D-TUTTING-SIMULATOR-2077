import * as THREE from "three";
import { FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS } from "../rig/definitions.js";

// Live host getters preserve shared rig and playback coordination.
export function createRigVisuals(context){
  const _markerV = new THREE.Vector3();

  function buildJointMarkers(){
    // 修正 Xbot 身高後，維持舊版關節球相對角色的視覺比例。
    const markerSizeRatio = context.modelHeight / 4.600099111737363;
    const geo = new THREE.SphereGeometry(0.03 * markerSizeRatio, 14, 14);
    // 手指骨節間距很小，用原本身體關節球半徑會讓相鄰指節重疊難點選，改用更小半徑＋不同顏色區分
    const fingerGeo = new THREE.SphereGeometry(0.012 * markerSizeRatio, 10, 10);
    for (const key of ALL_JOINT_KEYS){
      if (!context.bones[key]) continue;
      const isFinger = FINGER_JOINT_KEY_SET.has(key);
      const mat = new THREE.MeshBasicMaterial({ color: isFinger ? 0xffa8e8 : 0x7fe0ff, transparent:true, opacity:0.9, depthTest:false });
      const marker = new THREE.Mesh(isFinger ? fingerGeo : geo, mat);
      marker.renderOrder = 999;
      marker.userData.jointKey = key;
      marker.userData.pickType = "joint";
      context.scene.add(marker);
      context.markerMeshes[key] = marker;
    }
  }

  function updateMarkers(){
    // 兩個分類開關都關閉時，49 顆關節球全部不可見：只需要隱藏一次，
    // 不必逐一呼叫 getWorldPosition()（要沿骨骼鏈往上算世界矩陣，不是免費的）。
    if (!context.showHandJoints && !context.showBodyJoints){
      for (const key in context.markerMeshes) context.markerMeshes[key].visible = false;
      return;
    }
    for (const key in context.markerMeshes){
      if (!context.bones[key]) continue;
      const marker = context.markerMeshes[key];
      // 最終顯示 = 分類開關（手部/身體）開著 AND 沒有被 IK 接管而隱藏
      const isHand = FINGER_JOINT_KEY_SET.has(key);
      const categoryOn = isHand ? context.showHandJoints : context.showBodyJoints;
      marker.visible = categoryOn && !context.markerIKHidden[key];
      if (!marker.visible) continue; // 不可見就不必更新座標，省下這顆球的世界矩陣運算
      context.bones[key].getWorldPosition(_markerV);
      marker.position.copy(_markerV);
    }
  }

  function buildSkeletonLines(){
    const boneKeyByUuid = {};
    for (const key of ALL_JOINT_KEYS){
      if (context.bones[key]) boneKeyByUuid[context.bones[key].uuid] = key;
    }
    const pairs = [];
    for (const key of ALL_JOINT_KEYS){
      const bone = context.bones[key];
      if (!bone) continue;
      let p = bone.parent;
      while (p){
        const parentKey = boneKeyByUuid[p.uuid];
        if (parentKey){ pairs.push([key, parentKey]); break; }
        p = p.parent;
      }
    }
    context.skeletonLinePairs = pairs;
    const positions = new Float32Array(pairs.length * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x7fe0ff, transparent:true, opacity:0.55, depthTest:false });
    context.skeletonLines = new THREE.LineSegments(geo, mat);
    context.skeletonLines.renderOrder = 998; // 略低於關節球（999），視覺上線段在球體「後面」一點
    context.skeletonLines.frustumCulled = false;
    context.scene.add(context.skeletonLines);
  }

  function updateSkeletonLines(){
    if (!context.skeletonLines) return;
    context.skeletonLines.visible = context.showSkeleton;
    if (!context.showSkeleton) return;
    const posAttr = context.skeletonLines.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < context.skeletonLinePairs.length; i++){
      const [childKey, parentKey] = context.skeletonLinePairs[i];
      context.bones[childKey].getWorldPosition(v);
      posAttr.setXYZ(i*2, v.x, v.y, v.z);
      context.bones[parentKey].getWorldPosition(v);
      posAttr.setXYZ(i*2+1, v.x, v.y, v.z);
    }
    posAttr.needsUpdate = true;
  }

  function setJointCategoryVisible(category, on){
    if (category === "hand") context.showHandJoints = on;
    else context.showBodyJoints = on;
  }

  function highlightMarkers(){
    for (const key in context.markerMeshes){
      const m = context.markerMeshes[key];
      const isSel = key === context.selectedKey;
      const isFinger = FINGER_JOINT_KEY_SET.has(key);
      m.material.color.set(isSel ? 0xff2f7e : (isFinger ? 0xffa8e8 : 0x7fe0ff));
      m.scale.setScalar(isSel ? 1.6 : 1.0);
    }
    context.highlightFingerButtons();
    context.highlightOverviewRows();
  }
  return { buildJointMarkers, updateMarkers, buildSkeletonLines, updateSkeletonLines, setJointCategoryVisible, highlightMarkers };
}
