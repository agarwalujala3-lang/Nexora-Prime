param(
  [int]$Port = 4174
)

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$statePath = Join-Path $root ".live-state.json"

function Stop-Pid {
  param([int]$Pid)
  if ($Pid -gt 0) {
    try {
      Stop-Process -Id $Pid -Force -ErrorAction Stop
      Write-Host "Stopped PID $Pid"
    } catch {
      # Ignore already-stopped processes.
    }
  }
}

if (Test-Path $statePath) {
  try {
    $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json
    Stop-Pid -Pid [int]$state.pids.serve
    Stop-Pid -Pid [int]$state.pids.tunnel
  } catch {
    # Ignore malformed state file.
  }
}

Get-CimInstance Win32_Process |
  Where-Object {
    (($_.CommandLine -match "(serve\.cmd|serve\\bin\\serve\.js)") -and ($_.CommandLine -match "-l\s+$Port")) -or
    (($_.CommandLine -match "(tmole\.cmd|tunnelmole)") -and ($_.CommandLine -match "\s+$Port(\s|$)"))
  } |
  ForEach-Object {
    Stop-Pid -Pid $_.ProcessId
  }

Write-Host "Live processes cleanup complete."
