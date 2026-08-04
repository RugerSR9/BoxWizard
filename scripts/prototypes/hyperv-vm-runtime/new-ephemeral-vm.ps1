<#
.SYNOPSIS
    Prototype: create a short-lived, disposable Hyper-V VM ("VM sandbox") from a
    base image, boot it, and tear it down - the VM-side counterpart to the WSL2
    container runtime prototype.

.DESCRIPTION
    This script documents and implements, at the PowerShell/Hyper-V-module layer
    (the same layer Windows Sandbox itself is built on top of via the Host Compute
    Service), the create -> connect -> destroy lifecycle BoxWizard needs for its
    "GUI/website testing VM" environments.

    IMPORTANT: This requires:
      - Windows 10/11 PRO or ENTERPRISE (Hyper-V is not available on Home editions -
        this is a real product constraint, see docs/mvp-features.md and
        docs/runtime-vm-prototype.md).
      - The Hyper-V Windows feature enabled (Enable-WindowsOptionalFeature
        -Online -FeatureName Microsoft-Hyper-V-All), which requires a reboot and
        LOCAL ADMINISTRATOR rights.
      - A base VHDX to boot from (a sysprepped Windows or a cloud Linux image
        converted to VHDX). Not included by this script - see NOTES.

    Because enabling Hyper-V and provisioning a multi-GB base disk are invasive,
    machine-wide, admin-only changes, this script is NOT auto-executed as part of
    the BoxWizard prototype pass. See docs/runtime-vm-prototype.md for what was
    actually verified on the dev machine (edition/feature detection only) and why.

.PARAMETER VmName
    Name of the ephemeral VM to create.

.PARAMETER BaseVhdPath
    Path to a base VHDX to differencing-disk from (never booted directly - every
    ephemeral VM boots from a copy-on-write differencing disk so the base image is
    reusable and the VM is truly disposable).

.PARAMETER TtlMinutes
    Hard lifetime cap. The VM and its differencing disk are destroyed after this
    many minutes regardless of activity, matching the mandatory-TTL requirement in
    docs/mvp-features.md.

.PARAMETER MemoryMB
    Memory assigned to the ephemeral VM.
#>

param(
    [Parameter(Mandatory = $true)][string]$VmName,
    [Parameter(Mandatory = $true)][string]$BaseVhdPath,
    [int]$TtlMinutes = 60,
    [int]$MemoryMB = 2048
)

$ErrorActionPreference = "Stop"

if (-not (Get-Module -ListAvailable -Name Hyper-V)) {
    throw "Hyper-V PowerShell module not available. Enable the Hyper-V Windows " +
          "feature (admin + reboot required) before running this script. See " +
          "docs/runtime-vm-prototype.md."
}

Import-Module Hyper-V

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

$workDir = Join-Path $env:LOCALAPPDATA "BoxWizard\vm-sandboxes\$VmName"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
$diffDiskPath = Join-Path $workDir "disk.vhdx"

Write-Step "Creating copy-on-write differencing disk from base image (base is never mutated)"
New-VHD -Path $diffDiskPath -ParentPath $BaseVhdPath -Differencing | Out-Null

Write-Step "Creating ephemeral VM '$VmName' (Generation 2, dynamic memory, no persistent state)"
New-VM -Name $VmName -MemoryStartupBytes ($MemoryMB * 1MB) -VHDPath $diffDiskPath `
       -Generation 2 -SwitchName "Default Switch" | Out-Null
Set-VMProcessor -VMName $VmName -Count 2
Set-VMFirmware -VMName $VmName -EnableSecureBoot On

Write-Step "Starting VM"
Start-VM -Name $VmName

Write-Step "Scheduling hard TTL destroy in $TtlMinutes minute(s)"
$job = Register-ScheduledJob -Name "BoxWizard-TTL-$VmName" -ScriptBlock {
    param($name, $disk)
    Stop-VM -Name $name -TurnOff -Force -ErrorAction SilentlyContinue
    Remove-VM -Name $name -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $disk -Force -ErrorAction SilentlyContinue
} -ArgumentList $VmName, $diffDiskPath `
  -Trigger (New-JobTrigger -Once -At (Get-Date).AddMinutes($TtlMinutes))

Write-Host ""
Write-Host "VM '$VmName' is running. Connect with: vmconnect.exe localhost `"$VmName`"" -ForegroundColor Green
Write-Host "It will be force-destroyed automatically at $((Get-Date).AddMinutes($TtlMinutes))."
Write-Host "To destroy immediately: Stop-VM -Name $VmName -TurnOff -Force; Remove-VM -Name $VmName -Force"
