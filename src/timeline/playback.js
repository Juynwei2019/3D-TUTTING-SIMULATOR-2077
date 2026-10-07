import { EASINGS } from "../math/easings.js";

// The host owns audio, UI and the shared clock. Read live state through getters;
// do not capture arrays replaced by import, undo or choreography generation.
export function createTimelinePlayback(context){
  function updateKeyframePlayback(now){
    if(context.waveClips.length){context.updateWaveTrackPlayback(now);return;}
    // BG-5：Range Loop 優先於整段 Loop。到達選取區段右界時直接把播放時鐘跳回左界，
    // 不改 keyframe 資料本身；Pose / Groove / Audio 都重新對齊同一個 Beat。
    if (context.beatGridRangeLoop && context.hasBeatGridRange()) {
      const currentBeat = context.getBeatGridPosePlayheadBeat(now);
      if (currentBeat >= context.beatGridRangeEnd - 1e-5) context.seekRunningPlaybackToBeat(context.beatGridRangeStart, now);
    }
    let frameA = context.keyframes[context.kfIndex];
    let frameB = context.keyframes[context.kfIndex + 1];

    let beatMs = (60000 / context.bpm) * (frameA.beats || 1);
    const elapsed = now - context.kfStartTime;
    let t = Math.min(elapsed / beatMs, 1); // 線性時間進度，用來判斷這一段是否播完

    while (t >= 1){
      // 🔧 修正（原本的 bug）：這一段轉場結束時，過去的作法是先在「舊 frameA/frameB」上算完
      // 姿勢＋律動、render 用的是「姿勢＋律動」，緊接著卻又呼叫 context.applyPose/context.applyBodyTransform
      // 把姿勢蓋回「frameB 原始值、完全沒有律動位移」——等於每次跨拍都多渲染一幀「被清空律動」
      // 的乾淨姿勢，肉眼看起來就是每次跨拍全身彈一下，密集跨拍時就是連續的全身抖動。
      // 修法：先把 context.kfIndex/context.kfStartTime 換到新的一段（et 歸零），姿勢＋律動一律等下面統一用
      // 新的 frameA/frameB 重新算一次，讓「乾淨姿勢」跟「律動位移」永遠是同一幀算出來的結果，
      // 不會有先蓋掉、下一幀才補回律動的時間差。
      context.kfIndex++;
      if (context.kfIndex >= context.keyframes.length - 1){
        if (context.beatGridRangeLoop && context.hasBeatGridRange()){
          context.seekRunningPlaybackToBeat(context.beatGridRangeStart, now);
          frameA = context.keyframes[context.kfIndex];
          frameB = context.keyframes[context.kfIndex + 1];
          t = 0;
          context.updateBeatGridPlaybackUI(now);
          return;
        } else if (context.kfLoop){
          context.kfIndex = 0;
        } else {
          // 播放到最後一段結尾，直接把姿勢定格在最後一個拍點（不含律動殘留），再停止播放。
          context.applyPose(frameB.angles);
          context.applyBodyTransform(frameB.body);
          context.applyGrabKeyframe?.(frameB);
          context.stopKeyframePlayback();
          return;
        }
      }
      context.kfStartTime += beatMs;
      frameA = context.keyframes[context.kfIndex];
      frameB = context.keyframes[context.kfIndex + 1];
      beatMs = (60000 / context.bpm) * (frameA.beats || 1);
      t = Math.min((now-context.kfStartTime)/beatMs,1);
      context.grooveSquatAnchored = false; // 蹲彈的「原地錨點」跟著換到新一段的站位重新捕捉，
                                   // 不再整段編舞鎖死在播放開始那一刻的第一拍站位。
      context.updateOnionSkins(); // 換到新的過渡區段了，殘影要跟著往前挪一格（見 updateOnionSkinsForPlayback）
      // BG-2 改由連續 Playhead 自動跟隨，不在跨拍瞬間 scrollIntoView，避免兩套捲動機制互相拉扯。
    }

    const easeFn = EASINGS[frameA.easing] || EASINGS.linear;
    const et = easeFn(t); // 緩動後的進度餵給 slerp；Back/Elastic 允許超出 [0,1]，做出甩過頭再回彈的效果

    const overrideKeysThisFrame = context.applyKeyframeFramePose(frameA, frameB, et, t);
    context.applyGroove(now, overrideKeysThisFrame);
    context.applySquatGroove(now, context.grooveStartTime, false, overrideKeysThisFrame);

    context.updatePlayingKeyframeHighlight();
    context.updateBeatGridPlaybackUI(now);
  }
  return { update: updateKeyframePlayback };
}
