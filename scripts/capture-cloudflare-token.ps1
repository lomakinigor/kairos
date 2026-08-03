$ErrorActionPreference = 'Stop'

$targetDir = Join-Path $env:APPDATA 'kairos'
$targetFile = Join-Path $targetDir 'cloudflare-token.dpapi'
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

Write-Host 'Вставьте Cloudflare API Token и нажмите Enter.' -ForegroundColor Cyan
Write-Host 'Символы во время ввода не отображаются — это нормально.' -ForegroundColor DarkGray
$secureToken = Read-Host -AsSecureString
if ($secureToken.Length -lt 20) { throw 'Токен выглядит слишком коротким' }

$secureToken | ConvertFrom-SecureString | Set-Content -Encoding UTF8 -LiteralPath $targetFile
Write-Host 'Токен сохранён в зашифрованном виде. Вернитесь в Codex.' -ForegroundColor Green
Read-Host 'Нажмите Enter, чтобы закрыть окно'
