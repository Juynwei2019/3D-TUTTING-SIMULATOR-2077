import { liveText } from "../i18n/index.js";
import { touchTimelineEditing } from "./touch-timeline.js";
import { clampNum } from "../math/angles.js";

// Live host getters preserve shared rig and playback coordination.
export function createBeatGrid(context){
  function nearestBeatGridZoomLevel(px){
    return context.BEAT_GRID_ZOOM_LEVELS.reduce((best, v) => Math.abs(v - px) < Math.abs(best - px) ? v : best, context.BEAT_GRID_ZOOM_LEVELS[0]);
  }

  function refreshBeatGridZoomLayout(){
    // Resize / scrub / ruler / waveform 全部讀同一個 BEAT_GRID_PX_PER_BEAT；
    // 這裡只做幾何重排，不改 keyframes / grooveSequence 的任何時間資料。
    context.updateKeyframeClipLayoutOnly();
    context.updateGrooveClipLayoutOnly();
    context.drawKfWaveform();
    if (context.kfPlaying) updateBeatGridPlaybackUI(performance.now());
    else context.updateBeatGridMusicPreviewPlayhead();
  }

  function setBeatGridZoomPx(nextPx, anchorViewportX = null){
    const scroller = document.getElementById("beatGridScroll");
    const select = document.getElementById("beatGridZoomSelect");
    const oldPx = context.BEAT_GRID_PX_PER_BEAT;
    const newPx = nearestBeatGridZoomLevel(Number(nextPx) || oldPx);
    if (!scroller){
      context.BEAT_GRID_PX_PER_BEAT = newPx;
      if (select) syncBeatGridZoomSelect(newPx);
      refreshBeatGridZoomLayout();
      return;
    }

    const viewportX = anchorViewportX == null
      ? scroller.clientWidth * 0.5
      : Math.max(context.BEAT_GRID_LABEL_W, Math.min(scroller.clientWidth, anchorViewportX));
    const anchorBeat = Math.max(0, (scroller.scrollLeft + viewportX - context.BEAT_GRID_LABEL_W) / Math.max(1, oldPx));

    context.BEAT_GRID_PX_PER_BEAT = newPx;
    if (select) syncBeatGridZoomSelect(newPx);
    refreshBeatGridZoomLayout();

    // 讓縮放前位於視窗中心（或滑鼠下方）的 Beat，縮放後仍留在同一螢幕位置，
    // 避免每次放大都被拉回時間軸左端。
    const desired = context.BEAT_GRID_LABEL_W + anchorBeat * newPx - viewportX;
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollLeft = Math.max(0, Math.min(maxScroll, desired));
  }

  function stepBeatGridZoom(direction, anchorViewportX = null){
    const current = nearestBeatGridZoomLevel(context.BEAT_GRID_PX_PER_BEAT);
    let idx = context.BEAT_GRID_ZOOM_LEVELS.indexOf(current);
    if (idx < 0) idx = 2;
    idx = Math.max(0, Math.min(context.BEAT_GRID_ZOOM_LEVELS.length - 1, idx + (direction > 0 ? 1 : -1)));
    setBeatGridZoomPx(context.BEAT_GRID_ZOOM_LEVELS[idx], anchorViewportX);
  }

  function grooveSegmentStartBeat(index){
    let beat = 0;
    for (let i = 0; i < index; i++) beat += Math.max(0, Number(context.grooveSequence[i].beats) || 0);
    return beat;
  }

  function beatGridPoseTotalBeats(){
    if (context.keyframes.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < context.keyframes.length - 1; i++) total += Number(context.keyframes[i].beats || 1);
    return total;
  }

  function beatGridAudioTotalBeats(){
    if (!(context.waveform.duration > 0)) return 0;
    const offsetEl = document.getElementById("kfMusicOffset");
    const offset = offsetEl ? (parseFloat(offsetEl.value) || 0) : 0;
    const remainSec = Math.max(0, context.waveform.duration - offset);
    return remainSec * context.bpm / 60;
  }

  function beatGridTimelineBeats(){
    return Math.max(4, beatGridPoseTotalBeats(), context.waveTrackEnd(), context.grooveSeqTotalBeats(), beatGridAudioTotalBeats());
  }

  function updateBeatGridGeometry(){
    const inner = document.getElementById("beatGridInner");
    const ruler = document.getElementById("beatGridRuler");
    const kfHost = document.getElementById("kfList");
    const grooveHost = document.getElementById("grooveSeqList");
    const waveformTrack = document.getElementById("beatGridWaveformTrack");
    const waveformCanvas = document.getElementById("kfWaveformCanvas");
    if (!inner || !ruler || !kfHost || !grooveHost) return;
    const totalBeats = beatGridTimelineBeats();
    const timelinePx = Math.ceil(totalBeats * context.BEAT_GRID_PX_PER_BEAT);
    inner.style.width = `${context.BEAT_GRID_LABEL_W + timelinePx}px`;
    kfHost.style.width = `${timelinePx}px`;
    grooveHost.style.width = `${timelinePx}px`;
    if (waveformTrack) waveformTrack.style.width = `${timelinePx}px`;
    if (waveformCanvas) waveformCanvas.style.width = `${timelinePx}px`;

    ruler.innerHTML = "";
    ruler.style.marginLeft = `${context.BEAT_GRID_LABEL_W}px`;
    ruler.style.width = `${timelinePx}px`;
    const steps = Math.ceil(totalBeats / context.BEAT_GRID_SUBDIV);
    for (let s = 0; s <= steps; s++){
      const beat = s * context.BEAT_GRID_SUBDIV;
      const x = beat * context.BEAT_GRID_PX_PER_BEAT;
      const tick = document.createElement("span");
      const isMajor = Math.abs(beat - Math.round(beat)) < 1e-6;
      const isHalf = !isMajor && Math.abs((beat * 2) - Math.round(beat * 2)) < 1e-6;
      tick.className = "beatGridTick" + (isMajor ? " major" : (isHalf ? " half" : ""));
      tick.style.left = `${x}px`;
      ruler.appendChild(tick);
      if (isMajor && beat < totalBeats + 1e-6){
        const label = document.createElement("span");
        label.className = "beatGridTickLabel";
        label.style.left = `${x}px`;
        liveText(label, ()=>String(Math.round(beat) + 1));
        ruler.appendChild(label);
      }
    }
    context.updateBeatGridRangeUI();
    context.layoutWaveTrack();
  }

  function beatGridClientXToBeat(clientX){
    const ruler = document.getElementById("beatGridRuler");
    if (!ruler) return 0;
    const rect = ruler.getBoundingClientRect();
    return clampNum((clientX - rect.left) / context.BEAT_GRID_PX_PER_BEAT, 0, beatGridTimelineBeats());
  }

  function bindBeatGridRangeSelection(){
    const ruler = document.getElementById("beatGridRuler");
    if (!ruler) return;
    ruler.addEventListener("click", e => { if (e.pointerType === 'touch' && !touchTimelineEditing(e)) navigateBeatGridToBeat(beatGridClientXToBeat(e.clientX)); });
    ruler.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !touchTimelineEditing(e) || context.beatGridRangeDrag) return;
      if (context.kfPlaying) context.stopKeyframePlayback();
      const raw = beatGridClientXToBeat(e.clientX);
      const [start] = context.normalizeBeatGridRange(raw, raw);
      context.beatGridRangeDrag = { anchor:start, pointerId:e.pointerId, previous:[context.beatGridRangeStart,context.beatGridRangeEnd,context.beatGridRangeLoop] };
      context.beatGridRangeStart = start;
      context.beatGridRangeEnd = start;
      context.setBeatGridRangeLoop(false);
      ruler.classList.add("rangeDragging");
      try { ruler.setPointerCapture(e.pointerId); } catch (_) {}
      context.updateBeatGridRangeUI();
      e.preventDefault();
    });
    ruler.addEventListener("pointermove", (e) => {
      if (!context.beatGridRangeDrag || e.pointerId !== context.beatGridRangeDrag.pointerId) return;
      const raw = beatGridClientXToBeat(e.clientX);
      const [a,b] = context.normalizeBeatGridRange(context.beatGridRangeDrag.anchor, raw);
      context.beatGridRangeStart = a;
      context.beatGridRangeEnd = b;
      context.updateBeatGridRangeUI();
    });
    const finish = (e) => {
      if (!context.beatGridRangeDrag || e.pointerId !== context.beatGridRangeDrag.pointerId) return;
      const raw = beatGridClientXToBeat(e.clientX);
      let [a,b] = context.normalizeBeatGridRange(context.beatGridRangeDrag.anchor, raw);
      const minSpan = Number(context.BEAT_GRID_SNAP) > 0 ? Number(context.BEAT_GRID_SNAP) : 0.01;
      if (b - a < minSpan - 1e-8){
        // 單擊 Ruler 不建立幾乎零寬的 Range；改成一般導航/預覽。
        const target = clampNum(raw, 0, beatGridTimelineBeats());
        context.beatGridRangeStart = context.beatGridRangeEnd = null;
        context.beatGridRangeLoop = false;
        navigateBeatGridToBeat(target);
      } else {
        context.beatGridRangeStart = a;
        context.beatGridRangeEnd = b;
      }
      context.beatGridRangeDrag = null;
      ruler.classList.remove("rangeDragging");
      try { if (ruler.hasPointerCapture(e.pointerId)) ruler.releasePointerCapture(e.pointerId); } catch (_) {}
      context.updateBeatGridRangeUI();
    };
    ruler.addEventListener("pointerup", finish);
    const cancel = (e) => {
      if (!context.beatGridRangeDrag || e.pointerId !== context.beatGridRangeDrag.pointerId) return;
      [context.beatGridRangeStart,context.beatGridRangeEnd,context.beatGridRangeLoop] = context.beatGridRangeDrag.previous;
      context.beatGridRangeDrag = null;
      ruler.classList.remove("rangeDragging");
      try { if (ruler.hasPointerCapture(e.pointerId)) ruler.releasePointerCapture(e.pointerId); } catch (_) {}
      context.updateBeatGridRangeUI();
    };
    ruler.addEventListener("pointercancel", cancel);
    ruler.addEventListener("lostpointercapture", cancel);
  }

  function renderGrooveLoopGhosts(){
    const host = document.getElementById("grooveSeqList");
    if (!host || context.grooveSequence.length === 0) return;
    host.querySelectorAll(".beatGridGhost").forEach(el => el.remove());
    const seqTotal = context.grooveSeqTotalBeats();
    const total = beatGridPoseTotalBeats();
    if (!(seqTotal > 0 && total > seqTotal)) return;
    const libItems = context.grooveLibCtrl ? context.grooveLibCtrl.getItems() : [];
    for (let cycleStart = seqTotal; cycleStart < total; cycleStart += seqTotal){
      let local = 0;
      context.grooveSequence.forEach((entry) => {
        const dur = Math.max(0, Number(entry.beats) || 0);
        if (dur <= 0 || cycleStart + local >= total) { local += dur; return; }
        const visibleDur = Math.min(dur, total - (cycleStart + local));
        const ghost = document.createElement("div");
        ghost.className = "beatGridGhost";
        ghost.dataset.grooveIndex = String(context.grooveSequence.indexOf(entry));
        ghost.dataset.startBeat = String(cycleStart + local);
        ghost.dataset.endBeat = String(cycleStart + local + visibleDur);
        ghost.style.left = `${(cycleStart + local) * context.BEAT_GRID_PX_PER_BEAT}px`;
        ghost.style.width = `${Math.max(2, visibleDur * context.BEAT_GRID_PX_PER_BEAT - 2)}px`;
        const item = libItems.find(it => it.id === entry.libId);
        liveText(ghost, ()=>item ? `↻ ${item.name}` : "↻ ⚠");
        host.appendChild(ghost);
        local += dur;
      });
    }
  }

  function scrollKfChipIntoView(i){
    const chip = context.kfChipEls[i];
    if (chip) chip.scrollIntoView({ behavior:"smooth", inline:"nearest", block:"nearest" });
  }

  function renderKeyframeChips(){
    context.timelineEditor.render();
  }

  function updatePlayingKeyframeHighlight(){
    context.timelineEditor.updateHighlight();
  }

  function getBeatGridPosePlayheadBeat(now){
    if(context.kfPlaying&&context.waveClips.length)return Math.min(context.wavePlaybackEnd(),Math.max(0,(now-context.grooveStartTime)*context.bpm/60000));
    if (!context.kfPlaying || context.keyframes.length < 2) return 0;
    const frame = context.keyframes[context.kfIndex];
    if (!frame) return 0;
    const segBeats = Math.max(0.0001, Number(frame.beats || 1));
    const segMs = (60000 / context.bpm) * segBeats;
    const progress = Math.max(0, Math.min(1, (now - context.kfStartTime) / segMs));
    return context.keyframeStartBeat(context.kfIndex) + segBeats * progress;
  }

  function getBeatGridGroovePlaybackInfo(now){
    if (!context.kfPlaying || context.grooveSequence.length === 0) return null;
    const beatMs = 60000 / context.bpm;
    const beatsElapsedTotal = Math.max(0, (now - context.grooveStartTime) / beatMs);
    const seg = context.getGrooveActiveSegment(beatsElapsedTotal);
    if (!seg) return null;
    return { beatsElapsedTotal, seg };
  }

  function updateBeatGridGrooveHighlight(now, poseBeat){
    const info = getBeatGridGroovePlaybackInfo(now);
    const activeIndex = info ? info.seg.segIndex : -1;
    for (let i = 0; i < context.grooveSeqChipEls.length; i++){
      const chip = context.grooveSeqChipEls[i];
      if (chip) chip.classList.toggle("activeSeg", context.kfPlaying && i === activeIndex);
    }

    // Ghost 代表第一輪之後在「本次 Pose 時間軸」上的重複區段。
    // 只高亮 Playhead 當下實際穿過的那一個 ghost，避免同一律動在整條軌上全部一起發亮。
    const host = document.getElementById("grooveSeqList");
    if (!host) return;
    host.querySelectorAll(".beatGridGhost").forEach(ghost => {
      const idx = Number(ghost.dataset.grooveIndex);
      const a = Number(ghost.dataset.startBeat);
      const b = Number(ghost.dataset.endBeat);
      const underPlayhead = poseBeat >= a - 1e-6 && poseBeat < b - 1e-6;
      ghost.classList.toggle("activeSeg", context.kfPlaying && idx === activeIndex && underPlayhead);
    });
  }

  function autoScrollBeatGridToPlayhead(playheadX){
    const scroller = document.getElementById("beatGridScroll");
    if (!scroller || scroller.clientWidth <= 0) return;
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    if (maxScroll <= 0) return;

    // Sticky 軌道標籤會佔掉左側固定標籤欄；把 Playhead 維持在可編輯區約 20%~78% 之間。
    const safeLeft = scroller.scrollLeft + context.BEAT_GRID_LABEL_W + Math.min(70, scroller.clientWidth * 0.12);
    const safeRight = scroller.scrollLeft + scroller.clientWidth - Math.min(120, scroller.clientWidth * 0.22);
    let next = scroller.scrollLeft;
    if (playheadX > safeRight){
      next = playheadX - scroller.clientWidth * 0.72;
    } else if (playheadX < safeLeft){
      next = playheadX - context.BEAT_GRID_LABEL_W - scroller.clientWidth * 0.12;
    }
    next = Math.max(0, Math.min(maxScroll, next));
    if (Math.abs(next - scroller.scrollLeft) > 0.5) scroller.scrollLeft = next;
  }

  function updateBeatGridPlaybackUI(now){
    const playhead = document.getElementById("beatGridPlayhead");
    const label = document.getElementById("beatGridPlayheadLabel");
    const scroller = document.getElementById("beatGridScroll");
    if (!playhead) return;
    if (!context.kfPlaying){
      playhead.classList.remove("visible");
      if (scroller) scroller.classList.remove("playing");
      updateBeatGridGrooveHighlight(now || performance.now(), -1);
      return;
    }

    const poseBeat = getBeatGridPosePlayheadBeat(now);
    const x = context.BEAT_GRID_LABEL_W + poseBeat * context.BEAT_GRID_PX_PER_BEAT;
    playhead.style.left = `${x}px`;
    playhead.classList.add("visible");
    if (label) liveText(label, ()=>`Beat ${(poseBeat + 1).toFixed(2)}`);
    if (scroller) scroller.classList.add("playing");
    updateBeatGridGrooveHighlight(now, poseBeat);
    autoScrollBeatGridToPlayhead(x);
  }

  function resetBeatGridPlaybackUI(){
    const playhead = document.getElementById("beatGridPlayhead");
    const scroller = document.getElementById("beatGridScroll");
    if (playhead){ playhead.classList.remove("visible"); playhead.style.left = `${context.BEAT_GRID_LABEL_W}px`; }
    if (scroller) scroller.classList.remove("playing");
    for (const chip of context.grooveSeqChipEls) if (chip) chip.classList.remove("activeSeg");
    const host = document.getElementById("grooveSeqList");
    if (host) host.querySelectorAll(".beatGridGhost.activeSeg").forEach(el => el.classList.remove("activeSeg"));
  }

  function getBeatGridCurrentNavigationBeat(){
    if (context.kfPlaying) return getBeatGridPosePlayheadBeat(performance.now());
    const audioEl = document.getElementById("kfAudioEl");
    if (audioEl && audioEl.src && Number.isFinite(audioEl.currentTime)) return clampNum(context.audioTimeToTimelineBeat(audioEl.currentTime), 0, beatGridTimelineBeats());
    return clampNum(context.beatGridLastPreviewBeat || 0, 0, beatGridTimelineBeats());
  }

  function scrollBeatGridBeatToCenter(beat){
    const scroller = document.getElementById("beatGridScroll");
    if (!scroller) return;
    const x = context.BEAT_GRID_LABEL_W + clampNum(beat, 0, beatGridTimelineBeats()) * context.BEAT_GRID_PX_PER_BEAT;
    const desired = x - scroller.clientWidth * 0.5;
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollLeft = clampNum(desired, 0, maxScroll);
  }

  function navigateBeatGridToBeat(beat){
    if (context.kfPlaying) return;
    const target = clampNum(beat, 0, beatGridTimelineBeats());
    context.beatGridLastPreviewBeat = target;
    context.applyTimelinePreviewAtElapsed(target * 60000 / context.bpm);
    const audioEl = document.getElementById("kfAudioEl");
    if (audioEl && audioEl.src && context.waveform.duration > 0){
      try { audioEl.currentTime = clampNum(context.timelineBeatToAudioTime(target), 0, context.waveform.duration); } catch (_) {}
    }
    context.showBeatGridScrubPlayhead(target);
    scrollBeatGridBeatToCenter(target);
  }

  function centerBeatGridPlayhead(){
    scrollBeatGridBeatToCenter(getBeatGridCurrentNavigationBeat());
  }

  function fitBeatGridTimeline(){
    const scroller = document.getElementById("beatGridScroll");
    if (!scroller) return;
    const beats = Math.max(0.25, beatGridTimelineBeats());
    const usable = Math.max(120, scroller.clientWidth - context.BEAT_GRID_LABEL_W - 8);
    const px = clampNum(usable / beats, 18, 144);
    const old = context.BEAT_GRID_PX_PER_BEAT;
    context.BEAT_GRID_PX_PER_BEAT = px;
    syncBeatGridZoomSelect(px, true);
    refreshBeatGridZoomLayout();
    scroller.scrollLeft = 0;
  }

  function syncBeatGridZoomSelect(px = context.BEAT_GRID_PX_PER_BEAT, custom = false){
    const select = document.getElementById("beatGridZoomSelect");
    if (!select) return;
    select.querySelectorAll('option[data-custom-zoom="1"]').forEach(o => o.remove());
    const exact = Array.from(select.options).find(o => Math.abs(Number(o.value) - px) < 0.01);
    if (exact){ select.value = exact.value; return; }
    const opt = document.createElement("option");
    opt.dataset.customZoom = "1";
    opt.value = String(px);
    liveText(opt, ()=>custom ? `Fit ${Math.round(px / 72 * 100)}%` : `${Math.round(px / 72 * 100)}%`);
    select.appendChild(opt);
    select.value = opt.value;
  }

  function initKfListWheelScroll(){
    const list = document.getElementById("beatGridScroll");
    if (!list) return;
    list.addEventListener("wheel", (e) => {
      // BG-4.2：Ctrl/Cmd + 滾輪縮放整條時間軸，並以滑鼠所在 Beat 當縮放錨點。
      if (e.ctrlKey || e.metaKey){
        const rect = list.getBoundingClientRect();
        const anchorX = e.clientX - rect.left;
        stepBeatGridZoom(e.deltaY < 0 ? 1 : -1, anchorX);
        e.preventDefault();
        return;
      }
      if (e.shiftKey){
        list.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        e.preventDefault();
        return;
      }
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      list.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive:false });
  }
  return { nearestBeatGridZoomLevel, refreshBeatGridZoomLayout, setBeatGridZoomPx, stepBeatGridZoom, grooveSegmentStartBeat, beatGridPoseTotalBeats, beatGridAudioTotalBeats, beatGridTimelineBeats, updateBeatGridGeometry, beatGridClientXToBeat, bindBeatGridRangeSelection, renderGrooveLoopGhosts, scrollKfChipIntoView, renderKeyframeChips, updatePlayingKeyframeHighlight, getBeatGridPosePlayheadBeat, getBeatGridGroovePlaybackInfo, updateBeatGridGrooveHighlight, autoScrollBeatGridToPlayhead, updateBeatGridPlaybackUI, resetBeatGridPlaybackUI, getBeatGridCurrentNavigationBeat, scrollBeatGridBeatToCenter, navigateBeatGridToBeat, centerBeatGridPlayhead, fitBeatGridTimeline, syncBeatGridZoomSelect, initKfListWheelScroll };
}
