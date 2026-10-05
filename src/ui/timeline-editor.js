import { t as tr, liveText, liveAttribute, liveHTML } from "../i18n/index.js";
import { buildEasingSVG } from "./easing-gallery.js";

// Rendering and edit gestures delegate all data changes to host callbacks.
export function createTimelineEditor(context, doc = document){
  function renderKeyframeChips(){
    context.renderWaveTrack();
    context.updateMoveLibRangeHint();
    context.updateKfTotalDurationLabel(); // 不管清單是否為空都要更新（空清單/只有1拍時顯示空字串）
    context.updateBeatGridPoseInspector();
    const host = doc.getElementById("kfList");
    context.bindTimelineReorderHost("pose", host);
    context.updateBeatGridGeometry();
    host.innerHTML = "";
    context.kfChipEls = [];
    if (context.keyframes.length === 0){
      // 動態建立空清單提示文字，不依賴靜態 #kfEmpty 節點——
      // 該節點一旦在非空清單時被 host.innerHTML="" 清掉就永久脫離DOM，
      // 之後 getElementById 回傳 null，host.appendChild(null) 會拋例外中斷整個函式（已修正的舊bug）。
      const empty = doc.createElement("span");
      empty.id = "kfEmpty";
      liveText(empty, ()=>tr("尚未新增任何拍點——先用關節控制環擺出第一個姿勢，再按「+ 新增拍點」"));
      host.appendChild(empty);
      context.updateBeatGridGeometry();
      context.renderGrooveLoopGhosts();
      context.updateOnionSkins();
      context.drawKfWaveform();
      return;
    }
    context.keyframes.forEach((kf, i) => {
      const chip = doc.createElement("div");
      chip.className = "kfChip";
      const startBeat = context.keyframeStartBeat(i);
      const durationBeats = i < context.keyframes.length - 1 ? Number(kf.beats || 1) : 0;
      const widthPx = i < context.keyframes.length - 1 ? Math.max(2, durationBeats * context.BEAT_GRID_PX_PER_BEAT - 2) : 48;
      chip.style.left = `${startBeat * context.BEAT_GRID_PX_PER_BEAT}px`;
      chip.style.width = `${widthPx}px`;
      if (i === context.keyframes.length - 1) chip.classList.add("beatGridEndMarker");
      if (widthPx < 92) chip.classList.add("beatGridCompact");
      if (!context.kfMultiSelectMode && i === context.kfEditingIndex) chip.classList.add("active");
      if (context.kfMultiSelectMode && context.kfMultiSelected.has(i)) chip.classList.add("multiChecked");
      if (context.kfPlaying && i === context.kfIndex) chip.classList.add("playing");

      // ---- BG-3.2 拖曳排序：真正 drop 前只顯示插入線/HUD，不邊拖邊重建資料。 ----
      chip.draggable = !context.kfPlaying && (!context.kfMultiSelectMode || context.kfMultiSelected.has(i));
      chip.addEventListener("dragstart", (ev) => {
        context.kfDragSrcIndex = i; // 保留舊狀態變數供相容/除錯
        if (!context.beginTimelineReorderDrag("pose", i, chip, ev)) context.kfDragSrcIndex = -1;
      });
      chip.addEventListener("dragend", () => {
        context.endTimelineReorderDrag("pose");
        context.kfDragSrcIndex = -1;
      });

      // 多選模式：chip 最前面加一個勾選方塊，視覺上提示目前處於「勾選拍點準備批次刪除」的狀態
      if (context.kfMultiSelectMode){
        const check = doc.createElement("span");
        check.className = "kfCheckMark";
        liveText(check, ()=>"✓");
        liveAttribute(check, "data-tooltip", ()=>context.kfMultiSelected.has(i) ? tr("已選取；可拖曳任一已選 POSE 整組移動") : tr("點 F 按鈕加入多選"));
        chip.appendChild(check);
      }

      const sel = doc.createElement("button");
      sel.className = "sel";
      liveText(sel, ()=>(kf.waveBake?"🌊 ":"")+`F${i+1}`);
      liveAttribute(sel, "data-tooltip", ()=>context.kfMultiSelectMode ? tr("點擊勾選／取消勾選") : tr("點擊套用這個拍點的姿勢"));
      sel.onclick = () => { if (context.kfMultiSelectMode) context.toggleKfMultiSelectItem(i); else context.selectKeyframe(i); };

      const labelBtn = doc.createElement("button");
      labelBtn.className = "kfLabelBtn" + (kf.label ? " hasLabel" : "");
      liveText(labelBtn, ()=>kf.label ? kf.label : "✎");
      liveAttribute(labelBtn, "data-tooltip", ()=>kf.label ? tr("備註：{p0}（點擊編輯／清空）", {p0:kf.label}) : tr("點擊新增備註（例如「插腰」「收拍」）"));
      labelBtn.onclick = (ev) => { ev.stopPropagation(); context.renameKeyframeLabel(i); };

      const dup = doc.createElement("button");
      dup.className = "dup";
      liveText(dup, ()=>"⧉");
      liveAttribute(dup, "data-tooltip", ()=>tr("複製此拍點（插入在後面）"));
      dup.onclick = (ev) => { ev.stopPropagation(); context.duplicateKeyframe(i); context.pushHistory(); };


      chip.appendChild(sel);
      chip.appendChild(labelBtn);

      // 若這個拍點是「生成拍點（軌跡）」批次寫入的，加一個小標籤提示（滑鼠移上去看是哪些肢體）
      if (kf.traj && Object.keys(kf.traj).length > 0){
        const trajTag = doc.createElement("span");
        trajTag.className = "kfTrajTag";
        liveText(trajTag, ()=>"〜");
        liveAttribute(trajTag, "title", ()=>tr("含軌跡資料：") + Object.keys(kf.traj).map(l => context.IK_CHAINS[l] ? tr(context.IK_CHAINS[l].label) : l).join("、"));
        chip.appendChild(trajTag);
      }

      // 顯示這個拍點「跳到下一拍」時使用的 Easing 縮圖 + 拍數（最後一個拍點沒有下一段轉場）
      if (i < context.keyframes.length - 1){
        const easeTag = doc.createElement("div");
        easeTag.className = "kfEaseTag";
        const beats = kf.beats || 1;
        const easeName = kf.easing || "easeInOutQuad";
        liveAttribute(easeTag, "title", ()=>tr("{p0} · {p1} 拍", {p0:easeName, p1:beats}));
        liveHTML(easeTag, ()=>buildEasingSVG(easeName, 26, 15) + tr("<span>{p0}拍</span>", {p0:beats}));
        chip.appendChild(easeTag);
      }

      // 最後一個 POSE 是 End Marker，沒有 outgoing transition；其他 POSE 可直接拖右緣調整到下一拍的長度。
      if (i < context.keyframes.length - 1 && !context.kfMultiSelectMode){
        const resizeHandle = doc.createElement("div");
        resizeHandle.className = "timelineResizeHandle poseResizeHandle";
        liveAttribute(resizeHandle, "data-tooltip", ()=>tr("拖曳調整 F{p0} → F{p1} 轉場長度（1/4拍吸附）", {p0:i+1, p1:i+2}));
        resizeHandle.addEventListener("pointerdown", (ev) => context.beginPoseResize(ev, i, chip, resizeHandle));
        resizeHandle.addEventListener("click", (ev) => ev.stopPropagation());
        chip.appendChild(resizeHandle);
      }

      // 單顆刪除統一使用 Delete / Backspace；多選模式仍沿用批次刪除工具列。
      if (!context.kfMultiSelectMode){
        chip.appendChild(dup);
      }
      host.appendChild(chip);
      context.kfChipEls[i] = chip;
    });
    context.updateBeatGridGeometry();
    context.renderGrooveLoopGhosts();
    context.updateOnionSkins();
    context.drawKfWaveform(); // 拍點增刪/拍數/easing變動都會影響橘色參考線在音樂上的位置，這裡統一重畫
    if (!context.kfMultiSelectMode && context.kfEditingIndex >= 0) context.scrollKfChipIntoView(context.kfEditingIndex); // 新增/選取/改易入拍點時，確保它在單列時間軸的可視範圍內
  }

  function updatePlayingKeyframeHighlight(){
    for (let i = 0; i < context.kfChipEls.length; i++){
      const chip = context.kfChipEls[i];
      if (chip) chip.classList.toggle("playing", context.kfPlaying && i === context.kfIndex);
    }
  }

  return { render: renderKeyframeChips, updateHighlight: updatePlayingKeyframeHighlight };
}
