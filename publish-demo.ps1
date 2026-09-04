# Builds the dashboard and publishes a self-contained linux-x64 hugin-api into publish-linux\,
# then zips it for `az webapp deploy`. Self-contained on purpose: the demo must not depend on
# which .NET stacks App Service happens to offer — it runs on the plain Linux image with a
# startup command (demo spec Part E).
$ErrorActionPreference = "Stop"
Push-Location hugin-web
npm run build
Pop-Location

dotnet publish Hugin.Api -c Release -r linux-x64 --self-contained true -p:DebugType=None -o publish-linux

$zip = "hugin-demo.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path "publish-linux" "*") -DestinationPath $zip
Write-Host "publish-linux\ + $zip klar. Deploy: az webapp deploy --resource-group hugin-demo --name hugin-demo --src-path $zip --type zip"
