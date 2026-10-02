import { AUTOSAVE_KEY, validateProject } from './project-format.js';

export function createAutosave({ getStorage, capture, onSaved = () => {}, onError = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout, delay = 1500 }){
  let timer = null;
  function save(){
    try {
      getStorage().setItem(AUTOSAVE_KEY, JSON.stringify(capture()));
      onSaved();
      return true;
    } catch (error){ onError(error); return false; }
  }
  function schedule(){
    clearTimer(timer);
    timer = setTimer(() => { timer = null; save(); }, delay);
  }
  function read(){
    try {
      const raw = getStorage().getItem(AUTOSAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return validateProject(data, { autosave: true }) ? null : data;
    } catch (_) { return null; }
  }
  function clear(){ try { getStorage().removeItem(AUTOSAVE_KEY); } catch (_) {} }
  function cancel(){ clearTimer(timer); timer = null; }
  return { schedule, save, read, clear, cancel };
}
