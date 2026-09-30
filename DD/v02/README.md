# v02：SVG ＋ 輕量 JavaScript 偽 3D 開門動畫

門、門框、牆面都以內嵌 SVG 繪製。開門不依賴 CSS 3D，而是由 JavaScript 依開門角度，把門板各角點經透視投影後的座標寫回 SVG `<polygon>`。畫面本身是 2D，但看起來是 3D；桌機上另有隨滑鼠移動的視差。零函式庫、零建置步驟、零外部請求。

## 檔案結構

| 檔案 | 用途 |
|---|---|
| `index.html` | 入口。內嵌 SVG（門、門框、牆、光）、透明按鈕 `.door-hit`、`<main>` 內容；關門狀態的座標已預先寫在 HTML 中 |
| `css/door.css` | 樣式與可調整參數（`:root` 內的 CSS 變數）、SVG 配色 |
| `js/door.js` | 檔案開頭的投影常數、投影函式、開門動畫、`.door-hit` 對位、視差、流程與焦點管理 |

## 使用方式

- 入口是本資料夾的 `index.html`；所有路徑都是相對路徑，可原封不動放在任何子路徑底下。
- 網址請以 `/` 結尾（例如 `…/v02/`）。多數靜態主機會自動把不帶斜線的資料夾網址轉址過去；若部署端不轉址，相對路徑會解析到上一層而失效。
- 沒有建置步驟。若修改了 `js/door.js` 的投影常數，`index.html` 內預先寫好的關門座標需要同步：在儲存庫根目錄執行 `node tools/sync-v02-static.mjs`（開發用，網站執行時不需要）。

## 可調整參數

### CSS 變數（`css/door.css` 的 `:root`）

| 變數 | 預設值 | 用途 |
|---|---|---|
| `--door-duration` | `1.2s` | 開門時長（`js/door.js` 也讀取這個值） |
| `--door-fade-duration` | `.6s` | 開門後場景放大並淡出的時長 |
| `--door-reduced-duration` | `.3s` | 「減少動態效果」時的淡出時長 |
| `--door-scale-out` | `1.4` | 場景淡出時的放大倍率 |
| `--door-wall` | `#221f1c` | 牆面顏色；同時是場景背景色，讓 `meet` 留下的兩側空白看起來是牆的延伸 |
| `--door-frame-color`、`--door-frame-edge` | 深褐色 | 門框前緣與描邊 |
| `--door-reveal-l`、`-r`、`-t`、`-b` | 深淺不同的褐色 | 門框內側面（左、右、上、下）的明暗 |
| `--door-wood-1`、`--door-wood-2`、`--door-wood-3` | 木色系 | 門面木紋漸層的三個色階 |
| `--door-back-1`、`--door-back-2` | 木色系 | 門背 |
| `--door-wood-edge`、`--door-shade` | 深褐、黑 | 門緣、門板隨角度變暗的疊色 |
| `--door-panel-fill`、`--door-panel-line` | 半透明 | 凸起門板線條的填色與描邊 |
| `--door-knob-1`、`--door-knob-2` | 金色系 | 門把 |
| `--door-light-core`、`--door-light-mid`、`--door-light-out` | 暖金色系 | 門後的光；`--door-light-mid-a`、`--door-halo-mid-a` 為中段透明度 |
| `--door-focus`、`--door-focus-shadow` | 亮黃、半透明黑 | 鍵盤 focus 外框 |
| `--page-bg`、`--page-fg`、`--page-muted`、`--page-font` | — | 內容區的顏色與字型堆疊（系統字型，不載入網頁字型） |
| `--door-vh` | `1vh`（支援時改為 `1dvh`） | 視窗高度單位：`dvh` 為主、`vh` 為後援，請勿手動修改 |

### 投影常數（`js/door.js` 檔案開頭；單位為 viewBox 座標）

