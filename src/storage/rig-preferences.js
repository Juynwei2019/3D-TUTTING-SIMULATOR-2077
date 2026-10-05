import { t as tr } from "../i18n/index.js";
export function createRigPreferences(preferences, context){
  function loadJointLimits(){
    try {
      const raw = preferences.getItem(context.JOINT_LIMITS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      for (const k of context.JOINT_LIMIT_KEYS){
        if (!saved[k]) continue;
        for (const axis of ["x","y","z"]){
          if (saved[k][axis]) Object.assign(context.JOINT_LIMITS[k][axis], saved[k][axis]);
        }
      }
    } catch (e){ console.warn(tr("關節限制讀取失敗:"), e); }
  }
  function saveJointLimits(){
    try { preferences.setItem(context.JOINT_LIMITS_STORAGE_KEY, JSON.stringify(context.JOINT_LIMITS)); }
    catch (e){ console.warn(tr("關節限制儲存失敗:"), e); }
  }
  function loadIsolationSettings(){
    try {
      const raw = preferences.getItem(context.ISOLATION_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.enabled === "boolean") context.isolationSettings.enabled = saved.enabled;
      if (typeof saved.minGroups === "number") context.isolationSettings.minGroups = saved.minGroups;
      if (typeof saved.maxGroups === "number") context.isolationSettings.maxGroups = saved.maxGroups;
      if (saved.weights && typeof saved.weights === "object") Object.assign(context.isolationSettings.weights, saved.weights);
      if (saved.jointWeights && typeof saved.jointWeights === "object") Object.assign(context.isolationSettings.jointWeights, saved.jointWeights);
    } catch (e){ console.warn(tr("Isolation設定讀取失敗:"), e); }
  }
  function saveIsolationSettings(){
    try { preferences.setItem(context.ISOLATION_STORAGE_KEY, JSON.stringify(context.isolationSettings)); }
    catch (e){ console.warn(tr("Isolation設定儲存失敗:"), e); }
  }
  function saveHandCollisionRadii(){
    try {
      const data = {
        hand: context.HAND_COLLISION_RADIUS,
        capsules: context.TORSO_CAPSULES.map(c => c.radius),
        legCapsules: context.LEG_CAPSULES.map(c => c.radius),
        headRadius: context.HEAD_CAPSULES[0].radius
      };
      preferences.setItem(context.HAND_COLLISION_RADII_STORAGE_KEY, JSON.stringify(data));
    } catch (e){ console.warn(tr("手部碰撞半徑儲存失敗:"), e); }
  }
  function loadHandCollisionRadii(){
    try {
      const raw = preferences.getItem(context.HAND_COLLISION_RADII_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.hand === "number") context.HAND_COLLISION_RADIUS = data.hand;
      if (Array.isArray(data.capsules)){
        data.capsules.forEach((r, i) => { if (typeof r === "number" && context.TORSO_CAPSULES[i]) context.TORSO_CAPSULES[i].radius = r; });
      }
      if (Array.isArray(data.legCapsules)){
        data.legCapsules.forEach((r, i) => { if (typeof r === "number" && context.LEG_CAPSULES[i]) context.LEG_CAPSULES[i].radius = r; });
      }
      if (typeof data.headRadius === "number") context.HEAD_CAPSULES[0].radius = data.headRadius;
    } catch (e){ console.warn(tr("手部碰撞半徑讀取失敗:"), e); }
  }
  return { loadJointLimits, saveJointLimits, loadIsolationSettings, saveIsolationSettings, saveHandCollisionRadii, loadHandCollisionRadii };
}
