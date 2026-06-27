#!/usr/bin/env bash
# EvoCode 一键启动 — 启动 Python AI 运行时 + Spring Boot 控制平面 + 前端控制台
# 用法: bash scripts/dev.sh          (启动全部三层)
#       bash scripts/dev.sh setup    (首次安装依赖)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY_VENV="$ROOT/ai-runtime/.venv/Scripts/python"
[ -f "$PY_VENV" ] || PY_VENV="$ROOT/ai-runtime/.venv/bin/python"  # macOS/Linux

setup() {
  echo "==> [1/3] Python AI 运行时依赖 (venv 3.11)"
  cd "$ROOT/ai-runtime"
  python -m venv .venv 2>/dev/null || true
  "$PY_VENV" -m pip install -q -e ".[dev]"
  echo "==> [2/3] ts-extractor / ts-checker 依赖 (ts-morph)"
  cd "$ROOT/tools/ts-extractor" && npm ci --silent 2>/dev/null || npm install --silent
  echo "==> [3/3] 前端依赖"
  cd "$ROOT/frontend" && pnpm install --silent
  echo "==> setup 完成。运行 'bash scripts/dev.sh' 启动全部服务。"
}

start() {
  echo "==> 启动 Python AI 运行时 (:8000)"
  cd "$ROOT/ai-runtime"
  "$PY_VENV" -m uvicorn evocode_runtime.main:app --port 8000 > "$ROOT/.dev-python.log" 2>&1 &
  PY_PID=$!

  echo "==> 启动 Spring Boot 控制平面 (:8080)"
  cd "$ROOT/control-plane"
  mvn -q spring-boot:run > "$ROOT/.dev-java.log" 2>&1 &
  JAVA_PID=$!

  echo "==> 启动前端控制台 (:3000)"
  cd "$ROOT/frontend"
  pnpm dev > "$ROOT/.dev-frontend.log" 2>&1 &
  FE_PID=$!

  trap 'echo "停止服务..."; kill $PY_PID $JAVA_PID $FE_PID 2>/dev/null || true' INT TERM

  echo ""
  echo "EvoCode 正在启动 (日志: .dev-*.log):"
  echo "  - 控制台:        http://localhost:3000"
  echo "  - 控制平面 API:  http://localhost:8080/api/intents"
  echo "  - AI 运行时:     http://localhost:8000/health"
  echo ""
  echo "试一下: bash scripts/demo.sh"
  echo "Ctrl-C 停止全部。"
  wait
}

case "${1:-start}" in
  setup) setup ;;
  start) start ;;
  *) echo "用法: bash scripts/dev.sh [setup|start]"; exit 1 ;;
esac
