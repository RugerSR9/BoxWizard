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

## Running the prototypes locally

### MCP server / REST API (mock runtime backend)

```powershell
cd packages/mcp-server
npm install
npm run smoke-test   # exercises create/exec/extend/destroy against the mock adapter
npm run dev           # starts the REST API on :4180 and the MCP server on stdio
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
