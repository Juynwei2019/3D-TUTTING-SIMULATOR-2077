import { buildEasingSVG } from "../ui/easing-gallery.js";

// Live host getters preserve shared rig and playback coordination.
export function createTimelineInspector(context){
  function updateKfTotalDurationLabel(){
    const el = document.getElementById("kfTotalDuration");
    if (!el) return;
    if(context.waveClips.length){const total=context.wavePlaybackEnd();el.textContent=`${context.keyframes.length} 個姿勢・${context.waveClips.length} 個 Waving・${total.toFixed(2)} beats・約 ${(total*60/context.bpm).toFixed(1)} 秒`;return;}
    if (context.keyframes.length < 2){ el.textContent = context.keyframes.length === 1 ? "1 個姿勢・0 beat" : ""; return; }
    let totalMs = 0;
    let totalBeats = 0;
    for (let i = 0; i < context.keyframes.length - 1; i++){
      const beats = Number(context.keyframes[i].beats || 1);
      totalBeats += beats;
      totalMs += (60000 / context.bpm) * beats;
    }
    el.textContent = `${context.keyframes.length} 個姿勢・${totalBeats} beats・約 ${(totalMs / 1000).toFixed(1)} 秒（${context.bpm} BPM）`;
    context.updateGrooveSeqTotalLabel(); // 編舞總拍數變了，下面「律動序列」的總拍數比對文字要跟著重算
  }

  function updateBeatGridPoseInspector(){
    const mode = document.getElementById("kfInspectorMode");
    const updateBtn = document.getElementById("kfUpdateBtn");
    const hasSelection = context.kfEditingIndex >= 0 && !!context.keyframes[context.kfEditingIndex] && !context.kfMultiSelectMode;
    if (mode){
      if (hasSelection){
        const isEnd = context.kfEditingIndex === context.keyframes.length - 1;
        mode.textContent = `F${context.kfEditingIndex + 1} ${isEnd ? "終點／下一段預設" : "轉場"}`;
        mode.setAttribute("data-tooltip", isEnd
          ? "最後一個 POSE 目前沒有下一段；Easing／拍數會保存在此拍點，之後若在後方新增 POSE 就會成為轉場設定。"
          : `正在編輯 F${context.kfEditingIndex + 1} → F${context.kfEditingIndex + 2} 的轉場設定`);
      } else {
        mode.textContent = context.kfMultiSelectMode ? "POSE 多選" : "新增預設";
        mode.setAttribute("data-tooltip", context.kfMultiSelectMode
          ? "多選模式中不顯示單一 POSE 的更新控制。"
          : "未選取 POSE；目前 Easing／拍數會作為下一個新增拍點的預設值。" );
      }
    }
    if (updateBtn) updateBtn.style.display = hasSelection ? "inline-flex" : "none";
  }

  function syncEasingControlsFromSelection(){
    const kf = context.kfEditingIndex >= 0 ? context.keyframes[context.kfEditingIndex] : null;
    context.kfPendingEasing = kf ? (kf.easing || "easeInOutQuad") : context.kfPendingEasing;
    context.kfPendingBeats = kf ? (kf.beats || 1) : context.kfPendingBeats;
    const easeSel = document.getElementById("kfEasingSelect");
    const beatsSel = document.getElementById("kfBeatsSelect");
    if (easeSel) easeSel.value = context.kfPendingEasing;
    if (beatsSel) context.syncBeatSelectValue(beatsSel, context.kfPendingBeats);
    updateEasingPreview();
    updateBeatMsHint();
    updateBeatGridPoseInspector();
  }

  function updateEasingPreview(){
    const host = document.getElementById("kfEasingPreview");
    if (host) host.innerHTML = buildEasingSVG(context.kfPendingEasing, 64, 34);
  }

  function updateBeatMsHint(){
    const hint = document.getElementById("kfBeatMsHint");
    if (!hint) return;
    const ms = Math.round((60000/context.bpm) * context.kfPendingBeats);
    const sec = (ms / 1000).toFixed(ms >= 1000 ? 2 : 3).replace(/0+$/, "").replace(/\.$/, "");
    hint.textContent = `${sec}s · ${context.bpm} BPM`;
    hint.setAttribute("data-tooltip", `${context.kfPendingBeats} 拍 = ${ms} ms（${context.bpm} BPM）`);
  }
  return { updateKfTotalDurationLabel, updateBeatGridPoseInspector, syncEasingControlsFromSelection, updateEasingPreview, updateBeatMsHint };
}
