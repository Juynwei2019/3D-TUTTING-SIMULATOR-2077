import { t, onLanguageChange, liveAttribute } from "../i18n/index.js";
// Live host getters preserve shared rig and playback coordination.
export function createFloatingPanels(context){
  function initUIResize(){
    const ui = document.getElementById("ui");
    const handle = document.getElementById("uiResizeHandle");
    let dragging = false;
    let startY = 0;
    let startHeight = 0;

    function clampHeight(px){
      const max = window.innerHeight * context.UI_HEIGHT_MAX_RATIO;
      return Math.min(max, Math.max(context.UI_HEIGHT_MIN_PX, px));
    }

    function applyHeight(px, save){
      const h = clampHeight(px);
      ui.style.height = h + "px";
      if (save){
        try { context.preferences.setItem("tuttingUIHeightRatio", String(h / window.innerHeight)); } catch (e) {}
      }
    }

    function onPointerMove(e){
      if (!dragging) return;
      // 面板貼底部，往上拖（clientY 變小）要變高，所以是「起始Y - 目前Y」
      applyHeight(startHeight + (startY - e.clientY), false);
    }

    function onPointerUp(e){
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("dragging");
      document.body.classList.remove("uiResizing");
      applyHeight(ui.getBoundingClientRect().height, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      startY = e.clientY;
      startHeight = ui.getBoundingClientRect().height;
      handle.classList.add("dragging");
      document.body.classList.add("uiResizing");
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      e.preventDefault();
    });

    // 雙擊把手：重置回預設高度
    handle.addEventListener("dblclick", () => {
      applyHeight(window.innerHeight * context.UI_HEIGHT_DEFAULT_RATIO, true);
    });

    // 視窗尺寸改變時，依原本比例換算成新的 px 高度，維持相對大小（浮動模式的尺寸由 initUIFloat() 自己處理，這裡略過）
    window.addEventListener("resize", () => {
      if (ui.classList.contains("uiFloating")) return;
      let ratio = context.UI_HEIGHT_DEFAULT_RATIO;
      try { ratio = parseFloat(context.preferences.getItem("tuttingUIHeightRatio")) || context.UI_HEIGHT_DEFAULT_RATIO; } catch (e) {}
      applyHeight(window.innerHeight * ratio, false);
    });

    let ratio = context.UI_HEIGHT_DEFAULT_RATIO;
    try { ratio = parseFloat(context.preferences.getItem("tuttingUIHeightRatio")) || context.UI_HEIGHT_DEFAULT_RATIO; } catch (e) {}
    applyHeight(window.innerHeight * ratio, false);
  }

  function initUIFloat(){
    const ui = document.getElementById("ui");
    const floatBtn = document.getElementById("uiFloatBtn");
    const dragHandle = document.getElementById("uiDragHandle");
    const resizeHandle = document.getElementById("uiFloatResizeHandle");

    // 限制浮動視窗的位置跟大小都不超出目前視窗範圍，避免拖到畫面外找不回來
    // top 的下限不能只留 4px——面板頂部那排「浮動/隱藏面板」按鈕是用往上位移 28px 的方式疊在面板外面，
    // 面板一旦貼近畫面最上緣，那排按鈕就會被推到瀏覽器可視範圍外面，完全看不到也點不到、卡在浮動模式關不掉。
    // 這裡把 top 下限拉高到留得出那排按鈕的空間，從根本避免這個位置存在。
    const UI_FLOAT_TOP_MIN = 34;

    function clampRect(left, top, width, height){
      const maxW = window.innerWidth - 8;
      const maxH = window.innerHeight - 8;
      width = Math.min(Math.max(width, context.UI_FLOAT_MIN_WIDTH), maxW);
      height = Math.min(Math.max(height, context.UI_FLOAT_MIN_HEIGHT), maxH);
      left = Math.min(Math.max(left, 4), window.innerWidth - width - 4);
      top = Math.min(Math.max(top, UI_FLOAT_TOP_MIN), window.innerHeight - height - 4);
      return { left, top, width, height };
    }

    function applyRect(rect, save){
      ui.style.left = rect.left + "px";
      ui.style.top = rect.top + "px";
      ui.style.width = rect.width + "px";
      ui.style.height = rect.height + "px";
      if (save){
        try { context.preferences.setItem("tuttingUIFloatRect", JSON.stringify(rect)); } catch (e) {}
      }
    }

    function getDefaultRect(){
      return clampRect(context.UI_FLOAT_DEFAULT_LEFT, context.UI_FLOAT_DEFAULT_TOP, context.UI_FLOAT_DEFAULT_WIDTH, window.innerHeight * context.UI_HEIGHT_DEFAULT_RATIO);
    }

    function getSavedRect(){
      let rect = null;
      try { rect = JSON.parse(context.preferences.getItem("tuttingUIFloatRect")); } catch (e) {}
      if (!rect || typeof rect.left !== "number") return getDefaultRect();
      return clampRect(rect.left, rect.top, rect.width, rect.height);
    }

    function syncFloatLanguage(){
      const floating=ui.classList.contains('uiFloating');
      floatBtn.textContent=t(floating?'📌 貼底面板':'🗗 浮動面板');
      liveAttribute(floatBtn,'title',()=>t(floating?'切換回貼底整版寬的面板':'切換成可拖曳移動、可縮放大小的浮動面板'));
    }
    onLanguageChange(syncFloatLanguage);
    function setFloating(floating, save){
      ui.classList.toggle("uiFloating", floating);
      syncFloatLanguage();
      if (floating){
        applyRect(getSavedRect(), false);
      } else {
        // 交還給貼底模式（initUIResize()）自己的 CSS/高度邏輯，這裡只要清掉浮動模式加的 inline 定位
        ui.style.left = "";
        ui.style.top = "";
        ui.style.width = "";
        let ratio = context.UI_HEIGHT_DEFAULT_RATIO;
        try { ratio = parseFloat(context.preferences.getItem("tuttingUIHeightRatio")) || context.UI_HEIGHT_DEFAULT_RATIO; } catch (e) {}
        ui.style.height = (window.innerHeight * ratio) + "px";
      }
      if (save){
        try { context.preferences.setItem("tuttingUIFloating", floating ? "1" : "0"); } catch (e) {}
      }
    }

    floatBtn.onclick = () => setFloating(!ui.classList.contains("uiFloating"), true);

    // ---- 拖曳移動 ----
    let dragging = false, dragStartX = 0, dragStartY = 0, dragStartLeft = 0, dragStartTop = 0;

    function onDragMove(e){
      if (!dragging) return;
      const r = ui.getBoundingClientRect();
      applyRect(clampRect(dragStartLeft + (e.clientX - dragStartX), dragStartTop + (e.clientY - dragStartY), r.width, r.height), false);
    }
    function onDragUp(){
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("uiFloatDragging");
      const r = ui.getBoundingClientRect();
      applyRect(clampRect(r.left, r.top, r.width, r.height), true);
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragUp);
    }
    dragHandle.addEventListener("pointerdown", (e) => {
      if (!ui.classList.contains("uiFloating")) return;
      dragging = true;
      dragStartX = e.clientX; dragStartY = e.clientY;
      const r = ui.getBoundingClientRect();
      dragStartLeft = r.left; dragStartTop = r.top;
      document.body.classList.add("uiFloatDragging");
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragUp);
      e.preventDefault();
    });
    dragHandle.addEventListener("dblclick", () => {
      if (!ui.classList.contains("uiFloating")) return;
      applyRect(getDefaultRect(), true);
    });

    // ---- 拖曳右下角縮放（同時調寬高） ----
    let resizing = false, rzStartX = 0, rzStartY = 0, rzStartW = 0, rzStartH = 0, rzLeft = 0, rzTop = 0;

    function onResizeMove(e){
      if (!resizing) return;
      applyRect(clampRect(rzLeft, rzTop, rzStartW + (e.clientX - rzStartX), rzStartH + (e.clientY - rzStartY)), false);
    }
    function onResizeUp(){
      if (!resizing) return;
      resizing = false;
      document.body.classList.remove("uiFloatResizing");
      const r = ui.getBoundingClientRect();
      applyRect(clampRect(r.left, r.top, r.width, r.height), true);
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
    }
    resizeHandle.addEventListener("pointerdown", (e) => {
      if (!ui.classList.contains("uiFloating")) return;
      resizing = true;
      rzStartX = e.clientX; rzStartY = e.clientY;
      const r = ui.getBoundingClientRect();
      rzStartW = r.width; rzStartH = r.height; rzLeft = r.left; rzTop = r.top;
      document.body.classList.add("uiFloatResizing");
      window.addEventListener("pointermove", onResizeMove);
      window.addEventListener("pointerup", onResizeUp);
      e.preventDefault();
      e.stopPropagation();
    });

    // 視窗尺寸改變時，若正在浮動模式要重新 clamp，避免面板被卡在畫面外看不到、抓不回來
    window.addEventListener("resize", () => {
      if (!ui.classList.contains("uiFloating")) return;
      const r = ui.getBoundingClientRect();
      applyRect(clampRect(r.left, r.top, r.width, r.height), true);
    });

    let floating = false;
    try { floating = context.preferences.getItem("tuttingUIFloating") === "1"; } catch (e) {}
    setFloating(floating, false);
  }

  function makeFloatablePanel(opts){
    const { contentEl, storageKey, title, defaultRect, minWidth = 240, minHeight = 160, onChange } = opts;
    const homeParent = contentEl.parentNode;
    const homeNextSibling = contentEl.nextSibling; // 記住原本插入點，收合時要精準插回原位，不能只 append 到最後

    const panel = document.createElement("div");
    panel.className = "floatablePanel";
    panel.style.display = "none";

    const header = document.createElement("div");
    header.className = "floatablePanelHeader";
    const grip = document.createElement("span");
    grip.className = "grip";
    const titleSpan = document.createElement("span");
    titleSpan.className = "floatablePanelTitle";
    titleSpan.dataset.i18n=title;
    titleSpan.textContent = t(title);
    const dockBtn = document.createElement("button");
    dockBtn.type = "button";
    dockBtn.className = "floatablePanelDockBtn";
    dockBtn.dataset.i18n="📌 收合回面板";
    dockBtn.textContent = t("📌 收合回面板");
    dockBtn.setAttribute("data-i18n-data-tooltip", "收合回原本的分頁");
    dockBtn.setAttribute("data-tooltip", t("收合回原本的分頁"));
    header.appendChild(grip);
    header.appendChild(titleSpan);
    header.appendChild(dockBtn);

    const body = document.createElement("div");
    body.className = "floatablePanelBody";

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "floatablePanelResizeHandle";
    resizeHandle.setAttribute("data-i18n-data-tooltip", "拖曳調整大小");
    resizeHandle.setAttribute("data-tooltip", t("拖曳調整大小"));

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(resizeHandle);
    document.body.appendChild(panel);

    function clampRect(left, top, width, height){
      const maxW = window.innerWidth - 8;
      const maxH = window.innerHeight - 8;
      width = Math.min(Math.max(width, minWidth), maxW);
      height = Math.min(Math.max(height, minHeight), maxH);
      left = Math.min(Math.max(left, 4), window.innerWidth - width - 4);
      top = Math.min(Math.max(top, 4), window.innerHeight - height - 4);
      return { left, top, width, height };
    }
    function applyRect(rect, save){
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      panel.style.width = rect.width + "px";
      panel.style.height = rect.height + "px";
      if (save){
        try { context.preferences.setItem(storageKey, JSON.stringify(rect)); } catch (e) {}
      }
    }
    function getDefaultRect(){
      return clampRect(defaultRect.left, defaultRect.top, defaultRect.width, defaultRect.height);
    }
    function getSavedRect(){
      let rect = null;
      try { rect = JSON.parse(context.preferences.getItem(storageKey)); } catch (e) {}
      if (!rect || typeof rect.left !== "number") return getDefaultRect();
      return clampRect(rect.left, rect.top, rect.width, rect.height);
    }

    let floating = false;
    function setFloating(on){
      floating = on;
      if (on){
        body.appendChild(contentEl); // contentEl 直接搬過來，事件監聽器/選取狀態都不受影響
        panel.style.display = "flex";
        applyRect(getSavedRect(), false);
      } else {
        panel.style.display = "none";
        if (homeNextSibling && homeNextSibling.parentNode === homeParent){
          homeParent.insertBefore(contentEl, homeNextSibling);
        } else {
          homeParent.appendChild(contentEl);
        }
      }
      try { context.preferences.setItem(storageKey + "_on", on ? "1" : "0"); } catch (e) {}
      if (typeof onChange === "function") onChange(on); // 不論從外部按鈕還是面板內的收合鈕觸發，都要同步通知外部狀態已改變
    }
    dockBtn.onclick = () => setFloating(false);

    // ---- 拖曳移動 ----
    let dragging = false, dsx = 0, dsy = 0, dsl = 0, dst = 0, dsw = 0, dsh = 0;
    function onDragMove(e){
      if (!dragging) return;
      // 寬高沿用拖曳開始那一刻量到的值，不要在每個 mousemove 都重新用 getBoundingClientRect() 量測——
      // 那樣量到的是含 border 的算後尺寸，若元素不是 border-box，每次搬過去當作新的 style.width/height
      // 會把 border 疊加進內容寬度，越拖越大；固定住寬高只改位置才是正確的拖曳行為。
      applyRect(clampRect(dsl + (e.clientX - dsx), dst + (e.clientY - dsy), dsw, dsh), false);
    }
    function onDragUp(){
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("uiFloatDragging");
      const r = panel.getBoundingClientRect();
      applyRect(clampRect(r.left, r.top, dsw, dsh), true);
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragUp);
    }
    header.addEventListener("pointerdown", (e) => {
      if (e.target === dockBtn) return;
      dragging = true;
      dsx = e.clientX; dsy = e.clientY;
      const r = panel.getBoundingClientRect();
      dsl = r.left; dst = r.top; dsw = r.width; dsh = r.height;
      document.body.classList.add("uiFloatDragging");
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragUp);
      e.preventDefault();
    });
    header.addEventListener("dblclick", (e) => {
      if (e.target === dockBtn) return;
      applyRect(getDefaultRect(), true);
    });

    // ---- 拖曳右下角縮放 ----
    let resizing = false, rsx = 0, rsy = 0, rsw = 0, rsh = 0, rl = 0, rt = 0;
    function onResizeMove(e){
      if (!resizing) return;
      applyRect(clampRect(rl, rt, rsw + (e.clientX - rsx), rsh + (e.clientY - rsy)), false);
    }
    function onResizeUp(){
      if (!resizing) return;
      resizing = false;
      document.body.classList.remove("uiFloatResizing");
      const r = panel.getBoundingClientRect();
      applyRect(clampRect(r.left, r.top, r.width, r.height), true);
      window.removeEventListener("pointermove", onResizeMove);
      window.removeEventListener("pointerup", onResizeUp);
    }
    resizeHandle.addEventListener("pointerdown", (e) => {
      resizing = true;
      rsx = e.clientX; rsy = e.clientY;
      const r = panel.getBoundingClientRect();
      rsw = r.width; rsh = r.height; rl = r.left; rt = r.top;
      document.body.classList.add("uiFloatResizing");
      window.addEventListener("pointermove", onResizeMove);
      window.addEventListener("pointerup", onResizeUp);
      e.preventDefault();
      e.stopPropagation();
    });

    // 視窗尺寸改變時重新 clamp，避免浮動視窗被卡在畫面外
    window.addEventListener("resize", () => {
      if (!floating) return;
      const r = panel.getBoundingClientRect();
      applyRect(clampRect(r.left, r.top, r.width, r.height), true);
    });

    return {
      toggle(on){ setFloating(on === undefined ? !floating : on); },
      isFloating(){ return floating; }
    };
  }

  function initFingerFloatPanel(){
    const grid = document.querySelector("#tabFingers .fingerHandGrid");
    const btn = document.getElementById("fingerFloatBtn");
    if (!grid || !btn) return;

    const floatable = makeFloatablePanel({
      contentEl: grid,
      storageKey: "tuttingFingerFloatRect",
      title: "✋ 手指 FK／IK",
      defaultRect: { left: Math.max(4, window.innerWidth - 400), top: 90, width: 360, height: 440 },
      minWidth: 260,
      minHeight: 220,
      onChange: () => syncLabel(), // 不管是點頁籤上的按鈕還是浮動視窗內的「收合回面板」，都要同步更新頁籤按鈕文字
    });

    function syncLabel(){
      const on = floatable.isFloating();
      btn.textContent = t(on ? "📌 收合回面板" : "🗗 浮動視窗");
      btn.setAttribute("data-tooltip", t(on
        ? "收合回「手指」分頁裡"
        : "彈出成獨立的浮動視窗，可拖曳移動、拖右下角調整大小，編輯手指時不用被主面板卡住"));
    }
    btn.onclick = () => { floatable.toggle(); };

    let restoreFloating = false;
    try { restoreFloating = context.preferences.getItem("tuttingFingerFloatRect_on") === "1"; } catch (e) {}
    if (restoreFloating) floatable.toggle(true);
    onLanguageChange(syncLabel);
    syncLabel();
  }
  return { initUIResize, initUIFloat, makeFloatablePanel, initFingerFloatPanel };
}
