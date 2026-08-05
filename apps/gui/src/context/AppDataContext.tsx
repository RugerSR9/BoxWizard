import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useEnvironments, type ApiStatus } from "../hooks/useEnvironments";
import { useTemplates } from "../hooks/useTemplates";
import { useRuntimes } from "../hooks/useRuntimes";
import { useResourceHistory, type ResourceHistoryMap } from "../hooks/useResourceHistory";
import { useToasts, type ToastItem } from "../components/Toast";
import { API_BASE, apiFetch } from "../lib/apiClient";
import type { ConnectionInfo, CreateTemplateInput, EnvironmentRecord, EnvironmentTemplate, RuntimesByKind } from "../lib/types";

interface AppDataContextValue {
  environments: EnvironmentRecord[];
  apiStatus: ApiStatus;
  refreshEnvironments: () => Promise<void>;
  templates: EnvironmentTemplate[];
  addTemplate: (input: CreateTemplateInput) => Promise<EnvironmentTemplate>;
  removeTemplate: (id: string) => Promise<void>;
  runtimesByKind: RuntimesByKind;
  history: ResourceHistoryMap;
  toasts: ToastItem[];
  pushError: (message: string) => void;
  pushSuccess: (message: string) => void;
  pushInfo: (message: string) => void;
  dismissToast: (id: string) => void;
  launchingTemplateId: string | null;
  launchEnvironment: (template: EnvironmentTemplate, runtime: string) => Promise<void>;
  destroyEnvironment: (id: string) => Promise<void>;
  openConnection: (connection: ConnectionInfo) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

/**
 * Single source of truth for API-backed state (environments/templates/
 * runtimes/history/toasts), shared across every page via context so each
 * page doesn't re-poll independently. New pages just call `useAppData()`.
 */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const { toasts, pushError, pushSuccess, pushInfo, dismiss } = useToasts();
  const { environments, apiStatus, refresh } = useEnvironments({ onError: pushError });
  const { templates, addTemplate: addTemplateRaw, removeTemplate: removeTemplateRaw } = useTemplates();
  const { runtimesByKind } = useRuntimes();
  const history = useResourceHistory(environments);
  const [launchingTemplateId, setLaunchingTemplateId] = useState<string | null>(null);

  const launchEnvironment = useCallback(
    async (template: EnvironmentTemplate, runtime: string) => {
      setLaunchingTemplateId(template.id);
      try {
        await apiFetch(`${API_BASE}/environments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: template.kind,
            runtime,
            template: template.id,
            ttlSeconds: template.defaultTtlSeconds,
          }),
        });
        await refresh();
        pushSuccess(`Launched ${template.label}.`);
      } catch (err) {
        pushError(err instanceof Error ? err.message : "Failed to launch environment.");
      } finally {
        setLaunchingTemplateId(null);
      }
    },
    [refresh, pushSuccess, pushError],
  );

  const addTemplate = useCallback(
    async (input: CreateTemplateInput) => {
      const template = await addTemplateRaw(input);
      pushSuccess(`Added template "${template.label}".`);
      return template;
    },
    [addTemplateRaw, pushSuccess],
  );

  const removeTemplate = useCallback(
    async (id: string) => {
      try {
        await removeTemplateRaw(id);
        pushSuccess("Template removed.");
      } catch (err) {
        pushError(err instanceof Error ? err.message : "Failed to remove template.");
      }
    },
    [removeTemplateRaw, pushSuccess, pushError],
  );

  const destroyEnvironment = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`${API_BASE}/environments/${id}`, { method: "DELETE" });
        await refresh();
      } catch (err) {
        pushError(err instanceof Error ? err.message : "Failed to destroy environment.");
      }
    },
    [refresh, pushError],
  );

  const openConnection = useCallback((connection: ConnectionInfo) => {
    window.open(`${API_BASE}${connection.url}`, "_blank", "noopener,noreferrer");
  }, []);

  const value = useMemo<AppDataContextValue>(
    () => ({
      environments,
      apiStatus,
      refreshEnvironments: refresh,
      templates,
      addTemplate,
      removeTemplate,
      runtimesByKind,
      history,
      toasts,
      pushError,
      pushSuccess,
      pushInfo,
      dismissToast: dismiss,
      launchingTemplateId,
      launchEnvironment,
      destroyEnvironment,
      openConnection,
    }),
    [
      environments,
      apiStatus,
      refresh,
      templates,
      addTemplate,
      removeTemplate,
      runtimesByKind,
      history,
      toasts,
      pushError,
      pushSuccess,
      pushInfo,
      dismiss,
      launchingTemplateId,
      launchEnvironment,
      destroyEnvironment,
      openConnection,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
