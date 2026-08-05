import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, apiFetch } from "../lib/apiClient";
import type { EnvironmentRecord } from "../lib/types";

export type ApiStatus = "checking" | "online" | "offline";

const POLL_INTERVAL_MS = 2000;

interface UseEnvironmentsOptions {
  /** Called for real (non-network) failures - e.g. to surface a toast. */
  onError?: (message: string) => void;
}

/**
 * Polls GET /environments so the dashboard/table feel "live". Also derives
 * the local-service connectivity status (checking/online/offline) other
 * parts of the UI (top bar, launch buttons) depend on.
 */
export function useEnvironments(options: UseEnvironmentsOptions = {}) {
  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([]);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/environments`);
      const json = await res.json();
      setEnvironments(json.environments);
      setApiStatus("online");
    } catch (err) {
      setApiStatus("offline");
      if (err instanceof TypeError) {
        // Network-level failure (service not running) - the status badge
        // already communicates this, no need to also toast it.
        return;
      }
      onErrorRef.current?.(err instanceof Error ? err.message : "Failed to load environments.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { environments, apiStatus, refresh };
}
