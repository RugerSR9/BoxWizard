import type { WebSocket } from "ws";
import {
  BoxWizardError,
  RUNTIMES_BY_KIND,
  type CreateEnvironmentRequest,
  type EnvironmentRecord,
  type EnvironmentRuntime,
  type ExecRequest,
  type ExecResult,
  type ResourceUsage,
} from "./types.js";
import type { RuntimeAdapter } from "./runtimeAdapter.js";

/**
 * Routes create/list/get/exec/destroy/etc. to whichever real backend engine
 * owns a given environment (docker/hyperv/mock), presenting one unified
 * RuntimeAdapter to the REST/MCP layer exactly like the mock did. The choice
 * of engine is per-request (`CreateEnvironmentRequest.runtime`), not just
 * implied by `kind` - see RUNTIMES_BY_KIND for which engines are valid for
 * which kind.
 */
export class CompositeRuntimeAdapter implements RuntimeAdapter {
  private idRuntime = new Map<string, EnvironmentRuntime>();

  constructor(private adapters: Record<EnvironmentRuntime, RuntimeAdapter>) {}

  /** Unique adapter instances - `mock` may be the same instance handling both kinds. */
  private uniqueAdapters(): RuntimeAdapter[] {
    return Array.from(new Set(Object.values(this.adapters)));
  }

  private async adapterForId(id: string): Promise<RuntimeAdapter> {
    const runtime = this.idRuntime.get(id);
    if (runtime) return this.adapters[runtime];
    // Fall back to probing every distinct adapter (e.g. after a process restart lost the map).
    for (const adapter of this.uniqueAdapters()) {
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
    const validRuntimes = RUNTIMES_BY_KIND[req.kind];
    const runtime = req.runtime ?? validRuntimes[0];
    if (!validRuntimes.includes(runtime)) {
      throw new BoxWizardError(
        "invalid_runtime",
        `runtime=${runtime} is not valid for kind=${req.kind}; expected one of ${validRuntimes.join(", ")}.`,
      );
    }

    const record = await this.adapters[runtime].create(req);
    this.idRuntime.set(record.id, runtime);
    return record;
  }

  async list(): Promise<EnvironmentRecord[]> {
    const lists = await Promise.all(this.uniqueAdapters().map((adapter) => adapter.list()));
    return lists.flat();
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
