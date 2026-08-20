# Builds the dashboard and publishes both hosts side by side into publish\.
$ErrorActionPreference = "Stop"
Push-Location hugin-web
npm run build
Pop-Location
dotnet publish Hugin.Console -c Release -o publish
dotnet publish Hugin.Api -c Release -o publish
Write-Host "publish\hugin.exe og publish\hugin-api.exe deler hugin.json + hugin.db."
