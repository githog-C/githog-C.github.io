# v03：WebGL（Three.js）開門動畫，以 CSS 門作為首屏與後援

打開首頁先顯示 CSS 3D 的門（自 v01 複製而來，可獨立運作）；首次內容繪製之後才動態載入 Three.js，初始化成功並渲染出第一格後，以淡入替換 CSS 門。開門後鏡頭穿過門口，接著淡出到內容。WebGL 不可用、初始化失敗、載入逾時、「減少動態效果」、掉幀或環境遺失時，一律維持或退回 CSS 門。

## 檔案結構

| 檔案 | 用途 |
|---|---|
| `index.html` | 入口。CSS 門的結構（同 v01）＋ 空的 WebGL 容器 `.door-webgl`（canvas 由 JS 建立）、`<main>` 內容 |
| `css/door.css` | 樣式與可調整參數。v01 的全部內容，加上檔尾的「WebGL 疊層」區塊與 v03 專用變數 |
| `js/door.js` | CSS 門邏輯（自 v01 而來）＋ WebGL 調度：可用性檢查、延後載入、逾時、競態處理、後援切換 |
| `js/door-webgl.js` | WebGL 場景（ES module，動態載入）：場景常數、場景建立、開門與鏡頭動畫、效能設定、釋放資源 |
| `vendor/three/three.custom.min.js`、`vendor/three/LICENSE` | Three.js 的一次性打包產物（只含用到的類別）與 MIT 授權聲明 |

## 使用方式

- 入口是本資料夾的 `index.html`；所有路徑都是相對路徑，可原封不動放在任何子路徑底下。
- 網址請以 `/` 結尾（例如 `…/v03/`）。多數靜態主機會自動把不帶斜線的資料夾網址轉址過去；若部署端不轉址，相對路徑會解析到上一層而失效。
- **網站執行時不需要任何建置步驟。** `vendor/three/` 內的檔案已打包好並直接放在版本庫中。

## Three.js 版本、打包與重新打包

- Three.js 版本：**0.186.1**（固定，不使用 latest）。打包工具：esbuild **0.25.10**。
- 為什麼要打包：0.186.1 沒有提供壓縮版，且 `three.module.js` 依賴 `three.core.js`；直接放入兩個檔案約 2.1 MB。改為只打包用到的類別後大幅縮小（提案 §3.3 允許並要求在此說明取捨）。

| | 原始大小 | gzip 後 |
|---|---|---|
| 打包前（`three.module.js` ＋ `three.core.js`，未壓縮） | 2,071.2 KB | 408.2 KB |
| 打包後（`three.custom.min.js`，單一 ES module，壓縮） | 524.6 KB | 131.7 KB |

- 打包腳本與設定在儲存庫根目錄的 `tools/`（不在本資料夾內）：`tools/package.json`（固定版本）、`tools/package-lock.json`、`tools/three-entry.js`（只匯出用到的類別）、`tools/build-three.mjs`。
- **重新打包指令**：在儲存庫根目錄執行 `cd tools && npm ci && npm run build:three`。產物會寫到 `v03/vendor/three/`，並印出打包前後大小。新增或移除用到的 Three.js 類別時，先修改 `tools/three-entry.js`。
- 授權：產物末尾保留 Three.js 的 `@license`（MIT）註解，`vendor/three/LICENSE` 為原授權檔，兩者都不可移除。第三方檔案依決定原樣保留授權聲明與作者資訊，且不列入本專案的路徑與個資檢查。
- `js/door-webgl.js` 只以相對路徑匯入這個檔案，不使用裸模組名稱，也不依賴 CDN。

## 可調整參數

### CSS 變數（`css/door.css` 的 `:root`）

v01 的全部變數（時長、緩動、尺寸比例、木色、門框、光、focus、內容區，見 `v01/README.md` 的表格，數值相同），加上 v03 專用的：

| 變數 | 預設值 | 用途 |
|---|---|---|
| `--door-camera-duration` | `.8s` | 開門之後鏡頭前推穿過門口的時長（`js/door-webgl.js` 也讀取） |
| `--door-swap-duration` | `.3s` | CSS 門與 WebGL 門的淡入替換時長（兩個階段各一次） |
| `--door-glow` | `#ffb347` | 門後光暈與點光源的顏色 |
| `--door-glow-core` | `#f2b45e` | 門後最深處的牆 |
| `--door-room` | `#a9814f` | 門後空間的牆面、地板、天花板 |

