# 3D-TUTTING-SIMULATOR-2077

Three.js 人體姿勢與編舞工具。開發版本使用原生 ES Modules，保留既有介面、骨骼求解順序和存檔格式。

## 開發

需要 Node.js 20 以上及 Python 3。

```sh
npm ci
npm run dev
```

透過 HTTP 開啟 `tutting_3d_simulator_v22.html`。開發入口會載入 `src/main.js` 與 `styles/simulator.css`，請保留這些目錄的相對位置；不要直接用 `file://` 開啟開發版本。

Three.js 版本固定為 `0.160.0`。正常執行仍從 `unpkg.com` 載入 Three.js，從 `threejs.org` 載入 Xbot 模型，需要連線到這兩個網域。

## 輸出單檔 HTML

```sh
npm run build
```

產生 `dist/tutting_3d_simulator_v22.html`，將專案模組與 CSS 整合回一份 HTML，方便下載、分享或部署。Three.js 與模型仍使用原有遠端來源，因此這個輸出不是離線版。`dist/` 為產生檔，不提交至 Git。

## 驗證

```sh
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

`npm test` 驗證骨架定義、角度限制、四元數、IK、轨跡、緩動曲線與候選生成器。

瀏覽器測試使用 Playwright Core，需要可用的 Chromium；以 `CHROMIUM_PATH` 指定執行檔。未指定時會使用 Playwright 預設的瀏覽器安裝位置。測試會自行啟動並關閉本機 HTTP 伺服器。

瀏覽器測試將 Three.js 網路請求對應到已安裝的同版本套件，將模型請求對應到官方 Three.js `r160` Xbot 模型。模型首次透過 Python 的 HTTPS 客戶端下載至 `.cache/Xbot.glb`，並驗證 SHA-256。可用 `XBOT_FIXTURE` 指定已有的同一份模型。此測試驗證程式功能，不代表正式 CDN 的連線已通過。

測試涵蓋模組版及單檔輸出的模型載入、分頁、手臂 IK、扶握、Undo／Redo、時間軸播放、JSON 匯出／匯入、分割視窗與自動存檔重載。若有重構前的原版 HTML，可指定 `BASELINE_HTML`，一併比對初始姿勢、關鍵影格與固定時間點的骨骼旋轉。

模組責任與後續拆分順序見 [docs/modules.md](docs/modules.md)。
