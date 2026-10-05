import { t as tr, liveText } from "../i18n/index.js";
import { jointLabel } from "../i18n/joint-labels.js";
import { ALL_JOINT_KEYS, LABEL_LOOKUP } from "../rig/definitions.js";
import { eulerToQuat } from "../math/quaternions.js";
import { TG_KEYS, tgCopy, cleanTGConfig, tgGenerateCandidates } from "../motion/tutting-generator.js";

// Live host getters preserve shared rig and playback coordination.
export function createTuttingController(context){
  function tgConflict(){
    if(!context.model)return '請等待角色載入';
    if(context.kfPlaying||context.waveRun||context.laPathRun||context.groovePreviewEnabled||context.waveTrackActive)return '請先停止時間軸、Waving、律動及軌跡預覽；若剛拖曳 WAVING 游標，請先選取一個 POSE。';
    if(Object.values(context.ikEnabled).some(Boolean)||context.spineIKEnabled||Object.values(context.fingerIKEnabled).some(Boolean)||Object.values(context.lookAtEnabled).some(Boolean)||context.footPlantEnabled)return '請先關閉 IK、LookAt 與腳底固定，再使用生成器。';
    if(context.handCollisionEnabled||context.handHandCollisionEnabled)return '請先關閉手部碰撞回彈，以免生成姿勢被碰撞修正改寫。';
    return '';
  }

  function tgSay(s){const el=document.getElementById('tgStatus');if(el)liveText(el, ()=>typeof s==='function'?s():tr(s));}

  function tgDrawPose(p,body){if(!context.model)return;for(const k of ALL_JOINT_KEYS)if(context.bones[k]&&context.restQuat[k]&&p[k])context.bones[k].quaternion.copy(context.restQuat[k]).multiply(eulerToQuat(p[k]));if(body)context.applyBodyTransform(body);context.model.updateMatrixWorld(true);}

  function tgCancelPreview(){if(!context.tgPreview)return;const old=context.tgPreview;context.tgPreview=null;tgDrawPose(context.poseController.snapshotTarget(),old.body);tgUI();}

  function tgClear(){tgCancelPreview();context.tgCandidates=[];context.tgIndex=-1;context.tgSignature='';tgUI();}

  function tgRuleSignature(){return JSON.stringify({config:context.tgConfig,limits:context.JOINT_LIMITS,base:context.tgBase});}

  function tgCapture(){
    const conflict=tgConflict();if(conflict){tgSay(conflict);return;}
    tgCancelPreview();context.pushHistory();context.tgBase={angles:context.poseController.snapshotTarget(),body:context.snapshotBodyTransform()};tgClear();context.pushHistory();context.scheduleAutoSave();tgUI();tgSay(()=>tr("已擷取基礎姿勢。未勾選部位保留局部角度，仍可能隨上游骨骼移動。"));
  }

  function tgGenerate(){
    const conflict=tgConflict();if(conflict){tgSay(conflict);return;}
    if(!tgReadSettings())return;
    if(!context.tgBase)tgCapture();if(!context.tgBase)return;
    tgCancelPreview();const result=tgGenerateCandidates(context.tgBase.angles,context.tgConfig,TG_KEYS.filter(k=>context.bones[k]),context.clampJointAngles);
    context.tgCandidates=result.results;context.tgIndex=context.tgCandidates.length?0:-1;context.tgSignature=tgRuleSignature();tgUI();
    tgSay(()=>context.tgCandidates.length?tr("產生 {p0}／6 個不重複候選；依總角度變化由小到大排列。{p1}", {p0:context.tgCandidates.length, p1:context.tgCandidates.length<6?tr("在本次搜尋上限內未找到更多結果，可換種子或放寬條件。"):''}):tr("本次搜尋未找到符合條件的變化。請檢查活動軸、角度集合、變化上限與關節限制；不會自動放寬規則。"));
    if(context.tgIndex>=0)tgShow(0);
  }

  function tgValidCandidate(){
    if(context.tgIndex<0||!context.tgCandidates[context.tgIndex])return false;
    if(context.tgSignature!==tgRuleSignature()){tgClear();tgSay(()=>tr("規則或基礎姿勢已變更，請重新生成。"));return false;}return true;
  }

  function tgShow(index){
    const conflict=tgConflict();if(conflict){tgSay(conflict);return;}
    context.tgIndex=Math.max(0,Math.min(context.tgCandidates.length-1,index));if(!tgValidCandidate())return;
    if(!context.tgPreview)context.tgPreview={body:context.snapshotBodyTransform()};tgDrawPose(context.tgCandidates[context.tgIndex].angles,context.tgBase.body);tgUI();
  }

  function tgTick(){if(!context.tgPreview)return;const conflict=tgConflict();if(conflict||context.tgSignature!==tgRuleSignature()){tgCancelPreview();tgSay(()=>tr(conflict)||tr("規則已變更，請重新生成。"));return;}tgDrawPose(context.tgCandidates[context.tgIndex].angles,context.tgBase.body);}

  function tgCommit(toTimeline=false){
    const conflict=tgConflict();if(conflict){tgSay(conflict);return false;}if(!tgValidCandidate())return false;
    const p=context.tgCandidates[context.tgIndex];tgCancelPreview();context.pushHistory();
    context.poseController.restoreTarget(p.angles, { clamp: false });
    tgDrawPose(p.angles,context.tgBase.body);context.setActiveBtn(-1);context.updateSelectedBar();
    if(toTimeline)context.addKeyframe();context.pushHistory();context.scheduleAutoSave();tgUI();tgSay(()=>toTimeline?tr("已加入一個 POSE 拍點，可用 Undo 復原。"):tr("已套用候選姿勢，可用 Undo 復原。"));return true;
  }

  function tgReadSettings(){
    const input=document.getElementById('tgValues'),tokens=input.value.trim().split(/[,，、\s]+/).filter(Boolean),values=tokens.map(Number);
    if(!values.length||values.length>24||values.some(v=>!Number.isFinite(v)||Math.abs(v)>180)){tgSay(()=>tr("請輸入 1～24 個 −180～180° 的數值，以逗號分隔。"));return false;}
    const axes={};for(const k of TG_KEYS)axes[k]=['x','y','z'].filter(a=>document.getElementById('tg_'+k+'_'+a).checked);
    const maxDelta=Number(document.getElementById('tgMaxDelta').value),maxJoints=Number(document.getElementById('tgMaxJoints').value),seed=Number(document.getElementById('tgSeed').value);
    if(!Number.isFinite(maxDelta)||maxDelta<1||maxDelta>180||!Number.isInteger(maxJoints)||maxJoints<1||maxJoints>8||!Number.isInteger(seed)||seed<0||seed>4294967295){tgSay(()=>tr("每軸上限需為 1～180°、最多關節數為 1～8，種子為 0～4294967295 的整數。"));return false;}
    const next=cleanTGConfig({mode:document.getElementById('tgMode').value,values,maxDelta,maxJoints,seed,axes});
    if(JSON.stringify(next)!==JSON.stringify(context.tgConfig)){tgClear();context.pushHistory();context.tgConfig=next;context.pushHistory();context.scheduleAutoSave();}
    return true;
  }

  function tgUI(){
    const el=document.getElementById('tgCandidateInfo');if(!el)return;
    const candidate=context.tgCandidates[context.tgIndex];liveText(el, ()=>candidate?tr("候選 {p0}／{p1} · 改動：{p2} · 最大每軸變化 {p3}° · TG-1 角度／部位規則符合{p4}", {p0:context.tgIndex+1, p1:context.tgCandidates.length, p2:candidate.changed.map(k=>jointLabel(k)).join('、'), p3:candidate.maxDelta.toFixed(1), p4:context.tgPreview?tr(" · 預覽中（尚未套用）"):''}):tr("尚未產生候選"));
    for(const id of ['tgApply','tgAddPose','tgSavePose','tgPrev','tgNext','tgPreviewBtn'])document.getElementById(id).disabled=!candidate;
    document.getElementById('tgPrev').disabled=!candidate||context.tgIndex<=0;document.getElementById('tgNext').disabled=!candidate||context.tgIndex>=context.tgCandidates.length-1;
    document.getElementById('tgCancel').disabled=!context.tgPreview;
    liveText(document.getElementById('tgBaseInfo'), ()=>context.tgBase?tr("已有基礎姿勢；再次生成仍以此姿勢為起點。"):tr("尚未擷取；首次生成會使用目前姿勢。"));
  }

  function tgConfigUI(){
    if(!document.getElementById('tgMode'))return;
    for(const [id,v]of Object.entries({tgMode:context.tgConfig.mode,tgValues:context.tgConfig.values.join(', '),tgMaxDelta:context.tgConfig.maxDelta,tgMaxJoints:context.tgConfig.maxJoints,tgSeed:context.tgConfig.seed}))document.getElementById(id).value=v;
    for(const k of TG_KEYS)for(const a of ['x','y','z']){const el=document.getElementById('tg_'+k+'_'+a);if(el)el.checked=context.tgConfig.axes[k].includes(a);}tgUI();
  }

  function snapshotTG(){return {config:tgCopy(context.tgConfig),base:tgCopy(context.tgBase)};}

  function restoreTG(data){
    tgClear();context.tgConfig=cleanTGConfig(data?.config);context.tgBase=null;const b=data?.base;
    const vec=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
    if(b?.angles&&ALL_JOINT_KEYS.every(k=>vec(b.angles[k],3))&&vec(b.body?.position,3)&&vec(b.body?.quaternion,4))context.tgBase=tgCopy(b);
    tgConfigUI();
  }

  function snapshotGenerationRules(){return {limits:tgCopy(context.JOINT_LIMITS),isolation:tgCopy(context.isolationSettings),gridStep:Number(document.getElementById('jlGridStepInput')?.value)||15,edgeProb:Number(document.getElementById('jlEdgeProbInput')?.value)||0};}

  function restoreGenerationRules(raw){
    if(!raw)return;
    const limits=context.defaultJointLimits();for(const k of context.JOINT_LIMIT_KEYS)for(const axis of ['x','y','z']){const v=raw.limits?.[k]?.[axis];if(v&&Number.isFinite(v.min)&&Number.isFinite(v.max))limits[k][axis]={enabled:v.enabled===true,min:Math.min(v.min,v.max),max:Math.max(v.min,v.max)};}context.JOINT_LIMITS=limits;
    const iso=raw.isolation||{};context.isolationSettings={enabled:iso.enabled===true,minGroups:Math.max(1,Math.min(50,Math.round(Number(iso.minGroups)||1))),maxGroups:Math.max(1,Math.min(50,Math.round(Number(iso.maxGroups)||2))),weights:{},jointWeights:{}};
    for(const [k,v]of Object.entries(iso.weights||{}))if(Number.isFinite(v)&&v>=0)context.isolationSettings.weights[k]=v;
    for(const [k,v]of Object.entries(iso.jointWeights||{}))if(context.JOINT_LIMIT_KEYS.includes(k)&&Number.isFinite(v)&&v>=0&&v<=100)context.isolationSettings.jointWeights[k]=v;
    document.getElementById('jlGridStepInput').value=Math.max(1,Math.min(360,Number(raw.gridStep)||15));document.getElementById('jlEdgeProbInput').value=Math.max(0,Math.min(100,Number(raw.edgeProb)||0));
    context.saveJointLimits();context.saveIsolationSettings();if(context.model)context.buildJointLimitPanel();
  }

  function bindTG(){
    const host=document.getElementById('tgParts');for(const k of TG_KEYS){const row=document.createElement('div');row.className='tgPart';const label=document.createElement('strong');liveText(label, ()=>jointLabel(k));row.append(label);
      for(const a of ['x','y','z']){const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.id='tg_'+k+'_'+a;l.append(c,a.toUpperCase());row.append(l);c.onchange=()=>tgReadSettings();}host.append(row);}
    document.getElementById('tgCapture').onclick=tgCapture;document.getElementById('tgGenerate').onclick=tgGenerate;
    document.getElementById('tgPrev').onclick=()=>tgShow(context.tgIndex-1);document.getElementById('tgNext').onclick=()=>tgShow(context.tgIndex+1);
    document.getElementById('tgPreviewBtn').onclick=()=>tgShow(context.tgIndex);document.getElementById('tgCancel').onclick=tgCancelPreview;
    document.getElementById('tgApply').onclick=()=>tgCommit();document.getElementById('tgAddPose').onclick=()=>tgCommit(true);
    document.getElementById('tgSavePose').onclick=()=>{if(tgCommit()){context.poseLibCtrl.saveCurrent(document.getElementById('tgPoseName').value.trim()||'Tutting 候選');tgSay(()=>tr("已套用並存入姿勢庫；姿勢庫項目沿用既有獨立保存方式。"));}};
    document.getElementById('tgNewSeed').onclick=()=>{document.getElementById('tgSeed').value=(context.tgConfig.seed+1)>>>0;if(tgReadSettings())tgGenerate();};
    for(const id of ['tgMode','tgValues','tgMaxDelta','tgMaxJoints','tgSeed'])document.getElementById(id).onchange=()=>tgReadSettings();
    // Cancel transient preview before external UI mutations; camera orbit remains available.
    document.addEventListener('pointerdown',e=>{if(context.tgPreview&&e.target.closest?.('#uiCommon, .floatablePanel'))tgCancelPreview();},true);
    for(const id of ['jlGridStepInput','jlEdgeProbInput']){const el=document.getElementById(id);el.addEventListener('focus',()=>context.pushHistory());el.addEventListener('change',()=>{context.pushHistory();context.scheduleAutoSave();});}
    tgConfigUI();
  }
  return { tgConflict, tgSay, tgDrawPose, tgCancelPreview, tgClear, tgRuleSignature, tgCapture, tgGenerate, tgValidCandidate, tgShow, tgTick, tgCommit, tgReadSettings, tgUI, tgConfigUI, snapshotTG, restoreTG, snapshotGenerationRules, restoreGenerationRules, bindTG };
}
