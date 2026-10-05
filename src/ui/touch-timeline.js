import { t as tr, liveText } from "../i18n/index.js";
export function touchTimelineEditing(e){
  return e.pointerType !== 'touch' || document.documentElement.classList.contains('touchTimelineEditing');
}
export function bindTouchTimelineUI(moveSelection){
  const mode = document.getElementById('touchTimelineEdit');
  mode.onclick = () => {
    const editing = document.documentElement.classList.toggle('touchTimelineEditing');
    mode.setAttribute('aria-pressed', String(editing));
    liveText(mode, ()=>editing ? tr("拖曳編輯：開") : tr("拖曳編輯：關"));
  };
  for (const [id, direction] of [['touchTimelineEarlier',-1],['touchTimelineLater',1]]){
    document.getElementById(id).onclick = () => {
      const changed = moveSelection(document.getElementById('touchTimelineTrack').value, direction);
      liveText(document.getElementById('touchTimelineStatus'), ()=>changed ? tr("已移動選取片段") : tr("請先選取片段；播放中或邊界位置無法移動"));
    };
  }
}
