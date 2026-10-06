import { t as tr, liveText, liveAttribute } from "../i18n/index.js";
import * as THREE from "three";
import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";
import { D, R, clampNum } from "../math/angles.js";
import { eulerToQuat, applyBoneWorldQuatLock, applyWorldDeltaQuat } from "../math/quaternions.js";

// Live host getters preserve shared rig and playback coordination.
export function createOrientationController(context){
const _laBoneWorldQuat = new THREE.Quaternion();

const _laWorldForward = new THREE.Vector3();

const _laBonePos = new THREE.Vector3();

const _laTargetDir = new THREE.Vector3();

const _laAxis = new THREE.Vector3();

const _laDeltaQuat = new THREE.Quaternion();

function calibrateHandAim(name){
  const b=context.bones[name],side=name[0],index=context.bones[side+'Index1'],pinky=context.bones[side+'Pinky1'],middle=context.bones[side+'Middle1'];
  if(!b||!index||!pinky||!middle)return false;
  b.updateWorldMatrix(true,true);
  const point=x=>b.worldToLocal(x.getWorldPosition(new THREE.Vector3()));
  const forward=point(middle).normalize(),across=point(index).sub(point(pinky)).normalize();
  const normal=new THREE.Vector3().crossVectors(forward,across).multiplyScalar(side==='r'?1:-1);
  if(normal.lengthSq()<1e-8||forward.lengthSq()<1e-8)return false;
  context.handAimAxes[name]={palm:normal.normalize(),finger:forward};return true;
}

function handAimAxis(name){return context.handAimAxes[name][context.handAim[name].mode].clone().multiplyScalar(context.handAim[name].flip?-1:1);}

function captureHandAim(name){
  if(!context.handAimAxes[name]&&!calibrateHandAim(name))return false;
  context.handFollowLast[name]=null;
  context.bones[name].getWorldQuaternion(context.handAim[name].reference).normalize();context.handAim[name].roll=0;
  LOOKAT_CONFIG[name].localForward.copy(handAimAxis(name));return true;
}

function handFollowDirection(name,pos){
  const other=name==='rHand'?'lHand':'rHand',bone=context.bones[other];
  if(!bone)return null;
  const point=bone.getWorldPosition(new THREE.Vector3());context.lookAtTargetMesh[name].position.copy(point);
  const dir=point.sub(pos),distance=dir.length();
  // Keep the last direction inside 0.01; resume beyond 0.015 to avoid boundary jitter.
  const threshold=context.handFollowLast[name]?.near?0.015:0.01;
  if(distance<threshold){
    if(!context.handFollowLast[name])context.handFollowLast[name]={dir:handAimAxis(name).applyQuaternion(context.bones[name].getWorldQuaternion(new THREE.Quaternion())).normalize(),near:true};
    context.handFollowLast[name].near=true;return context.handFollowLast[name].dir.clone();
  }
  dir.normalize();context.handFollowLast[name]={dir:dir.clone(),near:false};return dir;
}

function updateHandFollowUI(){
  for(const name of context.HAND_AIM_NAMES){
    const select=document.getElementById('handFollowSource_'+name);if(!select)continue;
    const other=name==='rHand'?'lHand':'rHand',bound=context.handFollowSource[name]==='other';
    select.value=context.handFollowSource[name];select.querySelector('option[value="other"]').disabled=!context.bones[other];
    for(const prefix of ['handRangeMin_','handRangeMax_','handRangeDefault_'])document.getElementById(prefix+name).disabled=bound;
    liveText(document.getElementById('handFollowStatus_'+name), ()=>bound?(context.lookAtEnabled[name]?tr("追蹤另一手的實際手腕；半徑暫停。"):tr("追蹤已暫停。")):'');
    if(context.lookAtTargetMesh[name])context.lookAtTargetMesh[name].visible=context.lookAtEnabled[name]&&!bound;
  }
}

function bindHandFollowUI(){
  for(const name of context.HAND_AIM_NAMES)document.getElementById('handFollowSource_'+name).onchange=e=>{
    const next=e.target.value,other=name==='rHand'?'lHand':'rHand';
    if(context.kfPlaying||!['free','other'].includes(next)||(next==='other'&&!context.bones[other])){updateHandFollowUI();return;}
    context.pushHistory();if(context.selectedIK?.limb==='lookAt_'+name)context.deselectJoint();context.handRangeDrag=null;
    context.handFollowSource[name]=next;context.handFollowLast[name]=null;
    if(next==='other')setLookAtEnabled(name,true);else syncLookAtMarkerToDefault(name);
    solveHandAim(name);updateHandFollowUI();context.pushHistory();context.scheduleAutoSave();
  };
}

function sampleLACustom(c,phase){
  const pts=(c.points||[]).map(p=>new THREE.Vector3().fromArray(p));
  if(!pts.length)return new THREE.Vector3();if(pts.length===1)return pts[0];
  const closed=c.closed&&pts.length>=3;
  const cycle=((phase%1)+1)%1,u=closed?cycle:1-Math.abs(2*cycle-1);
  if(c.mode==='curve'&&pts.length>=3)return new THREE.CatmullRomCurve3(pts,closed,'centripetal').getPoint(u);
  const segments=closed?pts.length:pts.length-1,t=u*segments,i=Math.min(Math.floor(t),segments-1);
  return pts[i].clone().lerp(pts[(i+1)%pts.length],t-i);
}

function laCustomCenter(){const bone=context.bones[LOOKAT_CONFIG[context.laPathConfig.part]?.key];return bone?bone.getWorldPosition(new THREE.Vector3()):null;}

function selectLACustom(i){
  if(context.laPathRun||context.kfPlaying||!context.laCustomMeshes[i])return;
  context.transformControls.detach();context.selectedKey=null;context.selectedIK={limb:'laCustom',role:'laPoint',index:i};
  context.transformControlsIK.setMode('translate');context.transformControlsIK.setSpace('world');context.transformControlsIK.attach(context.laCustomMeshes[i]);
  context.updateSelectedBar();renderLACustomList();
}

function renderLACustomList(){
  const host=document.getElementById('laCustomList');if(!host)return;host.replaceChildren();
  const points=context.laPathConfig.points||[];
  points.forEach((p,i)=>{
    const group=document.createElement('span'),select=document.createElement('button'),del=document.createElement('button');
    liveText(select, ()=>'P'+(i+1));liveAttribute(select, "title", ()=>p.map(x=>x.toFixed(3)).join(', '));select.disabled=!!context.laPathRun;
    select.classList.toggle('active',context.selectedIK?.role==='laPoint'&&context.selectedIK.index===i);select.onclick=()=>selectLACustom(i);
    liveText(del, ()=>'×');liveAttribute(del, "title", ()=>tr("刪除 P")+(i+1));del.disabled=!!context.laPathRun;del.onclick=()=>mutateLACustom(()=>context.laPathConfig.points.splice(i,1));
    group.append(select,del);host.append(group);
  });
  if(!points.length){const empty=document.createElement("span");liveText(empty,()=>tr("尚無控制點：按「建立方形」開始，或新增控制點。"));host.append(empty);}
}

function rebuildLACustomMeshes(){
  if(context.selectedIK?.role==='laPoint')context.deselectJoint();context.laCustomDrag=null;
  for(const m of context.laCustomMeshes){context.scene.remove(m);m.geometry.dispose();m.material.dispose();}context.laCustomMeshes=[];
  if(!context.scene)return;
  for(let i=0;i<(context.laPathConfig.points||[]).length;i++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.022,12,8),new THREE.MeshBasicMaterial({color:0xffaa55,depthTest:false}));
    m.renderOrder=999;m.userData.pickType='laPoint';m.userData.index=i;m.visible=false;context.scene.add(m);context.laCustomMeshes.push(m);
  }
  renderLACustomList();updateLACustomVisual();
}

