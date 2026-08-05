import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { BoxWizardError, RUNTIMES_BY_KIND, type CreateEnvironmentRequest, type ExecRequest } from "./types.js";
import type { RuntimeAdapter } from "./runtimeAdapter.js";
import { BUILTIN_TEMPLATES } from "./templates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TERMINAL_PAGE = path.join(__dirname, "../public/terminal.html");

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export function buildRestApi(adapter: RuntimeAdapter): Express {
  const app = express();
  // GUI is a Tauri webview (http://localhost:1420 in dev, a tauri:// origin in
  // production builds) calling across origins to this REST API - allow it.
  // No auth/allowlist needed since this API is localhost-only (see
  // docs/mcp-api-design.md).
  app.use(cors());
  app.use(express.json());

  app.get("/templates", (_req, res) => {
    res.json({ templates: BUILTIN_TEMPLATES });
  });

  app.get("/runtimes", (_req, res) => {
    res.json(RUNTIMES_BY_KIND);
  });

  app.post(
    "/environments",
    asyncHandler(async (req, res) => {
      const body = req.body as CreateEnvironmentRequest;
      const record = await adapter.create(body);
      res.status(201).json(record);
    }),
  );

  app.get(
    "/environments",
    asyncHandler(async (_req, res) => {
      const records = await adapter.list();
      res.json({ environments: records });
    }),
  );

  app.get(
    "/environments/:id",
    asyncHandler(async (req, res) => {
      const record = await adapter.get(req.params.id);
      res.json(record);
    }),
  );

  app.get(
    "/environments/:id/stats",
    asyncHandler(async (req, res) => {
      const usage = await adapter.getUsage(req.params.id);
      res.json(usage);
    }),
  );

  // Browser-facing page for `connection.url` on container environments
  // (dockerRuntimeAdapter.ts). This path doubles as the WebSocket upgrade
  // target handled in wsBridge.ts - Node only routes Upgrade-header requests
  // there, so a plain GET (page navigation) lands here instead and gets the
  // same xterm.js UI that /terminal.html serves.
  app.get("/environments/:id/terminal", (_req, res) => {
    res.sendFile(TERMINAL_PAGE);
  });

  app.post(
    "/environments/:id/exec",
    asyncHandler(async (req, res) => {
      const body = req.body as ExecRequest;
      const result = await adapter.exec(req.params.id, body);
      res.json(result);
    }),
  );

  app.post(
    "/environments/:id/extend",
    asyncHandler(async (req, res) => {
      const { additionalSeconds } = req.body as { additionalSeconds: number };
      const record = await adapter.extend(req.params.id, additionalSeconds);
      res.json(record);
    }),
  );

  app.delete(
    "/environments/:id",
    asyncHandler(async (req, res) => {
      await adapter.destroy(req.params.id);
      res.status(204).send();
    }),
  );

  // Reserved, not implemented at MVP - see docs/mcp-api-design.md.
  app.get("/environments/:id/screenshot", (_req, res) => {
    res.status(501).json({ error: { code: "not_supported_for_kind", message: "VM screenshot is post-MVP." } });
  });
  app.post("/environments/:id/input", (_req, res) => {
    res.status(501).json({ error: { code: "not_supported_for_kind", message: "VM input injection is post-MVP." } });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BoxWizardError) {
      const statusByCode: Record<string, number> = {
        not_found: 404,
        invalid_template: 400,
        invalid_runtime: 400,
        ttl_exceeded_max: 400,
        not_supported_for_kind: 400,
        runtime_unavailable: 503,
      };
      res.status(statusByCode[err.code] ?? 500).json({ error: { code: err.code, message: err.message } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: "internal_error", message: "Unexpected error." } });
  });

  return app;
}
