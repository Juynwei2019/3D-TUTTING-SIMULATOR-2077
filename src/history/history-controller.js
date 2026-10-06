// Snapshots and history cursors are private; restoration never records itself.
export function createHistory({ capture, restore, isBlocked = () => false, onChange = () => {}, limit = 50 }){
  let stack = [], index = -1, restoring = false;
  const clone = value => JSON.parse(JSON.stringify(value));
  function push(){
    if (restoring) return false;
    const snapshot = clone(capture());
    if(index>=0 && JSON.stringify(stack[index])===JSON.stringify(snapshot))return false;
    stack = stack.slice(0, index + 1);
    stack.push(snapshot);
    if (stack.length > limit) stack.shift();
    index = stack.length - 1;
    onChange();
    return true;
  }
  function move(next){
    if (restoring || isBlocked() || next < 0 || next >= stack.length) return false;
    restoring = true;
    try {
      restore(clone(stack[next]));
      index = next;
    } finally {
      restoring = false;
      onChange();
    }
    return true;
  }
  return { push, undo: () => move(index - 1), redo: () => move(index + 1),
    get canUndo(){ return index > 0; }, get canRedo(){ return index < stack.length - 1; } };
}
