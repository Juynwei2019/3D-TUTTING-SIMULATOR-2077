import { BONE_SUFFIXES, FINGER_DEFS, HAND_SIDES, FINGER_JOINT_LABELS, FINGER_JOINT_KEYS, FINGER_JOINT_KEY_SET, ALL_JOINT_KEYS, LABEL_LOOKUP, OVERVIEW_GROUPS, IK_CHAINS, IK_LIMB_KEYS, SHOULDER_ASSIST_MAX_ANGLE, ROOT_FOLLOW_LERP_T_DEFAULT, SPINE_CCD_DAMPING_DEFAULT, SPINE_IK_CHAIN, LOOKAT_CONFIG, FINGER_IK_CHAINS, FINGER_IDS, FINGER_IK_PREFIX } from "../rig/definitions.js";

// Live host getters preserve shared rig and playback coordination.
export function createJointOwnership(context){
function rebuildIKDrivenKeys(){
  context.ikDrivenKeys.clear();
  for (const limb of IK_LIMB_KEYS){
    if (!context.ikEnabled[limb]) continue;
    const chain = IK_CHAINS[limb];
    context.ikDrivenKeys.add(chain.root);
    context.ikDrivenKeys.add(chain.mid);
    if (chain.shoulder) context.ikDrivenKeys.add(chain.shoulder); // 僅手臂有鎖骨輔助
  }
  if (context.spineIKEnabled) for (const k of SPINE_IK_CHAIN.bones) context.ikDrivenKeys.add(k);
  for(const name of Object.keys(LOOKAT_CONFIG))if(context.lookAtEnabled[name])context.ikDrivenKeys.add(LOOKAT_CONFIG[name].key);
  for (const fingerId of FINGER_IDS){
    if (!context.fingerIKEnabled[fingerId]) continue;
    for (const k of FINGER_IK_CHAINS[fingerId].bones) context.ikDrivenKeys.add(k);
  }

  // 律動避讓集合跟著一起重算（同一個進入點，不會有其中一份忘了更新的可能）。
  context.grooveBlockedKeys.clear();
  for (const k of context.ikDrivenKeys) context.grooveBlockedKeys.add(k);
  for (const fingerId of FINGER_IDS){
    if (!context.fingerIKEnabled[fingerId]) continue;
    context.grooveBlockedKeys.add(fingerId.charAt(0) === "r" ? "rHand" : "lHand"); // finger-id 慣例："r"/"l" + 指名
  }
}

function isIKDrivenKey(key){ return context.ikDrivenKeys.has(key); }
return { rebuildIKDrivenKeys, isIKDrivenKey };
}
