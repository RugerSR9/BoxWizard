export type EnvironmentKind = "container" | "vm";

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
}
