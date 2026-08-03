$ErrorActionPreference = 'Stop'

$tokenFile = Join-Path $env:APPDATA 'kairos\cloudflare-token.dpapi'
if (-not (Test-Path -LiteralPath $tokenFile)) { throw 'Encrypted Cloudflare token not found.' }

$encrypted = (Get-Content -LiteralPath $tokenFile | Select-Object -First 1).Trim()
$secure = ConvertTo-SecureString $encrypted
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

try {
  $env:CLOUDFLARE_API_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  & npx.cmd -y wrangler@latest @Args
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
}
