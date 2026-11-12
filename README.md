# 3D Tutting 模擬器 2077

以 Three.js 製作的人體姿勢與編舞工具，支援手臂／手指編輯、時間軸播放、可控姿勢生成，以及場景與人偶外觀調整。開發版本使用原生 ES Modules。

[開啟線上模擬器](https://juynwei2019.github.io/3D-TUTTING-SIMULATOR-2077/) · [基礎圖文操作手冊](docs/guides/basic-user-manual.md) · [文件總覽](docs/README.md)

## 專案用途聲明

本專案僅供個人學習、研究與技術交流使用，目前無商業用途，亦未藉由本專案獲取商業利益。

本專案使用的第三方函式庫、模型與素材，其權利歸各自權利人所有，並依各自授權條款使用。

## 主要功能

| 功能 | 內容 |
| --- | --- |
| 姿勢與編舞 | 關節角度、IK、姿勢／手勢庫、時間軸、節拍與 Easing、Undo／Redo、專案匯入／匯出及自動存檔 |
| FingerTut | 雙手胸前擺位、手指編輯、手掌朝向與角度微調 |
| 扶握箱 | 雙手扶握、掌面貼合、形狀與尺寸調整，以及時間軸整合 |
| Tutting 生成器 | 指定活動關節與角度、seed 重現、候選預覽；TG-2.1 支援平面、平行／垂直規則及逐條誤差 |
| 場景與畫質 | 背景顏色、網格、霧效、基本燈光、三種場景預設與裝置清晰度 |
| 人偶顏色與材質 | 全身統一配色、霧面／亮面塑膠／金屬／自訂材質、粗糙度與金屬感、原始材質還原 |
| 操作與顯示 | 繁中／英文、手機布局與觸控、分割視窗、浮動面板及骨架輔助顯示 |

## 場景與人偶外觀

開啟「場景與畫質」分頁：

1. 選擇原始風格、中性練習或明亮背景，或自行調整背景、網格、霧效與燈光。
2. 在「人偶顏色與材質」選擇顏色與材質；粗糙度越高越霧面，金屬感範圍為 0～1。
3. 按「恢復原始人偶」還原模型材質與貼圖，保留背景及燈光；「恢復原始外觀」會重設整個專案外觀。
4. 依裝置選擇省電、標準或清晰解析度。

場景與人偶外觀隨專案保存，支援 Undo／Redo；尚未建立拍點時，也可匯出外觀專案。清晰度是瀏覽器的裝置偏好，不隨專案或 Undo／Redo 改變。

切換場景預設會保留人偶設定。自訂人偶材質不修改原始材質、骨架或洋蔥皮；目前採全身統一配色，尚未提供部位分色、貼圖上傳或逐拍外觀動畫。金屬效果受燈光影響，清晰度不保證固定 FPS。

完整操作與保存方式見 [場景與畫質](docs/features/scene-appearance.md)。

## 使用手冊

完整文章已按主題整理，請見 [文件分類總覽](docs/README.md)。

第一次使用請從 [基礎圖文操作手冊](docs/guides/basic-user-manual.md) 開始，內含實際介面截圖、FingerTut、手掌／手指編輯、三姿勢播放練習、備份與手機操作。

扶握箱的形狀尺寸、雙手接觸與移動／旋轉操作見 [扶握箱模式](docs/features/grab-box-mode.md)。

## 語言切換

主面板頂部可切換繁體中文／English，偏好會自動記憶。已涵蓋分頁、共用操作、FingerTut，以及時間軸、資料庫、IK／朝向、Wave、律動、生成器、JSON、扶握、軌跡、關節總覽／限制與 Easing 圖鑑，包含工具提示與程式錯誤訊息。詳見 [語言切換與驗證](docs/features/language-switching.md)。

## 開發

需要 Node.js 20 以上及 Python 3。

```sh
npm ci
npm run dev
```

透過 HTTP 開啟 `index.html`。開發入口會載入 `src/main.js` 與 `styles/simulator.css`，請保留這些目錄的相對位置；不要直接用 `file://` 開啟開發版本。

Three.js 版本固定為 `0.160.0`。正常執行仍從 `unpkg.com` 載入 Three.js，從 `threejs.org` 載入 Xbot 模型，需要連線到這兩個網域。

## 輸出單檔 HTML

```sh
npm run build
```

產生 `dist/index.html`，將專案模組與 CSS 整合回一份 HTML，方便下載、分享或部署。Three.js 與模型仍使用原有遠端來源，因此這個輸出不是離線版。`dist/` 為產生檔，不提交至 Git。

## 驗證

```sh
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
CHROMIUM_PATH=/usr/bin/chromium npm run test:tutting
CHROMIUM_PATH=/usr/bin/chromium npm run test:mobile
```

`npm test` 驗證骨架定義、角度限制、四元數、IK、軌跡、緩動曲線、候選生成器、姿勢控制器與時間軸模組。姿勢測試涵蓋副本隔離、部分套用、限制、精確還原、骨骼同步及 FK／IK／拖曳的分工。時間軸測試涵蓋資料複製、選取索引、分數拍數、延遲跨拍、播放結束、整段／範圍循環與 Wave 分流。音訊控制器測試涵蓋 URL 釋放、試聽、時間換算與播放拒絕。波形測試涵蓋峰值、快取、過期解碼、資源清理、繪圖比例與拍點對齊。歷史／儲存測試涵蓋 Undo 分支與上限、還原重入、存檔排程與失敗、專案確認流程及快照格式。偏好／素材庫測試涵蓋設定合併、legacy 讀取、儲存備份與共用控制器操作。時間軸編輯測試另涵蓋混合多選、剪貼簿隔離、Range 相交、重複／刪除與循環互斥。

瀏覽器測試使用 Playwright Core，需要可用的 Chromium；以 `CHROMIUM_PATH` 指定執行檔。未指定時會使用 Playwright 預設的瀏覽器安裝位置。測試會自行啟動並關閉本機 HTTP 伺服器。

瀏覽器測試將 Three.js 網路請求對應到已安裝的同版本套件，將模型請求對應到官方 Three.js `r160` Xbot 模型。模型首次透過 Python 的 HTTPS 客戶端下載至 `.cache/Xbot.glb`，並驗證 SHA-256。可用 `XBOT_FIXTURE` 指定已有的同一份模型。此測試驗證程式功能，不代表正式 CDN 的連線已通過。

測試涵蓋模組版及單檔輸出的模型載入、分頁、手臂 IK、扶握、JSON 姿勢套用、鏡像／對稱、Tutting 預覽／提交、Wave 還原、Undo／Redo、姿勢／手勢庫儲存／套用／重載、時間軸多選貼上／Range 重複／Undo、拍點複製／刪除、播放、音訊匯入／波形解碼／試聽／暫停／移除、JSON 匯出／匯入、分割視窗與自動存檔重載。若有重構前的原版 HTML，可指定 `BASELINE_HTML`，一併比對初始姿勢、姿勢操作結果、關鍵影格與固定時間點的骨骼旋轉。

模組責任與後續拆分順序見 [模組拆分與使用契約](docs/development/modules.md)。

外觀與材質單元測試另涵蓋舊專案預設值、輸入清理、清晰度上限、只有外觀的專案匯入／匯出、原始材質／貼圖保護、材質複本重用及資源釋放。

## GitHub 自動驗證

每次推送、建立／更新 Pull Request，以及在 Actions 手動執行時，`Verify` 工作流程會在 Ubuntu 24.04 與 Node.js 22 上依序執行：

1. `npm ci` 安裝鎖定版本的依賴。
2. `npm test` 執行模組測試。
3. `npm run build` 產生單檔 HTML。
4. 安裝與 Playwright Core 版本一致的 Chromium 及系統依賴。
5. `npm run test:browser` 驗證模組版與單檔版。
6. `npm run test:tutting` 驗證 Tutting 幾何規則、候選、歷史與專案還原。
7. `npm run test:floating` 驗證浮動面板；`test:grab-timeline`、`test:grab-usability`、`test:grab-size` 驗證扶握箱時間軸、操作與尺寸動畫。
8. `npm run test:mobile` 驗證手機直向／橫向布局及觸控面板操作。
9. `npm run test:fingertut` 與 `npm run test:language` 驗證 FingerTut 與雙語操作；瀏覽器測試沿用桌面測試的模型快取。

在 GitHub 的 **Actions → Verify** 查看結果。瀏覽器測試失敗時，工作流程會上傳 `browser-failure-…` 診斷附件，保留 7 天，包含可取得的畫面截圖、Playwright trace、瀏覽器 console／請求錯誤及失敗訊息。若失敗發生在啟動瀏覽器之前，可能只有工作流程紀錄或失敗文字。

下載診斷附件後，可用以下指令開啟其中的 trace：

```sh
node node_modules/playwright-core/cli.js show-trace path/to/trace.zip
```

本機失敗紀錄也保存在 `test-results/`，不提交至 Git。每次檢查前可先清除舊紀錄，避免與新結果混淆。

自動驗證不會部署或合併程式碼。若要阻止未通過檢查的 Pull Request 合併，可另設定 `main` 的分支保護，要求 **Tests, build and browser regression** 檢查通過。

手機布局測試沿用桌面瀏覽器測試下載的 `.cache/Xbot.glb`，請先執行 `test:browser`。目前支援手機可收合底部／橫向側面板；已提供 POSE／GROOVE 前移／後移與拖曳編輯開關；實機音訊／效能仍待後續驗證，詳見 [手機評估](docs/planning/mobile-readiness.md)。

FingerTut：到「手指」分頁按「開啟 FingerTut」，自動將雙手擺到胸前、掌心朝下並切換雙手特寫。支援高度／距離／間距調整、左右手朝向預設與角度微調、Undo／Redo 與還原進入前姿勢。使用方式與測試截圖見 [FingerTut 模式](docs/features/fingertut-mode.md)。
