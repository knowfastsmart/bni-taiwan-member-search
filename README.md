# BNI 台灣會員搜尋

網站：https://knowfastsmart.github.io/bni-taiwan-member-search/

專業別搜尋：https://knowfastsmart.github.io/bni-taiwan-member-search/?mode=profession

儲存庫：https://github.com/knowfastsmart/bni-taiwan-member-search

9,426 筆會員資料，可供訪客用全部資料搜尋、獨立專業別搜尋、區域與分會篩選。

- `docs/`：可直接部署的網站與瀏覽器端資料索引。
- `data/members.csv`：使用者提供的原始 24 欄會員資料。
- `data/metadata.json`：資料來源、快照日期與欄位說明。
- `update_data.py`：替換同格式 CSV 後重建網站資料。

資料快照為 2026/10/30，不會自動同步 BNI。收藏僅保存在訪客自己的瀏覽器。網站與資料為使用者要求公開的版本；這不是 BNI 官方網站。

本機開啟 `docs/index.html` 即可使用。更新資料執行 `python3 update_data.py /完整路徑/新資料.csv`，同步更新頁面資料日期後提交。

全部搜尋會比對姓名、公司、專業與業務介紹等全部原始欄位；專業別搜尋只比對專業子分類及專業項目，也提供確切專業別選單。