function mutateLACustom(action){
  if(context.laPathRun||context.kfPlaying)return;context.pushHistory();if(context.selectedIK?.role==='laPoint')context.deselectJoint();
  if(!context.laPathConfig.points)context.laPathConfig.points=[];action();context.laPathConfig=cleanLAPath(context.laPathConfig);
  rebuildLACustomMeshes();updateLAPathUI();context.pushHistory();context.scheduleAutoSave();
}

function updateLACustomVisual(){
  const visible=!context.laPathRun&&!context.kfPlaying&&context.laPathConfig.shape==='custom'&&document.getElementById('tabLookAt')?.classList.contains('active');
  for(const m of context.laCustomMeshes)m.visible=visible;
  if(!visible){if(!context.laPathRun&&context.laPathLine)context.laPathLine.visible=false;if(context.selectedIK?.role==='laPoint')context.deselectJoint();return;}
  const center=context.laCustomDrag?.center||laCustomCenter();if(!center)return;
  const offset=new THREE.Vector3(context.laPathConfig.x,context.laPathConfig.y,context.laPathConfig.z);
  context.laCustomMeshes.forEach((m,i)=>{if(!(context.laCustomDrag&&context.selectedIK?.index===i))m.position.fromArray(context.laPathConfig.points[i]).add(offset).add(center);});
  if(!context.laPathLine){context.laPathLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffaa55,transparent:true,opacity:.8,depthTest:false}));context.scene.add(context.laPathLine);}
  const range=context.handAimRange[context.laPathConfig.part],fallback=handRangeDirection(context.laPathConfig.part),pts=[];
  for(let i=0;i<=96;i++)pts.push(laPathPoint(context.laPathConfig,i/96,center,range.min,range.max,fallback));
  context.laPathLine.geometry.setFromPoints(pts);context.laPathLine.geometry.computeBoundingSphere();context.laPathLine.visible=(context.laPathConfig.points||[]).length>=2;
}

function dragLACustom(){
  if(!context.laCustomDrag||context.selectedIK?.role!=='laPoint')return;
  const i=context.selectedIK.index,m=context.laCustomMeshes[i];if(!m)return;
  const range=context.handAimRange[context.laPathConfig.part];clampHandRangePoint(m.position,context.laCustomDrag.center,range.min,range.max,handRangeDirection(context.laPathConfig.part));
  context.laPathConfig.points[i]=m.position.clone().sub(context.laCustomDrag.center).sub(new THREE.Vector3(context.laPathConfig.x,context.laPathConfig.y,context.laPathConfig.z)).toArray();
  context.updateSelectedBar();
}

