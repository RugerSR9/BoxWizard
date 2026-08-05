import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { BoxWizardError, type CreateTemplateRequest, type EnvironmentTemplate } from "./types.js";
import { checkDockerHubImage } from "./dockerHub.js";

/**
 * Built-in template catalog, matching docs/mvp-features.md. All container
 * images are official "library/*" images on Docker Hub (https://hub.docker.com/_/<name>),
 * i.e. exactly the kind of reference a user can also type into "Add template"
 * (see addCustomTemplate below) - built-ins are just a curated head start.
 * VM templates have no `image` because they boot from a managed Hyper-V base
 * VHD rather than an OCI image - see docs/runtime-vm-prototype.md.
 */
export const BUILTIN_TEMPLATES: EnvironmentTemplate[] = [
  {
    id: "python-3.12",
    kind: "container",
    label: "Python 3.12 (headless)",
    image: "docker.io/library/python:3.12-slim",
    defaultResources: { cpus: 1, memoryMb: 1024 },
    defaultTtlSeconds: 3600,
    origin: "builtin",
  },
  {
    id: "node-22",
    kind: "container",
    label: "Node.js 22 (headless)",
    image: "docker.io/library/node:22-slim",
    defaultResources: { cpus: 1, memoryMb: 1024 },
    defaultTtlSeconds: 3600,
    origin: "builtin",
  },
  {
    id: "ubuntu-dev",
    kind: "container",
    label: "Ubuntu 24.04 (dev tools, headless)",
    image: "docker.io/library/ubuntu:24.04",
    defaultResources: { cpus: 2, memoryMb: 2048 },
    defaultTtlSeconds: 3600,
    origin: "builtin",
  },
  {
    id: "golang-1.23",
    kind: "container",
    label: "Go 1.23 (headless)",
    image: "docker.io/library/golang:1.23",
    defaultResources: { cpus: 1, memoryMb: 1024 },
    defaultTtlSeconds: 3600,
    origin: "builtin",
  },
  {
    id: "postgres-16",
    kind: "container",
    label: "PostgreSQL 16",
    image: "docker.io/library/postgres:16",
    defaultResources: { cpus: 1, memoryMb: 1024 },
    defaultTtlSeconds: 3600,
    origin: "builtin",
  },
  {
    id: "redis-7",
    kind: "container",
    label: "Redis 7",
    image: "docker.io/library/redis:7",
    defaultResources: { cpus: 1, memoryMb: 512 },
    defaultTtlSeconds: 3600,
    origin: "builtin",
  },
  {
    id: "mysql-8",
    kind: "container",
    label: "MySQL 8",
    image: "docker.io/library/mysql:8",
    defaultResources: { cpus: 1, memoryMb: 1024 },
    defaultTtlSeconds: 3600,
    origin: "builtin",
  },
  {
    id: "mongo-7",
    kind: "container",
    label: "MongoDB 7",
    image: "docker.io/library/mongo:7",
    defaultResources: { cpus: 1, memoryMb: 1024 },
    defaultTtlSeconds: 3600,
    origin: "builtin",
  },
  {
    id: "nginx-alpine",
    kind: "container",
    label: "Nginx (alpine)",
    image: "docker.io/library/nginx:alpine",
    defaultResources: { cpus: 1, memoryMb: 256 },
    defaultTtlSeconds: 3600,
    origin: "builtin",
  },
  {
    id: "windows-gui",
    kind: "vm",
    label: "Windows GUI test box",
    image: null,
    defaultResources: { cpus: 2, memoryMb: 4096 },
    defaultTtlSeconds: 1800,
    origin: "builtin",
  },
  {
    id: "ubuntu-desktop-gui",
    kind: "vm",
    label: "Ubuntu Desktop test box",
    image: null,
    defaultResources: { cpus: 2, memoryMb: 3072 },
    defaultTtlSeconds: 1800,
    origin: "builtin",
  },
];

/**
 * User/agent-added templates, e.g. "grab this image off Docker Hub and save
 * it as a reusable template" - persisted as JSON under the user's home
 * directory so they survive app restarts and upgrades without touching app
 * code, matching the storage model docs/mvp-features.md describes.
 */
function customTemplatesPath(): string {
  const dir = process.env.BOXWIZARD_CONFIG_DIR ?? path.join(homedir(), ".boxwizard");
  return path.join(dir, "custom-templates.json");
}

let customTemplates: EnvironmentTemplate[] = loadCustomTemplates();

function loadCustomTemplates(): EnvironmentTemplate[] {
  try {
    const raw = readFileSync(customTemplatesPath(), "utf-8");
    const parsed = JSON.parse(raw) as EnvironmentTemplate[];
    return Array.isArray(parsed) ? parsed.map((t) => ({ ...t, origin: "custom" as const })) : [];
  } catch {
    return [];
  }
}

function persistCustomTemplates(): void {
  const file = customTemplatesPath();
  if (!existsSync(path.dirname(file))) mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(customTemplates, null, 2), "utf-8");
}

/** Full catalog: built-ins first, then whatever the user/agent has added. */
export function listTemplates(): EnvironmentTemplate[] {
  return [...BUILTIN_TEMPLATES, ...customTemplates];
}

export function findTemplate(id: string): EnvironmentTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? customTemplates.find((t) => t.id === id);
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Adds a user/agent-defined template pointing at an arbitrary OCI image -
 * the "Docker Hub, but bring your own image" flow. Verifies the image
 * actually exists on Docker Hub first (best-effort; skipped for other
 * registries or if Docker Hub is unreachable) so a typo doesn't silently
 * become a template that fails every time someone launches it.
 */
export async function addCustomTemplate(req: CreateTemplateRequest): Promise<EnvironmentTemplate> {
  const label = req.label?.trim();
  const image = req.image?.trim();
  if (!label) throw new BoxWizardError("invalid_template", "label is required.");
  if (!image) throw new BoxWizardError("invalid_template", "image is required.");

  if (!req.skipRegistryCheck) {
    const check = await checkDockerHubImage(image);
    if (!check.ok) {
      throw new BoxWizardError("invalid_template", check.reason ?? `Could not verify image "${image}" on Docker Hub.`);
    }
  }

  const baseId = `custom-${slugify(label) || "template"}`;
  let id = baseId;
  let suffix = 1;
  while (findTemplate(id)) {
    id = `${baseId}-${++suffix}`;
  }

  const template: EnvironmentTemplate = {
    id,
    kind: "container",
    label,
    image,
    defaultResources: { cpus: req.defaultResources?.cpus ?? 1, memoryMb: req.defaultResources?.memoryMb ?? 1024 },
    defaultTtlSeconds: req.defaultTtlSeconds ?? 3600,
    origin: "custom",
    startupCommand: req.startupCommand ?? null,
  };

  customTemplates = [...customTemplates, template];
  persistCustomTemplates();
  return template;
}

export function removeCustomTemplate(id: string): void {
  const tpl = findTemplate(id);
  if (!tpl) throw new BoxWizardError("not_found", `No template with id ${id}`);
  if (tpl.origin === "builtin") throw new BoxWizardError("invalid_template", `Template ${id} is built-in and cannot be removed.`);
  customTemplates = customTemplates.filter((t) => t.id !== id);
  persistCustomTemplates();
}
