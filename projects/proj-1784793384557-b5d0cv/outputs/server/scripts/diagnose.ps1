
# 服装资产库反推服务 · 一键诊断脚本
# 由 诊断.bat 调用（PowerShell 支持 UTF-8 中文，不乱码）
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Line { Write-Host "------------------------------------------------" }
function OK($m)   { Write-Host "  [通过] $m" -ForegroundColor Green }
function BAD($m)  { Write-Host "  [失败] $m" -ForegroundColor Red }
function WARN($m) { Write-Host "  [提示] $m" -ForegroundColor Yellow }

Line
Write-Host "  服装资产库反推服务 · 环境诊断" -ForegroundColor Cyan
Line
Write-Host ""

$fail = 0

# 1. Node.js
Write-Host "第 1 步 · 检测 Node.js ..."
$node = $null
try { $node = (& node --version) 2>$null } catch {}
if (-not $node -and (Test-Path "C:\Program Files\nodejs\node.exe")) {
  try { $node = (& "C:\Program Files\nodejs\node.exe" --version) 2>$null } catch {}
}
if ($node) { OK "Node.js 已安装：$node" }
else { BAD "未检测到 Node.js —— 请安装 Node 18+（https://nodejs.org）"; $fail++ }
Write-Host ""

# 2. Claude CLI
Write-Host "第 2 步 · 检测 Claude Code CLI ..."
$claude = $null
try { $claude = (& claude --version) 2>$null } catch {}
if ($claude) { OK "Claude CLI 已安装：$claude" }
else { BAD "未检测到 claude 命令 —— 请安装并登录 Claude Code CLI（claude --version 应能返回版本号）"; $fail++ }
Write-Host ""

# 3. 端口 8787 是否有服务
Write-Host "第 3 步 · 检测本地反推服务(端口 8787) ..."
$portUp = $false
try {
  $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port 8787 -WarningAction SilentlyContinue
  $portUp = $conn.TcpTestSucceeded
} catch {}
if ($portUp) { OK "端口 8787 已监听（server 进程在跑）" }
else { WARN "端口 8787 未监听 —— server 没启动，稍后会尝试自动拉起" }
Write-Host ""

# 4. /health 探测
Write-Host "第 4 步 · 探测服务健康状态 /health ..."
$healthOk = $false
$provider = ""
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 5
  if ($h.ok) { $healthOk = $true; $provider = $h.provider; OK "服务在线 · provider=$($h.provider) · 档位=$($h.modes -join ',')" }
  else { WARN "服务返回异常" }
} catch { WARN "连不上 /health（server 未就绪）" }
Write-Host ""

# 5. 若 server 没起，尝试用 vbs 静默拉起一次
if (-not $healthOk) {
  Write-Host "第 5 步 · 尝试自动启动 server ..."
  $vbs = Join-Path $PSScriptRoot "start-hidden.vbs"
  if (Test-Path $vbs) {
    Start-Process wscript.exe -ArgumentList "`"$vbs`""
    Write-Host "  已触发静默启动，等待 6 秒 ..."
    Start-Sleep -Seconds 6
    try {
      $h2 = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 6
      if ($h2.ok) { $healthOk = $true; $provider = $h2.provider; OK "server 已成功拉起 · provider=$($h2.provider)" }
      else { BAD "server 启动后仍返回异常"; $fail++ }
    } catch { BAD "server 未能自动启动 —— 请检查 Node 是否可用，或手动运行 install-autostart.bat"; $fail++ }
  } else { BAD "找不到 start-hidden.vbs，脚本位置被移动过"; $fail++ }
  Write-Host ""
}

# 6. 真实反推链路（仅当 CLI provider 且 server 在线时）
if ($healthOk -and $provider -eq "cli") {
  Write-Host "第 6 步 · 实测 CLI 反推能力（真实测试，约需 20-60 秒，请耐心等待）..."
  # 一张纯色小方图(64x64 蓝色)，让 CLI 有真实像素可读，验证「读图→出JSON」全链路
  $px = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAP0lEQVR4nO3PMQ0AIAwEwF9CkI5uEIETIN4kJdC7BAAAAAAAAAAAAAAAAADgw+H1e59tAAAAAAAAAAAAAAAAADgwQF7YQMBz2m3XwAAAABJRU5ErkJggg=="
  $body = @{ imageBase64 = $px; mode = "clothing_only"; lang = "zh"; tagLang = "zh" } | ConvertTo-Json
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:8787/reason" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 200
    if ($r.ok) { OK "反推链路完全正常 · 耗时 $([math]::Round($r.tookMs/1000,1))s" }
    else {
      # server 收到并回了业务错误 = 「扩展→server→CLI」网络链路已通，问题在 CLI 层
      WARN "网络链路已通，但 CLI 反推报错：$($r.error)"
      WARN "多为 Claude CLI 未登录/额度用尽/首次冷启动超时。请在 cmd 运行 `claude` 确认能正常对话。"
    }
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match "500|502|503|内部") {
      # 拿到了 HTTP 响应(哪怕 500) = 网络链路通，CLI 层出错
      WARN "网络链路已通(server 有响应)，但 CLI 反推失败。多为 Claude CLI 未登录/额度用尽。"
      WARN "请在 cmd 直接运行 `claude` 命令确认能正常对话；能对话则重启浏览器重试即可。"
    } else {
      BAD "反推调用失败(网络层)：$msg"
      $fail++
    }
  }
  Write-Host ""
}

Line
if ($fail -eq 0 -and $healthOk) {
  Write-Host "  诊断结果：一切就绪，可以正常反推！" -ForegroundColor Green
  Write-Host "  回到浏览器点「反推」即可。" -ForegroundColor Green
} else {
  Write-Host "  诊断结果：发现 $fail 处问题（见上方红色[失败]）。" -ForegroundColor Red
  Write-Host "  请把本窗口截图发给管理员协助排查。" -ForegroundColor Yellow
}
Line
Write-Host ""
