import type { WebSocket } from "ws";
import {
  BoxWizardError,
  type CreateEnvironmentRequest,
  type EnvironmentKind,
  type EnvironmentRecord,
  type ExecRequest,
  type ExecResult,
  type ResourceUsage,
} from "./types.js";
import type { RuntimeAdapter } from "./runtimeAdapter.js";

/**
 * Routes create/list/get/exec/destroy/etc. to whichever real backend owns a
 * given environment (DockerRuntimeAdapter for kind=container,
 * HyperVRuntimeAdapter for kind=vm), presenting one unified RuntimeAdapter to
 * the REST/MCP layer exactly like the mock did.
 */
export class CompositeRuntimeAdapter implements RuntimeAdapter {
  private idKind = new Map<string, EnvironmentKind>();

  constructor(
    private containerAdapter: RuntimeAdapter,
    private vmAdapter: RuntimeAdapter,
  ) {}

  private adapterFor(kind: EnvironmentKind): RuntimeAdapter {
    return kind === "container" ? this.containerAdapter : this.vmAdapter;
  }

  private async adapterForId(id: string): Promise<RuntimeAdapter> {
    const kind = this.idKind.get(id);
    if (kind) return this.adapterFor(kind);
    // Fall back to probing both (e.g. after a process restart lost the map).
    for (const adapter of [this.containerAdapter, this.vmAdapter]) {
      try {
        await adapter.get(id);
        return adapter;
      } catch {
        // try the next one
      }
    }
    throw new BoxWizardError("not_found", `No environment with id ${id}`);
  }

  async create(req: CreateEnvironmentRequest): Promise<EnvironmentRecord> {
    const record = await this.adapterFor(req.kind).create(req);
    this.idKind.set(record.id, req.kind);
    return record;
  }

  async list(): Promise<EnvironmentRecord[]> {
    const [containers, vms] = await Promise.all([this.containerAdapter.list(), this.vmAdapter.list()]);
    return [...containers, ...vms];
  }

  async get(id: string): Promise<EnvironmentRecord> {
    return (await this.adapterForId(id)).get(id);
  }

  async exec(id: string, req: ExecRequest): Promise<ExecResult> {
    return (await this.adapterForId(id)).exec(id, req);
  }

  async extend(id: string, additionalSeconds: number): Promise<EnvironmentRecord> {
    return (await this.adapterForId(id)).extend(id, additionalSeconds);
  }

  async destroy(id: string): Promise<void> {
    return (await this.adapterForId(id)).destroy(id);
  }

  async getUsage(id: string): Promise<ResourceUsage> {
    return (await this.adapterForId(id)).getUsage(id);
  }

  async attachTerminal(id: string, socket: WebSocket): Promise<void> {
    const adapter = await this.adapterForId(id);
    if (!adapter.attachTerminal) {
      throw new BoxWizardError("not_supported_for_kind", "This environment does not support an interactive terminal.");
    }
    return adapter.attachTerminal(id, socket);
  }

  async getVncTarget(id: string): Promise<{ host: string; port: number }> {
    const adapter = await this.adapterForId(id);
    if (!adapter.getVncTarget) {
      throw new BoxWizardError("not_supported_for_kind", "This environment does not support a VNC console.");
    }
    return adapter.getVncTarget(id);
  }
}
