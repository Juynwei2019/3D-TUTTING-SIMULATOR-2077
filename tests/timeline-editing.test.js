import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineSelection } from '../src/timeline/selection-clipboard.js';
import { createRangeEditor } from '../src/timeline/range-editor.js';
const doc = { getElementById: () => null };
const frame = (id, beats = 1) => ({ angles: { arm: [id, 0, 0] }, beats, label: `pose${id}`, traj: { arm: [{ x: id }] } });
function harness(){
  let id = 0;
  const events = [];
  const c = { keyframes: [frame(0), frame(1), frame(2)], grooveSequence: [{ id: 'a', libId: 'lib', beats: 1 }, { id: 'b', libId: 'lib', beats: 1 }],
    timelineClipboard: { poseItems: [], grooveItems: [] }, kfMultiSelected: new Set(), grooveMultiSelected: new Set(), kfMultiSelectMode: false,
    kfEditingIndex: 0, grooveSeqSelectedIndex: -1, kfPlaying: false, kfLoop: false,
    beatGridRangeStart: .5, beatGridRangeEnd: 1.5, beatGridRangeLoop: false, beatGridRangeDrag: null,
    beatGridRangeClipboard: { poseItems: [], grooveItems: [] }, BEAT_GRID_SNAP: .25, BEAT_GRID_LABEL_W: 40, BEAT_GRID_PX_PER_BEAT: 100, waveClips: [],
    syncEasingControlsFromSelection(){}, stopKeyframePlayback(){ c.kfPlaying = false; }, renderKeyframeChips(){}, renderGrooveSeqChips(){}, scheduleAutoSave: () => events.push('save'),
    pushHistory: () => events.push('history'), makeLibId: () => `new${++id}`, confirm: () => true,
    beatGridTimelineBeats: () => 8, formatBeatValue: String, beatGridPoseTotalBeats: () => c.keyframes.slice(0,-1).reduce((n,f) => n+f.beats,0), wavePlaybackEnd: () => 2,
    keyframeStartBeat: index => c.keyframes.slice(0,index).reduce((n,f) => n+f.beats,0), grooveSegmentStartBeat: index => c.grooveSequence.slice(0,index).reduce((n,f) => n+f.beats,0) };
  const selection = createTimelineSelection(c, doc);
  c.deepCloneTimelineItem = selection.deepCloneTimelineItem;
  c.updateKfMultiSelectBar = selection.updateKfMultiSelectBar;
  return { c, events, selection, range: createRangeEditor(c, doc) };
}
test('multi-selection copy isolates pose metadata, sorts indices and paste regenerates groove IDs', () => {
  const { c, selection, events } = harness();
  selection.setKfMultiSelectMode(true); selection.toggleKfMultiSelectItem(1); selection.toggleKfMultiSelectItem(0); selection.toggleGrooveMultiSelectItem(0);
  assert.deepEqual(selection.currentTimelineClipboardSelection(), { poseIndices: [0,1], grooveIndices: [0] });
  assert.equal(selection.copyTimelineSelection(), true);
  c.keyframes[0].traj.arm[0].x = 99;
  selection.pasteTimelineClipboard();
  assert.equal(c.keyframes[2].traj.arm[0].x, 0); assert.equal(c.grooveSequence[1].id, 'new1');
  assert.deepEqual([...c.kfMultiSelected], [2,3]); assert.deepEqual(events, ['save','history']);
  c.keyframes = [frame(8)]; selection.kfMultiSelectAll(); assert.deepEqual([...c.kfMultiSelected], [0]);
});
test('cut records one edit, cancellation preserves data and playback blocks cut/paste', () => {
  const { c, selection, events } = harness();
  c.confirm = () => false; assert.equal(selection.deleteTimelineSelection(), false); assert.equal(c.keyframes.length, 3);
  assert.equal(selection.cutTimelineSelection(), true); assert.equal(c.keyframes.length, 2); assert.equal(selection.timelineClipboardCount(), 1);
  assert.equal(events.filter(e => e === 'history').length, 1);
  c.kfPlaying = true; assert.equal(selection.cutTimelineSelection(), false); assert.equal(selection.pasteTimelineClipboard(), false);
});
test('range overlap includes complete transitions and target frames, excludes touching boundaries', () => {
  const { range } = harness();
  assert.deepEqual(range.getBeatGridRangeAffectedItems(0,1), { poseTransitions:[0], poseFrameStart:0, poseFrameEnd:1, grooveIndices:[0] });
  assert.deepEqual(range.getBeatGridRangeAffectedItems(1,2).poseTransitions,[1]);
  assert.deepEqual(range.normalizeBeatGridRange(2.13,-1),[0,2.25]);
  assert.equal(range.getBeatGridRangeAffectedItems(1,1).poseFrameStart,-1);
});
test('range duplicate inserts whole items after overlaps as one history transaction', () => {
  const { c, range, events } = harness();
  assert.equal(range.duplicateBeatGridRange(),true);
  assert.equal(c.keyframes.length,6); assert.deepEqual(c.keyframes.slice(3).map(f=>f.angles.arm[0]),[0,1,2]);
  assert.deepEqual(c.grooveSequence.slice(2).map(g=>g.id),['new1','new2']);
  assert.equal(events.filter(e=>e==='history').length,1);
  c.keyframes[3].angles.arm[0]=99; assert.equal(c.beatGridRangeClipboard.poseItems[0].angles.arm[0],0);
});
test('range delete keeps the final target frame, clears loop and respects cancellation/playback', () => {
  const { c, range } = harness();
  c.confirm=()=>false; assert.equal(range.deleteBeatGridRange(),false); assert.equal(c.keyframes.length,3);
  c.confirm=()=>true; c.beatGridRangeLoop=true; assert.equal(range.deleteBeatGridRange(),true);
  assert.deepEqual(c.keyframes.map(f=>f.angles.arm[0]),[2]); assert.equal(c.grooveSequence.length,0);
  assert.equal(c.beatGridRangeStart,null); assert.equal(c.beatGridRangeLoop,false);
  c.kfPlaying=true; assert.equal(range.pasteBeatGridRange(),false);
});
test('range loop clamps to the playable endpoint and disables whole-timeline looping', () => {
  const { c, range } = harness();
  c.kfLoop=true; c.beatGridRangeEnd=7; range.setBeatGridRangeLoop(true);
  assert.equal(c.beatGridRangeEnd,2); assert.equal(c.beatGridRangeLoop,true); assert.equal(c.kfLoop,false);
  range.clearBeatGridRange(); range.setBeatGridRangeLoop(true); assert.equal(c.beatGridRangeLoop,false);
});
