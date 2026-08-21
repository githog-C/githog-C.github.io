# sub-NF v1.4.0 修改紀錄與交接筆記

| 項目 | 內容 |
|---|---|
| 日期 | 2026-08-22 |
| 版本 | 1.3.0 → **1.4.0** |
| 交付物 | `sub-NF-Chrome-1.4.0.zip`（20 個檔案） |
| 測試 | `node test/run-tests.js` ── **86 條全數通過**（原 75 條，新增 11 條） |
| 修改檔案 | `src/inject.js`、`src/content.js`、`popup/popup.js`、`test/run-tests.js`、`manifest.json`、`README.md` |

---

## 一、關鍵決策摘要

1. **維持原架構，不重寫。**「攔截 manifest → 自行下載兩軌 → 自繪疊加層」是正確做法（與 Subadub、Language Reactor 同路）；Netflix 原生選單的圓鈕僅作為選擇介面。失敗不是架構問題，而是欄位名過期。
2. **新舊欄位並收，不做切換。**Netflix 可能分區、分批推送格式；舊名保留的成本為零，卻能避免任何一批使用者退回失效狀態。
3. **「搜尋而非寫死」處理請求端。**在 `JSON.stringify` 掛鉤中以「鍵名或已知內容」辨識 `profiles` 陣列，不寫死屬性路徑──這是現行 Subadub 用血淚換來的策略，因為 Netflix 連請求端的屬性名也常改。
4. **每個修正點都補上單元測試**，且測試 fixture 的形狀直接鏡射現行 Subadub 讀到的實際 manifest。

---

## 二、根本原因（為什麼 1.3.0 一軌都抓不到）

Netflix 更改了播放器 manifest 的欄位名稱。以 2026-08-22 抓取、現行可正常運作的開源擴充功能 **Subadub v0.1.12** 原始碼交叉證實：

| 舊欄位（1.3.0 唯一認得的） | 新欄位（現行 Netflix） | 用途 |
|---|---|---|
| `timedtexttracks` | `textTracks` | 字幕軌陣列 |
| `ttDownloadables` | `downloadables` | 各軌可下載格式表 |
| `new_track_id` | `id` | 軌道識別碼 |

連鎖失效過程：

1. **路徑 2～4 全滅**──`scan()` 與兩處字串嗅探的閘門都只認 `timedtexttracks`，新格式的 manifest 經過時完全比對不到。
2. **路徑 1 的保險絲形同虛設**──播放器 API（`getTimedTextTrackList()`）回傳的軌道清單**不含下載網址**，`normaliseTracks()` 中 `pickFormat()` 找不到 downloadables 便逐軌丟棄，最終回傳空陣列。
3. **次要缺口：請求端沒開口要 WebVTT。**manifest 只會「提供」播放器請求時列在 `profiles` 陣列裡的格式；現在的播放器已不會自行索取 `webvtt-lssdh-ios8`。1.3.0 從未掛鉤 `JSON.stringify` 補上這一項，因此即使認得新欄位，`downloadables` 裡也可能沒有任何我方能穩定解析的格式。

一個值得記下的細節：`normaliseTracks()` 內部其實早已寫成 `pickFormat(t.ttDownloadables || t.downloadables)`（1.3.0 第 87 行），也就是 downloadables 這一項改名**本來就能容忍**──但入口閘門把整包 manifest 擋在外面，這行好牌從未有機會打出。

---

## 三、逐檔修改紀錄（前後對照與原因）

### 3.1 `src/inject.js`──頁面世界攔截層（八處）

#### （1）新增：`WEBVTT_PROFILE`、`KNOWN_PROFILES`、`findProfilesArray()`

