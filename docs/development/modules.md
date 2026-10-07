# 模組拆分與使用契約

分類：開發與修正 · [文件總覽](../README.md)

主要領域運算、時間軸、儲存、相機、三維互動、浮動面板與場景生命週期已拆成 factory／純函式模組。`src/main.js` 保留共享狀態、adapter、委派入口、場景還原協調及部分通用面板。

## 已建立的邊界

| 路徑 | 責任與依賴 |
| --- | --- |
| `index.html` | 介面標記、原有 DOM ID、Three.js import map、應用入口 |
| `styles/simulator.css` | 原有樣式 |
| `src/main.js` | 組裝、共享功能狀態、adapter、同名委派入口、场景還原及部分通用面板 |
| `src/rig/definitions.js` | 50 個關節、手指與四肢鏈、分組與朝向定義；依賴 Three.js |
| `src/rig/model-utils.js`、`find-bone.js` | 模型縮放貼地、骨骼搜尋 |
| `src/math/angles.js`、`quaternions.js` | 度／弧度、數值夾限、局部／世界旋轉轉換 |
| `src/math/easings.js` | 32 種緩動函式與選單分組，不依賴 DOM |
| `src/ik/two-bone.js`、`ccd.js` | 骨骼求解核心；只處理傳入的骨鏈／目標，不讀 UI 或播放開關 |
| `src/pose/joint-limits.js` | 每個 limiter 實例管理自己的暫存物件，透過 getter 取得當前限制 |
| `src/pose/pose-controller.js` | 私有的 `target`／`current`、姿勢設定／還原、FK 更新、骨骼角度同步；不依賴 DOM、播放或存檔 |
| `src/timeline/selection-clipboard.js` | POSE／GROOVE 多選、一般剪貼簿、複製／剪下／貼上／刪除與多選工具列 |
| `src/timeline/range-editor.js` | 範圍吸附、完整項目相交、獨立區段剪貼簿、重複／刪除／貼上與範圍循環設定 |
| `src/timeline/data.js` | 拍點插入、深拷貝複製、重排與選取索引調整、拍數及段落定位；不依賴 DOM |
| `src/timeline/playback.js` | 播放跨段、循環、範圍循環與 Wave 分流；透過 adapter 取得即時狀態及呼叫姿勢／律動／音訊同步 |
| `src/motion/trajectory.js` | 開放／封閉折線與 Catmull-Rom 路徑取樣 |
| `src/motion/groove-wave.js` | 律動波形計算、合法波形檢查與標籤 |
| `src/motion/tutting-generator.js` | 固定種子的姿勢候選生成、設定清理與去重；不修改應用姿勢 |
| `src/interaction/grab-shapes.js` | 扶握形狀、幾何建構與表面投影 |
| `src/interaction/grab-core.js` | 扶握狀態與控制環；以 `deps` 注入模型、手部骨骼和 IK 操作 |
| `src/storage/preferences.js`、`rig-preferences.js` | 共用偏好 storage 存取與關節限制／Isolation／碰撞半徑讀寫；保留原鍵名與合併規則 |
| `src/library/library-store.js` | 素材庫 v1 envelope、legacy 讀取、容量估算及儲存失敗備份 |
| `src/library/library-controller.js` | 四種素材庫共用的儲存、搜尋、套用、重新命名、刪除與匯入／匯出控制 |
| `src/ui/library-list.js` | 共用素材清單 DOM、空狀態與按鈕事件；操作由回呼委派 |
| `src/history/history-controller.js` | 私有 Undo／Redo 堆疊、50 筆上限、分支截斷、播放防護與還原重入保護 |
| `src/history/snapshot.js` | 分開產生歷史與專案快照，透過 getter 讀取當前狀態 |
| `src/storage/autosave.js` | 1500ms debounce、localStorage 讀寫、錯誤處理與取消排程 |
| `src/storage/project-format.js`、`project-file.js` | v1 格式常數、基本結構驗證、專案 JSON 匯入／匯出與確認流程 |
| `src/timeline/waveform.js` | 私有解碼音訊樣本、峰值取樣／快取、過期解碼取消與 AudioContext 釋放；不依賴 DOM |
| `src/ui/waveform-view.js` | Canvas 波形與拍點參考線；讀取即時 Beat Grid 比例與音訊範圍 |
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

