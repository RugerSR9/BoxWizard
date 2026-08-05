import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../lib/apiClient";
import type { CreateTemplateInput, DockerHubSearchResult, EnvironmentTemplate } from "../lib/types";

const RETRY_DELAY_MS = 2000;

/**
 * Templates are mostly-static (built-ins never change, custom ones only
 * change when the user explicitly adds/removes one) so unlike environments
 * this doesn't poll on a fixed interval - it fetches on mount and again
 * after any add/remove. It DOES need to retry on failure though: the GUI
 * can load before the local service (packages/mcp-server) has finished
 * starting, and a fetch that fails once here would otherwise leave the
 * Templates page permanently empty even after the service comes online.
 */
export function useTemplates() {
  const [templates, setTemplates] = useState<EnvironmentTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/templates`);
      const json = await res.json();
      setTemplates(json.templates);
      setError(null);
      loadedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates.");
      throw err;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function attempt() {
      refresh().catch(() => {
        if (!cancelled && !loadedRef.current) retryTimer = setTimeout(attempt, RETRY_DELAY_MS);
      });
    }

    attempt();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [refresh]);

  const addTemplate = useCallback(
    async (input: CreateTemplateInput) => {
      const res = await apiFetch(`${API_BASE}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const template = (await res.json()) as EnvironmentTemplate;
      await refresh();
      return template;
    },
    [refresh],
  );

  const removeTemplate = useCallback(
    async (id: string) => {
      await apiFetch(`${API_BASE}/templates/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { templates, error, refresh, addTemplate, removeTemplate };
}

/** Backs the "search Docker Hub" box in the Add Template dialog. */
export async function searchDockerHubImages(query: string): Promise<DockerHubSearchResult[]> {
  if (!query.trim()) return [];
  const res = await apiFetch(`${API_BASE}/templates/dockerhub-search?q=${encodeURIComponent(query)}`);
  const json = await res.json();
  return json.results ?? [];
}
