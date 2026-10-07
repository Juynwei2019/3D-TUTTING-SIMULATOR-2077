import { cleanGrabFrame, sampleGrabFrame } from './grab-state.js';
import { ALL_JOINT_KEYS, IK_CHAINS } from '../rig/definitions.js';
import { solveTwoBoneIK } from '../ik/two-bone.js';

// Animation owns bound arms only; workspace IK switches are adopted on seek/stop.
export function createGrabTimeline(context){
  let state;
  const hasData=()=>context.frames.some(frame=>frame.grabBox);
  function capture(){
    const snapshot=context.core?.snapshot();
    if(!snapshot||snapshot.revision===0)return null;
    return cleanGrabFrame({...snapshot,version:1,poles:Object.fromEntries(['rArm','lArm'].map(limb=>[limb,context.poles[limb]?.position.toArray()]))});
  }
  function adoptIK(){
    if(state===undefined)return;
    for(const limb of ['rArm','lArm']){
      const active=!!(state?.visible&&state.grabbed[limb]);
      if(context.enabled[limb]!==active)context.setIKEnabled(limb,active);
      if(active)for(const id of context.fingerIds.filter(id=>id[0]===limb[0]))if(context.fingerEnabled[id])context.setFingerIKEnabled(id,false);
      if(state?.poles[limb])context.poles[limb].position.fromArray(state.poles[limb]);
    }
  }
  function solve(){
    const blocked=new Set();
    if(state===undefined)return blocked;
    context.model.updateWorldMatrix(true,true);context.core.updateEachFrame();
    for(const limb of ['rArm','lArm']){
      if(!state?.visible||!state.grabbed[limb])continue;
      const chain=IK_CHAINS[limb];
      if(state.poles[limb])context.poles[limb].position.fromArray(state.poles[limb]);
      solveTwoBoneIK(context.bones[chain.root],context.bones[chain.mid],context.bones[chain.end],context.targets[limb].position,context.poles[limb].position);
      for(const key of [chain.shoulder,chain.root,chain.mid,chain.end])if(key)blocked.add(key);
    }
    context.core.applyPalmOrientation();context.model.updateWorldMatrix(true,true);
    if(!context.playing)for(const key of blocked)context.pose.syncFromBone(key,{round:false});
    return blocked;
  }
  function syncPose(){for(const key of ALL_JOINT_KEYS)context.pose.syncFromBone(key,{round:false});}
  function apply(a,b,eased,progress=eased){
    if(!context.core||!hasData()){state=undefined;return new Set();}
    state=sampleGrabFrame(a.grabBox,b.grabBox,eased,progress);
    context.core.applyTimelineState(state);
    if(!context.playing)adoptIK();
    const blocked=solve();
    if(!context.playing)syncPose();
    return blocked;
  }
  function finish(){if(state===undefined)return;adoptIK();solve();syncPose();}
  return {capture,hasData,apply,solve,finish,reset(){state=undefined;}};
}
