/**
 * Shared frontend types mirroring packages/mcp-server/src/types.ts. Kept in
 * one place (rather than duplicated/slimmed inline in components) so every
 * page/hook agrees on the shape of data coming back from the REST API.
 */

export type EnvironmentKind = "container" | "vm";

export type EnvironmentRuntime = "docker" | "hyperv" | "mock";

export const RUNTIMES_BY_KIND_DEFAULT: Record<EnvironmentKind, EnvironmentRuntime[]> = {
  container: ["docker", "mock"],
  vm: ["hyperv", "mock"],
};

export type RuntimesByKind = Record<EnvironmentKind, EnvironmentRuntime[]>;

export type EnvironmentStatus = "provisioning" | "running" | "destroying" | "destroyed" | "failed";

export interface ResourceLimits {
  cpus: number;
  memoryMb: number;
}

export interface PortMapping {
  containerPort: number;
  hostPort: number;
}

/** Live CPU/memory sample for a running environment. */
export interface ResourceUsage {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  sampledAt: string;
}

export type ConnectionInfo =
  | { type: "terminal"; url: string }
  | { type: "vnc"; url: string; host: string | null; port: number };

export interface EnvironmentRecord {
  id: string;
  kind: EnvironmentKind;
  runtime: EnvironmentRuntime;
  template: string | null;
  image: string | null;
  status: EnvironmentStatus;
  createdAt: string;
  ttlSeconds: number;
  ttlExpiresAt: string;
  resources: ResourceLimits;
  ports: PortMapping[];
  usage: ResourceUsage | null;
  connection: ConnectionInfo | null;
}

export interface EnvironmentTemplate {
  id: string;
  kind: EnvironmentKind;
  label: string;
  image: string | null;
  defaultResources: ResourceLimits;
  defaultTtlSeconds: number;
  origin: "builtin" | "custom";
  startupCommand?: string | null;
}

export interface CreateTemplateInput {
  label: string;
  image: string;
  defaultResources?: Partial<ResourceLimits>;
  defaultTtlSeconds?: number;
  startupCommand?: string | null;
  skipRegistryCheck?: boolean;
}

export interface DockerHubSearchResult {
  name: string;
  namespace: string;
  description: string;
  starCount: number;
  isOfficial: boolean;
}

export function connectionLabel(connection: ConnectionInfo): string {
  return connection.type === "terminal" ? "Open Terminal" : "Open Console";
}

export function connectionDisabledReason(connection: ConnectionInfo): string | null {
  if (connection.type === "vnc" && !connection.host) {
    return "VM console not reachable yet (guest network address still resolving).";
  }
  return null;
}
