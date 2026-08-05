import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BoxWizardError, RUNTIMES_BY_KIND } from "./types.js";
import type { RuntimeAdapter } from "./runtimeAdapter.js";
import { addCustomTemplate, listTemplates, removeCustomTemplate } from "./templates.js";

function toToolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toErrorResult(err: unknown) {
  if (err instanceof BoxWizardError) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: { code: err.code, message: err.message } }) }],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code: "internal_error", message } }) }] };
}

/**
 * Builds the BoxWizard MCP server. Every tool here is a thin wrapper over the
 * same RuntimeAdapter the REST API (restApi.ts) uses, so the GUI path and the
 * agent path share one implementation - see docs/mcp-api-design.md.
 */
export function buildMcpServer(adapter: RuntimeAdapter): McpServer {
  const server = new McpServer({ name: "boxwizard", version: "0.0.1" });

  server.registerTool(
    "list_templates",
    {
      title: "List environment templates",
      description: "List built-in and user-defined ephemeral environment templates (containers and VMs).",
      inputSchema: {},
    },
    async () => toToolResult({ templates: listTemplates() }),
  );

  server.registerTool(
    "add_template",
    {
      title: "Add a custom environment template",
      description:
        "Save an arbitrary container image reference (e.g. from Docker Hub, like `postgres:16` or `someuser/repo:tag`) " +
        "as a reusable template, so future create_environment calls can reference it by id instead of repeating the " +
        "image and default resources/TTL. The image is verified against Docker Hub before saving unless it points at " +
        "another registry or skipRegistryCheck is set.",
      inputSchema: {
        label: z.string(),
        image: z.string(),
        defaultResources: z.object({ cpus: z.number().positive().optional(), memoryMb: z.number().positive().optional() }).optional(),
        defaultTtlSeconds: z.number().int().positive().optional(),
        startupCommand: z.string().nullable().optional(),
        skipRegistryCheck: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        return toToolResult(await addCustomTemplate(args));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  server.registerTool(
    "remove_template",
    {
      title: "Remove a custom environment template",
      description: "Delete a previously added custom template by id. Built-in templates cannot be removed.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        removeCustomTemplate(id);
        return toToolResult({ id, removed: true });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  server.registerTool(
    "create_environment",
    {
      title: "Create ephemeral environment",
      description:
        "Create a short-lived, disposable container or VM sandbox from a template or raw OCI image. " +
        "Every environment has a mandatory TTL after which it is force-destroyed. Use list_runtimes to " +
        "see which `runtime` values are valid for a given `kind`.",
      inputSchema: {
        kind: z.enum(["container", "vm"]),
        runtime: z.enum(["docker", "hyperv", "mock"]).optional(),
        template: z.string().nullable().optional(),
        image: z.string().nullable().optional(),
        ttlSeconds: z.number().int().positive().default(3600),
        resources: z.object({ cpus: z.number().positive().optional(), memoryMb: z.number().positive().optional() }).optional(),
        ports: z.array(z.object({ containerPort: z.number(), hostPort: z.number() })).optional(),
        startupCommand: z.string().nullable().optional(),
      },
    },
    async (args) => {
      try {
        const record = await adapter.create({
          kind: args.kind,
          runtime: args.runtime,
          template: args.template ?? null,
          image: args.image ?? null,
          ttlSeconds: args.ttlSeconds,
          resources: args.resources,
          ports: args.ports,
          startupCommand: args.startupCommand ?? null,
        });
        return toToolResult(record);
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  server.registerTool(
    "list_runtimes",
    {
      title: "List available runtimes",
      description: "List which backend engines (runtime values) are valid for each environment kind (container/vm).",
      inputSchema: {},
    },
    async () => toToolResult(RUNTIMES_BY_KIND),
  );

  server.registerTool(
    "list_environments",
    {
      title: "List environments",
      description: "List all environments (running, provisioning, and recently destroyed) with TTL and status.",
      inputSchema: {},
    },
    async () => {
      const records = await adapter.list();
      return toToolResult({ environments: records });
    },
  );

  server.registerTool(
    "get_environment",
    {
      title: "Get environment detail",
      description: "Get full detail for one environment by id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        return toToolResult(await adapter.get(id));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  server.registerTool(
    "exec_command",
    {
      title: "Execute a command in a container environment",
      description: "Run a shell command inside a running container environment and return stdout/stderr/exit code.",
      inputSchema: { id: z.string(), command: z.string(), cwd: z.string().optional(), timeoutMs: z.number().optional() },
    },
    async ({ id, command, cwd, timeoutMs }) => {
      try {
        return toToolResult(await adapter.exec(id, { command, cwd, timeoutMs }));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  server.registerTool(
    "extend_environment",
    {
      title: "Extend environment TTL",
      description: "Push out an environment's auto-destroy deadline, capped by the server-enforced maximum lifetime.",
      inputSchema: { id: z.string(), additionalSeconds: z.number().int().positive() },
    },
    async ({ id, additionalSeconds }) => {
      try {
        return toToolResult(await adapter.extend(id, additionalSeconds));
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  server.registerTool(
    "destroy_environment",
    {
      title: "Destroy environment",
      description: "Immediately tear down an environment regardless of remaining TTL.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        await adapter.destroy(id);
        return toToolResult({ id, status: "destroying" });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );

  return server;
}