| 常數 | 預設值 | 用途 |
|---|---|---|
| `VIEW_W`、`VIEW_H` | `400`、`800` | viewBox 尺寸，須與 `index.html` 的 `viewBox` 一致 |
| `FOCAL` | `1000` | 焦距（建議 800–1200）；越小透視越強 |
| `CX0`、`CY0` | `200`、`400` | 投影中心預設值（門的中心） |
| `OPEN_W`、`OPEN_H` | `295`、`620` | 門洞尺寸（門高約為 viewBox 高度的 77%，寬高比約 1:2.1） |
| `GAP` | `1.5` | 門板與門洞之間的縫隙（門縫透光） |
| `THICK` | `10` | 門厚 |
| `MAX_ANGLE` | `100` | 開門角度（度） |
| `CASING_W`、`CASING_D` | `16`、`50` | 門框寬度、門框凸出牆面的深度（深度愈大視差愈明顯） |
| `RAISE` | `1.5` | 門板線條與門把凸出門面的高度 |
| `SHADE_MAX` | `0.5` | 開到最大角度時門板變暗的程度（0–1） |
| `LIGHT_MIN`、`HALO_MIN_SCALE` | `0.35`、`0.3` | 關門時門後光的透明度與光暈縮放 |
| `PARALLAX` | `0.02` | 桌機滑鼠視差幅度（占 viewBox 尺寸的比例，即 ±2%）；設為 `0` 即關閉 |
| `ease()` | easeInOutCubic | 開門動畫的緩動函式 |

修改 `OPEN_W`／`OPEN_H`／`CX0`／`CY0`／`GAP` 時，`index.html` 中的 `clipPath`、`.door-light`、`.door-ref`、`.door-halo` 的固定尺寸也要對應調整，最後執行同步腳本。

## 測試參數

- `?nodoor`：跳過開門，直接看內容。僅供開發使用，不在介面上露出。例：`…/v02/?nodoor`。

## 待確認事項（目前設定）

以下項目尚待確認，**目前均為文件指定的預設值**：

| 項目 | 目前預設值 | 調整位置 |
|---|---|---|
| 門的樣式 | 簡潔木門，單開，門把在右，向內開 | 顏色：`--door-wood-*`、`--door-frame-*`、`--door-reveal-*`；形狀：`js/door.js` 的門板細節（凹板線條、門把）與 `OPEN_W`／`OPEN_H` |
| 門後的光 | 暖金色，由門縫逐漸擴大 | `--door-light-*`；`js/door.js` 的 `LIGHT_MIN`、`HALO_MIN_SCALE` |
| 開門時長 | 約 1.2 秒 | `--door-duration` |
| 開門後轉場 | 畫面略往前推、門淡出、內容淡入 | `--door-scale-out`、`--door-fade-duration` |
| 從其他頁返回首頁時是否重新開門 | 是 | `js/door.js` 的 `pageshow` 處理（移除該段即不重設；一般返回導覽本來就會重新載入頁面） |
| 桌機滑鼠視差 | 開啟 | `js/door.js` 的 `PARALLAX`（`0` 為關閉）；手機、「減少動態效果」一律停用 |

## 計畫暫定值（文件未明訂）

| 項目 | 暫定值 | 依據 |
|---|---|---|
| 門高占視窗高度 | 約 77%（viewBox 高度的 620/800） | 文件範圍 70–80%；直式長螢幕手機（390×844）仍有約 71% |
| 場景淡出時長 | 0.6 秒 | 文件未指定 |
| 減少動態效果的淡出 | 0.3 秒 | 文件上限 300 ms |
| 開門角度 | 100° | 文件 §3.3 |
| 焦距 `FOCAL` | 1000 | 文件範圍 800–1200 |
| 視差幅度 | ±2% | 文件 §3.4 |
| 緩動 | easeInOutCubic | 文件僅要求「套用 easing」 |
| 內容 | 中性佔位文字，無照片 | 文件未提供內容 |

## 與提案示意的差異與理由

