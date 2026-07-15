# Langkey Finder

在 bns-web-member 頁面上，用畫面文字反查 i18n langkey 的 Chrome 插件，
並顯示每個 key 用在哪個頁面路徑。**安裝不需要 GitHub 帳號、不需要任何權限。**

## 安裝（一次就好）

1. 下載插件：<https://github.com/yuuliao/langkey-finder> → 綠色 **Code** 按鈕 → **Download ZIP**，解壓縮到一個固定資料夾（別放桌面亂動它）
2. 打開 Chrome，網址列輸入 `chrome://extensions`
3. 右上角打開 **開發人員模式（Developer mode）**
4. 點 **載入未封裝項目（Load unpacked）** → 選剛剛解壓縮的資料夾
5. 完成 ✅

## 使用

到任何 bns-web-member 頁面（如 test-hk.buynship.com）：

- 按 `Cmd+Shift+L`（或點插件圖示）開關面板
- **輸入文字**（如「推薦」）→ 反查 langkey，每個 key 會顯示用在哪個頁面路徑
- **輸入 `/` 開頭路徑**（如 `/account/referral`）→ 列出該頁用到的所有 key
- **🎯 Probe page** → 檢測搜尋結果哪些 key 真的出現在當前畫面上
- **📄 Page keys** → 列出當前頁面的所有 key
- 點任一列 → 複製 key

## 更新

**route 對照表會自動更新**，不用做任何事（面板標題下方可看到資料時間）。

只有插件程式本身有新版時才需要：重新下載 ZIP 覆蓋原資料夾 → `chrome://extensions` 按該插件的「重新載入」🔄。
