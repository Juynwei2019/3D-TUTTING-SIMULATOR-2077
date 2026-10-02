// Live host getters preserve shared rig and playback coordination.
export function createChoreographyGenerator(context){
  function appendMoveFrames(frames){
    const cloned = JSON.parse(JSON.stringify(frames));
    context.keyframes.push(...cloned);
  }

  function generateChoreographyFromMoves(replace){
    const items = context.moveLibCtrl.getItems();
    if (items.length === 0){ alert("招式庫目前是空的，請先在上面儲存至少一個招式。"); return; }

    const countEl = document.getElementById("moveGenCountInput");
    let count = parseInt(countEl.value, 10);
    if (!Number.isFinite(count) || count < 1) count = 1;
    count = Math.min(count, 50);
    const allowRepeat = document.getElementById("moveGenAllowRepeatChk").checked;

    if (replace){
      if (context.keyframes.length > 0 && !confirm("這會清空目前時間軸上所有拍點，改用招式庫隨機生成一份新的，確定嗎？")) return;
      context.keyframes = [];
    }

    let lastId = null;
    for (let i = 0; i < count; i++){
      let pick;
      if (items.length === 1 || allowRepeat){
        pick = items[Math.floor(Math.random() * items.length)];
      } else {
        const pool = items.filter(x => x.id !== lastId); // 避免連續兩段選到同一招式
        pick = pool[Math.floor(Math.random() * pool.length)];
      }
      lastId = pick.id;
      if (pick.data && Array.isArray(pick.data.frames) && pick.data.frames.length > 0){
        appendMoveFrames(pick.data.frames);
      }
    }

    context.kfEditingIndex = context.keyframes.length - 1;
    context.stopKeyframePlayback();
    context.syncEasingControlsFromSelection();
    context.renderKeyframeChips();
    context.scheduleAutoSave();
    context.pushHistory();
  }

  function autoGenerateMove(frameCount){
    const eligibleKeys = context.JOINT_LIMIT_KEYS.filter(key => {
      if (!context.bones[key]) return false;
      const lim = context.JOINT_LIMITS[key];
      return lim.x.enabled || lim.y.enabled || lim.z.enabled;
    });
    if (eligibleKeys.length === 0){
      alert("目前沒有任何關節啟用限制範圍，請先到「關節限制」分頁至少設定一個關節的角度限制，才有範圍可以自動生成。");
      return null;
    }
    const frames = [];
    for (let i = 0; i < frameCount; i++){
      context.generateRandomPose(); // 沿用關節限制/Isolation設定隨機擺一個姿勢
      frames.push({
        angles: context.snapshotCurrentAngles(),
        body: context.snapshotBodyTransform(),
        easing: context.kfPendingEasing,
        beats: context.kfPendingBeats
      });
    }
    return frames;
  }
  return { appendMoveFrames, generateChoreographyFromMoves, autoGenerateMove };
}
