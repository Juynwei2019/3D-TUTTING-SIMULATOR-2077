import { t as tr } from "../i18n/index.js";
import { insertKeyframe, duplicateKeyframeData, reorderKeyframeData } from "../timeline/data.js";

// Live host getters preserve shared rig and playback coordination.
export function createPoseEditor(context){
  function addKeyframe(){
    const newKf = { angles: context.snapshotCurrentAngles(), body: context.snapshotBodyTransform(), easing: context.kfPendingEasing, beats: context.kfPendingBeats };
    const grabBox=context.captureGrabFrame?.();
    if(grabBox)newKf.grabBox=grabBox;
    context.kfEditingIndex = insertKeyframe(context.keyframes, newKf, context.kfEditingIndex);
    context.renderKeyframeChips();
    context.scheduleAutoSave();
    context.onPoseRecorded?.();
  }

  function duplicateKeyframe(i){
    const index = duplicateKeyframeData(context.keyframes, i);
    if (index === null) return;
    context.kfEditingIndex = index;
    context.renderKeyframeChips();
    context.scheduleAutoSave();
  }

  function reorderKeyframe(from, to){
    const index = reorderKeyframeData(context.keyframes, from, to, context.kfEditingIndex);
    if (index === null) return;
    context.kfEditingIndex = index;
    context.renderKeyframeChips();
    context.scheduleAutoSave();
  }

  function renameKeyframeLabel(i){
    if (!context.keyframes[i]) return;
    const current = context.keyframes[i].label || "";
    const next = prompt(tr("拍點備註（例如「插腰」「收拍」），留空即可清除："), current);
    if (next === null) return; // 使用者按取消，不變動
    const trimmed = next.trim().slice(0, 24);
    if (trimmed) context.keyframes[i].label = trimmed; else delete context.keyframes[i].label;
    context.renderKeyframeChips();
    context.scheduleAutoSave();
  }

  function updateKeyframe(){
    if (context.kfEditingIndex < 0 || !context.keyframes[context.kfEditingIndex]) return;
    context.keyframes[context.kfEditingIndex].angles = context.snapshotCurrentAngles();
    context.keyframes[context.kfEditingIndex].body = context.snapshotBodyTransform();
    const grabBox=context.captureGrabFrame?.();
    if(grabBox)context.keyframes[context.kfEditingIndex].grabBox=grabBox;
    else delete context.keyframes[context.kfEditingIndex].grabBox;
    context.renderKeyframeChips();
    context.scheduleAutoSave();
    context.onPoseRecorded?.();
  }

  function setKeyframeEasing(name){
    context.kfPendingEasing = name;
    if (context.kfEditingIndex >= 0 && context.keyframes[context.kfEditingIndex]) context.keyframes[context.kfEditingIndex].easing = name;
    context.updateEasingPreview();
    context.renderKeyframeChips();
    context.scheduleAutoSave();
  }

  function setKeyframeBeats(val){
    const snapped = context.snapTimelineBeats(val);
    context.kfPendingBeats = snapped;
    if (context.kfEditingIndex >= 0 && context.keyframes[context.kfEditingIndex]) context.keyframes[context.kfEditingIndex].beats = snapped;
    context.updateBeatMsHint();
    context.renderKeyframeChips();
    context.scheduleAutoSave();
  }

  function deleteKeyframe(i){
    context.keyframes.splice(i, 1);
    // 選取的拍點被刪了：改選同一個位置的下一個（沒有的話往前一個）；
    // 選取的拍點還在但排在被刪除的後面：索引要跟著往前移一格，否則選取會跳到別的拍點身上。
    if (context.kfEditingIndex === i) context.kfEditingIndex = Math.min(i, context.keyframes.length - 1);
    else if (context.kfEditingIndex > i) context.kfEditingIndex -= 1;
    if (context.kfPlaying && context.keyframes.length < 2) context.stopKeyframePlayback();
    context.syncEasingControlsFromSelection();
    context.renderKeyframeChips();
    context.scheduleAutoSave();
  }

  function clearKeyframes(){
    context.keyframes = [];
    context.kfEditingIndex = -1;
    context.stopKeyframePlayback();
    context.renderKeyframeChips();
    context.scheduleAutoSave();
  }

  function selectKeyframeStateOnly(i){
    context.waveClipSelected=null;context.renderWaveTrack();
    if (i < 0 || i >= context.keyframes.length) return;
    context.kfEditingIndex = i;
    context.grooveSeqSelectedIndex = -1;
    if (!context.kfMultiSelectMode) context.grooveMultiSelected.clear();
    for (const el of context.grooveSeqChipEls) if (el) el.classList.remove("selected");
    for (let n = 0; n < context.kfChipEls.length; n++){
      const el = context.kfChipEls[n];
      if (el) el.classList.toggle("active", !context.kfMultiSelectMode && n === i);
    }
    context.applyPose(context.keyframes[i].angles);
    context.applyBodyTransform?.(context.keyframes[i].body);
    context.applyGrabKeyframe?.(context.keyframes[i]);
    context.setActiveBtn(-1);
    context.syncEasingControlsFromSelection();
    context.updateOnionSkins();
    context.onPoseSelected?.();
  }

  function selectKeyframe(i){
    context.waveTrackActive=false;context.waveClipSelected=null;context.renderWaveTrack();
    if(context.waveRun)context.stopWave();
    selectKeyframeStateOnly(i);
    context.renderKeyframeChips();
  }
  return { addKeyframe, duplicateKeyframe, reorderKeyframe, renameKeyframeLabel, updateKeyframe, setKeyframeEasing, setKeyframeBeats, deleteKeyframe, clearKeyframes, selectKeyframeStateOnly, selectKeyframe };
}
