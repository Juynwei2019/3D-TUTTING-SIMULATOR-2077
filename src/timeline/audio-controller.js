import { t as tr } from "../i18n/index.js";
// Session-only media ownership. No DOM queries, timeline state or persistence.
export function createTimelineAudio({ getAudio, getOffset, getBpm, urls = URL, warn = console.warn }){
  let objectUrl = null;
  function importFile(file, volume){
    if (!file) return;
    if (objectUrl) urls.revokeObjectURL(objectUrl);
    objectUrl = urls.createObjectURL(file);
    const audio = getAudio();
    audio.src = objectUrl;
    audio.volume = volume;
  }
  function remove(){
    const audio = getAudio();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (objectUrl) urls.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  function playFromOffset(){
    const audio = getAudio();
    if (!audio || !audio.src) return;
    try { audio.currentTime = Math.max(0, getOffset()); } catch (_) {}
    audio.play().catch(error => warn(tr("音樂播放失敗（可能需要先跟頁面互動一次）："), error));
  }
  function pause(){
    const audio = getAudio();
    if (audio && !audio.paused) audio.pause();
  }
  function togglePreview(){
    const audio = getAudio();
    if (!audio || !audio.src) return;
    if (audio.paused) audio.play().catch(error => warn(tr("音樂播放失敗："), error));
    else audio.pause();
  }
  return {
    importFile, remove, playFromOffset, pause, togglePreview,
    beatToTime: beat => getOffset() + Math.max(0, beat) * 60 / getBpm(),
    timeToBeat: sec => Math.max(0, (sec - getOffset()) * getBpm() / 60),
  };
}
