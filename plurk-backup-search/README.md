# Plurk Backup 全文檢索

把噗浪（Plurk）個人備份變成可全文檢索的介面。兩種用法：**線上版**直接在瀏覽器讀取備份資料夾，不必安裝任何東西；**離線版**用 Python 產生一次索引檔，之後開啟更快、完全離線。

線上版：<https://githog-c.github.io/plurk-backup-search/>

## 資料不會離開你的電腦

線上版是純靜態網頁，沒有後端。備份資料夾由瀏覽器的檔案選取器讀取，解析與建立索引全在瀏覽器記憶體內完成，**沒有任何上傳、沒有伺服器紀錄**。關閉分頁即全部消失，只有介面語言偏好會留在 localStorage。

## 取得備份

到噗浪的「設定 → 備份」申請個人備份，收到信後下載並解壓縮。解壓後的資料夾長這樣：

```
你的備份資料夾/
├── index.html
├── data/
│   ├── user.js          帳號身分
│   ├── info.js          備份日期
│   ├── indexes.js
│   ├── plurks/          YYYY_MM.js
│   └── responses/       <base_id>.js
└── static/              backup.css、jquery、icons.png
```

## 線上版用法

1. 開啟 <https://githog-c.github.io/plurk-backup-search/>
2. 按「選擇備份資料夾」，選**解壓縮後那個資料夾本身**（與 `index.html` 同一層），不是裡面的 `data/`。
3. 瀏覽器會逐檔讀取並建立索引，完成後自動進入檢索畫面。

需要支援資料夾選取的瀏覽器（Chrome、Edge、Firefox 皆可；iOS Safari 不支援）。備份較大時建立索引需要數十秒屬正常，過程中有進度顯示。

## 離線版用法

下載 [plurk-backup-search.zip](plurk-backup-search.zip)，解壓後把裡面七個檔案全部複製到備份資料夾根目錄（與 `index.html`、`data/`、`static/` 同一層），然後產生索引：

- Windows：點兩下 `build_index.bat`，或終端機 `python build_index.py`
- macOS：點兩下 `build_index.command`（首次需先 `chmod +x build_index.command`），或終端機 `python3 build_index.py`

執行後會產生 `search-data.js`，用瀏覽器開啟 `search.html` 即可。日後備份更新，重跑一次即可重建。

離線版只需 Python 3 標準函式庫，不必安裝任何套件。

## 功能

- **多詞 AND 檢索**：以空白分隔，命中關鍵字以黃底標示。
- **排除語法**：關鍵字前加半形 `-` 表示不含，可與 AND 混用。
  - `貓 狗` ── 同時含「貓」與「狗」
  - `貓 -狗` ── 含「貓」但不含「狗」
  - `貓 狗 -醫院 -結紮` ── 含前兩者，且不含後兩者
  - `-` 只在字首才視為排除，`e-mail`、`Coca-Cola` 仍可正常搜尋
  - 只下排除條件（如 `-廣告`）也可執行，通常搭配年月或 hashtag 使用
- **篩選**：噗首／回應、本人／他人、年月（左欄行事曆）、hashtag。
- **整串檢視**：點任一結果跳出該則所在的整串（噗首＋全部回應）；點回應會自動捲動到該則並短暫標示。
- **圖片放大**：點縮圖以燈箱檢視。
- **介面中英切換**：右上角按鈕（`EN` ↔ `中文`），偏好記於瀏覽器。只翻譯介面，**備份讀入的噗文原文一律照原樣顯示**，不做任何翻譯或改寫。
- 深色介面，版面鎖定於視窗高度，只有行事曆欄與結果欄內部捲動。

英文用語依噗浪官方英文說明（<https://www.plurk.com/help/en/plurk>、`/help/en/timeline`）：噗首為 **plurk**、回應為 **reply**、標籤為 **hashtag**、發語詞為 **qualifier**。

## 運作方式

- 帳號身分（顯示名稱、名稱顏色、頭貼）與備份日期、各項則數，都是開啟時從備份自身的 `data/user.js` 與 `data/info.js` 讀出來的，程式碼裡沒有任何帳號資料，因此適用於任何人的備份。
- 檢索範圍包含噗文內文、內文中的網址、作者名稱與 hashtag。
- hashtag 只採計原文中正式標記為 hashtag 的詞（`<span class="hashtag">`）。
- 時間一律以 UTC 顯示，與噗浪備份原始資料的時區一致，線上版與離線版結果相同。
- 線上版會讀取備份自身的 `static/backup.css` 與 `icons.png` 來還原噗文原本的排版（發語詞色塊、連結預覽卡、表情符號），因此不需另外散布噗浪的樣式檔。
- 表情符號與外部圖片需連網才顯示；純文字檢索離線亦可用。

## 專案結構

```
plurk-backup-search/
├── index.html                線上版（樣式與程式皆在此單一檔案）
├── plurk-backup-search.zip   離線版下載包
└── README.md                 本說明
```

離線版壓縮包內容：

```
build_index.py        產生索引的腳本（僅標準函式庫）
build_index.bat       Windows 點兩下啟動
build_index.command   macOS 點兩下啟動
search.html           檢索頁入口
search.css            深色介面樣式
search.js             檢索與介面邏輯
README.md             離線版說明
```

---

非官方的個人輔助小工具，資料與服務皆來自 Plurk。
