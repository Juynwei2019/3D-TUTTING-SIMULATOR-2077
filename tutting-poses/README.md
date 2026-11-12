# Tutting Pose 資料夾

用來保存 Tutting 姿勢與相關預覽圖片。模擬器目前不會自動讀取這個資料夾，請依下方方式手動套用。

## 姿勢清單

| 姿勢 | 說明 | 檔案 |
| --- | --- | --- |
| 基礎直角框架 | 雙上臂側展、前臂向上，雙肘約 90° | [姿勢 JSON](basic-right-angle-frame.pose.json) · [預覽](basic-right-angle-frame.png) · [詳細說明](basic-right-angle-frame.md) |

## 保存單一姿勢

1. 在模擬器調整好姿勢。
2. 開啟「JSON」分頁，按「複製」取得目前姿勢的 JSON。
3. 將內容存成 UTF-8 的 `.pose.json` 檔案，放進本資料夾，例如 `chest-frame.pose.json`。
4. 如有預覽圖片，可使用相同名稱，例如 `chest-frame.png`。

保留模擬器產生的 JSON 結構：最外層為關節名稱，每個關節對應三個角度數值。不要另外包成 `pose` 或 `data` 欄位，也不要在 JSON 中加入註解。

## 讀取單一姿勢

開啟檔案、複製 JSON 內容，貼到模擬器的「JSON」分頁，再按「套用 JSON」。使用前建議先備份目前作品。

單一姿勢 JSON 保存關節角度，不包含身體整體位置／旋轉、鏡頭、IK 設定、場景外觀或時間軸。如果需要保存完整編舞專案，請在時間軸記錄姿勢並使用「⬇ 編舞」匯出，以 `.timeline.json` 命名；還原時使用時間軸的「⬆ 編舞」，不要貼進姿勢 JSON 面板。

## 命名建議

| 類型 | 命名範例 | 用途 |
| --- | --- | --- |
| 單一姿勢 | `chest-frame.pose.json` | JSON 面板套用 |
| 編舞專案 | `chest-frame.timeline.json` | 時間軸匯入 |
| 預覽圖片 | `chest-frame.png` | 辨識姿勢內容 |

以上只是命名示例，目前沒有這些檔案。建議使用簡短英文、小寫與連字號，方便分享檔案連結。資料夾內檔案推送至公開 GitHub 後會公開，參考來源與動作說明可另附同名 Markdown 文件。

[回到專案 README](../README.md) · [基礎操作手冊](../docs/guides/basic-user-manual.md)
