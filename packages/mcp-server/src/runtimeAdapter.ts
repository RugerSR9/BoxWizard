import { randomUUID } from "node:crypto";
import {
  BoxWizardError,
  type CreateEnvironmentRequest,
  type EnvironmentRecord,
  type ExecRequest,
  type ExecResult,
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
    return Array.from(this.environments.values());
  }

  async get(id: string): Promise<EnvironmentRecord> {
    const record = this.environments.get(id);
    if (!record) throw new BoxWizardError("not_found", `No environment with id ${id}`);
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
