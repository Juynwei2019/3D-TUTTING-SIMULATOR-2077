import { clampNum } from "../math/angles.js";

// Pure data operations; callers schedule rendering/history/autosave explicitly.
export function insertKeyframe(frames, frame, editingIndex){
  const index = editingIndex >= 0 && editingIndex < frames.length ? editingIndex + 1 : frames.length;
  frames.splice(index, 0, frame);
  return index;
}

export function duplicateKeyframeData(frames, index){
  if (index < 0 || !frames[index]) return null;
  frames.splice(index + 1, 0, JSON.parse(JSON.stringify(frames[index])));
  return index + 1;
}

export function reorderKeyframeData(frames, from, to, editingIndex){
  if (from < 0 || from >= frames.length || to < 0 || to >= frames.length || from === to) return null;
  const [item] = frames.splice(from, 1);
  frames.splice(to, 0, item);
  if (editingIndex === from) return to;
  if (from < editingIndex && editingIndex <= to) return editingIndex - 1;
  if (to <= editingIndex && editingIndex < from) return editingIndex + 1;
  return editingIndex;
}

export function totalKeyframeBeats(frames){
  if (frames.length < 2) return frames.length;
  let total = 0;
  for (let i = 0; i < frames.length - 1; i++) total += (frames[i].beats || 1);
  return total;
}

export function keyframeStartBeat(frames, index){
  let beat = 0;
  for (let i = 0; i < index; i++) beat += Number(frames[i].beats || 1);
  return beat;
}

export function locateKeyframeSegmentAtBeat(frames, beat, total){
  const target = clampNum(Number(beat) || 0, 0, Math.max(0, total));
  if (frames.length < 2) return { index:0, localBeat:0 };
  let acc = 0;
  for (let i = 0; i < frames.length - 1; i++){
    const dur = Math.max(0.0001, Number(frames[i].beats || 1));
    if (target < acc + dur - 1e-9 || i === frames.length - 2){
      return { index:i, localBeat:clampNum(target - acc, 0, dur) };
    }
    acc += dur;
  }
  return { index:frames.length - 2, localBeat:Number(frames[frames.length - 2].beats || 1) };
}

