import { t as tr, liveText, liveAttribute } from "../i18n/index.js";
import { touchTimelineEditing } from "../ui/touch-timeline.js";
import { ALL_JOINT_KEYS } from "../rig/definitions.js";
import { eulerToQuat } from "../math/quaternions.js";
import { EASINGS } from "../math/easings.js";
import * as THREE from "three";

// Live host getters preserve shared rig and playback coordination.
export function createWaveTrack(context){
  function syncWaveTrackTarget(k){
    context.poseController.syncFromBone(k, { round: false });
  }

  function waveTrackEnd(){return context.waveClips.reduce((n,c)=>Math.max(n,c.start+c.beats),0);}

  function wavePlaybackEnd(){return Math.max(context.beatGridPoseTotalBeats(),waveTrackEnd());}

  function waveTrackMessage(s){liveText(document.getElementById('waveBakeStatus'), ()=>typeof s==='function'?s():tr(s));liveText(document.getElementById('waveTrackNotice'), ()=>typeof s==='function'?s():tr(s));}

  function waveClipOverlap(start,beats,except){return context.waveClips.some(c=>c.id!==except&&start<c.start+c.beats-1e-8&&start+beats>c.start+1e-8);}

  function waveSnap(v){const step=Number(context.BEAT_GRID_SNAP)||.25;return Math.max(0,Math.round(v/step)*step);}

  function waveClipWeight(c,beat){
    const local=beat-c.start;if(local<=0||local>=c.beats)return 0;
    const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
    const fadeIn=Math.min(c.fadeIn,c.beats/2),fadeOut=Math.min(c.fadeOut,c.beats/2);
    return Math.min(smooth(local/fadeIn),smooth((c.beats-local)/fadeOut));
  }

  function cleanWaveClips(raw){
    if(!Array.isArray(raw))return [];
    const result=[];const ids=new Set();
    const vec=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
    for(const r of raw.slice(0,128).sort((a,b)=>(a?.start||0)-(b?.start||0))){
      if(!r||!Number.isFinite(r.start)||r.start<0||!Number.isFinite(r.beats)||r.beats<.25||r.beats>1024||r.start>100000)continue;
      if(!Array.isArray(r.frames)||r.frames.length<2||r.frames.length>4097)continue;
      if(!r.frames.every(f=>f&&f.angles&&ALL_JOINT_KEYS.every(k=>vec(f.angles[k],3))&&f.body&&vec(f.body.position,3)&&vec(f.body.quaternion,4)))continue;
      if(result.some(c=>r.start<c.start+c.beats-1e-8&&r.start+r.beats>c.start+1e-8))continue;
      const id=typeof r.id==='string'&&!ids.has(r.id)?r.id:context.makeLibId();ids.add(id);
      result.push({id,start:r.start,beats:r.beats,cycles:Math.max(1,Math.min(8,Math.round(Number(r.cycles)||1))),config:context.cleanWave(r.config),
        fadeIn:Math.max(.05,Math.min(r.beats/2,Number(r.fadeIn)||.5)),fadeOut:Math.max(.05,Math.min(r.beats/2,Number(r.fadeOut)||.5)),
        keys:Array.isArray(r.keys)?r.keys.filter(k=>ALL_JOINT_KEYS.includes(k)):ALL_JOINT_KEYS.slice(),
        frames:context.waveClone(r.frames),feet:Array.isArray(r.feet)?context.waveClone(r.feet):null});
    }
    return result;
  }

  function waveBaseAtBeat(beat){
    if(!context.keyframes.length){
      const f=context.waveClips[0]?.frames[0];if(f){context.applyBodyTransform(f.body);for(const k of ALL_JOINT_KEYS)if(context.bones[k]&&context.restQuat[k])context.bones[k].quaternion.copy(context.restQuat[k]).multiply(eulerToQuat(f.angles[k]||[0,0,0]));context.model.updateMatrixWorld(true);}
      return new Set();
    }
    const loc=context.locateKeyframeSegmentAtBeat(beat);context.kfIndex=loc.index;
    if(context.keyframes.length===1){
      const f=context.keyframes[0];context.applyBodyTransform(f.body);
      for(const k of ALL_JOINT_KEYS)if(context.bones[k]&&context.restQuat[k])context.bones[k].quaternion.copy(context.restQuat[k]).multiply(eulerToQuat(f.angles[k]||[0,0,0]));
      context.model.updateMatrixWorld(true);return new Set();
    }
    const a=context.keyframes[loc.index],b=context.keyframes[loc.index+1];
    const t=Math.min(1,loc.localBeat/Math.max(.0001,a.beats||1));
    return context.applyKeyframeFramePose(a,b,(EASINGS[a.easing]||EASINGS.linear)(t));
  }

  function applyWaveTrackAtBeat(beat){
    context.waveTrackActive=false;
    const c=context.waveClips.find(c=>beat>=c.start&&beat<c.start+c.beats);
    document.querySelectorAll('#waveTrackList .waveClip').forEach(el=>el.classList.toggle('activeSeg',el.dataset.id===c?.id));
    if(!c)return;
    const weight=waveClipWeight(c,beat);if(weight<=0)return;
    context.waveTrackActive=true;
    const cursor=Math.max(0,Math.min(c.frames.length-1,(beat-c.start)/c.beats*(c.frames.length-1)));
    const i=Math.min(c.frames.length-2,Math.floor(cursor)),t=cursor-i;
    const a=c.frames[i],b=c.frames[i+1],base={},basePos=context.model.position.clone(),baseQuat=context.model.quaternion.clone();
    // Snapshot the underlying POSE + Groove before temporarily solving the wave candidate.
    for(const k of ALL_JOINT_KEYS)if(context.bones[k])base[k]=context.bones[k].quaternion.clone();
    const body=context.waveHasBody(c.config),keys=body?ALL_JOINT_KEYS:c.keys;
    const qa=new THREE.Quaternion(),qb=new THREE.Quaternion();
    for(const k of keys){if(!context.bones[k]||!context.restQuat[k])continue;
      eulerToQuat(a.angles[k],qa);eulerToQuat(b.angles[k],qb);
      context.bones[k].quaternion.copy(context.restQuat[k]).multiply(qa.slerp(qb,t));
    }
    if(body){
      context.model.position.fromArray(a.body.position).lerp(new THREE.Vector3().fromArray(b.body.position),t);
      context.model.quaternion.fromArray(a.body.quaternion).slerp(new THREE.Quaternion().fromArray(b.body.quaternion),t);
      context.model.updateMatrixWorld(true);
      if(c.feet)context.applyBakedWaveFeet({waveBake:{feet:c.feet}});
    }
    // Blend the solved candidate, including leg compensation. Foot locks release continuously.
    for(const k of keys)if(base[k])context.bones[k].quaternion.copy(base[k].slerp(context.bones[k].quaternion,weight));
    if(body){context.model.position.lerpVectors(basePos,context.model.position.clone(),weight);context.model.quaternion.copy(baseQuat.slerp(context.model.quaternion,weight));}
    context.model.updateMatrixWorld(true);
  }

  function updateWaveTrackPlayback(now){
    const end=wavePlaybackEnd();let beat=Math.max(0,(now-context.grooveStartTime)*context.bpm/60000);
    const range=context.beatGridRangeLoop&&context.hasBeatGridRange();
    const left=range?Math.min(context.beatGridRangeStart,end):0,right=range?Math.min(context.beatGridRangeEnd,end):end;
    if(beat>=right){
      if((range||context.kfLoop)&&right>left){beat=left+(beat-left)%(right-left);context.seekRunningPlaybackToBeat(beat,now);}
      else {waveBaseAtBeat(end);applyWaveTrackAtBeat(end);for(const k of ALL_JOINT_KEYS)syncWaveTrackTarget(k);context.stopKeyframePlayback();return;}
    }
    const blocked=waveBaseAtBeat(beat);
    context.applyGroove(now,blocked);context.applySquatGroove(now,context.grooveStartTime,false,blocked);
    applyWaveTrackAtBeat(beat);
    const loc=context.locateKeyframeSegmentAtBeat(beat);context.kfStartTime=now-loc.localBeat*60000/context.bpm;
    context.updatePlayingKeyframeHighlight();context.updateBeatGridPlaybackUI(now);
  }

  function selectWaveClip(id){
    if(context.kfPlaying)return;context.waveClipSelected=id;context.kfEditingIndex=-1;context.grooveSeqSelectedIndex=-1;context.kfMultiSelected.clear();context.grooveMultiSelected.clear();
    context.renderKeyframeChips();context.renderGrooveSeqChips();renderWaveTrack();
  }

  function editWaveClip(id,patch){
    if(context.kfPlaying)return false;const c=context.waveClips.find(c=>c.id===id);if(!c)return false;
    const next={...c,...patch};
    if(!Number.isFinite(next.start)||next.start<0||next.start>100000||!Number.isFinite(next.beats)||next.beats<.25||next.beats>1024||waveClipOverlap(next.start,next.beats,id)){
      waveTrackMessage(()=>tr("未修改：區塊不可重疊，長度需為 0.25～1024 拍。"));renderWaveTrack();return false;
    }
    next.fadeIn=Math.max(.05,Math.min(next.beats/2,next.fadeIn));next.fadeOut=Math.max(.05,Math.min(next.beats/2,next.fadeOut));
    context.pushHistory();Object.assign(c,next);context.waveClips.sort((a,b)=>a.start-b.start);context.pushHistory();context.scheduleAutoSave();context.renderKeyframeChips();return true;
  }

  function deleteWaveClip(){if(context.kfPlaying)return;context.pushHistory();context.waveClips=context.waveClips.filter(c=>c.id!==context.waveClipSelected);context.waveClipSelected=null;context.pushHistory();context.scheduleAutoSave();context.renderKeyframeChips();}

  function duplicateWaveClip(){
    if(context.kfPlaying)return;if(context.waveClips.length>=128){waveTrackMessage(()=>tr("最多 128 個 WAVING 區塊"));return;}const c=context.waveClips.find(c=>c.id===context.waveClipSelected);if(!c)return;
    const copy=context.waveClone(c);copy.id=context.makeLibId();copy.start=c.start+c.beats;
    while(waveClipOverlap(copy.start,copy.beats,null)){const blockers=context.waveClips.filter(x=>copy.start<x.start+x.beats&&copy.start+copy.beats>x.start);copy.start=Math.max(...blockers.map(x=>x.start+x.beats));}
    context.pushHistory();context.waveClips.push(copy);context.waveClipSelected=copy.id;context.pushHistory();context.scheduleAutoSave();context.renderKeyframeChips();
  }

  function loadWaveClipSettings(){
    if(context.kfPlaying)return;const c=context.waveClips.find(c=>c.id===context.waveClipSelected);if(!c)return;
    context.stopWave();context.waveConfig=context.cleanWave(c.config);context.waveUI();
    document.getElementById('waveBakeCycles').value=c.cycles;
    document.getElementById('waveBakeBeats').value=c.beats/(c.cycles*(c.config.direction==='pingpong'?2:1));
    document.querySelector('.tabBtn[data-tab="waving"]').click();document.getElementById('waveBakeSection').open=true;
    waveTrackMessage(()=>tr("已載入選取區塊設定；調整後按「更新選取區塊」。"));
  }

  function layoutWaveTrack(){
    const host=document.getElementById('waveTrackList');if(!host)return;
    host.style.width=Math.ceil(context.beatGridTimelineBeats()*context.BEAT_GRID_PX_PER_BEAT)+'px';
    for(const el of host.querySelectorAll('.waveClip')){const c=context.waveClips.find(c=>c.id===el.dataset.id);if(c){el.style.left=c.start*context.BEAT_GRID_PX_PER_BEAT+'px';el.style.width=Math.max(8,c.beats*context.BEAT_GRID_PX_PER_BEAT)+'px';}}
  }

  function renderWaveTrack(){
    const host=document.getElementById('waveTrackList');if(!host)return;host.replaceChildren();
    if(!context.waveClips.length){const hint=document.createElement('span');hint.className='small';liveText(hint, ()=>tr("尚未加入 Waving 區塊"));host.append(hint);}
    for(const c of context.waveClips){
      const el=document.createElement('div');el.className='waveClip'+(c.id===context.waveClipSelected?' selected':'');el.dataset.id=c.id;el.tabIndex=0;el.setAttribute('role','button');
      liveText(el, ()=>'🌊 '+({both:tr("雙臂"),left:tr("左手"),right:tr("右手"),custom:tr("局部"),body:tr("身體"),leftBody:tr("左手 → 身體"),rightBody:tr("右手 → 身體")}[c.config.route])+' · '+Number(c.beats.toFixed(2))+tr(" 拍"));
      liveAttribute(el, "title", ()=>tr("起點 Beat ")+(c.start+1)+tr("；拖曳移動，右緣調長度；雙擊編輯波形"));
      const handle=document.createElement('span');handle.className='waveResize';liveAttribute(handle, "title", ()=>tr("拖曳調整長度"));el.append(handle);
      el.ondblclick=()=>{selectWaveClip(c.id);loadWaveClipSettings();};
      el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectWaveClip(c.id);}};
      el.onclick=e=>{if(e.pointerType==='touch'&&!touchTimelineEditing(e))selectWaveClip(c.id);};
      let pointer = null;
      el.onpointerdown=e=>{
        if(!touchTimelineEditing(e)||pointer!==null)return;
        if(context.kfPlaying||e.button!==0)return;e.preventDefault();e.stopPropagation();
        pointer=e.pointerId;
        const resize=e.target===handle,startX=e.clientX,scroll=document.getElementById('beatGridScroll'),startScroll=scroll.scrollLeft,originalStart=c.start,originalBeats=c.beats;
        el.setPointerCapture(e.pointerId);let candidate=resize?originalBeats:originalStart;
        el.onpointermove=ev=>{if(ev.pointerId!==pointer)return;const delta=(ev.clientX-startX+scroll.scrollLeft-startScroll)/context.BEAT_GRID_PX_PER_BEAT;candidate=resize?Math.max(.25,waveSnap(originalBeats+delta)):waveSnap(originalStart+delta);el.style[resize?'width':'left']=candidate*context.BEAT_GRID_PX_PER_BEAT+'px';};
        el.onpointerup=ev=>{if(ev.pointerId!==pointer)return;pointer=null;el.onpointermove=null;el.onpointerup=null;context.waveClipSelected=c.id;context.kfEditingIndex=-1;context.grooveSeqSelectedIndex=-1;
          if(candidate!==(resize?originalBeats:originalStart))editWaveClip(c.id,resize?{beats:candidate}:{start:candidate});else selectWaveClip(c.id);};
        el.onlostpointercapture=ev=>{if(ev.pointerId!==pointer)return;pointer=null;renderWaveTrack();};
        el.onpointercancel=ev=>{if(ev.pointerId!==pointer)return;pointer=null;el.onpointerup=null;el.onpointermove=null;renderWaveTrack();};
      };
      host.append(el);
    }
    const c=context.waveClips.find(c=>c.id===context.waveClipSelected),panel=document.getElementById('waveClipInspector');panel.hidden=!c;
    if(c){for(const [id,v]of Object.entries({waveClipStart:c.start+1,waveClipBeats:c.beats,waveClipFadeIn:c.fadeIn,waveClipFadeOut:c.fadeOut}))document.getElementById(id).value=v;}
    document.getElementById('waveUpdateClip').disabled=!c||context.kfPlaying;
    layoutWaveTrack();
  }

  function bindWaveTrack(){
    document.getElementById('waveTrackAdd').onclick=()=>{document.querySelector('.tabBtn[data-tab="waving"]').click();document.getElementById('waveBakeSection').open=true;};
    document.getElementById('waveClipDelete').onclick=deleteWaveClip;document.getElementById('waveClipDuplicate').onclick=duplicateWaveClip;
    document.getElementById('waveClipEdit').onclick=loadWaveClipSettings;
    document.getElementById('waveUpdateClip').onclick=()=>context.bakeWaveToTimeline(true);
    for(const [id,key]of [['waveClipStart','start'],['waveClipBeats','beats'],['waveClipFadeIn','fadeIn'],['waveClipFadeOut','fadeOut']])document.getElementById(id).onchange=e=>{
      const value=Number(e.target.value)-(key==='start'?1:0);if(!Number.isFinite(value)){renderWaveTrack();return;}editWaveClip(context.waveClipSelected,{[key]:value});};
    renderWaveTrack();
  }
  return { syncWaveTrackTarget, waveTrackEnd, wavePlaybackEnd, waveTrackMessage, waveClipOverlap, waveSnap, waveClipWeight, cleanWaveClips, waveBaseAtBeat, applyWaveTrackAtBeat, updateWaveTrackPlayback, selectWaveClip, editWaveClip, deleteWaveClip, duplicateWaveClip, loadWaveClipSettings, layoutWaveTrack, renderWaveTrack, bindWaveTrack };
}
