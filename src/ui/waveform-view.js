// Canvas coordinates follow the same live Beat Grid scale as the pose track.
export function createWaveformView(waveform, context, doc = document){
  function drawKfWaveform(){
    const canvas = doc.getElementById("kfWaveformCanvas");
    const track = doc.getElementById("beatGridWaveformTrack");
    if (!canvas || !track || canvas.offsetParent === null) return;

    const timelinePx = Math.max(1, Math.round(context.beatGridTimelineBeats() * context.BEAT_GRID_PX_PER_BEAT));
    canvas.style.width = `${timelinePx}px`;
    const backingW = Math.max(64, Math.min(16384, timelinePx));
    const h = canvas.height || 64;
    if (canvas.width !== backingW) canvas.width = backingW;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, backingW, h);
    ctx.fillStyle = "#111124";
    ctx.fillRect(0, 0, backingW, h);
    const mid = h / 2;

    if (!(waveform.duration > 0) || !waveform.hasData) return;
    const timelineBeats = context.beatGridTimelineBeats();
    const audioBeats = context.beatGridAudioTotalBeats();
    const audioStart = context.getKfMusicOffsetSec();
    const audioEnd = Math.min(waveform.duration, context.timelineBeatToAudioTime(audioBeats));
    // 若編舞比音樂長，波形只佔「音樂實際還有內容」的那一段，右側保持空白；不能把短音樂硬拉伸到整條 timeline。
    const audioBackingW = Math.max(1, Math.min(backingW, Math.round(backingW * (audioBeats / Math.max(0.0001, timelineBeats)))));
    const peaks = waveform.peaksForRange(audioStart, audioEnd, audioBackingW);
    if (!peaks) return;

    ctx.strokeStyle = "#6a6aff";
    ctx.lineWidth = 1;
    for (let i = 0; i < audioBackingW; i++){
      const p = peaks[i];
      if (!p) continue;
      ctx.beginPath();
      ctx.moveTo(i + 0.5, mid + p.min * mid * 0.90);
      ctx.lineTo(i + 0.5, mid + p.max * mid * 0.90);
      ctx.stroke();
    }

    // Keyframe 參考線仍保留，但現在 x 直接由 Beat 決定，所以一定與 POSE Track 垂直對齊。
    ctx.strokeStyle = "#ffaa33";
    ctx.lineWidth = 1;
    for (let i = 0; i < context.keyframes.length; i++){
      const beat = context.keyframeStartBeat(i);
      const xCss = beat * context.BEAT_GRID_PX_PER_BEAT;
      const x = xCss / timelinePx * backingW;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
  }
  return { draw: drawKfWaveform };
}
