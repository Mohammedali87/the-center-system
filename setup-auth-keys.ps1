$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:CONVEX_AGENT_MODE = "anonymous"

Set-Location $root
$node = (Get-Command node.exe -ErrorAction Stop).Source
$npx = (Get-Command npx.cmd -ErrorAction Stop).Source

Write-Host "Generating Convex Auth keys..." -ForegroundColor Cyan
$lines = & $node generateKeys.mjs
$privateKey = ($lines | Where-Object { $_ -like "JWT_PRIVATE_KEY=*" }) -replace '^JWT_PRIVATE_KEY="', '' -replace '"$', ''
$jwks = ($lines | Where-Object { $_ -like "JWKS=*" }) -replace '^JWKS=', ''

if (!$privateKey -or !$jwks) {
  Write-Host "Could not parse generated keys." -ForegroundColor Red
  exit 1
}

$tempEnv = Join-Path $env:TEMP "center-business-convex-auth.env"
@(
  "SITE_URL=http://localhost:3000",
  "APP_URL=http://localhost:3000",
  "JWT_PRIVATE_KEY=""$privateKey""",
  "JWKS=$jwks"
) | Set-Content -LiteralPath $tempEnv -Encoding utf8

Write-Host "Setting local Convex Auth environment variables..." -ForegroundColor Cyan
& $npx convex env set --from-file $tempEnv --force
Remove-Item -LiteralPath $tempEnv -Force
Write-Host "Convex Auth is configured." -ForegroundColor Green
