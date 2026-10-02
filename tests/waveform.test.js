import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaveform, computeWaveformPeaksForRange } from '../src/timeline/waveform.js';
import { createWaveformView } from '../src/ui/waveform-view.js';
const file = { arrayBuffer: async () => new ArrayBuffer(4) };
const buffer = (samples = [-1, .5, -.25, 1]) => ({ duration: 2, sampleRate: 2, getChannelData: () => new Float32Array(samples) });
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
test('waveform peaks preserve signed extrema, zero padding and input samples', () => {
  const samples = new Float32Array([-1, .5, -.25, 1]);
  const before = samples.slice();
  assert.deepEqual(computeWaveformPeaksForRange(samples, 0, 4, 2), [{ min: -1, max: .5 }, { min: -.25, max: 1 }]);
  assert.deepEqual(computeWaveformPeaksForRange(samples, 3, 4, 2), [{ min: 0, max: 1 }, { min: 0, max: 0 }]);
  assert.deepEqual(samples, before);
});
test('decoded waveform caches ranges, invalidates and clears session data', async () => {
  let closed = 0;
  const waveform = createWaveform({ createAudioContext: () => ({ decodeAudioData: async () => buffer(), close: async () => closed++ }) });
  assert.equal(waveform.peaksForRange(0, 1, 2), null);
  assert.equal((await waveform.decode(file)).status, 'ready');
  assert.equal(waveform.duration, 2); assert.equal(closed, 1);
  const peaks = waveform.peaksForRange(-1, 99, 2);
  assert.equal(waveform.peaksForRange(0, 2, 2), peaks);
  waveform.invalidate(); assert.notEqual(waveform.peaksForRange(0, 2, 2), peaks);
  waveform.clear(); assert.equal(waveform.duration, 0); assert.equal(waveform.hasData, false);
});
test('decode errors close their AudioContext and leave no partial waveform', async () => {
  let closed = 0;
  const waveform = createWaveform({ createAudioContext: () => ({ decodeAudioData: async () => { throw new Error('bad audio'); }, close: async () => closed++ }) });
  assert.equal((await waveform.decode(file)).status, 'error');
  assert.equal(closed, 1); assert.equal(waveform.hasData, false);
});
test('older imports and removed audio cannot overwrite the latest waveform', async () => {
  const pending = [deferred(), deferred(), deferred()]; let index = 0, closed = 0;
  const waveform = createWaveform({ createAudioContext: () => { const slot = pending[index++]; return { decodeAudioData: () => slot.promise, close: async () => closed++ }; } });
  const first = waveform.decode(file); await Promise.resolve();
  const second = waveform.decode(file); await Promise.resolve();
  pending[1].resolve(buffer([0, 0, 0, 0])); assert.equal((await second).status, 'ready');
  pending[0].resolve(buffer()); assert.equal((await first).status, 'stale');
  assert.deepEqual(waveform.peaksForRange(0, 2, 1), [{ min: 0, max: 0 }]);
  const third = waveform.decode(file); await Promise.resolve(); waveform.clear();
  pending[2].resolve(buffer()); assert.equal((await third).status, 'stale');
  assert.equal(waveform.hasData, false); assert.equal(closed, 3);
});
test('removal during context cleanup also suppresses stale UI completion', async () => {
  const closing = deferred();
  const waveform = createWaveform({ createAudioContext: () => ({ decodeAudioData: async () => buffer(), close: () => closing.promise }) });
  const decode = waveform.decode(file);
  await Promise.resolve(); await Promise.resolve();
  waveform.clear(); closing.resolve();
  assert.equal((await decode).status, 'stale'); assert.equal(waveform.duration, 0);
});
test('canvas keeps short audio proportionate and reference lines aligned, with bounded backing width', () => {
  const lines = []; let start; let requested;
  const ctx = { clearRect(){}, fillRect(){}, beginPath(){}, moveTo(x, y){ start = [x, y]; }, lineTo(x, y){ lines.push([this.strokeStyle, start, [x, y]]); }, stroke(){} };
  const canvas = { style: {}, width: 0, height: 64, offsetParent: {}, getContext: () => ctx };
  const doc = { getElementById: id => id === 'kfWaveformCanvas' ? canvas : {} };
  let scale = 100;
  const waveform = { duration: 2, hasData: true, peaksForRange(a, b, count){ requested = [a, b, count]; return Array.from({ length: count }, () => ({ min: -1, max: 1 })); } };
  const view = createWaveformView(waveform, { beatGridTimelineBeats: () => 8, beatGridAudioTotalBeats: () => 4,
    get BEAT_GRID_PX_PER_BEAT(){ return scale; }, getKfMusicOffsetSec: () => 0, timelineBeatToAudioTime: beat => beat / 2,
    keyframes: [{}, {}], keyframeStartBeat: index => index * 2 }, doc);
  view.draw(); assert.equal(canvas.style.width, '800px'); assert.equal(canvas.width, 800);
  assert.deepEqual(requested, [0, 2, 400]);
  assert.deepEqual(lines.filter(line => line[0] === '#ffaa33').map(line => line[1][0]), [.5, 200.5]);
  scale = 10000; view.draw(); assert.equal(canvas.width, 16384); assert.equal(canvas.style.width, '80000px');
  canvas.offsetParent = null; canvas.width = 99; view.draw(); assert.equal(canvas.width, 99);
});
