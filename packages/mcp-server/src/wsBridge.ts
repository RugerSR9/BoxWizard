import net from "node:net";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { RuntimeAdapter } from "./runtimeAdapter.js";

/**
 * Bridges the two "communicate with a running environment from a browser
 * tab" paths onto raw WebSocket upgrades:
 *   - /environments/:id/terminal  -> interactive shell (containers), backed
 *     by RuntimeAdapter#attachTerminal. Consumed by public/terminal.html.
 *   - /vnc-proxy/:id               -> raw TCP<->WebSocket proxy to the VM's
 *     VNC server, backed by RuntimeAdapter#getVncTarget. Consumed by
 *     public/vnc.html (noVNC).
 */
export function registerWsBridge(server: import("node:http").Server, adapter: RuntimeAdapter): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const terminalMatch = url.pathname.match(/^\/environments\/([^/]+)\/terminal$/);
    const vncMatch = url.pathname.match(/^\/vnc-proxy\/([^/]+)$/);

    if (terminalMatch) {
      wss.handleUpgrade(req, socket, head, (ws) => handleTerminal(adapter, terminalMatch[1], ws));
    } else if (vncMatch) {
      wss.handleUpgrade(req, socket, head, (ws) => handleVnc(adapter, vncMatch[1], ws));
    } else {
      socket.destroy();
    }
  });
}

async function handleTerminal(adapter: RuntimeAdapter, id: string, ws: WebSocket): Promise<void> {
  if (!adapter.attachTerminal) {
    ws.close(1011, "This runtime does not support interactive terminals.");
    return;
  }
  try {
    await adapter.attachTerminal(id, ws);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ws.close(1011, message.slice(0, 120));
  }
}

async function handleVnc(adapter: RuntimeAdapter, id: string, ws: WebSocket): Promise<void> {
  if (!adapter.getVncTarget) {
    ws.close(1011, "This runtime does not support a VNC console.");
    return;
  }
  let target: { host: string; port: number };
  try {
    target = await adapter.getVncTarget(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ws.close(1011, message.slice(0, 120));
    return;
  }

  const tcp = net.connect({ host: target.host, port: target.port });
  ws.binaryType = "nodebuffer";

  tcp.on("connect", () => {
    tcp.on("data", (chunk) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk);
    });
  });
  tcp.on("error", (err) => ws.close(1011, `VNC connection error: ${err.message}`.slice(0, 120)));
  tcp.on("close", () => ws.close());

  ws.on("message", (data) => {
    if (Array.isArray(data)) {
      for (const chunk of data) tcp.write(chunk as Buffer);
    } else {
      tcp.write(data as Buffer);
    }
  });
  ws.on("close", () => tcp.end());
  ws.on("error", () => tcp.destroy());
}
