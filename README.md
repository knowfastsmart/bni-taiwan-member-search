# BNI 全球人脈搜尋

網站：https://knowfastsmart.github.io/bni-taiwan-member-search/
專業別搜尋：https://knowfastsmart.github.io/bni-taiwan-member-search/?mode=profession

繁體中文介面，支援國家／地區、區域、分會、產業及聯絡方式篩選。全部資料搜尋比對所有原始欄位；獨立專業別搜尋只比對專業子分類與專業項目，另有確切專業選單。支援常用中英文專業同義詞。會員姓名、公司與介紹保留來源原文。

搜尋結果每頁 500 筆，卡片及表格皆適用；完整會員詳情及 CSV 匯出保留來源 24 欄。這是使用者要求公開的整理工具，並非 BNI 官方網站。

## 收錄範圍及資料更新

來源：[gaskhuang/bni-crawler](https://github.com/gaskhuang/bni-crawler)，固定已檢查版本 `cc7c982457a1bf8406aeeb8b982df49c6224045b`。範圍是該 repo 列出的 44 個國家／地區入口，不宣稱涵蓋未公開資料或 repo 尚未支援的地區。`countries.json` 保留來源名稱並提供繁體中文顯示名稱；來源的 Antarctica 入口另標「來源標示」，避免自行變更來源國家名稱。

- 預定每週一台灣時間 06:20 由 GitHub Actions 更新全部 44 個入口，實際啟動可能略有延遲；電腦與聊天不需保持開啟。
- [Actions → Weekly BNI global refresh → Run workflow](https://github.com/knowfastsmart/bni-taiwan-member-search/actions/workflows/weekly-refresh.yml) 可立即更新。
- 同時最多處理 4 個國家，每國同時最多 8 個請求；來源回應失敗會重試。
- 各國獨立驗證。空資料、筆數下降逾 10%、區域／分會涵蓋下降逾 5%、主要欄位完整率下降逾 10% 或詳情取得失敗，會保留該國前次資料；其他成功國家仍可更新。
- 網站「資料收錄範圍」列出各國實際筆數、日期與狀態。未取得可用資料的入口不會被算成已收錄國家。
- GitHub 對長期無活動的公開儲存庫可能暫停排程，請從 Actions 查看或重新啟用。

`docs/catalog.json` 是搜尋目錄。公開資料以不可變的內容雜湊 gzip 分檔，全文搜尋在 Web Worker 執行，會員完整欄位只在開啟詳情或匯出時載入。瀏覽器快取僅包含公開會員資料，個人收藏不會進入這些檔案。

- `data/countries/<國家代碼>.json.gz`：各國 24 欄原始資料。
- `data/global-metadata.json`：整體收錄與更新狀態。
- `docs/catalog/<國家代碼>/`：壓縮搜尋索引與完整資料分檔。
- `data/members.csv`、`docs/members.js`：保留台灣資料的原有相容輸出。
- `global_pipeline.py`：全球抓取、驗證、分檔及發布。
- `test_global.py`、`test_search_worker.cjs`：資料驗證、完整欄位搜尋、國家篩選、每頁 500 筆與匯出測試。

本機預覽：以 HTTP 伺服器提供 `docs/`。壓縮資料與 Web Worker 需要 HTTP／HTTPS；直接以 file:// 開啟不支援全球搜尋。

## Google 登入與收藏同步

使用 Firebase Authentication 的 Google 提供者及 Cloud Firestore。Google 登入只使用基本個人資料，不申請 Gmail、Drive、通訊錄的存取權。

- Firebase 專案：`bni-taiwan-member-search`，Spark 方案；Firestore `(default)` 位於 `asia-east1`（台灣）。
- 網頁公開設定放在 `docs/firebase-config.js`；此檔不得放 OAuth client secret、服務帳戶私鑰或使用者 token。
- 規則來源：`firestore.rules`。每位使用者只可讀寫 `users/{自己的 UID}/favorites/{會員識別碼}`；資料只包含 `active`、`updatedAt`。拒絕其他路徑與直接刪除。
- 登入後可手動匯入此裝置的原有收藏。登出後顯示訪客收藏；不把其他帳號收藏自動混入。
- 使用 BNI 的 `encryptedMemberId` 作固定識別碼，顯示名稱變動不會遺失收藏。取消收藏保留 inactive 記錄，避免重新連線時恢復舊收藏。
- 待同步的操作依 UID 暫存於瀏覽器；重新連線或同帳號重新登入時會重試。介面會顯示待同步／錯誤狀態。
- Firebase SDK 採官方 CDN 13.1.0；搜尋與訪客收藏不依賴 CDN 成功載入。
- 測試：`node --test test_favorites.cjs`；包含舊資料轉換、帳號隔離、延遲回應、未同步刪除、重試與明確匯入。
- 隱私權說明：`docs/privacy.html`。請勿將個人收藏資料或驗證憑證提交到公開 GitHub。
