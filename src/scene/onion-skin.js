import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three";
import { BONE_SUFFIXES, ALL_JOINT_KEYS } from "../rig/definitions.js";
import { findBone } from "../rig/find-bone.js";
import { eulerToQuat } from "../math/quaternions.js";

// Live host getters preserve shared rig and playback coordination.
export function createOnionSkin(context){
  function buildOnionGhosts(){
    const configs = [
      { key:"prev", color:0x33ccff }, // 上一拍：青色
      { key:"next", color:0xff44cc }  // 下一拍：洋紅
    ];
    for (const cfg of configs){
      const ghost = skeletonClone(context.model);
      ghost.traverse(o => {
        if (o.isMesh){
          o.frustumCulled = false;
          o.material = new THREE.MeshBasicMaterial({
            color: cfg.color, transparent:true, opacity:0.26,
            depthWrite:false, side:THREE.DoubleSide
          });
          o.renderOrder = 500;
        }
      });
      for (const key of ALL_JOINT_KEYS){
        const b = findBone(ghost, BONE_SUFFIXES[key]);
        if (b) context.ghostBones[cfg.key][key] = b;
      }
      ghost.visible = false;
      context.scene.add(ghost);
      if (cfg.key === "prev") context.ghostPrev = ghost; else context.ghostNext = ghost;
    }
  }

  function poseGhostFromKeyframe(which, kf){
    const ghost = which === "prev" ? context.ghostPrev : context.ghostNext;
    const gb = context.ghostBones[which];
    if (!ghost || !kf) return;
    for (const key of ALL_JOINT_KEYS){
      const bone = gb[key];
      if (!bone || !context.restQuat[key]) continue;
      const angles = kf.angles[key] || [0,0,0];
      bone.quaternion.copy(context.restQuat[key]).multiply(eulerToQuat(angles));
    }
    if (kf.body){
      ghost.position.fromArray(kf.body.position);
      ghost.quaternion.fromArray(kf.body.quaternion);
    }
    ghost.updateMatrixWorld(true);
  }

  function isKeyframeTabActive(){
    const panel = document.getElementById("tabKeyframe");
    return !!(panel && panel.classList.contains("active"));
  }

  function updateOnionSkins(){
    if (!context.ghostPrev || !context.ghostNext) return;
    if (context.kfPlaying){
      updateOnionSkinsForPlayback();
      return;
    }
    const show = context.onionSkinEnabled && isKeyframeTabActive() && context.kfEditingIndex >= 0 && context.keyframes.length > 1;
    if (!show){
      context.ghostPrev.visible = false;
      context.ghostNext.visible = false;
      return;
    }
    const prevKf = context.keyframes[context.kfEditingIndex - 1];
    const nextKf = context.keyframes[context.kfEditingIndex + 1];
    if (prevKf){ poseGhostFromKeyframe("prev", prevKf); context.ghostPrev.visible = true; }
    else context.ghostPrev.visible = false;
    if (nextKf){ poseGhostFromKeyframe("next", nextKf); context.ghostNext.visible = true; }
    else context.ghostNext.visible = false;
  }

  function updateOnionSkinsForPlayback(){
    const show = context.onionSkinEnabled && isKeyframeTabActive() && context.keyframes.length > 1;
    if (!show){
      context.ghostPrev.visible = false;
      context.ghostNext.visible = false;
      return;
    }
    const prevKf = context.keyframes[context.kfIndex - 1];
    const nextKf = context.keyframes[context.kfIndex + 2];
    if (prevKf){ poseGhostFromKeyframe("prev", prevKf); context.ghostPrev.visible = true; }
    else context.ghostPrev.visible = false;
    if (nextKf){ poseGhostFromKeyframe("next", nextKf); context.ghostNext.visible = true; }
    else context.ghostNext.visible = false;
  }
  return { buildOnionGhosts, poseGhostFromKeyframe, isKeyframeTabActive, updateOnionSkins, updateOnionSkinsForPlayback };
}
