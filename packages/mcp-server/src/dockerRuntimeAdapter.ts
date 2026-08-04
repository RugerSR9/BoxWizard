import { randomUUID } from "node:crypto";
import Docker from "dockerode";
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
import { MAX_TTL_SECONDS } from "./runtimeAdapter.js";
import type { RuntimeAdapter } from "./runtimeAdapter.js";

const LABEL = "boxwizard.managed";

/** Where to keep the container alive between exec calls (headless sandbox, no default CMD reliance). */
const KEEP_ALIVE_CMD = ["tail", "-f", "/dev/null"];

function dockerConnection(): Docker {
  const socketPath = process.env.BOXWIZARD_DOCKER_SOCKET ?? (process.platform === "win32" ? "//./pipe/docker_engine" : "/var/run/docker.sock");
  return new Docker({ socketPath });
}

/**
 * Real container backend, talking to whatever Docker/Podman-compatible API is
 * reachable at BOXWIZARD_DOCKER_SOCKET (defaults to Docker Desktop's named
 * pipe on Windows). Bookkeeping for TTL/template stays in-memory like the
 * mock adapter did, but create/exec/destroy/stats all hit the real engine.
 */
export class DockerRuntimeAdapter implements RuntimeAdapter {
  private docker = dockerConnection();
  private environments = new Map<string, EnvironmentRecord>();
  private ttlTimers = new Map<string, NodeJS.Timeout>();

  async create(req: CreateEnvironmentRequest): Promise<EnvironmentRecord> {
    if (req.kind !== "container") {
      throw new BoxWizardError("not_supported_for_kind", "DockerRuntimeAdapter only handles kind=container.");
    }
    if (req.ttlSeconds > MAX_TTL_SECONDS) {
      throw new BoxWizardError(
        "ttl_exceeded_max",
        `Requested ttlSeconds (${req.ttlSeconds}) exceeds the server-enforced max (${MAX_TTL_SECONDS}).`,
      );
    }

    let image = req.image ?? null;
    if (req.template) {
      const tpl = findTemplate(req.template);
      if (!tpl) throw new BoxWizardError("invalid_template", `Unknown template id: ${req.template}`);
      if (tpl.kind !== "container") {
        throw new BoxWizardError("invalid_template", `Template ${req.template} is kind=${tpl.kind}, not container.`);
      }
      image = image ?? tpl.image;
    }
    if (!image) {
      throw new BoxWizardError("invalid_template", "create_environment requires either a template or an explicit image for kind=container.");
    }

    await this.ensureImage(image);

    const cpus = req.resources?.cpus ?? 1;
    const memoryMb = req.resources?.memoryMb ?? 1024;
    const ports = req.ports ?? [];
    const id = randomUUID();
    const now = new Date();
    const ttlExpiresAt = new Date(now.getTime() + req.ttlSeconds * 1000);

    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    const exposedPorts: Record<string, object> = {};
    for (const p of ports) {
      const key = `${p.containerPort}/tcp`;
      exposedPorts[key] = {};
      portBindings[key] = [{ HostPort: String(p.hostPort) }];
    }

    const cmd = req.startupCommand ? ["/bin/sh", "-c", req.startupCommand] : KEEP_ALIVE_CMD;

    let container: Docker.Container;
    try {
      container = await this.docker.createContainer({
        Image: image,
        Cmd: cmd,
        Labels: { [LABEL]: "true", "boxwizard.id": id },
        ExposedPorts: exposedPorts,
        HostConfig: {
          Memory: Math.round(memoryMb * 1024 * 1024),
          NanoCpus: Math.round(cpus * 1e9),
          PortBindings: portBindings,
          AutoRemove: false,
        },
      });
      await container.start();
    } catch (err) {
      throw new BoxWizardError("runtime_unavailable", `Failed to create/start container: ${(err as Error).message}`);
    }

    const record: EnvironmentRecord = {
      id,
      kind: "container",
      runtime: "docker",
      template: req.template ?? null,
      image,
      status: "running",
      createdAt: now.toISOString(),
      ttlSeconds: req.ttlSeconds,
      ttlExpiresAt: ttlExpiresAt.toISOString(),
      resources: { cpus, memoryMb },
      ports,
      usage: null,
      connection: { type: "terminal", url: `/environments/${id}/terminal` },
    };
    (record as EnvironmentRecord & { containerId: string }).containerId = container.id;
    this.environments.set(id, record);
    this.scheduleTtlDestroy(id, req.ttlSeconds);
    return record;
  }

