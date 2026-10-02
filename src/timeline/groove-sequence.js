// Live host getters preserve shared rig and playback coordination.
export function createGrooveSequence(context){
  function selectGrooveSeqEntry(i){
    context.waveClipSelected=null;context.renderWaveTrack();
    if (i < 0 || i >= context.grooveSequence.length) return;
    if (context.kfMultiSelectMode){ context.toggleGrooveMultiSelectItem(i); return; }
    context.grooveSeqSelectedIndex = i;
    // POSE / GROOVE 採單一 timeline selection，避免按 Delete 時不知道要刪哪一軌。
    context.kfEditingIndex = -1;
    context.syncEasingControlsFromSelection();
    for (const el of context.kfChipEls) if (el) el.classList.remove("active");
    for (let n = 0; n < context.grooveSeqChipEls.length; n++){
      const el = context.grooveSeqChipEls[n];
      if (el) el.classList.toggle("selected", n === i);
    }
    context.updateOnionSkins();
  }

  function grooveSeqTotalBeats(){
    return context.grooveSequence.reduce((s, e) => s + ((Number(e.beats) > 0) ? Number(e.beats) : 0), 0);
  }

  function getGrooveActiveSegment(beatsElapsedTotal){
    if (context.grooveSequence.length === 0) return null;
    const total = grooveSeqTotalBeats();
    if (total <= 0) return null;
    let pos = beatsElapsedTotal % total;
    if (pos < 0) pos += total; // 保險：理論上 beatsElapsedTotal 不會是負的，但取模防呆一下
    let acc = 0;
    for (let i = 0; i < context.grooveSequence.length; i++){
      const entry = context.grooveSequence[i];
      const b = (Number(entry.beats) > 0) ? Number(entry.beats) : 0;
      if (b <= 0) continue;
      if (pos < acc + b || i === context.grooveSequence.length - 1){
        const item = context.grooveLibCtrl ? context.grooveLibCtrl.getItems().find(it => it.id === entry.libId) : null;
        return { entry, item, localBeats: pos - acc, segIndex: i };
      }
      acc += b;
    }
    return null;
  }

  function addGrooveSeqEntry(libId){
    if (!libId) return;
    context.grooveSequence.push({ id: context.makeLibId(), libId, beats: 4 });
    renderGrooveSeqChips();
    context.scheduleAutoSave();
  }

  function removeGrooveSeqEntry(i){
    if (i < 0 || i >= context.grooveSequence.length) return;
    context.grooveSequence.splice(i, 1);
    if (context.grooveSeqSelectedIndex === i) context.grooveSeqSelectedIndex = -1;
    else if (context.grooveSeqSelectedIndex > i) context.grooveSeqSelectedIndex -= 1;
    renderGrooveSeqChips();
    context.scheduleAutoSave();
  }

  function duplicateGrooveSeqEntry(i){
    if (i < 0 || !context.grooveSequence[i]) return;
    const copy = Object.assign({}, context.grooveSequence[i], { id: context.makeLibId() });
    context.grooveSequence.splice(i + 1, 0, copy);
    renderGrooveSeqChips();
    context.scheduleAutoSave();
  }

  function reorderGrooveSeqEntry(from, to){
    if (from < 0 || from >= context.grooveSequence.length || to < 0 || to >= context.grooveSequence.length || from === to) return;
    const [item] = context.grooveSequence.splice(from, 1);
    context.grooveSequence.splice(to, 0, item);
    if (context.grooveSeqSelectedIndex === from) context.grooveSeqSelectedIndex = to;
    else if (from < context.grooveSeqSelectedIndex && context.grooveSeqSelectedIndex <= to) context.grooveSeqSelectedIndex -= 1;
    else if (to <= context.grooveSeqSelectedIndex && context.grooveSeqSelectedIndex < from) context.grooveSeqSelectedIndex += 1;
    renderGrooveSeqChips();
    context.scheduleAutoSave();
  }

  function setGrooveSeqBeats(i, beats){
    if (!context.grooveSequence[i]) return;
    context.grooveSequence[i].beats = context.snapGrooveBeats(beats);
    renderGrooveSeqChips();
    context.renderKeyframeChips();
    context.scheduleAutoSave();
  }

  function setGrooveSeqLibId(i, libId){
    if (!context.grooveSequence[i]) return;
    context.grooveSequence[i].libId = libId;
    renderGrooveSeqChips();
    context.scheduleAutoSave();
  }

  function updateGrooveSeqTotalLabel(){
    const el = document.getElementById("grooveSeqTotalBeats");
    if (!el) return;
    if (context.grooveSequence.length === 0){ el.textContent = ""; return; }
    const total = grooveSeqTotalBeats();
    const kfTotal = context.kfTotalBeats();
    let msg = `序列總拍數：${total}拍`;
    if (kfTotal > 0){
      if (Math.abs(total - kfTotal) < 1e-9){
        msg += `・跟編舞總拍數（${kfTotal}拍）一致，剛好整段循環一次`;
      } else if (total < kfTotal){
        const loops = kfTotal / total;
        msg += `・編舞共${kfTotal}拍（會循環約${loops.toFixed(1)}輪`;
        msg += Math.abs(loops - Math.round(loops)) < 1e-9 ? "，剛好整數次）" : "，最後一輪會在中途被切斷）";
      } else {
        msg += `・編舞共${kfTotal}拍（序列比編舞長，後面 ${total - kfTotal} 拍的段落播不到）`;
      }
    }
    el.textContent = msg;
  }

  function renderGrooveSeqChips(){
    const host = document.getElementById("grooveSeqList");
    const empty = document.getElementById("grooveSeqEmpty");
    if (!host) return;
    context.bindTimelineReorderHost("groove", host);
    context.updateBeatGridGeometry();
    host.innerHTML = "";
    context.grooveSeqChipEls = [];
    if (context.grooveSequence.length === 0){
      if (empty) host.appendChild(empty);
      context.updateBeatGridGeometry();
      updateGrooveSeqTotalLabel();
      return;
    }
    const libItems = context.grooveLibCtrl ? context.grooveLibCtrl.getItems() : [];
    context.grooveSequence.forEach((entry, i) => {
      const chip = document.createElement("div");
      chip.className = "grooveSeqChip";
      const startBeat = context.grooveSegmentStartBeat(i);
      const durationBeats = Math.max(0.01, Number(entry.beats) || 0.01);
      const widthPx = Math.max(2, durationBeats * context.BEAT_GRID_PX_PER_BEAT - 2);
      chip.style.left = `${startBeat * context.BEAT_GRID_PX_PER_BEAT}px`;
      chip.style.width = `${widthPx}px`;
      if (widthPx < 126) chip.classList.add("beatGridCompact");
      chip.draggable = !context.kfPlaying && (!context.kfMultiSelectMode || context.grooveMultiSelected.has(i));
      const libItem = libItems.find(it => it.id === entry.libId);
      chip.classList.toggle("missingLib", !libItem);
      chip.classList.toggle("selected", !context.kfMultiSelectMode && i === context.grooveSeqSelectedIndex);
      chip.classList.toggle("multiChecked", context.kfMultiSelectMode && context.grooveMultiSelected.has(i));
      chip.addEventListener("click", () => { if (context.kfMultiSelectMode) context.toggleGrooveMultiSelectItem(i); else selectGrooveSeqEntry(i); });
      if (context.kfMultiSelectMode){
        const check=document.createElement("span"); check.className="kfCheckMark"; check.textContent="✓";
        check.setAttribute("data-tooltip", context.grooveMultiSelected.has(i) ? "已選取；可拖曳任一已選 GROOVE 整組移動" : "點此段加入多選");
        chip.appendChild(check);
      }

      const sel = document.createElement("select");
      if (!libItem){
        // 引用到已被刪除的律動庫項目：顯示警示選項，讓使用者知道要重新指定，而不是靜默失效。
        const optMissing = document.createElement("option");
        optMissing.value = entry.libId;
        optMissing.textContent = "⚠ 已刪除的律動";
        sel.appendChild(optMissing);
      }
      libItems.forEach(it => {
        const opt = document.createElement("option");
        opt.value = it.id;
        opt.textContent = it.name;
        if (it.id === entry.libId) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.title = "這段套用哪個律動庫項目";
      // clip 本身可拖曳；操作下拉選單時不要讓父層把 pointer 起手誤判成拖曳。
      sel.onpointerdown = (ev) => { ev.stopPropagation(); if (!context.kfMultiSelectMode) selectGrooveSeqEntry(i); };
      sel.onmousedown = (ev) => ev.stopPropagation();
      sel.onclick = (ev) => ev.stopPropagation();
      sel.onchange = (e) => { setGrooveSeqLibId(i, e.target.value); context.pushHistory(); };
      chip.appendChild(sel);

      const beatsInput = document.createElement("input");
      beatsInput.type = "number";
      beatsInput.className = "beatsInput";
      beatsInput.min = context.BEAT_GRID_SNAP > 0 ? String(context.BEAT_GRID_SNAP) : "0.01"; beatsInput.max = "64"; beatsInput.step = context.BEAT_GRID_SNAP > 0 ? String(context.BEAT_GRID_SNAP) : "0.01";
      beatsInput.value = context.formatBeatValue(entry.beats);
      beatsInput.title = "這段維持幾拍（支援 1/4 拍）；也可拖曳 clip 右側邊緣調整";
      beatsInput.draggable = false;
      // 1 拍 compact clip 空間很窄，直接操作數字框時禁止事件冒泡到可拖曳的父層。
      beatsInput.onpointerdown = (ev) => { ev.stopPropagation(); if (!context.kfMultiSelectMode) selectGrooveSeqEntry(i); };
      beatsInput.onmousedown = (ev) => ev.stopPropagation();
      beatsInput.onclick = (ev) => ev.stopPropagation();
      beatsInput.onchange = (e) => { setGrooveSeqBeats(i, e.target.value); context.pushHistory(); };
      chip.appendChild(beatsInput);

      const beatsUnit = document.createElement("span");
      beatsUnit.className = "beatUnit";
      beatsUnit.textContent = "拍";
      beatsUnit.style.cssText = "font-size:10px; color:#6a6a9a; padding:0 3px;";
      chip.appendChild(beatsUnit);

      const dup = document.createElement("button");
      dup.className = "dup"; dup.textContent = "⧉"; dup.title = "複製這段";
      dup.onclick = (ev) => { ev.stopPropagation(); duplicateGrooveSeqEntry(i); context.pushHistory(); };
      if (!context.kfMultiSelectMode) chip.appendChild(dup);

      const resizeHandle = document.createElement("div");
      resizeHandle.className = "timelineResizeHandle grooveResizeHandle";
      resizeHandle.setAttribute("data-tooltip", "拖曳左右調整這段律動長度（1/4拍吸附）");
      resizeHandle.addEventListener("pointerdown", (ev) => context.beginGrooveResize(ev, i, chip, resizeHandle));
      resizeHandle.addEventListener("click", (ev) => ev.stopPropagation());
      if (!context.kfMultiSelectMode) chip.appendChild(resizeHandle);

      chip.addEventListener("dragstart", (ev) => {
        context.grooveSeqDragIndex = i; // 保留舊狀態變數供相容/除錯
        if (!context.beginTimelineReorderDrag("groove", i, chip, ev)) context.grooveSeqDragIndex = -1;
      });
      chip.addEventListener("dragend", () => {
        context.endTimelineReorderDrag("groove");
        context.grooveSeqDragIndex = -1;
      });

      host.appendChild(chip);
      context.grooveSeqChipEls[i] = chip;
    });
    context.updateBeatGridGeometry();
    context.renderGrooveLoopGhosts();
    updateGrooveSeqTotalLabel();
  }

  function bindGrooveLibraryUI(){
    context.grooveLibCtrl = context.createLibraryController({
      storageKey: context.GROOVE_LIB_KEY, captureFn: context.captureCurrentGrooveConfig, applyFn: context.applyGrooveConfigData,
      listElId: "grooveLibList", emptyElId: "grooveLibEmpty", filePrefix: "律動", itemLabel: "律動",
      subtitleFn: context.grooveLibSubtitle,
      extraDeleteWarning: (item) => {
        const refCount = context.grooveSequence.filter(e => e.libId === item.id).length;
        if (refCount === 0) return null;
        return `⚠️「時間軸」分頁的律動序列裡有 ${refCount} 個段落正在使用這個律動，刪除後那幾段播放時會沿用前一個有效段落的設定（若前面沒有其他有效段落，則那幾拍不套用律動）。`;
      },
      onRender: (count) => {
        const badge = document.getElementById("grooveLibCount");
        if (badge) badge.textContent = count;
        renderGrooveSeqChips(); // 庫項目增/刪/改名，序列清單的下拉選單內容要跟著重繪
      }
    });
    const nameInput = document.getElementById("grooveLibNameInput");
    document.getElementById("grooveLibSaveBtn").onclick = () => {
      context.grooveLibCtrl.saveCurrent(nameInput.value);
      nameInput.value = "";
    };
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("grooveLibSaveBtn").click(); });
    document.getElementById("grooveLibExportAllBtn").onclick = () => context.grooveLibCtrl.exportAll();
    document.getElementById("grooveLibImportAllBtn").onclick = () => document.getElementById("grooveLibImportAllFile").click();
    document.getElementById("grooveLibImportAllFile").onchange = (e) => { context.grooveLibCtrl.importAll(e.target.files[0]); e.target.value = ""; };
    document.getElementById("grooveLibImportOneBtn").onclick = () => document.getElementById("grooveLibImportOneFile").click();
    document.getElementById("grooveLibImportOneFile").onchange = (e) => { context.grooveLibCtrl.importOne(e.target.files[0]); e.target.value = ""; };
    context.grooveLibCtrl.render();
  }

  function bindGrooveSequenceUI(){
    const addBtn = document.getElementById("grooveSeqAddBtn");
    if (addBtn){
      addBtn.onclick = () => {
        const items = context.grooveLibCtrl ? context.grooveLibCtrl.getItems() : [];
        if (items.length === 0){ alert("律動庫目前是空的，請先在上面「律動庫」存至少一項律動設定。"); return; }
        addGrooveSeqEntry(items[0].id);
        context.pushHistory();
      };
    }
    renderGrooveSeqChips();
  }
  return { selectGrooveSeqEntry, grooveSeqTotalBeats, getGrooveActiveSegment, addGrooveSeqEntry, removeGrooveSeqEntry, duplicateGrooveSeqEntry, reorderGrooveSeqEntry, setGrooveSeqBeats, setGrooveSeqLibId, updateGrooveSeqTotalLabel, renderGrooveSeqChips, bindGrooveLibraryUI, bindGrooveSequenceUI };
}
