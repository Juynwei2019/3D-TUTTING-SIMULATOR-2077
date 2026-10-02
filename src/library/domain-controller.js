import { FINGER_JOINT_KEYS } from "../rig/definitions.js";
import { GROOVE_PRESETS, GROOVE_ARCHETYPES } from "../motion/definitions.js";

// Live host getters preserve shared rig and playback coordination.
export function createLibraryDomainController(context){
  function captureCurrentBodyPose(){
    const data = {};
    for (const k of context.BODY_LIB_JOINT_KEYS) data[k] = (context.poseController.getTarget(k) || [0,0,0]).map(v => Math.round(v*10)/10);
    return data;
  }

  function applyBodyPoseData(data){
    for (const k of context.BODY_LIB_JOINT_KEYS){
      if (Array.isArray(data[k]) && data[k].length === 3) context.setTarget(k, data[k]);
    }
    context.setActiveBtn(-1);
    context.updateSelectedBar();
  }

  function captureCurrentGesture(){
    const data = {};
    for (const k of FINGER_JOINT_KEYS) data[k] = (context.poseController.getTarget(k) || [0,0,0]).map(v => Math.round(v*10)/10);
    return data;
  }

  function applyGestureData(data){
    if(context.waveRun)context.stopWave();
    for (const k of FINGER_JOINT_KEYS){
      if (Array.isArray(data[k]) && data[k].length === 3) context.setTarget(k, data[k]);
    }
    context.updateSelectedBar();
  }

  function formatRelativeSavedTime(ts){
    if (!ts) return "";
    const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (diffSec < 60) return "剛剛";
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return diffMin + "分鐘前";
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return diffHr + "小時前";
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 30) return diffDay + "天前";
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function moveLibSubtitle(item){
    const frames = (item.data && Array.isArray(item.data.frames)) ? item.data.frames : [];
    const frameCount = frames.length;
    const totalBeats = frames.reduce((s, f) => s + (f && f.beats ? f.beats : 1), 0);
    // 用目前的 BPM 換算預估秒數；如果之後 BPM 改了，實際套用時長度會跟著新 BPM 走，這裡只是抓個大概。
    const ms = Math.round((60000 / context.bpm) * totalBeats);
    const sec = (ms / 1000).toFixed(1);
    const when = formatRelativeSavedTime(item.savedAt);
    return `${frameCount}拍・約${sec}秒${when ? "・" + when : ""}`;
  }

  function captureSelectedMove(){
    const total = context.keyframes.length;
    if (total === 0){ alert("目前時間軸沒有任何拍點，請先到「拍點」分頁排好動作。"); return null; }
    const startEl = document.getElementById("moveLibStartInput");
    const endEl = document.getElementById("moveLibEndInput");
    let a = parseInt(startEl.value, 10);
    let b = parseInt(endEl.value, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)){
      alert("請輸入有效的起始拍與結束拍（例如 1、4）。"); return null;
    }
    if (a > b) { const t = a; a = b; b = t; }
    a = Math.max(1, Math.min(a, total));
    b = Math.max(1, Math.min(b, total));
    const frames = JSON.parse(JSON.stringify(context.keyframes.slice(a - 1, b)));
    if (frames.length === 0) return null;
    return { frames };
  }

  function insertMoveData(data){
    if (!data || !Array.isArray(data.frames) || data.frames.length === 0){
      alert("這個招式資料格式錯誤或是空的。"); return;
    }
    const cloned = JSON.parse(JSON.stringify(data.frames));
    const insertAt = (context.kfEditingIndex >= 0 && context.kfEditingIndex < context.keyframes.length) ? context.kfEditingIndex + 1 : context.keyframes.length;
    context.keyframes.splice(insertAt, 0, ...cloned);
    context.kfEditingIndex = insertAt + cloned.length - 1;
    context.syncEasingControlsFromSelection();
    context.renderKeyframeChips();
    context.scheduleAutoSave();
  }

  function updateMoveLibRangeHint(){
    const hint = document.getElementById("moveLibRangeHint");
    if (hint) hint.textContent = `（目前時間軸共 ${context.keyframes.length} 拍）`;
  }

  function captureCurrentGrooveConfig(){
    const out = {
      jointSet: Array.from(context.grooveJointSet),
      customParams: JSON.parse(JSON.stringify(context.grooveCustomParams)),
      squatEnabled: context.grooveSquatEnabled,
      squatCustom: JSON.parse(JSON.stringify(context.grooveSquatCustom))
    };
    // 若目前這組律動是自動生成出來、且之後沒被手動改過，就把來源（原型＋seed）一起存進去，
    // 之後才能「這組不錯，但我想再抖一點」——從同一個 seed 重現後微調，而不是整組重抽。
    if (context.grooveLastGenMeta) out.meta = JSON.parse(JSON.stringify(context.grooveLastGenMeta));
    return out;
  }

  function sanitizeGrooveLibConfigData(data){
    const out = { jointSet: [], customParams: {}, squatEnabled: false, squatCustom: {} };
    if (!data || typeof data !== "object") return out;
    if (Array.isArray(data.jointSet)) out.jointSet = data.jointSet.filter(k => GROOVE_PRESETS[k]);
    if (data.customParams && typeof data.customParams === "object"){
      for (const key of Object.keys(data.customParams)){
        if (!GROOVE_PRESETS[key]) continue;
        const cleaned = context.sanitizeGrooveCustomEntry(data.customParams[key]);
        if (Object.keys(cleaned).length > 0) out.customParams[key] = cleaned;
      }
    }
    out.squatEnabled = !!data.squatEnabled;
    out.squatCustom = context.sanitizeGrooveSquatCustomEntry(data.squatCustom);
    // 自動生成來源（原型＋seed）：白名單放行，否則會跟其他未知欄位一起被濾掉，
    // 導致存進律動庫的自動生成項目一讀回來就失去「可重現」這個唯一好處。
    if (data.meta && typeof data.meta === "object"){
      const m = {};
      if (Number.isFinite(data.meta.seed)) m.seed = data.meta.seed >>> 0;
      if (typeof data.meta.archetype === "string" && GROOVE_ARCHETYPES[data.meta.archetype]) m.archetype = data.meta.archetype;
      if (Number.isFinite(data.meta.loopBeats) && data.meta.loopBeats > 0) m.loopBeats = data.meta.loopBeats;
      if (Number.isFinite(data.meta.energy)) m.energy = data.meta.energy;
      if (m.seed !== undefined && m.archetype !== undefined) out.meta = m; // 兩者缺一就無法重現，不留半套資料
    }
    return out;
  }

  function applyGrooveConfigData(rawData){
    const data = sanitizeGrooveLibConfigData(rawData);
    context.grooveJointSet = new Set(data.jointSet);
    context.grooveCustomParams = data.customParams;
    context.grooveSquatEnabled = data.squatEnabled;
    context.grooveSquatCustom = data.squatCustom;
    context.grooveLastGenMeta = data.meta || null; // 套用非自動生成的項目時會被清成 null，正確：那組確實沒有 seed 可重現
    context.refreshGrooveJointUI();
    context.renderGrooveSquatUI();
    context.scheduleAutoSave();
  }

  function grooveLibSubtitle(item){
    const data = item.data || {};
    const jointCount = Array.isArray(data.jointSet) ? data.jointSet.length : 0;
    const squatTag = data.squatEnabled ? "蹲彈開" : "蹲彈關";
    const when = formatRelativeSavedTime(item.savedAt);
    // 自動生成的項目標上原型名稱：庫裡混了手調與自動生成時，一眼看得出哪些是機器抽的
    const m = data.meta;
    const genTag = (m && GROOVE_ARCHETYPES[m.archetype]) ? ("🤖" + GROOVE_ARCHETYPES[m.archetype].short + "・") : "";
    return `${genTag}${jointCount}個關節・${squatTag}${when ? "・" + when : ""}`;
  }

  function bindLibraryUI(){
    context.poseLibCtrl = context.createLibraryController({
      storageKey: context.POSE_LIB_KEY, captureFn: captureCurrentBodyPose, applyFn: applyBodyPoseData,
      listElId: "poseLibList", emptyElId: "poseLibEmpty", filePrefix: "姿勢", itemLabel: "姿勢"
    });
    context.gestureLibCtrl = context.createLibraryController({
      storageKey: context.GESTURE_LIB_KEY, captureFn: captureCurrentGesture, applyFn: applyGestureData,
      listElId: "gestureLibList", emptyElId: "gestureLibEmpty", filePrefix: "手勢", itemLabel: "手勢"
    });

    const poseNameInput = document.getElementById("poseLibNameInput");
    document.getElementById("poseLibSaveBtn").onclick = () => {
      context.poseLibCtrl.saveCurrent(poseNameInput.value);
      poseNameInput.value = "";
    };
    poseNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("poseLibSaveBtn").click(); });
    document.getElementById("poseLibExportAllBtn").onclick = () => context.poseLibCtrl.exportAll();
    document.getElementById("poseLibImportAllBtn").onclick = () => document.getElementById("poseLibImportAllFile").click();
    document.getElementById("poseLibImportAllFile").onchange = (e) => { context.poseLibCtrl.importAll(e.target.files[0]); e.target.value = ""; };
    document.getElementById("poseLibImportOneBtn").onclick = () => document.getElementById("poseLibImportOneFile").click();
    document.getElementById("poseLibImportOneFile").onchange = (e) => { context.poseLibCtrl.importOne(e.target.files[0]); e.target.value = ""; };

    const gestureNameInput = document.getElementById("gestureLibNameInput");
    document.getElementById("gestureLibSaveBtn").onclick = () => {
      context.gestureLibCtrl.saveCurrent(gestureNameInput.value);
      gestureNameInput.value = "";
    };
    gestureNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("gestureLibSaveBtn").click(); });
    document.getElementById("gestureLibExportAllBtn").onclick = () => context.gestureLibCtrl.exportAll();
    document.getElementById("gestureLibImportAllBtn").onclick = () => document.getElementById("gestureLibImportAllFile").click();
    document.getElementById("gestureLibImportAllFile").onchange = (e) => { context.gestureLibCtrl.importAll(e.target.files[0]); e.target.value = ""; };
    document.getElementById("gestureLibImportOneBtn").onclick = () => document.getElementById("gestureLibImportOneFile").click();
    document.getElementById("gestureLibImportOneFile").onchange = (e) => { context.gestureLibCtrl.importOne(e.target.files[0]); e.target.value = ""; };

    context.moveLibCtrl = context.createLibraryController({
      storageKey: context.MOVE_LIB_KEY, captureFn: captureSelectedMove, applyFn: insertMoveData,
      listElId: "moveLibList", emptyElId: "moveLibEmpty", filePrefix: "招式", itemLabel: "招式",
      subtitleFn: moveLibSubtitle,
      onRender: (count) => {
        const badge = document.getElementById("moveLibCount");
        if (badge) badge.textContent = count;
      }
    });
    const moveSearchInput = document.getElementById("moveLibSearchInput");
    if (moveSearchInput) moveSearchInput.addEventListener("input", () => context.moveLibCtrl.setFilter(moveSearchInput.value));

    const moveNameInput = document.getElementById("moveLibNameInput");
    document.getElementById("moveLibSaveBtn").onclick = () => {
      context.moveLibCtrl.saveCurrent(moveNameInput.value);
      moveNameInput.value = "";
    };
    moveNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("moveLibSaveBtn").click(); });
    document.getElementById("moveLibExportAllBtn").onclick = () => context.moveLibCtrl.exportAll();
    document.getElementById("moveLibImportAllBtn").onclick = () => document.getElementById("moveLibImportAllFile").click();
    document.getElementById("moveLibImportAllFile").onchange = (e) => { context.moveLibCtrl.importAll(e.target.files[0]); e.target.value = ""; };
    document.getElementById("moveLibImportOneBtn").onclick = () => document.getElementById("moveLibImportOneFile").click();
    document.getElementById("moveLibImportOneFile").onchange = (e) => { context.moveLibCtrl.importOne(e.target.files[0]); e.target.value = ""; };

    document.getElementById("moveLibUseCurAsStartBtn").onclick = () => {
      if (context.kfEditingIndex < 0){ alert("請先到「拍點」分頁點選一個拍點。"); return; }
      document.getElementById("moveLibStartInput").value = context.kfEditingIndex + 1;
    };
    document.getElementById("moveLibUseCurAsEndBtn").onclick = () => {
      if (context.kfEditingIndex < 0){ alert("請先到「拍點」分頁點選一個拍點。"); return; }
      document.getElementById("moveLibEndInput").value = context.kfEditingIndex + 1;
    };

    updateMoveLibRangeHint();
    document.getElementById("moveGenAppendBtn").onclick = () => context.generateChoreographyFromMoves(false);
    document.getElementById("moveGenReplaceBtn").onclick = () => context.generateChoreographyFromMoves(true);

    document.getElementById("moveAutoGenBtn").onclick = () => {
      const countEl = document.getElementById("moveAutoGenFrameCountInput");
      let n = parseInt(countEl.value, 10);
      if (!Number.isFinite(n) || n < 2) n = 2;
      n = Math.min(n, 12);
      const frames = context.autoGenerateMove(n);
      if (!frames) return;
      const nameEl = document.getElementById("moveAutoGenNameInput");
      const name = (nameEl.value || "").trim() || `自動招式_${context.moveLibCtrl.getItems().length + 1}`;
      context.moveLibCtrl.saveData(name, { frames });
      nameEl.value = "";
      context.updateSelectedBar();
    };

    context.poseLibCtrl.render();
    context.gestureLibCtrl.render();
    context.moveLibCtrl.render();
    context.renderStorageUsageIndicator();
  }
  return { captureCurrentBodyPose, applyBodyPoseData, captureCurrentGesture, applyGestureData, formatRelativeSavedTime, moveLibSubtitle, captureSelectedMove, insertMoveData, updateMoveLibRangeHint, captureCurrentGrooveConfig, sanitizeGrooveLibConfigData, applyGrooveConfigData, grooveLibSubtitle, bindLibraryUI };
}
