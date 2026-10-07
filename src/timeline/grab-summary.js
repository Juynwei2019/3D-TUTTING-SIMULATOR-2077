import { cleanGrabFrame } from './grab-state.js';

export function grabStatus(raw){
  const state=cleanGrabFrame(raw);
  if(!state)return '無扶握資料';
  if(!state.visible)return '形狀已隱藏';
  const {rArm:r,lArm:l}=state.grabbed;
  return r&&l?'雙手扶握':r?'右手扶握':l?'左手扶握':'形狀已顯示・未扶握';
}
export function grabEvents(previous,current,first=false){
  const a=cleanGrabFrame(previous),b=cleanGrabFrame(current);
  if(first)return b?['初始狀態']:[];
  if(!a&&!b)return [];
  const events=[];
  const changes=['rArm','lArm'].map(limb=>{
    const before=!!(a?.visible&&a.grabbed[limb]),after=!!(b?.visible&&b.grabbed[limb]);
    return before===after?'':after?'start':'release';
  });
  if(changes[0]&&changes[0]===changes[1])events.push(changes[0]==='start'?'雙手開始扶握':'雙手放手');
  else changes.forEach((change,i)=>{if(change)events.push(change==='start'?(i===0?'右手開始扶握':'左手開始扶握'):(i===0?'右手放手':'左手放手'));});
  if(a?.visible&&!b?.visible)events.push('形狀隱藏');
  return events;
}
export function grabDetails(raw){
  const state=cleanGrabFrame(raw);
  return state?{status:grabStatus(state),shape:{box:'長方體',sphere:'球體',cylinder:'圓柱'}[state.shapeType],aligned:state.palmAligned,twist:state.palmTwist}:null;
}
export function countGrabFrames(frames){return frames.filter(frame=>cleanGrabFrame(frame.grabBox)).length;}

// Compare saved pose fields only; camera, UI, rig revision and editor mode are excluded.
export function poseEditSignature(pose){
  const normalize=value=>{
    if(typeof value==='number')return Math.round(value*10000)/10000;
    if(Array.isArray(value))return value.map(normalize);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])]));
    return value;
  };
  return JSON.stringify(normalize(pose));
}
export function grabRecordGuard({ready,playing,multi,editing,selected,preview},update=false){
  if(!ready)return '模型載入中，請稍候。';
  if(playing)return '請先停止播放，再記錄拍點。';
  if(multi)return '請切回單選模式，再記錄拍點。';
  if(editing)return '請完成目前拖曳或調整，再記錄拍點。';
  if(update&&selected<0)return '請先選取要更新的拍點。';
  if(update&&preview)return '預覽中，請重新選取拍點後更新。';
  return '';
}
