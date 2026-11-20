param([string]$Version, [string]$Architecture)
$ErrorActionPreference = 'Stop'
$setup = Get-Item "dist/SmartBoardOS-$Version-win-$Architecture.exe"
$app = @(Get-ChildItem dist -Recurse -Filter 'SmartBoardOS.exe' -File)
if ($app.Count -ne 1) { throw 'Expected one packaged SmartBoardOS executable' }
foreach ($item in @($setup, $app[0])) {
  $signature = Get-AuthenticodeSignature -LiteralPath $item.FullName
  $name = if ($signature.SignerCertificate) {
    $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  }
  if ($signature.Status -ne 'Valid' -or $name -cne $env:SBOS_WIN_PUBLISHER -or !$signature.TimeStamperCertificate) {
    throw "Invalid, unexpected or untimestamped Authenticode signature: $($item.Name) ($($signature.Status))"
  }
}