`createTimelinePlayback(adapter).update(now)` 使用既有動畫循環的時間，不建立第二個循環。Adapter 的 getter 每次取得當前拍點、BPM、播放時鐘及循環狀態，因此匯入、Undo 或生成編舞替換陣列後不會讀到舊資料。播放器透過 setter 更新段落索引、起始時間與蹲彈錨點；音訊、UI、開始／停止與尋位的同步由 `timeline/transport.js` 協調。

跨段先推進時鐘，再統一套用姿勢與律動；非循環結束時定格最後姿勢，範圍循環優先於整段循環，Wave 軌仍使用原有播放路徑。資料格式、JSON 版本與音訊同步方式保持相容。這一階段尚未將所有拍點寫入集中到私有 store，批次編輯與生成器仍由主程式持有狀態。

## 音訊與拍點介面

`createTimelineAudio()` 不查詢 DOM。主程式注入 media element、當前 BPM／offset；控制器擁有自己建立的 object URL，替換或移除時釋放，保留試聽獨立於拍點播放的行為。媒體事件仍驅動按鈕文字及 playhead。音訊檔不寫入 JSON、Undo 或 localStorage。波形解碼、快取與繪圖已交由波形模組處理；尋位與媒體／時間軸同步由 `timeline/transport.js` 協調。

`createTimelineEditor(adapter).render()` 產生既有 POSE 拍點介面；`updateHighlight()` 僅更新既有節點的播放 class，不逐幀重建 DOM。Adapter getter 讀取即時拍點、選取、播放、縮放狀態；事件回呼將修改委派給 host。原有 DOM ID、樣式 class、End Marker、備註、Easing、軌跡標籤及多選手勢保持一致。此模組涵蓋 POSE 拍點清單，GROOVE／WAVING 編輯分別由 sequence／wave-track 模組處理，工具列由 `ui/timeline-toolbar.js` 綁定。

瀏覽器回歸新增實際 WAV 匯入、Web Audio 波形解碼、試聽／暫停、拍點播放後音訊暫停、移除，以及拍點複製與刪除。音訊單元測試另外驗證 URL 釋放、即時 BPM／offset 換算與播放拒絕處理。

## 波形解碼與繪圖

`createWaveform()` 私有保存解碼樣本、sample rate、duration 與峰值快取。`decode(file)` 回傳 `ready`／`error`／`stale`，主程式依結果更新載入／錯誤樣式；`clear()` 清除資料並使尚未完成的解碼失效；`invalidate()` 只清除快取，供 BPM 或 offset 變更使用。`peaksForRange(startSec, endSec, buckets)` 保留原有取樣與快取鍵語意。

每次匯入都有獨立的解碼世代：快速換歌或移除音樂時，舊解碼不覆寫最新資料，也不回頭更新載入樣式。AudioContext 在成功、失敗及過期時皆於 finally 關閉；清理期間發生替換也會回傳 stale。波形解碼失敗仍不阻止獨立的媒體播放。

`createWaveformView(waveform, adapter).draw()` 依同一套 Beat Grid 座標繪製：短音樂只佔有音訊的區段，拍點參考線與 POSE Track 對齊，Canvas backing width 上限維持 16384px，隱藏時不重畫。視圖不保存 BPM、拍點或縮放副本；每次 draw 透過 getter／回呼讀取當前資料。主程式保留 loading／error 樣式、媒體事件、拖曳尋位及重繪時機。

波形單元測試涵蓋正負峰值、補零、快取失效、失敗清理、解碼競態、短音訊比例、拍點對齊與 Canvas 尺寸上限；瀏覽器回歸繼續使用真實 WAV 驗證 Web Audio 解碼及播放。

## 歷史與專案儲存

