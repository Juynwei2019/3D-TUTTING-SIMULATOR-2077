import { t as tr, liveText } from "../i18n/index.js";
import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";
import * as THREE from "three";

// Live host getters preserve shared rig and playback coordination.
export function createPoleEditor(context){
function poleMid(limb){
  const b=context.bones[IK_CHAINS[limb]?.mid];
  return b ? b.getWorldPosition(new THREE.Vector3()) : null;
}

function poleRadius(limb){
  if (Number.isFinite(context.poleRadiusCustom[limb]) && context.poleRadiusCustom[limb]>=0.01) return context.poleRadiusCustom[limb];
  const c=IK_CHAINS[limb], a=context.bones[c.root], b=context.bones[c.mid], e=context.bones[c.end];
  if (!a || !b || !e) return 0.4;
  const x=a.getWorldPosition(new THREE.Vector3()), y=b.getWorldPosition(new THREE.Vector3()), z=e.getWorldPosition(new THREE.Vector3());
  return Math.max(0.01, (x.distanceTo(y)+y.distanceTo(z))*0.5);
}

function snapshotPoleEditor(){
  const limbs={};
  for(const limb of IK_LIMB_KEYS) limbs[limb]={enabled:context.ikEnabled[limb],pole:context.ikPoleMeshes[limb]?.position.toArray(),target:context.ikTargetMeshes[limb]?.position.toArray()};
  return {radii:{...context.poleRadiusCustom},limbs};
}

function restorePoleEditor(state){
  context.poleDrag=null; context.poleRadiusCustom={};
  for(const limb of IK_LIMB_KEYS){
    const r=state?.radii?.[limb];
    if(Number.isFinite(r)&&r>=0.01) context.poleRadiusCustom[limb]=r;
    const v=state?.limbs?.[limb]; if(!v) continue;
    if(typeof v.enabled==='boolean') context.setIKEnabled(limb,v.enabled);
    for(const [key,meshes] of [['pole',context.ikPoleMeshes],['target',context.ikTargetMeshes]])
      if(Array.isArray(v[key])&&v[key].length===3&&v[key].every(Number.isFinite)&&meshes[limb]) meshes[limb].position.fromArray(v[key]);
  }
  updatePoleRadiusUI();
}

function alignPoleInRadius(limb){
  const c=IK_CHAINS[limb], mid=poleMid(limb), pole=context.ikPoleMeshes[limb];
  if(!mid||!pole||!context.bones[c.root]) return false;
  const root=context.bones[c.root].getWorldPosition(new THREE.Vector3());
  const axis=context.ikTargetMeshes[limb].position.clone().sub(root);
  if(axis.lengthSq()<1e-10) return false;
  axis.normalize();
  const side=pole.position.clone().sub(root); side.addScaledVector(axis,-side.dot(axis));
  if(side.lengthSq()<1e-8){side.copy(mid).sub(root);side.addScaledVector(axis,-side.dot(axis));}
  if(side.lengthSq()<1e-8) return false;
  side.normalize();
  const candidate=mid.clone().addScaledVector(side,poleRadius(limb)*0.8);
  const projected=candidate.clone().sub(root);projected.addScaledVector(axis,-projected.dot(axis));
  if(projected.dot(side)<=1e-6 || projected.clone().cross(side).length()>1e-5) return false;
  pole.position.copy(candidate);return true;
}

function updatePoleRadiusUI(){
  const panel=document.getElementById('poleRadiusPanel'); if(!panel) return;
  const limb=context.selectedIK?.role==='pole'&&IK_CHAINS[context.selectedIK.limb]?context.selectedIK.limb:null;
  panel.style.display=limb?'':'none';
  if(!limb) return;
  liveText(document.getElementById('poleRadiusTitle'), ()=>tr(IK_CHAINS[limb].label)+tr("・極向球範圍"));
  document.getElementById('poleRadiusInput').value=Number(poleRadius(limb).toFixed(4));
}

function bindPoleRadiusUI(){
  const input=document.getElementById('poleRadiusInput');
  const change=(reset)=>{
    const limb=context.selectedIK?.role==='pole'?context.selectedIK.limb:null;
    if(!IK_CHAINS[limb]||context.poleDrag||context.kfPlaying) return;
    const r=Number(input.value);
    if(!reset&&(!Number.isFinite(r)||r<0.01)){updatePoleRadiusUI();return;}
    context.pushHistory();
    if(reset) delete context.poleRadiusCustom[limb]; else context.poleRadiusCustom[limb]=r;
    const mid=poleMid(limb);
    const ok=!mid||context.ikPoleMeshes[limb].position.distanceTo(mid)<=poleRadius(limb)||alignPoleInRadius(limb);
    liveText(document.getElementById('poleRadiusNotice'), ()=>ok?'':tr("目前方向無法安全對齊，請先調整肢體姿勢再對齊。"));
    updatePoleRadiusUI();context.pushHistory();context.scheduleAutoSave();
  };
  input.onchange=()=>change(false);
  document.getElementById('poleRadiusDefault').onclick=()=>change(true);
  document.getElementById('poleRadiusAlign').onclick=()=>{
    if(context.selectedIK?.role!=='pole'||context.kfPlaying||context.poleDrag)return;
    context.pushHistory();const ok=alignPoleInRadius(context.selectedIK.limb);
    liveText(document.getElementById('poleRadiusNotice'), ()=>ok?tr("已保留彎曲方向並對齊。"):tr("肢體方向退化或不一致，請先稍微彎曲肢體再試。"));
    context.pushHistory();context.scheduleAutoSave();
  };
}

function beginPoleDrag(){
  if(context.selectedIK?.role!=='pole'||!IK_CHAINS[context.selectedIK.limb]) return;
  const limb=context.selectedIK.limb, center=poleMid(limb), mesh=context.ikPoleMeshes[limb];
  if(!center)return;
  // No relocation during mouseDown: TransformControls has already captured its start position.
  if(context.kfPlaying||mesh.position.distanceTo(center)>poleRadius(limb)+1e-7){
    context.poleDrag={limb,blocked:true,start:mesh.position.clone()};
    liveText(document.getElementById('poleRadiusNotice'), ()=>tr("請先按「對齊目前彎曲方向」再拖曳；播放時請先暫停。"));
    return;
  }
  context.pushHistory();context.poleDrag={limb,center,radius:poleRadius(limb)};
  liveText(document.getElementById('poleRadiusNotice'), ()=>'');
}

function clampPoleDrag(){
  if(!context.poleDrag)return;
  const p=context.ikPoleMeshes[context.poleDrag.limb].position;
  if(context.poleDrag.blocked){p.copy(context.poleDrag.start);return;}
  const delta=p.clone().sub(context.poleDrag.center);
  if(delta.length()>context.poleDrag.radius) p.copy(context.poleDrag.center).add(delta.setLength(context.poleDrag.radius));
}

function updatePoleRange(){
  const limb=context.selectedIK?.role==='pole'&&IK_CHAINS[context.selectedIK.limb]?context.selectedIK.limb:null;
  if(!limb||!context.ikPoleMeshes[limb]?.visible||context.kfPlaying){if(context.poleRangeHelper)context.poleRangeHelper.visible=false;return;}
  if(!context.poleRangeHelper){
    context.poleRangeHelper=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1,16,10)),new THREE.LineBasicMaterial({color:0xccff33,transparent:true,opacity:0.18,depthTest:false,depthWrite:false}));
    context.poleRangeHelper.renderOrder=997;context.scene.add(context.poleRangeHelper);
  }
  const center=context.poleDrag?.center||poleMid(limb);if(!center)return;
  context.poleRangeHelper.visible=true;context.poleRangeHelper.position.copy(center);context.poleRangeHelper.scale.setScalar(context.poleDrag?.radius||poleRadius(limb));
}
return { poleMid, poleRadius, snapshotPoleEditor, restorePoleEditor, alignPoleInRadius, updatePoleRadiusUI, bindPoleRadiusUI, beginPoleDrag, clampPoleDrag, updatePoleRange };
}
