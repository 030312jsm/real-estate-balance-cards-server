$ErrorActionPreference = "SilentlyContinue"

$ServerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $ServerDir "server.pid"

if (-not (Test-Path -LiteralPath $PidFile)) {
  Write-Host "No server.pid found."
  exit 0
}

$ServerPid = Get-Content -LiteralPath $PidFile
if ($ServerPid) {
  Stop-Process -Id ([int]$ServerPid) -Force
  Write-Host "Stopped server PID $ServerPid"
}

Remove-Item -LiteralPath $PidFile -Force
