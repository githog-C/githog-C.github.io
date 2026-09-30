# v01：CSS 3D transform 開門動畫

以 HTML 元素加 CSS 3D transform 做出一扇有厚度的木門。零函式庫、零建置步驟、零外部請求；JavaScript 只負責切換狀態與管理焦點。

## 檔案結構

| 檔案 | 用途 |
|---|---|
| `index.html` | 入口。門的結構、`<main>` 內容（直接寫在 HTML 中）、`<head>` 內一行 inline script |
| `css/door.css` | 所有樣式與可調整參數（`:root` 內的 CSS 變數） |
| `js/door.js` | 開門流程、焦點與 `inert` 管理（約 38 行） |

## 使用方式

- 入口是本資料夾的 `index.html`；所有路徑都是相對路徑，可原封不動放在任何子路徑底下。
- 網址請以 `/` 結尾（例如 `…/v01/`）。多數靜態主機會自動把不帶斜線的資料夾網址轉址過去；若部署端不轉址，相對路徑會解析到上一層而失效。
- 沒有建置步驟，直接以靜態主機提供即可。

## 可調整參數（CSS 變數，`css/door.css` 的 `:root`）

| 變數 | 預設值 | 用途 |
|---|---|---|
| `--door-duration` | `1.2s` | 開門時長（門旋轉、門後的光） |
| `--door-fade-duration` | `.6s` | 開門後場景放大並淡出的時長 |
| `--door-reduced-duration` | `.3s` | 「減少動態效果」時的淡出時長 |
| `--door-easing` | `cubic-bezier(.6, .05, .3, 1)` | 開門的緩動曲線 |
| `--door-open-angle` | `100deg` | 開門角度（正值為向內開） |
| `--door-perspective` | `1200px` | 透視距離，越小透視越強 |
| `--door-scale-out` | `1.4` | 場景淡出時的放大倍率 |
| `--door-height-pct` | `75` | 門高占視窗高度的百分比（建議 70–80） |
| `--door-max-width-pct` | `80` | 門寬不超過視窗寬度的百分比（直式手機） |
| `--door-ratio` | `2.1` | 門的高寬比 |
| `--door-thickness-ratio` | `.04` | 門厚占門寬的比例 |
| `--door-jamb-ratio` | `.07` | 門框寬度占門寬的比例 |
| `--door-wall`、`--door-wall-deep` | `#2a2622`、`#1c1917` | 牆面（放射狀漸層的中心與外圍） |
| `--door-frame-color`、`--door-frame-edge`、`--door-frame-shadow` | 深褐色系 | 門框與其陰影 |
| `--door-wood-1`、`--door-wood-2`、`--door-wood-edge`、`--door-back-1`、`--door-back-2` | 木色系 | 門面、門緣、門背 |
| `--door-grain-dark`、`--door-grain-light` | 半透明 | 木紋條紋 |
| `--door-panel-line`、`--door-panel-lit` | 半透明 | 凸起門板線條的暗部與亮部 |
| `--door-knob-1`、`--door-knob-2` | 金色系 | 門把 |
| `--door-light-core`、`--door-light-mid`、`--door-light-out` | 暖金色系 | 門後的光 |
| `--door-focus`、`--door-focus-shadow` | 亮黃、半透明黑 | 鍵盤 focus 外框 |
| `--page-bg`、`--page-fg`、`--page-muted`、`--page-font` | — | 內容區的顏色與字型堆疊（系統字型，不載入網頁字型） |
| `--door-vh` | `1vh`（支援時改為 `1dvh`） | 視窗高度單位：`dvh` 為主、`vh` 為後援，請勿手動修改 |

所有顏色、尺寸、時長都集中在 `:root`；`js/door.js` 的計時後援也是讀取這些 CSS 變數，因此只需要改 CSS。

## 測試參數

- `?nodoor`：跳過開門，直接看內容。僅供開發使用，不在介面上露出。例：`…/v01/?nodoor`。

## 待確認事項（目前設定）

