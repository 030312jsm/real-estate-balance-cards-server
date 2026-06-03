$ErrorActionPreference = "Stop"

$ServerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodePath = "C:\Users\jsm03\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path -LiteralPath $NodePath)) {
  $NodePath = "node"
}

$PidFile = Join-Path $ServerDir "server.pid"
$OutFile = Join-Path $ServerDir "server.out.log"
$ErrFile = Join-Path $ServerDir "server.err.log"
$HealthUrl = "http://127.0.0.1:8787/health"

if (Test-Path -LiteralPath $PidFile) {
  $ExistingPid = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue
  if ($ExistingPid) {
    $ExistingProcess = Get-Process -Id ([int]$ExistingPid) -ErrorAction SilentlyContinue
    if ($ExistingProcess) {
      try {
        Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2 | Out-Null
        Write-Host "Server already running: http://127.0.0.1:8787"
        exit 0
      } catch {
        Stop-Process -Id ([int]$ExistingPid) -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

$Process = Start-Process `
  -WindowStyle Hidden `
  -FilePath $NodePath `
  -ArgumentList @("server.js") `
  -WorkingDirectory $ServerDir `
  -RedirectStandardOutput $OutFile `
  -RedirectStandardError $ErrFile `
  -PassThru

Set-Content -LiteralPath $PidFile -Value $Process.Id -Encoding ASCII

for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2 | Out-Null
    Write-Host "Server running: http://127.0.0.1:8787"
    Write-Host "PID: $($Process.Id)"
    exit 0
  } catch {
  }
}

Write-Host "Server did not respond on http://127.0.0.1:8787"
Write-Host "STDOUT:"
Get-Content -LiteralPath $OutFile -ErrorAction SilentlyContinue
Write-Host "STDERR:"
Get-Content -LiteralPath $ErrFile -ErrorAction SilentlyContinue
exit 1
