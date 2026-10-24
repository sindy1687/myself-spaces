# 個人作品分享網站

純 HTML/CSS/JavaScript（ES Modules），無需建置。資料存於瀏覽器 IndexedDB，可同步到 Google Drive、可經由內建分享伺服器公開分享。

## 啟動

```bash
node server/share-server.cjs        # http://localhost:8000
# 或：npm start
```

分享連結 `/api/share/...` 需要這個伺服器。若只用靜態伺服器（如 `npx serve`），網站本身可用，但公開分享 API 無效。

## 測試

```bash
node test/run-tests.mjs   # 章節辨識、編碼處理等關鍵邏輯
```

## 功能

- **小說**：TXT 上傳 / 貼上文字；UTF-8、UTF-8 BOM、Big5、GB18030 編碼；自動章節辨識（第一章／第十二回／第001章／Chapter 1／序章／楔子／後記…）；匯入前章節預覽可改名、分章（新增/刪除/合併）、拖曳排序；無章節可整篇匯入。閱讀器含目錄、上下章、字體/行距/寬度、亮色/深色/護眼、書籤、全文搜尋、閱讀進度自動儲存。
- **圖片**：多張/拖曳上傳、相簿、標題/說明/替代文字/分類/標籤、裁切/旋轉/翻轉/亮度/對比/飽和度/濾鏡、另存版本不覆蓋原圖、燈箱、下載、格式與大小提示。
- **日記**：新增/編輯/刪除/草稿/預覽；標題、段落、清單、引用、連結、插入圖片；日期/心情/天氣/封面/分類/標籤；清單與月曆瀏覽、關鍵字/分類/標籤篩選。
- **分類**：主/子分類、各類型獨立或共用分類；刪除分類時選擇轉移目的地，不刪作品。
- **範本**：文藝書房／極簡畫廊／日常手帳／深夜創作，可即時預覽與一鍵切換；自訂站名、簡介、主色、頭像、封面。
- **管理後台**：作品管理、分類管理、外觀、Drive 同步、備份匯出/匯入、回收筒還原/永久刪除、移除示範資料。
- **分享**：作品預設私人；公開後產生訪客連結（`#/share/<token>`），訪客唯讀，HTML 已消毒。同步 Drive ≠ 公開分享。

## Google Drive 設定步驟

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立專案。
2. 「API 和服務」→ 啟用 **Google Drive API**。
3. 「憑證」→ 建立 **OAuth 用戶端 ID**，類型選 **網頁應用程式**。
4. 「已授權的 JavaScript 來源」加入 `http://localhost:8000`（部署後改為你的網域）。本應用使用前端 implicit flow，**不需要**重新導向 URI 與 client secret。
5. 「OAuth 同意畫面」設定為外部，加入 scope `drive`；測試階段把自己的 Gmail 加為測試使用者即可。
   （需 `drive` 而非 `drive.file`，因為要上傳到你指定的既有資料夾。）
6. 回到網站「管理 → Google Drive」貼上 Client ID → 確認「目標資料夾 ID」為 `1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF` → 登入 → 立即同步。

資料存於你指定的 Drive 資料夾（data.json + 圖片檔）。其他裝置用同一 Google 帳號登入即可載入。

## 方式二：用 Apps Script 上傳（免 OAuth）

1. 到 https://script.google.com 建新專案，貼上 `gas/Code.gs`。
2. 「部署」→「新增部署作業」→ 類型「網路應用程式」→ 執行身分「我」→ 存取權「知道連結的任何人」。
3. 複製 `/exec` 網址，貼到網站「管理 → Google Drive → Apps Script Web App URL」。
4. 按「上傳所有資料到此資料夾」，資料會寫入預設資料夾 `1OEQ7Cjq6AK6QAeU1CgaxYN0GjdAaIwdF`（可在 Code.gs 或後台改）。

## 公開部署

把 `server/share-server.cjs` 放到有 Node 的主機（或任一 Node 託管），`PORT` 環境變數可換埠。建議前面加 HTTPS 反向代理。分享資料存在 `server/shares/`。

## 目錄結構

```
index.html            SPA 外殼
css/style.css         四套範本 + RWD
js/db.js              IndexedDB 存取層
js/store.js           資料模型/分類/回收筒/匯出匯入/示範資料
js/chapters.js        章節辨識與編碼（純函式，有測試）
js/gdrive.js          Google OAuth + Drive 同步
js/imgedit.js         Canvas 圖片編輯
js/util.js            消毒、modal、toast 等
js/views/*.js         各頁面
server/share-server.cjs  靜態 + 分享 API
test/run-tests.mjs    關鍵邏輯測試
```
