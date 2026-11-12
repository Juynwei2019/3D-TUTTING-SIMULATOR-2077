# Tutting Pose 資料夾

用來保存 Tutting 姿勢與相關預覽圖片。模擬器目前不會自動讀取這個資料夾，請依下方方式手動套用。

## 姿勢清單

| 姿勢 | 說明 | 檔案 |
| --- | --- | --- |
| 基礎直角框架 | 雙上臂側展、前臂向上，雙肘約 90° | [姿勢 JSON](basic-right-angle-frame.pose.json) · [預覽](basic-right-angle-frame.png) · [詳細說明](basic-right-angle-frame.md) |
| 雙層橫向框架 | 胸前兩條水平前臂反向排列，一高一低 | [姿勢 JSON](stacked-horizontal-frame.pose.json) · [預覽](stacked-horizontal-frame.png) · [詳細說明](stacked-horizontal-frame.md) |
| 低位直角框架 | 雙上臂向側面展開，兩前臂向下，形成低位直角框架。 | [姿勢 JSON](low-right-angle-frame.pose.json) · [正面](low-right-angle-frame.png) · [斜側](low-right-angle-frame-three-quarter.png) · [說明](low-right-angle-frame.md) |
| 左高右低框架 | 角色左前臂向上、右前臂向下，形成上下錯位的非對稱框架。 | [姿勢 JSON](left-high-right-low-frame.pose.json) · [正面](left-high-right-low-frame.png) · [斜側](left-high-right-low-frame-three-quarter.png) · [說明](left-high-right-low-frame.md) |
| 右高左低框架 | 角色右前臂向上、左前臂向下，可與左高右低框架交替練習。 | [姿勢 JSON](right-high-left-low-frame.pose.json) · [正面](right-high-left-low-frame.png) · [斜側](right-high-left-low-frame-three-quarter.png) · [說明](right-high-left-low-frame.md) |
| 掌指內收窗口 | 兩前臂向上，手指向中央延伸、掌面朝前，形成窗口形狀。 | [姿勢 JSON](inward-palm-window.pose.json) · [正面](inward-palm-window.png) · [斜側](inward-palm-window-three-quarter.png) · [說明](inward-palm-window.md) |
| 低位外展手掌 | 兩前臂向下，手指向兩側延伸、掌面朝前，練習低位手掌轉折。 | [姿勢 JSON](low-outward-palm-frame.pose.json) · [正面](low-outward-palm-frame.png) · [斜側](low-outward-palm-frame-three-quarter.png) · [說明](low-outward-palm-frame.md) |
| 反向雙層橫框 | 角色右前臂位於上層、左前臂位於下層，水平相向，對應既有雙層橫向框架的另一側配置。 | [姿勢 JSON](mirrored-horizontal-frame.pose.json) · [正面](mirrored-horizontal-frame.png) · [斜側](mirrored-horizontal-frame-three-quarter.png) · [說明](mirrored-horizontal-frame.md) |
| 胸前雙立柱 | 上臂向前延伸、前臂向上，雙手放在角色前方，形成較窄的雙立柱。 | [姿勢 JSON](forward-upright-columns.pose.json) · [正面](forward-upright-columns.png) · [斜側](forward-upright-columns-three-quarter.png) · [說明](forward-upright-columns.md) |
| 胸前雙下柱 | 上臂向前延伸、前臂向下，形成靠近胸前的雙下柱。 | [姿勢 JSON](forward-downward-columns.pose.json) · [正面](forward-downward-columns.png) · [斜側](forward-downward-columns-three-quarter.png) · [說明](forward-downward-columns.md) |

## 延伸姿勢預覽

| | |
| --- | --- |
| <a href="low-right-angle-frame.md"><img src="low-right-angle-frame.png" alt="低位直角框架" width="240"></a><br>低位直角框架 | <a href="left-high-right-low-frame.md"><img src="left-high-right-low-frame.png" alt="左高右低框架" width="240"></a><br>左高右低框架 |
| <a href="right-high-left-low-frame.md"><img src="right-high-left-low-frame.png" alt="右高左低框架" width="240"></a><br>右高左低框架 | <a href="inward-palm-window.md"><img src="inward-palm-window.png" alt="掌指內收窗口" width="240"></a><br>掌指內收窗口 |
| <a href="low-outward-palm-frame.md"><img src="low-outward-palm-frame.png" alt="低位外展手掌" width="240"></a><br>低位外展手掌 | <a href="mirrored-horizontal-frame.md"><img src="mirrored-horizontal-frame.png" alt="反向雙層橫框" width="240"></a><br>反向雙層橫框 |
| <a href="forward-upright-columns.md"><img src="forward-upright-columns.png" alt="胸前雙立柱" width="240"></a><br>胸前雙立柱 | <a href="forward-downward-columns.md"><img src="forward-downward-columns.png" alt="胸前雙下柱" width="240"></a><br>胸前雙下柱 |

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