1. **門框凸出牆面。** 門關著時，門板每個點的 `Z = 0`，投影結果與投影中心無關，視差看不出來。因此門框（前緣與四個內側面）做成凸出牆面 `CASING_D` 的立體，並與門板使用同一個 `proj()` 函式；桌機滑鼠移動時，門框內側面的寬度會隨之微幅變化。
2. **正反面以「觀看者與門面中心的向量」判斷**，背面出現時改用門背的木紋漸層並隱藏正面細節（凹板、門把）。門緣（`.door-edge`）依同一種判斷決定是否顯示；在置中視角下（單開、樞紐在左、向內開）門緣幾乎不會朝向觀看者，看不到屬正常。
3. **門洞遮擋。** 門向內開時會轉進牆後，因此門板群組套用靜態的 `clipPath`（門洞矩形，關門狀態下投影不變），避免門板畫到牆面上。`clipPath` 不是濾鏡，clip 範圍本身不隨動畫改變。
4. **關門座標預先寫在 `index.html`**（以 `tools/sync-v02-static.mjs` 由同一份 JS 計算後寫入），JS 執行前的首次繪製就是完整的門。自測會逐值比對 JS 的 θ = 0 結果與 HTML。
5. **漸層引用寫在 SVG 屬性**（`fill="url(#wood)"`），不寫在外部 CSS：外部樣式表中的 fragment 型 `url(#…)` 在部分瀏覽器會以樣式表網址解析。顏色本身仍全由 CSS 變數指定，SVG 內沒有色碼。
6. **場景淡出發生在角度動畫結束之後**（與 v01、v03 一致）。
7. **加入安全網。** `<head>` 內的 inline script 在 `DOMContentLoaded` 時檢查 `js/door.js` 是否已初始化；若沒有（載入失敗、語法錯誤），就退回 `no-js`，讓內容直接顯示。
8. **`<link rel="icon" href="data:,">`**：避免瀏覽器自動向網站根目錄請求 `/favicon.ico`。
9. **分頁在背景時的後援**：`requestAnimationFrame` 會被暫停，因此另設 `setTimeout`，時間到就直接跳到最終狀態並收尾。
10. **未使用 `feTurbulence`**（灰塵顆粒選配）：文件允許先實測再決定，本版為求動畫穩定與檔案小，不加入；動畫中的元素與其祖先沒有任何濾鏡。
11. JS 約 130 行（此版沒有行數目標），gzip 後約 3.7 KB。

## 自測結果

- 日期：2026-09-30。環境：容器內 Chromium（Playwright，headless，軟體渲染）；站台以本機伺服器提供，並放在 `/a/b/v02/` 的子路徑下測試，同時只放入 `v02/` 一個資料夾，驗證沒有跨資料夾依賴。
- 自測腳本：儲存庫根目錄的 `tools/test/v02.mjs`（`node tools/test/v02.mjs`）；靜態檢查 `tools/check-static.sh v02`；檔案量 `tools/check-size.sh v02 25600`；Lighthouse `node tools/lighthouse.mjs v02`。這些都在 `tools/`，不屬於本資料夾。

