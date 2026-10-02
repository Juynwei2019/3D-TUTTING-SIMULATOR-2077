import test from 'node:test';
import assert from 'node:assert/strict';
import { insertKeyframe, duplicateKeyframeData, reorderKeyframeData, totalKeyframeBeats, keyframeStartBeat, locateKeyframeSegmentAtBeat } from '../src/timeline/data.js';
import { createTimelinePlayback } from '../src/timeline/playback.js';

const frame = (id, beats = 1) => ({ angles: { arm: [id, 0, 0] }, body: { position: [id, 0, 0] }, beats, easing: 'linear', label: `pose ${id}`, waveBake: { samples: [id] } });
test('insertion, duplication and reordering preserve metadata and logical selection', () => {
  const frames = [frame(0), frame(1)];
  assert.equal(insertKeyframe(frames, frame(2), 0), 1);
  assert.equal(duplicateKeyframeData(frames, 1), 2);
  frames[2].angles.arm[0] = 99;
  frames[2].waveBake.samples[0] = 99;
  assert.equal(frames[1].angles.arm[0], 2);
  assert.equal(frames[1].waveBake.samples[0], 2);
  assert.equal(frames[2].label, frames[1].label);
  assert.equal(reorderKeyframeData(frames, 1, 3, 1), 3);
  assert.equal(reorderKeyframeData(frames, 3, 0, 2), 3);
  const before = JSON.stringify(frames);
  assert.equal(reorderKeyframeData(frames, -1, 0, 0), null);
  assert.equal(duplicateKeyframeData(frames, 99), null);
  assert.equal(JSON.stringify(frames), before);
});
test('beat calculations retain fractional durations, terminal boundaries and empty timelines', () => {
  const frames = [frame(0, .5), frame(1, 2), frame(2, 10)];
  assert.equal(totalKeyframeBeats(frames), 2.5);
  assert.equal(keyframeStartBeat(frames, 2), 2.5);
  assert.deepEqual(locateKeyframeSegmentAtBeat(frames, .5, 2.5), { index: 1, localBeat: 0 });
  assert.deepEqual(locateKeyframeSegmentAtBeat(frames, 99, 2.5), { index: 1, localBeat: 2 });
  assert.deepEqual(locateKeyframeSegmentAtBeat([], 1, 0), { index: 0, localBeat: 0 });
  assert.equal(totalKeyframeBeats([]), 0);
  assert.equal(totalKeyframeBeats([frame(0)]), 1);
});
function harness() {
  const events = [];
  const context = { keyframes: [frame(0), frame(1), frame(2)], waveClips: [], bpm: 120,
    kfIndex: 0, kfStartTime: 0, kfLoop: false, beatGridRangeLoop: false,
    grooveStartTime: 0, grooveSquatAnchored: true,
    applyKeyframeFramePose: (a, b, t) => { events.push(['pose', a.angles.arm[0], b.angles.arm[0], t]); return ['arm']; },
    applyGroove: (now, overrides) => events.push(['groove', overrides]),
    applySquatGroove: () => events.push(['squat']),
    applyPose: pose => events.push(['final', pose.arm[0]]),
    applyBodyTransform: () => events.push(['body']), stopKeyframePlayback: () => events.push(['stop']),
    updateOnionSkins: () => events.push(['onion']), updatePlayingKeyframeHighlight: () => {},
    updateBeatGridPlaybackUI: () => {}, updateWaveTrackPlayback: now => events.push(['wave', now]),
    hasBeatGridRange: () => true, getBeatGridPosePlayheadBeat: now => now / 500,
    beatGridRangeStart: .5, beatGridRangeEnd: 1.5,
    seekRunningPlaybackToBeat: (beat, now) => { context.kfIndex = 0; context.kfStartTime = now - beat * 500; events.push(['seek', beat]); },
  };
  return { context, events, player: createTimelinePlayback(context) };
}
test('delayed frames advance before applying pose and groove; completion freezes the final pose', () => {
  const { context, events, player } = harness();
  player.update(750);
  assert.equal(context.kfIndex, 1);
  assert.equal(context.kfStartTime, 500);
  assert.equal(context.grooveSquatAnchored, false);
  assert.deepEqual(events, [['onion'], ['pose', 1, 2, .5], ['groove', ['arm']], ['squat']]);
  events.length = 0;
  player.update(1000);
  assert.deepEqual(events, [['final', 2], ['body'], ['stop']]);
});
test('whole-timeline looping consumes elapsed time and reads replacement data and BPM', () => {
  const { context, events, player } = harness();
  context.kfLoop = true;
  player.update(2250);
  assert.equal(context.kfIndex, 0);
  assert.equal(context.kfStartTime, 2000);
  assert.deepEqual(events.find(e => e[0] === 'pose'), ['pose', 0, 1, .5]);
  context.keyframes = [frame(3), frame(4)];
  context.bpm = 60;
  events.length = 0;
  player.update(2500);
  assert.deepEqual(events.find(e => e[0] === 'pose'), ['pose', 3, 4, .5]);
});
test('range loop seeks the shared clock before pose evaluation; wave tracks retain their own dispatch', () => {
  const { context, events, player } = harness();
  context.beatGridRangeLoop = true;
  player.update(800);
  assert.deepEqual(events[0], ['seek', .5]);
  assert.deepEqual(events[1], ['pose', 0, 1, .5]);
  context.waveClips = [{}];
  events.length = 0;
  player.update(900);
  assert.deepEqual(events, [['wave', 900]]);
});
