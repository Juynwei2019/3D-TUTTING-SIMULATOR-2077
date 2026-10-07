import { cleanGrabFrame } from '../timeline/grab-state.js';
import { t, liveText } from '../i18n/index.js';
import { grabStatus, grabDetails, grabEvents, poseEditSignature, grabRecordGuard } from '../timeline/grab-summary.js';

export function grabTimelineHTML(){
  return `<fieldset class="grabCard grabTimelineCard"><legend data-i18n="扶握時間軸">${t('扶握時間軸')}</legend>
    <p id="grabTimelineTarget" class="grabHint"></p><p id="grabTimelineScene" class="grabHint"></p>
    <div class="grabTimelineActions"><button id="grabTimelineAdd" type="button"></button><button id="grabTimelineUpdate" type="button"></button><button id="grabTimelineView" type="button" data-i18n="查看時間軸">${t('查看時間軸')}</button></div>
    <p class="grabHint" data-i18n="記錄整個角色姿勢與扶握箱；更新會覆寫選取拍點的姿勢。">${t('記錄整個角色姿勢與扶握箱；更新會覆寫選取拍點的姿勢。')}</p>
    <p id="grabTimelineHint" class="grabHint"></p><p id="grabTimelineDirty" class="grabHint grabDraft"></p>
    <p id="grabTimelineResult" class="grabHint" role="status" aria-live="polite"></p></fieldset>`;
}
export function formatGrabSummary(raw){
  const info=grabDetails(raw);
  return info?`${t(info.status)} · ${t(info.shape)} · ${t(info.aligned?'掌面貼合：開':'掌面貼合：關')} · ${t('右腕 {right}°／左腕 {left}°',{right:Math.round(info.twist.rArm),left:Math.round(info.twist.lArm)})}`:t('無扶握資料');
}
export function formatGrabFrame(frame,previous,index){
  const events=grabEvents(previous?.grabBox,frame?.grabBox,index===0).map(key=>t(key));
  return `${formatGrabSummary(frame?.grabBox)}${events.length?' · '+events.join('・'):''}`;
}
export function createGrabTimelineUI(context,doc=document){
  let preview=false,baseline=null,knownFrame=null,knownIndex=-1,lastTick=-Infinity;
  let announcement=null;
  const capture=()=>poseEditSignature(context.capture());
  const savedBaseline=frame=>{
    const live=context.capture();
    return poseEditSignature({angles:Object.fromEntries(Object.keys(live.angles).map(key=>[key,frame.angles[key]||[0,0,0]])),body:frame.body||live.body,grabBox:cleanGrabFrame(frame.grabBox)});
  };
  const selection=()=>!context.multi&&context.frames[context.index]?context.index:-1;
  const view=()=>({ready:context.ready,playing:context.playing,multi:context.multi,editing:context.editing,selected:selection(),preview});
  function selected(){
    preview=false;announcement=null;knownIndex=selection();knownFrame=context.frames[knownIndex]||null;
    baseline=context.ready&&knownFrame?savedBaseline(knownFrame):null;refresh();
  }
  function reset(){preview=false;announcement=null;knownFrame=null;knownIndex=-1;baseline=null;}
  function record(update){
    if(grabRecordGuard(view(),update))return false;
    context.pushHistory();
    if(update)context.update();else context.add();
    context.pushHistory();selected();
    announcement={key:update?'已更新 F{frame}：{status}':'已新增 F{frame}：{status}',values:{frame:context.index+1,status:grabStatus(context.frames[context.index]?.grabBox)}};
    refresh();return true;
  }
  function isDirty(){return !!(baseline&&context.ready&&!context.playing&&!preview&&!context.editing&&baseline!==capture());}
  function refresh(){
    const index=selection(),frame=context.frames[index]||null;
    if(frame!==knownFrame||index!==knownIndex){knownFrame=frame;knownIndex=index;baseline=context.ready&&frame?savedBaseline(frame):null;announcement=null;}
    const tween=doc.getElementById('grabSizeTween');if(tween)tween.disabled=!context.ready||context.playing||context.editing;
    const state=view(),addReason=grabRecordGuard(state),updateReason=grabRecordGuard(state,true);
    const add=doc.getElementById('grabTimelineAdd'),update=doc.getElementById('grabTimelineUpdate');
    if(add){add.disabled=!!addReason;liveText(add,()=>t('＋新增拍點'));}
    if(update){update.disabled=!!updateReason;liveText(update,()=>index>=0?t('更新 F{frame}',{frame:index+1}):t('更新拍點'));}
    // Apply the same preview/selection protection to the original timeline button.
    const original=doc.getElementById('kfUpdateBtn');if(original)original.disabled=!!updateReason;
    const originalAdd=doc.getElementById('kfAddBtn');if(originalAdd)originalAdd.disabled=!!addReason;
    liveText(doc.getElementById('grabTimelineTarget'),()=>index>=0?t('目前選取：F{frame}；新增會插在其後。',{frame:index+1}):t('未選取拍點；新增會放在末尾。'));
    liveText(doc.getElementById('grabTimelineScene'),()=>context.ready?formatGrabSummary(context.currentGrab()):t('模型載入中，請稍候。'));
    liveText(doc.getElementById('grabTimelineHint'),()=>t(addReason||updateReason));
    const dirty=isDirty();
    liveText(doc.getElementById('grabTimelineDirty'),()=>dirty?t('目前調整尚未寫入 F{frame}',{frame:index+1}):'');
    liveText(doc.getElementById('grabTimelineResult'),()=>announcement?t(announcement.key,{...announcement.values,status:t(announcement.values.status)}):'');
    liveText(doc.getElementById('kfGrabSummary'),()=>index>=0?`F${index+1} · ${formatGrabFrame(frame,context.frames[index-1],index)}${preview?' · '+t('預覽中'):''}`:t(context.multi?'POSE 多選':'未選取拍點'));
  }
  function mount(){
    doc.getElementById('grabTimelineAdd').onclick=()=>record(false);
    doc.getElementById('grabTimelineUpdate').onclick=()=>record(true);
    doc.getElementById('grabTimelineView').onclick=()=>context.showTimeline();
    refresh();
  }
  return {mount,refresh,selected,reset,record,get dirty(){return isDirty();},get preview(){return preview;},previewed(){preview=true;announcement=null;refresh();},tick(now){if(now-lastTick<150)return;lastTick=now;if(context.ready)refresh();}};
}