`--door-duration`（1.2 秒）在 WebGL 模式下同樣是開門時長；`--door-wood-*`、`--door-frame-color`、`--door-knob-1`、`--door-wall` 也會被 WebGL 場景讀取。**這些供 Three.js 讀取的顏色必須寫成十六進位色碼。**

### 場景常數（`js/door-webgl.js` 檔案開頭；單位為世界單位，門寬 = 1）

| 常數 | 預設值 | 用途 |
|---|---|---|
| `DOOR_W`、`DOOR_H` | `1`、`2.1` | 門寬、門高（比例與 CSS 門一致） |
| `DOOR_THICK` | `DOOR_W × 0.04` | 門厚：約為門寬的 4% |
| `DOOR_GAP` | `0.004` | 門板與門洞的縫隙（門縫透光） |
| `JAMB`、`FRAME_DEPTH` | `0.07`、`0.3` | 門框寬度（比例同 `--door-jamb-ratio`）、深度 |
| `MAX_ANGLE` | `100` | 開門角度（度） |
| `CAM_DIST` | `4` | 關門時鏡頭離門的距離；越小透視越強。鏡頭的視野角由 CSS 門的實際大小反算，關門時 WebGL 門與 CSS 門重合 |
| `CAM_END_Z` | `-4.4` | 鏡頭穿過門口後的終點 |
| `ROOM` | `{ halfWidth: 2.6, depth: 6, above: 0.7 }` | 門後空間的半寬、深度、高出門頂的高度 |
| `AMBIENT_INTENSITY`、`LIGHT_INTENSITY`、`LIGHT_DECAY` | `π×0.95`、`π×2.2`、`1.2` | 環境光、門後點光源的最大強度與衰減 |
| `LIGHT_MIN`、`GLOW_MAX` | `0.25`、`0.55` | 關門時光的比例、光暈平面的最大透明度 |
| `PIXEL_RATIO_MAX` | `1.5` | 像素比上限（iOS 記憶體較緊） |
| `TEXTURE_SIZE` | `256` | 程式生成的木紋紋理尺寸上限 |
| `SLOW_FRAME_MS`、`SLOW_FRAME_SAMPLES` | `50`、`5` | 開門期間最近 5 格平均幀時間超過 50 ms，就改以 CSS 門完成開門 |

`js/door.js` 檔案開頭另有 `WEBGL_TIMEOUT_MS = 3000`（Three.js 載入逾時，毫秒）。

## 測試參數

- `?nodoor`：跳過開門，直接看內容（不載入任何 WebGL 相關檔案）。
- `?nowebgl`：強制使用 CSS 門，不載入 `door-webgl.js` 與 Three.js。
- 兩者僅供開發使用，不在介面上露出。可觀察 `<html>` 上的 `data-door`（`ready`／`opening`／`done`）與 `data-door-mode`（`css`／`webgl`）確認目前走哪條路。

## 待確認事項（目前設定）

以下項目尚待確認，**目前均為文件指定的預設值**：

| 項目 | 目前預設值 | 調整位置 |
|---|---|---|
| 門的樣式 | 簡潔木門，單開，門把在右，向內開 | 顏色：`--door-wood-*`、`--door-frame-color` 等；形狀：`js/door-webgl.js` 的場景常數 |
| 門後的光 | 暖金色，由門縫逐漸擴大 | `--door-glow*`；`LIGHT_*`、`GLOW_MAX` |
| 開門時長 | 約 1.2 秒，之後鏡頭前推約 0.8 秒 | `--door-duration`、`--door-camera-duration` |
| 開門後轉場 | 鏡頭穿過門口、畫面淡出、內容淡入 | `CAM_END_Z`、`--door-fade-duration` |
| 從其他頁返回首頁時是否重新開門 | 是 | `js/door.js` 的 `pageshow` 處理 |
| Three.js 載入逾時 | 3 秒 | `js/door.js` 的 `WEBGL_TIMEOUT_MS` |

## 計畫暫定值（文件未明訂）

| 項目 | 暫定值 | 依據 |
|---|---|---|
| 門高占視窗高度 | 75% | 提案一 §3.3 範圍 70–80% 的中間值 |
| 場景淡出／減少動態效果的淡出 | 0.6 秒／0.3 秒 | 文件未指定／文件上限 |
| 開門角度、透視距離（CSS 門） | 100°、1200px | 提案一 §3.3 |
| 幀時間後援 | 最近 5 格平均 > 50 ms | 提案三 §3.7（幀數為暫定） |
| 淡入替換時長 | 0.3 秒 × 2 階段 | 文件未指定 |
| Three.js 版本 | 0.186.1 | 規劃時的最新穩定版 |
| 內容 | 中性佔位文字，無照片 | 文件未提供內容 |

