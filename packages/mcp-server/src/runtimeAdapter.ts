import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  BoxWizardError,
  type CreateEnvironmentRequest,
  type EnvironmentRecord,
  type ExecRequest,
  type ExecResult,
  type ResourceUsage,
} from "./types.js";
import { findTemplate } from "./templates.js";

/**
 * The contract every real backend must implement:
 *   - ContainerRuntimeAdapter -> boxwizardd inside the WSL2 distro (see
 *     docs/runtime-container-prototype.md)
 *   - VmRuntimeAdapter -> Hyper-V/HCS driver (see docs/runtime-vm-prototype.md)
 *
 * The REST/MCP layer (restApi.ts, mcpServer.ts) is written entirely against
 * this interface so swapping the mock below for the real backends requires no
 * changes above this layer.
 */
export interface RuntimeAdapter {
  create(req: CreateEnvironmentRequest): Promise<EnvironmentRecord>;
  list(): Promise<EnvironmentRecord[]>;
  get(id: string): Promise<EnvironmentRecord>;
  exec(id: string, req: ExecRequest): Promise<ExecResult>;
  extend(id: string, additionalSeconds: number): Promise<EnvironmentRecord>;
  destroy(id: string): Promise<void>;
  /** Live CPU/memory sample for a running environment. */
  getUsage(id: string): Promise<ResourceUsage>;
  /**
   * Bridge an already-accepted WebSocket to an interactive shell inside a
   * running container. Only meaningful for kind=container; adapters that
   * don't support it should omit this method (wsBridge.ts checks for it).
   */
  attachTerminal?(id: string, socket: WebSocket): Promise<void>;
  /**
   * Resolve the VNC host/port a browser-facing proxy should connect to for a
   * running VM's console. Only meaningful for kind=vm.
   */
  getVncTarget?(id: string): Promise<{ host: string; port: number }>;
}

/** Hard cap enforced server-side regardless of what a caller requests. */
export const MAX_TTL_SECONDS = 4 * 60 * 60; // 4 hours

/**
 * In-memory mock adapter used for local development and the MCP tool surface
 * smoke test before the real WSL2/Hyper-V backends are wired in. Simulates TTL
 * expiry and exec, but never touches an actual container or VM.
 */
export class MockRuntimeAdapter implements RuntimeAdapter {
  private environments = new Map<string, EnvironmentRecord>();
  private ttlTimers = new Map<string, NodeJS.Timeout>();

  async create(req: CreateEnvironmentRequest): Promise<EnvironmentRecord> {
    if (req.ttlSeconds > MAX_TTL_SECONDS) {
      throw new BoxWizardError(
        "ttl_exceeded_max",
        `Requested ttlSeconds (${req.ttlSeconds}) exceeds the server-enforced max (${MAX_TTL_SECONDS}).`,
      );
    }

    let image = req.image ?? null;
    if (req.template) {
      const tpl = findTemplate(req.template);
      if (!tpl) {
        throw new BoxWizardError("invalid_template", `Unknown template id: ${req.template}`);
      }
      if (tpl.kind !== req.kind) {
        throw new BoxWizardError(
          "invalid_template",
          `Template ${req.template} is kind=${tpl.kind}, but kind=${req.kind} was requested.`,
        );
      }
      image = image ?? tpl.image;
    }

    const id = randomUUID();
    const now = new Date();
    const ttlSeconds = req.ttlSeconds;
    const record: EnvironmentRecord = {
      id,
      kind: req.kind,
      runtime: "mock",
      template: req.template ?? null,
      image,
      status: "provisioning",
      createdAt: now.toISOString(),
      ttlSeconds,
      ttlExpiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      resources: {
        cpus: req.resources?.cpus ?? 1,
        memoryMb: req.resources?.memoryMb ?? 1024,
      },
      ports: req.ports ?? [],
      usage: null,
      connection: null,
    };

    this.environments.set(id, record);
    // Simulate near-instant provisioning, as containers should be.
    setTimeout(() => {
      const current = this.environments.get(id);
      if (current && current.status === "provisioning") {
        current.status = "running";
      }
    }, 50);

    this.scheduleTtlDestroy(id, ttlSeconds);
    return record;
  }