```javascript
const WEBVTT_PROFILE = 'webvtt-lssdh-ios8';
const KNOWN_PROFILES = [
  'heaac-2-dash', 'heaac-2hq-dash',
  'playready-h264mpl30-dash', 'playready-h264mpl31-dash',
  'playready-h264hpl30-dash', 'playready-h264hpl31-dash',
  'vp9-profile0-L30-dash-cenc', 'vp9-profile0-L31-dash-cenc',
  'dfxp-ls-sdh', 'simplesdh', 'nflx-cmisc', 'BIF240', 'BIF320',
];

// Pure: find the "profiles" array anywhere inside a request object.
function findProfilesArray(obj, seen, depth, budget) {
  if (!obj || typeof obj !== 'object') return null;
  seen = seen || new Set();
  depth = (depth == null) ? 8 : depth;
  budget = budget || { n: 2000 };
  if (depth < 0 || budget.n-- <= 0 || seen.has(obj)) return null;
  seen.add(obj);
  for (const key of Object.keys(obj)) {
    let v;
    try { v = obj[key]; } catch (_) { continue; }
    if (Array.isArray(v)) {
      if (key === 'profiles'
        || v.some((x) => typeof x === 'string' && KNOWN_PROFILES.indexOf(x) !== -1)) {
        return v;
      }
      for (const item of v) {
        if (item && typeof item === 'object') {
          const hit = findProfilesArray(item, seen, depth - 1, budget);
          if (hit) return hit;
        }
      }
    } else if (v && typeof v === 'object') {
      const hit = findProfilesArray(v, seen, depth - 1, budget);
      if (hit) return hit;
    }
  }
  return null;
}
```

**原因：**這是為出站掛鉤（見第 2 點）服務的搜尋器。雙判準──鍵名是 `profiles`，**或**陣列內容含任一已知 profile 字串──意味著即使 Netflix 把 `profiles` 改名成別的，只要陣列裡還裝著那些格式字串就照樣找得到。深度上限 8、節點預算 2000、`Set` 防循環三道保險缺一不可：這個函式會在**頁面所有的** `JSON.stringify` 呼叫裡執行，必須有硬性上界保證永不拖慢或卡死 Netflix 本身。

#### （2）新增：`JSON.stringify` 出站掛鉤

```javascript
// Outbound: put WebVTT on the manifest request's shopping list. Without
// this the manifest never OFFERS a WebVTT downloadable, and (post-2025
// schema) may offer nothing parseable at all.
const _stringify = JSON.stringify;
JSON.stringify = function (value) {
  try {
    if (value && typeof value === 'object') {
      const profiles = findProfilesArray(value);
      if (profiles && profiles.indexOf(WEBVTT_PROFILE) === -1) {
        profiles.unshift(WEBVTT_PROFILE);
        diag.profiles++;
      }
    }
  } catch (_) { /* never break the site */ }
  return _stringify.apply(this, arguments);
};
```

**原因：**manifest 是「你要什麼、我給什麼」的協議；補上 `webvtt-lssdh-ios8` 才能保證回應裡有 WebVTT 下載連結。`indexOf` 先查重確保冪等（同一物件被 stringify 兩次不會重複插入）；`unshift` 置頂表達優先；`diag.profiles++` 供 popup 觀測；整段 try/catch 包覆，並以 `_stringify.apply(this, arguments)` 原樣轉呼叫，保留 replacer 與縮排參數的原始語意──掛鉤的鐵律是絕不弄壞宿主網站。

#### （3）`tracksFromManifest()`──接受兩代欄位

修改前（1.3.0）：

```javascript
function tracksFromManifest(result) {
  if (!result || !result.movieId || !Array.isArray(result.timedtexttracks)) return [];
  return normaliseTracks(result.timedtexttracks);
}
```

修改後（1.4.0）：

```javascript
function tracksFromManifest(result) {
  if (!result || !result.movieId) return [];
  const list = Array.isArray(result.textTracks) ? result.textTracks
    : Array.isArray(result.timedtexttracks) ? result.timedtexttracks
      : null;
  if (!list) return [];
  return normaliseTracks(list);
}
```

**原因：**核心修正之一。新版 `textTracks` 優先、舊版 `timedtexttracks` 保留為後備，兩者都要求 `movieId` 在場（去重與快取都以它為鍵）。

#### （4）`normaliseTracks()`──id 鏈補上新欄位

修改前：

```javascript
id: String(t.new_track_id || t.trackId || t.track_id || (language + ':' + rawType)),
```

修改後：

```javascript
id: String(t.new_track_id || t.id || t.trackId || t.track_id || (language + ':' + rawType)),
```

