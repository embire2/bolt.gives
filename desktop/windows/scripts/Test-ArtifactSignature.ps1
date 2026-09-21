param(
  [Parameter(Mandatory = $true)]
  [string[]] $Path,

  [string] $TrustRootPath = "certificates/microsoft-enterprise-identity-verification-root-2020.cer",

  [string[]] $IntermediatePath = @(
    "certificates/microsoft-enterprise-id-verification-cs-aoc-ca-03.cer",
    "certificates/microsoft-enterprise-identity-verification-code-signing-pca-2020.cer"
  )
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$expectedCertificateHashes = @{}
$expectedCertificateHashes[$TrustRootPath] = "D549DC2314F7A16E496A515491B273BC9C098E40A070D61EF1602870F0C402D8"
$expectedCertificateHashes[$IntermediatePath[0]] = "39C27939CF5BF64E79BAF65AD40E7A93EEE861740433D4492F5030FC777D63C2"
$expectedCertificateHashes[$IntermediatePath[1]] = "D603BCAAA62A93C0BE43BDE5E5B58047B39FFFC3D4083313E940E09BA8D3EB16"

$trustRoot = $null
$intermediates = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
foreach ($certificatePath in @($TrustRootPath) + $IntermediatePath) {
  $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certificatePath)
  $actualHash = $certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
  if ($actualHash -ne $expectedCertificateHashes[$certificatePath]) {
    throw "$certificatePath did not match its pinned SHA-256 certificate hash."
  }
  if ($certificatePath -eq $TrustRootPath) {
    $trustRoot = $certificate
  } else {
    $null = $intermediates.Add($certificate)
  }
}

foreach ($file in $Path) {
  $signature = Get-AuthenticodeSignature -FilePath $file
  if ($signature.Status -in @(
      [System.Management.Automation.SignatureStatus]::NotSigned,
      [System.Management.Automation.SignatureStatus]::HashMismatch,
      [System.Management.Automation.SignatureStatus]::NotSupportedFileFormat,
      [System.Management.Automation.SignatureStatus]::Incompatible
    )) {
    throw "$file has invalid Authenticode status: $($signature.StatusMessage)"
  }
  if (-not $signature.SignerCertificate) {
    throw "$file does not contain a signer certificate."
  }
  if (-not $signature.TimeStamperCertificate) {
    throw "$file does not contain an RFC3161 timestamp."
  }

  $signerChain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
  $signerChain.ChainPolicy.TrustMode = [System.Security.Cryptography.X509Certificates.X509ChainTrustMode]::CustomRootTrust
  $signerChain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
  $null = $signerChain.ChainPolicy.CustomTrustStore.Add($trustRoot)
  $signerChain.ChainPolicy.ExtraStore.AddRange($intermediates)
  if (-not $signerChain.Build($signature.SignerCertificate)) {
    $details = ($signerChain.ChainStatus | ForEach-Object { $_.Status.ToString() }) -join ', '
    throw "$file has an invalid Azure Artifact Signing certificate chain: $details"
  }
  $chainHashes = @($signerChain.ChainElements | ForEach-Object {
    $_.Certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
  })
  foreach ($expectedPath in @($TrustRootPath) + $IntermediatePath) {
    if ($chainHashes -notcontains $expectedCertificateHashes[$expectedPath]) {
      throw "$file does not use the pinned bolt.gives signing hierarchy ($expectedPath is missing)."
    }
  }

  $timestampChain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
  $timestampChain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::Online
  if (-not $timestampChain.Build($signature.TimeStamperCertificate)) {
    $details = ($timestampChain.ChainStatus | ForEach-Object { $_.Status.ToString() }) -join ', '
    throw "$file has an invalid timestamp certificate chain: $details"
  }

  Write-Host "$file signed by $($signature.SignerCertificate.Subject); Authenticode status: $($signature.Status)"
}
