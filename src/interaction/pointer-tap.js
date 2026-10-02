// A tap is valid only if one pointer stayed still for its entire gesture.
export function createPointerTap(){
  const pointers = new Map();
  let blocked = false;
  function down(e){
    if (e.button !== 0) return;
    if (pointers.size) blocked = true;
    pointers.set(e.pointerId, { x:e.clientX, y:e.clientY, moved:false, threshold:e.pointerType === 'touch' ? 12 : 6 });
  }
  function move(e){
    const p = pointers.get(e.pointerId);
    if (p && Math.hypot(e.clientX-p.x, e.clientY-p.y) > p.threshold) p.moved = true;
  }
  function up(e){
    move(e);
    const p = pointers.get(e.pointerId);
    const tap = !!p && !p.moved && !blocked && pointers.size === 1;
    pointers.delete(e.pointerId);
    if (!pointers.size) blocked = false;
    return tap;
  }
  function cancel(e){ blocked = true; pointers.delete(e.pointerId); if (!pointers.size) blocked = false; }
  return { down, move, up, cancel, invalidate(){ blocked = true; }, reset(){ pointers.clear(); blocked = false; }, has:id=>pointers.has(id), active:()=>pointers.size > 0 };
}