  async list(): Promise<EnvironmentRecord[]> {
    return Array.from(this.environments.values()).map((r) => this.withMockUsage(r));
  }

  async get(id: string): Promise<EnvironmentRecord> {
    const record = this.environments.get(id);
    if (!record) throw new BoxWizardError("not_found", `No environment with id ${id}`);
    return this.withMockUsage(record);
  }

  async getUsage(id: string): Promise<ResourceUsage> {
    const record = await this.get(id);
    if (!record.usage) {
      throw new BoxWizardError("not_found", `Environment ${id} has no usage sample (status=${record.status}).`);
    }
    return record.usage;
  }

  /**
   * Mock adapter never touches a real container/VM, so there is nothing to
   * sample - synthesize a plausible-looking usage figure (deterministic per
   * id, varying smoothly over time) so the GUI's CPU/memory columns and
   * polling behavior can be exercised without Docker/Hyper-V installed.
   */
  private withMockUsage(record: EnvironmentRecord): EnvironmentRecord {
    if (record.status !== "running") {
      return { ...record, usage: null };
    }
    const seed = [...record.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const wave = (Math.sin(Date.now() / 4000 + seed) + 1) / 2; // 0..1
    const cpuPercent = Math.round(wave * record.resources.cpus * 60 * 10) / 10;
    const memoryUsedMb = Math.round(record.resources.memoryMb * (0.2 + wave * 0.5));
    const usage: ResourceUsage = {
      cpuPercent,
      memoryUsedMb,
      memoryLimitMb: record.resources.memoryMb,
      sampledAt: new Date().toISOString(),
    };
    record.usage = usage;
    return record;
  }

  async exec(id: string, req: ExecRequest): Promise<ExecResult> {
    const record = await this.get(id);
    if (record.kind !== "container") {
      throw new BoxWizardError(
        "not_supported_for_kind",
        "exec_command is only supported for kind=container in the MVP; VM GUI automation is post-MVP.",
      );
    }
    if (record.status !== "running") {
      throw new BoxWizardError("not_found", `Environment ${id} is not running (status=${record.status}).`);
    }
    // Mock: echo the command back so callers can validate the plumbing end-to-end.
    return {
      stdout: `[mock exec in ${record.image ?? record.template}] ${req.command}\n`,
      stderr: "",
      exitCode: 0,
    };
  }

  async extend(id: string, additionalSeconds: number): Promise<EnvironmentRecord> {
    const record = await this.get(id);
    const newTtlExpiry = new Date(new Date(record.ttlExpiresAt).getTime() + additionalSeconds * 1000);
    const cappedExpiry = new Date(Math.min(newTtlExpiry.getTime(), new Date(record.createdAt).getTime() + MAX_TTL_SECONDS * 1000));
    record.ttlExpiresAt = cappedExpiry.toISOString();

    const remainingMs = cappedExpiry.getTime() - Date.now();
    this.scheduleTtlDestroy(id, Math.max(0, remainingMs / 1000));
    return record;
  }

  async destroy(id: string): Promise<void> {
    const record = await this.get(id);
    record.status = "destroying";
    const timer = this.ttlTimers.get(id);
    if (timer) clearTimeout(timer);
    // Simulate teardown latency, then mark destroyed (kept in map for audit/list visibility).
    setTimeout(() => {
      record.status = "destroyed";
    }, 20);
  }

  private scheduleTtlDestroy(id: string, ttlSeconds: number) {
    const existing = this.ttlTimers.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void this.destroy(id);
    }, ttlSeconds * 1000);
    // Don't let a long TTL keep the process alive by itself (relevant for the
    // MCP server process, which should exit cleanly on shutdown regardless of
    // outstanding TTL timers - real backends will persist TTL state themselves).
    timer.unref();
    this.ttlTimers.set(id, timer);
  }
}