**原因：**`new_track_id` 已改名為 `id`。這個識別碼用於「圓鈕釘選特定軌」（`primaryTrackId`／`secondaryTrackId`）與 `send()` 的去重鍵；取不到會退回 `language:type` 合成鍵，同語言的 CC 軌與一般軌有相撞風險。此函式其餘部分（含 `ttDownloadables || downloadables`）本已容忍新名，毋須更動。

#### （5）`scan()`──路徑 2 與路徑 3（`.json()`）的總閘門

修改前：

```javascript
let result = null;
if (value.result && value.result.timedtexttracks) result = value.result;
else if (value.timedtexttracks && value.movieId) result = value;
```

修改後：

```javascript
const looksLikeManifest = (o) => !!(o && o.movieId
  && (Array.isArray(o.timedtexttracks) || Array.isArray(o.textTracks)));
let result = null;
if (looksLikeManifest(value.result)) result = value.result;
else if (looksLikeManifest(value)) result = value;
```

**原因：**核心修正之二。舊寫法對新 manifest 永遠判 false，路徑 2（`JSON.parse` 掛鉤）與路徑 3 前半（`Response.prototype.json`）因此全盲。抽成 `looksLikeManifest()` 輔助函式，一次涵蓋兩代欄位、統一要求 `movieId`，並補上 `Array.isArray` 型別檢查（舊版只做 truthy 檢查，較鬆散）。

#### （6）`Response.prototype.text` 嗅探條件

修改前：

```javascript
if (typeof s === 'string' && s.indexOf('timedtexttracks') !== -1) {
  scan(_parse(s), 'response');
}
```

修改後：

```javascript
if (typeof s === 'string' && s.indexOf('movieId') !== -1
  && (s.indexOf('timedtexttracks') !== -1 || s.indexOf('"textTracks"') !== -1)) {
  scan(_parse(s), 'response');
}
```

**原因：**`.text()` 回傳字串，得先用廉價的 `indexOf` 預篩、命中才付出 `JSON.parse` 整包 manifest 的成本。兩個刻意的細節：其一，`'"textTracks"'` 帶引號比對而非裸字串──`textTracks` 是 HTML5 video 標準 API 名稱，頁面上出現該字樣的機率遠高於舊時代的 `timedtexttracks`，帶引號可鎖定「JSON 鍵名」語境；其二，加上 `movieId` 作第二道條件，把誤 parse 率再壓一層。

#### （7）XHR 載入掛鉤嗅探條件

修改前後與第（6）點完全相同（`'timedtexttracks'` 單條件 → `movieId` ＋ 雙欄位條件），位於 `XMLHttpRequest.prototype.send` 的 load 監聽器內。

**原因：**路徑 3 與路徑 4 是對稱設計，嗅探條件必須一致；否則會出現「resp 有數字、xhr 恆為 0」這種令人誤判 XHR 掛鉤壞掉的除錯陷阱。

#### （8）匯出與診斷計數器

```javascript
module.exports = { pickUrl, pickFormat, normaliseTracks, tracksFromManifest, findProfilesArray };
// ...
const diag = { manifest: 0, playerApi: 0, json: 0, response: 0, xhr: 0, profiles: 0 };
```

**原因：**`findProfilesArray` 是純函式，匯出後可在 Node 下直接單元測試；`diag.profiles` 讓出站掛鉤的行為變得可觀測（見 3.3）。

### 3.2 `src/content.js`──isolated world 內容腳本（三處）

#### （1）新增：`movieIdFromDom()`

```javascript
// Netflix marks a player DOM node with data-videoid. Current Subadub reads
// the playing title's id from here rather than the URL — the /watch/ URL
// can lag behind (autoplay into the next episode) or hold a different id
// than the manifest was keyed under.
function movieIdFromDom() {
  try {
    const el = document.querySelector('*[data-videoid]');
    const v = el && el.dataset ? el.dataset.videoid : null;
    return v ? String(v) : null;
  } catch (_) { return null; }
}
```

**原因：**現行 Subadub 的原始碼註解明言「從 URL 取影片 id 已不可靠」──自動連播下一集時 `/watch/` 網址會落後於實際播放內容，或與 manifest 鍵下的 id 不一致。`data-videoid` 屬性由 Netflix 播放器節點自帶，是「此刻真正在播什麼」的權威來源。回傳統一轉 `String`，與 `catalogues` Map 的字串鍵型別一致。

