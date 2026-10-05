import { t as tr, liveText, liveAttribute } from "../i18n/index.js";
import { buildEasingSVG } from "../ui/easing-gallery.js";

// Live host getters preserve shared rig and playback coordination.
export function createTimelineInspector(context){
  function updateKfTotalDurationLabel(){
    const el = document.getElementById("kfTotalDuration");
    if (!el) return;
    if(context.waveClips.length){const total=context.wavePlaybackEnd();liveText(el, ()=>tr("{p0} 個姿勢・{p1} 個 Waving・{p2} beats・約 {p3} 秒", {p0:context.keyframes.length, p1:context.waveClips.length, p2:total.toFixed(2), p3:(total*60/context.bpm).toFixed(1)}));return;}
    if (context.keyframes.length < 2){ liveText(el, ()=>context.keyframes.length === 1 ? tr("1 個姿勢・0 beat") : ""); return; }
    let totalMs = 0;
    let totalBeats = 0;
    for (let i = 0; i < context.keyframes.length - 1; i++){
      const beats = Number(context.keyframes[i].beats || 1);
      totalBeats += beats;
      totalMs += (60000 / context.bpm) * beats;
    }
    liveText(el, ()=>tr("{p0} 個姿勢・{p1} beats・約 {p2} 秒（{p3} BPM）", {p0:context.keyframes.length, p1:totalBeats, p2:(totalMs / 1000).toFixed(1), p3:context.bpm}));
    context.updateGrooveSeqTotalLabel(); // 編舞總拍數變了，下面「律動序列」的總拍數比對文字要跟著重算
  }

  function updateBeatGridPoseInspector(){
    const mode = document.getElementById("kfInspectorMode");
    const updateBtn = document.getElementById("kfUpdateBtn");
    const hasSelection = context.kfEditingIndex >= 0 && !!context.keyframes[context.kfEditingIndex] && !context.kfMultiSelectMode;
    if (mode){
      if (hasSelection){
        const isEnd = context.kfEditingIndex === context.keyframes.length - 1;
        liveText(mode, ()=>`F${context.kfEditingIndex + 1} ${isEnd ? tr("終點／下一段預設") : tr("轉場")}`);
        liveAttribute(mode, "data-tooltip", ()=>isEnd
          ? tr("最後一個 POSE 目前沒有下一段；Easing／拍數會保存在此拍點，之後若在後方新增 POSE 就會成為轉場設定。")
          : tr("正在編輯 F{p0} → F{p1} 的轉場設定", {p0:context.kfEditingIndex + 1, p1:context.kfEditingIndex + 2}));
      } else {
        liveText(mode, ()=>context.kfMultiSelectMode ? tr("POSE 多選") : tr("新增預設"));
        liveAttribute(mode, "data-tooltip", ()=>context.kfMultiSelectMode
          ? tr("多選模式中不顯示單一 POSE 的更新控制。")
          : tr("未選取 POSE；目前 Easing／拍數會作為下一個新增拍點的預設值。") );
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
    liveText(hint, ()=>`${sec}s · ${context.bpm} BPM`);
    liveAttribute(hint, "data-tooltip", ()=>tr("{p0} 拍 = {p1} ms（{p2} BPM）", {p0:context.kfPendingBeats, p1:ms, p2:context.bpm}));
  }
  return { updateKfTotalDurationLabel, updateBeatGridPoseInspector, syncEasingControlsFromSelection, updateEasingPreview, updateBeatMsHint };
}
