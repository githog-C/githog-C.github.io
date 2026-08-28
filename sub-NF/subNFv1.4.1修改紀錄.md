# sub-NF v1.4.1 修改紀錄

| 項目 | 內容 |
|---|---|
| 日期 | 2026-08-28 |
| 版本 | 1.4.0 → **1.4.1** |
| 交付物 | `sub-NF-Chrome-1.4.1.zip`（Google Drive 上檔名沿用 `Sub-NF-Chrome.zip`） |
| 測試 | `node test/run-tests.js` ── **86 條全數通過**（無新增，本次不動解析層） |
| 修改檔案 | `src/overlay.css`、`src/content.js`、`manifest.json`（Chrome／Safari／iOS 三份同步） |

---

## 一、問題

上下兩行字幕會互相推擠：其中一行出現或消失時，另一行就整個跳動。純版面問題，與字幕抓取、解析無關。

## 二、根本原因

`#subnf-overlay` 是 **flex column + `justify-content: flex-end`，高度 auto**，整塊以 `bottom: var(--subnf-bottom)` 從底部往上長；兩行子元素皆 `display: block`、高度隨內容。再加上 `setLine()` 在文字為空時整格 `display: none`。

於是整塊高度＝兩行高度相加，而**唯一被釘死的是最下面那行**。只要下面那行有任何變化——出現、消失、或從一行折成兩行——上面那行就被推上去或掉下來。（反向不成立：上面那行變化時，下面那行本來就已被釘在底部。）

## 三、修法

給「**排在下面的那一行**」一個固定的一行高盒子，讓整塊高度不再依賴它的內容。

### 3.1 `src/overlay.css`──新增 `.subnf-slot-lower`

```css
#subnf-overlay .subnf-slot-lower {
  flex: 0 0 auto !important;
  height: 1.25em !important; /* == line-height：正好一行，em 依該行自己的字級 */
  overflow: visible !important;
}
```

以 class 而非 `.subnf-top` / `.subnf-bottom` 掛載，因為那兩個 class 只管字級與顏色，上下順序是 `swapOrder` 用 flex `order` 換的。

### 3.2 `src/content.js`──`setLine()` 不再切 `display`

```javascript
// 前
if (!text) { el.style.display = 'none'; return; }
el.style.display = '';
// 後
if (!text) return;
```

否則預留的盒子會跟著塌掉，等於白做。空字串本來就不會畫出任何東西。

### 3.3 `src/content.js`──`applyStyleVars()` 依 `swapOrder` 掛 class

```javascript
const lower = settings.swapOrder ? lineTop : lineBottom;
const upper = settings.swapOrder ? lineBottom : lineTop;
lower.classList.add('subnf-slot-lower');
upper.classList.remove('subnf-slot-lower');
```

## 四、修改後行為

- 上面那行：維持原本往上長（整塊底部錨定，容器變高即向上延伸）。
- 下面那行：**上緣被釘死**，永遠在同一個 y。
- 兩者互不影響——任一行出現或消失，另一行完全不動。
- 單行字幕的視覺位置與 1.4.0 完全相同。

## 五、已知副作用

下面那行折成兩行時，第二行往**下**延伸（比 1.4.0 低約一行），而不是把上面那行頂上去。預設底邊距 12vh 有足夠空間；若覺得偏低，可在 popup 調高底邊距。

這是刻意的取捨：兩行要真正互不干擾，就必須各自朝**遠離對方**的方向生長。

## 六、三平台同步

`src/content.js` 與 `src/overlay.css` 三份為 byte 相同的副本，本次已同步 `Chrome/`、`Safari/extension/`、`iOS/extension/` 全部三份，`manifest.json` 版號亦同步至 1.4.1。Safari／iOS 需重新在 Xcode 建置才會生效（見各自 `BUILD.md`）。
