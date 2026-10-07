import test from 'node:test';
import assert from 'node:assert/strict';
import {grabStatus,grabEvents,countGrabFrames,poseEditSignature,grabRecordGuard} from '../src/timeline/grab-summary.js';
import {GRAB_SHAPE_DEFAULTS} from '../src/interaction/grab-shapes.js';
import {cleanGrabFrame} from '../src/timeline/grab-state.js';
import {createGrabTimelineUI} from '../src/ui/grab-timeline.js';
import {createPoseEditor} from '../src/timeline/pose-editor.js';
import {createHistory} from '../src/history/history-controller.js';
import {createTimelineSelection} from '../src/timeline/selection-clipboard.js';
import {createRangeEditor} from '../src/timeline/range-editor.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const doc={getElementById:()=>null};
const grab=(r=true,l=true,visible=true)=>cleanGrabFrame({version:1,visible,shapeType:'box',shapeParams:GRAB_SHAPE_DEFAULTS,position:[0,1,0],quaternion:[0,0,0,1],grabbed:{rArm:r,lArm:l},grabLocal:{rArm:[-.16,0,0],lArm:[.16,0,0]},palmAligned:true});
const pose=(g=grab())=>({angles:{hips:[0,0,0]},body:{position:[0,0,0],quaternion:[0,0,0,1]},grabBox:g});
test('summary distinguishes hidden, unattached, single hand and legacy data',()=>{
 assert.deepEqual([grabStatus(grab()),grabStatus(grab(true,false)),grabStatus(grab(false,true)),grabStatus(grab(false,false)),grabStatus(grab(false,false,false)),grabStatus(undefined)],['雙手扶握','右手扶握','左手扶握','形狀已顯示・未扶握','形狀已隱藏','無扶握資料']);
 assert.equal(countGrabFrames([pose(),pose(null),{grabBox:{version:99}}]),1);
});
test('events derive from neighbors including swap, hide and missing mixed endpoints',()=>{
 assert.deepEqual(grabEvents(grab(),grab(false,true)),['右手放手']);
 assert.deepEqual(grabEvents(grab(false,true),grab(true,false)),['右手開始扶握','左手放手']);
 assert.deepEqual(grabEvents(grab(),undefined),['雙手放手','形狀隱藏']);
 assert.deepEqual(grabEvents(undefined,grab()),['雙手開始扶握']);
 assert.deepEqual(grabEvents(undefined,grab(),true),['初始狀態']);
 assert.deepEqual(grabEvents(undefined,undefined),[]);
});
test('dirty signature ignores object ordering and insignificant numerical noise',()=>{
 assert.equal(poseEditSignature({a:1.00000001,b:[2]}),poseEditSignature({b:[2],a:1}));
 assert.notEqual(poseEditSignature({a:1}),poseEditSignature({a:1.001}));
});
test('recording guards block playback, multi-selection, loading, gestures and preview updates',()=>{
 const state={ready:true,playing:false,multi:false,editing:false,selected:0,preview:false};
 assert.equal(grabRecordGuard(state,true),'');
 for(const key of ['playing','multi','editing'])assert.ok(grabRecordGuard({...state,[key]:true},false));
 assert.ok(grabRecordGuard({...state,ready:false}));assert.ok(grabRecordGuard({...state,selected:-1},true));
 assert.ok(grabRecordGuard({...state,preview:true},true));assert.equal(grabRecordGuard({...state,preview:true},false),'');
});
test('shared editor shortcuts preserve metadata, guard preview, and undo recording in one step',()=>{
 const c={frames:[{...pose(),label:'keep',easing:'linear',beats:2,traj:{rArm:{points:[1,2]}}}],index:0,ready:true,playing:false,multi:false,editing:false,live:pose(),capture(){return clone(this.live);},currentGrab(){return this.live.grabBox;},showTimeline(){}};
 const editorContext={get keyframes(){return c.frames;},get kfEditingIndex(){return c.index;},set kfEditingIndex(v){c.index=v;},snapshotCurrentAngles:()=>clone(c.live.angles),snapshotBodyTransform:()=>clone(c.live.body),captureGrabFrame:()=>clone(c.live.grabBox),renderKeyframeChips(){},scheduleAutoSave(){},kfPendingEasing:'linear',kfPendingBeats:1};
 const editor=createPoseEditor(editorContext);
 const history=createHistory({capture:()=>({frames:c.frames,index:c.index,live:c.live}),restore:s=>{c.frames=s.frames;c.index=s.index;c.live=s.live;ui.reset();ui.refresh();}});
 c.add=()=>editor.addKeyframe();c.update=()=>editor.updateKeyframe();c.pushHistory=()=>history.push();
 const ui=createGrabTimelineUI(c,doc);ui.selected();history.push();assert.equal(ui.dirty,false);
 c.camera={position:[9,8,7]};c.locale='en';assert.equal(ui.dirty,false);
 c.live.angles.hips[0]=15;assert.equal(ui.dirty,true);c.live.angles.hips[0]=0;
 c.live.body.position[1]=.2;assert.equal(ui.dirty,true);c.live.body.position[1]=0;
 c.live.grabBox.palmTwist.rArm=25;assert.equal(ui.dirty,true);c.live.grabBox.palmTwist.rArm=0;assert.equal(ui.dirty,false);
 c.live.grabBox.position[0]=.1;assert.equal(ui.dirty,true);
 ui.previewed();assert.equal(ui.record(true),false);assert.equal(c.frames[0].grabBox.position[0],0);
 ui.selected();assert.equal(ui.dirty,true);assert.equal(ui.record(true),true);assert.equal(ui.dirty,false);
 assert.equal(c.frames[0].label,'keep');assert.equal(c.frames[0].beats,2);assert.deepEqual(c.frames[0].traj,{rArm:{points:[1,2]}});
 history.undo();assert.equal(c.frames[0].grabBox.position[0],0);assert.equal(ui.dirty,true);
 history.redo();assert.equal(c.frames[0].grabBox.position[0],.1);assert.equal(ui.dirty,false);
 ui.previewed();assert.equal(ui.record(false),true);assert.equal(c.frames.length,2);assert.equal(c.index,1);
});
function rangeHarness(){
 const c={keyframes:[{...pose(),beats:1},{...pose(null),beats:1},{...pose(grab(false,false)),beats:1}],grooveSequence:[],waveClips:[],kfEditingIndex:0,grooveSeqSelectedIndex:-1,kfPlaying:false,kfMultiSelectMode:false,kfMultiSelected:new Set(),grooveMultiSelected:new Set(),timelineClipboard:{poseItems:[],grooveItems:[]},beatGridRangeClipboard:{poseItems:[],grooveItems:[]},beatGridRangeStart:.5,beatGridRangeEnd:1.5,beatGridRangeLoop:false,BEAT_GRID_SNAP:.25,
 syncEasingControlsFromSelection(){},renderKeyframeChips(){},renderGrooveSeqChips(){},scheduleAutoSave(){},pushHistory(){},makeLibId:()=>'',beatGridPoseTotalBeats:()=>2,beatGridTimelineBeats:()=>2,keyframeStartBeat:i=>i,grooveSegmentStartBeat:()=>0,formatBeatValue:String,confirm:()=>true};
 const selection=createTimelineSelection(c,doc);c.deepCloneTimelineItem=selection.deepCloneTimelineItem;c.updateKfMultiSelectBar=selection.updateKfMultiSelectBar;
 return {c,selection,range:createRangeEditor(c,doc)};
}
test('mixed multi-selection keeps grab data independent of clipboard and original',()=>{
 const {c,selection}=rangeHarness();selection.setKfMultiSelectMode(true);c.kfMultiSelected=new Set([2,1,0]);selection.copyTimelineSelection();
 selection.pasteTimelineClipboard();assert.equal(c.keyframes.length,6);assert.equal(c.keyframes[4].grabBox,null);
 c.keyframes[3].grabBox.grabLocal.rArm[0]=99;assert.equal(c.keyframes[0].grabBox.grabLocal.rArm[0],-.16);assert.equal(c.timelineClipboard.poseItems[0].grabBox.grabLocal.rArm[0],-.16);
});
test('partial Range duplicates full transitions with release endpoint and one history action',()=>{
 const {c,range}=rangeHarness();let history=0;c.pushHistory=()=>history++;
 assert.equal(range.copyBeatGridRange(),true);assert.equal(c.beatGridRangeClipboard.poseItems.length,3);
 assert.equal(countGrabFrames(c.beatGridRangeClipboard.poseItems),2);assert.equal(history,0);
 assert.equal(range.duplicateBeatGridRange(),true);assert.equal(c.keyframes.length,6);assert.equal(history,1);
 assert.equal(grabStatus(c.keyframes[5].grabBox),'形狀已顯示・未扶握');c.keyframes[3].grabBox.palmTwist.rArm=90;
 assert.equal(c.keyframes[0].grabBox.palmTwist.rArm,0);assert.equal(c.beatGridRangeClipboard.poseItems[0].grabBox.palmTwist.rArm,0);
});
test('deleting a mixed selection leaves release data attached to the surviving pose',()=>{
 const {c,selection}=rangeHarness();selection.setKfMultiSelectMode(true);c.kfMultiSelected=new Set([0,1]);
 selection.deleteTimelineSelection({confirmDelete:false});assert.equal(c.keyframes.length,1);
 assert.equal(grabStatus(c.keyframes[0].grabBox),'形狀已顯示・未扶握');assert.deepEqual(grabEvents(undefined,c.keyframes[0].grabBox,true),['初始狀態']);
});
test('Range delete retains the target endpoint and its release data',()=>{
 const {c,range}=rangeHarness();assert.equal(range.deleteBeatGridRange(),true);assert.equal(c.keyframes.length,1);
 assert.equal(grabStatus(c.keyframes[0].grabBox),'形狀已顯示・未扶握');
});