function bindLACustom(){
  document.getElementById('laCustomMode').onchange=e=>mutateLACustom(()=>context.laPathConfig.mode=e.target.value);
  document.getElementById('laCustomClosed').onchange=e=>mutateLACustom(()=>context.laPathConfig.closed=e.target.value==='closed');
  document.getElementById('laCustomSquare').onclick=()=>mutateLACustom(()=>{const r=context.laPathConfig.size;context.laPathConfig.points=[[-r,-r,0],[r,-r,0],[r,r,0],[-r,r,0]];context.laPathConfig.closed=true;});
  document.getElementById('laCustomAdd').onclick=()=>mutateLACustom(()=>{
    if(context.laPathConfig.points.length>=64)return;
    const p=context.laPathConfig.points.length?context.laPathConfig.points.at(-1).slice():[0,0,0];p[0]+=.05;context.laPathConfig.points.push(p);
  });
}

function cleanLAPath(v){
  const d={part:'rHand',shape:'circle',plane:'xy',size:.12,beats:4,x:0,y:0,z:.25},out={...d};
  for(const [key,values] of Object.entries({part:['rHand','lHand','head','chest'],shape:['circle','horizontal','vertical','custom'],plane:['xy','xz','yz']}))if(values.includes(v?.[key]))out[key]=v[key];
  for(const [key,min,max] of [['size',.001,5],['beats',.25,128],['x',-5,5],['y',-5,5],['z',-5,5]])if(Number.isFinite(v?.[key]))out[key]=Math.min(max,Math.max(min,v[key]));
  out.mode=v?.mode==='curve'?'curve':'line';out.closed=v?.closed===true;
  out.points=Array.isArray(v?.points)?v.points.filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)).slice(0,64).map(p=>p.slice()):[];
  return out;
}

function laPathPoint(c,phase,center,min,max,fallback){
  const t=phase*Math.PI*2,p=new THREE.Vector3(c.x,c.y,c.z);
  if(c.shape==='custom')p.add(sampleLACustom(c,phase));
  else if(c.shape==='horizontal')p.x+=c.size*Math.sin(t);
  else if(c.shape==='vertical')p.y+=c.size*Math.sin(t);
  else {p[c.plane[0]]+=c.size*Math.cos(t);p[c.plane[1]]+=c.size*Math.sin(t);}
  p.add(center);clampHandRangePoint(p,center,min,max,fallback);return p;
}

function updateLAPathUI(){
  const custom=context.laPathConfig.shape==='custom',panel=document.getElementById('laCustomPanel');
  if(panel){panel.style.display=custom?'':'none';document.getElementById('laCustomMode').value=context.laPathConfig.mode||'line';document.getElementById('laCustomClosed').value=context.laPathConfig.closed?'closed':'open';
    for(const id of ['laCustomMode','laCustomClosed','laCustomAdd','laCustomSquare'])document.getElementById(id).disabled=!!context.laPathRun;renderLACustomList();}

  const fields={Part:'part',Shape:'shape',Plane:'plane',Size:'size',Beats:'beats',X:'x',Y:'y',Z:'z'};
  for(const [id,key] of Object.entries(fields)){const el=document.getElementById('laPath'+id);if(el){el.value=context.laPathConfig[key];el.disabled=!!context.laPathRun;}}
  if(custom){document.getElementById('laPathSize').disabled=true;document.getElementById('laPathPlane').disabled=true;}
  const play=document.getElementById('laPathPlay');if(!play)return;
  play.disabled=!!context.laPathRun?.playing;liveText(play, ()=>context.laPathRun?tr("▶ 繼續"):tr("▶ 播放預覽"));
  document.getElementById('laPathPause').disabled=!context.laPathRun?.playing;
  document.getElementById('laPathStop').disabled=!context.laPathRun;
  // Only the owned part is locked. Other parts remain editable.
  for(const n of context.LOOKAT_RANGE_NAMES){
    const ids=['lookAtBtn_'+n,'handRangeMin_'+n,'handRangeMax_'+n,'handRangeDefault_'+n];
    if(n==='head')ids.push('headFollowSource');
    if(context.HAND_AIM_NAMES.includes(n))ids.push('handFollowSource_'+n,'handAimMode_'+n,'handAimFlip_'+n,'handAimRoll_'+n,'handAimReset_'+n);
    for(const id of ids){const el=document.getElementById(id);if(el&&context.laPathRun?.name===n)el.disabled=true;}
  }
}

function stopLAPath(){
  if(!context.laPathRun)return;
  const n=context.laPathRun.name;context.laPathRun=null;if(context.laPathLine)context.laPathLine.visible=false;
  // Clear preview locks before restoring normal availability rules.
  for(const el of document.querySelectorAll('#tabLookAt button,#tabLookAt input,#tabLookAt select'))el.disabled=false;
  if(context.bones[LOOKAT_CONFIG[n].key])context.syncTargetFromBone(LOOKAT_CONFIG[n].key);
  updateLookAtButtons();updateLAPathUI();
}

