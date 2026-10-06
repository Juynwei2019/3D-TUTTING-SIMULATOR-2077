import { t, liveText, liveAttribute, translateDOM } from "../i18n/index.js";
const translatedSpan=key=>`<span data-i18n="${key}">${t(key)}</span>`;

// ======================================================================
// 扶握箱功能 — UI 區塊（mountGrabBoxUI）
// 完全不 import three.js、不知道 geometry 或貼合演算法怎麼算。
// 單向資料流：使用者操作 → 呼叫 core.setXxx(...) → 核心狀態變 → notify() →
// 這裡訂閱的 render(state) 被觸發 → 面板重新畫成最新狀態。UI 永遠不用自己另外記狀態。
// ======================================================================

const GRAB_SHAPE_PARAM_INPUTS = {
  box: [
    { key: "w", label: "寬 (X)", min: 0.10, max: 1.60, step: 0.01 },
    { key: "h", label: "高 (Y)", min: 0.10, max: 1.60, step: 0.01 },
    { key: "d", label: "深 (Z)", min: 0.10, max: 1.60, step: 0.01 },
  ],
  sphere: [
    { key: "r", label: "半徑", min: 0.05, max: 0.80, step: 0.01 },
  ],
  cylinder: [
    { key: "r", label: "半徑", min: 0.05, max: 0.80, step: 0.01 },
    { key: "h", label: "高", min: 0.10, max: 1.60, step: 0.01 },
  ],
};
const GRAB_SHAPE_LABELS = { box: "長方體", sphere: "球體", cylinder: "圓柱" };

function grabPanelHTML(){
  const shapeBtns = Object.keys(GRAB_SHAPE_LABELS)
    .map(type => `<button data-shape="${type}" data-i18n="${GRAB_SHAPE_LABELS[type]}">${t(GRAB_SHAPE_LABELS[type])}</button>`).join("");
  return `
    <section class="grabPanel" aria-label="${t("扶握箱設定")}" data-i18n-aria-label="扶握箱設定">
      <header class="grabHeader">
        <div><h2 data-i18n="扶握箱">${t("扶握箱")}</h2><p data-i18n="用透明形狀引導雙手接觸與移動。">${t("用透明形狀引導雙手接觸與移動。")}</p></div>
        <div class="grabActions"><button id="grabVisibleBtn" type="button"></button><button id="grabModeBtn" type="button"></button></div>
      </header>
      <p id="grabStatus" class="grabStatus" role="status" aria-live="polite"></p>
      <div class="grabSettings">
        <fieldset class="grabCard">
          <legend data-i18n="形狀與尺寸">${t("形狀與尺寸")}</legend>
          <div id="grabShapeBtns" class="grabShapeButtons" role="group" aria-label="${t("形狀")}" data-i18n-aria-label="形狀">${shapeBtns}</div>
          <p class="grabHint" data-i18n="尺寸單位：公尺（m）">${t("尺寸單位：公尺（m）")}</p>
          <div id="grabShapeParams"></div>
        </fieldset>
        <fieldset class="grabCard grabContactCard">
          <legend data-i18n="雙手接觸">${t("雙手接觸")}</legend>
          <p class="grabHint" data-i18n="先調整手掌位置，再勾選要扶握的手。">${t("先調整手掌位置，再勾選要扶握的手。")}</p>
          <label class="grabHandChoice"><input type="checkbox" id="grabHandCb_rArm">${translatedSpan("右手扶著箱子")}<span id="grabHandState_rArm" class="grabHandState"></span></label>
          <label class="grabHandChoice"><input type="checkbox" id="grabHandCb_lArm">${translatedSpan("左手扶著箱子")}<span id="grabHandState_lArm" class="grabHandState"></span></label>
          <p class="grabHint" data-i18n="顯示形狀時，扶握中的手會跟隨移動與旋轉。">${t("顯示形狀時，扶握中的手會跟隨移動與旋轉。")}</p>
        </fieldset>
      </div>
      <details class="grabHelp"><summary data-i18n="扶握操作說明">${t("扶握操作說明")}</summary>
        <p>${translatedSpan("扶握箱 — 胸前放一個透明形狀，調整雙手到位後勾選「扶著箱子」即可貼合表面；移動/旋轉箱子時扶著的手會跟著動（未開 IK 的手會自動開啟）。")}</p>
        <p data-i18n="顯示後拖曳三維操作軸；按操作模式按鈕切換移動或旋轉。隱藏扶握箱會解除雙手扶握，但不會關閉手臂 IK。">${t("顯示後拖曳三維操作軸；按操作模式按鈕切換移動或旋轉。隱藏扶握箱會解除雙手扶握，但不會關閉手臂 IK。")}</p>
      </details>
    </section>
  `;
}

