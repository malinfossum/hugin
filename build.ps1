# Builds the dashboard and publishes both hosts side by side into publish\, plus a single-file
# self-contained Hugin.exe (frontend embedded, no .NET runtime install needed) into publish-single\.
$ErrorActionPreference = "Stop"

# "Stop" covers cmdlets only. A failing npm or dotnet just sets $LASTEXITCODE, and the script
# would carry on and package a stale dashboard as if all went well.
function Assert-Success([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed (exit $LASTEXITCODE)." }
}

# The version comes from the git tag (spec v3.8 B3). Read it first, before anything below can
# touch the tree, and fall back to "dev" when git is missing or this is not a checkout.
$version = $null
try { $version = git describe --tags --always --dirty 2>$null } catch { }
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) { $version = "dev" }
Write-Host "Version: $version"
Push-Location hugin-web
npm run build
$npmExit = $LASTEXITCODE
Pop-Location
if ($npmExit -ne 0) { throw "npm run build failed (exit $npmExit). Run npm ci in hugin-web if the dependencies changed." }

# wwwroot must exist before Hugin.Api is compiled for either publish below. Its csproj embeds
# wwwroot\** only when the folder is present at build time (Exists('wwwroot')), so the frontend
# build above has to land first for the single-file publish to actually carry it.

# dotnet publish copies wwwroot in but never deletes from it, so every old dashboard bundle
# would pile up in publish\wwwroot\assets. Only wwwroot goes: publish\ also holds hugin.json
# and hugin.db, which must survive a rebuild.
$staleWebRoot = Join-Path publish "wwwroot"
if (Test-Path $staleWebRoot) { Remove-Item $staleWebRoot -Recurse -Force }

dotnet publish Hugin.Console -c Release -o publish "-p:InformationalVersion=$version"
Assert-Success "dotnet publish Hugin.Console"
dotnet publish Hugin.Api -c Release -o publish "-p:InformationalVersion=$version"
Assert-Success "dotnet publish Hugin.Api"
Write-Host "publish\hugin.exe og publish\hugin-api.exe deler hugin.json + hugin.db."

dotnet publish Hugin.Api -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None `
    "-p:InformationalVersion=$version" -o publish-single
Assert-Success "dotnet publish Hugin.Api (single file)"
Move-Item -Force (Join-Path publish-single "hugin-api.exe") (Join-Path publish-single "Hugin.exe")
Write-Host "publish-single\Hugin.exe: self-contained, frontend embedded, no .NET runtime needed."