以下項目尚待確認，**目前均為文件指定的預設值**：

| 項目 | 目前預設值 | 調整位置 |
|---|---|---|
| 門的樣式 | 簡潔木門，單開，門把在右，向內開 | 顏色：`--door-wood-*`、`--door-frame-*`；尺寸：`--door-ratio`、`--door-height-pct` |
| 門後的光 | 暖金色，由門縫逐漸擴大 | `--door-light-*`；擴大程度見 `css/door.css` 的 `.door-light`（`scale`、`opacity`） |
| 開門時長 | 約 1.2 秒 | `--door-duration` |
| 開門後轉場 | 畫面略往前推、門淡出、內容淡入 | `--door-scale-out`、`--door-fade-duration` |
| 從其他頁返回首頁時是否重新開門 | 是 | `js/door.js` 的 `pageshow` 處理（移除該段即不重設；一般返回導覽本來就會重新載入頁面） |

## 計畫暫定值（文件未明訂）

| 項目 | 暫定值 | 依據 |
|---|---|---|
| 門高占視窗高度 | 75% | 文件範圍 70–80% 的中間值 |
| 場景淡出時長 | 0.6 秒 | 文件未指定 |
| 減少動態效果的淡出 | 0.3 秒 | 文件上限 300 ms |
| 開門角度／透視距離 | 100°／1200px | 文件 §3.3 |
| 內容 | 中性佔位文字，無照片 | 文件未提供內容 |

## 與提案示意的差異與理由

1. **透視寫在 `.door-leaf` 自己的 `transform` 內。** 提案示意把 `perspective` 設在 `.door-scene`，但 `perspective` 只作用於「直接子元素」，而 `.door-leaf` 與 `.door-scene` 之間隔了 `.door-frame` 與 `<button>`，透視不會生效；再加上 `<button>` 內部的匿名盒子在各瀏覽器行為不一，把 `perspective` 放在按鈕上也不夠穩。因此改為 `translateX(半寬) perspective(…) translateX(-半寬) rotateY(角度)`：消失點落在門的中心，且不依賴任何祖先元素。`--door-perspective` 仍可調整。
2. **場景淡出發生在旋轉結束之後**（提案 §3.4、§3.5），而不是 §3.3 所說的「開到約 80%」。原因是 Safari 在祖先 `opacity < 1` 時會壓平 3D；為了讓三版一致，其他版本也採同樣時機。
3. **加入安全網。** `<head>` 內的 inline script 在 `DOMContentLoaded` 時檢查 `js/door.js` 是否已初始化；若沒有（載入失敗、語法錯誤），就退回 `no-js`，讓內容直接顯示，避免門永遠關著。
4. **`<link rel="icon" href="data:,">`**：避免瀏覽器自動向網站根目錄請求 `/favicon.ico`（那是點陣圖請求，也不符合子路徑部署）。
5. **門把放在門面與門背的兩側**（而非提案示意中與門緣並列），因為門面與門背各自需要一個。
6. **JS 為 38 行**，符合「40 行以內」的目標。

## 自測結果

- 日期：2026-09-30。環境：容器內 Chromium（Playwright，headless，軟體渲染）；站台以本機伺服器提供，並放在 `/a/b/v01/` 的子路徑下測試，同時只放入 `v01/` 一個資料夾，驗證沒有跨資料夾依賴。
- 自測腳本：儲存庫根目錄的 `tools/test/v01.mjs`（執行方式：`node tools/test/v01.mjs`）；靜態檢查 `tools/check-static.sh v01`；檔案量 `tools/check-size.sh v01 20480`；Lighthouse `node tools/lighthouse.mjs v01`。這些都在 `tools/`，不屬於本資料夾。

