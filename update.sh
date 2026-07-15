#!/bin/bash
# 一鍵更新 route 對照表並發佈：
#   ./update.sh [bns-web-member 路徑]
# 跑完後同事的插件會在下次開啟時自動抓到新資料（CDN 快取約 1-5 分鐘）。
set -e
cd "$(dirname "$0")"

REPO="${1:-/Users/Yu/Project/bns-web-member}"

# 防呆：確認掃描來源在 main 且是最新，避免發佈到錯誤分支的快照
BRANCH=$(git -C "$REPO" branch --show-current)
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
	echo "❌ $REPO 目前在分支「$BRANCH」，請先切回 main 再發佈。"
	echo "   （只想本地測試不發佈的話，直接跑 node tools/build-map.mjs）"
	exit 1
fi
git -C "$REPO" fetch --quiet origin "$BRANCH" 2>/dev/null || true
BEHIND=$(git -C "$REPO" rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)
if [ "$BEHIND" -gt 0 ]; then
	echo "⚠️  $REPO 落後 origin/$BRANCH $BEHIND 個 commit，建議先 git pull 再跑。"
	read -p "仍要繼續？(y/N) " ans
	[ "$ans" = "y" ] || exit 1
fi

node tools/build-map.mjs "$REPO"

git add langkey-map.json langkey-map.js tools/unused-keys.md
if git diff --cached --quiet; then
	echo "對照表沒有變化，不需發佈。"
	exit 0
fi
git commit -m "chore: update langkey map ($(date +%F))"
git push
echo "✅ 已發佈，插件端約 1-5 分鐘後生效。"
