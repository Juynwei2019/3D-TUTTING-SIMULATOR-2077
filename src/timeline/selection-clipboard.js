// Host adapter provides live state and owns rendering/history/persistence effects.
export function createTimelineSelection(context, doc = document){
  function timelineClipboardCount(){
    return (context.timelineClipboard.poseItems?.length || 0) + (context.timelineClipboard.grooveItems?.length || 0);
  }

  function updateKfMultiSelectBar(){
    const bar = doc.getElementById("kfMultiSelectBar");
    const btn = doc.getElementById("kfMultiSelectBtn");
    const countEl = doc.getElementById("kfMultiSelectCount");
    const delBtn = doc.getElementById("kfMultiSelectDeleteBtn");
    const copyBtn = doc.getElementById("kfMultiSelectCopyBtn");
    const cutBtn = doc.getElementById("kfMultiSelectCutBtn");
    const pasteBtn = doc.getElementById("kfMultiSelectPasteBtn");
    const total = context.kfMultiSelected.size + context.grooveMultiSelected.size;
    if (btn) btn.classList.toggle("active", context.kfMultiSelectMode);
    if (bar) bar.style.display = context.kfMultiSelectMode ? "inline-flex" : "none";
    if (countEl){
      const parts = [];
      if (context.kfMultiSelected.size) parts.push(`POSE ${context.kfMultiSelected.size}`);
      if (context.grooveMultiSelected.size) parts.push(`GROOVE ${context.grooveMultiSelected.size}`);
      countEl.textContent = total ? `已選 ${parts.join(" · ")}` : "已選 0 個";
    }
    if (delBtn) delBtn.disabled = total === 0;
    if (copyBtn) copyBtn.disabled = total === 0;
    if (cutBtn) cutBtn.disabled = total === 0;
    if (pasteBtn) pasteBtn.disabled = timelineClipboardCount() === 0;
  }

  function setKfMultiSelectMode(on){
    context.kfMultiSelectMode = on;
    context.kfMultiSelected.clear();
    context.grooveMultiSelected.clear();
    if (on){
      context.kfEditingIndex = -1;
      context.grooveSeqSelectedIndex = -1;
      context.syncEasingControlsFromSelection();
      if (context.kfPlaying) context.stopKeyframePlayback();
    }
    updateKfMultiSelectBar();
    context.renderKeyframeChips();
    context.renderGrooveSeqChips();
  }

  function toggleKfMultiSelectItem(i){
    if (context.kfMultiSelected.has(i)) context.kfMultiSelected.delete(i); else context.kfMultiSelected.add(i);
    updateKfMultiSelectBar();
    context.renderKeyframeChips();
  }

  function toggleGrooveMultiSelectItem(i){
    if (context.grooveMultiSelected.has(i)) context.grooveMultiSelected.delete(i); else context.grooveMultiSelected.add(i);
    updateKfMultiSelectBar();
    context.renderGrooveSeqChips();
  }

  function kfMultiSelectAll(){
    context.kfMultiSelected = new Set(context.keyframes.map((_, i) => i));
    context.grooveMultiSelected = new Set(context.grooveSequence.map((_, i) => i));
    updateKfMultiSelectBar();
    context.renderKeyframeChips();
    context.renderGrooveSeqChips();
  }

  function kfMultiSelectNone(){
    context.kfMultiSelected.clear();
    context.grooveMultiSelected.clear();
    updateKfMultiSelectBar();
    context.renderKeyframeChips();
    context.renderGrooveSeqChips();
  }

  function deepCloneTimelineItem(item){
    return JSON.parse(JSON.stringify(item));
  }

  function currentTimelineClipboardSelection(){
    let poseIndices = [];
    let grooveIndices = [];
    if (context.kfMultiSelectMode){
      poseIndices = Array.from(context.kfMultiSelected).filter(i => context.keyframes[i]).sort((a,b)=>a-b);
      grooveIndices = Array.from(context.grooveMultiSelected).filter(i => context.grooveSequence[i]).sort((a,b)=>a-b);
    } else if (context.kfEditingIndex >= 0 && context.keyframes[context.kfEditingIndex]){
      poseIndices = [context.kfEditingIndex];
    } else if (context.grooveSeqSelectedIndex >= 0 && context.grooveSequence[context.grooveSeqSelectedIndex]){
      grooveIndices = [context.grooveSeqSelectedIndex];
    }
    return { poseIndices, grooveIndices };
  }

  function copyTimelineSelection(){
    const {poseIndices, grooveIndices} = currentTimelineClipboardSelection();
    if (!poseIndices.length && !grooveIndices.length) return false;
    context.timelineClipboard = {
      poseItems: poseIndices.map(i => deepCloneTimelineItem(context.keyframes[i])),
      grooveItems: grooveIndices.map(i => deepCloneTimelineItem(context.grooveSequence[i]))
    };
    updateKfMultiSelectBar();
    const hud = doc.getElementById("timelineDragHud");
    if (hud){
      const parts=[];
      if (context.timelineClipboard.poseItems.length) parts.push(`${context.timelineClipboard.poseItems.length} POSE`);
      if (context.timelineClipboard.grooveItems.length) parts.push(`${context.timelineClipboard.grooveItems.length} GROOVE`);
      hud.textContent = `已複製 ${parts.join(" + ")}`;
      hud.style.left = "50%"; hud.style.top = "16px"; hud.style.transform = "translateX(-50%)"; hud.style.display="block";
      clearTimeout(copyTimelineSelection._t); copyTimelineSelection._t=setTimeout(()=>{hud.style.display="none"; hud.style.transform="";},900);
    }
    return true;
  }

  function deleteTimelineSelection({confirmDelete=true, push=true}={}){
    const {poseIndices, grooveIndices} = currentTimelineClipboardSelection();
    const total = poseIndices.length + grooveIndices.length;
    if (!total) return false;
    if (confirmDelete && !context.confirm(`確定要刪除已選取的 ${total} 個 Timeline 項目嗎？此動作可用 Ctrl+Z 復原。`)) return false;
    poseIndices.slice().sort((a,b)=>b-a).forEach(i => context.keyframes.splice(i,1));
    grooveIndices.slice().sort((a,b)=>b-a).forEach(i => context.grooveSequence.splice(i,1));
    context.kfEditingIndex = -1; context.grooveSeqSelectedIndex = -1;
    context.kfMultiSelected.clear(); context.grooveMultiSelected.clear();
    if (context.kfPlaying && context.keyframes.length < 2) context.stopKeyframePlayback();
    updateKfMultiSelectBar(); context.syncEasingControlsFromSelection();
    context.renderKeyframeChips(); context.renderGrooveSeqChips(); context.scheduleAutoSave();
    if (push) context.pushHistory();
    return true;
  }

  function deleteKfMultiSelected(){ return deleteTimelineSelection({confirmDelete:true, push:true}); }

  function cutTimelineSelection(){
    if (context.kfPlaying) return false;
    if (!copyTimelineSelection()) return false;
    return deleteTimelineSelection({confirmDelete:false, push:true});
  }

  function pasteTimelineClipboard(){
    if (context.kfPlaying || timelineClipboardCount() === 0) return false;
    const poseCopies = (context.timelineClipboard.poseItems || []).map(deepCloneTimelineItem);
    const grooveCopies = (context.timelineClipboard.grooveItems || []).map(it => Object.assign(deepCloneTimelineItem(it), {id:context.makeLibId()}));
    let poseAt = context.keyframes.length;
    let grooveAt = context.grooveSequence.length;
    if (context.kfMultiSelectMode && context.kfMultiSelected.size) poseAt = Math.max(...context.kfMultiSelected) + 1;
    else if (context.kfEditingIndex >= 0) poseAt = context.kfEditingIndex + 1;
    if (context.kfMultiSelectMode && context.grooveMultiSelected.size) grooveAt = Math.max(...context.grooveMultiSelected) + 1;
    else if (context.grooveSeqSelectedIndex >= 0) grooveAt = context.grooveSeqSelectedIndex + 1;
    if (poseCopies.length) context.keyframes.splice(poseAt, 0, ...poseCopies);
    if (grooveCopies.length) context.grooveSequence.splice(grooveAt, 0, ...grooveCopies);

    if (context.kfMultiSelectMode){
      context.kfMultiSelected = new Set(poseCopies.map((_,j)=>poseAt+j));
      context.grooveMultiSelected = new Set(grooveCopies.map((_,j)=>grooveAt+j));
      context.kfEditingIndex = -1; context.grooveSeqSelectedIndex = -1;
    } else if (poseCopies.length){
      context.kfEditingIndex = poseAt + poseCopies.length - 1; context.grooveSeqSelectedIndex = -1;
    } else if (grooveCopies.length){
      context.grooveSeqSelectedIndex = grooveAt + grooveCopies.length - 1; context.kfEditingIndex = -1;
    }
    updateKfMultiSelectBar(); context.syncEasingControlsFromSelection();
    context.renderKeyframeChips(); context.renderGrooveSeqChips(); context.scheduleAutoSave(); context.pushHistory();
    return true;
  }

  return { timelineClipboardCount, updateKfMultiSelectBar, setKfMultiSelectMode, toggleKfMultiSelectItem, toggleGrooveMultiSelectItem, kfMultiSelectAll, kfMultiSelectNone, deepCloneTimelineItem, currentTimelineClipboardSelection, copyTimelineSelection, deleteTimelineSelection, deleteKfMultiSelected, cutTimelineSelection, pasteTimelineClipboard };
}