## 自 v01 複製的部分

來源為 v01 的 commit `ea1ba05`。複製之後兩者各自獨立，修改 v01 不會影響本資料夾。

| 內容 | 處理 |
|---|---|
| `index.html`：`<head>`（含安全網 inline script）、`.door-scene` 完整結構、`<main>` 內容 | 原樣複製；只在 `.door-scene` 內、門框之前加入一個空的 `<div class="door-webgl" aria-hidden="true">` |
| `css/door.css` 整份 | 原樣複製；`:root` 新增 v03 變數，門框的 `z-index` 由 1 改為 2（讓 WebGL 疊層位於門框之下、按鈕之上不被遮住），檔尾追加 WebGL 疊層區塊 |
| `js/door.js` 整份 | CSS 門的開門、淡出、焦點、`inert`、捲動鎖、`?nodoor`、`pageshow`、減少動態效果都保留；新增 WebGL 調度 |
| `README.md` 的 CSS 變數表、`?nodoor`、部署注意事項 | 併入本文件；自測結果全部重測 |

## 與提案示意的差異與理由

1. **Three.js 以 esbuild 一次性打包**，而非 vendoring 兩個原始檔（見上）。網站本身仍無建置步驟。
2. **CSS 門的透視寫在 `.door-leaf` 自己的 `transform` 內**（同 v01）：提案示意的 `perspective` 放置位置不會作用到門板。
3. **WebGL 在首次內容繪製（FCP）之後才開始載入**：`door.js` 在 `load` 事件之後，等到 `paint` 效能項目出現 `first-contentful-paint`（不支援或逾時 1.5 秒則直接開始），才動態 `import()`；自測確認兩個模組請求都晚於 FCP。
4. **兩階段淡入替換**：階段一畫布在 CSS 門下方淡入；階段二 CSS 門淡出，露出下方的 WebGL 門。兩階段都完成之後才算「就緒」，期間點擊一律以 CSS 門開門並取消 WebGL，避免同時看到兩扇門。
5. **鏡頭視野角由按鈕（CSS 門）的實際大小反算**，因此不論視窗尺寸，關門時 WebGL 門與 CSS 門的位置與大小一致（自測：中心差 ≤ 4 px）。視窗尺寸改變時重新計算並重畫一次。
6. **按鈕維持在最上層並保持透明**，不使用 `opacity: 0`，所以鍵盤 focus 外框在 WebGL 模式下仍清楚可見。CSS 門的視覺子元素（門板、門框邊框）在 `.webgl-active` 時淡出；過渡只寫在 `.webgl-active` 之下，退回 CSS 門時是瞬間還原。
7. **場景淡出**在 WebGL 模式下只淡出、不放大（鏡頭已穿過門口）。
8. **門框只有 3 個 `BoxGeometry`**（左、右、上），下緣就是牆面與地板的交界，與提案 §3.4 一致；CSS 門的門框有 4 邊，淡入替換時下緣會有些微差異。
9. **保險計時器**：WebGL 開門動畫若停擺（例如分頁在背景），超過「開門＋鏡頭時長＋3 秒」就中止並改以 CSS 門完成。
10. 初始化分成數個工作並在中間讓出主執行緒（`setTimeout`），降低單一長任務的機會。

## 自測結果

- 日期：2026-09-30。環境：容器內 Chromium（Playwright，headless）；**沒有 GPU，WebGL 由 SwiftShader 軟體渲染**，其耗時與像素數成正比，不代表實機。站台以本機伺服器提供，放在 `/a/b/v03/` 的子路徑下測試，同時只放入 `v03/` 一個資料夾。
- 自測腳本：儲存庫根目錄的 `tools/test/v03.mjs`（`node tools/test/v03.mjs`，共 66 項通過、0 項未通過）；靜態檢查 `tools/check-static.sh v03`；檔案量 `tools/check-size.sh v03 35840`；Lighthouse `node tools/lighthouse.mjs v03 [?nowebgl]`。這些都在 `tools/`，不屬於本資料夾。
- 因為容器是軟體渲染：在 640×800 以上的視窗，預設門檻（最近 5 格平均 > 50 ms）會觸發「改以 CSS 門」——這正好驗證了後援機制。要在大視窗驗證 WebGL 流程本身，測試時透過請求攔截把 `SLOW_FRAME_MS` 拉高；程式本身沒有為測試而修改。

