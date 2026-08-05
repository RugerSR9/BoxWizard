export type EnvironmentKind = "container" | "vm";

/** Which backend engine actually owns an environment. */
export type EnvironmentRuntime = "docker" | "hyperv" | "mock";

/**
 * Which runtimes are valid for a given kind. "mock" is always available for
 * both kinds (in-memory simulation, no daemon/hypervisor required) alongside
 * the one real engine per kind. First entry is the default when a caller
 * omits `runtime`.
 */
export const RUNTIMES_BY_KIND: Record<EnvironmentKind, EnvironmentRuntime[]> = {
  container: ["docker", "mock"],
  vm: ["hyperv", "mock"],
};

export type EnvironmentStatus =
  | "provisioning"
  | "running"
  | "destroying"
  | "destroyed"
  | "failed";

export interface ResourceLimits {
  cpus: number;
  memoryMb: number;
}

export interface PortMapping {
  containerPort: number;
  hostPort: number;
}

export interface CreateEnvironmentRequest {
  kind: EnvironmentKind;
  /** Backend engine to launch on; defaults to RUNTIMES_BY_KIND[kind][0] if omitted. */
  runtime?: EnvironmentRuntime;
  template?: string | null;
  image?: string | null;
  ttlSeconds: number;
  resources?: Partial<ResourceLimits>;
  ports?: PortMapping[];
  startupCommand?: string | null;
}

/** Live CPU/memory sample for a running environment. */
export interface ResourceUsage {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  sampledAt: string;
}

/**
 * How a human (or a browser tab) can reach into a running environment.
 *  - "terminal": an interactive shell reachable over a WebSocket exec bridge
 *    (containers only) - see wsBridge.ts + public/terminal.html.
 *  - "vnc": a graphical console reachable over a WebSocket->TCP VNC proxy
 *    (VMs only) - see wsBridge.ts + public/vnc.html. Requires the guest to be
 *    running a VNC server on `port`; see docs/runtime-vm-prototype.md.
 */
export type ConnectionInfo =
  | { type: "terminal"; url: string }
  | { type: "vnc"; url: string; host: string | null; port: number };

export interface EnvironmentRecord {
  id: string;
  kind: EnvironmentKind;
  /** Backend engine that actually owns this environment. */
  runtime: EnvironmentRuntime;
  template: string | null;
  image: string | null;
  status: EnvironmentStatus;
  createdAt: string;
  ttlSeconds: number;
  ttlExpiresAt: string;
  resources: ResourceLimits;
  ports: PortMapping[];
  /** Live CPU/memory sample, refreshed on every list()/get() call while running. */
  usage: ResourceUsage | null;
  /** How to reach this environment from a browser tab, if applicable. */
  connection: ConnectionInfo | null;
}

export interface ExecRequest {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type BoxWizardErrorCode =
  | "ttl_exceeded_max"
  | "not_found"
  | "runtime_unavailable"
  | "invalid_template"
  | "invalid_runtime"
  | "not_supported_for_kind";

export class BoxWizardError extends Error {
  code: BoxWizardErrorCode;

  constructor(code: BoxWizardErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "BoxWizardError";
  }
}

export interface EnvironmentTemplate {
  id: string;
  kind: EnvironmentKind;
  label: string;
  image: string | null;
  defaultResources: ResourceLimits;
  defaultTtlSeconds: number;
  /** "builtin" ships with the app and can't be edited/removed; "custom" was added by a user/agent. */
  origin: "builtin" | "custom";
  /** Optional shell command to run at container startup, for custom templates that need one. */
  startupCommand?: string | null;
}

/**
 * Body for POST /templates. Only `kind: "container"` is supported today since
 * custom VM templates would need a base VHD, not just an image reference -
 * see docs/runtime-vm-prototype.md.
 */
export interface CreateTemplateRequest {
  label: string;
  image: string;
  defaultResources?: Partial<ResourceLimits>;
  defaultTtlSeconds?: number;
  startupCommand?: string | null;
  /** Skip the live Docker Hub existence check (e.g. for private/self-hosted registries). */
  skipRegistryCheck?: boolean;
}
