import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineAudio } from '../src/timeline/audio-controller.js';
function harness(){
  const revoked = [], warnings = [];
  let id = 0, offset = 1.5, bpm = 120;
  const media = { src: '', volume: 1, paused: true, currentTime: 0,
    play(){ this.paused = false; return Promise.resolve(); },
    pause(){ this.paused = true; }, removeAttribute(){ this.src = ''; }, load(){ this.loaded = true; } };
  const controller = createTimelineAudio({ getAudio: () => media, getOffset: () => offset, getBpm: () => bpm,
    urls: { createObjectURL: () => `blob:${++id}`, revokeObjectURL: url => revoked.push(url) },
    warn: (...args) => warnings.push(args) });
  return { controller, media, revoked, warnings, setTiming(o, b){ offset = o; bpm = b; } };
}
test('audio replacement and removal release only owned object URLs', () => {
  const { controller, media, revoked } = harness();
  controller.importFile({}, .4);
  assert.equal(media.src, 'blob:1'); assert.equal(media.volume, .4);
  controller.importFile(null, 1);
  assert.deepEqual(revoked, []);
  controller.importFile({}, .8);
  assert.deepEqual(revoked, ['blob:1']);
  controller.remove(); controller.remove();
  assert.deepEqual(revoked, ['blob:1', 'blob:2']);
  assert.equal(media.src, ''); assert.equal(media.paused, true); assert.equal(media.loaded, true);
});
test('audio preview and timeline playback use live timing and preserve missing-media behavior', async () => {
  const { controller, media, setTiming } = harness();
  controller.togglePreview(); assert.equal(media.paused, true);
  controller.importFile({}, 1);
  controller.togglePreview(); assert.equal(media.paused, false);
  controller.togglePreview(); assert.equal(media.paused, true);
  controller.playFromOffset(); assert.equal(media.currentTime, 1.5);
  controller.pause(); assert.equal(media.paused, true);
  assert.equal(controller.beatToTime(2), 2.5);
  assert.equal(controller.timeToBeat(2.5), 2);
  setTiming(3, 60);
  assert.equal(controller.beatToTime(2), 5);
  assert.equal(controller.timeToBeat(2), 0);
  assert.equal(controller.beatToTime(-1), 3);
});
test('rejected media playback reports a warning without rejecting the animation caller', async () => {
  const { controller, media, warnings } = harness();
  controller.importFile({}, 1);
  media.play = () => Promise.reject(new Error('autoplay blocked'));
  controller.playFromOffset(); controller.togglePreview();
  await Promise.resolve();
  assert.equal(warnings.length, 2);
});
