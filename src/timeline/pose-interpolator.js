import * as THREE from "three";
import { ALL_JOINT_KEYS } from "../rig/definitions.js";
import { eulerToQuat } from "../math/quaternions.js";

// Live host getters preserve shared rig and playback coordination.
export function createPoseInterpolator(context){
  const _kfQA = new THREE.Quaternion();

  const _kfQB = new THREE.Quaternion();

  const _kfQResult = new THREE.Quaternion();

  const _kfBodyPosA = new THREE.Vector3();

  const _kfBodyPosB = new THREE.Vector3();

  const _kfBodyQA = new THREE.Quaternion();

  const _kfBodyQB = new THREE.Quaternion();

  function applyKeyframeFramePose(frameA, frameB, et, progress=et){
    // 這兩個limb的root/mid骨骼改由軌跡即時IK接管，下面的一般角度slerp迴圈要跳過它們
    const { overrideLimbs, overrideKeys } = context.collectTrajOverrideKeys(frameA, frameB);

    for (const key of ALL_JOINT_KEYS){
      if (overrideKeys.has(key)) continue;
      const bone = context.bones[key];
      if (!bone || !context.restQuat[key]) continue;
      const anglesA = frameA.angles[key] || [0,0,0];
      const anglesB = frameB.angles[key] || anglesA;
      // qa/qb 兩個結果需要同時存在（下面slerp要同時讀兩者），所以各自用獨立的暫存Quaternion，
      // 不能共用同一個（會互相覆寫）；qResult 再用第三個暫存物件裝 slerp 後的結果。
      eulerToQuat(anglesA, _kfQA);
      eulerToQuat(anglesB, _kfQB);
      const q = _kfQResult.copy(_kfQA).slerp(_kfQB, et); // 四元數球面線性插值：最短路徑、依 Easing 曲線變速
      bone.quaternion.copy(context.restQuat[key]).multiply(q);
    }

    // 身體位置/朝向內插：舊拍點沒有 body 欄位時容錯跳過，身體維持原地不動
    if (frameA.body && frameB.body){
      _kfBodyPosA.fromArray(frameA.body.position);
      _kfBodyPosB.fromArray(frameB.body.position);
      context.model.position.lerpVectors(_kfBodyPosA, _kfBodyPosB, et);
      _kfBodyQA.fromArray(frameA.body.quaternion);
      _kfBodyQB.fromArray(frameB.body.quaternion);
      context.model.quaternion.copy(_kfBodyQA).slerp(_kfBodyQB, et);
    }

    // ⚠️ 關鍵坑：three.js只在renderer.render()才會重算matrixWorld，上面剛套用的軀幹/身體姿勢
    // 這時候读 bone.getWorldPosition() 拿到的還是「上一幀」的舊值。若不在這裡手動刷新一次，
    // 底下算軌跡目標點用的root世界座標會跟這一幀的軀幹動作對不上，產生一幀的滯後感。
    context.model.updateMatrixWorld(true);

    if (overrideLimbs.length > 0){
      context.applyTrajOverridesDuringPlayback(overrideLimbs, frameA, frameB, et);
    }

    if(frameA.waveBake)context.applyBakedWaveFeet(frameA);
    const grabKeys=context.applyGrabTimelineFrame?.(frameA,frameB,et,progress);
    for(const key of grabKeys||[])overrideKeys.add(key);

    if(frameA.waveBake)return new Set(ALL_JOINT_KEYS);
    return overrideKeys; // 供呼叫端疊加律動時避開這幾個被軌跡IK接管的關節（見 applyGroove）
  }
  return { applyKeyframeFramePose };
}
