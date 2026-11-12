# 胸前雙下柱

[姿勢 JSON](forward-downward-columns.pose.json) · [姿勢清單](README.md)

上臂向前延伸、前臂向下，形成靠近胸前的雙下柱。

上臂朝前延伸，正面投影會縮短；請搭配斜側預覽觀察三維直角。

軀幹與下半身使用初始角度，手指使用模型的初始展開設定。此檔案適用於專案的 Xbot 模型，包含 50 個關節的局部 XYZ 角度，以 0.1° 記錄。

## 正面預覽

![胸前雙下柱正面](forward-downward-columns.png)

## 斜側預覽

![胸前雙下柱斜側](forward-downward-columns-three-quarter.png)

## 讀取與確認

複製 `.pose.json` 內容到模擬器「JSON」分頁，按「套用 JSON」。這是單一姿勢，不使用時間軸的「⬆ 編舞」匯入。請先停止播放並解除會接管雙臂的 IK、FingerTut 或扶握控制。

已在實際模擬器套用並複製回讀，50 個關節資料一致；TG-2.0 評估確認雙肘約 90°，前臂方向符合上述配置。預覽為實際渲染截圖，操作期間無 JavaScript 錯誤。這份確認不包含動作轉場、碰撞或人體舒適度評估。
