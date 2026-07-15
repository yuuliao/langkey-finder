# Langkey Finder

**目前版本：2.0**（對照 `chrome://extensions` 裡顯示的版本，不一致代表要重新下載）

在 bns-web-member 頁面上，用畫面文字反查 i18n langkey 的 Chrome 插件，
並顯示每個 key 用在哪個頁面路徑。**安裝不需要 GitHub 帳號、不需要任何權限。**

## 安裝（一次就好）

1. 下載插件：<https://github.com/yuuliao/langkey-finder> → 綠色 **Code** 按鈕 → **Download ZIP**，解壓縮到一個固定資料夾（別放桌面亂動它）
2. 打開 Chrome，網址列輸入 `chrome://extensions`
3. 右上角打開 **開發人員模式（Developer mode）**
4. 點 **載入未封裝項目（Load unpacked）** → 選剛剛解壓縮的資料夾
5. 完成 ✅

## 使用

到任何 bns-web-member 頁面（如 test-hk.buynship.com），按 `Cmd+Shift+L`（或點插件圖示）開關面板。

### 搜尋

| 輸入 | 效果 |
|---|---|
| 文字（如「推薦」） | 反查 langkey，比對翻譯文字與 key 名稱 |
| `/` 開頭路徑（如 `/account/referral`） | 列出該頁用到的所有 key；路徑打錯會列出可搜尋的 route 清單，點一下帶入 |

每個 key 下方會顯示它用在哪個頁面路徑：

- 🟢 **route 連結**（如 `/account/referral`）— 點了直接開該頁；`:id` 表示動態路由
- 🌐 **全站共用（N 頁）** — 共用元件的 key，滑鼠移上去看完整頁面清單
- 🌀 **動態／未收錄** — key 是程式動態組出來的（或已無人使用），靜態分析定位不到

### 按鈕

- **🎯 Probe page** — 檢測目前搜尋結果中，哪些 key 真的出現在當前畫面上（標「on page」並排最前）
- **📄 Page keys** — 列出當前頁面的所有 key（含條件隱藏、目前沒顯示的）。是開關：按下會變藍色高亮，再按一次或點「← 返回搜尋」退出。模式中繼續打字，符合的 key 會排在前面

### 其他

- 點任一列 → 複製 key
- 結果排序：probe 命中 > 符合搜尋字 > 頁面專屬 key（全站共用沉底）
- 右上角可切換語系；`Esc` 關閉面板；標題可拖曳移動

## 更新

**route 對照表會自動更新**，不用做任何事——面板標題下方會顯示資料時間與掃描來源（如 `main@af06ade`）。

只有**插件程式本身**有新版時（本頁最上方版本號變了）才需要：重新下載 ZIP 覆蓋原資料夾 → `chrome://extensions` 按該插件的「重新載入」🔄。

---

## 維護者專區

> 以下只有維護對照表的人需要看（需要 bns-web-member 的 codebase 權限）。

repo 有異動後，更新對照表並發佈：

```bash
./update.sh   # 掃 codebase → 產生 langkey-map.json → commit → push
```

- 會自動檢查 bns-web-member 在 main 且不落後 origin，避免發佈到錯誤分支的快照
- 產生原理與已知限制見 [`tools/README.md`](tools/README.md)
- 疑似未使用的 key 清單（清理翻譯檔用）：[`tools/unused-keys.md`](tools/unused-keys.md)
