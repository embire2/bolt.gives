param(
  [Parameter(Mandatory = $true)]
  [string[]] $Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$pins = @(
  @{ Path = "certificates/microsoft-enterprise-identity-verification-root-2020.cer"; Hash = "D549DC2314F7A16E496A515491B273BC9C098E40A070D61EF1602870F0C402D8"; Root = $true; Hierarchy = "legacy" },
  @{ Path = "certificates/microsoft-enterprise-id-verification-cs-aoc-ca-03.cer"; Hash = "39C27939CF5BF64E79BAF65AD40E7A93EEE861740433D4492F5030FC777D63C2"; Root = $false; Hierarchy = "legacy" },
  @{ Path = "certificates/microsoft-enterprise-identity-verification-code-signing-pca-2020.cer"; Hash = "D603BCAAA62A93C0BE43BDE5E5B58047B39FFFC3D4083313E940E09BA8D3EB16"; Root = $false; Hierarchy = "legacy" },
  @{ Path = "certificates/microsoft-identity-verification-root-2020.cer"; Hash = "5367F20C7ADE0E2BCA790915056D086B720C33C1FA2A2661ACF787E3292E1270"; Root = $true; Hierarchy = "current" },
  @{ Path = "certificates/microsoft-id-verified-cs-aoc-ca-04.cer"; Hash = "15CEF5F63CA6D1F022B293E92C61C0059C49BB92EECDBCDE3A125D3C6356D94F"; Root = $false; Hierarchy = "current" },
  @{ Path = "certificates/microsoft-id-verified-code-signing-pca-2021.cer"; Hash = "3D29798CC5D3F0644A7E0DC9CB1CADE523EA5EC83B335109B605BFEAA7D5F5C1"; Root = $false; Hierarchy = "current" }
)
$approvedPublisherAttributes = @(
  "CN=lovemedia2.onmicrosoft.com",
  "O=lovemedia2.onmicrosoft.com",
  "OU=OpenWeb.co.za",
  "C=ZA"
)
$certificates = @{}
$trustRoots = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
$intermediates = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
foreach ($pin in $pins) {
  $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($pin.Path)
  $actualHash = $certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
  if ($actualHash -ne $pin.Hash) {
    throw "$($pin.Path) did not match its pinned SHA-256 certificate hash."
  }
  $certificates[$pin.Path] = $certificate
  if ($pin.Root) {
    $null = $trustRoots.Add($certificate)
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
  $subjectAttributes = @($signature.SignerCertificate.Subject -split ',' | ForEach-Object { $_.Trim() })
  foreach ($attribute in $approvedPublisherAttributes) {
    if ($subjectAttributes -notcontains $attribute) {
      throw "$file is signed by an unexpected publisher."
    }
  }

  $signerChain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
  $signerChain.ChainPolicy.TrustMode = [System.Security.Cryptography.X509Certificates.X509ChainTrustMode]::CustomRootTrust
  $signerChain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
  $signerChain.ChainPolicy.CustomTrustStore.AddRange($trustRoots)
  $signerChain.ChainPolicy.ExtraStore.AddRange($intermediates)
  if (-not $signerChain.Build($signature.SignerCertificate)) {
    $details = ($signerChain.ChainStatus | ForEach-Object { $_.Status.ToString() }) -join ', '
    throw "$file has an invalid Azure Artifact Signing certificate chain: $details"
  }
  $chainHashes = @($signerChain.ChainElements | ForEach-Object {
    $_.Certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
  })
  $matchesApprovedHierarchy = @('legacy', 'current') | Where-Object {
    $hierarchy = $_
    @($pins | Where-Object Hierarchy -eq $hierarchy | Where-Object { $chainHashes -contains $_.Hash }).Count -eq 3
  }
  if (-not $matchesApprovedHierarchy) {
    throw "$file does not use an approved bolt.gives Artifact Signing hierarchy."
  }

  $timestampChain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
  $timestampChain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::Online
  if (-not $timestampChain.Build($signature.TimeStamperCertificate)) {
    $details = ($timestampChain.ChainStatus | ForEach-Object { $_.Status.ToString() }) -join ', '
    throw "$file has an invalid timestamp certificate chain: $details"
  }

  Write-Host "$file signed by $($signature.SignerCertificate.Subject); Authenticode status: $($signature.Status)"
}