`createHistory()` 擁有私有堆疊，保留 50 筆上限與編輯後截斷 Redo 分支。捕捉及還原資料皆複製，避免場景操作污染歷史；還原期間忽略 push，finally 保證即使還原拋錯仍解除重入保護。播放時 Undo／Redo 仍被阻擋。按鈕與快捷鍵留在主程式。

`createSnapshots()` 明確分開 `captureHistory()` 與 `captureProject()`。歷史維持原有欄位範圍，沒有擴張為完整場景快照；專案快照保留 schemaVersion 1、savedAt、軌跡與律動欄位，回傳獨立可序列化副本。音訊檔、素材庫及 UI 偏好仍不隨專案檔儲存。

`createAutosave()` 注入 storage、快照、計時器及成功／失敗回呼，保留 `tuttingAutosave_v1` 與 1500ms 延遲。讀取時忽略無效 JSON、不同版本及原規則不接受的空資料；足底固定啟用的空拍點存檔仍可還原。是否還原與取消後清除的確認介面仍由主程式負責。

`createProjectFiles()` 保留檔案驗證、覆蓋確認、匯入後記錄歷史及排程存檔的順序。`restoreSnapshot()` 與 `restoreTimelineData()` 暫留主程式：它們依序還原 Wave、LookAt、軌跡、骨架及 UI；後续拆分各功能 controller 時再逐步轉為模組回呼。

第一批涵蓋歷史、快照產生、自動存檔與專案檔案控制；偏好設定已拆出，場景還原協調尚待拆分。完整批次進度見 [refactor-roadmap.md](../planning/refactor-roadmap.md)。

## 偏好設定與素材庫

`createPreferences()` 集中偏好設定的 raw storage 入口，保留原有字串／JSON 編碼與鍵名。各面板繼續決定 fallback、警告及應用時機；`createRigPreferences()` 抽出關節限制、Isolation 與碰撞半徑的合併／讀寫規則，透過 getter 取得目前設定，避免匯入替換設定物件後保留舊參照。它們在原有啟動時機載入，未改變偏好與專案檔的界線。

`createLibraryStore()` 統一讀取 legacy 陣列與 `{ v: 1, items }` envelope、儲存及 UTF-16 用量估算。寫入失敗仍保留記憶體資料，呼叫既有 JSON 備份及提示流程。素材庫與專案存檔保持獨立。

`createLibraryController(opts, dependencies)` 保留各庫獨立的 items／filter；由 opts 注入姿勢、手勢、招式或律動的 capture／apply 函式。共用控制器處理搜尋、命名、套用後記錄歷史、刪除確認、單筆匯入及整批合併／取代。`renderLibraryList()` 建立原有 `.libChip` 介面及空狀態，保留 DOM ID 和按鈕行為。各庫的領域捕捉／套用與操作綁定已移至 `library/domain-controller.js`；儲存用量提示保留主程式入口。

測試新增偏好合併、舊庫讀取、版本化儲存、容量／備份與控制器操作；瀏覽器新增實際姿勢／手勢儲存、姿勢套用、欄位隔離與重載。

## 多選、剪貼簿與範圍編輯

`createTimelineSelection(adapter)` 保留一般選取與多選的優先規則、索引排序及深拷貝。POSE／GROOVE 共用複製操作，貼上的 GROOVE 重新產生 id，libId 保留；多選貼上後選中新增項目，剪下只記錄一次歷史，播放期間不允許剪下／貼上。剪貼簿只存在本次頁面，不使用系統 clipboard。

`createRangeEditor(adapter)` 保留另一份獨立區段剪貼簿。Range 以相交的完整 transition／clip 操作，不切割半段；複製 POSE transition 時包含最後 target frame，貼上位於相交項目之後，刪除保留最後 target frame。重複區段只記錄一次歷史；Range Loop 限制在可播放範圍內，並關閉整段 Loop。