  private async ensureImage(image: string): Promise<void> {
    const images = await this.docker.listImages({ filters: { reference: [image] } });
    if (images.length > 0) return;
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(image, (err: unknown, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (followErr: unknown) => (followErr ? reject(followErr) : resolve()));
      });
    });
  }

  private containerFor(record: EnvironmentRecord): Docker.Container {
    const containerId = (record as EnvironmentRecord & { containerId?: string }).containerId;
    if (!containerId) throw new BoxWizardError("not_found", `Environment ${record.id} has no backing container.`);
    return this.docker.getContainer(containerId);
  }

  async list(): Promise<EnvironmentRecord[]> {
    const records = Array.from(this.environments.values());
    return Promise.all(records.map((r) => this.refresh(r)));
  }

  async get(id: string): Promise<EnvironmentRecord> {
    const record = this.environments.get(id);
    if (!record) throw new BoxWizardError("not_found", `No environment with id ${id}`);
    return this.refresh(record);
  }

  private async refresh(record: EnvironmentRecord): Promise<EnvironmentRecord> {
    if (record.status !== "running") return { ...record, usage: null };
    try {
      record.usage = await this.getUsage(record.id);
    } catch {
      record.usage = null;
    }
    return record;
  }

  async getUsage(id: string): Promise<ResourceUsage> {
    const record = this.environments.get(id);
    if (!record) throw new BoxWizardError("not_found", `No environment with id ${id}`);
    if (record.status !== "running") {
      throw new BoxWizardError("not_found", `Environment ${id} is not running.`);
    }
    const container = this.containerFor(record);
    const stats = await container.stats({ stream: false });
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const onlineCpus = stats.cpu_stats.online_cpus ?? stats.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
    const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? Math.round((cpuDelta / systemDelta) * onlineCpus * 1000) / 10 : 0;
    const memoryUsedMb = Math.round((stats.memory_stats.usage ?? 0) / (1024 * 1024));
    const memoryLimitMb = Math.round((stats.memory_stats.limit ?? record.resources.memoryMb * 1024 * 1024) / (1024 * 1024));
    return { cpuPercent, memoryUsedMb, memoryLimitMb, sampledAt: new Date().toISOString() };
  }

  async exec(id: string, req: ExecRequest): Promise<ExecResult> {
    const record = await this.get(id);
    if (record.status !== "running") {
      throw new BoxWizardError("not_found", `Environment ${id} is not running (status=${record.status}).`);
    }
    const container = this.containerFor(record);
    const exec = await container.exec({
      Cmd: ["/bin/sh", "-c", req.command],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: req.cwd,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      container.modem.demuxStream(stream, { write: (c: Buffer) => stdoutChunks.push(c) }, { write: (c: Buffer) => stderrChunks.push(c) });
      stream.on("end", resolve);
      stream.on("error", reject);
      if (req.timeoutMs) setTimeout(resolve, req.timeoutMs);
    });

    const inspect = await exec.inspect();
    return {
      stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      stderr: Buffer.concat(stderrChunks).toString("utf8"),
      exitCode: inspect.ExitCode ?? 0,
    };
  }

  async attachTerminal(id: string, socket: WebSocket): Promise<void> {
    const record = await this.get(id);
    if (record.status !== "running") {
      socket.close(1011, `Environment ${id} is not running (status=${record.status}).`);
      return;
    }
    const container = this.containerFor(record);
    const shellCmd = ["/bin/sh", "-c", "exec /bin/bash 2>/dev/null || exec /bin/sh"];
    const exec = await container.exec({
      Cmd: shellCmd,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });
    const stream = await exec.start({ hijack: true, stdin: true, Tty: true } as Docker.ExecStartOptions);

    stream.on("data", (chunk: Buffer) => {
      if (socket.readyState === socket.OPEN) socket.send(chunk);
    });
    socket.on("message", (data: Buffer | string) => {
      stream.write(typeof data === "string" ? data : Buffer.from(data));
    });
    const cleanup = () => {
      try {
        stream.destroy();
      } catch {
        // stream may already be closed
      }
    };
    socket.on("close", cleanup);
    stream.on("error", cleanup);
    stream.on("end", () => socket.close());
  }

  async extend(id: string, additionalSeconds: number): Promise<EnvironmentRecord> {
    const record = await this.get(id);
    const newExpiry = new Date(new Date(record.ttlExpiresAt).getTime() + additionalSeconds * 1000);
    const cappedExpiry = new Date(Math.min(newExpiry.getTime(), new Date(record.createdAt).getTime() + MAX_TTL_SECONDS * 1000));
    record.ttlExpiresAt = cappedExpiry.toISOString();
    this.scheduleTtlDestroy(id, Math.max(0, (cappedExpiry.getTime() - Date.now()) / 1000));
    return record;
  }

  async destroy(id: string): Promise<void> {
    const record = await this.get(id);
    record.status = "destroying";
    const timer = this.ttlTimers.get(id);
    if (timer) clearTimeout(timer);
    try {
      const container = this.containerFor(record);
      await container.stop({ t: 3 }).catch(() => undefined);
      await container.remove({ force: true }).catch(() => undefined);
    } finally {
      record.status = "destroyed";
      record.usage = null;
    }
  }

  private scheduleTtlDestroy(id: string, ttlSeconds: number) {
    const existing = this.ttlTimers.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => void this.destroy(id), ttlSeconds * 1000);
    timer.unref();
    this.ttlTimers.set(id, timer);
  }
}
