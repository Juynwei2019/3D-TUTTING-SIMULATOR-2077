# 模組拆分：第一階段

此階段將展示介面與可獨立驗證的運算／功能移出原始單檔。尚未搬出的時間軸、UI 綁定、持久化與跨功能調度仍在 `src/main.js`，不宣稱已完成整個程式的模組化。

## 已建立的邊界

| 路徑 | 責任與依賴 |
| --- | --- |
| `index.html` | 介面標記、原有 DOM ID、Three.js import map、應用入口 |
| `styles/simulator.css` | 原有樣式 |
| `src/main.js` | 組裝、尚未拆出的功能狀態、模型初始化、既有 `animate()` 調度 |
| `src/rig/definitions.js` | 50 個關節、手指與四肢鏈、分組與朝向定義；依賴 Three.js |
| `src/rig/model-utils.js`、`find-bone.js` | 模型縮放貼地、骨骼搜尋 |
| `src/math/angles.js`、`quaternions.js` | 度／弧度、數值夾限、局部／世界旋轉轉換 |
| `src/math/easings.js` | 32 種緩動函式與選單分組，不依賴 DOM |
| `src/ik/two-bone.js`、`ccd.js` | 骨骼求解核心；只處理傳入的骨鏈／目標，不讀 UI 或播放開關 |
| `src/pose/joint-limits.js` | 每個 limiter 實例管理自己的暫存物件，透過 getter 取得當前限制 |
| `src/motion/trajectory.js` | 開放／封閉折線與 Catmull-Rom 路徑取樣 |
| `src/motion/groove-wave.js` | 律動波形計算、合法波形檢查與標籤 |
| `src/motion/tutting-generator.js` | 固定種子的姿勢候選生成、設定清理與去重；不修改應用姿勢 |
| `src/interaction/grab-shapes.js` | 扶握形狀、幾何建構與表面投影 |
| `src/interaction/grab-core.js` | 扶握狀態與控制環；以 `deps` 注入模型、手部骨骼和 IK 操作 |
| `src/ui/grab-panel.js` | 只透過核心方法／訂閱更新扶握面板，不 import Three.js |
| `src/ui/easing-gallery.js`、`tooltips.js` | 緩動預覽、圖鑑、Tooltip；不讀骨骼或時間軸狀態 |

## 保留的行為契約

- `init()` 在主模組所有宣告完成後呼叫一次。模型仍非同步載入，載入成功後才建立骨骼相關介面。
- `createJointLimiter(() => JOINT_LIMITS)` 每次讀取目前的限制物件，避免匯入／復原規則替換整份物件後仍使用舊參照。
- 扶握核心以 `getHandBone(limb)` 取得手掌骨骼，不再隱含依賴主模組的 `IK_CHAINS`。
- 脊椎 CCD 呼叫明確傳入目前可調的 `spineCCDDamping`；手指與碰撞求解保留自己的阻尼值。
- 三維求解器的暫存向量與四元數留在各模組內；外部傳入的目標位置與極向向量不被改写。
- 預覽／播放分支、`ikDrivenKeys`／`grooveBlockedKeys`、碰撞後再次求解朝向與手指的順序維持原樣。
- localStorage key、編舞 `schemaVersion: 1` 與既有匯入／復原流程保持相容。

## 下一階段

1. 建立姿勢服務，管理 `target`／`current` 及變更命令；將姿勢生成的 DOM 讀取留在 UI。
2. 分別封裝四肢／手指 IK、LookAt、碰撞與律動的執行狀態，繼續由同一個動畫循環調度。
3. 拆分時間軸資料操作、播放和音訊，透過明確方法協作，避免彼此修改模組的內部變數。
4. 明確定義 Undo 快照、專案存檔與 UI 偏好的不同欄位，再抽出持久化。每一階段都重跑瀏覽器回歸。

單檔發行版由 `scripts/build.mjs` 產生，不維護第二份手寫應用程式。
