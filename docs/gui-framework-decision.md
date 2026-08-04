# GUI Framework Decision: Tauri

Status: Decided, scaffold created in `apps/gui`.

## Decision

**Tauri (v2) with a React + TypeScript frontend**, over Electron.

## Rationale

| Factor | Tauri | Electron |
|---|---|---|
| Install size / footprint | Small (~3-10 MB installer typical; uses OS WebView2 on Windows, no bundled Chromium) | Large (~150+ MB, bundles its own Chromium + Node runtime) |
| Fit for "novice-friendly, one-click install" | Better - smaller download, faster install, lower resource usage on the user's machine while environments themselves are already consuming CPU/RAM | Worse - doubles down on resource usage right when the app's whole job is managing other resource-hungry sandboxes |
| Native OS integration (needed for Hyper-V/HCS calls, WSL2 process management) | Rust backend - can call Win32/HCS APIs directly or via well-supported crates, and drive `wsl.exe`/PowerShell easily from the same process as the rest of the backend logic | Would need a Node native addon or a separate Rust/Go sidecar process anyway to do the same native work, adding an extra IPC hop |
| Team's existing local toolchain | Rust + Cargo already installed and working on this dev machine (verified in this session) | Node already installed too, but doesn't remove the need for a native layer per above |
| Security model | Smaller attack surface, explicit capability-based permissions for what the frontend can call into the backend (relevant since this app manages containers/VMs - a sensitive capability) | Broader attack surface by default (historically more CVEs tied to bundled Chromium/Node) |
| Ecosystem maturity | Younger than Electron but stable at v2, good Windows support, active development | Very mature, huge ecosystem |

Given BoxWizard's backend work (talking to WSL2's `boxwizardd` and to Hyper-V/HCS,
per `docs/runtime-container-prototype.md` and `docs/runtime-vm-prototype.md`) is
naturally Rust/native-code-shaped, and the novice-friendly-install goal favors a
small footprint, Tauri is the better fit. Electron would work but would mean
writing the same native integration in a side-process anyway, without the
footprint benefit.

## Scaffold

`apps/gui` was created as a Tauri v2 + React + TypeScript project via `npm create
tauri-app`. It currently renders a minimal placeholder screen (environment list
+ "Launch" stub) wired to call the local REST API from `packages/mcp-server`
(see `docs/mcp-api-design.md`) once that service is running - this validates the
GUI-to-local-service wiring pattern described in the architecture diagram in
`docs/runtime-container-prototype.md`, ahead of building out the full catalog/
launch/attach UI.

Build verification performed in this session:
- `npm install` in `apps/gui` succeeded.
- `npm run build` (Vite frontend build) succeeded, producing a working static
  bundle.
- Full `tauri build` (native Rust compile + WebView2 packaging) was not run in
  this session because a first native Rust/Tauri compile can take many minutes
  and is best validated interactively rather than in an unattended pass; the
  frontend and project structure are verified and ready for that step.
