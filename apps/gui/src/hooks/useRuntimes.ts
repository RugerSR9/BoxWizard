import { useEffect, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../lib/apiClient";
import type { RuntimesByKind } from "../lib/types";

const EMPTY: RuntimesByKind = { container: [], vm: [] };
const RETRY_DELAY_MS = 2000;

/**
 * Fetches once (runtimes are effectively static) but retries on failure -
 * the GUI can load before the local service has finished starting, and a
 * one-shot fetch that fails at mount would otherwise leave this stuck empty
 * forever, breaking the runtime picker even after the service comes online.
 */
export function useRuntimes() {
  const [runtimesByKind, setRuntimesByKind] = useState<RuntimesByKind>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function attempt() {
      apiFetch(`${API_BASE}/runtimes`)
        .then((res) => res.json())
        .then((json: RuntimesByKind) => {
          if (cancelled) return;
          setRuntimesByKind(json);
          setError(null);
          loadedRef.current = true;
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to load runtimes.");
          if (!loadedRef.current) retryTimer = setTimeout(attempt, RETRY_DELAY_MS);
        });
    }

    attempt();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return { runtimesByKind, error };
}
