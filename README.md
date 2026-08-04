# BoxWizard

A local-first, Windows desktop app for spinning up short-lived, disposable Docker
containers and lightweight VMs - novice-friendly to use by hand, and AI-agent
friendly via a built-in MCP server.

This repo currently contains the **research, design, and prototype phase**
output. No production installer exists yet; see `docs/` for the decisions made
and `scripts/prototypes/` + `packages/mcp-server/` + `apps/gui/` for validated
prototypes/scaffolds backing those decisions.

## Why

See `docs/mvp-features.md` for the full feature definition. In short: existing
tools give you either a novice-friendly local GUI (Docker Desktop, Podman
Desktop) *or* an AI-agent-native ephemeral sandbox backend (E2B, Daytona,
MCP-for-Docker projects) - never both, locally. BoxWizard combines them.

## Repo layout

| Path | What it is | Status |
|---|---|---|
| `docs/mvp-features.md` | Precise MVP feature definition | Done |
| `docs/runtime-container-prototype.md` + `scripts/prototypes/wsl-container-runtime/` | Bundled WSL2 + Podman container runtime prototype, validated end-to-end on this dev machine | Validated |
| `docs/runtime-vm-prototype.md` + `scripts/prototypes/hyperv-vm-runtime/` | Hyper-V/HCS ephemeral VM runtime design | Designed; live execution deferred (needs admin + base image, see doc) |
| `docs/mcp-api-design.md` + `packages/mcp-server/` | MCP server & REST API tool surface for agent-driven lifecycle management | Scaffolded, builds, smoke-tested |
| `docs/gui-framework-decision.md` + `apps/gui/` | Tauri + React GUI shell, wired to the local REST API | Scaffolded, builds |
| `docs/installer-design.md` | Installer/first-run/packaging plan | Designed |

## Live monitoring & remote access

Every running environment now reports live CPU/memory usage and a
"communicate with this environment" link, surfaced in both the REST API
(`usage`/`connection` fields on `EnvironmentRecord`, plus `GET
/environments/:id/stats`) and the GUI's environment table:

- **Containers**: CPU%/memory come from the real Docker/Podman stats API.
  "Open Terminal" opens an interactive shell (xterm.js over a WebSocket exec
  bridge) in a new browser tab.
- **VMs**: CPU%/memory come from Hyper-V's `Get-VM`. "Open Console" opens a
  noVNC client in a new browser tab, proxied over WebSocket to the VM's VNC
  server. This requires the guest OS to be running a VNC server on the
  configured port (BoxWizard can't install one inside an arbitrary guest
  image) - see `docs/runtime-vm-prototype.md`.

### Runtime backend selection

Which backend engine (`runtime`) launches a given environment is now a
**per-launch** choice - a dropdown next to each template in the GUI, or the
optional `runtime` field on `create_environment`/`POST /environments` - not
just something implied by `kind`. Valid combinations, discoverable via
`GET /runtimes` (`list_runtimes` MCP tool):

| `kind` | Valid `runtime` values |
|---|---|
| `container` | `docker` (Docker/Podman via `dockerode`, socket from `BOXWIZARD_DOCKER_SOCKET` - defaults to Docker Desktop's Windows named pipe), `mock` (in-memory simulation, no Docker required) |
| `vm` | `hyperv` (PowerShell + Hyper-V; requires the Hyper-V feature enabled + `BOXWIZARD_VM_BASE_VHDX`, or a per-template `BOXWIZARD_VM_BASE_VHDX_<TEMPLATE>`, pointing at a base image), `mock` (in-memory simulation, no Hyper-V required) |

Omitting `runtime` defaults to the real engine (`docker`/`hyperv`). Pick
`mock` per launch to exercise the GUI/agent flow without touching real
Docker/Hyper-V - no env var needed.

`BOXWIZARD_RUNTIME_MODE=mock` still exists as a whole-process fallback for
when neither Docker nor Hyper-V is installed at all (every environment,
regardless of requested `runtime`, uses the in-memory simulation):

```powershell
$env:BOXWIZARD_RUNTIME_MODE = "mock"
npm run dev
```

## Running the prototypes locally

### MCP server / REST API

```powershell
cd packages/mcp-server
npm install
npm run smoke-test   # exercises create/exec/extend/destroy against the mock adapter
npm run dev           # starts the REST API on :4180 (real backends by default) and the MCP server on stdio
```

### GUI shell

```powershell
cd apps/gui
npm install
npm run tauri dev     # requires packages/mcp-server's dev server running for live data
```

### Container runtime prototype (WSL2 + Podman)

```powershell
.\scripts\prototypes\wsl-container-runtime\setup-distro.ps1
# ... and to remove it afterward:
.\scripts\prototypes\wsl-container-runtime\setup-distro.ps1 -Cleanup
```

### VM runtime prototype (Hyper-V)

Requires Windows Pro/Enterprise, the Hyper-V feature enabled (admin + reboot),
and a base VHDX - see `docs/runtime-vm-prototype.md` before running
`scripts/prototypes/hyperv-vm-runtime/new-ephemeral-vm.ps1`.

## Next steps

See "Recommended Next Steps" in the original plan and the follow-up action
items called out in `docs/runtime-vm-prototype.md` and `docs/installer-design.md`
- notably: wire the mock `RuntimeAdapter` in `packages/mcp-server` to the real
WSL2 (`boxwizardd`) and Hyper-V backends, and run a full `tauri build` once
ready to test a real installer.