兩個 controller 的 adapter getter／setter 讀寫目前共享的拍點、選取與 Range 狀態，因此 Undo／匯入替換陣列或選取集合後仍使用最新值。場景姿勢套用、重繪、歷史及存檔透過回呼協作。各 controller 包含既有工具列／HUD 更新，Ruler 拖曳與縮放由 `ui/beat-grid.js` 處理，排序與 clip 長度調整分別由 `timeline/reorder.js`、`timeline/resize.js` 處理。

新增單元測試驗證混合 POSE／GROOVE 複製、資料隔離、id 重建、取消／播放防護、邊界相交、範圍重複與刪除，以及循環互斥；瀏覽器實際執行多選貼上、區段重複與 Undo，再與重構前版本比對。

## IK、朝向、軌跡與碰撞 controller

| 模組 | 責任 |
| --- | --- |
| `ik/limb-controller.js` | 四肢 IK、Root Follow、肩胛輔助、雙手錨定、末端朝向、腳踝鎖定及四肢操作綁定 |
| `ik/spine-controller.js` | 脊椎 CCD、身體跟隨、目標與開關 |
| `ik/finger-controller.js` | 手指 CCD、目標、開關及手指面板 |
| `ik/foot-plant.js` | 地面校正、足底錨點、固定求解與快照還原 |
| `ik/pole-editor.js` | 極向球半徑、拖曳限制與可視化 |
| `ik/orientation-controller.js` | LookAt、手掌朝向／跟隨／範圍、LookAt 路徑與相關介面 |
| `ik/joint-ownership.js` | FK 排除與律動避讓關節集合 |
| `motion/trajectory-editor.js` | 控制點、形狀生成、軌跡取樣／轉拍點、播放覆寫及編輯介面 |
| `collision/hand-collision.js` | 膠囊投影、手對身體與雙手碰撞、鎖定手判斷 |
| `collision/collision-view.js` | 碰撞膠囊與手掌球顯示 |

controller 透過 host getter／setter 讀取共用角色、目標與模式狀態；可獨立擁有的暫存向量、四元數與骨鏈快取已移入 factory。骨架物件仍由主程式載入與建立，各功能仍由同一 animate() 調度，保留 IK、朝向、腳部、碰撞與再次求解的順序。主程式的同名函式為整合委派入口；這一階段沒有將所有跨功能狀態改成私有 store。

四肢設定面板仍包含原有共用開關，以後拆分介面時可再細分；朝向與軌跡的運算、狀態操作及相關事件已從主程式移出。

## Wave、律動與生成器

| 模組 | 責任 |
| --- | --- |
| `motion/definitions.js` | Wave／律動預设、路線、波形與生成器 archetype 定義 |
| `motion/wave-controller.js` | Wave 設定、傳遞、播放／還原、足部補償與烘焙 |
| `timeline/wave-track.js` | Wave clip 編輯、顯示與拍點播放 |
| `motion/groove-controller.js` | 律動參數、warmup、混合與姿勢疊加 |
| `motion/squat-controller.js` | 蹲彈位移、足部錨點與混合 |
| `motion/groove-generator.js` | 帶種子的律動設定生成 |
| `motion/tutting-controller.js` | Tutting 規則、生成、預覽、提交與快照 |
| `motion/random-pose.js` | Isolation 權重與隨機姿勢取樣 |
| `motion/choreography-generator.js` | 招式串接、編舞生成與自動招式 |
| `timeline/groove-sequence.js` | 律動段落編輯、片段查詢與素材庫連結 |
| `ui/groove-panel.js` | 律動、蹲彈及生成器介面 |

每個 factory 透過 host adapter 讀取目前設定及角色，沒有另建 RAF。停止預覽、快照還原、Wave 烘焙欄位及律動與 IK 的避讓規則維持原行為；局部運算暫存已移入 factory。

## 領域整合與剩餘時間軸介面

