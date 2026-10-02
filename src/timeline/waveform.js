import { clampNum } from "../math/angles.js";

export function computeWaveformPeaksForRange(channelData, startSample, endSample, buckets){
  const span = Math.max(1, endSample - startSample);
  const blockSize = Math.max(1, Math.floor(span / Math.max(1, buckets)));
  const peaks = new Array(buckets);
  for (let i = 0; i < buckets; i++){
    const start = startSample + i * blockSize;
    if (start >= endSample){ peaks[i] = { min:0, max:0 }; continue; }
    const stop = Math.min(endSample, start + blockSize);
    let min = 0, max = 0;
    for (let j = start; j < stop; j++){
      const v = channelData[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[i] = { min, max };
  }
  return peaks;
}

// Decoded samples and peak cache belong to this instance, not the UI.
export function createWaveform({ createAudioContext = () => new (window.AudioContext || window.webkitAudioContext)() } = {}){
  let duration = 0, sampleRate = 44100, channelData = null;
  let cacheKey = null, cache = null, generation = 0;
  function invalidate(){ cacheKey = null; cache = null; }
  function clear(){ generation++; duration = 0; channelData = null; invalidate(); }
  async function decode(file){
    clear();
    const ticket = generation;
    let context, result;
    try {
      const bytes = await file.arrayBuffer();
      if (ticket !== generation) return { status: 'stale' };
      context = createAudioContext();
      const buffer = await context.decodeAudioData(bytes);
      if (ticket !== generation) return { status: 'stale' };
      const samples = buffer.getChannelData(0);
      duration = buffer.duration;
      sampleRate = buffer.sampleRate;
      channelData = samples;
      result = { status: 'ready' };
    } catch (error){
      result = { status: 'error', error };
    } finally {
      // Release the decoder even on rejection or a superseded import.
      if (context) { try { await context.close(); } catch (_) {} }
    }
    return ticket === generation ? result : { status: 'stale' };
  }
  function peaksForRange(audioStartSec, audioEndSec, buckets){
    if (!channelData || !(duration > 0)) return null;
    const a = clampNum(audioStartSec, 0, duration);
    const b = clampNum(audioEndSec, a, duration);
    const key = `${a.toFixed(4)}_${b.toFixed(4)}_${buckets}`;
    if (cacheKey === key && cache) return cache;
    const startSample = clampNum(Math.floor(a * sampleRate), 0, channelData.length);
    const endSample = clampNum(Math.ceil(b * sampleRate), startSample + 1, channelData.length);
    cache = computeWaveformPeaksForRange(channelData, startSample, endSample, buckets);
    cacheKey = key;
    return cache;
  }
  return { decode, clear, invalidate, peaksForRange,
    get duration(){ return duration; }, get hasData(){ return channelData !== null; } };
}