function startLAPath(reset=false){
  if(context.waveRun)context.stopWave();
  if(context.laPathConfig.shape==='custom'&&(context.laPathConfig.points||[]).length<((context.laPathConfig.closed||context.laPathConfig.mode==='curve')?3:2)){liveText(document.getElementById('laPathStatus'), ()=>(context.laPathConfig.closed||context.laPathConfig.mode==='curve')?tr("封閉路徑或平滑曲線至少需要 3 個控制點。"):tr("開放折線至少需要 2 個控制點。"));return;}
  if(context.selectedIK?.role==='laPoint')context.deselectJoint();

  if(context.kfPlaying){liveText(document.getElementById('laPathStatus'), ()=>tr("請先停止時間軸播放，再啟動軌跡預覽。"));return;}
  if(context.laPathRun){if(reset)context.laPathRun.phase=0;context.laPathRun.playing=!reset;context.laPathRun.last=performance.now();updateLAPathUI();return;}
  const n=context.laPathConfig.part,b=context.bones[LOOKAT_CONFIG[n].key];
  if(!b||(context.HAND_AIM_NAMES.includes(n)&&!context.handAimAxes[n])){liveText(document.getElementById('laPathStatus'), ()=>tr("模型或所需骨骼尚未就緒。"));return;}
  context.pushHistory();if(context.selectedIK?.limb==='lookAt_'+n)context.deselectJoint();context.handRangeDrag=null;
  if(n==='head')context.headFollowSource='free';if(context.HAND_AIM_NAMES.includes(n))context.handFollowSource[n]='free';
  const roll=context.handAim[n]?.roll||0;setLookAtEnabled(n,true);if(context.handAim[n])context.handAim[n].roll=roll;
  const ref=context.HAND_AIM_NAMES.includes(n)?context.handAim[n].reference.clone():b.getWorldQuaternion(new THREE.Quaternion()).normalize();
  const local=context.HAND_AIM_NAMES.includes(n)?handAimAxis(n):LOOKAT_CONFIG[n].localForward.clone();
  context.laPathRun={name:n,phase:0,last:performance.now(),playing:!reset,ref,local,roll,range:{...context.handAimRange[n]},config:cleanLAPath(context.laPathConfig)};
  solveLAPath(n);updateLookAtButtons();updateLAPathUI();context.pushHistory();context.scheduleAutoSave();
  liveText(document.getElementById('laPathStatus'), ()=>tr("預覽中：路徑跟隨部位平移；橘色路徑已套用內外半徑限制。停止後可修改設定。"));
}

function tickLAPath(now){
  if(!context.laPathRun)return;
  if(context.kfPlaying){stopLAPath();return;}
  const r=context.laPathRun;
  if(r.playing)r.phase=(r.phase+Math.max(0,now-r.last)*context.bpm/(60000*r.config.beats))%1;
  r.last=now;
}

function solveLAPath(name){
  if(context.isGrabPalmAligned?.(name))return true;
  const r=context.laPathRun;if(!r||r.name!==name)return false;
  const b=context.bones[LOOKAT_CONFIG[name].key],center=b.getWorldPosition(new THREE.Vector3());
  const forward=r.local.clone().applyQuaternion(r.ref).normalize();
  const point=laPathPoint(r.config,r.phase,center,r.range.min,r.range.max,forward);context.lookAtTargetMesh[name].position.copy(point);
  const dir=point.clone().sub(center).normalize(),swing=new THREE.Quaternion();
  if(forward.dot(dir)<-1+1e-12){const helper=Math.abs(forward.x)<.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);swing.setFromAxisAngle(new THREE.Vector3().crossVectors(forward,helper).normalize(),Math.PI);}
  else swing.setFromUnitVectors(forward,dir);
  const q=new THREE.Quaternion().setFromAxisAngle(dir,THREE.MathUtils.degToRad(r.roll)).multiply(swing).multiply(r.ref);
  const parent=b.parent?b.parent.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();b.quaternion.copy(parent.invert().multiply(q)).normalize();b.updateWorldMatrix(true,true);context.syncTargetFromBone(LOOKAT_CONFIG[name].key);
  if(!context.laPathLine){context.laPathLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffaa55,transparent:true,opacity:.8,depthTest:false}));context.laPathLine.renderOrder=990;context.scene.add(context.laPathLine);}
  const points=[];for(let i=0;i<=96;i++)points.push(laPathPoint(r.config,i/96,center,r.range.min,r.range.max,forward));
  context.laPathLine.geometry.setFromPoints(points);context.laPathLine.geometry.computeBoundingSphere();context.laPathLine.visible=true;
  return true;
}

function restoreLAPath(v){stopLAPath();context.laPathConfig=cleanLAPath(v);rebuildLACustomMeshes();updateLAPathUI();}

function bindLAPath(){
  bindLACustom();
  const fields={Part:'part',Shape:'shape',Plane:'plane',Size:'size',Beats:'beats',X:'x',Y:'y',Z:'z'};
  for(const [id,key] of Object.entries(fields))document.getElementById('laPath'+id).onchange=e=>{
    if(context.laPathRun||context.kfPlaying){updateLAPathUI();return;}
    const value=['part','shape','plane'].includes(key)?e.target.value:Number(e.target.value);
    if(typeof value==='number'&&(!Number.isFinite(value)||e.target.value.trim()==='')){updateLAPathUI();return;}
    context.pushHistory();context.laPathConfig=cleanLAPath({...context.laPathConfig,[key]:value});rebuildLACustomMeshes();updateLAPathUI();context.pushHistory();context.scheduleAutoSave();
  };
  document.getElementById('laPathPlay').onclick=()=>startLAPath();
  document.getElementById('laPathPause').onclick=()=>{tickLAPath(performance.now());if(context.laPathRun)context.laPathRun.playing=false;updateLAPathUI();};
  document.getElementById('laPathReset').onclick=()=>{startLAPath(true);if(context.laPathRun)solveLAPath(context.laPathRun.name);};
  document.getElementById('laPathStop').onclick=()=>{stopLAPath();context.pushHistory();context.scheduleAutoSave();liveText(document.getElementById('laPathStatus'), ()=>tr("已停止，保留目前姿勢與自由目標位置。"));};
  updateLAPathUI();
}

