# 模組拆分：姿勢與時間軸

目前已將展示介面、可獨立驗證的運算／功能，以及姿勢角度狀態移出原始單檔。尚未搬出的時間軸編輯介面、UI 綁定、持久化與跨功能調度仍在 `src/main.js`。

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
| `src/pose/pose-controller.js` | 私有的 `target`／`current`、姿勢設定／還原、FK 更新、骨骼角度同步；不依賴 DOM、播放或存檔 |
| `src/timeline/data.js` | 拍點插入、深拷貝複製、重排與選取索引調整、拍數及段落定位；不依賴 DOM |
| `src/timeline/playback.js` | 播放跨段、循環、範圍循環與 Wave 分流；透過 adapter 取得即時狀態及呼叫姿勢／律動／音訊同步 |
| `src/motion/trajectory.js` | 開放／封閉折線與 Catmull-Rom 路徑取樣 |
| `src/motion/groove-wave.js` | 律動波形計算、合法波形檢查與標籤 |
| `src/motion/tutting-generator.js` | 固定種子的姿勢候選生成、設定清理與去重；不修改應用姿勢 |
| `src/interaction/grab-shapes.js` | 扶握形狀、幾何建構與表面投影 |
| `src/interaction/grab-core.js` | 扶握狀態與控制環；以 `deps` 注入模型、手部骨骼和 IK 操作 |
| `src/timeline/audio-controller.js` | 音訊 object URL 所有權、匯入／移除、試聽／暫停與 beat／秒換算；注入 media element 與即時 BPM／offset |
| `src/ui/timeline-editor.js` | POSE 拍點 DOM、拖曳／縮放／複製／選取事件及播放高亮；資料操作由 host 回呼執行 |
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

1. 分別封裝四肢／手指 IK、LookAt、碰撞與律動的執行狀態，繼續由同一個動畫循環調度。
2. 繼續拆分時間軸編輯介面、音訊與持久化，逐步集中拍點狀態的所有寫入。
3. 明確定義 Undo 快照、專案存檔與 UI 偏好的不同欄位，再抽出持久化。每一階段都重跑瀏覽器回歸。

## 姿勢控制器的使用契約

`createPoseController()` 注入關節清單、骨骼／rest pose 的 getter，以及限制函式。非同步模型載入後，getter 會取得當前骨架；控制器不保存載入前的空骨架參照。

| 方法 | 語意 |
| --- | --- |
| `setTarget(key, angles)`／`applyPose(pose)` | 套用關節限制，更新 target 與 current；部分姿勢保留未提供的關節 |
| `reset(preset)` | 全部角度歸零後套用部分預設姿勢；保留原程式的限制行為 |
| `getTarget(key)`／`getCurrent(key)` | 回傳角度副本，呼叫端不能修改內部狀態 |
| `snapshotTarget()`／`snapshotState()` | 產生獨立的角度快照；不包含身體位移、時間軸或 UI 狀態 |
| `restoreTarget(pose)` | 完整還原目標姿勢，缺少關節歸零，預設套用當前限制；候選提交可指定 `clamp: false` |
| `setJointState(key, target, current)`／`restoreState(state)` | 精確還原已求解或暫存的角度，不套用限制，保留 target/current 差異 |
| `syncFromBone(key, options)` | 相對 rest pose 反算角度；拖曳提交使用 `clamp: true`，IK 保留十分之一度，Wave 使用 `round: false` |
| `applyTargetsToBones()` | 在鏡像／對稱運算前，讓骨骼反映目標姿勢，不改動 current |
| `updateBones({ draggingKey, drivenKeys })` | 保留原 FK 插值與收斂判斷，跳過拖曳或 IK 接管的關節 |

停止預覽、角色整體位移／旋轉、UI 更新、歷史紀錄與存檔仍由主程式調度。控制器不自動取消 Wave 或 Tutting，也不啟動自己的動畫循環。

重構前後回歸另外比對 JSON 姿勢套用、鏡像／對稱、Tutting 預覽與提交、Wave 停止還原，以及既有播放／存檔流程。

單檔發行版由 `scripts/build.mjs` 產生，不維護第二份手寫應用程式。

## 時間軸模組的使用契約

資料模組操作呼叫端擁有的拍點陣列。插入、複製與重排回傳新選取索引，無效複製／重排回傳 `null`；複製保留 JSON 可序列化的角度、身體、備註、軌跡與 Wave 烘焙欄位並深拷貝。主程式負責重繪與自動存檔。`totalKeyframeBeats()` 保留原本單一姿勢回傳 1 的語意；Beat Grid 的實際轉場總長仍由原函式計算。

`createTimelinePlayback(adapter).update(now)` 使用既有動畫循環的時間，不建立第二個循環。Adapter 的 getter 每次取得當前拍點、BPM、播放時鐘及循環狀態，因此匯入、Undo 或生成編舞替換陣列後不會讀到舊資料。播放器透過 setter 更新段落索引、起始時間與蹲彈錨點；音訊、UI、開始／停止與尋位的同步仍由主程式負責。

跨段先推進時鐘，再統一套用姿勢與律動；非循環結束時定格最後姿勢，範圍循環優先於整段循環，Wave 軌仍使用原有播放路徑。資料格式、JSON 版本與音訊同步方式保持相容。這一階段尚未將所有拍點寫入集中到私有 store，批次編輯與生成器仍由主程式持有狀態。

## 音訊與拍點介面

`createTimelineAudio()` 不查詢 DOM。主程式注入 media element、當前 BPM／offset；控制器擁有自己建立的 object URL，替換或移除時釋放，保留試聽獨立於拍點播放的行為。媒體事件仍驅動按鈕文字及 playhead。音訊檔不寫入 JSON、Undo 或 localStorage。波形解碼、快取、繪圖與尋位同步仍留在主程式，後續可單獨抽出。

`createTimelineEditor(adapter).render()` 產生既有 POSE 拍點介面；`updateHighlight()` 僅更新既有節點的播放 class，不逐幀重建 DOM。Adapter getter 讀取即時拍點、選取、播放、縮放狀態；事件回呼將修改委派給 host。原有 DOM ID、樣式 class、End Marker、備註、Easing、軌跡標籤及多選手勢保持一致。此模組涵蓋 POSE 拍點清單，GROOVE／WAVING 編輯與工具列仍在主程式。

瀏覽器回歸新增實際 WAV 匯入、Web Audio 波形解碼、試聽／暫停、拍點播放後音訊暫停、移除，以及拍點複製與刪除。音訊單元測試另外驗證 URL 釋放、即時 BPM／offset 換算與播放拒絕處理。
