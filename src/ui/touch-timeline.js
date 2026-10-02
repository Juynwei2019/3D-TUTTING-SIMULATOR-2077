export function touchTimelineEditing(e){
  return e.pointerType !== 'touch' || document.documentElement.classList.contains('touchTimelineEditing');
}
export function bindTouchTimelineUI(moveSelection){
  const mode = document.getElementById('touchTimelineEdit');
  mode.onclick = () => {
    const editing = document.documentElement.classList.toggle('touchTimelineEditing');
    mode.setAttribute('aria-pressed', String(editing));
    mode.textContent = editing ? '拖曳編輯：開' : '拖曳編輯：關';
  };
  for (const [id, direction] of [['touchTimelineEarlier',-1],['touchTimelineLater',1]]){
    document.getElementById(id).onclick = () => {
      const changed = moveSelection(document.getElementById('touchTimelineTrack').value, direction);
      document.getElementById('touchTimelineStatus').textContent = changed ? '已移動選取片段' : '請先選取片段；播放中或邊界位置無法移動';
    };
  }
}