| 驗收項目 | 結果 | 證據 |
|---|---|---|
| 桌機 Chrome：點擊可開門，動畫流暢 | 通過（僅 Chromium） | 1280×800；幀間隔中位數 16.7 ms、平均 17.1 ms、最大 33.4 ms、115 幀、>50 ms 為 0（軟體渲染，僅供參考） |
| 桌機 Safari、Firefox | **未驗證（需實機）** | 本機只有 Chromium。人工步驟：開啟首頁，確認門有透視、右緣往內退（不是被壓平成水平縮小）、點擊後流程完成 |
| iPhone Safari、Android Chrome，直式與橫式 | **未驗證（需實機）**；版面數值已於 Chromium 驗證 | 320×568、375×667、390×844、844×390、768×1024、1280×800、1920×1080、2560×1080：門中心與視窗中心差 ≤ 2 px、寬高比 2.1 ± 2%、高度 ≤ 80% 視窗、寬度 ≤ 80% 視窗，全部通過；CSS 使用 `100dvh`／`--door-vh` 並有 `vh` 後援。人工步驟：實機開啟後上下滑動使網址列伸縮，門不應被裁切或位移 |
| 鍵盤：Tab 聚焦、Enter／空白鍵開門、焦點在主要內容 | 通過 | Tab 後聚焦按鈕（aria-label「開門進入網站」），`:focus-visible` 外框 3 px；Enter、Space 各測一次，完成後 `document.activeElement.id === 'content'`、`inert` 已移除。螢幕閱讀器朗讀需人工確認 |
| 減少動態效果時改為淡出 | 通過 | 點擊到完成 321 ms；動畫期間 `.door-leaf` 的變形值始終為單一值（不旋轉） |
| 停用 JavaScript 時直接看到內容 | 通過 | 場景不可見、`<main>` 可見且無 `inert`、佔位文字齊全 |
| 開門結束後沒有持續的重繪或動畫 | 通過 | 完成後 2 秒（含滑鼠移動）`requestAnimationFrame` 呼叫數不變（112 → 112）；`document.getAnimations().length === 0`；`will-change` 已移除。DevTools Performance 面板的人工確認建議在實機做一次 |
| 檢視原始碼可看到完整主要內容文字 | 通過 | 以 HTTP 取得原始 HTML，標題與各區塊文字皆在其中 |
| 除照片外沒有點陣圖請求 | 通過 | 請求監聽：無 image 類型、無 `.ico`／`.png` 等；所有請求同源，且都在 `/a/b/v01/` 之下；無 4xx／5xx |
| Lighthouse 行動版效能 ≥ 90 | 通過 | 3 次分數 100、100、100（中位數 100）；FCP 756 ms、LCP 972 ms、TBT 0 ms、CLS 0；傳輸 5.2 KB。容器內 headless 測得，與實機有差異 |
| 檔案量 ≤ 20 KB（gzip） | 通過 | HTML 1.1 KB＋CSS 2.6 KB＋JS 1.0 KB，合計約 4.5 KB |
| 子路徑部署、資料夾獨立 | 通過 | 只複製 `v01/` 到 `/a/b/v01/` 測試；靜態檢查無絕對路徑、`<base>`、外部網址、跨資料夾引用 |
| 返回首頁重新開門 | 部分驗證 | 一般返回導覽（重新載入）：門重新出現；以合成 `pageshow`（`persisted: true`）驗證 bfcache 還原時門會重設。真實 bfcache 還原（Safari／Firefox）**未驗證（需實機）** |

其他已驗證項目：連點只觸發一次；`transitionend` 全被攔截時，計時後援仍可完成流程；`door.js` 載入失敗時安全網會退回 `no-js`；旋轉期間 `.door`、`.door-frame`、`.door-scene` 沒有 `overflow`、`filter`、`opacity < 1`、`clip-path`、`mask`；開到一半時自由側高度（387 px）小於樞紐側（595 px），確認透視有效；`door.css` 內顏色與時長只出現在 `:root`。

## 檔案量與 Lighthouse

- gzip 後：`index.html` 1,075 B、`css/door.css` 2,611 B、`js/door.js` 966 B，合計 4,652 B（約 4.5 KB），預算 20 KB。
- Lighthouse（行動版、本機 gzip 伺服器、容器內 headless、3 次）：100／100／100，中位數 100。
