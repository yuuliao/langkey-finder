# Langkey → Route 對照表

`langkey-map.js`（擴充功能載入的檔）與 `langkey-map.json`（給人看的）是由
`tools/build-map.mjs` 從 bns-web-member 原始碼**靜態產生**的。執行時零連線、零權限。

## 更新（repo 有改 lang 或頁面時重跑）

```bash
cd "langkey-finder 2"
node tools/build-map.mjs [repoPath]
# repoPath 預設 /Users/Yu/Project/bns-web-member
```

跑完後到 `chrome://extensions` 對 Langkey Finder 按「重新載入」即可。

## 運作方式

1. 掃 `src/**/*.{vue,ts,tsx}` 的 `t('key')` / `$t('key')` / `keypath="key"`，
   再加上「任何等於合法 langkey 的引號字串」（救回設定陣列裡的 key）。
2. 解析 `src/router/index.ts`（brace-depth walk）→ view 檔對到完整 route path。
3. 用元件 import 圖，把共用元件往上追到會 render 它的 route。
4. 輸出 `key → { routes, files, shared }`。

## 已知限制

- 純動態拼接的 key（`` t('menu_list_title_' + x) ``）無法靜態定位 → 擴充功能顯示
  「🌀 動態／未收錄」。約佔全部 key 的 ~15%。
- 出現在超過 8 條 route 的共用元件 key → 標「🌐 全站共用（N 頁）」。
- 動態路由保留 placeholder（如 `/account/productsharing/:id`），該 route 不做成
  可點連結（因為缺參數）。
- Source 連結指向 `master` 分支。
