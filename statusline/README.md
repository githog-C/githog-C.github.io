<!-- 公開版：已移除個人授權指令、個人記憶與機器路徑，保留技術做法與實測結果。路徑以 <工作目錄>＝放工具的資料夾、<使用者家目錄>＝C:\Users\<帳號> 表示。 -->

# statusline —— Claude Code 終端機底部計數器

在 Claude Code 輸入框下方常駐顯示一行：

```
CC 92,768 · 剩 868,598 87% · NT$95
```

| 欄位 | 意思 | 資料來源 |
|---|---|---|
| `CC` | 本次工作階段 Claude 累計輸出的 token 數（千分位、不縮寫、`/compact` 不歸零） | 讀對話紀錄檔（transcript）逐筆加總 |
| `剩` | 脈絡視窗還剩多少 token 與百分比 | Claude Code 傳入的 `context_window`（視窗大小＋最新一輪用量） |
| `NT$` | 本次工作階段花費換算新台幣（四捨五入取整） | Claude Code 傳入的 `cost.total_cost_usd` × 美元兌新台幣匯率 |

剛開新工作階段或 `/clear` 之後會顯示 `CC 0 · 剩 1,000,000 100% · NT$0`（1M 脈絡模型）或 `剩 200,000`（一般模型），屬正常。

## 安裝

需求：Node.js 18 以上（只用內建模組，**不需安裝任何套件**）。

1. 把 `tools\tokens.js` 放到 `<工作目錄>\_tools\statusline\tokens.js`。
2. 編輯 `<使用者家目錄>\.claude\settings.json`，加入（路徑用正斜線）：

   ```json
   "statusLine": {
     "type": "command",
     "command": "node <工作目錄>/_tools/statusline/tokens.js"
   }
   ```

3. 重開 Claude Code。

**驗證 JSON 請用 node，不要用 Windows PowerShell 5.1**：`Get-Content -Raw` 會以系統編碼讀 UTF-8 檔，把中文打亂後誤報「JSON 解析失敗」。

左下角空白時依序查：重開過了沒 → `node` 在不在 Claude Code 繼承的 PATH（PowerShell 找得到不代表 Claude Code 找得到，必要時把 command 改成 node 的絕對路徑）→ 用下面的假資料手動餵腳本看輸出。

## 手動測試

```bash
echo '{"cost":{"total_cost_usd":1},"context_window":{"context_window_size":1000000,"current_usage":{"input_tokens":2,"cache_creation_input_tokens":500,"cache_read_input_tokens":130000,"output_tokens":900}}}' | node tokens.js
```

應輸出類似 `CC 0 · 剩 868,598 87% · NT$32`（沒給 transcript 路徑，所以 `CC` 為 0）。

## 匯率

- **來源**：期貨交易所開放資料 API `https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates`，列於政府資料開放平臺第 11339 號資料集「每日外幣參考匯率」，授權為政府資料開放授權條款第 1 版。取回傳資料中日期最新一筆的 `USD/NTD`。
- **不是盤中即時價**：這是每日參考匯率，最新一筆通常是前一個營業日。
- **每次重繪都重抓一次**，不寫任何快取檔；抓取逾時 1.5 秒。
- **抓不到時自動改用檔頭常數 `USD_TWD`**（離線、逾時、網址失效、格式改變都算），顯示格式不變。常數請偶爾手動更新（目前為 2026-09-14 參考匯率 31.688）。
- **不想連網**：把檔頭 `RATE_URL` 改成空字串 `''`，就只用 `USD_TWD`。
- 曾評估公股銀行的牌告匯率 CSV，但該網址前有機器人驗證關卡（Challenge Validation），程式讀取會拿到驗證頁，不宜用來自動抓取，故不採用。

## 設計取捨與注意事項

- **不留任何狀態檔**：每次重繪從頭掃對話紀錄檔。實測 18 MB 紀錄檔含抓匯率約 0.7 秒、一般工作階段 0.6～0.9 秒；極長工作階段會有延遲，這是不留快取的代價。
- **`剩` 的算法**：視窗大小 −（最新一輪的輸入＋快取寫入＋快取讀取＋輸出 token）。含輸出是因為這一輪的回覆下一輪就會佔進脈絡，因此會比 Claude Code 內建百分比（只算輸入）略少一點。`/compact` 後到下一次回應前，Claude Code 傳入的用量為空，會暫時顯示 100%。
- **舊版 Claude Code 相容**：若傳入資料沒有 `context_window`，改從對話紀錄最新一筆用量推算，並依模型代號是否含 `[1m]` 判斷上限是 1,000,000 或 200,000。
- **`CC` 為什麼要掃紀錄檔**：Claude Code 傳入的 `total_output_tokens` 只有最近一輪，沒有整個工作階段的累計。
- **判斷一律走 `JSON.parse`，不可用字串比對**：對話內容本身可能出現 `"isSidechain":true`、`compact_boundary` 這些欄位名稱，字串比對會誤判。子代理（sidechain）的輸出不計入，因為它們在自己的脈絡裡跑。
- **`NT$` 是按 API 定價換算的等值金額**，訂閱制下不是實際扣款，只是帳面參考。
- **Windows 上不要在抓網路後用 `process.exit()` 強制結束**：會觸發 Node 內部斷言錯誤（`UV_HANDLE_CLOSING`）。本腳本用內建 `https` 模組，逾時時主動關閉連線，讓程序自然結束。
- 此計數器是給使用者看的；Claude 在對話中仍讀不到這些數字。
