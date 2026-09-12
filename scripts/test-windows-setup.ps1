#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$errors = $null
$tokens = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'install.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw ($errors | Out-String) }
. (Join-Path $repo 'install.ps1')

function Assert-True([bool]$Value, [string]$Message) { if (-not $Value) { throw $Message } }
$command = Get-LinuxSetupCommand -GitRef main -App '' -Admin '' -Postgres $false
$encoded = [regex]::Match($command, 'printf %s ([A-Za-z0-9+/=]+)').Groups[1].Value
$script = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
Assert-True ($script.Contains('--skip-caddy --skip-postgres')) 'Local setup must not require DNS or PostgreSQL.'
Assert-True ($script.Contains('id -u') -and $script.Contains('systemd')) 'Non-root/systemd prerequisites missing.'
Assert-True ($script.Contains('bash -n') -and $script.Contains('--retry 3')) 'Bounded download/syntax validation missing.'
Assert-True (-not $script.Contains('__REF__')) 'Ref template was not resolved.'
$rejected = $false
try { Get-LinuxSetupCommand -GitRef '../unsafe' -App '' -Admin '' -Postgres $false } catch { $rejected = $true }
Assert-True $rejected 'Path traversal must be rejected.'
$rejected = $false
try { Get-LinuxSetupCommand -GitRef main -App 'code.example.com' -Admin '' -Postgres $false } catch { $rejected = $true }
Assert-True $rejected 'Partial domain configuration must be rejected.'

function Test-FailingNative { $global:LASTEXITCODE = 17 }
$rejected = $false
try { Invoke-NativeChecked -Command Test-FailingNative -Arguments @() } catch { $rejected = $true }
Assert-True $rejected 'Failed native commands must not be reported as success.'
function Test-SuccessfulNative { Write-Output 'fixture command output'; $global:LASTEXITCODE = 0 }
$result = Invoke-NativeChecked -Command Test-SuccessfulNative -Arguments @()
Assert-True ($null -eq $result) 'Native output must not contaminate the installer exit code.'
Write-Host 'PowerShell parser and setup contract tests passed. This does not certify a real Windows/WSL installation.'