function solveHandAim(name){
  if(context.isGrabPalmAligned?.(name))return true;
  if(solveLAPath(name))return;
  if(!context.lookAtEnabled[name]||!context.handAimAxes[name])return;
  const b=context.bones[name],state=context.handAim[name],pos=b.getWorldPosition(new THREE.Vector3());
  const dir=context.handFollowSource[name]==='other'?handFollowDirection(name,pos):context.lookAtTargetMesh[name].position.clone().sub(pos);if(!dir||dir.lengthSq()<1e-8)return;
  dir.normalize();
  const forward=handAimAxis(name).applyQuaternion(state.reference).normalize();
  const swing=new THREE.Quaternion();
  if(forward.dot(dir)<-1+1e-12){
    const local=handAimAxis(name),helper=Math.abs(local.x)<0.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
    const axis=new THREE.Vector3().crossVectors(local,helper).normalize().applyQuaternion(state.reference).normalize();
    swing.setFromAxisAngle(axis,Math.PI);
  }else swing.setFromUnitVectors(forward,dir);
  const q=new THREE.Quaternion().setFromAxisAngle(dir,THREE.MathUtils.degToRad(state.roll)).multiply(swing).multiply(state.reference);
  const parent=b.parent?b.parent.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();
  b.quaternion.copy(parent.invert().multiply(q)).normalize();b.updateWorldMatrix(true,true);context.syncTargetFromBone(name);
}

function validHandRange(min,max){return Number.isFinite(min)&&Number.isFinite(max)&&min>=0.001&&max>min;}

function clampHandRangePoint(point,center,min,max,fallback){
  const delta=point.clone().sub(center),len=delta.length();
  if(len>1e-10)delta.multiplyScalar(1/len);
  else {delta.copy(fallback);if(delta.lengthSq()<1e-12)delta.set(0,0,1);delta.normalize();}
  point.copy(center).addScaledVector(delta,Math.min(max,Math.max(min,len)));
  return delta;
}

function handRangeDirection(name){
  if(context.handAimAxes[name]&&context.bones[LOOKAT_CONFIG[name]?.key])return handAimAxis(name).applyQuaternion(context.bones[LOOKAT_CONFIG[name]?.key].getWorldQuaternion(new THREE.Quaternion())).normalize();
  const bone=context.bones[LOOKAT_CONFIG[name]?.key];
  if(bone)return LOOKAT_CONFIG[name].localForward.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())).normalize();
  return new THREE.Vector3(0,0,1);
}

function alignHandRange(name){
  if(!context.bones[LOOKAT_CONFIG[name]?.key]||!context.lookAtTargetMesh[name])return;
  const r=context.handAimRange[name],center=context.bones[LOOKAT_CONFIG[name]?.key].getWorldPosition(new THREE.Vector3());
  clampHandRangePoint(context.lookAtTargetMesh[name].position,center,r.min,r.max,handRangeDirection(name));
}

function beginHandRangeDrag(name){
  if(!context.bones[LOOKAT_CONFIG[name]?.key]||!context.lookAtTargetMesh[name])return;
  const p=context.lookAtTargetMesh[name].position,raw=p.clone(),center=context.bones[LOOKAT_CONFIG[name]?.key].getWorldPosition(new THREE.Vector3()),r=context.handAimRange[name];
  // TransformControls captured raw start before dragging-changed. Retain the correction
  // as an offset for subsequent absolute objectChange positions to prevent a second jump.
  const last=clampHandRangePoint(p,center,r.min,r.max,handRangeDirection(name));
  context.handRangeDrag={name,center,min:r.min,max:r.max,last,offset:p.clone().sub(raw)};
}

function clampHandRangeDrag(){
  const d=context.handRangeDrag;if(!d)return;
  const p=context.lookAtTargetMesh[d.name].position;p.add(d.offset);
  d.last.copy(clampHandRangePoint(p,d.center,d.min,d.max,d.last));
}

function bindHandRangeUI(){
  for(const name of context.LOOKAT_RANGE_NAMES){
    const apply=reset=>{
      if(context.kfPlaying||context.handRangeDrag){updateLookAtRangeUI();return;}
      const min=reset?0.08:Number(document.getElementById('handRangeMin_'+name).value);
      const max=reset?0.4:Number(document.getElementById('handRangeMax_'+name).value);
      const notice=document.getElementById('handRangeNotice_'+name);
      if(!validHandRange(min,max)){liveText(notice, ()=>tr("內半徑須至少 0.001，外半徑須大於內半徑。"));updateLookAtRangeUI();return;}
      context.pushHistory();context.handAimRange[name]={min,max};alignHandRange(name);
      liveText(notice, ()=>tr("已保留目標方向並套用範圍。"));updateLookAtRangeUI();context.pushHistory();context.scheduleAutoSave();
    };
    document.getElementById('handRangeMin_'+name).onchange=()=>apply(false);
    document.getElementById('handRangeMax_'+name).onchange=()=>apply(false);
    document.getElementById('handRangeDefault_'+name).onclick=()=>apply(true);
  }
}

