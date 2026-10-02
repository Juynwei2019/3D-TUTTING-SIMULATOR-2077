const CURRENT_LIB_SCHEMA_VERSION = 1;
const LIB_MIGRATIONS = {};

export function createLibraryStore({ getStorage, getKeys, downloadJSON, alert, onUsageChange = () => {}, warn = console.warn }){
  function migrateLibraryItems(fromVersion, items){
    let v = fromVersion;
    let out = items;
    while (v < CURRENT_LIB_SCHEMA_VERSION){
      const step = LIB_MIGRATIONS[v];
      if (typeof step === "function") out = step(out);
      v++;
    }
    return out;
  }
  function loadLibraryFromStorage(key){
    try {
      const raw = getStorage().getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)){
        // legacy 格式（無版本號的純陣列）：視為版本 1，跑一次遷移（目前版本=1所以不會做任何事，
        // 但保留這個分支是為了未來版本升級時舊資料仍然讀得到）。
        return migrateLibraryItems(1, parsed);
      }
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)){
        const fromV = Number.isFinite(parsed.v) ? parsed.v : 1;
        return migrateLibraryItems(fromV, parsed.items);
      }
      return [];
    } catch (e){
      warn("讀取資料庫失敗，可能是儲存內容毀損：", key, e);
      return [];
    }
  }
  function estimateKeyBytes(key){
    const raw = getStorage().getItem(key);
    return raw ? raw.length * 2 : 0;
  }
  function getTotalLibraryStorageBytes(){
    return getKeys().reduce((sum, k) => sum + estimateKeyBytes(k), 0);
  }
  function saveLibraryToStorage(key, arr){
    const payload = JSON.stringify({ v: CURRENT_LIB_SCHEMA_VERSION, items: arr });
    try {
      getStorage().setItem(key, payload);
      onUsageChange();
      return true;
    } catch (e){
      warn("儲存庫寫入 localStorage 失敗：", e);
      // 寫入失敗時（通常是空間已滿）：記憶體裡的 items 其實還在（呼叫端還沒重整頁面），
      // 立刻自動幫使用者匯出一份 JSON 備份，避免這次的異動在重新整理後直接消失。
      try {
        downloadJSON(arr, "招式庫備份_寫入失敗_" + Date.now() + ".json");
        alert("儲存空間已滿，這次的變更無法存進瀏覽器！\n已自動幫你匯出一份 JSON 備份到下載資料夾，請先用「匯出全部」清出一些舊招式（例如刪除不需要的、或匯出後在別的裝置匯入），再繼續使用。");
      } catch (e2){
        alert("儲存失敗（瀏覽器儲存空間可能已滿），且自動備份也失敗了：" + e.message + "\n建議立即手動使用「匯出全部」把目前看得到的內容存下來。");
      }
      onUsageChange();
      return false;
    }
  }
  return { migrateLibraryItems, loadLibraryFromStorage, estimateKeyBytes, getTotalLibraryStorageBytes, saveLibraryToStorage };
}
