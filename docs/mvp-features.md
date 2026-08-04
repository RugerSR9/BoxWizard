# BoxWizard MVP Feature Definition

Status: Draft v1 (design phase, no implementation commitments beyond prototypes in this repo)

## Goal

A local-first Windows app that lets a novice click a button (or an AI agent call an
API/MCP tool) to get a short-lived, disposable environment - either a headless Docker
container or a lightweight GUI-capable VM - and have it cleaned up automatically.

## Personas

- **Novice human**: wants "give me a throwaway Ubuntu box" or "let me try this
  Docker image safely" without knowing what a container or VM is.
- **Enterprise professional**: wants audit logs, resource quotas, network isolation
  controls, and the ability to point at internal registries/templates.
- **AI coding agent**: wants a scriptable API (MCP tool calls) to provision a
  headless sandbox for running/testing code, or a GUI sandbox for testing a
  website/desktop app, then tear it down when done.

## MVP scope (confirmed): Docker containers AND lightweight VMs, Windows-first

## Core feature list

### 1. Environment catalog / templates
- Curated list of starter templates shown in the GUI on first run:
  - Headless: `python:3.12`, `node:22`, `ubuntu:24.04` (+ dev tools), generic "custom image" entry.
  - GUI/VM: "Windows GUI test box" (for website/desktop app testing), "Ubuntu Desktop test box".
- Users/agents can specify an arbitrary OCI image reference instead of a template.
- Templates are just metadata (image ref + default resource limits + default TTL +
  optional startup command) stored as JSON, editable without touching app code.

### 2. One-click / one-call ephemeral provisioning
- GUI: pick a template (or paste an image ref) -> "Launch" -> environment is running
  within the runtime's normal boot time, shown in a live list with status, uptime,
  and a countdown to auto-destroy.
- Agent/API: a single `create_environment` call with `{ kind: container|vm, image
  or template, ttlSeconds, resources }` returns an environment id and connection info.

### 3. TTL-based auto-destroy (the "ephemeral" guarantee)
- Every environment has a mandatory max lifetime (default e.g. 60 min, configurable,
  hard cap enforced by BoxWizard regardless of what the caller requests, to protect
  novices from accidentally leaving something running forever).
- Idle-timeout as a secondary signal (no exec/attach activity for N minutes ->
  eligible for early destroy), off by default at MVP, on by default for VMs.
- Manual "extend" and manual "destroy now" always available in GUI and API.

### 4. Exec / attach into a running sandbox
- Containers: stream stdin/stdout/stderr of a shell (`exec`) both from the GUI
  (embedded terminal) and from the agent API (used for running tests/build commands).
- VMs: GUI gets an embedded remote-display view (RDP/Hyper-V VMConnect-equivalent);
  agents get a documented but explicitly best-effort automation surface (see
  `docs/mcp-api-design.md` - full GUI automation for agents is post-MVP).

### 5. Resource limits and isolation defaults
- Per-environment CPU/memory caps (sane novice defaults, overridable).
- No inbound network access to the host by default; explicit opt-in port
  forwarding when a template needs to expose something (e.g. a website test box on
  port 3000).
- Every environment is isolated from every other environment by default (no shared
  network unless explicitly grouped, which is a post-MVP feature).

### 6. Unified environment list + lifecycle visibility
- One GUI list showing all running/queued/recently-destroyed environments across
  both containers and VMs, with kind, template, TTL remaining, and quick actions
  (attach, extend, destroy).
- Same data available over the API/MCP `list_environments` tool so an agent can
  check on environments it created earlier in a session.

### 7. First-run setup wizard
- Detects whether prerequisites are present (WSL2 enabled, Hyper-V available -
  Pro/Enterprise Windows only) and walks the user through enabling what's missing,
  or clearly explains what's unavailable on Home editions (VM sandboxes will be
  disabled, container sandboxes still work).
- One installer, no separate "install Docker Desktop first" step.

## Explicitly out of scope for MVP
- Cross-platform (macOS/Linux) support.
- Snapshot/resume of running environments.
- Multi-environment networking/grouping ("give my agent 3 boxes that can talk to
  each other").
- Cloud burst / remote execution (everything is local-only for MVP).
- Full GUI-automation API for VM sandboxes (agents can launch/attach/destroy VMs,
  but driving the VM's GUI programmatically is a stretch goal, not MVP - see
  `docs/mcp-api-design.md`).
- Team/multi-user accounts, RBAC, SSO (enterprise features noted for later, not MVP).

## Success criteria for MVP
- A novice can install BoxWizard, launch a headless container template, run a
  command in it, and see it auto-destroy, all without touching a terminal.
- A novice can launch a GUI VM template, use it to open a website, and close it.
- An AI agent (e.g. via this repo's MCP server) can create a headless container
  sandbox, exec a test command, read the result, and destroy it, entirely through
  MCP tool calls with no human clicking anything.
- Uninstalling BoxWizard leaves no orphaned running containers or VMs.