function grabShapeParamsHTML(shapeType, params){
  const defs = GRAB_SHAPE_PARAM_INPUTS[shapeType];
  return defs.map(def => `
    <label class="grabSlider" for="grabParam_${shapeType}_${def.key}">
      ${translatedSpan(def.label)}
      <input type="range" id="grabParam_${shapeType}_${def.key}" aria-label="${t(def.label)}" data-i18n-aria-label="${def.label}" min="${def.min}" max="${def.max}" step="${def.step}" value="${params[def.key]}">
      <output class="grabValue" for="grabParam_${shapeType}_${def.key}"><span id="grabParamVal_${shapeType}_${def.key}">${params[def.key].toFixed(2)}</span><span aria-hidden="true"> m</span></output>
    </label>
  `).join("");
}

function mountGrabBoxUI(container, core){
  if (!container) return;
  container.innerHTML = grabPanelHTML();
  translateDOM(container);

  const visibleBtn = container.querySelector("#grabVisibleBtn");
  const modeBtn = container.querySelector("#grabModeBtn");
  const shapeBtnsWrap = container.querySelector("#grabShapeBtns");
  const paramsWrap = container.querySelector("#grabShapeParams");
  const handCbs = {
    rArm: container.querySelector("#grabHandCb_rArm"),
    lArm: container.querySelector("#grabHandCb_lArm"),
  };

  visibleBtn.onclick = () => core.setVisible(!core.getState().visible);
  modeBtn.onclick = () => {
    const cur = core.getState().mode;
    core.setMode(cur === "translate" ? "rotate" : "translate");
  };
  shapeBtnsWrap.querySelectorAll("button[data-shape]").forEach(btn => {
    btn.onclick = () => core.setShapeType(btn.dataset.shape);
  });
  for (const limb of ["rArm", "lArm"]){
    handCbs[limb].onchange = (e) => core.setGrabHand(limb, e.target.checked);
  }

  let lastShapeType = null;

  function bindParamSliders(shapeType){
    const defs = GRAB_SHAPE_PARAM_INPUTS[shapeType];
    for (const def of defs){
      const input = paramsWrap.querySelector("#grabParam_" + shapeType + "_" + def.key);
      if (!input) continue;
      input.oninput = (e) => {
        const val = parseFloat(e.target.value);
        const label = paramsWrap.querySelector("#grabParamVal_" + shapeType + "_" + def.key);
        if (label) label.textContent = val.toFixed(2);
        core.setShapeParam(shapeType, def.key, val);
      };
    }
  }

  function render(state){
    visibleBtn.classList.toggle("active", state.visible);
    visibleBtn.setAttribute("aria-pressed",String(state.visible));
    liveText(visibleBtn,()=>t(state.visible?"隱藏扶握箱":"顯示扶握箱"));
    liveText(container.querySelector('#grabStatus'),()=>t(state.visible?"形狀已顯示 · {count} 隻手已勾選":"形狀已隱藏 · {count} 隻手已勾選",{count:Number(!!state.grabbed.rArm)+Number(!!state.grabbed.lArm)}));
    liveText(modeBtn,()=>t(state.mode === "translate" ? "操作：移動" : "操作：旋轉"));
    liveAttribute(modeBtn,"title",()=>t(state.mode==="translate"?"切換為旋轉操作":"切換為移動操作"));
    shapeBtnsWrap.querySelectorAll("button[data-shape]").forEach(btn => {
      btn.setAttribute("aria-pressed",String(btn.dataset.shape===state.shapeType));
      btn.classList.toggle("active", btn.dataset.shape === state.shapeType);
    });

    // 只有切換形狀種類時才整段重建滑桿 DOM，同形狀內單純改數值只更新 value/文字，
    // 避免使用者正在拖曳滑桿時 DOM 被重建打斷拖曳。
    if (state.shapeType !== lastShapeType){
      paramsWrap.innerHTML = grabShapeParamsHTML(state.shapeType, state.shapeParams[state.shapeType]);
      translateDOM(paramsWrap);
      bindParamSliders(state.shapeType);
      lastShapeType = state.shapeType;
    } else {
      const defs = GRAB_SHAPE_PARAM_INPUTS[state.shapeType];
      for (const def of defs){
        const input = paramsWrap.querySelector("#grabParam_" + state.shapeType + "_" + def.key);
        const label = paramsWrap.querySelector("#grabParamVal_" + state.shapeType + "_" + def.key);
        const val = state.shapeParams[state.shapeType][def.key];
        if (input && document.activeElement !== input) input.value = String(val);
        if (label) label.textContent = val.toFixed(2);
      }
    }

    handCbs.rArm.checked = !!state.grabbed.rArm;
    handCbs.lArm.checked = !!state.grabbed.lArm;
    for(const limb of ['rArm','lArm']){
      handCbs[limb].closest('.grabHandChoice').classList.toggle('active',!!state.grabbed[limb]);
      liveText(container.querySelector('#grabHandState_'+limb),()=>t(state.grabbed[limb]?"已啟用":"未啟用"));
    }
  }

  core.onChange(render);
  render(core.getState());
}


export { mountGrabBoxUI };
