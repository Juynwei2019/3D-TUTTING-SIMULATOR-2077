import { LABEL_LOOKUP, FINGER_DEFS, FINGER_JOINT_LABELS, BONE_SUFFIXES } from '../rig/definitions.js';
import { i18n, t, english } from './index.js';
export function jointLabel(key){
  if(i18n.language==='zh-Hant')return LABEL_LOOKUP[key]||key;
  const finger=/^([rl])(Thumb|Index|Middle|Ring|Pinky)([123])$/.exec(key);
  if(finger){
    const [,side,id,joint]=finger;
    return t('{hand}{finger}・{joint}',{hand:t(side==='r'?'右手':'左手'),finger:t(FINGER_DEFS.find(f=>f.id===id).label),joint:t(FINGER_JOINT_LABELS[joint])});
  }
  return (BONE_SUFFIXES[key]||key).replace(/([a-z])([A-Z])/g,'$1 $2');
}

export function fingerLabel(id){
  const finger=FINGER_DEFS.find(f=>f.id===id.slice(1));
  return t('{hand}{finger}',{hand:t(id[0]==='r'?'右手':'左手'),finger:t(finger?.label||id)});
}

// Search both languages without changing the active locale or rebuilding rows.
export function jointSearchText(key){
  const finger=/^([rl])(Thumb|Index|Middle|Ring|Pinky)([123])$/.exec(key);
  const terms=[key,LABEL_LOOKUP[key]||'',(BONE_SUFFIXES[key]||'').replace(/([a-z])([A-Z])/g,'$1 $2')];
  if(finger){
    const [,side,id,joint]=finger,def=FINGER_DEFS.find(f=>f.id===id);
    terms.push([english[side==='r'?'右手':'左手'],english[def.label],english[FINGER_JOINT_LABELS[joint]]].join(' '));
  }
  return terms.join(' ').toLowerCase();
}

export function jointCountLabel(count){
  return i18n.language==='en' ? `${count} ${count===1?'joint':'joints'}` : `${count} 個關節`;
}