function updateHandRangeHelper(){
  const name=context.selectedIK?.limb?.startsWith('lookAt_')?context.selectedIK.limb.slice(7):null;
  if(context.handFollowSource[name]==="other"||(name==="head"&&context.headFollowSource!=="free")||!context.LOOKAT_RANGE_NAMES.includes(name)||!context.lookAtEnabled[name]||context.kfPlaying){if(context.handRangeHelper)context.handRangeHelper.visible=false;return;}
  if(!context.handRangeHelper){
    context.handRangeHelper=new THREE.Group();
    const geo=new THREE.WireframeGeometry(new THREE.SphereGeometry(1,16,10));
    for(const color of [0xffb65c,0x55ffaa]){
      const mesh=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:0.16,depthTest:false,depthWrite:false}));
      mesh.renderOrder=996;context.handRangeHelper.add(mesh);
    }context.scene.add(context.handRangeHelper);
  }
  const d=context.handRangeDrag?.name===name?context.handRangeDrag:null,r=d||context.handAimRange[name];
  context.handRangeHelper.visible=true;context.handRangeHelper.position.copy(d?d.center:context.bones[LOOKAT_CONFIG[name]?.key].getWorldPosition(new THREE.Vector3()));
  context.handRangeHelper.children[0].scale.setScalar(r.min);context.handRangeHelper.children[1].scale.setScalar(r.max);
}

function updateLookAtRangeUI(){
  for(const name of context.LOOKAT_RANGE_NAMES){
    const min=document.getElementById('handRangeMin_'+name),max=document.getElementById('handRangeMax_'+name);
    if(min)min.value=context.handAimRange[name].min;
    if(max)max.value=context.handAimRange[name].max;
  }
}

function updateHeadFollowTarget(){
  if(!context.lookAtEnabled.head||context.headFollowSource==='free')return;
  const hand=context.bones[context.headFollowSource],marker=context.lookAtTargetMesh.head;
  if(hand&&marker)hand.getWorldPosition(marker.position);
}

function updateHeadFollowUI(){
  const select=document.getElementById('headFollowSource');if(!select)return;
  select.value=context.headFollowSource;
  for(const name of ['rHand','lHand'])select.querySelector('option[value="'+name+'"]').disabled=!context.bones[name];
  const bound=context.headFollowSource!=='free';
  for(const prefix of ['handRangeMin_','handRangeMax_','handRangeDefault_']){const el=document.getElementById(prefix+'head');if(el)el.disabled=bound;}
  liveText(document.getElementById('headFollowStatus'), ()=>bound?(context.lookAtEnabled.head?tr("追蹤實際手腕位置；半徑限制暫停，播放沿用拍點姿勢。"):tr("追蹤已暫停；開啟頭部 LookAt 可繼續。")):tr("拖曳目標球控制方向。"));
  if(context.lookAtTargetMesh.head)context.lookAtTargetMesh.head.visible=context.lookAtEnabled.head&&!bound;
}

function bindHeadFollowUI(){
  document.getElementById('headFollowSource').onchange=e=>{
    if(context.kfPlaying){updateHeadFollowUI();return;}
    const next=e.target.value;
    if(!['free','rHand','lHand'].includes(next)||(next!=='free'&&!context.bones[next])){updateHeadFollowUI();return;}
    context.pushHistory();
    if(context.selectedIK?.limb==='lookAt_head')context.deselectJoint();
    context.handRangeDrag=null;context.headFollowSource=next;
    if(next!=='free')setLookAtEnabled('head',true);
    else syncLookAtMarkerToDefault('head');
    updateHeadFollowTarget();solveLookAt('head');updateHeadFollowUI();context.pushHistory();context.scheduleAutoSave();
  };
}

function snapshotTorsoLookAt(){
  const out={};for(const name of ['head','chest'])out[name]={range:{...context.handAimRange[name]},enabled:context.lookAtEnabled[name],target:context.lookAtTargetMesh[name]?.position.toArray()};
  out.head.source=context.headFollowSource;
  return out;
}

function restoreTorsoLookAt(data){
  context.headFollowSource=["rHand","lHand"].includes(data?.head?.source)&&context.bones[data.head.source]?data.head.source:"free";
  context.handRangeDrag=null;
  for(const name of ['head','chest']){
    const v=data?.[name];context.handAimRange[name]=validHandRange(v?.range?.min,v?.range?.max)?{min:v.range.min,max:v.range.max}:{min:0.08,max:0.4};
    if(context.lookAtTargetMesh[name]){
      setLookAtEnabled(name,v?.enabled===true);
      if(Array.isArray(v?.target)&&v.target.length===3&&v.target.every(Number.isFinite))context.lookAtTargetMesh[name].position.fromArray(v.target);
    }
  }
  updateLookAtRangeUI();updateHeadFollowTarget();updateHeadFollowUI();
}

