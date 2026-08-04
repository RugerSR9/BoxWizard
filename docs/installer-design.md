# Installer & Packaging Strategy

Status: Design v1. No installer has been built yet - this defines the plan for
turning the pieces validated in this repo (`apps/gui`, `packages/mcp-server`,
the WSL2/Hyper-V prototypes) into the single, novice-friendly install experience
described in `docs/mvp-features.md`.

## Goal

One download, one double-click, and BoxWizard is ready to launch its first
container sandbox - with VM sandboxes either working or clearly explained as
"needs one more step," never silently broken.

## What gets installed

Tauri's bundler (`tauri build`, confirmed working for the frontend half in
`docs/gui-framework-decision.md`) natively produces a Windows installer
(MSI via WiX, or NSIS) containing:

1. The BoxWizard GUI app itself (Rust binary + WebView2-rendered frontend).
2. The bundled `packages/mcp-server` service (compiled/packaged as a sidecar
   binary via Tauri's sidecar mechanism, or run under the system Node if that
   proves simpler - decision point in implementation phase) - this is the
   process that also exposes the MCP server for agents.
3. A copy of the Alpine-based rootfs + first-boot provisioning script from
   `scripts/prototypes/wsl-container-runtime/setup-distro.ps1`, generalized into
   the production "create the BoxWizard WSL2 distro" step, run automatically on
   first launch rather than manually.

## First-run flow (maps directly to prior prototype findings)

1. **Detect environment** (mirrors the checks done in this session for
   `docs/runtime-vm-prototype.md`):
   - WSL2 installed/enabled? (`wsl --status`)
   - Windows edition supports Hyper-V? (Pro/Enterprise/Education vs Home)
   - Hyper-V feature currently enabled? (`Get-VM` availability / feature query)
2. **Container runtime setup (always available on any supported edition)**:
   - Import the bundled WSL2 distro (same operation validated in
     `docs/runtime-container-prototype.md`, ~a few minutes on first run: apk
     install + verification).
   - Start the long-lived `boxwizardd` daemon inside it (see the "recommended
     production architecture" diagram in that doc).
   - This alone unblocks the "launch a headless container" MVP success
     criterion with zero extra user action beyond running the installer.
3. **VM runtime setup (conditional, explicit, user-consented)**:
   - If Hyper-V is already enabled: nothing further needed, VM templates show as
     available immediately.
   - If the edition supports it but the feature is off: show a clear screen -
     "VM sandboxes need one Windows feature enabled and a restart. Container
     sandboxes already work." with a single "Enable now" button that requests
     UAC elevation and schedules the reboot - this is the appropriate, explicit
     place for the privileged operation that was deliberately *not* run
     unattended during this session's VM prototype work (see
     `docs/runtime-vm-prototype.md`, "Why full execution was skipped here").
   - If the edition doesn't support Hyper-V (Home): VM templates are shown
     greyed out with an explanation, container templates work normally.
4. **Base VM image acquisition (only if the user opts into VM sandboxes)**:
   - Deferred download of a base VHDX (Ubuntu Desktop cloud image for the
     Linux GUI template, a user-supplied/sysprepped Windows image for the
     Windows GUI template) - sized in GBs, so this happens on explicit user
     action, with a visible progress bar, not bundled into the installer itself.

## Packaging/versioning decisions

- **Registry defaults**: per the market research, avoid hard Docker-Hub-only
  dependency - configure the bundled runtime to pull official images through a
  local pull-through cache by default, falling back to Docker Hub directly,
  and use ghcr.io for any BoxWizard-authored images (e.g. a future custom base
  image for the Ubuntu dev template).
- **Auto-update**: use Tauri's built-in updater plugin so novices aren't asked
  to manually reinstall for fixes - out of scope to configure in this pass, but
  the chosen framework (`docs/gui-framework-decision.md`) supports it natively.
- **Enterprise variant**: same installer, but exposes (post-MVP) a silent/
  unattended install mode (`msiexec /quiet` compatible) and config for pointing
  the bundled runtime at an internal registry mirror instead of Docker Hub/
  ghcr.io - flagged here as a requirement to carry into the MSI/WiX config when
  implementation starts, not built in this pass.

## What was intentionally not done in this pass

- No actual installer binary was produced. `tauri build` (full native compile +
  MSI/NSIS packaging) was not run in this session - a first native Rust
  compile plus installer bundling can take many minutes and is better run
  interactively when it's time to test the real installer, not as an unattended
  step in this research/prototyping pass.
- No Hyper-V feature was enabled and no base VHDX was downloaded, per the
  reasoning in `docs/runtime-vm-prototype.md`.
