export function createLibraryController(opts, dependencies){
  const { loadLibraryFromStorage, saveLibraryToStorage, renderLibList, pushHistory, downloadJSON, sanitizeFilename, makeLibId, readJSONFile, alert, confirm, prompt, document = globalThis.document } = dependencies;
  // opts: { storageKey, captureFn, applyFn, listElId, emptyElId, filePrefix, itemLabel, subtitleFn?, extraDeleteWarning? }
  // extraDeleteWarning(item)：可選，回傳一段字串就會附加在刪除確認對話框裡（例如提醒這個項目正被別處引用）；不提供或回傳空值則維持原本的確認文字。
  let items = loadLibraryFromStorage(opts.storageKey);
  let filterText = "";

  // 空狀態提示文字：趁 controller 剛建立、DOM 還是 HTML 原始樣子時就先存起來，之後
  // renderLibList 顯示空狀態一律用這份文字重新建立節點，不再依賴可能已經被清空、找不到的舊節點
  // （見 renderLibList 內的修正說明）。
  const emptyOrigEl = document.getElementById(opts.emptyElId);
  const emptyText = emptyOrigEl ? emptyOrigEl.textContent : "";

  function persist(){ saveLibraryToStorage(opts.storageKey, items); }

  function render(){
    const q = filterText.trim().toLowerCase();
    const filtered = q ? items.filter(it => it.name.toLowerCase().includes(q)) : items;

    if (filtered.length === 0 && items.length > 0){
      // 清單本身不是空的，只是搜尋沒有結果——顯示不同提示，不要跟「從來沒存過」的空狀態混在一起
      const host = document.getElementById(opts.listElId);
      host.innerHTML = "";
      const msg = document.createElement("span");
      msg.className = "libEmpty";
      msg.textContent = `沒有符合「${filterText.trim()}」的${opts.itemLabel}。`;
      host.appendChild(msg);
    } else {
      renderLibList(filtered, opts.listElId, opts.emptyElId, {
        apply: (item) => { opts.applyFn(item.data); pushHistory(); },
        del: (item) => {
          let msg = `刪除${opts.itemLabel}「${item.name}」？此動作無法復原。`;
          if (typeof opts.extraDeleteWarning === "function"){
            const extra = opts.extraDeleteWarning(item);
            if (extra) msg += "\n\n" + extra;
          }
          if (!confirm(msg)) return;
          items = items.filter(x => x.id !== item.id);
          persist(); render();
        },
        exportOne: (item) => downloadJSON(item, opts.filePrefix + "_" + sanitizeFilename(item.name) + ".json"),
        subtitle: opts.subtitleFn,
        rename: (item) => {
          const next = prompt(`重新命名「${item.name}」為：`, item.name);
          if (next === null) return; // 使用者取消
          const clean = next.trim();
          if (!clean){ alert("名稱不能是空的。"); return; }
          item.name = clean;
          persist(); render();
        }
      }, emptyText);
    }
    if (typeof opts.onRender === "function") opts.onRender(items.length);
  }

  function setFilter(text){ filterText = text || ""; render(); }

  function saveCurrent(name){
    const clean = (name || "").trim() || ("未命名" + opts.itemLabel);
    items.push({ id: makeLibId(), name: clean, savedAt: Date.now(), data: opts.captureFn() });
    persist(); render();
  }

  function exportAll(){
    if (items.length === 0){ alert(`${opts.itemLabel}庫目前是空的，沒有可匯出的內容。`); return; }
    downloadJSON(items, opts.filePrefix + "庫_全部_" + Date.now() + ".json");
  }

  function importOne(file){
    readJSONFile(file, (obj) => {
      if (!obj || typeof obj !== "object" || !obj.data || typeof obj.data !== "object"){
        alert("檔案格式錯誤：找不到有效的" + opts.itemLabel + "資料（需含 data 欄位）。"); return;
      }
      items.push({ id: makeLibId(), name: (obj.name || ("匯入" + opts.itemLabel)), savedAt: Date.now(), data: obj.data });
      persist(); render();
    });
  }

  function importAll(file){
    readJSONFile(file, (arr) => {
      if (!Array.isArray(arr)){ alert("檔案格式錯誤：整批匯入需要一個 JSON 陣列。"); return; }
      const cleaned = arr
        .filter(x => x && typeof x === "object" && x.data && typeof x.data === "object")
        .map(x => ({ id: makeLibId(), name: (x.name || ("匯入" + opts.itemLabel)), savedAt: Date.now(), data: x.data }));
      if (cleaned.length === 0){ alert("檔案內沒有找到任何有效項目。"); return; }
      const merge = confirm(`偵測到 ${cleaned.length} 筆${opts.itemLabel}。\n按「確定」＝合併進現有清單；按「取消」＝整批取代現有清單。`);
      items = merge ? items.concat(cleaned) : cleaned;
      persist(); render();
    });
  }

  function saveData(name, data){
    const clean = (name || "").trim() || ("未命名" + opts.itemLabel);
    items.push({ id: makeLibId(), name: clean, savedAt: Date.now(), data });
    persist(); render();
  }

  return { render, saveCurrent, saveData, exportAll, importOne, importAll, setFilter, getItems: () => items.slice() };
}
