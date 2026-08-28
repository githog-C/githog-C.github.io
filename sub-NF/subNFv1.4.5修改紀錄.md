# sub-NF v1.4.5 修改紀錄

| 項目 | 內容 |
|---|---|
| 日期 | 2026-08-29 |
| 版本 | 1.4.4 → **1.4.5** |
| 主題 | 安全性強化三項 ＋ 字幕水平位置 |
| 測試 | `node test/run-tests.js` ── **139 條全數通過**（原 113 條，新增 26 條） |
| 新增檔案 | `src/hosts.js` |
| 修改檔案 | `src/background.js`、`src/inject.js`、`src/content.js`、`src/overlay.css`、`popup/popup.html`、`popup/popup.js`、`test/run-tests.js`、`manifest.json`（三平台同步） |

---

## 一、白名單前移到收訊端（本次最重要的一項）

### 1.1 問題

`content.js` 接收頁面世界訊息的處理器只驗 `e.source !== window`——那只擋得住 iframe，擋不住**同一個視窗裡的任何腳本**。任何在 netflix.com 頁面上執行的程式碼（其他擴充功能、使用者腳本、Netflix 自身被打進去的第三方程式碼）都能偽造 `kind:'tracks'`，決定我們去抓哪些網址，而那份假目錄**還會被寫進 `storage.local` 留存**。

實際危害本來就有限：字幕文字一律經 `createTextNode` 進 DOM，**不構成 XSS**；背景抓取原本就有主機白名單，不會變成任意 SSRF，也不帶 cookie。但「顯示什麼」變成頁面可控是不必要的。

### 1.2 改法

白名單從「抓取時才檢查」前移到「**進來就檢查**」——在寫入 `catalogues` 與 `storage` 之前先過濾。

新模組 `src/hosts.js`，比照 `vtt.js`／`textcase.js` 的 UMD 純函式寫法：

- `isNetflixHost(url)` — 必須是 **https**，且主機名等於白名單網域或以 `.` 加該網域結尾
- `isMovieId(id)` — 只收數字（它會成為 storage 的鍵）
- `sanitiseTracks(tracks)` — 丟掉所有非 Netflix 網址的軌道，**回傳全新物件**（只複製已知欄位，攻擊者塞的額外屬性不會被帶進來），並限制陣列長度 100

比對兩端都錨定，是刻意的：

| 若寫成 | 會放行 |
|---|---|
| `endsWith('netflix.com')` | `evil-netflix.com` |
| 未錨定的正則 | `netflix.com.attacker.io` |

兩者都已寫成測試釘死。

### 1.3 三處套用

1. **`content.js` 收訊端**——`kind:'tracks'` 先驗 `isMovieId` 再 `sanitiseTracks`，空的直接丟棄。
2. **`content.js` 讀快取時再過一次**——早於這次改動存進去的資料可能是髒的，出口也擋，讓舊的污染條目無法復活。
3. **`background.js`**——原本的內嵌正則改用共用模組（`importScripts('/src/hosts.js')`，classic service worker 可用）。順帶收緊成只接受 https。若模組載入失敗則**fail closed** 並回報 `hosts.js did not load`，不讓它變成每次請求都丟例外的謎題。

### 1.4 `inject.js` 為什麼是自己一份

`inject.js` 跑在**頁面世界**，看不到隔離世界的全域變數；而把 `hosts.js` 也載進頁面會更糟——**頁面腳本可以直接改寫它**。所以它保留一份閉包內部的實作（頁面碰不到），並由測試斷言兩份在同一張主機表上**逐項一致**。這才是防止兩份走鐘的正確做法，而不是靠自律。

順帶把 `inject.js` 的 fetch 從 `typeof d.url === 'string'` 收緊為 `isNetflixHost(d.url)`——原本那條退路完全沒有白名單。

### 1.5 關於加 nonce

跨 MAIN／isolated world 的 postMessage **本質上無法驗證身分**：token 放哪裡頁面都讀得到。加了只是把門檻從「任何時候」提高到「必須在注入當下就在監看」，價值遠低於白名單前移，因此沒有做，也不該被當成主要防線。

## 二、觀看痕跡：快取從 12 部降到 3 部

`subnfTracks` 是一份未加密躺在瀏覽器設定檔裡的觀看紀錄。它不會離開這台機器，但保留 12 部片沒有必要——功能上只需要當下這部。降為 3 部，兼顧連續看同一季時的往返。

沒有改用 `storage.session`：那會讓「重開瀏覽器就匯不出來、字幕要重抓」變成常態，代價高於收益。

## 三、`web_accessible_resources` 收窄

`https://*.netflix.com/*` → `https://www.netflix.com/*`，與 content script 的 `matches` 完全對齊。`inject.js` 本來就只由 `www.netflix.com` 上的 content script 注入，通配子網域是多出來的暴露面。

## 四、字幕水平位置

新增 `shiftVw`（預設 0），popup 多一支滑桿，範圍 ±25 vw。單位用 `vw` 與垂直位置的 `vh` 一致，全螢幕時等比縮放。

### 4.1 為什麼動 `transform`

原本 CSS 有 `transform: none !important`，那是刻意寫來擋 Netflix 移動疊加層的。改成：

```css
transform: translateX(var(--subnf-shift, 0vw)) !important;
```

**防禦沒有被削弱**——`!important` 一樣壓過 Netflix，只是從「釘在零」變成「釘在我們自己的值」。

### 4.2 對既有功能的影響：無

- **點擊複製的命中判定**：`lineAtPoint()` 用 `getBoundingClientRect()`，該 API 本來就把 transform 計入，位移後照樣命中。
- **時間軸避讓**：`updateLift()` 全程只算垂直，沒有任何水平項。
- **下行固定高度盒子**、大小寫還原：不受影響。
- `transition` 加上 `transform`，滑桿拖曳時與垂直位移一樣平滑。

### 4.3 兩處夾限

popup 與 `applyStyleVars()` 各夾一次 ±25。位移過大時文字會離開畫面，**而它的命中矩形仍然可點**——那種「點得到但看不見」的狀況極難查，所以在來源與套用兩端都擋。

## 五、測試

新增 26 條：主機白名單 16 條（含尾綴仿冒、子網域塞入、協定、垃圾輸入）、`inject.js` 與 `hosts.js` 的**逐項一致性** 1 條、movie id 3 條、目錄過濾 6 條（含「回傳的是複本而非原物件」與長度上限）。

## 六、三平台同步

`src/hosts.js`、`src/background.js`、`src/inject.js`、`src/content.js`、`src/textcase.js`、`src/overlay.css`、`popup/popup.{html,js,css}` 九份已同步至三平台（md5 相同），三份 manifest 皆加入 `src/hosts.js`、收窄 `web_accessible_resources`、升至 1.4.5。

**Safari／iOS 重新建置時請確認 `importScripts` 正常**——這是本版新引入的執行期相依。若背景 worker 回報 `hosts.js did not load`，代表該環境不支援，屆時改為比照 `inject.js` 的做法（自帶一份＋一致性測試）即可。
