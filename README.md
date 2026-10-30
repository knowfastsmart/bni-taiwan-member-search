# BNI 台灣會員搜尋

網站：https://knowfastsmart.github.io/bni-taiwan-member-search/

專業別搜尋：https://knowfastsmart.github.io/bni-taiwan-member-search/?mode=profession

儲存庫：https://github.com/knowfastsmart/bni-taiwan-member-search

9,426 筆會員資料，可供訪客用全部資料搜尋、獨立專業別搜尋、區域與分會篩選。

- `docs/`：可直接部署的網站與瀏覽器端資料索引。
- `data/members.csv`：使用者提供的原始 24 欄會員資料。
- `data/metadata.json`：資料來源、快照日期與欄位說明。
- `update_data.py`：替換同格式 CSV 後重建網站資料。

初始資料快照為 2026/10/30。設定完成後，每週一台灣時間 06:20 由 GitHub Actions 自動更新並發布網站。未登入時收藏保存在訪客自己的瀏覽器；Google 登入後以 Firestore 同步個人收藏。網站與資料為使用者要求公開的版本；這不是 BNI 官方網站。

本機開啟 `docs/index.html` 即可使用。更新資料執行 `python3 update_data.py /完整路徑/新資料.csv`，資料日期會一起更新；提交更新檔案後即可發布。

搜尋結果每頁顯示 500 位會員。全部搜尋會比對姓名、公司、專業與業務介紹等全部原始欄位；專業別搜尋只比對專業子分類及專業項目，也提供確切專業別選單。


## 每週自動更新

來源：[gaskhuang/bni-crawler](https://github.com/gaskhuang/bni-crawler)，使用已檢查的非同步版本 `cc7c982457a1bf8406aeeb8b982df49c6224045b`。只抓台灣，併發數 8。上游日後有變更時，需要檢查後再更新固定版本。

- 預定每週一 06:20（Asia/Taipei）執行，實際啟動時間可能依 GitHub 排程略有延遲。
- 在 Actions → **Weekly BNI Taiwan refresh** → **Run workflow** 可立即手動更新。
- 成功後更新 `data/members.csv`、`data/metadata.json`、`docs/members.js`，並重新發布 GitHub Pages。
- 更新日期直接來自資料；摘要會列出新增、移除及資料變動筆數。
- 若抓取或驗證失敗，不提交資料，也不取代目前網站。驗證包含空資料、會員總數下降超過 10%、區域／分會涵蓋下降超過 5%，及主要欄位完整率下降超過 10%。
- `test_refresh.py` 驗證異常資料阻擋、CSV／網頁一致性與 HTML 字串跳脫。
- 排程在 GitHub 雲端執行，不依賴本機電腦或這個聊天保持開啟。GitHub 對長期無活動的公開儲存庫可能暫停排程；狀態可在 Actions 查看。

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