| 模組 | 責任 |
| --- | --- |
| `library/domain-controller.js` | 姿勢／手勢捕捉與套用、招式插入、律動設定清理與素材庫操作綁定 |
| `timeline/pose-editor.js` | 拍點新增、更新、複製、刪除、選取、標籤與 Easing／拍長修改 |
| `timeline/reorder.js` | POSE／GROOVE 單項及多項拖曳排序、插入位置與提示 |
| `timeline/resize.js` | Clip 長度調整、拍長限制、Snap 與局部版面更新 |
| `timeline/pose-interpolator.js` | 骨骼／角色插值、世界矩陣刷新及軌跡／Wave 覆寫 |
| `timeline/transport.js` | 開始／停止、播放更新、尋位、scrub 與音訊 playhead 協調 |
| `ui/beat-grid.js` | 共同拍格幾何、縮放、Range 手勢、導覽、播放游標與 loop ghost |
| `ui/timeline-inspector.js` | Easing 預覽、選取屬性、拍長與總長提示 |
| `ui/timeline-toolbar.js` | 播放／縮放／範圍／多選／匯入匯出／音訊工具及鍵盤綁定 |
| `scene/onion-skin.js` | 前後拍點 ghost 與編輯／播放顯示 |

保持原 DOM ID、事件順序、資料格式與播放防護。排序替換陣列與選取集合後，所有 adapter 立即讀取最新狀態；插值先刷新世界矩陣，再解軌跡，最後處理 Wave 足部覆寫。`main.js` 的同名函式僅委派給 controller，場景／历史還原協調與共用狀態仍待後續整理。

本批增加非連續群組排序、即時 Snap、軌跡前矩陣刷新、身體與手勢欄位隔離測試；合計 61 項單元測試通過。三版本瀏覽器回歸包含素材庫、Wave、Tutting、時間軸編輯、歷史、音訊、匯入匯出與自動存檔。

## 相機、三維互動與浮動面板

| 模組 | 責任 |
| --- | --- |
| `scene/camera-controller.js` | 角色／手部 bounds、適配寬高比的取景、預設視角及補間 |
| `scene/split-view.js` | 唯讀預覽視窗建立、尺寸調整、狀態儲存、取景更新與 renderer 清理 |
| `scene/selection.js` | 可選物件集合、raycast、關節／角色選取、取消與選取提示 |
| `scene/transform-gizmos.js` | 旋轉／平移控制環建立與拖曳事件；鏡頭操作互斥、腳部鎖存及目標補償 |
| `ui/floating-panels.js` | 主面板調高、浮動拖曳／縮放、可復用浮動面板與手指視窗 |
| `ui/workspace-panels.js` | 顯示設定收合、分頁及工作區可見性 |

相機、角色與 renderer 仍由 host 持有，factory 的 getter／setter 讀寫即時參照。事件註冊維持原初始化時機；拖曳結束的選取抑制、歷史／自動存檔與腳掌鎖存順序保持不變。分割預覽仍使用獨立 renderer 與 camera，不增加自己的 RAF。

## 場景初始化與動畫循環

| 模組 | 責任 |
| --- | --- |
| `scene/bootstrap.js` | 場景／主 renderer／OrbitControls 初始化、燈光、模型非同步載入與載入後功能組裝 |
| `scene/rig-visuals.js` | 關節球、角色選取標記、骨架線與顯示／高亮更新 |
| `scene/performance-panel.js` | RAF／render 計時、效能指標與面板更新 |
| `scene/animation-loop.js` | 單一 RAF 調度、相機收斂、活躍狀態判斷、閒置渲染降頻及求解／渲染順序 |

所有 adapter 建立後才呼叫 bootstrap；動畫仍從原載入流程啟動。每幀先處理路徑與 FK／IK 或時間軸播放，再處理 Wave、足底、碰撞及必要的再次朝向／手指求解，最後更新顯示、相機與主／分割 renderer。閒置仍只略過後半段重運算與渲染，FK／IK 與相機收斂持續更新，播放可立即恢復渲染。這次沒有變更效能參數或手機手勢。

新增單元測試驗證水平／垂直取景、相機補間完成、每次回呼只排程一次 RAF、求解順序、閒置節流與播放喚醒。瀏覽器回歸增加實際視角切換與浮動面板拖曳，並繼續檢查三版本姿勢／拍點／骨骼結果一致。總計 63 項單元測試。

