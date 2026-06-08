$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$siteUrl = "http://localhost:3000"
$logDir = Join-Path $root ".logs"
$envFile = Join-Path $root ".env.local"
$env:CONVEX_AGENT_MODE = "anonymous"

Set-Location $root
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-LocalPort {
  param([int]$Port)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.ConnectAsync("127.0.0.1", $Port)
    return $connection.Wait(500) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Start-HiddenScript {
  param(
    [string]$ScriptPath,
    [string]$OutputPath,
    [string]$ErrorPath
  )

  $escapedPath = $ScriptPath.Replace("'", "''")
  Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $root `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"& '$escapedPath'`"" `
    -RedirectStandardOutput $OutputPath -RedirectStandardError $ErrorPath
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (!$npm) {
  Write-Host "Node.js and npm are required. Install Node.js, then double-click START WEBSITE.cmd again." -ForegroundColor Red
  exit 1
}

if (!(Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "Installing website dependencies for the first run..." -ForegroundColor Cyan
  & $npm.Source install
}

$nextRunning = Test-LocalPort 3000
if (!$nextRunning) {
  if (!(Test-Path $envFile)) {
    Write-Host "Creating the local Convex deployment..." -ForegroundColor Cyan
    & (Get-Command npx.cmd).Source convex init
    & (Get-Command npx.cmd).Source convex dev --once
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "setup-auth-keys.ps1")
  }

  Write-Host "Starting the local Convex backend..." -ForegroundColor Cyan
  Start-HiddenScript -ScriptPath (Join-Path $root "start-convex.ps1") `
    -OutputPath (Join-Path $logDir "convex.out.log") `
    -ErrorPath (Join-Path $logDir "convex.err.log")

  Start-Sleep -Seconds 3
  Write-Host "Starting Center Business Services..." -ForegroundColor Cyan
  Start-HiddenScript -ScriptPath (Join-Path $root "start-next.ps1") `
    -OutputPath (Join-Path $logDir "next.out.log") `
    -ErrorPath (Join-Path $logDir "next.err.log")

  $deadline = (Get-Date).AddMinutes(2)
  while (!(Test-LocalPort 3000) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
  }
}

if (Test-LocalPort 3000) {
  Write-Host "Website is ready: $siteUrl" -ForegroundColor Green
  Start-Process $siteUrl
  exit 0
}

Write-Host "The website did not start. Check .logs\next.err.log for details." -ForegroundColor Red
exit 1