| 驗收項目 | 結果 | 證據 |
|---|---|---|
| 桌機 Chrome、Safari、Firefox：WebGL 門可正常開啟，鏡頭穿過門口後淡出到內容 | 通過（僅 Chromium，軟體渲染）；Safari、Firefox **未驗證（需實機）** | 320×568 以預設門檻走完整個 WebGL 流程；1280×800、1920×1080 在拉高幀時間門檻後走完 WebGL 流程（`data-door-mode` 保持 `webgl`）。我另外用固定時鐘逐格截圖，目視確認開門角度、透視、門後空間與鏡頭前推 |
| iPhone Safari、Android Chrome，直式與橫式：門置中、比例正確、不被網址列裁切 | **未驗證（需實機）**；版面數值已於 Chromium 驗證 | CSS 門在 8 種視窗尺寸（320×568 至 2560×1080）下：中心差 ≤ 2 px、寬高比 2.1 ± 2%、高 ≤ 80%、寬 ≤ 80%；WebGL 門與按鈕的中心差 ≤ 4 px、寬度比 0.99；調整視窗尺寸後仍一致。人工步驟：實機開啟、上下滑動使網址列伸縮，確認門不被裁切、WebGL 門仍與 focus 外框對齊；並確認 iOS 的 WebGL 記憶體與幀率 |
| Slow 4G：CSS 門立即出現；Three.js 載入前點擊可直接開門 | 通過 | CDP 節流（Slow 4G）下，載入 Three.js 之前 CSS 門已可見、`data-door-mode="css"`、沒有 canvas；此時點擊直接以 CSS 門完成開門；之後晚到的模組不會建立 canvas，也沒有 console 錯誤 |
| `?nowebgl` 與實際停用 WebGL 時，CSS 門完整可用 | 通過 | `?nowebgl`：重跑 v01 的版面矩陣、鍵盤、狀態、無 JS、返回、殘留 rAF、網路、安全網、計時後援等全部項目皆通過；`getContext('webgl'/'webgl2')` 回傳 `null` 時，沒有任何 `door-webgl.js`／`vendor/three` 請求，點擊後完成開門 |
| 「減少動態效果」時不載入 Three.js，改為淡出 | 通過 | 沒有 `door-webgl.js`／`vendor/three` 請求；點擊到完成 303 ms；動畫期間門板變形值不變 |
| 鍵盤：Tab 聚焦、Enter／空白鍵開門、焦點在主要內容（CSS 與 WebGL 兩種模式） | 通過 | CSS 模式（`?nowebgl`）與 WebGL 模式各測 Enter、Space；WebGL 模式下 focus 外框像素為 rgb(255,224,138)（亮黃），在 WebGL 門旁清楚可見；完成後 `document.activeElement.id === 'content'`、`inert` 已移除。螢幕閱讀器朗讀需人工確認 |
| 停用 JavaScript 時直接看到內容 | 通過 | 場景不可見、`<main>` 可見且無 `inert`、佔位文字齊全 |
| 進入內容後 canvas 已移除，Performance 面板沒有持續渲染 | 通過 | 完成後 `document.querySelectorAll('canvas').length === 0`；先前取得的 canvas 已脫離文件，且 `getContext('webgl2').isContextLost()` 為 `true`（GPU 記憶體已歸還）；2 秒內 rAF 呼叫數不變（240 → 240）、`document.getAnimations().length === 0`。WebGL 就緒後、點擊前，2 秒內 rAF 也不增加（隨需渲染）。DevTools Performance 面板的人工確認建議在實機做一次 |
| 除照片外沒有點陣圖請求 | 通過 | 請求監聽：無 image 類型與 `.ico`／`.png` 等；所有請求同源，且都在 `/a/b/v03/` 之下；`CanvasTexture` 不產生網路請求 |
| Lighthouse 行動版效能 ≥ 85（WebGL 版本），並記錄與提案一的差距 | **未通過（容器內 73；需實機確認）** | 見下方「Lighthouse」 |
| 自訂程式碼 ≤ 35 KB（gzip，不含 `vendor/`） | 通過 | 見下方「檔案量」 |
| 載入 Three.js 不得延後首次內容繪製 | 通過 | 兩個模組請求的開始時間（107、112 ms）晚於 FCP（88 ms）與 `load` 事件（57 ms）；CSS 門在載入 Three.js 之前已出現 |
| 場景總面數 < 5,000 | 通過 | 486 個三角形（22 個幾何體、3 個紋理；紋理 ≤ 256×256） |
| 幀時間後援、`webglcontextlost` | 通過 | 640×800 軟體渲染下最近 5 格平均 > 50 ms，自動改以 CSS 門完成（`data-door-mode`：`webgl` → `css`）；開門途中以 `WEBGL_lose_context` 使環境遺失：立即改以 CSS 門完成；點擊之前遺失：立即切回 CSS 門（CSS 門完整顯示、canvas 移除），之後可正常開門 |
| 載入逾時 3 秒、競態 | 通過 | 模組延遲 3.8 秒回應：維持 CSS 門，晚到的模組被丟棄、沒有 canvas；淡入替換期間點擊：改以 CSS 門，WebGL 被取消 |
| 子路徑部署、資料夾獨立 | 通過 | 只複製 `v03/` 到 `/a/b/v03/` 測試；靜態檢查無絕對路徑、`<base>`、外部網址、跨資料夾引用；`js/door-webgl.js` 只以相對路徑匯入 `../vendor/three/three.custom.min.js` |
| 返回首頁重新開門 | 部分驗證 | 一般返回導覽：門重新出現；合成 `pageshow`（`persisted: true`）：門重設、WebGL 重新就緒、只有一個 canvas、可再次開門。真實 bfcache（Safari／Firefox）**未驗證（需實機）** |

