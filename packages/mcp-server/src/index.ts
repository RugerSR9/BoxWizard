import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildRestApi } from "./restApi.js";
import { buildMcpServer } from "./mcpServer.js";
import { MockRuntimeAdapter } from "./runtimeAdapter.js";

const REST_PORT = Number(process.env.BOXWIZARD_REST_PORT ?? 4180);

async function main() {
  // TODO: swap MockRuntimeAdapter for the real container/VM backends described
  // in docs/runtime-container-prototype.md and docs/runtime-vm-prototype.md.
  const adapter = new MockRuntimeAdapter();

  const restApp = buildRestApi(adapter);
  restApp.listen(REST_PORT, () => {
    console.error(`[boxwizard] REST API listening on http://localhost:${REST_PORT}`);
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
