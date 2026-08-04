# Prototype Findings: Hyper-V / HCS-driven Ephemeral VM Runtime

Status: Partially validated. Feature-detection was run on the dev machine; full
VM create/boot/destroy was **not** executed because it requires admin rights and
a machine-wide feature change that shouldn't be applied without explicit consent.

## What was checked on the dev machine

| Check | Result |
|---|---|
| Windows edition | Windows 10 **Pro** - supports Hyper-V (Home editions do not) |
| Current shell has local admin rights | **No** |
| Hyper-V PowerShell module / `Get-VM` available | **No** (module not loaded/feature likely not enabled) |
| `Get-WindowsOptionalFeature` query | Failed - "requires elevation" |
| `vmcompute.dll` (Host Compute Service binary) present | **Yes** - present on all modern Windows 10/11, confirms the underlying HCS platform exists on-box even when the feature is off |
| `WindowsSandbox.exe` present | **No** - confirms the Hyper-V/Windows-Sandbox optional feature is not currently enabled on this machine |

## Why full execution was skipped here

Actually creating a Hyper-V VM requires, in order:

1. Local administrator rights to run `Enable-WindowsOptionalFeature -Online
   -FeatureName Microsoft-Hyper-V-All`, which forces a **reboot** of the dev
   machine.
2. A base VHDX/VHD to boot from - either a sysprepped Windows image (multi-GB,
   requires a licensed Windows ISO) or a Linux cloud image converted to VHDX.
   Neither is something to download/provision unattended as part of a prototype
   pass without the user's explicit go-ahead, given the size and time cost.

Given those two hard requirements, running this destructively/invasively on the
user's real dev machine without asking first would be inappropriate. The design
and script (`scripts/prototypes/hyperv-vm-runtime/new-ephemeral-vm.ps1`) are
written and ready; running them is a follow-up action item, not a blocker to the
rest of this plan.

## Confirms / informs the design decision

- **The plan's premise is confirmed real**: `vmcompute.dll` being present on
  every modern Windows install, while the *feature* (and therefore `Get-VM`,
  `New-VM`, `WindowsSandbox.exe`) is opt-in, exactly matches the market research
  finding that Windows Sandbox and Hyper-V VMs share the same underlying platform
  (HCS) - BoxWizard driving HCS/Hyper-V directly (rather than only shelling out to
  Windows Sandbox's `.wsb` files) is architecturally sound and gives the
  multi-concurrent-VM flexibility the plan calls for.
- **Real, confirmed novice-facing constraint**: because Hyper-V requires Pro/
  Enterprise/Education editions and admin rights plus a reboot to enable, the
  BoxWizard first-run wizard (see `docs/mvp-features.md`, "First-run setup
  wizard") must:
  1. Detect edition + feature state (as done above) up front.
  2. On Home editions or when the feature is off, clearly tell the user "VM
     sandboxes require enabling a Windows feature and a restart; container
     sandboxes work right now without that" rather than silently failing.
  3. Offer a one-click "enable Hyper-V for me" action that requests elevation
     (UAC prompt) and schedules the reboot - this is the correct place for a
     privileged operation, i.e. an explicit, user-initiated action inside the
     installed app, not an unattended background script.

## Design of the ephemeral VM lifecycle (validated by design/code review, pending
live execution)

`scripts/prototypes/hyperv-vm-runtime/new-ephemeral-vm.ps1` implements the full
intended lifecycle:

1. **Never boot the base image directly** - every ephemeral VM boots from a
   copy-on-write differencing disk (`New-VHD -Differencing`) against a reusable
   base VHDX. This is what makes VM sandboxes truly disposable and fast to spin
   up repeatedly (no re-provisioning the base each time), mirroring how container
   images work (immutable base + throwaway writable layer).
2. **Generation 2 VM, Secure Boot on, dynamic memory** - sane, modern defaults.
3. **Hard TTL enforcement** - a scheduled job force-destroys the VM and deletes
   its differencing disk at TTL expiry, independent of whether anything inside
   BoxWizard's own process is still running. This satisfies the "mandatory max
   lifetime enforced by BoxWizard regardless of what the caller requests"
   requirement from `docs/mvp-features.md`.
4. **Human GUI access** via `vmconnect.exe` (built into Windows, no extra
   dependency) - BoxWizard's GUI can shell out to this or embed an RDP/VMConnect
   view directly.

## Follow-up action items (tracked outside this plan's immediate scope)
- With explicit user go-ahead: enable Hyper-V on a real or disposable test
  machine/VM, build or download a minimal base VHDX (e.g. Ubuntu Server cloud
  image converted via `qemu-img`, since a full desktop GUI test box could start
  as an XFCE/Ubuntu Desktop image), and run `new-ephemeral-vm.ps1` end-to-end to
  get real boot-latency numbers (comparable to the ~4.5s container number in
  `docs/runtime-container-prototype.md`).
- Evaluate calling the HCS API directly (via P/Invoke from the Rust backend,
  bypassing PowerShell entirely) for production, since PowerShell + Hyper-V
  cmdlets add their own process-launch overhead the same way `wsl -d` did for
  containers - the same "long-lived local daemon, not per-call shell-out" lesson
  from `docs/runtime-container-prototype.md` applies here too.
