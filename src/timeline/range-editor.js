import { countGrabFrames } from './grab-summary.js';
import { t as tr, liveText, liveAttribute } from "../i18n/index.js";
import { clampNum } from "../math/angles.js";

// Host adapter provides live state and owns rendering/history/persistence effects.
export function createRangeEditor(context, doc = document){
  function hasBeatGridRange(){
    return Number.isFinite(context.beatGridRangeStart) && Number.isFinite(context.beatGridRangeEnd) && context.beatGridRangeEnd - context.beatGridRangeStart > 1e-6;
  }

  function normalizeBeatGridRange(a, b){
    const total = context.beatGridTimelineBeats();
    let start = clampNum(Math.min(Number(a) || 0, Number(b) || 0), 0, total);
    let end = clampNum(Math.max(Number(a) || 0, Number(b) || 0), 0, total);
    const step = Number(context.BEAT_GRID_SNAP) || 0;
    const snap = (v) => step > 0 ? clampNum(Number((Math.round(v / step) * step).toFixed(4)), 0, total) : clampNum(Number(v.toFixed(4)), 0, total);
    start = snap(start); end = snap(end);
    if (end < start){ const t = start; start = end; end = t; }
    return [start, end];
  }

  function formatRangeBeatLabel(beat){
    return context.formatBeatValue((Number(beat) || 0) + 1);
  }

  function beatGridRangeClipboardCount(){
    return (context.beatGridRangeClipboard.poseItems?.length || 0) + (context.beatGridRangeClipboard.grooveItems?.length || 0);
  }

  function getBeatGridRangeAffectedItems(start = context.beatGridRangeStart, end = context.beatGridRangeEnd){
    const result = { poseTransitions:[], poseFrameStart:-1, poseFrameEnd:-1, grooveIndices:[] };
    if (!(Number.isFinite(start) && Number.isFinite(end) && end - start > 1e-6)) return result;
    const eps = 1e-7;
    let acc = 0;
    for (let i = 0; i < context.keyframes.length - 1; i++){
      const dur = Math.max(0.0001, Number(context.keyframes[i].beats || 1));
      const a = acc, b = acc + dur;
      if (b > start + eps && a < end - eps) result.poseTransitions.push(i);
      acc = b;
    }
    if (result.poseTransitions.length){
      result.poseFrameStart = result.poseTransitions[0];
      // 要保留最後一個 transition 的 target frame，所以 frameEnd = last transition + 1（inclusive）。
      result.poseFrameEnd = result.poseTransitions[result.poseTransitions.length - 1] + 1;
    }
    acc = 0;
    for (let i = 0; i < context.grooveSequence.length; i++){
      const dur = Math.max(0, Number(context.grooveSequence[i].beats) || 0);
      const a = acc, b = acc + dur;
      if (dur > 0 && b > start + eps && a < end - eps) result.grooveIndices.push(i);
      acc = b;
    }
    return result;
  }

  function showRangeEditHud(message, ms=1100){
    const hud = doc.getElementById("timelineDragHud");
    if (!hud) return;
    liveText(hud, ()=>typeof message==='function'?message():tr(message));
    hud.style.left = "50%"; hud.style.top = "16px"; hud.style.transform = "translateX(-50%)"; hud.style.display = "block";
    clearTimeout(showRangeEditHud._t);
    showRangeEditHud._t = setTimeout(() => { hud.style.display="none"; hud.style.transform=""; }, ms);
  }

  function copyBeatGridRange(){
    if (!hasBeatGridRange()) return false;
    const hit = getBeatGridRangeAffectedItems();
    const poseItems = hit.poseFrameStart >= 0
      ? context.keyframes.slice(hit.poseFrameStart, hit.poseFrameEnd + 1).map(context.deepCloneTimelineItem)
      : [];
    const grooveItems = hit.grooveIndices.map(i => context.deepCloneTimelineItem(context.grooveSequence[i]));
    if (!poseItems.length && !grooveItems.length){
      showRangeEditHud(()=>tr("Range 內沒有可複製項目"));
      return false;
    }
    context.beatGridRangeClipboard = {
      poseItems,
      grooveItems,
      source:{ start:context.beatGridRangeStart, end:context.beatGridRangeEnd },
      affected:{ poseTransitions:hit.poseTransitions.length, grooves:hit.grooveIndices.length }
    };
    updateBeatGridRangeUI();
    const parts=[];
    if (hit.poseTransitions.length) parts.push(`${hit.poseTransitions.length} POSE transition`);
    if (hit.grooveIndices.length) parts.push(`${hit.grooveIndices.length} GROOVE`);
    showRangeEditHud(()=>tr("已複製 Range：{p0}", {p0:parts.join(" + ")})+tr("；{poses} 個 POSE，{count} 個含扶握資料",{poses:poseItems.length,count:countGrabFrames(poseItems)}));
    return true;
  }

  function findPoseRangeInsertIndexAtBeat(beat){
    if (!context.keyframes.length) return 0;
    const target = Math.max(0, Number(beat) || 0);
    for (let i = 0; i < context.keyframes.length; i++){
      if (context.keyframeStartBeat(i) >= target - 1e-7) return i;
    }
    return context.keyframes.length;
  }

  function findGrooveRangeInsertIndexAtBeat(beat){
    const target = Math.max(0, Number(beat) || 0);
    for (let i = 0; i < context.grooveSequence.length; i++){
      if (context.grooveSegmentStartBeat(i) >= target - 1e-7) return i;
    }
    return context.grooveSequence.length;
  }

  function pasteBeatGridRange({push=true, showHud=true}={}){
    if (context.kfPlaying || !hasBeatGridRange() || beatGridRangeClipboardCount() === 0) return false;
    const poseCopies = (context.beatGridRangeClipboard.poseItems || []).map(context.deepCloneTimelineItem);
    const grooveCopies = (context.beatGridRangeClipboard.grooveItems || []).map(it => Object.assign(context.deepCloneTimelineItem(it), {id:context.makeLibId()}));
    const insertBeat = context.beatGridRangeEnd;
    // Range 編輯採完整項目語意：若 Range 結尾落在某個 transition/clip 中間，
    // 貼上位置要放到該完整項目之後，而不是硬插進它的中間。
    const currentHit = getBeatGridRangeAffectedItems();
    const poseAt = currentHit.poseFrameEnd >= 0 ? currentHit.poseFrameEnd + 1 : findPoseRangeInsertIndexAtBeat(insertBeat);
    const grooveAt = currentHit.grooveIndices.length ? currentHit.grooveIndices[currentHit.grooveIndices.length - 1] + 1 : findGrooveRangeInsertIndexAtBeat(insertBeat);
    if (poseCopies.length) context.keyframes.splice(poseAt, 0, ...poseCopies);
    if (grooveCopies.length) context.grooveSequence.splice(grooveAt, 0, ...grooveCopies);
    context.kfEditingIndex = -1; context.grooveSeqSelectedIndex = -1;
    context.kfMultiSelected.clear(); context.grooveMultiSelected.clear();
    context.updateKfMultiSelectBar(); context.syncEasingControlsFromSelection();
    context.renderKeyframeChips(); context.renderGrooveSeqChips(); context.scheduleAutoSave();
    if (push) context.pushHistory();
    updateBeatGridRangeUI();
    if (showHud) showRangeEditHud(()=>tr("已貼上 Range：{p0}{p1}{p2}", {p0:poseCopies.length ? (poseCopies.length-1)+" POSE transition" : "", p1:poseCopies.length && grooveCopies.length ? " + " : "", p2:grooveCopies.length ? grooveCopies.length+" GROOVE" : ""}));
    return true;
  }

  function duplicateBeatGridRange(){
    if (context.kfPlaying || !hasBeatGridRange()) return false;
    if (!copyBeatGridRange()) return false;
    // copy 本身不寫 history；paste 只寫一次，因此整個 Duplicate 是單一 Undo transaction。
    const ok = pasteBeatGridRange({push:true, showHud:false});
    if (ok) showRangeEditHud(()=>tr("Range 已重複到選取範圍之後"));
    return ok;
  }

  function deleteBeatGridRange(){
    if (context.kfPlaying || !hasBeatGridRange()) return false;
    const hit = getBeatGridRangeAffectedItems();
    const poseCount = hit.poseTransitions.length;
    const grooveCount = hit.grooveIndices.length;
    if (!poseCount && !grooveCount){ showRangeEditHud(()=>tr("Range 內沒有可刪除項目")); return false; }
    const parts=[];
    if (poseCount) parts.push(()=>tr("{p0} 個 POSE transition", {p0:poseCount}));
    if (grooveCount) parts.push(()=>tr("{p0} 個 GROOVE clip", {p0:grooveCount}));
    if (!context.confirm(tr("確定刪除 Range 相交的 {p0}？\n\n目前版本以完整 Timeline 項目為單位刪除，後方內容會自動前移。此動作可用 Ctrl+Z 復原。", {p0:parts.map(render=>render()).join("、")}))) return false;

    // POSE transition i 對應移除它的起始 frame i；保留最後 target frame，確保至少留下一個姿勢。
    hit.poseTransitions.slice().sort((a,b)=>b-a).forEach(i => {
      if (i >= 0 && i < context.keyframes.length - 1) context.keyframes.splice(i, 1);
    });
    hit.grooveIndices.slice().sort((a,b)=>b-a).forEach(i => {
      if (i >= 0 && i < context.grooveSequence.length) context.grooveSequence.splice(i, 1);
    });
    if (context.kfPlaying && context.keyframes.length < 2) context.stopKeyframePlayback();
    context.kfEditingIndex = -1; context.grooveSeqSelectedIndex = -1;
    context.kfMultiSelected.clear(); context.grooveMultiSelected.clear();
    context.beatGridRangeLoop = false;
    context.beatGridRangeStart = context.beatGridRangeEnd = null;
    context.updateKfMultiSelectBar(); context.syncEasingControlsFromSelection();
    context.renderKeyframeChips(); context.renderGrooveSeqChips(); context.scheduleAutoSave(); context.pushHistory();
    updateBeatGridRangeUI();
    showRangeEditHud(()=>tr("已刪除 {p0}", {p0:parts.map(render=>render()).join(" + ")}));
    return true;
  }

  function updateBeatGridRangeUI(){
    const overlay = doc.getElementById("beatGridRangeSelection");
    const info = doc.getElementById("beatGridRangeInfo");
    const loopBtn = doc.getElementById("beatGridRangeLoopBtn");
    const clearBtn = doc.getElementById("beatGridRangeClearBtn");
    const copyBtn = doc.getElementById("beatGridRangeCopyBtn");
    const pasteBtn = doc.getElementById("beatGridRangePasteBtn");
    const duplicateBtn = doc.getElementById("beatGridRangeDuplicateBtn");
    const deleteBtn = doc.getElementById("beatGridRangeDeleteBtn");
    const valid = hasBeatGridRange();
    const hit = valid ? getBeatGridRangeAffectedItems() : {poseTransitions:[], grooveIndices:[]};
    const affectedCount = hit.poseTransitions.length + hit.grooveIndices.length;
    if (overlay){
      overlay.classList.toggle("active", valid);
      overlay.classList.toggle("looping", valid && context.beatGridRangeLoop);
      if (valid){
        overlay.style.left = `${context.BEAT_GRID_LABEL_W + context.beatGridRangeStart * context.BEAT_GRID_PX_PER_BEAT}px`;
        overlay.style.width = `${Math.max(2, (context.beatGridRangeEnd - context.beatGridRangeStart) * context.BEAT_GRID_PX_PER_BEAT)}px`;
      }
    }
    if (info){
      if (valid){
        const counts = [];
        if (hit.poseTransitions.length) counts.push(`P${hit.poseTransitions.length}`);
        if (hit.grooveIndices.length) counts.push(`G${hit.grooveIndices.length}`);
        liveText(info, ()=>tr("Beat {p0}→{p1} · {p2}拍{p3}", {p0:formatRangeBeatLabel(context.beatGridRangeStart), p1:formatRangeBeatLabel(context.beatGridRangeEnd), p2:context.formatBeatValue(context.beatGridRangeEnd - context.beatGridRangeStart), p3:counts.length ? " · "+counts.join("/") : ""}));
        liveAttribute(info, "title", ()=>tr("{p0}\n  Range 編輯以與範圍相交的完整 POSE transition / GROOVE clip 為單位", {p0:info.textContent}));
      } else {
        liveText(info, ()=>tr("未選範圍"));
        liveAttribute(info, "title", ()=>info.textContent);
      }
    }
    if (loopBtn){
      const poseTotal = context.waveClips.length?context.wavePlaybackEnd():context.beatGridPoseTotalBeats();
      const playable = valid && (context.keyframes.length >= 2 || context.waveClips.length > 0) && context.beatGridRangeStart < poseTotal - 1e-6;
      loopBtn.disabled = !playable;
      loopBtn.classList.toggle("active", playable && context.beatGridRangeLoop);
      liveText(loopBtn, ()=>playable && context.beatGridRangeLoop ? "⟳ Range ON" : "⟳ Range");
      liveAttribute(loopBtn, "title", ()=>playable ? tr("只循環播放選取範圍") : (valid ? tr("Range 必須與 POSE／WAVING 播放範圍重疊") : tr("請先在 Beat Ruler 上拖曳選取範圍")));
    }
    if (copyBtn) copyBtn.disabled = !valid || affectedCount === 0 || context.kfPlaying;
    if (pasteBtn) pasteBtn.disabled = !valid || beatGridRangeClipboardCount() === 0 || context.kfPlaying;
    if (duplicateBtn) duplicateBtn.disabled = !valid || affectedCount === 0 || context.kfPlaying;
    if (deleteBtn) deleteBtn.disabled = !valid || affectedCount === 0 || context.kfPlaying;
    if (clearBtn) clearBtn.disabled = !valid;
  }

  function clearBeatGridRange(){
    context.beatGridRangeStart = null;
    context.beatGridRangeEnd = null;
    context.beatGridRangeLoop = false;
    context.beatGridRangeDrag = null;
    updateBeatGridRangeUI();
  }

  function setBeatGridRangeLoop(on){
    if (!hasBeatGridRange()) on = false;
    if (on){
      const poseTotal = context.waveClips.length?context.wavePlaybackEnd():context.beatGridPoseTotalBeats();
      if (!((context.keyframes.length >= 2 || context.waveClips.length > 0) && context.beatGridRangeStart < poseTotal - 1e-6)) on = false;
      else if (context.beatGridRangeEnd > poseTotal){
        context.beatGridRangeEnd = poseTotal;
        if (!(context.beatGridRangeEnd - context.beatGridRangeStart > 1e-6)) on = false;
      }
    }
    context.beatGridRangeLoop = !!on;
    if (context.beatGridRangeLoop){
      // Range Loop 與整段 Loop 互斥，避免播放結尾規則出現兩個來源。
      context.kfLoop = false;
      const fullLoopBtn = doc.getElementById("kfLoopBtn");
      if (fullLoopBtn) fullLoopBtn.classList.remove("active");
    }
    updateBeatGridRangeUI();
  }

  return { hasBeatGridRange, normalizeBeatGridRange, formatRangeBeatLabel, beatGridRangeClipboardCount, getBeatGridRangeAffectedItems, showRangeEditHud, copyBeatGridRange, findPoseRangeInsertIndexAtBeat, findGrooveRangeInsertIndexAtBeat, pasteBeatGridRange, duplicateBeatGridRange, deleteBeatGridRange, updateBeatGridRangeUI, clearBeatGridRange, setBeatGridRangeLoop };
}
