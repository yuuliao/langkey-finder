#!/bin/bash
# 一鍵更新 route 對照表並發佈：
#   ./update.sh [bns-web-member 路徑]
# 跑完後同事的插件會在下次開啟時自動抓到新資料（CDN 快取約 1-5 分鐘）。
set -e
cd "$(dirname "$0")"

node tools/build-map.mjs "${1:-/Users/Yu/Project/bns-web-member}"

git add langkey-map.json langkey-map.js tools/unused-keys.md
if git diff --cached --quiet; then
	echo "對照表沒有變化，不需發佈。"
	exit 0
fi
git commit -m "chore: update langkey map ($(date +%F))"
git push
echo "✅ 已發佈，插件端約 1-5 分鐘後生效。"