function updateHandAimUI(){
  updateHandFollowUI();
  updateLookAtRangeUI();
  for(const name of context.HAND_AIM_NAMES){
    const state=context.handAim[name],available=!!context.handAimAxes[name];
    const btn=document.getElementById('lookAtBtn_'+name);if(!btn)continue;
    btn.disabled=!available;btn.classList.toggle('active',context.lookAtEnabled[name]);
    document.getElementById('handRangeMin_'+name).value=context.handAimRange[name].min;
    document.getElementById('handRangeMax_'+name).value=context.handAimRange[name].max;
    document.getElementById('handAimMode_'+name).value=state.mode;
    document.getElementById('handAimRoll_'+name).value=state.roll;
    document.getElementById('handAimFlip_'+name).checked=state.flip;
    liveText(document.getElementById('handAimStatus_'+name), ()=>available?'':tr("缺少手指骨骼，無法校準"));
  }
  if(context.laPathRun)updateLAPathUI();
}

function bindHandAimUI(){
  bindLAPath();
  context.bindWave();
  context.bindTG();
  bindHandFollowUI();
  bindHeadFollowUI();
  bindHandRangeUI();
  for(const name of context.HAND_AIM_NAMES){
    for(const field of ['Mode','Roll','Flip']){
      document.getElementById('handAim'+field+'_'+name).onchange=e=>{
        if(context.kfPlaying){updateHandAimUI();return;}context.pushHistory();
        const state=context.handAim[name];
        if(field==='Roll'){const v=Number(e.target.value);if(Number.isFinite(v))state.roll=Math.max(-180,Math.min(180,v));}
        else {if(field==='Mode')state.mode=e.target.value;else state.flip=e.target.checked;
          if(captureHandAim(name))syncLookAtMarkerToDefault(name);}
        if(context.lookAtEnabled[name])solveHandAim(name);
        updateHandAimUI();context.pushHistory();context.scheduleAutoSave();
      };
    }
    document.getElementById('handAimReset_'+name).onclick=()=>{
      if(context.kfPlaying)return;context.pushHistory();if(captureHandAim(name))syncLookAtMarkerToDefault(name);updateHandAimUI();context.pushHistory();context.scheduleAutoSave();
    };
  }
}

function snapshotHandAim(){
  const out={};for(const name of context.HAND_AIM_NAMES){const a=context.handAim[name];
    out[name]={source:context.handFollowSource[name],followLast:context.handFollowLast[name]?{dir:context.handFollowLast[name].dir.toArray(),near:context.handFollowLast[name].near}:null,range:{...context.handAimRange[name]},enabled:context.lookAtEnabled[name],mode:a.mode,roll:a.roll,flip:a.flip,reference:a.reference.toArray(),target:context.lookAtTargetMesh[name]?.position.toArray(),effector:context.effectorOrientEnabled[name==='rHand'?'rArm':'lArm']};}
  return out;
}

function restoreHandAim(data){
  context.handRangeDrag=null;
  for(const name of context.HAND_AIM_NAMES){
    const v=data?.[name],a=context.handAim[name];
    context.handFollowSource[name]=v?.source==='other'&&context.bones[name==='rHand'?'lHand':'rHand']?'other':'free';context.handFollowLast[name]=null;
    const last=v?.followLast;
    if(Array.isArray(last?.dir)&&last.dir.length===3&&last.dir.every(Number.isFinite)){
      const dir=new THREE.Vector3().fromArray(last.dir);if(dir.lengthSq()>1e-10)context.handFollowLast[name]={dir:dir.normalize(),near:last.near===true};
    }
    context.handAimRange[name]=validHandRange(v?.range?.min,v?.range?.max)?{min:v.range.min,max:v.range.max}:{min:0.08,max:0.4};
    a.mode=v?.mode==='finger'?'finger':'palm';a.roll=Number.isFinite(v?.roll)?Math.max(-180,Math.min(180,v.roll)):0;a.flip=v?.flip===true;
    const arr=(x,n)=>Array.isArray(x)&&x.length===n&&x.every(Number.isFinite);
    if(context.bones[name])context.bones[name].getWorldQuaternion(a.reference);
    if(arr(v?.reference,4)&&v.reference.reduce((s,x)=>s+x*x,0)>1e-10)a.reference.fromArray(v.reference).normalize();
    context.lookAtEnabled[name]=v?.enabled===true&&!!context.handAimAxes[name];
    if(context.lookAtTargetMesh[name]){context.lookAtTargetMesh[name].visible=context.lookAtEnabled[name];
      if(arr(v?.target,3))context.lookAtTargetMesh[name].position.fromArray(v.target);}
    if(context.handAimAxes[name])LOOKAT_CONFIG[name].localForward.copy(handAimAxis(name));
    const limb=name==='rHand'?'rArm':'lArm';
    if(v)context.effectorOrientEnabled[limb]=!context.lookAtEnabled[name]&&v.effector===true;
  }
  context.rebuildIKDrivenKeys();updateHandAimUI();context.updateEffectorOrientButtons();
}

