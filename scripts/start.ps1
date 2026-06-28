# EvoCode 一键启动 (Windows PowerShell) — 顺序拉起 AI 运行时(:8000) → 控制平面(:8080) → 前端(:3000)，
# 每步等待健康检查通过后再启动下一层。自动管理 JWT 密钥。
#
# 用法:
#   pwsh scripts/start.ps1 setup     # 首次：安装三层依赖（venv / npm / pnpm）
#   pwsh scripts/start.ps1           # 启动全部三层（各服务在独立窗口/任务）
#   pwsh scripts/start.ps1 stop      # 停止占用 8000/8080/3000 的进程
#
# 首次启动后：浏览器打开 http://localhost:3000 ，注册的【第一个用户】成为 ADMIN。
[CmdletBinding()]
param([Parameter(Position = 0)][string]$Command = "start")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root ".logs"
$EnvFile = Join-Path $Root ".evocode.env"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$PyVenv = Join-Path $Root "ai-runtime\.venv\Scripts\python.exe"

function Get-JwtSecret {
    # 首次生成 32 字节随机十六进制密钥并存入 .evocode.env（git 忽略），后续复用。
    if (Test-Path $EnvFile) {
        $line = Get-Content $EnvFile | Where-Object { $_ -match '^EVOCODE_JWT_SECRET=' } | Select-Object -First 1
        if ($line) { return ($line -replace '^EVOCODE_JWT_SECRET=', '') }
    }
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = -join ($bytes | ForEach-Object { $_.ToString("x2") })
    Add-Content -Path $EnvFile -Value "EVOCODE_JWT_SECRET=$secret"
    Write-Host "==> 已生成 JWT 密钥并写入 .evocode.env（git 忽略，请勿提交）"
    return $secret
}

function Wait-Health {
    param([string]$Name, [string]$Url, [int]$Tries = 60)
    Write-Host -NoNewline "==> 等待 $Name 就绪 "
    for ($i = 0; $i -lt $Tries; $i++) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
            Write-Host " OK"; return $true
        } catch { Write-Host -NoNewline "."; Start-Sleep -Seconds 1 }
    }
    Write-Host " 超时！查看日志：$LogDir"; return $false
}

function Invoke-Setup {
    Write-Host "==> [1/3] Python AI 运行时依赖 (venv, 需 Python 3.11)"
    Push-Location (Join-Path $Root "ai-runtime")
    if (-not (Test-Path ".venv")) { python -m venv .venv }
    & $PyVenv -m pip install -q -e ".[dev]"
    Pop-Location

    Write-Host "==> [2/3] ts-extractor 依赖 (可选，repoPath 图分析用)"
    Push-Location (Join-Path $Root "tools\ts-extractor")
    try { npm ci --silent } catch { try { npm install --silent } catch { Write-Host "    (跳过，不影响核心流程)" } }
    Pop-Location

    Write-Host "==> [3/3] 前端依赖 (pnpm)"
    Push-Location (Join-Path $Root "frontend")
    pnpm install
    Pop-Location
    Write-Host "==> setup 完成。运行 'pwsh scripts/start.ps1' 启动。"
}

function Stop-Ports {
    Write-Host "==> 停止占用 8000/8080/3000 的进程"
    foreach ($port in 8000, 8080, 3000) {
        try {
            $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
            foreach ($c in $conns) {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                Write-Host "    killed PID $($c.OwningProcess) (:$port)"
            }
        } catch {}
    }
    Write-Host "==> 已停止。"
}

function Start-All {
    if (-not (Test-Path $PyVenv)) {
        Write-Host "未找到 venv，请先运行: pwsh scripts/start.ps1 setup"; exit 1
    }
    $secret = Get-JwtSecret

    Write-Host "==> 启动 AI 运行时 (:8000)"
    $py = Start-Process -PassThru -WindowStyle Hidden -FilePath $PyVenv `
        -ArgumentList "-m", "uvicorn", "evocode_runtime.main:app", "--port", "8000" `
        -WorkingDirectory (Join-Path $Root "ai-runtime") `
        -RedirectStandardOutput (Join-Path $LogDir "ai-runtime.log") `
        -RedirectStandardError (Join-Path $LogDir "ai-runtime.err.log")
    if (-not (Wait-Health "AI 运行时" "http://localhost:8000/health")) { $py.Kill(); exit 1 }

    Write-Host "==> 启动控制平面 (:8080)  [JWT 密钥已注入]"
    $env:EVOCODE_JWT_SECRET = $secret
    $java = Start-Process -PassThru -WindowStyle Hidden -FilePath "mvn" `
        -ArgumentList "-q", "spring-boot:run" `
        -WorkingDirectory (Join-Path $Root "control-plane") `
        -RedirectStandardOutput (Join-Path $LogDir "control-plane.log") `
        -RedirectStandardError (Join-Path $LogDir "control-plane.err.log")
    if (-not (Wait-Health "控制平面" "http://localhost:8080/actuator/health" 120)) { $py.Kill(); $java.Kill(); exit 1 }

    Write-Host "==> 启动前端 (:3000)"
    $fe = Start-Process -PassThru -WindowStyle Hidden -FilePath "pnpm" `
        -ArgumentList "dev" `
        -WorkingDirectory (Join-Path $Root "frontend") `
        -RedirectStandardOutput (Join-Path $LogDir "frontend.log") `
        -RedirectStandardError (Join-Path $LogDir "frontend.err.log")
    Wait-Health "前端" "http://localhost:3000" 60 | Out-Null

    @"

============================================================
 EvoCode 已启动（日志在 .logs\，进程在后台）
   控制台:        http://localhost:3000
   控制平面 API:  http://localhost:8080
   AI 运行时:     http://localhost:8000/health

 首次使用：打开控制台 → 注册（第一个注册的用户成为 ADMIN）。
 停止全部：pwsh scripts/start.ps1 stop
============================================================
"@ | Write-Host
}

switch ($Command) {
    "setup" { Invoke-Setup }
    "start" { Start-All }
    "stop"  { Stop-Ports }
    default { Write-Host "用法: pwsh scripts/start.ps1 [setup|start|stop]"; exit 1 }
}
