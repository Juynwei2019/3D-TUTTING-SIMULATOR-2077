import { t as tr } from "../i18n/index.js";
import { PROJECT_SCHEMA_VERSION } from "./project-format.js";

export function createProjectFiles({ getKeyframes, snapshotTimelineData, downloadJSON, readJSONFile, restoreTimelineData, pushHistory, scheduleAutoSave, alert, confirm }){
  function exportTimeline(){
    if (getKeyframes().length === 0){
      alert(tr("目前時間軸是空的，沒有可匯出的拍點。"));
      return;
    }
    const data = snapshotTimelineData();
    downloadJSON(data, "tutting編舞_" + Date.now() + ".json");
  }
  function importTimelineFromFile(file){
    readJSONFile(file, (data) => {
      if (!data || typeof data !== "object" || !Array.isArray(data.keyframes)){
        alert(tr("匯入失敗：這個檔案不是有效的「編舞時間軸」JSON（缺少 keyframes 陣列）。"));
        return;
      }
      if (data.schemaVersion !== PROJECT_SCHEMA_VERSION){
        alert(tr("匯入失敗：檔案版本（schemaVersion）不符，可能是舊版或不相容的檔案。"));
        return;
      }
      if (data.keyframes.length === 0){
        alert(tr("這個檔案裡的時間軸是空的，沒有可匯入的拍點。"));
        return;
      }
      const ok = confirm(
        tr("即將匯入 {p0} 個拍點，這會覆蓋目前時間軸上的全部內容（含拍點與軌跡控制點），此動作無法復原（可用 Ctrl+Z 復原）。確定要匯入嗎？", {p0:data.keyframes.length})
      );
      if (!ok) return;
      restoreTimelineData(data);
      pushHistory();
      scheduleAutoSave();
    });
  }
  return { exportFile: exportTimeline, importFile: importTimelineFromFile };
}
