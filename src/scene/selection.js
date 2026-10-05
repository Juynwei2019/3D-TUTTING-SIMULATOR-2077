import { t } from "../i18n/index.js";
import { jointLabel, fingerLabel } from "../i18n/joint-labels.js";
import { createPointerTap } from "../interaction/pointer-tap.js";
import { LABEL_LOOKUP, IK_CHAINS, IK_LIMB_KEYS, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";
import * as THREE from "three";

// Live host getters preserve shared rig and playback coordination.
export function createSceneSelection(context){
  function allPickableMeshes(){
    const list = context.laCustomMeshes.filter(m=>m.visible);
    for (const key in context.markerMeshes){ if (context.markerMeshes[key].visible) list.push(context.markerMeshes[key]); }
    for (const limb of IK_LIMB_KEYS){
      if (context.ikTargetMeshes[limb] && context.ikTargetMeshes[limb].visible) list.push(context.ikTargetMeshes[limb]);
      if (context.ikPoleMeshes[limb] && context.ikPoleMeshes[limb].visible) list.push(context.ikPoleMeshes[limb]);
    }
    if (context.spineIKTargetMesh && context.spineIKTargetMesh.visible) list.push(context.spineIKTargetMesh);
    for (const name of Object.keys(LOOKAT_CONFIG)){
      if (context.lookAtTargetMesh[name] && context.lookAtTargetMesh[name].visible) list.push(context.lookAtTargetMesh[name]);
    }
    for (const limb of IK_LIMB_KEYS){
      for (const m of context.trajPointMeshes[limb]) if (m.visible) list.push(m);
    }
    for (const fingerId of FINGER_IDS){
      if (context.fingerIKTargetMeshes[fingerId] && context.fingerIKTargetMeshes[fingerId].visible) list.push(context.fingerIKTargetMeshes[fingerId]);
    }
    return list;
  }

  function setupPickRaycaster(){
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const tap = createPointerTap();
    const touches = new Set();

    const dom = context.renderer.domElement;
    dom.addEventListener("pointerdown", tap.down);
    window.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch"){ touches.add(e.pointerId); if (touches.size > 1) tap.invalidate(); }
    }, true);
    window.addEventListener("pointermove", tap.move);
    window.addEventListener("pointerup", e => { tap.up(e); touches.delete(e.pointerId); });
    window.addEventListener("pointercancel", e => { tap.cancel(e); touches.delete(e.pointerId); });
    window.addEventListener("blur", () => { tap.reset(); touches.clear(); });

    dom.addEventListener("pointerup", (e) => {
      // suppressClick 會在剛拖完控制環之後短暫為 true，避免放開拖曳的那次 click 被誤判成「點空白處」
      const isTap = tap.up(e);
      if (!isTap || context.suppressClick || context.transformControls.dragging || context.transformControlsIK.dragging || context.kfPlaying) return;

      const rect = dom.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, context.camera);
      const hits = raycaster.intersectObjects(allPickableMeshes());
      if (hits.length > 0){
        const obj = hits[0].object;
        const pickType = obj.userData.pickType;
        if (pickType === "laPoint") context.selectLACustom(obj.userData.index);
        else if (pickType === "ikTarget") context.selectIKMarker(obj.userData.limb, "target");
        else if (pickType === "ikPole") context.selectIKMarker(obj.userData.limb, "pole");
        else if (pickType === "spineIKTarget") context.selectIKMarker("spine", "target");
        else if (pickType === "lookAtTarget") context.selectIKMarker("lookAt_" + obj.userData.lookAtName, "target");
        else if (pickType === "trajPoint") context.selectIKMarker(obj.userData.limb, "trajPoint", obj.userData.index);
        else if (pickType === "fingerIKTarget") context.selectIKMarker(FINGER_IK_PREFIX + obj.userData.fingerId, "target");
        else selectJoint(obj.userData.jointKey);
      } else if (context.selectedKey || context.selectedIK){
        // 點到模型本身或空白處（沒點中任何球）：視為取消選取，收起控制環
        deselectJoint();
      }
    });

    // 按 Esc 取消目前選取，收起控制環（拍點播放中或沒有選取時忽略）
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (context.kfPlaying || (!context.selectedKey && !context.selectedIK)) return;
      deselectJoint();
    });
  }

  function selectJoint(key){
    context.tgCancelPreview();
    if(context.waveRun)context.stopWave();
    if (context.FOOT_PLANT_LIMBS.some(l => context.isFootPlanted(l) && IK_CHAINS[l].end === key)) return;
    if (!context.bones[key]) return;
    context.selectedIK = null;
    context.transformControlsIK.detach();
    context.selectedKey = key;
    context.transformControls.attach(context.bones[key]);
    context.highlightMarkers();
    context.highlightIKMarkers();
    updateSelectedBar();
  }

  function deselectJoint(){
    context.laCustomDrag=null;
    context.selectedKey = null;
    context.selectedIK = null;
    context.transformControls.detach();
    context.transformControlsIK.detach();
    context.highlightMarkers();
    context.highlightIKMarkers();
    updateSelectedBar();
    context.renderTrajPointList();
  }

  function updateSelectedBar(){
    context.updatePoleRadiusUI();
    const label = document.getElementById("selectedLabel");
    const angles = document.getElementById("selectedAngles");
    const spaceBtn = document.getElementById("spaceBtn");
    const snapLabel = document.getElementById("snapLabel");
    const snapSelect = document.getElementById("snapSelect");
    const zeroBtn = document.getElementById("zeroJointBtn");
    if(zeroBtn)zeroBtn.disabled=false;
    if(context.selectedIK?.role==='laPoint'){
      const m=context.laCustomMeshes[context.selectedIK.index];if(!m)return;
      label.textContent=t('LookAt 控制點 P')+(context.selectedIK.index+1);angles.textContent='X '+m.position.x.toFixed(3)+' Y '+m.position.y.toFixed(3)+' Z '+m.position.z.toFixed(3);
      for(const el of [spaceBtn,snapLabel,snapSelect,document.getElementById('ikModeBtn')])if(el)el.style.display='none';
      if(zeroBtn){zeroBtn.disabled=true;zeroBtn.textContent=t('請由控制點清單刪除');}return;
    }
    if (context.selectedIK){
      let labelText, mesh;
      if (context.selectedIK.limb === "spine"){
        labelText = `${t(SPINE_IK_CHAIN.label)}・${t("頭部目標球")}`;
        mesh = context.spineIKTargetMesh;
      } else if (context.selectedIK.limb.startsWith("lookAt_")){
        const name = context.selectedIK.limb.replace("lookAt_", "");
        labelText = `${t(LOOKAT_CONFIG[name].label)}・${t("Look-At目標球")}`;
        mesh = context.lookAtTargetMesh[name];
      } else if (context.selectedIK.limb.startsWith(FINGER_IK_PREFIX)){
        const fingerId = context.selectedIK.limb.slice(FINGER_IK_PREFIX.length);
        labelText = t('{finger}・指尖目標球',{finger:fingerLabel(fingerId)});
        mesh = context.fingerIKTargetMeshes[fingerId];
      } else if (context.selectedIK.limb === "body"){
        labelText = t("身體位置（整個角色，控制環顯示於髖部）");
        mesh = context.bodyGizmoProxy;
      } else if (context.selectedIK.role === "trajPoint"){
        const chain = IK_CHAINS[context.selectedIK.limb];
        const idx = context.selectedIK.index || 0;
        labelText = `${t(chain.label)}・${t("軌跡控制點")} #${idx + 1}`;
        mesh = context.trajPointMeshes[context.selectedIK.limb][idx];
        if (!mesh){ deselectJoint(); return; }
      } else {
        const chain = IK_CHAINS[context.selectedIK.limb];
        labelText = `${t(chain.label)}・${context.selectedIK.role === "target" ? t("IK目標球") : t("彎曲極向球")}`;
        mesh = context.selectedIK.role === "target" ? context.ikTargetMeshes[context.selectedIK.limb] : context.ikPoleMeshes[context.selectedIK.limb];
      }
      label.textContent = labelText;
      angles.textContent = `X ${mesh.position.x.toFixed(2)}  Y ${mesh.position.y.toFixed(2)}  Z ${mesh.position.z.toFixed(2)}`;
      if (spaceBtn) spaceBtn.style.display = "none";
      if (snapLabel) snapLabel.style.display = "none";
      if (snapSelect) snapSelect.style.display = "none";
      if (zeroBtn) zeroBtn.textContent = t("重置此球位置");

      // 「位置/朝向」切換按鈕：只有手腳IK的目標球、且該肢體有開啟Effector朝向控制時才顯示，
      // 其他標記球（脊椎/look-at/極向球/身體）旋轉環拖了也沒有對應的求解邏輯讀取，顯示了只會困惑使用者
      const ikModeBtn = document.getElementById("ikModeBtn");
      const isArmLegTarget = IK_CHAINS[context.selectedIK.limb] && context.selectedIK.role === "target";
      if (ikModeBtn){
        if (isArmLegTarget && context.effectorOrientEnabled[context.selectedIK.limb]){
          ikModeBtn.style.display = "";
          ikModeBtn.textContent = t(context.transformControlsIK.getMode() === "translate" ? "切換：位置" : "切換：朝向");
        } else {
          ikModeBtn.style.display = "none";
          context.transformControlsIK.setMode("translate"); // 離開這類標記球時強制切回位置模式，避免殘留旋轉模式影響其他標記球
        }
      }
      return;
    }

    if (spaceBtn) spaceBtn.style.display = "";
    if (snapLabel) snapLabel.style.display = "";
    if (snapSelect) snapSelect.style.display = "";
    if (zeroBtn) zeroBtn.textContent = t("此關節歸零");
    const ikModeBtnHide = document.getElementById("ikModeBtn");
    if (ikModeBtnHide) ikModeBtnHide.style.display = "none";

    if (!context.selectedKey){
      label.textContent = t("未選取");
      angles.textContent = "";
      return;
    }
    label.textContent = jointLabel(context.selectedKey);
    const a = context.poseController.getTarget(context.selectedKey) || [0,0,0];
    angles.textContent = `X ${a[0].toFixed(1)}°  Y ${a[1].toFixed(1)}°  Z ${a[2].toFixed(1)}°`;
  }

  function selectBodyMarker(){
    context.selectedKey = null;
    context.selectedIK = { limb: "body", role: "target" };
    context.transformControls.detach();

    const hipsBone = context.bones["hips"];
    if (hipsBone){
      const hipsPos = new THREE.Vector3();
      hipsBone.getWorldPosition(hipsPos);
      context.bodyGizmoProxy.position.copy(hipsPos);
    } else {
      context.bodyGizmoProxy.position.copy(context.model.position);
    }
    context.bodyProxyLastPos = context.bodyGizmoProxy.position.clone();

    context.transformControlsIK.attach(context.bodyGizmoProxy);
    context.highlightMarkers();
    context.highlightIKMarkers();
    updateSelectedBar();
  }

  function resetBodyTransform(){
    if (!context.defaultModelPosition || !context.defaultModelQuaternion) return;
    context.model.position.copy(context.defaultModelPosition);
    context.model.quaternion.copy(context.defaultModelQuaternion);
    context.model.updateWorldMatrix(true, true);
    // 若目前正選取著身體控制環，重置後重新對齊代理物件到新的Hips世界座標，
    // 避免控制環還停在舊位置、跟reset後的身體視覺脫節
    if (context.selectedIK && context.selectedIK.limb === "body" && context.bodyGizmoProxy){
      const hipsBone = context.bones["hips"];
      const hipsPos = new THREE.Vector3();
      if (hipsBone) hipsBone.getWorldPosition(hipsPos); else hipsPos.copy(context.model.position);
      context.bodyGizmoProxy.position.copy(hipsPos);
      context.bodyProxyLastPos = hipsPos.clone();
    }
  }
  return { allPickableMeshes, setupPickRaycaster, selectJoint, deselectJoint, updateSelectedBar, selectBodyMarker, resetBodyTransform };
}
