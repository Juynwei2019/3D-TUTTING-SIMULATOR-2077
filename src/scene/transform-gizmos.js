import { TransformControls } from "three/addons/controls/TransformControls.js";
import { D } from "../math/angles.js";
import { IK_CHAINS } from "../rig/definitions.js";
import * as THREE from "three";

// Live host getters preserve shared rig and playback coordination.
export function createTransformGizmos(context){
  function initTransformGizmos(){
    context.transformControls = new TransformControls(context.camera, context.renderer.domElement);
    context.transformControls.setMode("rotate");
    context.transformControls.setSpace("local");
    context.transformControls.setSize(0.7);
    context.transformControls.setRotationSnap(D(15));
    context.transformControls.addEventListener("dragging-changed", (e) => {
      context.controls.enabled = !e.value;
      if (e.value) {
        context.draggingKey = context.selectedKey;
      } else {
        context.draggingKey = null;
        // 若剛放開拖曳的關節，是某條開啟中腿部IK鏈的腳掌（Foot），
        // 重新抓取當下世界旋轉當作新的鎖存基準，讓使用者的手動微調保留下來，
        // 而不是下一幀就被舊的鎖存值蓋回去。
        for (const limb of ["rLeg", "lLeg"]){
          if (context.ikEnabled[limb] && context.selectedKey === IK_CHAINS[limb].end) context.captureFootLock(limb);
        }
        context.suppressClick = true;
        setTimeout(() => context.suppressClick = false, 80);
        context.pushHistory();
      }
    });
    context.transformControls.addEventListener("objectChange", () => {
      if (context.selectedKey) context.commitFromBone(context.selectedKey);
    });
    context.scene.add(context.transformControls);

    // IK 目標球／極向球專用的平移控制環（跟關節旋轉環分開，模式固定為 translate）
    context.transformControlsIK = new TransformControls(context.camera, context.renderer.domElement);
    context.transformControlsIK.setMode("translate");
    context.transformControlsIK.setSpace("world");
    context.transformControlsIK.setSize(0.7);
    context.transformControlsIK.addEventListener("dragging-changed", (e) => {
      context.controls.enabled = !e.value;
      if(context.selectedIK?.role==='laPoint'){
        if(e.value){context.pushHistory();context.laCustomDrag={center:context.laCustomCenter()};}
        else {context.laCustomDrag=null;context.renderLACustomList();context.pushHistory();context.scheduleAutoSave();}
      }
      const handName=context.selectedIK?.limb?.startsWith('lookAt_')?context.selectedIK.limb.slice(7):null;
      if(context.LOOKAT_RANGE_NAMES.includes(handName)){
        if(!e.value){if(context.HAND_AIM_NAMES.includes(handName))context.solveHandAim(handName);else context.solveLookAt(handName);}
        context.pushHistory();if(e.value)context.beginHandRangeDrag(handName);else {context.handRangeDrag=null;context.scheduleAutoSave();}
      }
      if(e.value) context.beginPoleDrag();
      else if(context.poleDrag){const changed=!context.poleDrag.blocked;context.poleDrag=null;if(changed){context.pushHistory();context.scheduleAutoSave();}}
      if (context.footPlantEnabled) {
        if (!e.value) context.solveFootPlant();
        context.pushHistory();
        if (!e.value) context.scheduleAutoSave();
      }
      if (!e.value) {
        context.suppressClick = true;
        setTimeout(() => context.suppressClick = false, 80);
      }
    });
    // 身體移動：拖曳的是bodyGizmoProxy（放在Hips高度），不是model本身，
    // 這裡把每次拖曳造成的位移量(delta)同步套用到model.position，
    // 讓控制環視覺上停在髖部，但實際移動的是整個角色。
    context.transformControlsIK.addEventListener("objectChange", () => {
      context.clampPoleDrag();
      context.clampHandRangeDrag();
      context.dragLACustom();
      if (context.selectedIK && context.selectedIK.limb === "body" && context.bodyGizmoProxy && context.bodyProxyLastPos){
        const delta = context.bodyGizmoProxy.position.clone().sub(context.bodyProxyLastPos);
        context.model.position.add(delta);
        context.model.updateWorldMatrix(true, true);
        context.bodyProxyLastPos.copy(context.bodyGizmoProxy.position);
      } else if (context.selectedIK && context.selectedIK.role === "trajPoint"){
        context.updateTrajVisual(context.selectedIK.limb);
      }
    });
    context.scene.add(context.transformControlsIK);

    context.bodyGizmoProxy = new THREE.Object3D();
    context.scene.add(context.bodyGizmoProxy);

  }
  return { initTransformGizmos };
}
