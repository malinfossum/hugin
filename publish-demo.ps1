# Builds the dashboard and publishes a self-contained linux-x64 hugin-api into publish-linux\,
# then zips it for `az webapp deploy`. Self-contained on purpose: the demo must not depend on
# which .NET stacks App Service happens to offer — it runs on the plain Linux image with a
# startup command (demo spec Part E).
$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot

Push-Location hugin-web
npm run build
Pop-Location

# A stale publish-linux\ from an earlier run must never ride along into the new zip.
if (Test-Path "publish-linux") { Remove-Item "publish-linux" -Recurse -Force }

dotnet publish Hugin.Api -c Release -r linux-x64 --self-contained true -p:DebugType=None -o publish-linux

$zip = "hugin-demo.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path "publish-linux" "*") -DestinationPath $zip
# Compress-Archive keeps no Unix file mode, so the App Service startup command must chmod
# hugin-api executable before running it (see spec Part E.2) — plain `--public --state ...`
# without that chmod fails with permission denied.
Write-Host "publish-linux\ + $zip klar. Deploy: az webapp deploy --resource-group hugin-demo --name hugin-demo --src-path $zip --type zip"
Write-Host "Startup command must chmod +x hugin-api before running it — Compress-Archive drops the Unix executable bit (see spec Part E.2)."

Pop-Location
