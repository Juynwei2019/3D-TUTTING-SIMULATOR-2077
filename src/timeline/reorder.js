// Live host getters preserve shared rig and playback coordination.
export function createTimelineReorder(context){
  function timelineReorderItems(kind){ return kind === "pose" ? context.keyframes : context.grooveSequence; }

  function timelineReorderChips(kind){ return kind === "pose" ? context.kfChipEls : context.grooveSeqChipEls; }

  function timelineReorderLabel(kind){ return kind === "pose" ? "POSE" : "GROOVE"; }

  function timelineSelectedSet(kind){ return kind === "pose" ? context.kfMultiSelected : context.grooveMultiSelected; }

  function ensureTimelineDropIndicator(host){
    let el = host.querySelector(":scope > .timelineDropIndicator");
    if (!el){ el=document.createElement("div"); el.className="timelineDropIndicator"; host.appendChild(el); }
    return el;
  }

  function clearTimelineReorderVisuals(){
    document.querySelectorAll(".timelineDropIndicator").forEach(el=>el.remove());
    document.querySelectorAll(".kfChip.dragOver, .grooveSeqChip.dragOver").forEach(el=>el.classList.remove("dragOver"));
    document.querySelectorAll(".kfChip.groupDragging, .grooveSeqChip.groupDragging").forEach(el=>el.classList.remove("groupDragging"));
    const hud=document.getElementById("timelineDragHud"); if (hud) hud.style.display="none";
  }

  function beginTimelineReorderDrag(kind, sourceIndex, chip, ev){
    if (context.kfPlaying){ ev.preventDefault(); return false; }
    const host=document.getElementById(kind === "pose" ? "kfList" : "grooveSeqList");
    if (!host) return false;
    let sourceIndices=[sourceIndex];
    if (context.kfMultiSelectMode){
      const set=timelineSelectedSet(kind);
      if (!set.has(sourceIndex)){ ev.preventDefault(); return false; }
      sourceIndices=Array.from(set).filter(i=>timelineReorderItems(kind)[i]).sort((a,b)=>a-b);
      if (!sourceIndices.length){ ev.preventDefault(); return false; }
    }
    context.timelineReorderDrag={kind, sourceIndex, sourceIndices, boundary:sourceIndex, finalIndex:sourceIndex, chip, host};
    sourceIndices.forEach(i=>{ const el=timelineReorderChips(kind)[i]; if(el) el.classList.add("groupDragging"); });
    chip.classList.add("dragging");
    ev.dataTransfer.effectAllowed="move";
    try{ ev.dataTransfer.setData("text/plain", `${kind}:${sourceIndices.join(",")}`); }catch(_){}
    return true;
  }

  function calcTimelineReorderTarget(kind, clientX, host){
    const items=timelineReorderItems(kind), chips=timelineReorderChips(kind), rect=host.getBoundingClientRect();
    const x=clientX-rect.left;
    let boundary=items.length;
    for(let i=0;i<items.length;i++){
      const chip=chips[i]; if(!chip) continue;
      const left=parseFloat(chip.style.left)||0, width=parseFloat(chip.style.width)||chip.offsetWidth||0;
      if(x < left + width/2){ boundary=i; break; }
    }
    const srcs=context.timelineReorderDrag?.sourceIndices || [context.timelineReorderDrag?.sourceIndex ?? -1];
    const removedBefore=srcs.filter(i=>i<boundary).length;
    const remainingCount=Math.max(0, items.length-srcs.length);
    let finalIndex=Math.max(0, Math.min(remainingCount, boundary-removedBefore));
    let indicatorX=0;
    if(boundary<items.length && chips[boundary]) indicatorX=parseFloat(chips[boundary].style.left)||0;
    else if(items.length && chips[items.length-1]){
      const last=chips[items.length-1]; indicatorX=(parseFloat(last.style.left)||0)+(parseFloat(last.style.width)||last.offsetWidth||0);
    }
    return {boundary, finalIndex, indicatorX};
  }

  function isGroupMoveNoop(sourceIndices, finalIndex){
    if(!sourceIndices.length) return true;
    const sorted=sourceIndices.slice().sort((a,b)=>a-b);
    if(!sorted.every((v,i)=>v===sorted[0]+i)) return false;
    return finalIndex===sorted[0];
  }

  function updateTimelineReorderDrag(kind, ev, host){
    if(!context.timelineReorderDrag || context.timelineReorderDrag.kind!==kind) return;
    ev.preventDefault(); ev.dataTransfer.dropEffect="move";
    const t=calcTimelineReorderTarget(kind,ev.clientX,host);
    context.timelineReorderDrag.boundary=t.boundary; context.timelineReorderDrag.finalIndex=t.finalIndex;
    ensureTimelineDropIndicator(host).style.left=`${t.indicatorX}px`;
    const chips=timelineReorderChips(kind); chips.forEach(el=>{if(el)el.classList.remove("dragOver")});
    const markIndex=t.boundary<chips.length?t.boundary:chips.length-1;
    if(markIndex>=0 && chips[markIndex] && !(context.timelineReorderDrag.sourceIndices||[]).includes(markIndex)) chips[markIndex].classList.add("dragOver");
    const hud=document.getElementById("timelineDragHud");
    if(hud){
      const items=timelineReorderItems(kind), count=context.timelineReorderDrag.sourceIndices.length;
      let where=t.boundary>=items.length?"插入尾端":`插入 ${kind==="pose"?`F${t.boundary+1}`:`第${t.boundary+1}段`} 前`;
      const moved=!isGroupMoveNoop(context.timelineReorderDrag.sourceIndices,t.finalIndex);
      hud.textContent=`${timelineReorderLabel(kind)}${count>1?` ×${count}`:""} · ${where} · ${moved?`→ 第${t.finalIndex+1}格`:"保持原位"}`;
      hud.style.left=`${Math.min(window.innerWidth-280,ev.clientX+12)}px`; hud.style.top=`${Math.max(6,ev.clientY-30)}px`; hud.style.display="block";
    }
  }

  function moveTimelineGroup(kind, sourceIndices, finalIndex){
    const items=timelineReorderItems(kind), sorted=sourceIndices.slice().sort((a,b)=>a-b);
    if(!sorted.length || isGroupMoveNoop(sorted,finalIndex)) return false;
    const selectedSet=new Set(sorted), moved=sorted.map(i=>items[i]), remaining=items.filter((_,i)=>!selectedSet.has(i));
    const at=Math.max(0,Math.min(remaining.length,finalIndex));
    const next=[...remaining.slice(0,at),...moved,...remaining.slice(at)];
    if(kind==="pose") context.keyframes=next; else context.grooveSequence=next;
    const newSet=new Set(moved.map((_,j)=>at+j));
    if(kind==="pose"){
      context.kfMultiSelected=newSet; context.kfEditingIndex=-1; context.renderKeyframeChips();
    }else{
      context.grooveMultiSelected=newSet; context.grooveSeqSelectedIndex=-1; context.renderGrooveSeqChips(); context.renderKeyframeChips();
    }
    context.updateKfMultiSelectBar(); context.scheduleAutoSave(); return true;
  }

  function dropTimelineReorder(kind,ev,host){
    if(!context.timelineReorderDrag || context.timelineReorderDrag.kind!==kind) return;
    ev.preventDefault();
    const t=calcTimelineReorderTarget(kind,ev.clientX,host), srcs=context.timelineReorderDrag.sourceIndices.slice();
    const draggedChip=context.timelineReorderDrag.chip; if(draggedChip)draggedChip.classList.remove("dragging");
    clearTimelineReorderVisuals(); context.timelineReorderDrag=null;
    let changed=false;
    if(srcs.length>1 || context.kfMultiSelectMode) changed=moveTimelineGroup(kind,srcs,t.finalIndex);
    else{
      const from=srcs[0], to=t.finalIndex;
      if(from!==to){ if(kind==="pose") context.reorderKeyframe(from,to); else context.reorderGrooveSeqEntry(from,to); changed=true; }
    }
    if(changed) context.pushHistory();
  }

  function endTimelineReorderDrag(kind){
    if(!context.timelineReorderDrag || context.timelineReorderDrag.kind!==kind) return;
    const chip=context.timelineReorderDrag.chip; if(chip)chip.classList.remove("dragging");
    clearTimelineReorderVisuals(); context.timelineReorderDrag=null;
  }

  function stepTimelineSelection(kind, direction){
    if (context.kfPlaying || !['pose','groove'].includes(kind) || ![-1,1].includes(direction)) return false;
    const items = timelineReorderItems(kind);
    if (context.kfMultiSelectMode){
      const indices = [...timelineSelectedSet(kind)].filter(i => items[i]).sort((a,b) => a-b);
      if (!indices.length || (direction < 0 && indices[0] === 0) || (direction > 0 && indices.at(-1) === items.length-1)) return false;
      if (!moveTimelineGroup(kind, indices, indices[0]+direction)) return false;
    } else {
      const from = kind === 'pose' ? context.kfEditingIndex : context.grooveSeqSelectedIndex;
      const to = from+direction;
      if (!Number.isInteger(from) || from < 0 || from >= items.length || to < 0 || to >= items.length) return false;
      if (kind === 'pose') context.reorderKeyframe(from,to); else context.reorderGrooveSeqEntry(from,to);
    }
    context.pushHistory();
    return true;
  }

  function bindTimelineReorderHost(kind,host){
    if(!host)return; host.ondragover=(ev)=>updateTimelineReorderDrag(kind,ev,host); host.ondrop=(ev)=>dropTimelineReorder(kind,ev,host);
  }
  return { stepTimelineSelection, timelineReorderItems, timelineReorderChips, timelineReorderLabel, timelineSelectedSet, ensureTimelineDropIndicator, clearTimelineReorderVisuals, beginTimelineReorderDrag, calcTimelineReorderTarget, isGroupMoveNoop, updateTimelineReorderDrag, moveTimelineGroup, dropTimelineReorder, endTimelineReorderDrag, bindTimelineReorderHost };
}
