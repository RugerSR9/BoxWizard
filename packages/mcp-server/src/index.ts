import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildRestApi } from "./restApi.js";
import { buildMcpServer } from "./mcpServer.js";
import { MockRuntimeAdapter, type RuntimeAdapter } from "./runtimeAdapter.js";
import { DockerRuntimeAdapter } from "./dockerRuntimeAdapter.js";
import { HyperVRuntimeAdapter } from "./hyperVRuntimeAdapter.js";
import { CompositeRuntimeAdapter } from "./compositeRuntimeAdapter.js";
import { registerWsBridge } from "./wsBridge.js";

const REST_PORT = Number(process.env.BOXWIZARD_REST_PORT ?? 4180);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * BOXWIZARD_RUNTIME_MODE=mock keeps the old in-memory simulation (useful for
 * GUI/MCP development without Docker/Hyper-V installed). Default is "real",
 * which wires containers to Docker/Podman and VMs to Hyper-V - see
 * dockerRuntimeAdapter.ts / hyperVRuntimeAdapter.ts for prerequisites.
 */
function buildAdapter(): RuntimeAdapter {
  const mode = process.env.BOXWIZARD_RUNTIME_MODE ?? "real";
  if (mode === "mock") return new MockRuntimeAdapter();
  return new CompositeRuntimeAdapter(new DockerRuntimeAdapter(), new HyperVRuntimeAdapter());
}

async function main() {
  const adapter = buildAdapter();

  const restApp = buildRestApi(adapter);
  // Serves terminal.html / vnc.html - the browser-tab "communicate with this
  // environment" links the GUI opens via window.open().
  restApp.use(express.static(path.join(__dirname, "../public")));

  const server = http.createServer(restApp);
  registerWsBridge(server, adapter);

  server.listen(REST_PORT, () => {
    console.error(`[boxwizard] REST API + WS bridge listening on http://localhost:${REST_PORT}`);
  });

  const mcpServer = buildMcpServer(adapter);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("[boxwizard] MCP server connected on stdio");
}

main().catch((err) => {
  console.error("[boxwizard] fatal error", err);
  process.exit(1);
});