#### （2）`currentCatalogue()`──候選 id 走訪鏈

修改前：

```javascript
function currentCatalogue() {
  const id = currentMovieId || movieIdFromUrl() || lastMovieId;
  if (id && catalogues.has(id)) { currentMovieId = id; return catalogues.get(id); }
  if (lastMovieId && catalogues.has(lastMovieId)) { currentMovieId = lastMovieId; return catalogues.get(lastMovieId); }
  return null;
}
```

修改後：

```javascript
function currentCatalogue() {
  for (const id of [currentMovieId, movieIdFromUrl(), movieIdFromDom(), lastMovieId]) {
    if (id && catalogues.has(id)) { currentMovieId = id; return catalogues.get(id); }
  }
  return null;
}
```

**原因：**改為依序走訪四個候選、第一個在目錄中命中者獲勝；順序即可信度──已確認值＞網址＞DOM＞最後收到的 manifest。舊版的兩段式寫法既漏掉 DOM 來源，又有重複邏輯。

#### （3）`onNav()` 與 `boot()` 的初始 id（第 673、706 行）

```javascript
currentMovieId = movieIdFromUrl() || movieIdFromDom();
```

**原因：**導航事件與開機時的初始判定同樣需要 DOM 後援，否則在網址尚未更新的瞬間會掛在舊集數的 id 上，`currentCatalogue()` 一步就查錯目錄。

### 3.3 `popup/popup.js`──診斷面板（一處）

新增一列（緊接「各路徑」之後）：

```javascript
list.appendChild(row('已補上 WebVTT 的請求數', p.profiles || 0, cls((p.profiles || 0) > 0)));
```

**原因：**可觀測性。若 Netflix 日後再改請求物件的結構導致 `findProfilesArray` 落空，此計數恆為 0 就是第一個警訊──使用者截一張診斷面板圖，就能遠端把故障切在「出站」或「入站」哪一側。

### 3.4 `test/run-tests.js`──新增 11 條測試

匯入行補上 `findProfilesArray`；新增 fixture `NEW_SCHEMA`（形狀鏡射現行 Subadub 讀到的實際 manifest：`textTracks`＋`downloadables['webvtt-lssdh-ios8'].urls[0].url`＋`id`，含 None 軌與 forced 軌各一）。新測試與目的：

| # | 測試名 | 驗證什麼 |
|---|---|---|
| 1 | new schema: textTracks accepted | 新欄位可取出 3 軌（原始 4 軌含 None） |
| 2 | new schema: downloadables + urls[0].url read | 新版下載網址讀取路徑正確 |
| 3 | new schema: track id comes from t.id | id 鏈的新欄位生效 |
| 4 | new schema: CC flag from rawTrackType | CC 判定在新格式下不變 |
| 5 | new schema: none track skipped, forced kept but flagged | None 軌剔除、forced 保留但標記 |
| 6 | old schema still accepted alongside | 回歸保護──舊格式不因新增而破壞 |
| 7 | findProfilesArray finds by key "profiles" | 鍵名判準 |
| 8 | findProfilesArray finds by known contents under any key | 改名防禦──鍵被改名仍可依內容命中 |
| 9 | findProfilesArray leaves unrelated objects alone | 誤判防禦──普通物件回 null |
| 10 | findProfilesArray survives a cyclic object | 掛鉤安全性──循環引用不當機 |
| 11 | hook behaviour: unshift adds WebVTT once | 冪等性──重複 stringify 不重複插入 |

**結果：86 條全數通過**（原 75 條）。另以 Node 對 `vtt.js`／`inject.js`／`content.js`／`popup.js`／`background.js` 做語法健檢，均通過。

### 3.5 `manifest.json`

`"version": "1.3.0"` → `"1.4.0"`。**原因：**行為變更（新增出站掛鉤、DOM id 來源）值得一個次版號，也方便在 `chrome://extensions` 一眼確認載入的是修正版。

### 3.6 `README.md`（兩處）

其一，檔頭新增 1.4.0 版本紀錄引言區塊，完整記載「為何 1.3.0 一軌都抓不到」與修法；其二，「四條擷取路徑」章節補述出站 `JSON.stringify` 掛鉤（含「以搜尋而非寫死路徑辨識 profiles」的理由）與「所有掛鉤同時接受新舊兩代欄位名」。**原因：**文件與程式同步，日後維護不必重新考古。

