import * as THREE from "three";
import { ALL_JOINT_KEYS, FINGER_IDS } from "../rig/definitions.js";
import { clampNum } from "../math/angles.js";
import { EASINGS } from "../math/easings.js";

// Live host getters preserve shared rig and playback coordination.
export function createCameraController(context){
  const _boundsVec = new THREE.Vector3();

  const _boundsBox = new THREE.Box3();

  const _boundsSize = new THREE.Vector3();

  const _bodyBoundsResult = { halfX:0, halfY:0, halfZ:0, center: new THREE.Vector3() };

  const _handBoundsResult = { halfX:0, halfY:0, halfZ:0, center: new THREE.Vector3() };

  const _handHipsVec = new THREE.Vector3();

  const _handDirVec = new THREE.Vector3();

  const _isoDirVec = new THREE.Vector3();

  function getModelBoundsInfo(skipMatrixUpdate){
    if (!context.model) return null;
    if (!skipMatrixUpdate) context.model.updateWorldMatrix(true, true);
    const v = _boundsVec;
    const box = _boundsBox.makeEmpty();
    let hasPoint = false;
    for (const key of ALL_JOINT_KEYS){
      const bone = context.bones[key];
      if (!bone) continue;
      bone.getWorldPosition(v);
      box.expandByPoint(v);
      hasPoint = true;
    }
    // 指尖 effector（比最後一節手指骨更接近真正指尖）也算進去，張開手指時範圍才夠準
    for (const fingerId of FINGER_IDS){
      const eff = context.fingerEffectorBones[fingerId];
      if (!eff) continue;
      eff.getWorldPosition(v);
      box.expandByPoint(v);
      hasPoint = true;
    }
    if (!hasPoint || box.isEmpty()) return null;
    // 骨骼只是關節中心點，實際外形（頭型、肩寬、腳掌長度等）會再往外一點，
    // 用身高的固定比例抓一個大概的留白，頭頂/腳底再多留一些避免貼邊。
    const pad = context.modelHeight * 0.09;
    box.min.x -= pad;          box.max.x += pad;
    box.min.y -= pad * 0.7;    box.max.y += pad * 1.4; // 頭頂比腳底需要更多留白
    box.min.z -= pad;          box.max.z += pad;
    box.getSize(_boundsSize);
    box.getCenter(_bodyBoundsResult.center);
    _bodyBoundsResult.halfX = _boundsSize.x/2;
    _bodyBoundsResult.halfY = _boundsSize.y/2;
    _bodyBoundsResult.halfZ = _boundsSize.z/2;
    return _bodyBoundsResult;
  }

  function computeFitDistance(halfW, halfH, marginFactor, aspect){
    const vFovHalf = (context.camera.fov * Math.PI / 180) / 2;
    const a = (typeof aspect === "number" && aspect > 0) ? aspect : context.camera.aspect;
    const hFovHalf = Math.atan(Math.tan(vFovHalf) * a);
    const distV = halfH / Math.tan(vFovHalf);
    const distH = halfW / Math.tan(hFovHalf);
    return Math.max(distV, distH) * (marginFactor || 1.45);
  }

  function getHandBoundsInfo(prefix, skipMatrixUpdate){ // prefix："r" 或 "l"
    if (!context.model) return null;
    if (!skipMatrixUpdate) context.model.updateWorldMatrix(true, true);
    const v = _boundsVec;
    const box = _boundsBox.makeEmpty();
    let hasPoint = false;
    const handBone = context.bones[prefix + "Hand"];
    if (handBone){ handBone.getWorldPosition(v); box.expandByPoint(v); hasPoint = true; }
    for (const fingerId of FINGER_IDS){
      if (fingerId[0] !== prefix) continue; // fingerId 例："rThumb"，第一個字元就是側別
      const eff = context.fingerEffectorBones[fingerId];
      if (!eff) continue;
      eff.getWorldPosition(v);
      box.expandByPoint(v);
      hasPoint = true;
    }
    if (!hasPoint || box.isEmpty()) return null;
    const pad = context.modelHeight * 0.04; // 手掌範圍本來就小，留白比例比全身鏡頭小一點即可
    box.min.x -= pad; box.max.x += pad;
    box.min.y -= pad; box.max.y += pad;
    box.min.z -= pad; box.max.z += pad;
    box.getSize(_boundsSize);
    box.getCenter(_handBoundsResult.center);
    _handBoundsResult.halfX = _boundsSize.x/2;
    _handBoundsResult.halfY = _boundsSize.y/2;
    _handBoundsResult.halfZ = _boundsSize.z/2;
    return _handBoundsResult;
  }

  function computeHandCameraPreset(prefix, skipMatrixUpdate){
    const h = context.modelHeight;
    const info = getHandBoundsInfo(prefix, skipMatrixUpdate);
    if (!info){
      // 模型/骨骼尚未就緒時的退回值，理論上跟全身鏡頭一樣不會真的用到
      const midY = h * 0.55;
      const sideSign = prefix === "r" ? -1 : 1;
      return { pos:[sideSign*h*0.35, midY + h*0.05, h*0.9], target:[sideSign*h*0.2, midY, 0] };
    }
    const { halfX, halfY, halfZ, center } = info;
    const hipsBone = context.bones.hips;
    let sideSign = prefix === "r" ? -1 : 1;
    if (hipsBone){
      const hv = _handHipsVec;
      hipsBone.getWorldPosition(hv);
      const diff = center.x - hv.x;
      if (Math.abs(diff) > 1e-4) sideSign = Math.sign(diff);
    }
    const sphereR = Math.max(halfX, halfY, halfZ, h * 0.06);
    const dist = computeFitDistance(sphereR, sphereR, 1.9);
    const dir = _handDirVec.set(sideSign * 0.45, 0.4, 1).normalize().multiplyScalar(dist);
    return {
      pos:[center.x + dir.x, center.y + dir.y, center.z + dir.z],
      target:[center.x, center.y, center.z]
    };
  }

  function fallbackBodyCameraPreset(name){
    const h = context.modelHeight;
    const midY = h * 0.55;
    switch (name){
      case "front": return { pos:[0, h*0.75, h*1.6],  target:[0, midY, 0] };
      case "back":  return { pos:[0, h*0.75, -h*1.6], target:[0, midY, 0] };
      case "left":  return { pos:[-h*1.6, h*0.75, 0], target:[0, midY, 0] };
      case "right": return { pos:[h*1.6, h*0.75, 0],  target:[0, midY, 0] };
      case "top":   return { pos:[0.01, h*2.3, 0.01], target:[0, midY, 0] };
      case "iso":   return { pos:[h*1.15, h*0.95, h*1.15], target:[0, midY, 0] };
    }
    return null;
  }

  function computeBodyCameraPreset(name, info, aspect){
    if (!info) return fallbackBodyCameraPreset(name);
    const { halfX, halfY, halfZ, center } = info;
    const cx = center.x, cy = center.y, cz = center.z;
    const margin = 1.45;
    switch (name){
      // 正面/背面：鏡頭沿 Z 軸看，畫面裡的「寬」對應模型 X 方向、「高」對應模型 Y 方向
      case "front": case "back": {
        const d = computeFitDistance(halfX, halfY, margin, aspect);
        const sign = name === "front" ? 1 : -1;
        return { pos:[cx, cy, cz + sign*d], target:[cx, cy, cz] };
      }
      // 左側/右側：鏡頭沿 X 軸看，畫面裡的「寬」對應模型 Z 方向（厚度）、「高」對應 Y 方向
      case "left": case "right": {
        const d = computeFitDistance(halfZ, halfY, margin, aspect);
        const sign = name === "right" ? 1 : -1;
        return { pos:[cx + sign*d, cy, cz], target:[cx, cy, cz] };
      }
      // 俯視：由上往下看 XZ 平面，兩個方向都可能被裁到，取較大者保證整個人（含手腳張開的範圍）都入鏡
      case "top": {
        const topHalf = Math.max(halfX, halfZ);
        const d = computeFitDistance(topHalf, topHalf, margin, aspect);
        // x/z 給極小偏移避免正上方 gimbal 問題
        return { pos:[cx + 0.01, cy + d, cz + 0.01], target:[cx, cy, cz] };
      }
      // 45° 斜角：用整體包圍球半徑估算，確保從任何斜角看過去都不會裁到
      case "iso": {
        const sphereR = Math.sqrt(halfX*halfX + halfY*halfY + halfZ*halfZ);
        const d = computeFitDistance(sphereR, sphereR, margin, aspect);
        const dir = _isoDirVec.set(1, 0.82, 1).normalize().multiplyScalar(d);
        return { pos:[cx + dir.x, cy + dir.y, cz + dir.z], target:[cx, cy, cz] };
      }
    }
    return null;
  }

  function getCameraPreset(name, aspect, skipMatrixUpdate){
    if (name === "rhand") return computeHandCameraPreset("r", skipMatrixUpdate);
    if (name === "lhand") return computeHandCameraPreset("l", skipMatrixUpdate);
    return computeBodyCameraPreset(name, getModelBoundsInfo(skipMatrixUpdate), aspect);
  }

  function getCameraPresets(){
    if (context.model) context.model.updateWorldMatrix(true, true);
    const info = getModelBoundsInfo(true);
    const out = {};
    for (const name of context.CAMERA_BODY_VIEW_NAMES) out[name] = computeBodyCameraPreset(name, info);
    out.rhand = computeHandCameraPreset("r", true);
    out.lhand = computeHandCameraPreset("l", true);
    return out;
  }

  function goToCameraPreset(name, instant){
    const preset = getCameraPreset(name);
    if (!preset || !context.camera || !context.controls) return;
    const toPos = new THREE.Vector3(preset.pos[0], preset.pos[1], preset.pos[2]);
    const toTarget = new THREE.Vector3(preset.target[0], preset.target[1], preset.target[2]);
    if (instant){
      context.camera.position.copy(toPos);
      context.controls.target.copy(toTarget);
      context.cameraTween = null;
      return;
    }
    context.cameraTween = {
      fromPos: context.camera.position.clone(),
      toPos,
      fromTarget: context.controls.target.clone(),
      toTarget,
      start: performance.now(),
      duration: 500
    };
  }

  function updateCameraTween(now){
    if (!context.cameraTween) return;
    const t = clampNum((now - context.cameraTween.start) / context.cameraTween.duration, 0, 1);
    const et = EASINGS.easeInOutQuad(t);
    context.camera.position.lerpVectors(context.cameraTween.fromPos, context.cameraTween.toPos, et);
    context.controls.target.lerpVectors(context.cameraTween.fromTarget, context.cameraTween.toTarget, et);
    if (t >= 1) context.cameraTween = null;
  }

  function bindCameraUI(){
    const sel = document.getElementById("camSelect");
    if (sel) sel.onchange = () => goToCameraPreset(sel.value);
  }
  return { getModelBoundsInfo, computeFitDistance, getHandBoundsInfo, computeHandCameraPreset, fallbackBodyCameraPreset, computeBodyCameraPreset, getCameraPreset, getCameraPresets, goToCameraPreset, updateCameraTween, bindCameraUI };
}
