$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "Deploying the website and Convex backend to Vercel..." -ForegroundColor Cyan
Write-Host "Vercel will ask you to sign in or link the project when needed." -ForegroundColor Yellow
& npx.cmd vercel --prod
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
