// TransformControls r160 has no pointercancel listener. Use its public API to
// restore interrupted drags and keep multi-touch camera gestures out of gizmos.
export function bindGizmoTouch({ element, gizmos, isPlaying, events = window }){
  const touches = new Set();
  let paused = null;
  function cancelDrags(){
    for (const gizmo of gizmos){
      if (gizmo.dragging){ gizmo.reset(); gizmo.pointerUp({ button:0 }); }
    }
  }
  function resume(){
    if (!paused) return;
    gizmos.forEach((gizmo, i) => { gizmo.enabled = paused[i] && !(i === 0 && isPlaying()); });
    paused = null;
  }
  events.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || (e.target !== element && !touches.size)) return;
    touches.add(e.pointerId);
    if (touches.size > 1 && !paused){
      cancelDrags();
      paused = gizmos.map(g => g.enabled);
      gizmos.forEach(g => { g.enabled = false; });
    }
  }, true);
  const finish = e => {
    if (e.type === 'pointercancel' && touches.has(e.pointerId)) cancelDrags();
    touches.delete(e.pointerId);
    if (!touches.size) resume();
  };
  events.addEventListener('pointerup', finish);
  events.addEventListener('pointercancel', finish);
  events.addEventListener('blur', () => { cancelDrags(); touches.clear(); resume(); });
}
