import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointerTap } from '../src/interaction/pointer-tap.js';
import { createTimelineReorder } from '../src/timeline/reorder.js';
import { createTimelineResize } from '../src/timeline/resize.js';
const event=(id,x=0,type='touch')=>({pointerId:id,clientX:x,clientY:0,pointerType:type,button:0,preventDefault(){},stopPropagation(){}});

test('pinch, drag returning to origin and cancelled pointers never become taps; subsequent taps recover',()=>{
  const tap=createPointerTap();tap.down(event(1));tap.down(event(2));
  assert.equal(tap.up(event(2)),false);assert.equal(tap.up(event(1)),false);
  tap.down(event(3));tap.move(event(3,30));assert.equal(tap.up(event(3)),false);
  tap.down(event(4));tap.cancel(event(4));assert.equal(tap.up(event(4)),false);
  tap.down(event(5));assert.equal(tap.up(event(99)),false);assert.equal(tap.up(event(5,5)),true);
  tap.down(event(6));tap.invalidate();assert.equal(tap.up(event(6)),false);
  tap.down(event(7));assert.equal(tap.up(event(7)),true);
});

test('touch reorder moves selected pose and groove groups as one edit, blocks playback and edges',()=>{
  let history=0,saves=0;
  const host={keyframes:['a','b','c','d'],grooveSequence:['x','y','z'],kfMultiSelectMode:true,kfMultiSelected:new Set([1,2]),grooveMultiSelected:new Set([1]),renderKeyframeChips(){},renderGrooveSeqChips(){},updateKfMultiSelectBar(){},scheduleAutoSave(){saves++;},pushHistory(){history++;}};
  const edit=createTimelineReorder(host);
  assert.equal(edit.stepTimelineSelection('pose',-1),true);assert.deepEqual(host.keyframes,['b','c','a','d']);
  assert.equal(edit.stepTimelineSelection('pose',-1),false);
  assert.equal(edit.stepTimelineSelection('groove',1),true);assert.deepEqual(host.grooveSequence,['x','z','y']);
  host.kfPlaying=true;assert.equal(edit.stepTimelineSelection('pose',1),false);
  host.kfPlaying=false;host.kfMultiSelectMode=false;host.kfEditingIndex=host.keyframes.length;
  assert.equal(edit.stepTimelineSelection('pose',-1),false);
  assert.equal(history,2);assert.equal(saves,2);
});

test('resize ignores other fingers and cancellation restores duration without history or saving',()=>{
  const previous=globalThis.document;let beats=2,history=0,saves=0;
  globalThis.document={getElementById(){return null;},documentElement:{classList:{contains(){return true;}}}};
  const handlers=new Map();const handle={classList:{add(){},remove(){}},setPointerCapture(){},releasePointerCapture(){},addEventListener(k,v){handlers.set(k,v);},removeEventListener(k){handlers.delete(k);}};
  const chip={draggable:true,classList:handle.classList};
  const edit=createTimelineResize({BEAT_GRID_SNAP:.25,BEAT_GRID_PX_PER_BEAT:100,scheduleAutoSave(){saves++;},pushHistory(){history++;}});
  try{
    const config={chip,handle,getBeats:()=>beats,setBeats:v=>beats=v,updateLayout(){}};
    edit.beginTimelineResize(event(1),config);
    handlers.get('pointermove')(event(2,100));assert.equal(beats,2);
    handlers.get('pointerup')(event(2,100));assert.ok(handlers.has('pointermove'));
    handlers.get('pointermove')(event(1,100));assert.equal(beats,3);
    handlers.get('pointercancel')(event(1));assert.equal(beats,2);assert.equal(history,0);assert.equal(saves,0);assert.equal(chip.draggable,true);
    edit.beginTimelineResize(event(3),config);handlers.get('pointermove')(event(3,50));handlers.get('pointerup')(event(3,50));assert.equal(beats,2.5);assert.equal(history,1);assert.equal(saves,1);
  }finally{globalThis.document=previous;}
});

test('multi-touch rolls back gizmo drags and restores enabled state without enabling FK during playback',async()=>{
  const { bindGizmoTouch }=await import('../src/interaction/gizmo-touch.js');
  const handlers=new Map(),element={};let resets=0,playing=false;
  const gizmos=[0,1].map(()=>({enabled:true,dragging:false,reset(){resets++;},pointerUp(){this.dragging=false;}}));
  bindGizmoTouch({element,gizmos,isPlaying:()=>playing,events:{addEventListener(k,f){handlers.set(k,f);}}});
  handlers.get('pointerdown')({...event(1),target:element});gizmos[0].dragging=true;
  handlers.get('pointerdown')({...event(2),target:element});assert.equal(resets,1);assert.ok(gizmos.every(g=>!g.enabled));
  handlers.get('pointerup')({...event(2),type:'pointerup'});assert.ok(gizmos.every(g=>!g.enabled));
  playing=true;handlers.get('pointerup')({...event(1),type:'pointerup'});assert.equal(gizmos[0].enabled,false);assert.equal(gizmos[1].enabled,true);
  playing=false;handlers.get('pointerdown')({...event(3),target:element});gizmos[1].dragging=true;
  handlers.get('pointercancel')({...event(3),type:'pointercancel'});assert.equal(resets,2);assert.equal(gizmos[1].dragging,false);
});
