# Builds the dashboard and publishes both hosts side by side into publish\, plus a single-file
# self-contained Hugin.exe (frontend embedded, no .NET runtime install needed) into publish-single\.
$ErrorActionPreference = "Stop"
Push-Location hugin-web
npm run build
Pop-Location

# wwwroot must exist before Hugin.Api is compiled for either publish below — its csproj embeds
# wwwroot\** only when the folder is present at build time (Exists('wwwroot')), so the frontend
# build above has to land first for the single-file publish to actually carry it.
dotnet publish Hugin.Console -c Release -o publish
dotnet publish Hugin.Api -c Release -o publish
Write-Host "publish\hugin.exe og publish\hugin-api.exe deler hugin.json + hugin.db."

dotnet publish Hugin.Api -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None `
    -o publish-single
Move-Item -Force (Join-Path publish-single "hugin-api.exe") (Join-Path publish-single "Hugin.exe")
Write-Host "publish-single\Hugin.exe — self-contained, frontend embedded, no .NET runtime needed."