| 驗收項目 | 結果 | 證據 |
|---|---|---|
| 桌機 Chrome：點擊可開門，透視自然，無抖動 | 通過（僅 Chromium） | 假時鐘逐幀（76 幀）檢查：自由側 x 座標由 345.9 單調遞減到 39.4，相鄰幀最大位移 25.3 px，無來回跳動；開到一半時樞紐側高 617、自由側高 479（透視）；實際幀間隔中位數 16.7 ms、最大 16.8 ms、>25 ms 為 0（軟體渲染，僅供參考）。我另外對關鍵幀截圖目視確認外觀 |
| 桌機 Safari、Firefox | **未驗證（需實機）** | 本機只有 Chromium。人工步驟：開啟首頁，確認門板與門框的透視、開門過程無抖動、光逐漸擴大 |
| iPhone Safari、Android Chrome，直式與橫式 | **未驗證（需實機）**；版面數值已於 Chromium 驗證 | 320×568、375×667、390×844、844×390、768×1024、1280×800、1920×1080、2560×1080：門中心與視窗中心差 ≤ 2 px、寬高比 2.1 ± 2%、高度 ≤ 80% 視窗、寬度 ≤ 80% 視窗，全部通過。人工步驟：實機開啟後上下滑動使網址列伸縮，門不應被裁切、`.door-hit` 仍在門上 |
| `.door-hit` 在各種視窗尺寸下與門對齊 | 通過 | 8 種視窗尺寸下，`.door-hit` 與門板邊界框四邊差距 ≤ 1 px；載入後動態改變視窗尺寸（390×844、844×390、1000×1000、1920×1080）仍對齊 |
| 鍵盤：Tab 聚焦、Enter／空白鍵開門、焦點在主要內容 | 通過 | Tab 後聚焦 `.door-hit`（aria-label「開門進入網站」），`:focus-visible` 外框 3 px；Enter、Space 各測一次，完成後 `document.activeElement.id === 'content'`、`inert` 已移除。螢幕閱讀器朗讀需人工確認 |
| 減少動態效果時改為淡出，且視差停用 | 通過 | 點擊到完成 300 ms；動畫期間門板 `points` 始終不變；此模式與觸控裝置下，`pointermove` 都不會改變任何座標 |
| 停用 JavaScript 時直接看到內容 | 通過 | 場景不可見、`<main>` 可見且無 `inert`、佔位文字齊全 |
| 開門結束後沒有持續的 `requestAnimationFrame` | 通過 | 完成後 2 秒（含滑鼠移動）rAF 呼叫數不變（184 → 184）；`pointermove` 監聽已移除；`document.getAnimations().length === 0`。DevTools Performance 面板的人工確認建議在實機做一次 |
| 動畫中的元素沒有掛任何 SVG 濾鏡 | 通過 | 文件中沒有 `filter` 屬性、沒有 `<filter>`／`feTurbulence`，所有元素的計算後 `filter` 皆為 `none` |
| 除照片外沒有點陣圖請求 | 通過 | 請求監聽：無 image 類型、無 `.ico`／`.png` 等；所有請求同源，且都在 `/a/b/v02/` 之下；無 4xx／5xx |
| Lighthouse 行動版效能 ≥ 90 | 通過 | 3 次分數 100、100、100（中位數 100）；FCP 759 ms、LCP 960 ms、TBT 0 ms、CLS 0；傳輸 8.1 KB。容器內 headless 測得，與實機有差異 |
| 檔案量 ≤ 25 KB（gzip） | 通過 | HTML 2.0 KB＋CSS 1.8 KB＋JS 3.7 KB，合計約 7.4 KB；零外部函式庫、零外部請求 |
| 子路徑部署、資料夾獨立 | 通過 | 只複製 `v02/` 到 `/a/b/v02/` 測試；靜態檢查無絕對路徑、`<base>`、外部網址、跨資料夾引用 |
| 返回首頁重新開門 | 部分驗證 | 一般返回導覽（重新載入）：門重新出現；以合成 `pageshow`（`persisted: true`）驗證 bfcache 還原時門會重設（座標、按鈕、`inert`）。真實 bfcache 還原（Safari／Firefox）**未驗證（需實機）** |

其他已驗證項目：關門座標（JS 計算）與 `index.html` 預先寫好的座標逐值一致（15 個元素，差 ≤ 0.01）；`door.js` 延遲載入時首次繪製已是完整的門；連點只觸發一次；動畫期間不重建 DOM（元素相同、節點數不變）；背面出現時才隱藏正面細節且不閃爍；`transitionend` 全被攔截、或 `requestAnimationFrame` 完全停擺時，計時後援仍可完成流程；`door.js` 載入失敗時安全網退回 `no-js`；SVG 與 CSS 內沒有寫死的色碼。

## 檔案量與 Lighthouse

- gzip 後：`index.html` 2,042 B、`css/door.css` 1,831 B、`js/door.js` 3,700 B，合計 7,573 B（約 7.4 KB），預算 25 KB。
- Lighthouse（行動版、本機 gzip 伺服器、容器內 headless、3 次）：100／100／100，中位數 100。
