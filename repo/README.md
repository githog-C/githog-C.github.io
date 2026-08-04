# repo｜單檔簡報編輯器

零後端、零帳號、免安裝的網頁簡報編輯器。打開是空白簡報，做好按「下載」得到一個自包含的 HTML 簡報檔：可直接投影播放，檔案內建編輯功能可繼續修改，也可以再拖回編輯器改版——**循環任意次，內容不會遺失**。

- 線上版：<https://githog-c.github.io/repo/>
- 所有編輯都在你的瀏覽器內完成，不上傳任何資料。

## 使用環境

- 線上工具（瀏覽器端單一 HTML 檔），Windows／macOS 皆可使用。
- 編輯功能鎖定支援 Chrome／Edge（`contenteditable` 與 `execCommand` 行為以此為準）；其他瀏覽器可播放，不保證可編輯。
- 播放建議 1920×1080（16:9）投影環境；版面在視窗高 900–1080px 皆經自動化檢測無溢出。

## 快速上手

1. 打開編輯器，左欄「編輯模式」直接點文字修改；「排版模式」可點選、拖移、縮放區塊（限文字方塊、圖片、表格等內容區塊）。
2. 「新增頁面」提供六款模板（標題內文、三重點、左右對照、表格、封面、空白）。
3. 做好按「下載簡報」（或 Ctrl+S）。下載檔可直接開啟投影，右上角有「編輯／下載」按鈕可再改再存。
4. 要大改版面時，把下載檔用「匯入簡報檔」（或直接拖進視窗）拉回編輯器繼續做。

功能一覽：中英雙語切換（雙語骨架）、兩款主題（典雅紅／藍灰）、多選對齊與等距分佈（Ctrl+點選多個區塊）、字級調整（相對單位 vw，投影自動縮放）、文字顏色與連結（Ctrl+K）、插入圖片（選檔、剪貼簿貼上、圖床網址）、表格列欄增刪、頁面排序（Ctrl+上下）、復原重做（Ctrl+Z／Y）、瀏覽器內自動草稿（意外關閉可還原）、Ctrl+P 列印即講義。

## 兩機使用指令教學

線上版直接開網址即可，無需安裝。要在本機離線使用時：

Windows（PowerShell）：

```powershell
# 下載單檔（或 git clone 整個 tool repo 後開 repo\index.html）
Invoke-WebRequest https://githog-c.github.io/repo/index.html -OutFile "$env:USERPROFILE\Downloads\repo-editor.html"
Start-Process "$env:USERPROFILE\Downloads\repo-editor.html"
```

macOS（Terminal）：

```bash
curl -o ~/Downloads/repo-editor.html https://githog-c.github.io/repo/index.html
open ~/Downloads/repo-editor.html
```

## Roundtrip 設計（為什麼內容不會掉）

輸出檔固定三層：

1. 內容層：`<body>` 內的 `.screen` 序列＋`footer.site`，含使用者所有編輯（文字、行內樣式、圖片、絕對定位）。
2. 合約層：一組凍結的 class 名稱（`.screen`、`.sec-title`、`.stats`、`.panel`……）。新版本只增不改不刪，舊檔永遠能被新版樣式正確渲染。
3. 程式層：主題 CSS＋內建編輯 runtime，檔頭帶 `<meta name="deck-editor">` 版本標記。

匯入時只抽取內容層、一律換上編輯器自帶的最新程式層，因此改版天然安全；非本編輯器產出的 HTML（無版本標記）會被明確拒絕。

## 測試（開發用；測試碼在來源 repo，不隨公開頁面發佈）

```
node tests/run.js
```

需要 Node.js 與 playwright-core（Windows 預設借用同 repo `web-snap/node_modules`，或自行 `npm install playwright-core`；瀏覽器預設走 Edge，可用環境變數 `PW_CHANNEL=chrome` 改用 Chrome）。涵蓋：三輪匯出匯入循環內容層等價與圖片逐位元比對、下載檔獨立編輯與再儲存、1920×1080／950／900 中英版面無溢出、內容安全掃描。

## 授權

MIT License，見 [LICENSE](LICENSE)。