---

## 四、貫穿全案的設計原則

1. **新舊並收，永不切換**──相容成本為零，卻能吸收 Netflix 分批推送造成的地區差異。
2. **辨識靠特徵，不靠路徑**──`findProfilesArray` 的鍵名／內容雙判準，是對「Netflix 常改屬性名」這個既成事實的結構性回應。
3. **掛鉤三鐵律**──有硬性上界（深度、預算、防循環）、全程 try/catch、原樣轉呼叫；任何情況下不得影響宿主網站。
4. **嗅探先廉後貴**──字串 `indexOf` 預篩通過才 `JSON.parse`；條件收緊（帶引號、加 `movieId`）以降低誤判成本。
5. **每個判斷點都可觀測**──四路徑計數＋profiles 計數，讓下一次故障能憑一張截圖切半定位。

---

## 五、已驗證與待辦

**已完成（沙箱內）：**單元測試 86／86、五檔語法健檢、`manifest.json` JSON 驗證、打包 `sub-NF-Chrome-1.4.0.zip`（保留 `Chrome/` 資料夾名，便於原地覆蓋）。

**待使用者實機驗證：**

1. `chrome://extensions` 移除舊版（或直接覆蓋後按重新載入），以「載入未封裝項目」載入解壓後的 `Chrome/` 資料夾，確認版號顯示 1.4.0。
2. 開任一影片播放數秒，展開 popup「診斷」：應見「抓到字幕軌」＞ 0、「已補上 WebVTT 的請求數」＞ 0、「各路徑」至少一項非 0。
3. 照常操作：popup 選語言，或在 Netflix 字幕選單以每列右側圓鈕勾選兩種語言。

**若仍失敗：**「各路徑」全為 0 代表 Netflix 又動了別處──請截圖診斷面板回報，計數器的分佈即可切半定位（profiles 為 0 → 出站請求結構又改；profiles ＞ 0 但四路徑全 0 → 入站閘門或欄位再改名）。

**已知限制：**本次修正於沙箱完成，無法連線 Netflix 實測；新欄位名的依據為 2026-08-22 抓取的現行 Subadub v0.1.12 原始碼（訓練知識截至 2026 年 1 月，以現行程式碼為準）。

---

## 六、交接筆記（給下次會話）

- **工作目錄** `/home/claude/ext/Chrome/` 為會話容器，跨會話不保存；權威版本是使用者手上的 `sub-NF-Chrome-1.4.0.zip`。下次請重新上傳 zip 再續作。
- **關鍵函式位置（v1.4.0 行號）：**`findProfilesArray`（inject.js:51）、`pickFormat`（:100）、`normaliseTracks`（:128）、`tracksFromManifest`（:166）、`scan`／`looksLikeManifest`（:254）、stringify 掛鉤（:272）；`movieIdFromDom`（content.js:159）、`currentCatalogue`（:167）、`onNav`／`boot` 初始 id（:673、:706）。
- **Netflix 再改名時的最小修改面（共五點，皆有測試覆蓋）：**`looksLikeManifest` 的欄位檢查、`tracksFromManifest` 的 list 選擇、`Response.text` 與 XHR 兩處嗅探字串、`normaliseTracks` 的 id／downloadables 鏈。
- **測試指令：**`node test/run-tests.js`（純 Node，無需瀏覽器）。
- **參考基準：**Subadub 的 `page_script.js`（`findSubtitlesProperty` 與 `data-videoid` 讀取即本次兩項核心手法的出處）；本次抓取暫存於容器 `/tmp/sub_*.js`，會話結束即失效，需要時重新自 GitHub 取得。
- **診斷欄位速查：**`api`／`json`／`resp`／`xhr`＝四條入站路徑各自命中次數；`profiles`＝出站補格式次數。

---

## 七、參考資料

- Subadub（rsimmons）──本次 schema 依據與兩項手法出處：<https://github.com/rsimmons/subadub>
- Chrome 擴充功能 content scripts 的 `world` 欄位（MAIN／ISOLATED）：<https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts>
- NflxMultiSubs（雙字幕技術先例，已停止維護）：<https://github.com/dannvix/NflxMultiSubs>
