<#
.SYNOPSIS
    Prototype: bring up a dedicated, BoxWizard-owned WSL2 distro with a container
    runtime (Podman, rootless) so the app never depends on Docker Desktop being
    installed or licensed.

.DESCRIPTION
    This is a throwaway PROTOTYPE used to validate feasibility/latency of the
    "bundle our own container runtime via WSL2" approach described in
    docs/mvp-features.md and the project plan. It is not the production installer.

    Steps:
      1. Download a minimal Alpine Linux WSL rootfs (small download, fast boot).
      2. Import it as a new, isolated WSL2 distro named by -DistroName.
      3. Install podman inside it.
      4. Smoke-test by running a container and capturing output.

.PARAMETER DistroName
    Name of the WSL distro to create. Defaults to "BoxWizard-Runtime-Prototype".

.PARAMETER InstallRoot
    Where the distro's virtual disk is stored on the host.

.PARAMETER Cleanup
    If set, unregisters (deletes) the prototype distro at the end instead of
    leaving it installed.

.NOTES
    Requires: Windows 10/11 with WSL2 enabled (wsl --status). No Hyper-V required
    for WSL2 process isolation mode. Run from an elevated or normal shell; WSL
    distro import does not require admin rights on modern Windows builds.
#>

param(
    [string]$DistroName = "BoxWizard-Runtime-Prototype",
    [string]$InstallRoot = "$env:LOCALAPPDATA\BoxWizard\wsl-prototype",
    [switch]$Cleanup
)

$ErrorActionPreference = "Stop"

$rootfsUrl = "https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/x86_64/alpine-minirootfs-3.20.3-x86_64.tar.gz"
$rootfsPath = Join-Path $InstallRoot "alpine-minirootfs.tar.gz"

function Write-Step($msg) {
    Write-Host "==> $msg" -ForegroundColor Cyan
}

if ($Cleanup) {
    Write-Step "Unregistering $DistroName"
    wsl --unregister $DistroName 2>$null
    Write-Host "Done. Prototype distro removed." -ForegroundColor Green
    return
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

Write-Step "Downloading Alpine minirootfs"
if (-not (Test-Path $rootfsPath)) {
    Invoke-WebRequest -Uri $rootfsUrl -OutFile $rootfsPath
} else {
    Write-Host "Already downloaded, skipping."
}

Write-Step "Checking for existing distro named $DistroName"
$existing = wsl -l -q 2>$null | Where-Object { $_.Trim() -eq $DistroName }
if ($existing) {
    Write-Host "Distro already exists, skipping import."
} else {
    Write-Step "Importing $DistroName into WSL2"
    wsl --import $DistroName $InstallRoot $rootfsPath --version 2
}

Write-Step "Installing podman + minimal deps inside $DistroName"
wsl -d $DistroName -- sh -c "apk update && apk add --no-cache podman fuse-overlayfs shadow-uidmap"

Write-Step "Smoke-testing: run a container inside the prototype distro"
$output = wsl -d $DistroName -- podman run --rm alpine:3.20 sh -c "echo BoxWizard-prototype-ok && uname -a"
Write-Host $output

Write-Step "Measuring cold container start latency"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
wsl -d $DistroName -- podman run --rm alpine:3.20 true
$sw.Stop()
Write-Host ("Container start+exit latency: {0} ms" -f $sw.ElapsedMilliseconds)

Write-Host ""
Write-Host "Prototype distro '$DistroName' is ready." -ForegroundColor Green
Write-Host "Run this script with -Cleanup to remove it: .\setup-distro.ps1 -Cleanup -DistroName $DistroName"
