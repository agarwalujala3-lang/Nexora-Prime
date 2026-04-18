param(
  [int]$Port = 4174
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$statePath = Join-Path $root ".live-state.json"
$serveOut = Join-Path $root ".live-serve.out.log"
$serveErr = Join-Path $root ".live-serve.err.log"
$tunnelOut = Join-Path $root ".live-tunnel.out.log"
$tunnelErr = Join-Path $root ".live-tunnel.err.log"

function Stop-ExistingLiveProcesses {
  param([int]$TargetPort)
  Get-CimInstance Win32_Process |
    Where-Object {
      (($_.CommandLine -match "(serve\.cmd|serve\\bin\\serve\.js)") -and ($_.CommandLine -match "-l\s+$TargetPort")) -or
      (($_.CommandLine -match "(tmole\.cmd|tunnelmole)") -and ($_.CommandLine -match "\s+$TargetPort(\s|$)"))
    } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      } catch {
        # Ignore stale process kill failures.
      }
    }
}

Stop-ExistingLiveProcesses -TargetPort $Port
Start-Sleep -Milliseconds 800

@($serveOut, $serveErr, $tunnelOut, $tunnelErr) | ForEach-Object {
  if (Test-Path $_) {
    try {
      Remove-Item $_ -Force -ErrorAction Stop
    } catch {
      # If file handles are still attached, truncate in place and continue.
      Clear-Content -Path $_ -ErrorAction SilentlyContinue
    }
  }
}

$serveCli = Join-Path $root "node_modules\.bin\serve.cmd"
$tunnelCli = Join-Path $root "node_modules\.bin\tmole.cmd"

if (-not (Test-Path $serveCli)) {
  throw "Missing local server binary at $serveCli. Run npm install first."
}
if (-not (Test-Path $tunnelCli)) {
  throw "Missing local tunnel binary at $tunnelCli. Run npm install first."
}

$serveProc = Start-Process -FilePath $serveCli -ArgumentList "-s", ".", "-l", "$Port" -WorkingDirectory $root -RedirectStandardOutput $serveOut -RedirectStandardError $serveErr -PassThru

$localStatus = "DOWN"
for ($i = 0; $i -lt 20; $i += 1) {
  Start-Sleep -Milliseconds 700
  try {
    $probe = Invoke-WebRequest -Uri "http://localhost:$Port/index.html" -UseBasicParsing -TimeoutSec 4
    if ($probe.StatusCode -eq 200) {
      $localStatus = "UP"
      break
    }
  } catch {
    $localStatus = "DOWN"
  }
}

$tunnelProc = Start-Process -FilePath $tunnelCli -ArgumentList "$Port" -WorkingDirectory $root -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru

$publicUrl = ""
for ($i = 0; $i -lt 45; $i += 1) {
  Start-Sleep -Seconds 2
  if (Test-Path $tunnelOut) {
    $content = Get-Content -Path $tunnelOut -Raw -ErrorAction SilentlyContinue
    if ($content) {
      $match = [regex]::Match($content, "https://[a-zA-Z0-9\.-]+")
      if ($match.Success) {
        $publicUrl = $match.Value
        break
      }
    }
  }
}

$state = [ordered]@{
  port = $Port
  publicUrl = $publicUrl
  localStatus = $localStatus
  startedAt = (Get-Date).ToString("s")
  pids = [ordered]@{
    serve = $serveProc.Id
    tunnel = $tunnelProc.Id
  }
  logs = [ordered]@{
    serveOut = $serveOut
    serveErr = $serveErr
    tunnelOut = $tunnelOut
    tunnelErr = $tunnelErr
  }
}

$state | ConvertTo-Json -Depth 6 | Set-Content -Path $statePath -Encoding UTF8

Write-Host "Live launch completed."
Write-Host "Port: $Port"
Write-Host "Local status: $localStatus"
if ($publicUrl) {
  Write-Host "Public URL: $publicUrl"
} else {
  Write-Host "Public URL: not yet available. Check .live-tunnel.out.log in a few seconds."
}
Write-Host "State file: $statePath"
