$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$statePath = Join-Path $root ".live-state.json"

if (-not (Test-Path $statePath)) {
  Write-Host "No live state file found."
  exit 0
}

try {
  $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json
} catch {
  Write-Host "State file exists but could not be parsed."
  exit 1
}

Write-Host "Port: $($state.port)"
Write-Host "Public URL: $($state.publicUrl)"
Write-Host "Started: $($state.startedAt)"
Write-Host "Serve PID: $($state.pids.serve)"
Write-Host "Tunnel PID: $($state.pids.tunnel)"

$serveRunning = [bool](Get-Process -Id ([int]$state.pids.serve) -ErrorAction SilentlyContinue)
$tunnelRunning = [bool](Get-Process -Id ([int]$state.pids.tunnel) -ErrorAction SilentlyContinue)
Write-Host "Serve running: $serveRunning"
Write-Host "Tunnel running: $tunnelRunning"

try {
  $resp = Invoke-WebRequest -Uri ("http://localhost:{0}/index.html" -f $state.port) -UseBasicParsing -TimeoutSec 6
  Write-Host "Local HTTP check: $($resp.StatusCode)"
} catch {
  Write-Host "Local HTTP check: DOWN"
}
