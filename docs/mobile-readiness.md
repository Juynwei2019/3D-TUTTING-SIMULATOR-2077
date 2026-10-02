# 手機使用評估

本次完成模組拆分後的分析。第一批手機布局已實作；不需要改寫成原生 App，可先以 HTTPS 網站支援手機瀏覽器。現有 Three.js、Pointer Events、部分 media query 與單一動畫循環可延續使用。

## 原始布局評估（修改前）

使用 Chromium 的觸控／手機模擬、DPR 3，載入實際角色，測量 390×844 直向與 844×390 橫向。Three.js 與經 checksum 驗證的模型使用本地測試 fixture；這不驗證正式 CDN 可用性，也不代表 iPhone Safari 或實體手機 GPU 效能測試。

| 情境 | CSS layout viewport 寬 | 觀察 |
| --- | --- | --- |
| 原入口，390×844 | 980px | 未設 viewport meta，640px media query 不啟動；UI 位於被縮放的桌面版面 |
| 僅在測試回應加入 viewport meta，390×844 | 390px | media query 啟動，但 `innerWidth` 仍達 767px，存在水平溢出；UI 高約 764px，3D 區域所剩有限 |
| 原入口，844×390 | 980px | 仍以桌面 layout viewport 排版 |
| 僅加入 viewport meta，844×390 | 844px | 寬度正常，但面板仍占約 179px，需處理低高度布局 |

初始可見按鈕中，原入口有 20 個、加入 viewport 後有 27 個至少一邊小於 44 CSS px。數量只涵蓋當時可見控制項；其他分頁仍需逐一檢查。既有時間軸控制項多為 23～28px。

## 建議實作順序

| 優先 | 工作 | 主要位置與驗收 |
| --- | --- | --- |
| 1 | 手機 viewport 與布局 | `index.html` 加入 viewport；`styles/simulator.css` 處理窄寬、低高度、safe area、動態 viewport height 及水平溢出。直向面板改可收合底部抽屜，橫向保留較小側欄；常用控制項觸控區域至少 44px，保持 3D 可操作空間 |
| 2 | 觸控選取與編輯 | `scene/selection.js` 的 raycast 加入 pointer ID／多指狀態與 cancel 處理，雙指鏡頭操作結束不誤選关節；保留數字輸入作精確旋轉入口。`timeline/reorder.js` 的 HTML drag/drop 增加 Pointer Events 路徑或明確前移／後移按鈕；驗證排序、clip 調長、Range 與 scrub 和水平捲動不衝突 |
| 3 | 手機效能設定 | 主 renderer 的 DPR 目前上限 2，分割視窗上限 1.5。新增可選低畫質設定、降低手機預設 DPR、限制分割視窗數量；依量測決定是否降低幀率或輔助物顯示。切回前景時驗證播放時間及音訊同步 |
| 4 | 音訊、存檔與測試 | iOS Safari／Android Chrome 實機測試音訊匯入與首次播放、JSON 匯入匯出、下載與必要的分享 fallback、背景／回前景、自動存檔及方向切換；加入手機瀏覽器回歸。觸控模擬與實機測試分開報告 |
| 5 | HTTPS 發布與可選 PWA | 可使用 GitHub Pages 等靜態託管，核對子路徑資源及模型 URL。若需要離線，再將 Three.js／模型本地化並加入 manifest、service worker 與版本更新策略；目前單檔打包仍依賴外部資源 |

第一階段建議以「看得到模型、切換分頁、修改角度／IK、加拍點、播放、Undo／Redo、JSON 匯入匯出」作手機 MVP。生成器、复杂範圍編輯及多分割視窗可在基本觸控流程穩定後驗收。

## 與模組拆分的關係

布局與觸控可以集中修改 `ui/beat-grid.js`、`ui/timeline-toolbar.js`、`timeline/reorder.js`、`timeline/resize.js`，沿用既有資料、播放與儲存 controller。相機、三維互動及浮動面板已拆分至 scene／ui 模組，手機手勢可集中修改 `scene/selection.js`、`scene/transform-gizmos.js`，布局可從 `ui/floating-panels.js` 與樣式調整。

## 第一批：手機布局

已加入 viewport 與 viewport-fit=cover。窄螢幕（≤640px）使用 58dvh 底部面板，可收合為約 64px；觸控裝置的低高度橫向（≤960px、≤500px）使用右側 42vw 面板。CSS 覆寫手機上的桌面浮動尺寸，桌面浮動偏好仍保留。3D 畫布使用面板之外的可用空間，相機比例與 renderer 尺寸隨展開／收合、隱藏／顯示與方向切換同步更新；手機首次載入重新取景。面板狀態按鈕具有 aria-expanded；常駐操作列與分頁各自水平捲動，內容區獨立捲動。加入 safe-area 留白、動態 viewport 高度與常用控制項至少 44px 的尺寸；表單文字採 16px，避免 iOS 輸入聚焦時因小字自動放大。

測試指令：先執行 `npm run test:browser` 建立經 checksum 驗證的模型 fixture，再執行 `npm run test:mobile`。手機布局回歸使用 Chromium 觸控模擬、DPR 1，涵蓋 320×568、390×844、844×390，分別測試模組及打包入口：模型載入、所有分頁無頁面水平溢出、分頁觸控尺寸、拍點新增、收合／展開、隱藏／顯示與方向切換。CI 已加入此檢查，失敗截圖與訊息沿用診斷附件。

這批處理布局；多指誤選、時間軸觸控排序、手機效能設定、iOS 音訊與檔案實機驗證仍按後續批次處理。

本批本機驗證：63 項單元測試通過；六組手機尺寸／入口布局回歸通過。手機回歸另檢查 3D 區域不被展開面板覆蓋。此結果是 Chromium 模擬驗證，iOS Safari／Android Chrome 實機仍待驗證。
