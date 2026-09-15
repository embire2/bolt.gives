#requires -Version 5.1
<#
.SYNOPSIS
Install the open-source bolt.gives server in Ubuntu on WSL2.
.DESCRIPTION
This is not the separately released native Windows desktop installer. Existing
distributions, projects, credentials, and Windows security policy are preserved.
Run again after resolving a reported prerequisite; downloads and Linux package
operations have bounded retries. No reboot or WSL shutdown happens silently.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^Ubuntu(?:-[0-9]{2}\.[0-9]{2})?$')]
    [string]$Distribution = 'Ubuntu-24.04',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$')]
    [string]$Ref = 'main',
    [ValidatePattern('^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$')]
    [string]$AppDomain,
    [ValidatePattern('^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$')]
    [string]$AdminDomain,
    [switch]$WithPostgres,
    [switch]$InstallWsl,
    [switch]$CheckOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-NativeChecked {
    param([string]$Command, [string[]]$Arguments, [int[]]$AcceptedCodes = @(0))
    & $Command @Arguments | Out-Host
    $code = $LASTEXITCODE
    if ($AcceptedCodes -notcontains $code) {
        throw "$Command failed (exit $code). No successful installation has been recorded."
    }
}

function Get-LinuxSetupCommand {
    param([string]$GitRef, [string]$App, [string]$Admin, [bool]$Postgres)
    if (($App -and -not $Admin) -or ($Admin -and -not $App)) {
        throw 'Supply both -AppDomain and -AdminDomain, or neither for localhost setup.'
    }
    if ($GitRef.Contains('..') -or $GitRef.EndsWith('/')) {
        throw 'Git ref cannot contain .. or end with a slash.'
    }
    $options = '--skip-caddy'
    if ($App) { $options = "--app-domain $App --admin-domain $Admin" }
    if ($Postgres) { $options += ' --with-postgres' } else { $options += ' --skip-postgres' }
    # Values are parameter-validated and base64 avoids Windows/WSL quoting differences.
    $script = @'
set -Eeuo pipefail
if [[ "$(id -u)" -eq 0 ]]; then
  printf '%s\n' 'Create/select a non-root Ubuntu user with sudo access, then rerun setup.' >&2
  exit 20
fi
if [[ "$(ps -p 1 -o comm=)" != systemd ]]; then
  printf '%s\n' 'WSL systemd is not active. Enable [boot] systemd=true in /etc/wsl.conf, save your work, then restart this distribution and rerun setup.' >&2
  exit 21
fi
command -v curl >/dev/null || { sudo apt-get update && sudo apt-get install -y curl ca-certificates; }
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
curl --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 120 --retry 3 --retry-delay 2 -fsSL 'https://raw.githubusercontent.com/embire2/bolt.gives/__REF__/install.sh' -o "$temporary/install.sh"
bash -n "$temporary/install.sh"
bash "$temporary/install.sh" --branch '__REF__' __OPTIONS__
'@
    $script = $script.Replace('__REF__', $GitRef).Replace('__OPTIONS__', $options)
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
    # Execute a file so the Linux install wizard retains the user's console stdin.
    return "t=`$(mktemp); printf %s $encoded | base64 -d >`$t; bash `$t; result=`$?; rm -f `$t; exit `$result"
}

function Invoke-BoltSetup {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'This entry point requires Windows. On Ubuntu, run bash ./install.sh instead.'
    }
    $command = Get-LinuxSetupCommand -GitRef $Ref -App $AppDomain -Admin $AdminDomain -Postgres $WithPostgres.IsPresent
    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if (-not $wsl) {
        throw 'WSL is unavailable. Install WSL2 using Microsoft Windows features, reboot if requested, then rerun this script.'
    }
    $installed = @(& $wsl.Source --list --quiet 2>$null) -join "`n"
    $listCode = $LASTEXITCODE
    $names = @($installed.Replace("`0", '').Split("`n") | ForEach-Object { $_.Trim() })
    if ($listCode -ne 0 -or $names -notcontains $Distribution) {
        if ($CheckOnly -or -not $InstallWsl) {
            throw "$Distribution is not ready. Rerun with -InstallWsl to request administrator-approved WSL setup."
        }
        $process = Start-Process -FilePath $wsl.Source -ArgumentList @('--install', '--distribution', $Distribution, '--no-launch') -Verb RunAs -Wait -PassThru
        if (@(0, 3010, 1641) -notcontains $process.ExitCode) {
            throw "WSL installation failed (exit $($process.ExitCode)). Verify virtualization/network access and rerun; no distributions were deleted."
        }
        Write-Host "WSL setup finished or requires a reboot. Save your work, reboot if requested, then launch $Distribution and create your Linux user. Rerun this script afterward."
        return 3010
    }
    if ($CheckOnly) {
        Invoke-NativeChecked -Command $wsl.Source -Arguments @('--distribution', $Distribution, '--exec', 'bash', '-lc', 'test $(id -u) -ne 0 && test $(ps -p 1 -o comm=) = systemd')
        Write-Host 'Ubuntu user and systemd prerequisites passed. Installation/build/runtime health have not been tested by -CheckOnly.'
        return 0
    }
    Invoke-NativeChecked -Command $wsl.Source -Arguments @('--distribution', $Distribution, '--exec', 'bash', '-lc', $command)
    Write-Host 'Linux installer health checks passed. Open http://localhost:5173, unless you configured a public domain.'
    return 0
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        $result = Invoke-BoltSetup
        exit $result
    } catch {
        Write-Error "Setup stopped safely: $($_.Exception.Message) Rerun the same command after resolving the reported problem." -ErrorAction Continue
        exit 1
    }
}
