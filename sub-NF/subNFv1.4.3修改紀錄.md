# sub-NF v1.4.3 修改紀錄

| 項目 | 內容 |
|---|---|
| 日期 | 2026-08-29 |
| 版本 | 1.4.2 → **1.4.3** |
| 交付物 | `sub-NF-Chrome-1.4.3.zip`（Google Drive 上檔名沿用 `Sub-NF-Chrome.zip`） |
| 測試 | `node test/run-tests.js` ── **86 條全數通過** |
| 修改檔案 | `src/content.js`、`src/overlay.css`、`popup/popup.html`、`popup/popup.js`、`popup/popup.css`、`manifest.json`（三平台同步） |
| 備份 | 改動前的 1.4.2 完整狀態存於 `~/Downloads/sub-NF-backup-1.4.2-20260829/` |

---

## 一、1.4.2 的點擊複製為什麼失敗

回報現象：疊加層已正確帶上 `subnf-clickable`（暫停偵測與 CSS 都生效），但點下去仍是恢復播放，複製沒發生。

**原因是命中判定的方式錯了，不是 `pointer-events` 沒開。**

Netflix 在畫面上疊了一層接管點擊的元素，而那一層所在的堆疊脈絡我們贏不了——`#subnf-overlay` 的 `z-index: 2147483000` 只在**自己父層的堆疊脈絡內**比大小，而我們是被掛進 `<video>` 的定位祖先裡面的。所以點擊事件的 `target` 根本不是我們的 `<span>`，1.4.2 的 `copyTargetOf()` 比對 `e.target` 一律得到 null，直接 return——連 `stopPropagation()` 都沒機會呼叫，播放器當然照常切換。

## 二、改法：改用幾何命中判定

不再問「我的元素是不是事件目標」，改問「指標座標在不在我這行的矩形內」。矩形是誰都搶不走的。

```javascript
function lineAtPoint(x, y) {
  for (const span of [textTop, textBottom]) {
    const r = span.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return span;
  }
  return null;
}
```

這樣無論點擊被誰接走，我們都知道使用者點的是哪一行。

### 2.1 三條複製路徑

| 路徑 | 條件 | 可靠度 |
|---|---|---|
| **擴充功能面板按鈕** | 隨時 | **保證可用**，完全不與播放器爭事件 |
| **⌘⇧／Ctrl⇧ ＋點擊字幕** | 隨時（播放中也行） | 高 |
| 暫停時直接點字幕 | 暫停中 | 視 Netflix 監聽器而定 |

新增的面板按鈕是主力：popup 擁有自己的按鈕，不必和 Netflix 的接管層搶。面板顯示目前兩行內容，三顆按鈕分別複製 **上排／下排／全部**（全部＝兩行以換行相接）。

### 2.2 播放狀態保護（`holdPlayState`）

即使 `stopPropagation()` 沒攔住，複製也絕不該改變影片的播放狀態。複製時記下當下的 `paused`，接下來 300ms 內每 25ms 檢查一次，一旦被改掉就改回去。這讓「暫停時點字幕」無論事件競爭誰贏都成立。

### 2.3 修飾鍵選擇

`Shift + (Cmd | Ctrl)`。播放器沒用這個組合，且播放中也能用。單獨 Ctrl+click 在 macOS 等同右鍵，故一律要求同時按 Shift。

## 三、時間軸浮出時字幕上移

新增 `--subnf-lift`：一個**暫時**的位移量，疊加在使用者自己設的垂直位置之上。

```css
bottom: calc(var(--subnf-bottom, 12vh) + var(--subnf-lift, 0px)) !important;
transition: bottom 160ms ease-out !important;
```

控制列沉下去時 lift 回到 0，字幕就回到使用者調的位置——兩者不互相覆蓋，只是相加。

### 3.1 偵測

依序試多個選擇器（`[data-uia="controls-standard"]` 等五個，Netflix 的 class 名常改，故不寫死單一個），取第一個「可見」的：`display`／`visibility` 正常、`opacity ≥ 0.05`、有實際尺寸。因為 Netflix 是淡入淡出，用 opacity 門檻可以在它剛開始浮出時就跟著讓位，配合 transition 很順。

**防呆兩道**：

1. 只認畫面下半部的元素（`rect.top` 必須在播放器高度 45% 以下）。否則抓到整頁的 wrapper 會把字幕推到天花板。
2. 位移上限為播放器高度的 30%，誤判也不會把字幕甩出畫面。

### 3.2 避免自我震盪（這點很容易寫錯）

`bottom` 有 transition，所以動畫途中量到的 `getBoundingClientRect()` 是中間值。若拿它回推需要的位移量，讀數會餵回自己造成震盪。

故改為**推算**而非量測靜止位置：`--subnf-bottom` 的單位是 vh，而 vh 對應視窗（全螢幕時就是整個螢幕），因此

```javascript
const baseBottomPx = window.innerHeight * (settings.bottomVh ?? 12) / 100;
const restingEdge = playerRect.bottom - baseBottomPx;
```

得到的就是樣式表自己會算出的同一個數字，與動畫無關。量測節流為 100ms 一次（版面讀取會觸發重排，不宜每幀做）。

## 四、設定

| 設定 | 預設 | 說明 |
|---|---|---|
| `clickToCopy` | 開 | 暫停時點擊字幕複製 |
| `copyModifierClick` | 開 | ⌘⇧／Ctrl⇧ ＋點擊複製 |
| `avoidControls` | 開 | 時間軸浮出時字幕自動上移 |

三者皆有 popup 核取方塊，全關即回到 1.4.1 的行為。

## 五、三平台同步

`src/content.js`、`src/overlay.css`、`popup/popup.html`、`popup/popup.js`、`popup/popup.css` 五份已同步至三平台（md5 相同），版號同步 1.4.3。Safari／iOS 需重新在 Xcode 建置。
