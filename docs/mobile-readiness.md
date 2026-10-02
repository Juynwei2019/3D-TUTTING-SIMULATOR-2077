# 手機使用評估

本次完成模組拆分後的分析。手機版功能尚未實作；不需要改寫成原生 App，可先以 HTTPS 網站支援手機瀏覽器。現有 Three.js、Pointer Events、部分 media query 與單一動畫循環可延續使用。

## 實測與限制

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
| 2 | 觸控選取與編輯 | `main.js` 的 raycast 加入 pointer ID／多指狀態與 cancel 處理，雙指鏡頭操作結束不誤選关節；保留數字輸入作精確旋轉入口。`timeline/reorder.js` 的 HTML drag/drop 增加 Pointer Events 路徑或明確前移／後移按鈕；驗證排序、clip 調長、Range 與 scrub 和水平捲動不衝突 |
| 3 | 手機效能設定 | 主 renderer 的 DPR 目前上限 2，分割視窗上限 1.5。新增可選低畫質設定、降低手機預設 DPR、限制分割視窗數量；依量測決定是否降低幀率或輔助物顯示。切回前景時驗證播放時間及音訊同步 |
| 4 | 音訊、存檔與測試 | iOS Safari／Android Chrome 實機測試音訊匯入與首次播放、JSON 匯入匯出、下載與必要的分享 fallback、背景／回前景、自動存檔及方向切換；加入手機瀏覽器回歸。觸控模擬與實機測試分開報告 |
| 5 | HTTPS 發布與可選 PWA | 可使用 GitHub Pages 等靜態託管，核對子路徑資源及模型 URL。若需要離線，再將 Three.js／模型本地化並加入 manifest、service worker 與版本更新策略；目前單檔打包仍依賴外部資源 |

第一階段建議以「看得到模型、切換分頁、修改角度／IK、加拍點、播放、Undo／Redo、JSON 匯入匯出」作手機 MVP。生成器、复杂範圍編輯及多分割視窗可在基本觸控流程穩定後驗收。

## 與模組拆分的關係

布局與觸控可以集中修改 `ui/beat-grid.js`、`ui/timeline-toolbar.js`、`timeline/reorder.js`、`timeline/resize.js`，沿用既有資料、播放與儲存 controller。相機、三維互動及浮動面板尚待拆分，接下來抽出這些模組可讓手機手勢及布局調整更容易驗證。
