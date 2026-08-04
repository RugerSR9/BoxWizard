import type { EnvironmentTemplate } from "./types.js";

/**
 * Built-in template catalog, matching docs/mvp-features.md.
 * In production this would be a JSON file the user/enterprise can extend
 * without touching app code.
 */
export const BUILTIN_TEMPLATES: EnvironmentTemplate[] = [
  {
    id: "python-3.12",
    kind: "container",
    label: "Python 3.12 (headless)",
    image: "docker.io/library/python:3.12-slim",
    defaultResources: { cpus: 1, memoryMb: 1024 },
    defaultTtlSeconds: 3600,
  },
  {
    id: "node-22",
    kind: "container",
    label: "Node.js 22 (headless)",
    image: "docker.io/library/node:22-slim",
    defaultResources: { cpus: 1, memoryMb: 1024 },
    defaultTtlSeconds: 3600,
  },
  {
    id: "ubuntu-dev",
    kind: "container",
    label: "Ubuntu 24.04 (dev tools, headless)",
    image: "docker.io/library/ubuntu:24.04",
    defaultResources: { cpus: 2, memoryMb: 2048 },
    defaultTtlSeconds: 3600,
  },
  {
    id: "windows-gui",
    kind: "vm",
    label: "Windows GUI test box",
    image: null,
    defaultResources: { cpus: 2, memoryMb: 4096 },
    defaultTtlSeconds: 1800,
  },
  {
    id: "ubuntu-desktop-gui",
    kind: "vm",
    label: "Ubuntu Desktop test box",
    image: null,
    defaultResources: { cpus: 2, memoryMb: 3072 },
    defaultTtlSeconds: 1800,
  },
];

export function findTemplate(id: string): EnvironmentTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
