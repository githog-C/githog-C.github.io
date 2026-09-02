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
5. 要貼進網站後台時，按「下載網頁內嵌版」；後台改過的內容也能用「匯入網頁內嵌版」拉回來（見下節）。

功能一覽：中英雙語切換（雙語骨架）、兩款主題（典雅紅／藍灰）、多選對齊與等距分佈（Ctrl+點選多個區塊）、字級調整（相對單位 vw，投影自動縮放）、文字顏色與連結（Ctrl+K）、插入圖片（選檔、剪貼簿貼上、圖床網址）、表格列欄增刪、頁面排序（Ctrl+上下）、復原重做（Ctrl+Z／Y）、瀏覽器內自動草稿（意外關閉可還原）、Ctrl+P 列印即講義、網頁內嵌版匯入匯出（v10）。

## 網頁內嵌版（v10.0，2026-09-02）

給「把簡報貼進網站後台內容欄（CKEditor 之類的原始碼模式）」用的第二種輸出。檔案是純片段：`<meta charset>`＋`<style>`＋`<div class="dk-deck">`，沒有 `<html>／<head>／<body>`，整段貼進去就能用。

- **下載網頁內嵌版**：雙語簡報一鍵下載中、英各一個 `.txt`（檔名 `標題-ZH.txt`／`標題-EN.txt`；瀏覽器第一次會問「允許多個下載」，按允許）。單語簡報只有一個檔。
- **匯入網頁內嵌版**：可同時選中、英兩個 `.txt`，編輯器依檔名（ZH／EN、zh-tw／en）或內文判斷語言，合併成一份中英切換的簡報；只選一個檔就是單語。也可以直接把 `.txt` 拖進視窗，或用「匯入簡報檔」選 `.txt`。
- **呈現方式**：桌機（寬 >900px）固定 16:9 舞台等比例塞進欄寬、一次一張、‹ › 箭頭或鍵盤左右鍵切換、右下角全螢幕（Esc 退出）；手機（≤900px）改成直式網頁排版（單欄、表格變卡片、字級不小於 14pt），右側浮動上下鈕閒置自動隱藏。切換用純 CSS（radio＋label），內嵌 `<script>` 只做增強，被後台濾掉也照常能翻頁。
- **尺寸**：全用 container query 單位（cqw），跟著貼入欄位的寬度縮放；編輯器內用 vw 設定的字級會自動換成 cqw，排版模式拖移過的區塊位置換成相對值（手機模式下絕對定位的區塊不重排，請斟酌使用）。
- **對應規則**：合約 class 一對一改名（`.screen`→`.dk-slide`、`.sec-title`→`.dk-title`、`table.tools`→`.dk-table`……），匯入時反向改回；v10 同時把全幅頁 `.hero`＋`.badge`、大段落 `.lead-xl`＋`.hl`、流程 `.flow/.step`、文件框 `.docnote/.docbox`、卡片 `.cards/.card`、對話 `.chat/.bubble`、結語卡 `.callout` 納入合約（只增不改），編輯器與內嵌版都有對應樣式。
- **中英合併的前提**：兩個檔要「同結構」（同頁數、同區塊順序）。結構相同時只把文字包成 `.zh/.en`；某處結構不同時會整段並列，並在提示裡列出數量，請回編輯器手動整理。
- **限制**：內嵌版沒有頁尾（`footer.site`），匯入時不會動編輯器現有的頁尾，記得自己填；主題只帶三個色票變數（紅／藍灰）；輸出根層 class 固定為 `.dk-deck`，舊版手工貼上的內容若用別的根層 class，匯入仍認得（只看 `.dk-stage`），但重貼後請整段換成新版。

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

匯入時只抽取內容層、一律換上編輯器自帶的最新程式層，因此改版天然安全；非本編輯器產出的 HTML（無版本標記）會被明確拒絕。網頁內嵌版是同一個內容層的另一種序列化，走同一套合約 class，只是改名並換成 cqw 單位。

## 測試（開發用；測試碼在來源 repo，不隨公開頁面發佈）

```
node tests/run.js
```

需要 Node.js 與 playwright-core（Windows 預設借用同 repo `web-snap/node_modules`，或自行 `npm install playwright-core`；瀏覽器預設走 Edge，可用環境變數 `PW_CHANNEL=chrome` 改用 Chrome；`EDITOR_FILE=index-vN.html` 可指定測試版檔名）。涵蓋：三輪匯出匯入循環內容層等價與圖片逐位元比對、下載檔獨立編輯與再儲存、1920×1080／950／900 中英版面無溢出、內容安全掃描；v10 起另有網頁內嵌版的中英匯出、合併匯入文字等價、二次匯出穩定、結構不符提示、桌機與手機模式實際渲染（16:9、翻頁、鍵盤、浮動鈕、無溢出）共 56 項。

## 授權

MIT License，見 [LICENSE](LICENSE)。
