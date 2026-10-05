import { t as tr, liveText } from "../i18n/index.js";
import { touchTimelineEditing } from "../ui/touch-timeline.js";
import { clampNum } from "../math/angles.js";
import { ALL_JOINT_KEYS } from "../rig/definitions.js";
import { EASINGS } from "../math/easings.js";

// Live host getters preserve shared rig and playback coordination.
export function createTimelineTransport(context){
  function seekRunningPlaybackToBeat(beat, now = performance.now()){
    if (context.keyframes.length < 2 && !context.waveClips.length) return;
    const target = clampNum(Number(beat) || 0, 0, context.waveClips.length?context.wavePlaybackEnd():context.beatGridPoseTotalBeats());
    const loc = context.locateKeyframeSegmentAtBeat(target);
    context.kfIndex = loc.index;
    context.kfStartTime = now - loc.localBeat * (60000 / context.bpm);
    context.grooveStartTime = now - target * (60000 / context.bpm);
    context.grooveSquatAnchored = false;
    context.resetGrooveXfadeState();
    context.resetSquatXfadeState();
    const audioEl = document.getElementById("kfAudioEl");
    if (audioEl && audioEl.src && context.waveform.duration > 0){
      try {
        audioEl.currentTime = clampNum(context.timelineBeatToAudioTime(target), 0, context.waveform.duration);
        if (audioEl.paused) audioEl.play().catch(() => {});
      } catch (_) {}
    }
    context.updateOnionSkins();
    context.updatePlayingKeyframeHighlight();
    context.beatGridLastPreviewBeat = target;
  }

  function toggleKeyframePlayback(){
    context.tgCancelPreview();
    context.stopWave();
    context.stopLAPath();
    if (context.kfPlaying){ stopKeyframePlayback(); return; }
    if (context.keyframes.length < 2 && !context.waveClips.length){
      alert(tr("至少需要 2 個拍點才能播放（目前只有 ") + context.keyframes.length + tr(" 個）"));
      return;
    }
    // (預設循環功能已移除，原本這裡用來避免跟拍點播放同時搶骨骼的判斷已不再需要)
    context.deselectJoint();
    context.transformControls.enabled = false;
    context.kfPlaying = true;
    const playStartBeat = context.beatGridRangeLoop && context.hasBeatGridRange() ? context.beatGridRangeStart : 0;
    const playStartNow = performance.now();
    const startLoc = context.locateKeyframeSegmentAtBeat(playStartBeat);
    context.kfIndex = startLoc.index;
    context.kfStartTime = playStartNow - startLoc.localBeat * (60000 / context.bpm);
    context.grooveStartTime = playStartNow - playStartBeat * (60000 / context.bpm); // Range Loop 從中段開始時，Groove 相位仍與全域 Beat 軸一致
    context.grooveSquatAnchored = false;   // 重新對齊蹲彈的腳掌原地錨點，避免沿用上次播放結束時的舊姿勢
    context.resetGrooveXfadeState();       // 清掉上次播放殘留的段落切換狀態，避免這次重新開始時誤觸一次不該有的交叉淡化
    context.resetSquatXfadeState();
    if (playStartBeat > 0){
      const audioEl = document.getElementById("kfAudioEl");
      if (audioEl && audioEl.src){
        try { audioEl.currentTime = clampNum(context.timelineBeatToAudioTime(playStartBeat), 0, context.waveform.duration || Number.MAX_SAFE_INTEGER); } catch (_) {}
        audioEl.play().catch((e) => console.warn(tr("音樂播放失敗（可能需要先跟頁面互動一次）："), e));
      }
    } else {
      context.playKfMusicIfLoaded();
    }
    document.getElementById("kfPlayBtn").classList.add("playing");
    liveText(document.getElementById("kfPlayBtn"), ()=>tr("■ 停止"));
    context.updateOnionSkins(); // 立刻依 kfIndex=0 顯示第一段過渡的殘影，不用等到跨到下一拍才出現
    const beatGridScroll = document.getElementById("beatGridScroll");
    if (beatGridScroll){
      if (playStartBeat > 0) context.scrollBeatGridBeatToCenter(playStartBeat);
      else beatGridScroll.scrollLeft = 0;
    }
    context.updatePlayingKeyframeHighlight();
    context.updateBeatGridPlaybackUI(context.kfStartTime);
  }

  function stopKeyframePlayback(){
    if(context.waveClips.length){for(const k of ALL_JOINT_KEYS)if(context.bones[k])context.syncWaveTrackTarget(k);}
    context.waveTrackActive=false;
    context.kfPlaying = false;
    context.transformControls.enabled = true;
    context.pauseKfMusic();
    document.getElementById("kfPlayBtn").classList.remove("playing");
    liveText(document.getElementById("kfPlayBtn"), ()=>tr("▶ 播放"));
    context.renderKeyframeChips();
    context.resetBeatGridPlaybackUI();
  }

  function applyTimelinePreviewAtElapsed(elapsedMs){
    if(context.waveClips.length){
      if(context.waveRun)context.stopWave();
      const oldIndex=context.kfIndex,beat=Math.max(0,elapsedMs*context.bpm/60000);
      context.waveBaseAtBeat(beat);context.applyWaveTrackAtBeat(beat);
      for(const k of ALL_JOINT_KEYS)context.syncWaveTrackTarget(k);
      context.kfIndex=oldIndex;return;
    }
    if(context.waveRun)context.stopWave();
    if (context.keyframes.length === 0) return;
    if (context.keyframes.length === 1 || elapsedMs <= 0){
      context.applyPose(context.keyframes[0].angles);
      context.applyBodyTransform(context.keyframes[0].body);
      return;
    }
    let acc = 0;
    for (let i = 0; i < context.keyframes.length - 1; i++){
      const beats = context.keyframes[i].beats || 1;
      const segMs = (60000 / context.bpm) * beats;
      const isLast = i === context.keyframes.length - 2;
      if (elapsedMs <= acc + segMs || isLast){
        const rawT = segMs > 0 ? (elapsedMs - acc) / segMs : 1;
        const t = clampNum(rawT, 0, 1);
        const easeFn = EASINGS[context.keyframes[i].easing] || EASINGS.linear;
        context.applyKeyframeFramePose(context.keyframes[i], context.keyframes[i + 1], easeFn(t));
        if(context.keyframes[i].waveBake){for(const k of ALL_JOINT_KEYS)context.syncWaveTrackTarget(k);}
        return;
      }
      acc += segMs;
    }
  }

  function showBeatGridScrubPlayhead(beat){
    context.beatGridLastPreviewBeat = clampNum(beat, 0, context.beatGridTimelineBeats());
    const playhead = document.getElementById("beatGridPlayhead");
    const label = document.getElementById("beatGridPlayheadLabel");
    if (!playhead) return;
    const x = context.BEAT_GRID_LABEL_W + beat * context.BEAT_GRID_PX_PER_BEAT;
    playhead.style.left = `${x}px`;
    playhead.classList.add("visible");
    if (label) liveText(label, ()=>`Beat ${(beat + 1).toFixed(2)}`);
    context.autoScrollBeatGridToPlayhead(x);
  }

  function seekKfTimelineFromClientX(clientX){
    const track = document.getElementById("beatGridWaveformTrack");
    if (!track || !(context.waveform.duration > 0)) return;
    const rect = track.getBoundingClientRect();
    const beat = clampNum((clientX - rect.left) / context.BEAT_GRID_PX_PER_BEAT, 0, context.beatGridTimelineBeats());
    const newTime = clampNum(context.timelineBeatToAudioTime(beat), 0, context.waveform.duration);
    const audioEl = document.getElementById("kfAudioEl");
    if (audioEl) audioEl.currentTime = newTime;
    applyTimelinePreviewAtElapsed(beat * 60000 / context.bpm);
    showBeatGridScrubPlayhead(beat);
  }

  function bindKfWaveformScrubbing(){
    let scrubPointer = null;
    const canvas = document.getElementById("kfWaveformCanvas");
    if (!canvas) return;
    canvas.addEventListener("click", e => {
      if (e.pointerType !== 'touch' || touchTimelineEditing(e) || !(context.waveform.duration > 0)) return;
      if (context.kfPlaying) stopKeyframePlayback();
      seekKfTimelineFromClientX(e.clientX);
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !touchTimelineEditing(e) || scrubPointer !== null) return;
      scrubPointer = e.pointerId;
      if (!(context.waveform.duration > 0)){ scrubPointer = null; return; }
      if (context.kfPlaying) stopKeyframePlayback();
      context.kfScrubDragging = true;
      canvas.setPointerCapture(e.pointerId);
      seekKfTimelineFromClientX(e.clientX);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!context.kfScrubDragging || e.pointerId !== scrubPointer) return;
      seekKfTimelineFromClientX(e.clientX);
    });
    const endDrag = (e) => {
      if (!context.kfScrubDragging || e.pointerId !== scrubPointer) return;
      context.kfScrubDragging = false;
      scrubPointer = null;
      try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);
  }

  function updateBeatGridMusicPreviewPlayhead(){
    if (context.kfPlaying || context.kfScrubDragging) return;
    const audioEl = document.getElementById("kfAudioEl");
    if (!audioEl || !audioEl.src) return;
    const beat = context.audioTimeToTimelineBeat(audioEl.currentTime || 0);
    if (beat < 0 || beat > context.beatGridTimelineBeats()) return;
    if (!audioEl.paused) showBeatGridScrubPlayhead(beat);
  }

  function updateKeyframePlayback(now){
    context.timelinePlayback.update(now);
  }
  return { seekRunningPlaybackToBeat, toggleKeyframePlayback, stopKeyframePlayback, applyTimelinePreviewAtElapsed, showBeatGridScrubPlayhead, seekKfTimelineFromClientX, bindKfWaveformScrubbing, updateBeatGridMusicPreviewPlayhead, updateKeyframePlayback };
}