## 手機布局

`ui/mobile-layout.js` 管理手機面板展開／收合、aria-expanded 與可用 3D 區域，透過回呼更新 renderer 尺寸及首次取景。布局切換使用 CSS media query，窄螢幕為底部抽屜，觸控低高度橫向為右側面板；CSS 覆寫手機上的浮動尺寸，保留桌面偏好。`scene/split-view.js` 的 `onResize()` 依 `canvasHolder` 實際尺寸更新主 renderer／相機，桌面容器仍覆蓋全畫面。

`test:mobile` 使用三種手機尺寸與兩個入口，驗證 viewport、頁面溢出、3D 區域、所有分頁、44px 分頁按鈕、拍點新增、面板狀態与方向切換；沿用 checksum 驗證的模型 fixture。多指選取、觸控排序與手機效能是後續工作。

## 觸控手勢與時間軸編輯

`interaction/pointer-tap.js` 是不依賴 DOM 的點選手勢狀態機；`scene/selection.js` 結合 window 的 pointer 結束／取消與失焦事件，避免多指及拖曳後誤選。`interaction/gizmo-touch.js` 處理控制環取消及雙指操作的停用／恢復，不使用 Three.js 私有 API。

`ui/touch-timeline.js` 綁定觸控工具列與拖曳編輯模式；`timeline/reorder.js` 的 `stepTimelineSelection()` 使用既有排序及 history callback。resize／Range／scrub／Wave 編輯均限制 pointer ID，並處理取消。觸控裝置預設保留捲動，開啟編輯模式才使用專用拖曳區域；桌面滑鼠路徑不需此開關。

## FingerTut 胸前編輯模式

`src/fingertut/controller.js` 負責胸部座標基準、一次性雙臂擺位、模型手掌方向校正、雙手取景與模式介面。直接複用兩節 IK 的數學，但結果同步至 FK target/current，不增加動畫循環，也不持續鎖定手掌。

主程式 adapter 協調停止播放／Wave／律動預覽、解除手臂與手指 IK／手掌朝向、保存及還原 IK 目標與鏡頭。歷史快照擴充 `fingerTut` 工作區狀態；匯入專案清除本次模式與還原點。工作區模式不寫入專案格式，姿勢成果使用既有拍點／手勢庫保存。扶握箱接管雙手時，需先解除扶握，以免破壞既有扶握關係。

模式進入、位置調整、退出、還原均記錄前後狀態；同值滑桿事件不重複記錄。還原原先啟用的 IK 後，既有求解器恢復執行。

只有跨越 FingerTut 操作版本的 Undo／Redo 才還原該工作區的 IK 與鏡頭；一般姿勢／時間軸 Undo 保留使用者目前鏡頭與扶握關係。

手掌朝向數學位於 `src/fingertut/orientation.js`：模型掌面校正、胸部座標預設、鏡像角度及固定鏡頭方向。Controller 分別保存左右手朝向，方向編輯只更新所選手腕，位置重排重用已保存朝向；工作區歷史快照向後相容缺少朝向的舊狀態。

## 語言切換

`i18n/index.js` 提供偏好容錯、翻譯與即時訂閱，`i18n/messages.js` 、`i18n/batch2-messages.js` 與 `i18n/batch3-messages.js` 管理前三批對照，`i18n/joint-labels.js` 產生顯示用名稱。DOM 只更新有標記的文字與屬性；FingerTut、選取提示、手機與浮動面板更新動態文字；時間軸、資料庫、IK／朝向、Wave、律動、生成器、JSON、扶握、軌跡、關節面板及 Easing 圖鑑使用 `liveText`／`liveAttribute` 保存既有節點的純文字更新函式。斷開的節點以 WeakMap 管理，不在語言切換時重建輸入與事件，領域資料與專案 schema 保持不變。`jointSearchText` 提供與目前語言無關的雙語名稱搜尋；已遷移的 Tooltip 只更新文字與可讀名稱，不重新加入原生 title。範圍與驗證見 [language-switching.md](../features/language-switching.md)。
