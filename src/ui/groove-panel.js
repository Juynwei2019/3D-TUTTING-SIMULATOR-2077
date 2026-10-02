import { LABEL_LOOKUP } from "../rig/definitions.js";
import { GROOVE_WAVE_EASE_PREFIX, GROOVE_WAVE_EASE_BI_PREFIX, grooveWaveValue } from "../motion/groove-wave.js";
import { buildEasingSelectOptions } from "../ui/easing-gallery.js";

// Live host getters preserve shared rig and playback coordination.
export function createGroovePanel(context){
  const _grooveWaveSVGCache = new Map();

  let _grooveGenOptionsBuilt = false;

  function buildGrooveJointUI(){
    const host = document.getElementById("grooveJointsList");
    if (!host) return;
    host.innerHTML = "";
    for (const key of context.GROOVE_JOINT_KEYS){
      const chip = document.createElement("div");
      chip.className = "grooveChip";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "grooveToggleBtn";
      btn.textContent = LABEL_LOOKUP[key] || key;
      btn.dataset.key = key;
      btn.classList.toggle("active", context.grooveJointSet.has(key));
      btn.classList.toggle("customized", isGrooveJointCustomized(key));
      btn.onclick = () => {
        if (context.grooveJointSet.has(key)) context.grooveJointSet.delete(key); else context.grooveJointSet.add(key);
        btn.classList.toggle("active", context.grooveJointSet.has(key));
        invalidateGrooveGenMeta(); // 勾選/取消關節也改變了這組律動的內容，同樣讓 seed 失效
        context.scheduleAutoSave();
      };

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "grooveEditBtn";
      editBtn.textContent = "⚙";
      editBtn.title = "自訂「" + (LABEL_LOOKUP[key] || key) + "」的律動參數";
      editBtn.dataset.key = key;
      editBtn.classList.toggle("editing", context.grooveEditingKey === key);
      editBtn.onclick = () => selectGrooveEditingJoint(key);

      chip.appendChild(btn);
      chip.appendChild(editBtn);
      host.appendChild(chip);
    }
  }

  function selectGrooveEditingJoint(key){
    context.grooveEditingKey = key;
    document.querySelectorAll("#grooveJointsList .grooveEditBtn").forEach(b => {
      b.classList.toggle("editing", b.dataset.key === key);
    });
    renderGrooveEditor();
  }

  function isGrooveJointCustomized(key){
    const c = context.grooveCustomParams[key];
    return !!c && Object.keys(c).length > 0;
  }

  function updateGrooveChipCustomizedMark(key){
    const btn = document.querySelector('#grooveJointsList .grooveToggleBtn[data-key="' + key + '"]');
    if (btn) btn.classList.toggle("customized", isGrooveJointCustomized(key));
  }

  function renderGrooveEditor(){
    const empty = document.getElementById("grooveEditorEmpty");
    const panel = document.getElementById("grooveEditorPanel");
    if (!empty || !panel) return;

    if (!context.grooveEditingKey || !context.GROOVE_PRESETS[context.grooveEditingKey]){
      empty.style.display = "";
      panel.style.display = "none";
      return;
    }
    empty.style.display = "none";
    panel.style.display = "";

    const params = context.getGrooveParams(context.grooveEditingKey);
    const label = document.getElementById("grooveEditorLabel");
    if (label) label.textContent = LABEL_LOOKUP[context.grooveEditingKey] || context.grooveEditingKey;

    document.querySelectorAll("#grooveAxisBtns button").forEach(b => {
      b.classList.toggle("active", b.dataset.axis === params.axis);
    });
    document.querySelectorAll("#grooveWaveBtns button").forEach(b => {
      b.classList.toggle("active", b.dataset.wave === params.wave);
    });

    // 合成波（ease:/easeBi:）列：拆出「極性」與「曲線名」兩個維度分別回填。
    // 目前用的是內建 bounce/sine 時，極性仍顯示對應的那一側（bounce→單向、sine→來回），
    // 讓使用者直接從選單挑一條曲線就能無痛升級，不用先想「我該按哪個極性」。
    const waveStr = String(params.wave || "");
    const isBi = waveStr.startsWith(GROOVE_WAVE_EASE_BI_PREFIX);
    const isUni = waveStr.startsWith(GROOVE_WAVE_EASE_PREFIX);
    const polarity = isBi ? GROOVE_WAVE_EASE_BI_PREFIX
                   : isUni ? GROOVE_WAVE_EASE_PREFIX
                   : (params.wave === "sine" ? GROOVE_WAVE_EASE_BI_PREFIX : GROOVE_WAVE_EASE_PREFIX);
    document.querySelectorAll("#grooveWavePolarityBtns button").forEach(b => {
      b.classList.toggle("active", b.dataset.polarity === polarity);
    });
    const easeSel = document.getElementById("grooveWaveEaseSelect");
    if (easeSel) easeSel.value = isBi ? waveStr.slice(GROOVE_WAVE_EASE_BI_PREFIX.length)
                              : isUni ? waveStr.slice(GROOVE_WAVE_EASE_PREFIX.length)
                              : "";
    const wavePrev = document.getElementById("grooveWavePreview");
    if (wavePrev) wavePrev.innerHTML = buildGrooveWaveSVG(params.wave, 72, 30);

    const ampSlider = document.getElementById("grooveAmpSlider");
    const freqSlider = document.getElementById("grooveFreqSlider");
    const phaseSlider = document.getElementById("groovePhaseSlider");
    if (ampSlider) ampSlider.value = String(params.amp);
    if (freqSlider) freqSlider.value = String(params.freq);
    if (phaseSlider) phaseSlider.value = String(params.phase);

    const ampVal = document.getElementById("grooveAmpVal");
    const freqVal = document.getElementById("grooveFreqVal");
    const phaseVal = document.getElementById("groovePhaseVal");
    if (ampVal) ampVal.textContent = params.amp + "°";
    if (freqVal) freqVal.textContent = "×" + params.freq;
    if (phaseVal) phaseVal.textContent = params.phase.toFixed(2);
  }

  function buildGrooveWaveSVG(wave, w, h){
    const cacheKey = wave + "_" + w + "_" + h;
    const cached = _grooveWaveSVGCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const pad = 3, steps = 48, yMin = -1.25, yMax = 1.25;
    let d = "";
    for (let i = 0; i <= steps; i++){
      const p = i / steps;
      let y = grooveWaveValue(wave, p);
      if (!isFinite(y)) y = 0;
      y = Math.max(yMin, Math.min(yMax, y));
      const x = pad + p * (w - 2 * pad);
      const yy = (h - pad) - ((y - yMin) / (yMax - yMin)) * (h - 2 * pad);
      d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + yy.toFixed(1) + " ";
    }
    const zeroY = (h - pad) - ((0 - yMin) / (yMax - yMin)) * (h - 2 * pad);
    const svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;">`
      + `<line x1="${pad}" y1="${zeroY.toFixed(1)}" x2="${w-pad}" y2="${zeroY.toFixed(1)}" stroke="#33335a" stroke-width="1" stroke-dasharray="2,2"/>`
      + `<path d="${d}" fill="none" stroke="#7fe0ff" stroke-width="1.6" stroke-linecap="round"/>`
      + `</svg>`;
    _grooveWaveSVGCache.set(cacheKey, svg);
    return svg;
  }

  function renderGrooveGenUI(){
    const sel = document.getElementById("grooveGenArchetypeSelect");
    if (!sel) return; // DOM 還沒建好（例如還原自動存檔時就被呼叫到），直接跳過

    if (!_grooveGenOptionsBuilt){
      sel.innerHTML = context.GROOVE_ARCHETYPE_IDS
        .map(id => `<option value="${id}">${context.GROOVE_ARCHETYPES[id].label}</option>`).join("");
      _grooveGenOptionsBuilt = true;
    }

    const arc = context.GROOVE_ARCHETYPES[sel.value] || context.GROOVE_ARCHETYPES.down;
    const desc = document.getElementById("grooveGenDesc");
    if (desc) desc.textContent = arc.desc;

    // 結果列：只有「目前這組律動確實是自動生成且沒被手動改過」時才顯示 seed，
    // 否則顯示的 seed 重現出來會是別的東西（見 invalidateGrooveGenMeta）。
    const result = document.getElementById("grooveGenResult");
    if (result){
      if (context.grooveLastGenMeta){
        const m = context.grooveLastGenMeta;
        const arcLabel = (context.GROOVE_ARCHETYPES[m.archetype] || {}).label || m.archetype;
        const loop = Number.isFinite(m.loopBeats) ? `・循環 ${m.loopBeats} 拍` : "";
        const energy = Number.isFinite(m.energy) ? `・總幅度 ${m.energy}°` : "";
        result.textContent = `目前：${arcLabel}・種子 ${m.seed}${loop}${energy}・${context.grooveJointSet.size} 個關節・蹲彈${context.grooveSquatEnabled ? "開" : "關"}`;
      } else {
        result.textContent = "目前的律動不是自動生成的（或已手動修改過），沒有可重現的種子。";
      }
    }

    const seedInput = document.getElementById("grooveGenSeedInput");
    if (seedInput && context.grooveLastGenMeta && document.activeElement !== seedInput){
      seedInput.value = String(context.grooveLastGenMeta.seed); // 不覆蓋使用者正在輸入的內容
    }
  }

  function doGrooveGenerate(seed){
    const sel = document.getElementById("grooveGenArchetypeSelect");
    const arcId = sel ? sel.value : "down";
    const cfg = context.generateGrooveConfig(arcId, seed);

    // applyGrooveConfigData 會跑 sanitize（順便驗證生成出來的波形/數值全部合法）、
    // 寫回 grooveJointSet/grooveCustomParams/蹲彈設定、設定 grooveLastGenMeta、刷新整個律動 UI。
    context.applyGrooveConfigData(cfg);
    context.grooveSquatAnchored = false; // 蹲彈開關/振幅可能整個換掉了，下一幀重新捕捉腳掌原地錨點

    const autoPrev = document.getElementById("grooveGenAutoPreviewChk");
    if (autoPrev && autoPrev.checked && !context.groovePreviewEnabled){
      const btn = document.getElementById("groovePreviewBtn");
      if (btn) btn.click(); // 沿用預覽按鈕自己的開啟流程（重設拍子起點/清 xfade 殘留），不另外複製一份邏輯
    }
    renderGrooveGenUI();
  }

  function bindGrooveGenUI(){
    const sel = document.getElementById("grooveGenArchetypeSelect");
    if (!sel) return;
    sel.onchange = () => renderGrooveGenUI();

    const rollBtn = document.getElementById("grooveGenRollBtn");
    if (rollBtn) rollBtn.onclick = () => doGrooveGenerate(null);
    const rerollBtn = document.getElementById("grooveGenRerollBtn");
    if (rerollBtn) rerollBtn.onclick = () => doGrooveGenerate(null);

    const seedBtn = document.getElementById("grooveGenSeedApplyBtn");
    if (seedBtn) seedBtn.onclick = () => {
      const input = document.getElementById("grooveGenSeedInput");
      const raw = (input && input.value || "").trim();
      const n = parseInt(raw, 10);
      if (!raw || !Number.isFinite(n)){ doGrooveGenerate(null); return; } // 留空/亂打＝當隨機處理，不彈錯誤打斷創作流程
      doGrooveGenerate(n >>> 0);
    };

    const saveBtn = document.getElementById("grooveGenSaveBtn");
    if (saveBtn) saveBtn.onclick = () => {
      if (!context.grooveLibCtrl) return;
      if (context.grooveJointSet.size === 0 && !context.grooveSquatEnabled){
        alert("目前沒有任何律動內容可存——請先按「🎲 生成並套用」。");
        return;
      }
      const name = context.grooveLastGenMeta
        ? context.grooveGenAutoName(context.grooveLastGenMeta.archetype, context.grooveLastGenMeta.seed)
        : ("手調律動_" + new Date().toLocaleTimeString("zh-TW", { hour12:false }));
      context.grooveLibCtrl.saveData(name, context.captureCurrentGrooveConfig());
    };

    const batchBtn = document.getElementById("grooveGenBatchBtn");
    if (batchBtn) batchBtn.onclick = () => {
      if (!context.grooveLibCtrl) return;
      const countEl = document.getElementById("grooveGenBatchCount");
      let n = parseInt(countEl ? countEl.value : "4", 10);
      if (!Number.isFinite(n) || n < 1) n = 1;
      n = Math.min(n, 20);
      const arcId = sel.value;
      for (let i = 0; i < n; i++){
        const cfg = context.generateGrooveConfig(arcId, null);
        context.grooveLibCtrl.saveData(context.grooveGenAutoName(arcId, cfg.meta.seed), cfg);
      }
      // 批次刻意不動目前的律動設定（跟「自動生成招式」只存進招式庫、不動時間軸同一個原則）
      alert(`已生成 ${n} 組「${context.GROOVE_ARCHETYPES[arcId].label}」律動並存入律動庫。\n接著可到「時間軸」分頁的「律動序列」把它們排成段落。`);
    };

    renderGrooveGenUI();
  }

  function setGrooveCustomField(key, field, value){
    if (!context.grooveCustomParams[key]) context.grooveCustomParams[key] = {};
    context.grooveCustomParams[key][field] = value;
    updateGrooveChipCustomizedMark(key);
    invalidateGrooveGenMeta();
    context.scheduleAutoSave();
  }

  function invalidateGrooveGenMeta(){
    if (!context.grooveLastGenMeta) return;
    context.grooveLastGenMeta = null;
    renderGrooveGenUI();
  }

  function resetGrooveJoint(key){
    delete context.grooveCustomParams[key];
    updateGrooveChipCustomizedMark(key);
    invalidateGrooveGenMeta();
    renderGrooveEditor();
    context.scheduleAutoSave();
  }

  function resetAllGrooveCustom(){
    if (Object.keys(context.grooveCustomParams).length === 0) return;
    const ok = confirm("確定要把所有關節的律動參數恢復成預設值嗎？此動作無法復原。");
    if (!ok) return;
    context.grooveCustomParams = {};
    for (const key of context.GROOVE_JOINT_KEYS) updateGrooveChipCustomizedMark(key);
    invalidateGrooveGenMeta();
    renderGrooveEditor();
    context.scheduleAutoSave();
  }

  function refreshGrooveJointUI(){
    context.grooveEditingKey = null; // 匯入後不預設選取任何關節，避免顯示到舊選取但語意已經變的資料
    buildGrooveJointUI();
    renderGrooveEditor();
    renderGrooveSquatUI();
    renderGrooveWarmupUI();
    renderGrooveGenUI();
  }

  function renderGrooveWarmupUI(){
    const chk = document.getElementById("grooveWarmupEnabledChk");
    if (chk) chk.checked = context.grooveWarmupEnabled;
    const slider = document.getElementById("grooveWarmupBeatsSlider");
    if (slider) slider.value = String(context.grooveWarmupBeats);
    const val = document.getElementById("grooveWarmupBeatsVal");
    if (val) val.textContent = context.grooveWarmupBeats + "拍";
    document.querySelectorAll("#grooveWarmupCurveBtns button").forEach(b => {
      b.classList.toggle("active", b.dataset.curve === context.grooveWarmupCurve);
    });
  }

  function bindGrooveUI(){
    buildGrooveJointUI();

    const warmupChk = document.getElementById("grooveWarmupEnabledChk");
    if (warmupChk) warmupChk.onchange = (e) => { context.grooveWarmupEnabled = e.target.checked; context.scheduleAutoSave(); };
    const warmupSlider = document.getElementById("grooveWarmupBeatsSlider");
    if (warmupSlider) warmupSlider.oninput = (e) => {
      context.grooveWarmupBeats = parseFloat(e.target.value);
      const val = document.getElementById("grooveWarmupBeatsVal");
      if (val) val.textContent = context.grooveWarmupBeats + "拍";
      context.scheduleAutoSave();
    };
    document.querySelectorAll("#grooveWarmupCurveBtns button").forEach(b => {
      b.onclick = () => {
        context.grooveWarmupCurve = b.dataset.curve;
        document.querySelectorAll("#grooveWarmupCurveBtns button").forEach(bb => bb.classList.toggle("active", bb === b));
        context.scheduleAutoSave();
      };
    });
    renderGrooveWarmupUI();

    // 即時預覽：不用播放拍點，原地持續套用律動，方便邊調滑桿邊看手感。
    // 每次重新開啟都重新對齊拍子起點（groovePreviewStartTime = now），讓每次預覽的手感一致、
    // 不會因為「上次關閉時卡在哪個相位」而每次開頭的彈動幅度都不一樣。
    const previewBtn = document.getElementById("groovePreviewBtn");
    if (previewBtn){
      previewBtn.onclick = () => {
        context.groovePreviewEnabled = !context.groovePreviewEnabled;
        if (context.groovePreviewEnabled){
          context.groovePreviewStartTime = performance.now();
          context.grooveSquatAnchored = false; // 重新對齊蹲彈的腳掌原地錨點
          context.resetGrooveXfadeState();     // 清掉上次預覽殘留的段落切換狀態，理由同 toggleKeyframePlayback
          context.resetSquatXfadeState();
        } else if (context._squatPreviewLastDelta.lengthSq() > 0){
          // 關閉預覽的當下順手把蹲彈疊加的位移還原乾淨，避免角色卡在半蹲姿勢
          // （下一幀 animate() 就不會再呼叫 applySquatGroove 幫忙清了，這裡要主動做）
          context.model.position.sub(context._squatPreviewLastDelta);
          context._squatPreviewLastDelta.set(0, 0, 0);
          context.resetSquatFootAnchors();
        }
        previewBtn.classList.toggle("active", context.groovePreviewEnabled);
        previewBtn.textContent = context.groovePreviewEnabled ? "■ 停止預覽" : "▶ 律動預覽";
      };
    }

    document.querySelectorAll("#grooveAxisBtns button").forEach(b => {
      b.onclick = () => {
        if (!context.grooveEditingKey) return;
        setGrooveCustomField(context.grooveEditingKey, "axis", b.dataset.axis);
        renderGrooveEditor();
      };
    });
    document.querySelectorAll("#grooveWaveBtns button").forEach(b => {
      b.onclick = () => {
        if (!context.grooveEditingKey) return;
        setGrooveCustomField(context.grooveEditingKey, "wave", b.dataset.wave);
        renderGrooveEditor();
      };
    });

    // 合成波：極性（單向/來回）× 曲線（32 條 Easing）兩個維度組成 wave id。
    // 曲線選「—」代表不使用合成波，退回同極性的內建波形（單向→bounce、來回→sine），
    // 這樣使用者永遠有一條明確的回頭路，不會被卡在合成波裡。
    // 曲線選單在這裡就填好（不是等生成面板初始化）——renderGrooveEditor() 會在 bindGrooveGenUI()
    // 之前先跑一次，選單若那時還是空的，回填 value 會靜默失敗。
    const grooveEaseSel = document.getElementById("grooveWaveEaseSelect");
    if (grooveEaseSel && !grooveEaseSel.options.length){
      grooveEaseSel.innerHTML = `<option value="">—（用上面的 bounce／sine）</option>` + buildEasingSelectOptions();
    }
    const applyCompositeWave = () => {
      if (!context.grooveEditingKey) return;
      const polBtn = document.querySelector("#grooveWavePolarityBtns button.active");
      const polarity = polBtn ? polBtn.dataset.polarity : GROOVE_WAVE_EASE_PREFIX;
      const easeName = grooveEaseSel ? grooveEaseSel.value : "";
      const wave = easeName
        ? (polarity + easeName)
        : (polarity === GROOVE_WAVE_EASE_BI_PREFIX ? "sine" : "bounce");
      setGrooveCustomField(context.grooveEditingKey, "wave", wave);
      renderGrooveEditor();
    };
    document.querySelectorAll("#grooveWavePolarityBtns button").forEach(b => {
      b.onclick = () => {
        if (!context.grooveEditingKey) return;
        document.querySelectorAll("#grooveWavePolarityBtns button").forEach(bb => bb.classList.toggle("active", bb === b));
        applyCompositeWave();
      };
    });
    if (grooveEaseSel) grooveEaseSel.onchange = applyCompositeWave;

    const ampSlider = document.getElementById("grooveAmpSlider");
    if (ampSlider) ampSlider.oninput = (e) => {
      if (!context.grooveEditingKey) return;
      const v = parseFloat(e.target.value);
      setGrooveCustomField(context.grooveEditingKey, "amp", v);
      const ampVal = document.getElementById("grooveAmpVal");
      if (ampVal) ampVal.textContent = v + "°";
    };
    const freqSlider = document.getElementById("grooveFreqSlider");
    if (freqSlider) freqSlider.oninput = (e) => {
      if (!context.grooveEditingKey) return;
      const v = parseFloat(e.target.value);
      setGrooveCustomField(context.grooveEditingKey, "freq", v);
      const freqVal = document.getElementById("grooveFreqVal");
      if (freqVal) freqVal.textContent = "×" + v;
    };
    const phaseSlider = document.getElementById("groovePhaseSlider");
    if (phaseSlider) phaseSlider.oninput = (e) => {
      if (!context.grooveEditingKey) return;
      const v = parseFloat(e.target.value);
      setGrooveCustomField(context.grooveEditingKey, "phase", v);
      const phaseVal = document.getElementById("groovePhaseVal");
      if (phaseVal) phaseVal.textContent = v.toFixed(2);
    };

    const resetJointBtn = document.getElementById("grooveResetJointBtn");
    if (resetJointBtn) resetJointBtn.onclick = () => { if (context.grooveEditingKey) resetGrooveJoint(context.grooveEditingKey); };

    const resetAllBtn = document.getElementById("grooveResetAllBtn");
    if (resetAllBtn) resetAllBtn.onclick = resetAllGrooveCustom;

    renderGrooveEditor();
    bindGrooveSquatUI();
    context.bindGrooveLibraryUI(); // 先建立 grooveLibCtrl，下面「批次生成存入律動庫」才有對象可寫
    bindGrooveGenUI();
    context.bindGrooveSequenceUI();
  }

  function renderGrooveSquatUI(){
    const chk = document.getElementById("grooveSquatEnabledChk");
    if (chk) chk.checked = context.grooveSquatEnabled;

    const params = context.getGrooveSquatParams();
    document.querySelectorAll("#grooveSquatWaveBtns button").forEach(b => {
      b.classList.toggle("active", b.dataset.wave === params.wave);
    });
    document.querySelectorAll("#grooveSquatLateralWaveBtns button").forEach(b => {
      b.classList.toggle("active", b.dataset.wave === params.lateralWave);
    });

    const vertSlider = document.getElementById("grooveSquatVertSlider");
    const lateralSlider = document.getElementById("grooveSquatLateralSlider");
    const freqSlider = document.getElementById("grooveSquatFreqSlider");
    const phaseSlider = document.getElementById("grooveSquatPhaseSlider");
    const lateralFreqSlider = document.getElementById("grooveSquatLateralFreqSlider");
    const lateralPhaseSlider = document.getElementById("grooveSquatLateralPhaseSlider");
    if (vertSlider) vertSlider.value = String(params.vertAmp);
    if (lateralSlider) lateralSlider.value = String(params.lateralAmp);
    if (freqSlider) freqSlider.value = String(params.freq);
    if (phaseSlider) phaseSlider.value = String(params.phase);
    if (lateralFreqSlider) lateralFreqSlider.value = String(params.lateralFreq);
    if (lateralPhaseSlider) lateralPhaseSlider.value = String(params.lateralPhase);

    const vertVal = document.getElementById("grooveSquatVertVal");
    const lateralVal = document.getElementById("grooveSquatLateralVal");
    const freqVal = document.getElementById("grooveSquatFreqVal");
    const phaseVal = document.getElementById("grooveSquatPhaseVal");
    const lateralFreqVal = document.getElementById("grooveSquatLateralFreqVal");
    const lateralPhaseVal = document.getElementById("grooveSquatLateralPhaseVal");
    if (vertVal) vertVal.textContent = params.vertAmp + "cm";
    if (lateralVal) lateralVal.textContent = params.lateralAmp + "cm";
    if (freqVal) freqVal.textContent = "×" + params.freq;
    if (phaseVal) phaseVal.textContent = params.phase.toFixed(2);
    if (lateralFreqVal) lateralFreqVal.textContent = "×" + params.lateralFreq;
    if (lateralPhaseVal) lateralPhaseVal.textContent = params.lateralPhase.toFixed(2);
  }

  function setGrooveSquatField(field, value){
    context.grooveSquatCustom[field] = value;
    invalidateGrooveGenMeta();
    context.scheduleAutoSave();
  }

  function resetGrooveSquat(){
    context.grooveSquatCustom = {};
    invalidateGrooveGenMeta();
    renderGrooveSquatUI();
    context.scheduleAutoSave();
  }

  function bindGrooveSquatUI(){
    const chk = document.getElementById("grooveSquatEnabledChk");
    if (chk){
      chk.onchange = (e) => {
        context.grooveSquatEnabled = e.target.checked;
        if (context.grooveSquatEnabled) context.grooveSquatAnchored = false; // 剛打開：下一幀重新抓目前站姿當基準
        context.scheduleAutoSave();
      };
    }

    document.querySelectorAll("#grooveSquatWaveBtns button").forEach(b => {
      b.onclick = () => { setGrooveSquatField("wave", b.dataset.wave); renderGrooveSquatUI(); };
    });
    document.querySelectorAll("#grooveSquatLateralWaveBtns button").forEach(b => {
      b.onclick = () => { setGrooveSquatField("lateralWave", b.dataset.wave); renderGrooveSquatUI(); };
    });

    const vertSlider = document.getElementById("grooveSquatVertSlider");
    if (vertSlider) vertSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      setGrooveSquatField("vertAmp", v);
      const el = document.getElementById("grooveSquatVertVal");
      if (el) el.textContent = v + "cm";
    };
    const lateralSlider = document.getElementById("grooveSquatLateralSlider");
    if (lateralSlider) lateralSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      setGrooveSquatField("lateralAmp", v);
      const el = document.getElementById("grooveSquatLateralVal");
      if (el) el.textContent = v + "cm";
    };
    const freqSlider = document.getElementById("grooveSquatFreqSlider");
    if (freqSlider) freqSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      setGrooveSquatField("freq", v);
      const el = document.getElementById("grooveSquatFreqVal");
      if (el) el.textContent = "×" + v;
    };
    const phaseSlider = document.getElementById("grooveSquatPhaseSlider");
    if (phaseSlider) phaseSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      setGrooveSquatField("phase", v);
      const el = document.getElementById("grooveSquatPhaseVal");
      if (el) el.textContent = v.toFixed(2);
    };
    const lateralFreqSlider = document.getElementById("grooveSquatLateralFreqSlider");
    if (lateralFreqSlider) lateralFreqSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      setGrooveSquatField("lateralFreq", v);
      const el = document.getElementById("grooveSquatLateralFreqVal");
      if (el) el.textContent = "×" + v;
    };
    const lateralPhaseSlider = document.getElementById("grooveSquatLateralPhaseSlider");
    if (lateralPhaseSlider) lateralPhaseSlider.oninput = (e) => {
      const v = parseFloat(e.target.value);
      setGrooveSquatField("lateralPhase", v);
      const el = document.getElementById("grooveSquatLateralPhaseVal");
      if (el) el.textContent = v.toFixed(2);
    };

    const resetBtn = document.getElementById("grooveSquatResetBtn");
    if (resetBtn) resetBtn.onclick = resetGrooveSquat;

    renderGrooveSquatUI();
  }
  return { buildGrooveJointUI, selectGrooveEditingJoint, isGrooveJointCustomized, updateGrooveChipCustomizedMark, renderGrooveEditor, buildGrooveWaveSVG, renderGrooveGenUI, doGrooveGenerate, bindGrooveGenUI, setGrooveCustomField, invalidateGrooveGenMeta, resetGrooveJoint, resetAllGrooveCustom, refreshGrooveJointUI, renderGrooveWarmupUI, bindGrooveUI, renderGrooveSquatUI, setGrooveSquatField, resetGrooveSquat, bindGrooveSquatUI };
}
