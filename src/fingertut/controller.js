import * as THREE from 'three';
import { solveTwoBoneIK } from '../ik/two-bone.js';
import { applyBoneWorldQuatLock } from '../math/quaternions.js';

export const FINGERTUT_DEFAULTS = { height:-2, distance:22, spacing:24 };
export function fingerTutFrame(bones){
  const point=key=>bones[key].getWorldPosition(new THREE.Vector3());
  const center=point('spine2');
  const right=point('lArm').sub(point('rArm')).normalize();
  const up=point('neck').sub(point('spine')).normalize();
  const forward=new THREE.Vector3().crossVectors(right,up).normalize();
  up.crossVectors(forward,right).normalize();
  return {center,right,up,forward};
}

// One-shot posing: leaves FK available and does not add a per-frame solver.
export function createFingerTut(context){
  let active=false, settings={...FINGERTUT_DEFAULTS}, before=null, revision=0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  function ready(){return ['spine','spine2','neck',...['r','l'].flatMap(s=>['Arm','ForeArm','Hand','Middle1','Index1','Pinky1'].map(k=>s+k))].every(k=>context.bones[k]);}
  function canPlace(){
    if(!ready())return false;
    if(context.isGrabbing?.()){
      if(typeof document!=='undefined')document.getElementById('fingerTutStatus').textContent='請先在扶握箱分頁解除雙手扶握，再進行胸前擺位。';return false;
    }
    return true;
  }
  function captureWorkspace(){return {pose:context.pose.snapshotTarget(),rig:context.captureRig(),camera:context.captureCamera()};}
  function restoreWorkspace(state){
    context.restoreRig(state.rig);
    context.pose.restoreTarget(state.pose,{clamp:false});
    context.pose.applyTargetsToBones();
    context.restoreCamera(state.camera);
  }
  function focus(){
    const f=fingerTutFrame(context.bones),box=new THREE.Box3();
    for(const side of ['r','l'])for(const key of ['Hand','Index3','Middle3','Pinky3']){
      const bone=context.bones[side+key];if(bone)box.expandByPoint(bone.getWorldPosition(new THREE.Vector3()));
    }
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    // Desktop tools overlay the lower canvas; keep the hands in the visible area.
    const inset=context.focusInset?.()||0;
    center.addScaledVector(f.up,-context.modelHeight*inset);
    const half=Math.max(size.length()/2,context.modelHeight*.16);
    const distance=context.fitDistance(half,half,1.25);
    const direction=f.forward.clone().addScaledVector(f.right,.22).addScaledVector(f.up,.25).normalize();
    context.restoreCamera({position:center.clone().addScaledVector(direction,distance).toArray(),target:center.toArray(),displayCollapsed:true});
  }
  function place(){
    context.stop();
    context.prepare();
    context.pose.applyTargetsToBones();context.model.updateWorldMatrix(true,true);
    const f=fingerTutFrame(context.bones),h=context.modelHeight;
    const center=f.center.clone().addScaledVector(f.up,settings.height*h/100).addScaledVector(f.forward,settings.distance*h/100);
    for(const side of ['r','l']){
      const sign=side==='r'?-1:1,hand=context.bones[side+'Hand'];
      // Calibrate against this model's palm geometry; do not assume a local bend axis.
      const origin=hand.getWorldPosition(new THREE.Vector3());
      const inverse=hand.getWorldQuaternion(new THREE.Quaternion()).invert();
      const localFinger=context.bones[side+'Middle1'].getWorldPosition(new THREE.Vector3()).sub(origin).applyQuaternion(inverse).normalize();
      const localAcross=context.bones[side+'Index1'].getWorldPosition(new THREE.Vector3()).sub(context.bones[side+'Pinky1'].getWorldPosition(new THREE.Vector3())).applyQuaternion(inverse);
      localAcross.addScaledVector(localFinger,-localAcross.dot(localFinger)).normalize();
      const localNormal=new THREE.Vector3().crossVectors(localAcross,localFinger).normalize();
      const localBasis=new THREE.Matrix4().makeBasis(localAcross,localFinger,localNormal);
      const finger=f.forward.clone().addScaledVector(f.up,-.12).normalize();
      const across=f.right.clone().multiplyScalar(sign);
      const normal=new THREE.Vector3().crossVectors(across,finger).normalize();
      const desired=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,finger,normal).multiply(localBasis.invert()));
      const target=center.clone().addScaledVector(f.right,sign*settings.spacing*h/200);
      const pole=f.center.clone().addScaledVector(f.right,sign*h*.32).addScaledVector(f.up,-h*.18).addScaledVector(f.forward,h*.06);
      solveTwoBoneIK(context.bones[side+'Arm'],context.bones[side+'ForeArm'],hand,target,pole);
      applyBoneWorldQuatLock(hand,desired);
      for(const part of ['Arm','ForeArm','Hand'])context.pose.syncFromBone(side+part,{round:false});
    }
    context.model.updateWorldMatrix(true,true);focus();
  }
  function change(action){context.pushHistory();action();revision++;context.pushHistory();context.save();updateUI();}
  function enter(){
    if(active||!canPlace())return false;
    change(()=>{context.stop();before=captureWorkspace();active=true;place();});return true;
  }
  function exit(){if(active)change(()=>{active=false;});}
  function restore(){if(before)change(()=>{context.stop();restoreWorkspace(before);before=null;active=false;});}
  function adjust(values){
    if(!active||!canPlace())return false;
    const next={...settings};
    for(const [key,lo,hi]of [['height',-12,8],['distance',14,28],['spacing',12,36]]){
      const v=Number(values[key]);if(values[key]!==undefined&&Number.isFinite(v))next[key]=Math.max(lo,Math.min(hi,v));
    }
    if(Object.keys(next).every(k=>next[k]===settings[k]))return false;
    change(()=>{settings=next;place();});return true;
  }
  function updateUI(){
    if(typeof document==='undefined')return;
    const toggle=document.getElementById('fingerTutToggle');if(!toggle)return;
    toggle.setAttribute('aria-pressed',String(active));toggle.textContent=active?'退出 FingerTut':'開啟 FingerTut';
    document.getElementById('fingerTutRestore').disabled=!before;
    for(const key of Object.keys(settings)){
      const input=document.getElementById('fingerTut_'+key);input.value=settings[key];input.disabled=!active;
      document.getElementById('fingerTut_'+key+'Value').textContent=settings[key]+'%';
    }
    document.getElementById('fingerTutRecenter').disabled=!active;
    document.getElementById('fingerTutFocus').disabled=!active;
    document.getElementById('fingerTutStatus').textContent=active?'已擺到胸前，可自由編輯手指。調整位置會重新擺位；退出保留姿勢。':'開啟後自動擺位並切換雙手特寫；保留目前手勢。';
  }
  function bind(){
    document.getElementById('fingerTutToggle').onclick=()=>active?exit():enter();
    document.getElementById('fingerTutRestore').onclick=restore;
    document.getElementById('fingerTutRecenter').onclick=()=>{if(active&&canPlace())change(place);};
    document.getElementById('fingerTutFocus').onclick=()=>{if(ready())focus();};
    for(const key of Object.keys(settings))document.getElementById('fingerTut_'+key).onchange=e=>adjust({[key]:e.target.value});
    updateUI();
  }
  return {enter,exit,restore,adjust,focus,bind,get active(){return active;},
    clear(){active=false;before=null;revision++;updateUI();},
    snapshot:()=>clone({active,settings,before,revision,rig:context.captureRig(),camera:context.captureCamera()}),
    restoreSnapshot(state){
      if(!state)return;
      const changed=revision!==(state.revision||0);
      active=!!state.active;settings={...FINGERTUT_DEFAULTS,...state.settings};before=clone(state.before);revision=state.revision||0;
      // Ordinary pose/timeline undo must not move the camera or release a grab.
      if(changed){context.restoreRig(state.rig);context.restoreCamera(state.camera);}
      updateUI();
    }};
}
