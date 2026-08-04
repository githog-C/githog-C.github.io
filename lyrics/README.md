# 歌詞集──GitHub Pages 靜態歌詞網站

以 GitHub Pages 發佈的純靜態歌詞網站。所有歌曲資料以 JSON 純文字檔維護，不需要資料庫、不需要建置流程；`git push` 即完成更新。

## 功能

- YouTube 影片嵌入播放（YouTube IFrame Player API）
- 點按歌詞行，影片跳至對應時間並播放
- 播放時自動高亮目前行、唱過的行淡出、歌詞自動捲動置中
- 日文漢字讀音：以 `{漢字|讀音}` 標記，自動轉為 `<ruby>漢字<rt>讀音</rt></ruby>`
- 非中文歌曲可同時顯示原文（orig）、羅馬拼音（rmj）、繁體中文翻譯（zh）三行
- 讀音、羅馬字、中譯、自動捲動皆可獨立開關（偏好記憶於瀏覽器 localStorage）
- 「AA」按鈕彈出滑桿可調歌詞字體大小（70%～170%，整份歌詞等比縮放，偏好同樣記憶）
- 「在 YouTube 開啟」會帶上目前播放秒數，接續在 YouTube 觀看
- 每首歌有獨立公開連結：`https://<帳號>.github.io/<repo>/#歌曲id`
- 版面鎖定於視窗高度：1920×1080、100% 縮放下整頁完整可見，僅歌詞欄內部捲動
- 進站（無 `#歌曲id`）時自動載入歌單第一首；換歌一律使用頁首下拉選單
- 歌曲檔格式錯誤時，頁首下方會列出失敗檔名與原因，方便除錯

## 專案結構

```
lyrics-site/
├── index.html          ← 網站本體（樣式與程式皆在此單一檔案）
├── .nojekyll           ← 告知 GitHub Pages 不經 Jekyll 處理
├── README.md           ← 本說明
└── songs/
    ├── index.json      ← 歌單登錄檔（站名＋歌曲檔清單）
    ├── sample-ja.json  ← 日文示範（含讀音標記）
    ├── sample-en.json  ← 英文示範（原文＋中譯）
    └── sample-zh.json  ← 中文示範（最精簡結構）
```

## 本機預覽

歌詞資料以 `fetch` 讀取，瀏覽器的同源政策（CORS）會封鎖 `file://` 直接開啟時的本機檔案讀取，因此需以本機伺服器預覽：

```bash
cd lyrics-site
python3 -m http.server 8000
# Windows：py -m http.server 8000
```

開啟 `http://localhost:8000` 即可。若忘記此步驟直接雙擊 index.html，頁面會顯示對應的提示訊息。

## 部署到 GitHub Pages

1. 在 GitHub 建立公開 repo，將本資料夾內容推送至 `main` 分支根目錄。
2. 進入 repo 的 Settings → Pages，於 Build and deployment 的 Source 選擇「Deploy from a branch」，Branch 選 `main`、資料夾選 `/ (root)`，按 Save。
3. 稍候數分鐘，網站即發佈於 `https://<帳號>.github.io/<repo>/`。推送後最長可能需約十分鐘才反映變更。

官方文件：
- 建立 Pages 網站：https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- 設定發佈來源：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 新增一首歌（三步驟）

1. 在 `songs/` 建立新檔，例如 `my-song.json`（格式見下節；可複製示範檔修改）。
2. 在 `songs/index.json` 的 `songs` 陣列加入 `"my-song.json"`。
3. `git add`、`git commit`、`git push`。分享連結即為 `⋯/#my-song`（# 後接該歌的 id）。

## 歌曲檔格式

### 歌曲層級欄位

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | 否 | 網址識別碼（`#id`）。省略時以檔名（去除 .json）為 id |
| `title` | 建議 | 歌名 |
| `artist` | 否 | 演出者 |
| `lang` | 建議 | 原文語言：`ja`、`en`、`ko`、`zh-Hant`⋯⋯影響字型與語言標記 |
| `youtube` | 建議 | YouTube 影片 ID（網址 `watch?v=` 後的 11 碼），非完整網址 |
| `offset` | 否 | 秒數，加到每行時間上。換用前奏長度不同的影片版本時可整體平移，不必逐行改 |
| `note` | 否 | 顯示於歌名下方的備註（翻譯者、版本說明等） |
| `lines` | 是 | 歌詞行陣列 |

### 歌詞行欄位（每行皆為選填，依語言取用）

| 欄位 | 說明 |
|---|---|
| `t` | 時間標記：數字（秒，例 `83.5`）或字串（`"1:23.5"`、`"0:05"`，亦支援 `時:分:秒`）。省略則該行不可點按、不參與同步（適合「（間奏）」等標示行） |
| `orig` | 原文行。日文可用 `{漢字|讀音}` 標記，例：`"{星|ほし}{空|ぞら}よりも"` |
| `rmj` | 羅馬拼音行 |
| `zh` | 繁體中文行（翻譯；中文歌曲直接用 `orig` 即可，省略此欄） |

### 各語言的建議組合

- 日文：`orig`（含讀音標記）＋ `rmj` ＋ `zh`
- 英文等其他語言：`orig` ＋ `zh`
- 中文：僅 `orig`

### 讀音標記與輸出結構

`{漢字|讀音}` 逐一展開為 HTML 的 ruby 元素，讀音顯示於漢字上方，不影響版面結構；假名與符號原樣保留。標記粒度自由──可逐字（`{星|ほし}{空|そら}`），也可整詞（`{星空|ほしぞら}`）。

輸出結構如下（`played` 為唱過、`active` 為目前行）：

```html
<div class="line played" data-i="1" data-t="12">
  <p class="ruby" lang="ja"><ruby>星<rt>ほし</rt></ruby><ruby>空<rt>そら</rt></ruby>よりも⋯⋯</p>
  <p class="rmj">hoshizora yorimo ...</p>
  <p class="zh">比起星空⋯⋯</p>
</div>
```

## 疑難排解

- 頁面列出「載入失敗」：多為 JSON 語法錯誤（缺逗號、多逗號、引號未成對）。可用 VS Code 或 https://jsonlint.com 檢查。
- 影片區顯示「不允許嵌入」：該影片擁有者停用了站外嵌入（IFrame API 錯誤碼 101／150），只能換影片來源。
- 推送後看不到更新：GitHub Pages 部署最長約十分鐘；瀏覽器亦可能快取，可強制重新整理（Ctrl＋F5）。本站對 JSON 已設 `cache: no-cache`，資料檔通常即時。
- 時間軸整體偏移：優先調 `offset`，不必逐行修改。

## 版權提醒

示範檔中的歌詞為本專案原創占位文字。實際發佈他人歌詞、翻譯與影片內容前，請確認已取得授權或符合當地著作權規範；公開網站上的內容責任由發佈者承擔。

## 技術依賴與來源聲明

- 網站本體為原生 HTML／CSS／JavaScript，無任何前端框架、無 CDN、無外部字型服務（採系統字型堆疊）。
- 唯一的執行期外部服務為 YouTube IFrame Player API（Google，美國）：https://developers.google.com/youtube/iframe_api_reference
- 代管平台為 GitHub Pages（GitHub／Microsoft，美國）。
- 本專案不含任何來自中國之程式庫、CDN、字型或其他技術資源。
