#!/usr/bin/env bash
# EvoCode 端到端 demo — 对一个目标 repo 副本发一个意图，展示完整闭环：
# 意图 → 规划 → 真实代码生成落盘 → 验证。
# 前提: 服务已启动 (bash scripts/dev.sh)。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GATEWAY="${GATEWAY:-http://localhost:8080}"
INTENT="${1:-add a product page and a comments api}"
DEMO_DIR="$ROOT/.demo-app"

echo "==> 准备 demo 目标 repo: $DEMO_DIR (fixture 副本)"
rm -rf "$DEMO_DIR"
cp -r "$ROOT/test/fixtures/next-app" "$DEMO_DIR"

echo "==> BEFORE — demo repo 文件:"
find "$DEMO_DIR" -type f -not -path '*/node_modules/*' | sed "s#$ROOT/##"

echo ""
echo "==> 发送意图: \"$INTENT\""
# Windows 风格绝对路径给运行时
REPO_WIN="$(cd "$DEMO_DIR" && pwd -W 2>/dev/null || echo "$DEMO_DIR")"
curl -s -X POST "$GATEWAY/api/intents" \
  -H "Content-Type: application/json" \
  -d "{\"intent\":\"$INTENT\",\"projectId\":\"demo\",\"repoPath\":\"$REPO_WIN\"}" \
  -o "$ROOT/.demo-result.json"

echo "==> 结果:"
PY="$ROOT/ai-runtime/.venv/Scripts/python"; [ -f "$PY" ] || PY="$ROOT/ai-runtime/.venv/bin/python"
"$PY" - <<'PYEOF'
import io, json, os
root = os.environ.get("ROOT", ".")
d = json.load(io.open(os.path.join(root, ".demo-result.json"), encoding="utf-8"))
print(f"  status={d['status']} phase={d['phase']}")
print(f"  规划任务: {len(d['taskGraph']['tasks'])}")
for t in d["taskGraph"]["tasks"]:
    print(f"    - [{t['kind']}] {t['title']}")
print(f"  生成文件 (changeSet): {len(d['changeSet'])}")
for f in d["changeSet"]:
    print(f"    + {f['path']}")
print(f"  已落盘: {len(d['appliedFiles'])} 个文件")
v = d.get("verification") or {}
print(f"  验证: checked={v.get('checked')} passed={v.get('passed')} diagnostics={v.get('diagnosticCount')}")
print(f"  {d['message']}")
PYEOF

echo ""
echo "==> AFTER — demo repo 新增文件:"
find "$DEMO_DIR/evocode_generated" -type f 2>/dev/null | sed "s#$ROOT/##" || echo "  (无 — 检查服务是否运行/路径)"
echo ""
echo "查看生成的代码: ls $DEMO_DIR/evocode_generated"
