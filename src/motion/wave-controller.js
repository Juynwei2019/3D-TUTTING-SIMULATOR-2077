import { t as tr, liveText } from "../i18n/index.js";
import { ALL_JOINT_KEYS, FINGER_IDS } from "../rig/definitions.js";
import * as THREE from "three";
import { solveTwoBoneIK } from "../ik/two-bone.js";
import { eulerToQuat, applyBoneWorldQuatLock } from "../math/quaternions.js";
import { R } from "../math/angles.js";

// Live host getters preserve shared rig and playback coordination.
export function createWaveController(context){
  function waveIsRelay(c){return c.route==='leftBody'||c.route==='rightBody';}

  function waveHasBody(c){return c.route==='body'||waveIsRelay(c);}

  function waveBounds(c){
    const a=context.WAVE_ROUTE_NODES.find(n=>n[0]===c.startNode)||context.WAVE_ROUTE_NODES[0];
    const b=context.WAVE_ROUTE_NODES.find(n=>n[0]===c.endNode)||context.WAVE_ROUTE_NODES[7];
    return {start:a[1],end:b[1],min:Math.min(a[1],b[1]),max:Math.max(a[1],b[1]),sign:b[1]>=a[1]?1:-1};
  }

  function waveLocalIndex(c,side,offset){
    const global=side==='l'?offset:8-offset;
    if(c.route!=='custom')return c.route==='both'?global:offset;
    const r=waveBounds(c);return global<r.min-1e-8||global>r.max+1e-8?null:(global-r.start)*r.sign;
  }

  function waveSides(c){
    if(c.route==='leftBody')return ['l'];
    if(c.route==='rightBody')return ['r'];
    if(c.route==='body')return [];
    if(c.route==='custom'){const b=waveBounds(c);return ['l','r'].filter(side=>context.WAVE_ROUTE_NODES.some(n=>n[0][0]===side&&n[1]>=b.min&&n[1]<=b.max));}
    return c.route==='left'?['l']:c.route==='right'?['r']:['l','r'];
  }

  function waveRouteLength(c){if(waveIsRelay(c))return 7.6;if(c.route==='body')return 3;if(c.route==='custom'){const b=waveBounds(c);return b.max-b.min;}return c.route==='both'||!c.route?8:3.6;}

  function waveNodes(c){
    if(waveIsRelay(c)){const side=c.route==='leftBody'?'左':'右';return [[0,side+'手指'],[.7,side+'手腕'],[1.6,side+'手肘'],[3.6,side+'肩'],[4.6,'胸口'],[5.6,'上腰'],[6.6,'下腰'],[7.6,'骨盆']];}
    if(c.route==='body')return [[0,'胸口'],[1,'上腰'],[2,'下腰'],[3,'骨盆']];
    if(c.route==='custom'){const b=waveBounds(c);return context.WAVE_ROUTE_NODES.filter(n=>n[1]>=b.min&&n[1]<=b.max).map(n=>[(n[1]-b.start)*b.sign,n[2]]).sort((a,b)=>a[0]-b[0]);}
    const left=[[0,'左手指'],[.7,'左手腕'],[1.6,'左手肘'],[3.6,'左肩']];
    if(c.route==='left')return left;
    if(c.route==='right')return left.map(([p,n])=>[p,n.replace('左','右')]);
    return [...left,[4.4,'右肩'],[6.4,'右手肘'],[7.3,'右手腕'],[8,'右手指']];
  }

  function updateWaveRouteUI(position){
    const c=context.waveRun?.config||context.waveConfig,nodes=waveNodes(c);
    const isBody=c.route==='body';
    document.getElementById('waveRelayNote').hidden=!waveIsRelay(c);
    document.getElementById('waveBodySettings').hidden=!waveHasBody(c);
    document.getElementById('waveArmSettings').hidden=isBody;
    document.getElementById('waveCompensationSection').hidden=isBody;
    document.getElementById('waveCustomRoute').hidden=c.route!=='custom';
    for(const [id,key]of [['waveStartNode','startNode'],['waveEndNode','endNode']]){const el=document.getElementById(id);el.value=c[key];el.disabled=!!context.waveRun;}
    liveText(document.getElementById('waveRouteHint'), ()=>tr("正向：")+nodes.map(n=>tr(n[1])).join(' → '));
    const el=document.getElementById('waveLocation');
    if(!context.waveRun){liveText(el, ()=>tr("尚未預覽"));return;}
    const p=position??wavePosition(context.waveRun.phase,c);
    const locationLabel=()=>tr(c.mode==='bipolar'?'峰谷中心':'波峰');
    if(p<0){liveText(el, ()=>locationLabel()+tr("：起點外側"));return;}
    if(p>waveRouteLength(c)){liveText(el, ()=>locationLabel()+tr("：終點外側"));return;}
    const nearest=nodes.reduce((best,n)=>Math.abs(n[0]-p)<Math.abs(best[0]-p)?n:best);
    liveText(el, ()=>locationLabel()+tr("附近：")+tr(nearest[1])+(!c.fingers&&nearest[1].includes('手指')?tr("（手指未參與）"):''));
  }

  function waveDurationSeconds(config,tempo){return config.beats*60/(tempo*config.speed);}

  function updateWaveTiming(){
    const c=context.waveRun?context.waveRun.config:context.waveConfig,el=document.getElementById('waveTiming');if(!el)return;
    const seconds=waveDurationSeconds(c,context.bpm);
    const text=()=>'BPM '+context.bpm+tr(" · 單程 ")+seconds.toFixed(2)+tr(" 秒（")+(c.beats/c.speed).toFixed(2)+tr(" 拍）")+(c.direction==='pingpong'?tr(" · 完整往返 ")+(seconds*2).toFixed(2)+tr(" 秒"):'');
    liveText(el, text);
  }

  function setWaveSpeed(value,now=performance.now()){
    // Advance elapsed time at the OLD speed first; never rescale accumulated phase.
    if(context.waveRun)tickWave(now);
    context.waveConfig=cleanWave({...context.waveConfig,speed:value});
    if(context.waveRun)context.waveRun.config.speed=context.waveConfig.speed;
    waveUI();context.scheduleAutoSave();
  }

  function seekWave(percent){
    if(!context.waveRun)startWave();
    const r=context.waveRun;if(!r)return;
    const u=Math.max(0,Math.min(1,Number(percent)/100));if(!Number.isFinite(u))return;
    const reverse=r.config.direction==='rl'||(r.config.direction==='pingpong'&&Math.floor(r.phase)%2===1);
    const pass=r.config.direction==='pingpong'&&reverse?1:0;
    r.phase=pass+Math.min(1-1e-9,reverse?1-u:u);r.playing=false;r.finished=false;r.last=performance.now();
    tickWave(r.last);waveUI(()=>tr("波峰已停格 · 可調整各部位幅度或繼續播放"));
  }

  function cleanWave(raw={}){
    const v=raw&&typeof raw==='object'?raw:{};
    const startNode=context.WAVE_ROUTE_NODES.some(n=>n[0]===v.startNode)?v.startNode:'lFinger';
    let endNode=context.WAVE_ROUTE_NODES.some(n=>n[0]===v.endNode)?v.endNode:'rFinger';
    if(endNode===startNode)endNode=context.WAVE_ROUTE_NODES[(context.WAVE_ROUTE_NODES.findIndex(n=>n[0]===startNode)+1)%8][0];
    const num=(k,lo,hi)=>Number.isFinite(Number(v[k]))?Math.min(hi,Math.max(lo,Number(v[k]))):context.WAVE_DEFAULT[k];
    return {mode:v.mode==='bipolar'?'bipolar':'unipolar',polarity:v.polarity==='negative'?'negative':'positive',shape:['cosine','gaussian','triangle','trapezoid'].includes(v.shape)?v.shape:'cosine',bodyChestGain:num('bodyChestGain',0,200),bodyWaistGain:num('bodyWaistGain',0,200),bodyHipGain:num('bodyHipGain',0,200),startNode,endNode,route:['both','left','right','custom','body','leftBody','rightBody'].includes(v.route)?v.route:'both',direction:['lr','rl','pingpong'].includes(v.direction)?v.direction:'lr',repeat:v.repeat==='once'?'once':'loop',amplitude:num('amplitude',0,60),width:num('width',.6,3),beats:num('beats',1,32),fingers:typeof v.fingers==='boolean'?v.fingers:true,fingerGain:num('fingerGain',0,200),wristGain:num('wristGain',0,200),elbowGain:num('elbowGain',0,200),shoulderGain:num('shoulderGain',0,200),compensation:num('compensation',0,100),speed:v.speed==null||v.speed===''?1:num('speed',.25,4)};
  }

  function wavePulse(index,position,width,shape='cosine'){
    if(!Number.isFinite(width)||width<=0)return 0;
    const d=Math.abs(index-position)/width;
    if(!Number.isFinite(d)||d>=1)return 0;
    if(shape==='triangle')return 1-d;
    if(shape==='trapezoid')return d<=.35?1:(1-d)/.65;
    if(shape==='gaussian'){
      const edge=Math.exp(-4.5);
      return (Math.exp(-4.5*d*d)-edge)/(1-edge);
    }
    return .5+.5*Math.cos(Math.PI*d);
  }

  function waveValue(index,position,c,phase){
    if(c.mode!=='bipolar')return wavePulse(index,position,c.width,c.shape);
    if(!Number.isFinite(c.width)||c.width<=0)return 0;
    const reverse=c.direction==='rl'||(c.direction==='pingpong'&&Math.floor(phase)%2===1);
    const d=(index-position)*(reverse?-1:1)/c.width;
    return wavePulse(d,.5,.5,c.shape)-wavePulse(d,-.5,.5,c.shape);
  }

  function wavePosition(phase,c){
    const pass=Math.floor(phase),u=phase-pass;
    const reverse=c.direction==='rl'||(c.direction==='pingpong'&&pass%2===1);
    const length=waveRouteLength(c);const x=-c.width+u*(length+2*c.width);return reverse?length-x:x;
  }

  function waveConflict(){
    if(context.kfPlaying)return '請先停止時間軸播放';
    if(context.groovePreviewEnabled)return '請先停止原有律動預覽';
    if(context.laPathRun)return '請先停止 LookAt 軌跡預覽';
    if(waveHasBody(context.waveRun?.config||context.waveConfig)){
      if(context.footPlantEnabled)return 'Body Wave：請先關閉腳底固定';
      if(Object.values(context.ikEnabled).some(Boolean)||FINGER_IDS.some(id=>context.fingerIKEnabled[id]))return 'Body Wave：請先關閉手腳及手指 IK';
      if(Object.values(context.lookAtEnabled).some(Boolean))return 'Body Wave：請先關閉 LookAt';
    }
    const sides=waveSides(context.waveRun?.config||context.waveConfig);
    if(sides.some(side=>context.ikEnabled[side+'Arm']))return '請先關閉路線內的手臂 IK';
    if(sides.some(side=>context.lookAtEnabled[side+'Hand']))return '請先關閉路線內的手掌 LookAt';
    if(FINGER_IDS.some(id=>sides.includes(id[0])&&context.fingerIKEnabled[id]))return '請先關閉路線內的手指 IK';
    if(context.spineIKEnabled||context.lookAtEnabled.chest)return '請先關閉脊椎 IK／胸口 LookAt';
    return '';
  }

  function waveUI(message){
    updateWaveRouteUI();
    document.getElementById('waveSpeed').value=context.waveConfig.speed;
    liveText(document.getElementById('waveSpeedValue'), ()=>context.waveConfig.speed.toFixed(2)+'×');
    updateWaveTiming();
    const fields={Route:'route',Direction:'direction',Repeat:'repeat',Amplitude:'amplitude',Width:'width',Beats:'beats',Fingers:'fingers'};
    fields.Shape='shape';
    fields.Polarity='polarity';
    fields.Mode='mode';
    liveText(document.getElementById('waveShapeHint'), ()=>tr(context.WAVE_SHAPE_HINTS[context.waveConfig.shape])+tr(" 套用整條所選路線；切換波形前請先停止預覽。"));
    for(const [id,key]of Object.entries(fields)){const e=document.getElementById('wave'+id);if(!e)continue;if(key==='fingers')e.checked=context.waveConfig[key];else e.value=context.waveConfig[key];e.disabled=!!context.waveRun;}
    document.getElementById('waveFingers').disabled=!!context.waveRun||context.waveConfig.route==='body';
    for(const [id,key]of Object.entries(context.WAVE_GAIN_FIELDS)){document.getElementById('wave'+id).value=context.waveConfig[key];liveText(document.getElementById('wave'+id+'Value'), ()=>context.waveConfig[key]+'%');}
    document.getElementById('wavePlay').disabled=!!context.waveRun?.playing;
    liveText(document.getElementById('wavePlay'), ()=>context.waveRun?(context.waveRun.finished?tr("▶ 重播"):tr("▶ 繼續")):tr("▶ Waving 預覽"));
    document.getElementById('wavePause').disabled=!context.waveRun?.playing;
    document.getElementById('waveStop').disabled=!context.waveRun;
    if(message)liveText(document.getElementById('waveStatus'), ()=>typeof message==='function'?message():tr(message));
  }

  function captureWaveFeet(){
    const feet=[];
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(context.model.getWorldQuaternion(new THREE.Quaternion()));
    for(const side of ['l','r']){
      const keys=[side+'UpLeg',side+'Leg',side+'Foot'];
      if(keys.some(k=>!context.bones[k]))return null;
      const [root,mid,end]=keys.map(k=>context.bones[k]);
      const a=root.getWorldPosition(new THREE.Vector3()),b=mid.getWorldPosition(new THREE.Vector3()),c=end.getWorldPosition(new THREE.Vector3());
      const upper=a.distanceTo(b),lower=b.distanceTo(c);
      if(upper<.001||lower<.001)return null;
      const axis=c.clone().sub(a).normalize();
      const bend=b.clone().sub(a).addScaledVector(axis,-b.clone().sub(a).dot(axis));
      if(bend.lengthSq()<1e-7)bend.copy(forward);
      feet.push({keys,position:c,quaternion:end.getWorldQuaternion(new THREE.Quaternion()),pole:b.clone().add(bend.normalize().multiplyScalar(upper)),min:Math.abs(upper-lower)+.0002,max:upper+lower-.0002});
    }
    return {feet,position:context.model.position.clone()};
  }

  function solveWaveFeet(r,onFailure=message=>stopWave(message)){
    const g=r.ground;if(!g)return;
    context.model.updateMatrixWorld(true);
    const offsets=g.feet.map(f=>context.bones[f.keys[0]].getWorldPosition(new THREE.Vector3()).sub(context.model.position));
    const candidate=g.position.clone();
    // Keep both ankle targets reachable, with a small bend reserve at full extension.
    for(let pass=0;pass<100;pass++){
      let error=0;
      g.feet.forEach((f,i)=>{
        const d=candidate.clone().add(offsets[i]).sub(f.position),length=d.length();
        const wanted=Math.max(f.min,Math.min(f.max,length));error=Math.max(error,Math.abs(length-wanted));
        if(Math.abs(length-wanted)<1e-8)return;
        if(length<1e-9)d.set(0,1,0);else d.divideScalar(length);
        candidate.copy(f.position).addScaledVector(d,wanted).sub(offsets[i]);
      });
      if(error<1e-8)break;
    }
    const feasible=g.feet.every((f,i)=>{const d=candidate.clone().add(offsets[i]).distanceTo(f.position);return d>=f.min-1e-6&&d<=f.max+1e-6;});
    if(!feasible){onFailure('已停止：目前幅度無法維持雙腳固定，請降低骨盆幅度');return false;}
    context.model.position.copy(candidate);context.model.updateMatrixWorld(true);
    for(const f of g.feet){solveTwoBoneIK(...f.keys.map(k=>context.bones[k]),f.position,f.pole);applyBoneWorldQuatLock(context.bones[f.keys[2]],f.quaternion);}
    context.model.updateMatrixWorld(true);
    if(g.feet.some(f=>context.bones[f.keys[2]].getWorldPosition(new THREE.Vector3()).distanceTo(f.position)>.001)){onFailure('已停止：腿部無法維持腳掌位置，請降低幅度');return false;}
    return true;
  }

  function stopWave(message='已停止，回到基礎姿勢'){
    const r=context.waveRun;context.waveRun=null;
    if(r?.ground)context.model.position.copy(r.ground.position);
    if(r){for(const [k,v]of Object.entries(r.base)){if(!context.bones[k])continue;context.bones[k].quaternion.copy(v.q);context.poseController.setJointState(k, v.target, v.current);}context.model?.updateMatrixWorld(true);}
    if(document.getElementById('wavePlay')){document.getElementById('waveProgress').value=0;document.getElementById('waveSeek').value=0;liveText(document.getElementById('waveSeekValue'), ()=>'0%');waveUI(message);}
  }

  function startWave(){
    context.tgCancelPreview();
    context.waveTrackActive=false;
    const conflict=waveConflict();if(conflict){waveUI(conflict);return;}
    if(!context.model||waveSides(context.waveConfig).some(side=>!context.bones[side+'Hand'])){waveUI(()=>tr("請等待角色載入"));return;}
    if(waveHasBody(context.waveConfig)&&['hips','spine','spine1','spine2'].some(k=>!context.bones[k]||!context.restQuat[k])){waveUI(()=>tr("Body Wave 需要骨盆及完整三節脊椎骨骼"));return;}
    if(context.waveRun){if(context.waveRun.finished){context.waveRun.phase=0;context.waveRun.finished=false;}context.waveRun.playing=true;context.waveRun.last=performance.now();waveUI(()=>tr("播放中"));return;}
    context.deselectJoint();context.model.updateMatrixWorld(true);
    const ground=waveHasBody(context.waveConfig)?captureWaveFeet():null;
    if(waveHasBody(context.waveConfig)&&!ground){waveUI(()=>tr("Body Wave 腳掌固定需要完整雙腿骨骼"));return;}
    const base={},entries=[];
    // Capture local bend axes from current bone directions and character up.
    const up=new THREE.Vector3(0,1,0).applyQuaternion(context.model.getWorldQuaternion(new THREE.Quaternion()));
    if(waveHasBody(context.waveConfig)){
      // Capture sagittal pitch axes in local coordinates; solve parent before child.
      const pitch=new THREE.Vector3(1,0,0).applyQuaternion(context.model.getWorldQuaternion(new THREE.Quaternion()));
      for(const [k,index,gain,group]of [['hips',3,-.30,'bodyHipGain'],['spine',2,.45,'bodyWaistGain'],['spine1',1,.45,'bodyWaistGain'],['spine2',0,.55,'bodyChestGain']]){
        const axis=pitch.clone().applyQuaternion(context.bones[k].getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
        entries.push({k,index:index+(waveIsRelay(context.waveConfig)?4.6:0),gain,group,axis});
      }
    }
    for(const side of waveSides(context.waveConfig)){
      const stages=[['Shoulder','Arm',3.6,.35],['Arm','ForeArm',2.6,.65],['ForeArm','Hand',1.6,1],['Hand','Middle1',.7,1.15]];
      for(const [part,next,offset,gain]of stages){
        const k=side+part,b=context.bones[k],n=context.bones[side+next];if(!b||!n)continue;
        const d=n.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
        const axis=new THREE.Vector3().crossVectors(d,up);
        if(axis.lengthSq()<1e-8)axis.set(0,0,1);axis.normalize().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
        const index=waveLocalIndex(context.waveConfig,side,offset);if(index===null)continue;
        entries.push({k,index,gain,axis,group:part==='Hand'?'wristGain':part==='ForeArm'?'elbowGain':'shoulderGain'});
      }
      if(context.waveConfig.fingers&&waveLocalIndex(context.waveConfig,side,0)!==null)for(const finger of ['Index','Middle','Ring','Pinky'])for(let j=1;j<=3;j++){
        const k=side+finger+j,b=context.bones[k];if(!b)continue;
        const n=b.children.find(child=>child.isBone);if(!n)continue;
        const d=n.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
        const axis=new THREE.Vector3().crossVectors(d,up);if(axis.lengthSq()<1e-8)continue;
        axis.normalize().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
        entries.push({k,index:waveLocalIndex(context.waveConfig,side,0),gain:.35,axis,group:'fingerGain'});
      }
    }
    for(const {k}of entries)base[k]={parentInModel:context.model.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(context.bones[k].parent.getWorldQuaternion(new THREE.Quaternion())),q:context.bones[k].quaternion.clone(),target:(context.poseController.getTarget(k)||[0,0,0]).slice(),current:(context.poseController.getCurrent(k)||[0,0,0]).slice()};
    if(waveIsRelay(context.waveConfig))for(const {k}of entries)if(k[0]==='l'||k[0]==='r')base[k].parentInChest=context.bones.spine2.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(context.bones[k].parent.getWorldQuaternion(new THREE.Quaternion()));
    if(ground)for(const f of ground.feet)for(const k of f.keys)base[k]={q:context.bones[k].quaternion.clone(),target:(context.poseController.getTarget(k)||[0,0,0]).slice(),current:(context.poseController.getCurrent(k)||[0,0,0]).slice()};
    context.waveRun={base,entries,ground,config:{...context.waveConfig},phase:0,last:performance.now(),playing:true};waveUI(()=>tr("播放中 · 波峰沿所選路線傳遞"));
  }

  function tickWave(now){
    updateWaveTiming();
    const r=context.waveRun;if(!r)return;
    const conflict=waveConflict();if(conflict){stopWave(()=>tr("預覽停止：")+tr(conflict));return;}
    if(r.playing){r.phase+=Math.max(0,now-r.last)*context.bpm*r.config.speed/(60000*r.config.beats);}
    r.last=now;
    const end=r.config.direction==='pingpong'?2:1;
    if(r.config.repeat==='once'&&r.phase>=end){r.phase=end;r.playing=false;r.finished=true;waveUI(()=>tr("單次完成 · 可重播或停止還原"));}
    const pos=wavePosition(r.phase,r.config);
    if(r.ground){
      context.model.position.copy(r.ground.position);
      for(const f of r.ground.feet)for(const k of f.keys)context.bones[k].quaternion.copy(r.base[k].q);
      context.model.updateMatrixWorld(true);
    }
    for(const e of r.entries){
      const b=context.bones[e.k];const q=r.base[e.k].q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(e.axis,THREE.MathUtils.degToRad((r.config.polarity==='negative'?-1:1)*r.config.amplitude*e.gain*(r.config[e.group]/100)*waveValue(e.index,pos,r.config,r.phase))));
      // Solve proximal to distal. Preserve own wave, cancel inherited orientation only.
      if(r.config.compensation>0&&(e.group==='elbowGain'||e.group==='wristGain')){
        const referenceParent=r.base[e.k].parentInChest
          ?context.bones.spine2.getWorldQuaternion(new THREE.Quaternion()).multiply(r.base[e.k].parentInChest)
          :context.model.getWorldQuaternion(new THREE.Quaternion()).multiply(r.base[e.k].parentInModel);
        const desiredWorld=referenceParent.multiply(q);
        const corrected=b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desiredWorld);
        q.slerp(corrected,r.config.compensation/100).normalize();
      }
      // Respect existing per-joint limits, without writing preview back to saved targets.
      const rel=context.restQuat[e.k].clone().invert().multiply(q),eu=new THREE.Euler().setFromQuaternion(rel,'XYZ');
      const a=context.clampJointAngles(e.k,[R(eu.x),R(eu.y),R(eu.z)]);
      b.quaternion.copy(context.restQuat[e.k]).multiply(eulerToQuat(a));
      b.updateWorldMatrix(true,true);
    }
    context.model.updateMatrixWorld(true);
    solveWaveFeet(r);if(context.waveRun!==r)return;
    document.getElementById('waveProgress').value=r.finished?1:r.phase%1;
    const percent=Math.max(0,Math.min(100,(pos+r.config.width)/(waveRouteLength(r.config)+2*r.config.width)*100));
    document.getElementById('waveSeek').value=percent;
    liveText(document.getElementById('waveSeekValue'), ()=>percent.toFixed(1)+'%');
    updateWaveRouteUI(pos);
  }

  function captureWaveTimelinePose(){
    const angles={};
    for(const k of ALL_JOINT_KEYS){
      if(context.bones[k]&&context.restQuat[k]){
        const e=new THREE.Euler().setFromQuaternion(context.restQuat[k].clone().invert().multiply(context.bones[k].quaternion),'XYZ');
        angles[k]=[R(e.x),R(e.y),R(e.z)];
      }else angles[k]=(context.poseController.getTarget(k)||[0,0,0]).slice();
    }
    return {angles,body:context.snapshotBodyTransform()};
  }

  function waveBakePlan(config,beats,cycles){
    beats=Number(beats);cycles=Number(cycles);
    if(!Number.isFinite(beats)||beats<.25||beats>64||!Number.isInteger(cycles)||cycles<1||cycles>8)
      throw new Error('單程拍數需介於 0.25～64，次數需為 1～8 的整數');
    const passes=(config.direction==='pingpong'?2:1)*cycles;
    const samplesPerPass=Math.ceil(Math.max(32,(waveRouteLength(config)+2*config.width)/config.width*(config.mode==='bipolar'?16:8)));
    if(samplesPerPass*passes>4096)throw new Error('拍點過多，請減少次數或增加波浪寬度');
    return {passes,samplesPerPass,count:samplesPerPass*passes,totalBeats:beats*passes,stepBeats:beats/samplesPerPass};
  }

  function bakeWaveToTimeline(updateSelected=false){
    updateSelected=updateSelected===true;
    const replacing=updateSelected?context.waveClips.find(c=>c.id===context.waveClipSelected):null;
    const status=document.getElementById('waveBakeStatus');
    const say=message=>liveText(status, ()=>typeof message==='function'?message():tr(message));
    if(context.kfPlaying){say(()=>tr("請先停止時間軸播放"));return;}
    if(context.waveRun){say(()=>tr("請先停止 Waving 預覽，再加入時間軸"));return;}
    const conflict=waveConflict();if(conflict){say(conflict);return;}
    if(!context.model){say(()=>tr("請等待角色載入"));return;}
    if(!updateSelected&&context.waveClips.length>=128){say(()=>tr("最多 128 個 WAVING 區塊"));return;}
    if(updateSelected&&!replacing){say(()=>tr("請先選取 WAVING 區塊"));return;}
    const selected=!replacing&&document.getElementById('waveBakePlacement').value==='selected';
    if(selected&&!(context.kfEditingIndex>=0&&context.kfEditingIndex<context.keyframes.length)){say(()=>tr("請先在時間軸選取一個拍點"));return;}
    let plan;
    try{plan=waveBakePlan(context.waveConfig,document.getElementById('waveBakeBeats').value,document.getElementById('waveBakeCycles').value);}
    catch(e){say(e.message);return;}
    const index=context.keyframes.length?(selected?context.kfEditingIndex:context.keyframes.length-1):-1;
    const startBeat=replacing?replacing.start:(selected?context.keyframeStartBeat(index):Math.max(context.beatGridPoseTotalBeats(),context.waveTrackEnd()));
    if(context.waveClipOverlap(startBeat,plan.totalBeats,replacing?.id)){say(()=>tr("此位置已有 WAVING 區塊，請移動原區塊或選擇尾端加入"));return;}
    const oldFrame=index>=0?JSON.parse(JSON.stringify(context.keyframes[index])):null;
    const saved={body:context.snapshotBodyTransform(),bones:{},...context.poseController.snapshotState()};
    for(const k of ALL_JOINT_KEYS)if(context.bones[k])saved.bones[k]=context.bones[k].quaternion.clone();
    const frames=[];let error=null,clipKeys=[],clipFeet=null;
    const savedKfIndex=context.kfIndex;
    try{
      if(context.keyframes.length)context.waveBaseAtBeat(startBeat);
      startWave();const run=context.waveRun;
      if(!run)throw new Error(document.getElementById('waveStatus').textContent||tr("無法建立 Waving"));
      run.playing=false;run.config.repeat='loop';
      clipKeys=Object.keys(run.base);
      const metadata={id:'wave_'+Date.now()+'_'+Math.random().toString(36).slice(2),config:cleanWave(context.waveConfig)};
      if(run.ground)metadata.feet=run.ground.feet.map(f=>({keys:f.keys.slice(),position:f.position.toArray(),quaternion:f.quaternion.toArray(),pole:f.pole.toArray(),min:f.min,max:f.max}));
      clipFeet=metadata.feet||null;
      for(let i=0;i<=plan.count;i++){
        run.phase=i/plan.samplesPerPass;tickWave(performance.now());
        if(context.waveRun!==run)throw new Error(document.getElementById('waveStatus').textContent||tr("腳掌固定失敗"));
        const frame=captureWaveTimelinePose();
        frame.beats=plan.stepBeats;frame.easing='linear';
        if(i<plan.count)frame.waveBake=metadata;
        if(i===0)frame.label=oldFrame?.label||'🌊 Waving';
        frames.push(frame);
      }
    }catch(e){error=e;}
    finally{
      stopWave();context.applyBodyTransform(saved.body);
      for(const [k,q]of Object.entries(saved.bones))context.bones[k].quaternion.copy(q);
      context.poseController.restoreState(saved);
      context.model.updateMatrixWorld(true);context.kfIndex=savedKfIndex;
    }
    if(error){say(()=>tr("未加入：")+error.message);return;}
    const clip={id:replacing?.id||context.makeLibId(),start:startBeat,beats:plan.totalBeats,
      cycles:Number(document.getElementById('waveBakeCycles').value),config:cleanWave(context.waveConfig),
      fadeIn:Math.min(replacing?.fadeIn||.5,plan.totalBeats/2),fadeOut:Math.min(replacing?.fadeOut||.5,plan.totalBeats/2),
      keys:clipKeys,feet:clipFeet,frames:frames.map(f=>({angles:f.angles,body:f.body}))};
    context.pushHistory();
    if(!context.keyframes.length)context.keyframes.push({angles:context.waveClone(frames[0].angles),body:context.waveClone(frames[0].body),beats:1,easing:'linear',label:'Waving 基礎姿勢'});
    if(replacing)context.waveClips[context.waveClips.indexOf(replacing)]=clip;else context.waveClips.push(clip);
    context.waveClips.sort((a,b)=>a.start-b.start);context.waveClipSelected=clip.id;
    context.kfEditingIndex=-1;context.kfMultiSelected.clear();context.grooveMultiSelected.clear();context.grooveSeqSelectedIndex=-1;
    context.renderKeyframeChips();context.pushHistory();context.scheduleAutoSave();
    context.waveTrackMessage(()=>(replacing?tr("已更新"):tr("已加入"))+tr(" WAVING 區塊：")+plan.totalBeats+tr(" 拍，起點 Beat ")+(startBeat+1)+'。');
  }

  function applyBakedWaveFeet(frame){
    const raw=frame.waveBake?.feet;
    if(!Array.isArray(raw)||raw.length!==2)return;
    const feet=[];
    for(const f of raw){
      if(!Array.isArray(f.keys)||f.keys.length!==3||!f.keys.every(k=>context.bones[k]))return;
      if(![f.position,f.pole].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))||!Array.isArray(f.quaternion)||f.quaternion.length!==4||!f.quaternion.every(Number.isFinite)||!Number.isFinite(f.min)||!Number.isFinite(f.max))return;
      feet.push({...f,position:new THREE.Vector3().fromArray(f.position),pole:new THREE.Vector3().fromArray(f.pole),quaternion:new THREE.Quaternion().fromArray(f.quaternion)});
    }
    solveWaveFeet({ground:{feet,position:context.model.position.clone()}},()=>{});
  }

  function isBakedWavePlaying(){return context.waveTrackActive||(context.kfPlaying&&!!context.keyframes[context.kfIndex]?.waveBake);}

  function restoreWave(value){stopWave();context.waveConfig=cleanWave(value);waveUI(()=>tr("就緒 · 設定已還原"));}

  function bindWave(){
    context.bindWaveTrack();
    document.getElementById('waveBakeBtn').onclick=bakeWaveToTimeline;
    document.getElementById('waveBakeUseTiming').onclick=()=>{
      document.getElementById('waveBakeBeats').value=Math.max(.25,Math.min(64,context.waveConfig.beats/context.waveConfig.speed));
    };
    document.getElementById('waveBakeOpenTimeline').onclick=()=>document.querySelector('.tabBtn[data-tab="keyframe"]').click();
    for(const [id,key]of [['waveStartNode','startNode'],['waveEndNode','endNode']]){
      const el=document.getElementById(id);
      for(const [value,,label]of context.WAVE_ROUTE_NODES){const option=document.createElement('option');option.value=value;liveText(option, ()=>tr(label));el.appendChild(option);}
      el.onchange=e=>{
        if(context.waveRun){waveUI();return;}
        const other=key==='startNode'?'endNode':'startNode';
        if(e.target.value===context.waveConfig[other]){waveUI(()=>tr("起點與終點不可相同，請選另一個節點"));return;}
        context.pushHistory();context.waveConfig=cleanWave({...context.waveConfig,[key]:e.target.value});waveUI();context.pushHistory();context.scheduleAutoSave();
      };
    }
    const speedSlider=document.getElementById('waveSpeed');let speedEditing=false;
    speedSlider.oninput=e=>{
      if(!speedEditing){context.pushHistory();speedEditing=true;}
      setWaveSpeed(e.target.value);
    };
    const commitSpeed=()=>{if(speedEditing){context.pushHistory();speedEditing=false;}};
    speedSlider.onchange=commitSpeed;speedSlider.onblur=commitSpeed;
    document.getElementById('waveSpeedReset').onclick=()=>{commitSpeed();context.pushHistory();setWaveSpeed(1);context.pushHistory();};
    document.getElementById('waveSeek').oninput=e=>seekWave(e.target.value);
    for(const [id,key]of Object.entries(context.WAVE_GAIN_FIELDS)){
      const el=document.getElementById('wave'+id);let editing=false;
      el.oninput=e=>{
        if(!editing){context.pushHistory();editing=true;}
        context.waveConfig=cleanWave({...context.waveConfig,[key]:Number(e.target.value)});
        if(context.waveRun){context.waveRun.config[key]=context.waveConfig[key];tickWave(performance.now());}
        waveUI();context.scheduleAutoSave();
      };
      const commit=()=>{if(editing){context.pushHistory();editing=false;}};
      el.onchange=commit;el.onblur=commit;
    }

    for(const [id,key]of Object.entries({Mode:'mode',Polarity:'polarity',Shape:'shape',Route:'route',Direction:'direction',Repeat:'repeat',Amplitude:'amplitude',Width:'width',Beats:'beats',Fingers:'fingers'})){
      document.getElementById('wave'+id).onchange=e=>{if(context.waveRun)return;context.pushHistory();context.waveConfig=cleanWave({...context.waveConfig,[key]:key==='fingers'?e.target.checked:e.target.value});waveUI();context.pushHistory();context.scheduleAutoSave();};
    }
    document.getElementById('wavePlay').onclick=startWave;
    document.getElementById('wavePause').onclick=()=>{tickWave(performance.now());if(context.waveRun)context.waveRun.playing=false;waveUI(()=>tr("已暫停 · 可繼續或停止還原"));};
    document.getElementById('waveStop').onclick=()=>stopWave();waveUI();
  }
  return { waveIsRelay, waveHasBody, waveBounds, waveLocalIndex, waveSides, waveRouteLength, waveNodes, updateWaveRouteUI, waveDurationSeconds, updateWaveTiming, setWaveSpeed, seekWave, cleanWave, wavePulse, waveValue, wavePosition, waveConflict, waveUI, captureWaveFeet, solveWaveFeet, stopWave, startWave, tickWave, captureWaveTimelinePose, waveBakePlan, bakeWaveToTimeline, applyBakedWaveFeet, isBakedWavePlaying, restoreWave, bindWave };
}
