#!/usr/bin/env bash
# EvoCode 一键启动 — 顺序拉起 AI 运行时(:8000) → 控制平面(:8080) → 前端(:3000)，
# 每步等待健康检查通过后再启动下一层。自动管理 JWT 密钥。
#
# 用法:
#   bash scripts/start.sh setup     # 首次：安装三层依赖（venv / npm / pnpm）
#   bash scripts/start.sh           # 启动全部三层；Ctrl-C 全部停止
#   bash scripts/start.sh stop      # 停止由本脚本启动的残留进程（按端口）
#
# 首次启动后：浏览器打开 http://localhost:3000 ，注册的【第一个用户】成为 ADMIN。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/.logs"
ENV_FILE="$ROOT/.evocode.env"
mkdir -p "$LOG_DIR"

PY_VENV="$ROOT/ai-runtime/.venv/Scripts/python"
[ -f "$PY_VENV" ] || PY_VENV="$ROOT/ai-runtime/.venv/bin/python"  # macOS/Linux

# ── JWT 密钥：首次生成并存入 .evocode.env（gitignore），后续复用 ──────────────
ensure_secret() {
  if [ -f "$ENV_FILE" ] && grep -q '^EVOCODE_JWT_SECRET=' "$ENV_FILE"; then
    return
  fi
  local secret
  # 优先 openssl，退化到 /dev/urandom，再退化到 python。
  secret="$(openssl rand -hex 32 2>/dev/null \
    || head -c 32 /dev/urandom 2>/dev/null | base64 \
    || python -c 'import secrets;print(secrets.token_hex(32))')"
  echo "EVOCODE_JWT_SECRET=$secret" >> "$ENV_FILE"
  echo "==> 已生成 JWT 密钥并写入 .evocode.env（git 忽略，请勿提交）"
}

load_secret() {
  ensure_secret
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
}

# ── 健康检查轮询 ──────────────────────────────────────────────────────────────
wait_health() {
  local name="$1" url="$2" tries="${3:-60}"
  printf "==> 等待 %s 就绪 " "$name"
  for _ in $(seq 1 "$tries"); do
    if curl -sf "$url" >/dev/null 2>&1; then echo " OK"; return 0; fi
    printf "."; sleep 1
  done
  echo " 超时！查看日志：$LOG_DIR"
  return 1
}

setup() {
  echo "==> [1/3] Python AI 运行时依赖 (venv, 需 Python 3.11)"
  cd "$ROOT/ai-runtime"
  python -m venv .venv 2>/dev/null || true
  "$PY_VENV" -m pip install -q -e ".[dev]"
  echo "==> [2/3] ts-extractor 依赖 (可选，repoPath 图分析用)"
  (cd "$ROOT/tools/ts-extractor" && npm ci --silent 2>/dev/null || npm install --silent) || \
    echo "    (ts-extractor 依赖安装跳过；不影响核心流程)"
  echo "==> [3/3] 前端依赖 (pnpm)"
  cd "$ROOT/frontend" && pnpm install
  echo "==> setup 完成。运行 'bash scripts/start.sh' 启动。"
}

ports_pids() {
  # 列出占用 8000/8080/3000 的监听 PID（Windows: netstat；*nix: lsof）。
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti :8000 -ti :8080 -ti :3000 2>/dev/null || true
  else
    netstat -ano 2>/dev/null | grep -E ":8000|:8080|:3000" | grep LISTENING \
      | awk '{print $5}' | sort -u || true
  fi
}

stop() {
  echo "==> 停止占用 8000/8080/3000 的进程"
  for pid in $(ports_pids); do
    [ -n "$pid" ] || continue
    if command -v taskkill >/dev/null 2>&1; then
      taskkill //F //PID "$pid" >/dev/null 2>&1 || true
    else
      kill "$pid" 2>/dev/null || true
    fi
    echo "    killed $pid"
  done
  echo "==> 已停止。"
}

start() {
  [ -f "$PY_VENV" ] || { echo "未找到 venv，请先运行: bash scripts/start.sh setup"; exit 1; }
  load_secret

  echo "==> 启动 AI 运行时 (:8000)"
  (cd "$ROOT/ai-runtime" && "$PY_VENV" -m uvicorn evocode_runtime.main:app --port 8000 \
    > "$LOG_DIR/ai-runtime.log" 2>&1) &
  PY_PID=$!
  wait_health "AI 运行时" "http://localhost:8000/health" || { kill $PY_PID 2>/dev/null||true; exit 1; }

  echo "==> 启动控制平面 (:8080)  [JWT 密钥已注入]"
  (cd "$ROOT/control-plane" && EVOCODE_JWT_SECRET="$EVOCODE_JWT_SECRET" \
    mvn -q spring-boot:run > "$LOG_DIR/control-plane.log" 2>&1) &
  JAVA_PID=$!
  wait_health "控制平面" "http://localhost:8080/actuator/health" 120 \
    || { kill $PY_PID $JAVA_PID 2>/dev/null||true; exit 1; }

  echo "==> 启动前端 (:3000)"
  (cd "$ROOT/frontend" && pnpm dev > "$LOG_DIR/frontend.log" 2>&1) &
  FE_PID=$!
  wait_health "前端" "http://localhost:3000" 60 || true  # 前端 200 即可，失败不致命

  trap 'echo; echo "停止全部服务..."; kill $PY_PID $JAVA_PID $FE_PID 2>/dev/null || true' INT TERM

  cat <<EOF

============================================================
 EvoCode 已启动（日志在 .logs/）
   控制台:        http://localhost:3000
   控制平面 API:  http://localhost:8080
   AI 运行时:     http://localhost:8000/health

 首次使用：打开控制台 → 注册（第一个注册的用户成为 ADMIN）。
 Ctrl-C 停止全部。
============================================================
EOF
  wait
}

case "${1:-start}" in
  setup) setup ;;
  start) start ;;
  stop)  stop ;;
  *) echo "用法: bash scripts/start.sh [setup|start|stop]"; exit 1 ;;
esac
