import { buildEasingSelectOptions } from "../ui/easing-gallery.js";

// Live host getters preserve shared rig and playback coordination.
export function createTimelineToolbar(context){
  function bindTimelineUI(){
    document.getElementById("kfPlayBtn").onclick = context.toggleKeyframePlayback;
    const kfLoopBtn = document.getElementById("kfLoopBtn");
    kfLoopBtn.classList.toggle("active", context.kfLoop); // 圖示按鈕改用 active class 表示目前是否為循環播放狀態，跟其他切換按鈕（如手指 IK）同一套視覺語言
    kfLoopBtn.onclick = () => {
      context.kfLoop = !context.kfLoop;
      if (context.kfLoop) context.setBeatGridRangeLoop(false);
      kfLoopBtn.classList.toggle("active", context.kfLoop);
    };
    const beatGridZoomSelect = document.getElementById("beatGridZoomSelect");
    const beatGridZoomOutBtn = document.getElementById("beatGridZoomOutBtn");
    const beatGridZoomInBtn = document.getElementById("beatGridZoomInBtn");
    if (beatGridZoomSelect){
      context.syncBeatGridZoomSelect(context.BEAT_GRID_PX_PER_BEAT);
      beatGridZoomSelect.onchange = (e) => context.setBeatGridZoomPx(Number(e.target.value));
    }
    if (beatGridZoomOutBtn) beatGridZoomOutBtn.onclick = () => context.stepBeatGridZoom(-1);
    if (beatGridZoomInBtn) beatGridZoomInBtn.onclick = () => context.stepBeatGridZoom(1);
    const beatGridSnapSelect = document.getElementById("beatGridSnapSelect");
    if (beatGridSnapSelect){
      beatGridSnapSelect.value = String(context.BEAT_GRID_SNAP);
      beatGridSnapSelect.onchange = (e) => context.setBeatGridSnap(Number(e.target.value));
    }
    context.setBeatGridSnap(context.BEAT_GRID_SNAP);
    const beatGridHomeBtn = document.getElementById("beatGridHomeBtn");
    const beatGridEndBtn = document.getElementById("beatGridEndBtn");
    const beatGridFitBtn = document.getElementById("beatGridFitBtn");
    const beatGridCenterBtn = document.getElementById("beatGridCenterBtn");
    if (beatGridHomeBtn) beatGridHomeBtn.onclick = () => context.navigateBeatGridToBeat(0);
    if (beatGridEndBtn) beatGridEndBtn.onclick = () => context.navigateBeatGridToBeat(context.beatGridTimelineBeats());
    if (beatGridFitBtn) beatGridFitBtn.onclick = context.fitBeatGridTimeline;
    if (beatGridCenterBtn) beatGridCenterBtn.onclick = context.centerBeatGridPlayhead;
    const beatGridRangeLoopBtn = document.getElementById("beatGridRangeLoopBtn");
    const beatGridRangeCopyBtn = document.getElementById("beatGridRangeCopyBtn");
    const beatGridRangePasteBtn = document.getElementById("beatGridRangePasteBtn");
    const beatGridRangeDuplicateBtn = document.getElementById("beatGridRangeDuplicateBtn");
    const beatGridRangeDeleteBtn = document.getElementById("beatGridRangeDeleteBtn");
    const beatGridRangeClearBtn = document.getElementById("beatGridRangeClearBtn");
    if (beatGridRangeLoopBtn) beatGridRangeLoopBtn.onclick = () => context.setBeatGridRangeLoop(!context.beatGridRangeLoop);
    if (beatGridRangeCopyBtn) beatGridRangeCopyBtn.onclick = context.copyBeatGridRange;
    if (beatGridRangePasteBtn) beatGridRangePasteBtn.onclick = () => context.pasteBeatGridRange();
    if (beatGridRangeDuplicateBtn) beatGridRangeDuplicateBtn.onclick = context.duplicateBeatGridRange;
    if (beatGridRangeDeleteBtn) beatGridRangeDeleteBtn.onclick = context.deleteBeatGridRange;
    if (beatGridRangeClearBtn) beatGridRangeClearBtn.onclick = context.clearBeatGridRange;
    context.bindBeatGridRangeSelection();
    context.updateBeatGridRangeUI();
    const onionChkDisplay = document.getElementById("onionSkinChkDisplay");
    if (onionChkDisplay){
      onionChkDisplay.checked = context.onionSkinEnabled;
      onionChkDisplay.onchange = (e) => { context.onionSkinEnabled = e.target.checked; context.updateOnionSkins(); };
    }
    context.bindGrooveUI();
    const kfMusicWaveformDetails = document.getElementById("kfMusicWaveformDetails");
    document.getElementById("kfAddBtn").onclick = () => { context.addKeyframe(); context.pushHistory(); };
    document.getElementById("kfUpdateBtn").onclick = () => { context.updateKeyframe(); context.pushHistory(); };
    document.getElementById("kfMultiSelectBtn").onclick = () => context.setKfMultiSelectMode(!context.kfMultiSelectMode);
    document.getElementById("kfMultiSelectAllBtn").onclick = context.kfMultiSelectAll;
    document.getElementById("kfMultiSelectNoneBtn").onclick = context.kfMultiSelectNone;
    document.getElementById("kfMultiSelectCopyBtn").onclick = context.copyTimelineSelection;
    document.getElementById("kfMultiSelectCutBtn").onclick = context.cutTimelineSelection;
    document.getElementById("kfMultiSelectPasteBtn").onclick = context.pasteTimelineClipboard;
    document.getElementById("kfMultiSelectDeleteBtn").onclick = context.deleteKfMultiSelected;
    context.updateKfMultiSelectBar();
    document.getElementById("kfExportBtn").onclick = context.exportTimeline;
    document.getElementById("kfImportBtn").onclick = () => document.getElementById("kfImportFile").click();
    document.getElementById("kfImportFile").onchange = (e) => {
      const file = e.target.files[0];
      if (file) context.importTimelineFromFile(file);
      e.target.value = ""; // 清空選取，允許連續匯入同一個檔名的檔案
    };
    document.getElementById("kfMusicImportBtn").onclick = () => document.getElementById("kfMusicFile").click();
    document.getElementById("kfMusicFile").onchange = (e) => {
      const file = e.target.files[0];
      if (file) context.importKfMusic(file);
      e.target.value = "";
    };
    document.getElementById("kfMusicRemoveBtn").onclick = context.removeKfMusic;
    document.getElementById("kfMusicVolume").oninput = (e) => {
      document.getElementById("kfAudioEl").volume = parseFloat(e.target.value);
    };
    document.getElementById("kfMusicOffset").oninput = () => {
      context.waveform.invalidate();
      context.updateBeatGridGeometry();
      context.drawKfWaveform();
    };
    document.getElementById("kfAudioEl").addEventListener("timeupdate", context.updateBeatGridMusicPreviewPlayhead);
    document.getElementById("kfMusicPreviewBtn").onclick = context.toggleKfMusicPreview;
    ["play", "pause", "ended"].forEach(evt => document.getElementById("kfAudioEl").addEventListener(evt, () => {
      context.syncKfMusicPreviewBtn();
      context.updateBeatGridMusicPreviewPlayhead();
    }));
    context.initKfListWheelScroll();
    bindKfKeyboardShortcuts();
    context.bindKfWaveformScrubbing();
    window.addEventListener("resize", () => { context.updateBeatGridGeometry(); context.drawKfWaveform(); });

    const easeSel = document.getElementById("kfEasingSelect");
    easeSel.innerHTML = buildEasingSelectOptions();
    easeSel.value = context.kfPendingEasing;
    easeSel.onchange = (e) => { context.setKeyframeEasing(e.target.value); context.pushHistory(); };

    const beatsSel = document.getElementById("kfBeatsSelect");
    beatsSel.value = String(context.kfPendingBeats);
    beatsSel.onchange = (e) => { context.setKeyframeBeats(parseFloat(e.target.value)); context.pushHistory(); };

    context.updateEasingPreview();
    context.updateBeatMsHint();
    context.updateBeatGridPoseInspector();

  }

  function bindKfKeyboardShortcuts(){
    window.addEventListener("keydown", (e) => {
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (typing || !context.isKeyframeTabActive()) return;
      if (e.key === "Escape" && context.hasBeatGridRange()){ e.preventDefault(); context.clearBeatGridRange(); return; }
      if (!context.kfPlaying && e.key === "Home"){ e.preventDefault(); context.navigateBeatGridToBeat(0); return; }
      if (!context.kfPlaying && e.key === "End"){ e.preventDefault(); context.navigateBeatGridToBeat(context.beatGridTimelineBeats()); return; }
      if (!context.kfPlaying && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "f"){ e.preventDefault(); context.fitBeatGridTimeline(); return; }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "c"){ e.preventDefault(); context.centerBeatGridPlayhead(); return; }
      if (context.kfPlaying) return;
      if(context.waveClipSelected){
        if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();context.deleteWaveClip();return;}
        if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();context.duplicateWaveClip();return;}
      }

      // 多選模式下，←/→切換選取跟 Ctrl+D複製都沒有明確意義（多選沒有「唯一選取中」的拍點），
      // 只保留 Delete/Backspace，行為改成刪除目前已勾選的全部拍點。
      if (context.kfMultiSelectMode){
        if (e.key === "Delete" || e.key === "Backspace"){
          if (context.kfMultiSelected.size === 0 && context.grooveMultiSelected.size === 0) return;
          e.preventDefault();
          context.deleteTimelineSelection({confirmDelete:false, push:true});
        }
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight"){
        if (context.keyframes.length === 0) return;
        e.preventDefault();
        let next = context.kfEditingIndex < 0 ? 0 : context.kfEditingIndex + (e.key === "ArrowRight" ? 1 : -1);
        next = Math.max(0, Math.min(context.keyframes.length - 1, next));
        context.selectKeyframe(next);
      } else if (e.key === "Delete" || e.key === "Backspace"){
        if (context.grooveSeqSelectedIndex >= 0){
          e.preventDefault();
          context.removeGrooveSeqEntry(context.grooveSeqSelectedIndex);
          context.pushHistory();
          return;
        }
        if (context.kfEditingIndex < 0) return;
        e.preventDefault();
        context.deleteKeyframe(context.kfEditingIndex);
        context.pushHistory();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d"){
        if (context.kfEditingIndex < 0) return;
        e.preventDefault();
        context.duplicateKeyframe(context.kfEditingIndex);
        context.pushHistory();
      }
    });
  }
  return { bindTimelineUI, bindKfKeyboardShortcuts };
}
