/**
 * Thin wrapper around fetch() for the BoxWizard local REST API. All endpoints
 * return errors in a consistent shape on failure (see
 * docs/mcp-api-design.md#error-model):
 *
 *   { "error": { "code": "not_found | invalid_template | ...", "message": "human-readable" } }
 *
 * apiFetch() parses that shape and throws a plain Error with the human
 * readable message so callers can just `await apiFetch(...)` and rely on a
 * single try/catch to surface failures (e.g. as a toast) instead of checking
 * res.ok everywhere.
 */

export const API_BASE = "http://localhost:4180";

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const message = body?.error?.message;
    const code = body?.error?.code;
    if (typeof message === "string" && message.length > 0) return message;
    if (typeof code === "string" && code.length > 0) return code;
  } catch {
    // Body wasn't JSON (or was empty) - fall through to the generic message.
  }
  return `Request failed (${res.status})`;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res));
  }
  return res;
}
