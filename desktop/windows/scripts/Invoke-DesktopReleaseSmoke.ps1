param(
  [Parameter(Mandatory = $true)]
  [string] $Version,
  [Parameter(Mandatory = $true)]
  [string] $InstallerPath
)

$ErrorActionPreference = 'Stop'
$installer = (Resolve-Path $InstallerPath).Path
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\bolt.gives Desktop CI'
$stateDir = Join-Path $env:LOCALAPPDATA 'bolt.gives Desktop'
$resultPath = Join-Path $stateDir 'update-result.json'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

function Start-CheckedProcess([Diagnostics.ProcessStartInfo] $StartInfo, [string] $Label) {
  $process = [Diagnostics.Process]::Start($StartInfo)
  if (-not $process) { throw "$Label did not start." }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "$Label exited $($process.ExitCode)." }
}

$installInfo = [Diagnostics.ProcessStartInfo]::new($installer)
$installInfo.UseShellExecute = $false
foreach ($argument in @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=$installDir")) {
  $null = $installInfo.ArgumentList.Add($argument)
}
Start-CheckedProcess $installInfo 'Installer smoke'

$application = Join-Path $installDir 'BoltGives.Desktop.exe'
$updater = Join-Path $installDir 'BoltGives.Desktop.Updater.exe'
if (-not (Test-Path $application) -or -not (Test-Path $updater)) { throw 'Installed app/updater is missing.' }
./scripts/Test-ArtifactSignature.ps1 -Path @($application, $updater)
$installedVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($application).FileVersion
if ([version]$installedVersion -lt [version]$Version) { throw "Installed version is $installedVersion." }

$applicationProcess = [Diagnostics.Process]::Start($application)
$windowDeadline = [DateTime]::UtcNow.AddSeconds(25)
do {
  Start-Sleep -Milliseconds 500
  $applicationProcess.Refresh()
} while (-not $applicationProcess.HasExited -and $applicationProcess.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $windowDeadline)
if ($applicationProcess.HasExited) { throw "Desktop launch smoke exited with $($applicationProcess.ExitCode)." }
if ($applicationProcess.MainWindowHandle -eq 0) { throw 'Desktop launch smoke did not create a native top-level window.' }
$applicationProcess.Kill($true)
$applicationProcess.WaitForExit()

function Invoke-UpdaterSmoke([string] $ExpectedVersion, [bool] $ExpectSuccess, [bool] $ExpectRollback) {
  $staging = Join-Path $stateDir "ci-update-$ExpectedVersion"
  New-Item -ItemType Directory -Force -Path $staging | Out-Null
  $stagedInstaller = Join-Path $staging "bolt.gives-Desktop-Setup-$ExpectedVersion-x64.exe"
  Copy-Item $installer $stagedInstaller -Force
  $stagedUpdater = Join-Path $staging 'BoltGives.Desktop.Updater.exe'
  Copy-Item $updater $stagedUpdater -Force
  $installerHash = (Get-FileHash $stagedInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
  $handoff = [ordered]@{
    Version = $ExpectedVersion
    PreviousVersion = '1.10.2'
    ParentProcessId = 2147483000
    InstallerPath = $stagedInstaller
    InstallerSha256 = $installerHash
    ApplicationPath = $application
    InstallDirectory = $installDir
    ResultPath = $resultPath
    LogPath = (Join-Path $stateDir "ci-update-$ExpectedVersion.log")
    RollbackDirectory = (Join-Path $env:PROGRAMDATA "bolt.gives Desktop\rollback\ci-$ExpectedVersion")
    RelaunchApplication = $false
  }
  $handoffPath = Join-Path $staging 'handoff.json'
  $handoff | ConvertTo-Json -Depth 4 | Set-Content $handoffPath -Encoding utf8NoBOM
  $handoffHash = (Get-FileHash $handoffPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $updateInfo = [Diagnostics.ProcessStartInfo]::new($stagedUpdater)
  $updateInfo.UseShellExecute = $false
  foreach ($argument in @('--handoff', $handoffPath, '--handoff-sha256', $handoffHash)) {
    $null = $updateInfo.ArgumentList.Add($argument)
  }
  $run = [Diagnostics.Process]::Start($updateInfo)
  if (-not $run) { throw 'Updater smoke did not start.' }
  $run.WaitForExit()
  $result = Get-Content $resultPath -Raw | ConvertFrom-Json
  Write-Host "Updater exit $($run.ExitCode); success=$($result.Success); rollback=$($result.RolledBack)"
  if ([bool]$result.Success -ne $ExpectSuccess) { throw "Unexpected updater success state: $($result.Message)" }
  if ([bool]$result.RolledBack -ne $ExpectRollback) { throw "Unexpected rollback state: $($result.Message)" }
  if ($ExpectSuccess -and $run.ExitCode -ne 0) { throw "Updater success smoke exited $($run.ExitCode)." }
  if ($ExpectRollback -and $run.ExitCode -ne 20) { throw "Updater rollback smoke exited $($run.ExitCode)." }
}

Invoke-UpdaterSmoke -ExpectedVersion $Version -ExpectSuccess $true -ExpectRollback $false
Invoke-UpdaterSmoke -ExpectedVersion '99.0.0' -ExpectSuccess $false -ExpectRollback $true
./scripts/Test-ArtifactSignature.ps1 -Path $application
$finalVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($application).FileVersion
if ([version]$finalVersion -lt [version]$Version) { throw 'Rollback did not preserve the verified app.' }

$legacyInstallInfo = [Diagnostics.ProcessStartInfo]::new($installer)
$legacyInstallInfo.UseShellExecute = $false
foreach ($argument in @('/SILENT', '/CLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS', "/DIR=$installDir")) {
  $null = $legacyInstallInfo.ArgumentList.Add($argument)
}
Start-CheckedProcess $legacyInstallInfo 'Legacy updater install'

$legacyRelaunch = $null
$legacyDeadline = [DateTime]::UtcNow.AddSeconds(25)
do {
  Start-Sleep -Milliseconds 500
  $legacyRelaunch = Get-Process BoltGives.Desktop -ErrorAction SilentlyContinue | Where-Object {
    try { $_.MainModule.FileName -eq $application } catch { $false }
  } | Select-Object -First 1
  if ($legacyRelaunch) { $legacyRelaunch.Refresh() }
} while ((-not $legacyRelaunch -or $legacyRelaunch.MainWindowHandle -eq 0) -and [DateTime]::UtcNow -lt $legacyDeadline)
if (-not $legacyRelaunch) { throw 'Legacy updater did not relaunch the installed Desktop app.' }
if ($legacyRelaunch.MainWindowHandle -eq 0) { throw 'Legacy updater relaunch did not create a native top-level window.' }
$legacyRelaunch.Kill($true)
$legacyRelaunch.WaitForExit()
