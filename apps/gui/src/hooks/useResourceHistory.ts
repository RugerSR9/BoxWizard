import { useEffect, useRef, useState } from "react";
import type { EnvironmentRecord } from "../lib/types";

export interface ResourceHistoryPoint {
  t: number;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
}

export type ResourceHistoryMap = Map<string, ResourceHistoryPoint[]>;

/**
 * The backend only exposes a live usage *snapshot* per environment (see
 * ResourceUsage in packages/mcp-server/src/types.ts) - there's no
 * server-side history endpoint yet. To power the sparkline/graph dashboards
 * without backend changes, this buffers each polled sample into a capped
 * in-memory ring buffer per environment id. History resets on app restart
 * and only covers the current session, which is an accepted trade-off for
 * now (see plan notes) - a future backend history endpoint can swap in here
 * without changing any chart component.
 */
export function useResourceHistory(environments: EnvironmentRecord[], maxPoints = 150): ResourceHistoryMap {
  const historyRef = useRef<ResourceHistoryMap>(new Map());
  const [, setVersion] = useState(0);

  useEffect(() => {
    let changed = false;
    const liveIds = new Set<string>();

    for (const env of environments) {
      liveIds.add(env.id);
      if (!env.usage) continue;

      const existing = historyRef.current.get(env.id) ?? [];
      const last = existing[existing.length - 1];
      const sampledAtMs = Date.parse(env.usage.sampledAt) || Date.now();
      if (last && last.t === sampledAtMs) continue;

      const next = existing.concat({
        t: sampledAtMs,
        cpuPercent: env.usage.cpuPercent,
        memoryUsedMb: env.usage.memoryUsedMb,
        memoryLimitMb: env.usage.memoryLimitMb,
      });
      if (next.length > maxPoints) next.splice(0, next.length - maxPoints);
      historyRef.current.set(env.id, next);
      changed = true;
    }

    for (const id of Array.from(historyRef.current.keys())) {
      if (!liveIds.has(id)) {
        historyRef.current.delete(id);
        changed = true;
      }
    }

    if (changed) setVersion((v) => v + 1);
  }, [environments, maxPoints]);

  return historyRef.current;
}
