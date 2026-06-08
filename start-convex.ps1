$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:CONVEX_AGENT_MODE = "anonymous"
$npx = (Get-Command npx.cmd -ErrorAction Stop).Source

Set-Location $root
Write-Host "Starting the local Convex backend..." -ForegroundColor Cyan
& $npx convex dev --tail-logs disable
