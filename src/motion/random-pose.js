import { t as tr, liveText } from "../i18n/index.js";
import { OVERVIEW_GROUPS } from "../rig/definitions.js";

// Live host getters preserve shared rig and playback coordination.
export function createRandomPoseGenerator(context){
  function getGroupWeight(groupId){
    const w = context.isolationSettings.weights[groupId];
    return (typeof w === "number" && Number.isFinite(w) && w >= 0) ? w : 1;
  }

  function getJointWeight(key){
    const w = context.isolationSettings.jointWeights[key];
    return (typeof w === "number" && w >= 0 && w <= 100) ? w : 100;
  }

  function pickWeightedGroupsWithoutReplacement(pool, count){
    const items = pool.map(g => ({ g, w: getGroupWeight(g.id) })).filter(it=>it.w>0);
    const picked = [];
    for (let i = 0; i < count && items.length > 0; i++){
      const total = items.reduce((s, it) => s + it.w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < items.length - 1; idx++){
        r -= items[idx].w;
        if (r <= 0) break;
      }
      picked.push(items[idx].g);
      items.splice(idx, 1);
    }
    return picked;
  }

  function sampleAxisAngle(key, axis, axisLim, gridStep, edgeProb){
    if (!axisLim || !axisLim.enabled) return null; // null＝沒有範圍，呼叫端維持原值
    let lo = axisLim.min, hi = axisLim.max;
    if (lo > hi){ const t = lo; lo = hi; hi = t; }
    if (hi - lo < 1e-6) return lo; // min===max，沒有隨機空間，直接回傳固定值

    if (Math.random() < edgeProb){
      // 貼邊界：候選值只有 [完全伸直, 完全折死] 兩個。
      return Math.random() < 0.5 ? lo : hi;
    }
    if (gridStep > 0){
      const first=Math.ceil(lo/gridStep),last=Math.floor(hi/gridStep);
      if(first>last)return null; // no zero-anchored grid point: preserve the current axis
      return (first+Math.floor(Math.random()*(last-first+1)))*gridStep;
    }
    return lo + Math.random() * (hi - lo); // gridStep<=0時退回連續均勻隨機
  }

  function generateRandomPose(){
    const gridStep = parseFloat(document.getElementById("jlGridStepInput")?.value) || 15;
    const edgeProbPct = parseFloat(document.getElementById("jlEdgeProbInput")?.value);
    const edgeProb = (isNaN(edgeProbPct) ? 40 : edgeProbPct) / 100;
    const statusEl = document.getElementById("jlIsolationStatus");

    // 「有資格被重骰」＝有對應骨骼、且至少一軸啟用限制；不管有沒有開Isolation都先算這份清單。
    const eligibleKeys = context.JOINT_LIMIT_KEYS.filter(key => {
      if (!context.bones[key]) return false;
      const lim = context.JOINT_LIMITS[key];
      return lim.x.enabled || lim.y.enabled || lim.z.enabled;
    });
    if (eligibleKeys.length === 0){
      alert(tr("目前全部 {p0} 個關節都還沒有啟用任何一軸的限制，沒有範圍可以隨機。\n請先在下面找到想要的關節、勾選至少一軸並填入合理的最小/最大值。", {p0:context.JOINT_LIMIT_KEYS.length}));
      return;
    }

    let keysToRoll, selectedGroups=[];
    if (context.isolationSettings.enabled){
      const eligibleKeySet = new Set(eligibleKeys);
      // 分組裡只要有任一關節「有資格」，這組就有資格被抽中
      const eligibleGroups = OVERVIEW_GROUPS.filter(g => getGroupWeight(g.id)>0 && g.keys.some(k => eligibleKeySet.has(k)));
      if (eligibleGroups.length === 0){
        alert(tr("目前沒有權重大於 0 且已啟用關節限制的分組，無法進行 Isolation 隨機。"));
        return;
      }
      const lo = Math.max(1, Math.min(context.isolationSettings.minGroups, context.isolationSettings.maxGroups));
      const hi = Math.max(context.isolationSettings.minGroups, context.isolationSettings.maxGroups);
      const wantCount = Math.min(eligibleGroups.length, lo + Math.floor(Math.random() * (hi - lo + 1)));
      const pickedGroups = pickWeightedGroupsWithoutReplacement(eligibleGroups, wantCount);

      const pickedKeySet = new Set();
      for (const g of pickedGroups) for (const k of g.keys) if (eligibleKeySet.has(k)) pickedKeySet.add(k);
      keysToRoll = eligibleKeys.filter(k => pickedKeySet.has(k));

      selectedGroups=pickedGroups;
    } else {
      keysToRoll = eligibleKeys;

    }

    // 第二層篩選：範圍內（分組選中／或Isolation未開啟時的全部有資格關節）的每個關節，
    // 再各自依「機率」決定這次是否真的要重骰——機率100（預設）＝一定摸到，行為跟原本一樣；
    // 機率調低可以做出「同一組裡有些關節常動、有些關節難得動一次」的細節。
    const finalKeys = keysToRoll.filter(key => Math.random() * 100 < getJointWeight(key));
    const skippedByWeight = keysToRoll.length - finalKeys.length;

    if(statusEl)liveText(statusEl,()=> (selectedGroups.length ? tr("本次選中：")+selectedGroups.map(g=>tr(g.label)).join(" / ") : "") + (skippedByWeight>0 ? " "+tr("（另有 {p0} 個關節因機率設定這次跳過）",{p0:skippedByWeight}) : ""));

    for (const key of finalKeys){
      const lim = context.JOINT_LIMITS[key];
      const cur = context.poseController.getTarget(key) || [0,0,0];
      const rawSamples = [
        sampleAxisAngle(key, "x", lim.x, gridStep, edgeProb),
        sampleAxisAngle(key, "y", lim.y, gridStep, edgeProb),
        sampleAxisAngle(key, "z", lim.z, gridStep, edgeProb)
      ];
      const xyz = rawSamples.map((v, i) => v === null ? cur[i] : v); // 沒啟用的軸（null）維持原本角度
      context.setTarget(key, xyz); // setTarget內部本身也會clamp，這裡等於雙重保險
    }
    context.setActiveBtn(-1);
    context.updateSelectedBar();
    context.updateJointLimitPanelAngles(true);

    context.pushHistory();
  }
  return { getGroupWeight, getJointWeight, pickWeightedGroupsWithoutReplacement, sampleAxisAngle, generateRandomPose };
}
