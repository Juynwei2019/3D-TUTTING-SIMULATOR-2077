# 文件總覽

依閱讀目的分成四類。第一次使用，建議先閱讀基礎操作手冊，再依需要查看功能說明；開發者可從模組契約與拆分進度開始。

## 入門操作 · `guides/`

| 文章 | 內容 |
| --- | --- |
| [基礎圖文操作手冊](guides/basic-user-manual.md) | 開啟程式、畫面與鏡頭、手掌與手指、時間軸入門練習、備份及手機操作 |

## 功能說明 · `features/`

| 文章 | 內容 |
| --- | --- |
| [FingerTut 胸前編輯模式](features/fingertut-mode.md) | 胸前擺位、手掌朝向、介面與測試紀錄 |
| [扶握箱模式](features/grab-box-mode.md) | 形狀尺寸、雙手接觸、一鍵擺位、掌面貼合與儲存 |
| [扶握箱時間軸](features/grab-timeline.md) | 逐拍記錄、移動與旋轉、扶握與放手、播放規則及驗證 |
| [語言切換](features/language-switching.md) | 繁中／英文切換範圍、翻譯模組與三批驗證紀錄 |

## 開發與修正 · `development/`

| 文章 | 內容 |
| --- | --- |
| [模組拆分與使用契約](development/modules.md) | 模組責任、共享狀態、控制器及各領域的使用契約 |
| [扶握箱時間軸第二批實作與驗測報告](development/grab-timeline-usability-report.md) | 完整成果、模組分工、測試矩陣、實測圖片及限制 |
| [浮動面板排版修正](development/floating-panel-layout.md) | 問題原因、修正行為、操作說明與前後測試圖片 |

## 規劃與進度 · `planning/`

| 文章 | 內容 |
| --- | --- |
| [扶握箱時間軸第二批：操作便利](planning/grab-timeline-usability.md) | 快捷操作、拍點狀態、扶握／放手提示、複製與範圍編輯規格及驗收條件 |
| [後續拆分順序](planning/refactor-roadmap.md) | 模組拆分批次、完成進度與後續邊界 |
| [手機使用評估](planning/mobile-readiness.md) | 手機布局、觸控操作、已完成驗證與待處理項目 |
| [Tutting 姿勢生成器 Roadmap](planning/Tutting_Pose_Generator_Roadmap.md) | 幾何約束、空間固定、IK 與多步 Combo 規劃 |

## 圖片與維護

- `images/` 共用文章截圖；`images/basic-manual/` 保存基礎手冊圖片。截圖腳本維持原本輸出位置。
- 新文章放入對應分類，並加入本頁索引；圖片與文章連結使用相對路徑。
- 根目錄原有的 10 個文章檔保留搬移導覽，供舊網址使用。完整內容統一維護在分類資料夾。
- 各篇文章中的批次、測試數量與完成狀態沿用原紀錄；規劃文件中的待辦項目仍代表規劃。

[回到專案 README](../README.md)
