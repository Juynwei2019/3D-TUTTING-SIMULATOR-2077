// Live host getters preserve shared rig and playback coordination.
export function createTimelineResize(context){
  function normalizeTimelineBeats(beats, minBeats = 0.01, maxBeats = 64){
    const raw = Number(beats);
    const safe = Number.isFinite(raw) ? raw : 1;
    return Math.max(minBeats, Math.min(maxBeats, Number(safe.toFixed(4))));
  }

  function snapTimelineBeats(beats, minBeats = null, maxBeats = 64){
    const step = Number(context.BEAT_GRID_SNAP) || 0;
    const min = minBeats == null ? (step > 0 ? step : 0.01) : minBeats;
    const safe = normalizeTimelineBeats(beats, min, maxBeats);
    if (!(step > 0)) return safe;
    return Math.max(min, Math.min(maxBeats, Number((Math.round(safe / step) * step).toFixed(4))));
  }

  function snapGrooveBeats(beats){
    return snapTimelineBeats(beats);
  }

  function formatSnapLabel(step = context.BEAT_GRID_SNAP){
    if (!(step > 0)) return "Off";
    if (Math.abs(step - 1) < 1e-9) return "1";
    if (Math.abs(step - .5) < 1e-9) return "1/2";
    if (Math.abs(step - .25) < 1e-9) return "1/4";
    if (Math.abs(step - .125) < 1e-9) return "1/8";
    if (Math.abs(step - .0625) < 1e-9) return "1/16";
    return formatBeatValue(step);
  }

  function setBeatGridSnap(step){
    const n = Number(step);
    context.BEAT_GRID_SNAP = Number.isFinite(n) && n >= 0 ? n : 0.25;
    const select = document.getElementById("beatGridSnapSelect");
    if (select) select.value = String(context.BEAT_GRID_SNAP);
    const legend = document.getElementById("beatGridSnapLegend");
    if (legend) legend.textContent = `Snap＝${formatSnapLabel()}${context.BEAT_GRID_SNAP > 0 ? "拍" : ""}`;
    document.querySelectorAll("#grooveSeqList .beatsInput").forEach(input => {
      input.step = context.BEAT_GRID_SNAP > 0 ? String(context.BEAT_GRID_SNAP) : "0.01";
      input.min = context.BEAT_GRID_SNAP > 0 ? String(context.BEAT_GRID_SNAP) : "0.01";
    });
    if (context.hasBeatGridRange()){
      const [a,b] = context.normalizeBeatGridRange(context.beatGridRangeStart, context.beatGridRangeEnd);
      context.beatGridRangeStart = a; context.beatGridRangeEnd = b;
    }
    context.updateBeatGridRangeUI();
  }

  function formatBeatValue(v){
    const n = Number(v) || 0;
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
  }

  function syncBeatSelectValue(select, beats){
    if (!select) return;
    const value = normalizeTimelineBeats(beats);
    select.querySelectorAll('option[data-custom-beat="1"]').forEach(o => o.remove());
    let match = Array.from(select.options).find(o => Math.abs(Number(o.value) - value) < 1e-9);
    if (!match){
      match = document.createElement("option");
      match.value = formatBeatValue(value);
      match.textContent = `${formatBeatValue(value)} 拍`;
      match.dataset.customBeat = "1";
      select.appendChild(match);
    }
    select.value = match.value;
  }

  function updateKeyframeClipLayoutOnly(){
    context.updateBeatGridGeometry();
    for (let i = 0; i < context.kfChipEls.length; i++){
      const chip = context.kfChipEls[i];
      const kf = context.keyframes[i];
      if (!chip || !kf) continue;
      const startBeat = context.keyframeStartBeat(i);
      const isEnd = i === context.keyframes.length - 1;
      const durationBeats = isEnd ? 0 : normalizeTimelineBeats(kf.beats || 1);
      const widthPx = isEnd ? 48 : Math.max(2, durationBeats * context.BEAT_GRID_PX_PER_BEAT - 2);
      chip.style.left = `${startBeat * context.BEAT_GRID_PX_PER_BEAT}px`;
      chip.style.width = `${widthPx}px`;
      chip.classList.toggle("beatGridCompact", widthPx < 92);
      const easeTag = chip.querySelector(".kfEaseTag");
      if (easeTag && !isEnd){
        const easeName = kf.easing || "easeInOutQuad";
        easeTag.title = `${easeName} · ${formatBeatValue(durationBeats)} 拍`;
        const span = easeTag.querySelector("span");
        if (span) span.textContent = `${formatBeatValue(durationBeats)}拍`;
      }
    }
    if (context.kfEditingIndex >= 0 && context.keyframes[context.kfEditingIndex]){
      context.kfPendingBeats = normalizeTimelineBeats(context.keyframes[context.kfEditingIndex].beats || 1);
      syncBeatSelectValue(document.getElementById("kfBeatsSelect"), context.kfPendingBeats);
      context.updateBeatMsHint();
      context.updateBeatGridPoseInspector();
    }
    context.updateKfTotalDurationLabel();
    context.renderGrooveLoopGhosts();
    context.drawKfWaveform();
  }

  function updateGrooveClipLayoutOnly(){
    context.updateBeatGridGeometry();
    for (let i = 0; i < context.grooveSeqChipEls.length; i++){
      const chip = context.grooveSeqChipEls[i];
      const entry = context.grooveSequence[i];
      if (!chip || !entry) continue;
      const startBeat = context.grooveSegmentStartBeat(i);
      const durationBeats = Math.max(0.01, Number(entry.beats) || 0.01);
      const widthPx = Math.max(2, durationBeats * context.BEAT_GRID_PX_PER_BEAT - 2);
      chip.style.left = `${startBeat * context.BEAT_GRID_PX_PER_BEAT}px`;
      chip.style.width = `${widthPx}px`;
      chip.classList.toggle("beatGridCompact", widthPx < 126);
      const input = chip.querySelector(".beatsInput");
      if (input && document.activeElement !== input) input.value = formatBeatValue(durationBeats);
    }
    context.renderGrooveLoopGhosts();
    context.updateGrooveSeqTotalLabel();
  }

  function beginTimelineResize(e, config){
    if (context.kfPlaying || !config || !config.chip || !config.handle) return;
    e.preventDefault();
    e.stopPropagation();
    if (config.select) config.select();

    const chip = config.chip;
    const handle = config.handle;
    const startX = e.clientX;
    const startBeats = normalizeTimelineBeats(config.getBeats());
    let lastBeats = startBeats;
    let changed = false;
    const hud = document.getElementById("timelineResizeHud");
    const originalDraggable = chip.draggable;
    chip.draggable = false;
    chip.classList.add("resizing");
    handle.classList.add("resizing");
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}

    const showHud = (ev, beats) => {
      if (!hud) return;
      const extra = config.hudExtra ? config.hudExtra(beats) : "";
      hud.textContent = `${config.label || "Duration"} · ${formatBeatValue(beats)} beat${Math.abs(beats - 1) < 1e-9 ? "" : "s"}${extra ? ` · ${extra}` : ""}`;
      hud.style.left = `${Math.min(window.innerWidth - 230, ev.clientX + 12)}px`;
      hud.style.top = `${Math.max(6, ev.clientY - 30)}px`;
      hud.style.display = "block";
    };
    showHud(e, startBeats);

    const onMove = (ev) => {
      const deltaBeats = (ev.clientX - startX) / context.BEAT_GRID_PX_PER_BEAT;
      const next = snapTimelineBeats(startBeats + deltaBeats);
      if (Math.abs(lastBeats - next) > 1e-9){
        config.setBeats(next);
        lastBeats = next;
        changed = Math.abs(startBeats - next) > 1e-9;
        config.updateLayout();
      }
      showHud(ev, next);
    };
    const finish = (cancelled = false) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onCancel);
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      chip.classList.remove("resizing");
      handle.classList.remove("resizing");
      chip.draggable = originalDraggable;
      if (hud) hud.style.display = "none";
      if (cancelled){
        config.setBeats(startBeats);
        config.updateLayout();
        return;
      }
      config.updateLayout();
      if (changed){
        context.scheduleAutoSave();
        context.pushHistory();
      }
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onCancel);
  }

  function beginPoseResize(e, i, chip, handle){
    if (i < 0 || i >= context.keyframes.length - 1 || context.kfMultiSelectMode) return;
    beginTimelineResize(e, {
      chip, handle,
      label: `F${i+1} → F${i+2}`,
      select: () => context.selectKeyframeStateOnly(i),
      getBeats: () => context.keyframes[i] ? (context.keyframes[i].beats || 1) : 1,
      setBeats: (v) => { if (context.keyframes[i]) context.keyframes[i].beats = v; },
      updateLayout: updateKeyframeClipLayoutOnly,
      hudExtra: (beats) => {
        const sec = (beats * (60000 / context.bpm) / 1000).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
        return `${sec}s`;
      }
    });
  }

  function beginGrooveResize(e, i, chip, handle){
    if (i < 0 || i >= context.grooveSequence.length) return;
    beginTimelineResize(e, {
      chip, handle,
      label: "GROOVE",
      select: () => context.selectGrooveSeqEntry(i),
      getBeats: () => context.grooveSequence[i] ? context.grooveSequence[i].beats : 1,
      setBeats: (v) => { if (context.grooveSequence[i]) context.grooveSequence[i].beats = v; },
      updateLayout: updateGrooveClipLayoutOnly
    });
  }
  return { normalizeTimelineBeats, snapTimelineBeats, snapGrooveBeats, formatSnapLabel, setBeatGridSnap, formatBeatValue, syncBeatSelectValue, updateKeyframeClipLayoutOnly, updateGrooveClipLayoutOnly, beginTimelineResize, beginPoseResize, beginGrooveResize };
}
