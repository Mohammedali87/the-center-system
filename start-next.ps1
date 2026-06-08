$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeDir = Join-Path $root ".tools\node-v24.15.0-win-x64"

if (Test-Path (Join-Path $nodeDir "node.exe")) {
  $env:Path = "$nodeDir;$env:Path"
  $npm = Join-Path $nodeDir "npm.cmd"
} else {
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (!$npmCommand) {
    Write-Host "Node.js and npm are required." -ForegroundColor Red
    exit 1
  }
  $npm = $npmCommand.Source
}

$env:NPM_CONFIG_CACHE = Join-Path $root ".npm-cache"
$env:LOCALAPPDATA = Join-Path $root ".localappdata"
New-Item -ItemType Directory -Force -Path $env:NPM_CONFIG_CACHE, $env:LOCALAPPDATA | Out-Null

Set-Location $root
if (!(Test-Path (Join-Path $root ".next\BUILD_ID"))) {
  Write-Host "Building the website for the first run..." -ForegroundColor Cyan
  & $npm run build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Write-Host "Starting Next.js at http://localhost:3000" -ForegroundColor Cyan
& $npm run start -- -p 3000
