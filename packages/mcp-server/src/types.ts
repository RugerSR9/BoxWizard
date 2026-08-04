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