function buildLookAtMarkers(){
  const colors = { head:0xff44cc, chest:0xffcc00, rHand:0x44ffaa, lHand:0x66dd66 };
  for(const name of context.HAND_AIM_NAMES)calibrateHandAim(name);
  for (const name in LOOKAT_CONFIG){
    const geo = new THREE.SphereGeometry(0.035, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color:colors[name], transparent:true, opacity:0.95, depthTest:false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 998;
    mesh.visible = false;
    mesh.userData.pickType = "lookAtTarget";
    mesh.userData.lookAtName = name;
    context.scene.add(mesh);
    context.lookAtTargetMesh[name] = mesh;
    syncLookAtMarkerToDefault(name);
  }
  updateHandAimUI();
}

function syncLookAtMarkerToDefault(name){
  const cfg = LOOKAT_CONFIG[name];
  const bone = context.bones[cfg.key];
  const mesh = context.lookAtTargetMesh[name];
  if (!bone || !mesh) return;
  const boneWorldQuat = new THREE.Quaternion(); bone.getWorldQuaternion(boneWorldQuat);
  const worldForward = cfg.localForward.clone().applyQuaternion(boneWorldQuat).normalize();
  const bonePos = new THREE.Vector3(); bone.getWorldPosition(bonePos);
  mesh.position.copy(bonePos.clone().add(worldForward.multiplyScalar(0.4)));
  if(context.LOOKAT_RANGE_NAMES.includes(name))alignHandRange(name);
}

function setLookAtEnabled(name, on){
  if(context.waveRun&&(context.waveHasBody(context.waveRun.config)||name==="chest"||context.waveSides(context.waveRun.config).some(side=>name===side+"Hand")))context.stopWave();
  if(context.laPathRun?.name===name)stopLAPath();
  if(context.HAND_AIM_NAMES.includes(name)){
    if(on&&!captureHandAim(name))return;
    if(on){context.effectorOrientEnabled[name==='rHand'?'rArm':'lArm']=false;context.updateEffectorOrientButtons();}
  }
  context.lookAtEnabled[name] = on;
  context.rebuildIKDrivenKeys(); // 理由同 setSpineIKEnabled：兩者會互相呼叫，整份重算不怕重複
  if (on) syncLookAtMarkerToDefault(name);
  context.lookAtTargetMesh[name].visible = on;
  if (on && name === "chest" && context.spineIKEnabled) context.setSpineIKEnabled(false);
  if (!on && context.selectedIK && context.selectedIK.limb === "lookAt_" + name) context.deselectJoint();
  updateLookAtButtons();
}

function updateLookAtButtons(){
  updateHeadFollowUI();
  updateHandAimUI();
  const headBtn = document.getElementById("lookAtBtn_head");
  if (headBtn) headBtn.classList.toggle("active", context.lookAtEnabled.head);
  const chestBtn = document.getElementById("lookAtBtn_chest");
  if (chestBtn) chestBtn.classList.toggle("active", context.lookAtEnabled.chest);
}

function solveLookAt(name){
  if(context.isGrabPalmAligned?.(name))return true;
  if(solveLAPath(name))return;
  if (!context.lookAtEnabled[name]) return;
  if(name==="head")updateHeadFollowTarget();
  const cfg = LOOKAT_CONFIG[name];
  const bone = context.bones[cfg.key];
  const mesh = context.lookAtTargetMesh[name];
  if (!bone || !mesh) return;

  bone.getWorldQuaternion(_laBoneWorldQuat);
  // cfg.localForward 是設定檔常數向量，不可被 applyQuaternion 就地修改到，一律先 .copy() 出來再操作
  const worldForward = _laWorldForward.copy(cfg.localForward).applyQuaternion(_laBoneWorldQuat).normalize();

  bone.getWorldPosition(_laBonePos);
  const targetDir = _laTargetDir.copy(mesh.position).sub(_laBonePos); // mesh.position 同理，只讀不改
  if (targetDir.lengthSq() < 1e-8) return;
  targetDir.normalize();

  const dot = clampNum(worldForward.dot(targetDir), -1, 1);
  const angle = Math.acos(dot);
  if (angle < 1e-5) return;
  const axis = _laAxis.crossVectors(worldForward, targetDir);
  if (axis.lengthSq() < 1e-12){
    if(dot>0)return;
    axis.crossVectors(worldForward,Math.abs(worldForward.x)<0.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0));
  }
  axis.normalize();

  applyWorldDeltaQuat(bone, _laDeltaQuat.setFromAxisAngle(axis, angle));
  bone.updateWorldMatrix(true, true);
  context.syncTargetFromBone(cfg.key);
}
return { calibrateHandAim, handAimAxis, captureHandAim, handFollowDirection, updateHandFollowUI, bindHandFollowUI, sampleLACustom, laCustomCenter, selectLACustom, renderLACustomList, rebuildLACustomMeshes, mutateLACustom, updateLACustomVisual, dragLACustom, bindLACustom, cleanLAPath, laPathPoint, updateLAPathUI, stopLAPath, startLAPath, tickLAPath, solveLAPath, restoreLAPath, bindLAPath, solveHandAim, validHandRange, clampHandRangePoint, handRangeDirection, alignHandRange, beginHandRangeDrag, clampHandRangeDrag, bindHandRangeUI, updateHandRangeHelper, updateLookAtRangeUI, updateHeadFollowTarget, updateHeadFollowUI, bindHeadFollowUI, snapshotTorsoLookAt, restoreTorsoLookAt, updateHandAimUI, bindHandAimUI, snapshotHandAim, restoreHandAim, buildLookAtMarkers, syncLookAtMarkerToDefault, setLookAtEnabled, updateLookAtButtons, solveLookAt };
}
