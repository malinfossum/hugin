# Builds the dashboard and publishes both hosts side by side into publish\, plus a single-file
# self-contained Hugin.exe (frontend embedded, no .NET runtime install needed) into publish-single\.
$ErrorActionPreference = "Stop"

# The version comes from the git tag (spec v3.8 B3). Read it first, before anything below can
# touch the tree, and fall back to "dev" when git is missing or this is not a checkout.
$version = $null
try { $version = git describe --tags --always --dirty 2>$null } catch { }
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) { $version = "dev" }
Write-Host "Version: $version"
Push-Location hugin-web
npm run build
Pop-Location

# wwwroot must exist before Hugin.Api is compiled for either publish below — its csproj embeds
# wwwroot\** only when the folder is present at build time (Exists('wwwroot')), so the frontend
# build above has to land first for the single-file publish to actually carry it.

# dotnet publish copies wwwroot in but never deletes from it, so every old dashboard bundle
# would pile up in publish\wwwroot\assets. Only wwwroot goes: publish\ also holds hugin.json
# and hugin.db, which must survive a rebuild.
$staleWebRoot = Join-Path publish "wwwroot"
if (Test-Path $staleWebRoot) { Remove-Item $staleWebRoot -Recurse -Force }

dotnet publish Hugin.Console -c Release -o publish "-p:InformationalVersion=$version"
dotnet publish Hugin.Api -c Release -o publish "-p:InformationalVersion=$version"
Write-Host "publish\hugin.exe og publish\hugin-api.exe deler hugin.json + hugin.db."

dotnet publish Hugin.Api -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None `
    "-p:InformationalVersion=$version" -o publish-single
Move-Item -Force (Join-Path publish-single "hugin-api.exe") (Join-Path publish-single "Hugin.exe")
Write-Host "publish-single\Hugin.exe — self-contained, frontend embedded, no .NET runtime needed."
