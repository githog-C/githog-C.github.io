# sub-NF v1.4.2 修改紀錄

| 項目 | 內容 |
|---|---|
| 日期 | 2026-08-28 |
| 版本 | 1.4.1 → **1.4.2** |
| 交付物 | `sub-NF-Chrome-1.4.2.zip`（Google Drive 上檔名沿用 `Sub-NF-Chrome.zip`） |
| 測試 | `node test/run-tests.js` ── **86 條全數通過**（本次不動解析層，未增測項） |
| 修改檔案 | `src/overlay.css`、`src/content.js`、`popup/popup.html`、`popup/popup.js`、`manifest.json`（Chrome／Safari／iOS 三份同步） |
| 備份 | 改動前的 1.4.1 完整狀態存於 `~/Downloads/sub-NF-backup-1.4.1-20260828/` |

---

## 一、新增功能：暫停時點擊字幕複製整句

語言學習用途：暫停後直接點某一行字幕，該行整句進剪貼簿。兩行分屬不同語言且各自獨立，因此中／英是天然分開的——點哪行複製哪行，不需要額外的語言判斷。

## 二、設計決策

### 2.1 為什麼只有「暫停時」可點

`#subnf-overlay` 原本整層 `pointer-events: none`，讓點畫面暫停、拖進度條都不被字幕擋住。若無條件開放點擊，播放中點到字幕就不會暫停，等於破壞既有操作。

因此改成條件式：播放中維持穿透，暫停時才開放。狀態由 `render()` 每幀比對 `video.paused` 後切換 `subnf-clickable` class（只在值真的改變時才碰 DOM），並在 `hookVideo()` 補上 `pause` 事件以求即時。

### 2.2 為什麼把文字包進 `<span>`

`.subnf-line` 是 block、寬 88%。若直接對它開放點擊，暫停時畫面上會橫躺兩條看不見的攔截帶，點字幕左右的空白處無法恢復播放，體感很怪。

改為在每行內放一個 `<span class="subnf-text">` 承載文字，只對 span 開放 `pointer-events: auto`。span 是 inline，寬度就是文字本身——這才符合「點擊字幕本身」。`setLine()` 隨之改為填入 span 而非 line div；span 在 `ensureOverlay()` 建立一次，之後只換內容。

### 2.3 為什麼用 window 捕獲階段

Netflix 的播放／暫停切換可能掛在我們上層、且可能在捕獲階段執行；冒泡階段的 `stopPropagation()` 會來不及。故在 `window` 上以 `capture: true` 監聽 `pointerdown / mousedown / pointerup / mouseup / click / dblclick`，這是能取得的最早時點。

只 `stopPropagation()`，**絕不對指標事件 `preventDefault()`**——否則使用者無法用拖曳反白選字。`preventDefault()` 只在 `click` 且確定要複製時才呼叫。

### 2.4 選字與點擊的衝突

拖曳反白結束時也會產生一次 click。若無條件複製整句，就永遠選不了半句。故在 handler 內先檢查 `window.getSelection()`：已有非空選取就直接放行，讓使用者自己 Ctrl+C。

### 2.5 換行處理

Netflix 常把一句 cue 折成兩行以配合版面，該換行是排版而非句子結構。複製前一律 `replace(/\s+/g, ' ').trim()` 併回單句，否則貼出來是斷的。

### 2.6 剪貼簿路徑

主用 `navigator.clipboard.writeText()`：netflix.com 為 https（secure context）、click 帶 user activation、`clipboard-write` 對同源預設允許，**不需要新增任何 manifest 權限**。

失敗時退回 `document.execCommand('copy')`。該 fallback 的 textarea 必須掛在 `document.fullscreenElement` 之內——全螢幕時該元素之外的東西不會被繪製，也無法選取。

### 2.7 回饋

複製成功後該行閃一下（Netflix 紅底，260ms 後以 320ms 淡出）。不用 toast，避免擋畫面。重複點擊時先移除 class 並讀取 `offsetWidth` 強制重排，讓 transition 重新開始。

## 三、設定

新增 `clickToCopy`，**預設開啟**；popup 對應「暫停時點擊字幕複製整句」核取方塊。關閉後行為與 1.4.1 完全相同（連 window 監聽也會直接 return）。

## 四、待實測確認

`stopPropagation()` 是否足以擋下 Netflix 的播放切換，取決於對方監聽器實際掛在哪一層、哪個階段。window 捕獲已是最早時點，理論上能攔住；但若 Netflix 改用 `pointerrawupdate` 或在 window 上更早註冊，仍可能點完字幕順便恢復播放。**請在實機驗這一點。**

## 五、三平台同步

`src/content.js`、`src/overlay.css`、`popup/popup.html`、`popup/popup.js` 四份已同步至 `Chrome/`、`Safari/extension/`、`iOS/extension/`（md5 相同），`manifest.json` 版號同步至 1.4.2。Safari／iOS 需重新在 Xcode 建置才會生效。