軟體渲染下的 WebGL 開門幀時間（含淡出，僅記錄）：320×400 中位數 16.7 ms／平均 17.6 ms；320×568 中位數 16.7 ms／平均 21.6 ms／最大 50.0 ms；480×600 中位數 16.8 ms／平均 27.3 ms／最大 66.7 ms。大於此尺寸時，軟體渲染的單格耗時超過 50 ms（640×800 約 50–130 ms），會觸發 CSS 後援。實機有 GPU 時不受此限制，但**實際幀率仍未驗證**。

## 檔案量與 Lighthouse

**檔案量**（gzip -9，不含 `vendor/`）：

| 檔案 | 原始 | gzip |
|---|---|---|
| `index.html` | 2,493 B | 1,092 B |
| `css/door.css` | 8,885 B | 3,278 B |
| `js/door.js` | 6,239 B | 2,627 B |
| `js/door-webgl.js` | 13,272 B | 5,281 B |
| 合計 | | 12,278 B（約 12.0 KB），預算 35 KB |

`vendor/three/three.custom.min.js`：524.6 KB，gzip 131.7 KB（另計，預算不含）。Lighthouse 量到的總傳輸量：預設 144.9 KB、`?nowebgl` 7.5 KB。

**Lighthouse**（行動版、本機 gzip 伺服器、容器內 headless、各 3 次；容器內測得，與實機有差異）：

| 版本 | 3 次分數 | 中位數 | FCP／LCP／TBT（中位數） |
|---|---|---|---|
| v03 預設（含 WebGL） | 73、73、74 | **73** | 756 ms／953 ms／1,759 ms |
| v03 `?nowebgl`（CSS 門） | 100、100、100 | 100 | 759 ms／956 ms／0 ms |
| v01（提案一，供對照） | 100、100、100 | 100 | 756 ms／972 ms／0 ms |

與提案一的差距：**−27 分**（100 → 73），差異幾乎全是 TBT（總阻塞時間）。FCP、LCP 與 v01 相同，因為 Three.js 在 FCP 之後才載入。

**未達 ≥ 85 的原因與限制**：Lighthouse 的長任務明細顯示，TBT 主要來自 `door-webgl.js` 的一個約 1.5 秒的長任務；同一份追蹤中，JavaScript 本身只佔約 8 ms，其餘落在「Other」（原生程式）——容器沒有 GPU，著色器編譯與繪製由 SwiftShader 在同一個行程內以軟體執行，並被 Lighthouse 的 4 倍 CPU 節流放大。另外在 4 倍節流下實測，Three.js 模組的解析與執行約 0.28 秒、建立 renderer 約 0.09 秒、建立場景約 0.05 秒、著色器編譯約 0.1 秒、第一格約 0.12 秒。在有 GPU 的實機上，這些原生耗時應大幅下降，但**這是推論，未經驗證**；請在實機以 Lighthouse 重測。目前已做的緩解：FCP 之後才載入、初始化分段讓出主執行緒、先在畫布透明時渲染第一格。若實機仍低於 85，可考慮的方向（需另行決定，本版未採用）：把載入時機延到使用者與頁面互動之後（代價是多數使用者會先看到 CSS 門），或進一步縮減用到的 Three.js 類別。
