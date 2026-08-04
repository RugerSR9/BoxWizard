import { useEffect, useState } from "react";
import "./App.css";
import { apiFetch } from "./apiClient";
import { ToastContainer, useToasts } from "./Toast";

/**
 * Placeholder BoxWizard GUI shell. Talks to the local REST API exposed by
 * packages/mcp-server (see docs/mcp-api-design.md) rather than duplicating
 * lifecycle logic in the frontend. This validates the GUI <-> local-service
 * wiring pattern; the full catalog/launch/attach UI is a follow-up.
 */

const API_BASE = "http://localhost:4180";

interface EnvironmentTemplate {
  id: string;
  kind: "container" | "vm";
  label: string;
  defaultTtlSeconds: number;
}

interface ResourceUsage {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  sampledAt: string;
}

type ConnectionInfo =
  | { type: "terminal"; url: string }
  | { type: "vnc"; url: string; host: string | null; port: number };

interface EnvironmentRecord {
  id: string;
  kind: "container" | "vm";
  template: string | null;
  image: string | null;
  status: string;
  ttlExpiresAt: string;
  usage: ResourceUsage | null;
  connection: ConnectionInfo | null;
}

function formatUsage(usage: ResourceUsage | null): { cpu: string; mem: string } {
  if (!usage) return { cpu: "-", mem: "-" };
  return {
    cpu: `${usage.cpuPercent.toFixed(1)}%`,
    mem: `${usage.memoryUsedMb} / ${usage.memoryLimitMb} MB`,
  };
}

function connectionLabel(connection: ConnectionInfo): string {
  return connection.type === "terminal" ? "Open Terminal" : "Open Console";
}

function connectionDisabledReason(connection: ConnectionInfo): string | null {
  if (connection.type === "vnc" && !connection.host) {
    return "VM console not reachable yet (guest network address still resolving).";
  }
  return null;
}

function App() {
  const [templates, setTemplates] = useState<EnvironmentTemplate[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([]);
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const { toasts, pushError, dismiss } = useToasts();

  async function refresh() {
    try {
      const [templatesRes, envsRes] = await Promise.all([
        apiFetch(`${API_BASE}/templates`),
        apiFetch(`${API_BASE}/environments`),
      ]);
      const templatesJson = await templatesRes.json();
      const envsJson = await envsRes.json();
      setTemplates(templatesJson.templates);
      setEnvironments(envsJson.environments);
      setApiStatus("online");
    } catch (err) {
      setApiStatus("offline");
      if (err instanceof TypeError) {
        // Network-level failure (service not running) - the "offline" status
        // banner already communicates this, no need to also toast it.
        return;
      }
      pushError(err instanceof Error ? err.message : "Failed to load environments.");
    }
  }

  useEffect(() => {
    refresh();
    // Slightly faster than before so the CPU/memory columns feel "live".
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  function openConnection(connection: ConnectionInfo) {
    window.open(`${API_BASE}${connection.url}`, "_blank", "noopener,noreferrer");
  }

  async function launch(template: EnvironmentTemplate) {
    setBusyTemplateId(template.id);
    try {
      await apiFetch(`${API_BASE}/environments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: template.kind,
          template: template.id,
          ttlSeconds: template.defaultTtlSeconds,
        }),
      });
      await refresh();
    } catch (err) {
      pushError(err instanceof Error ? err.message : "Failed to launch environment.");
    } finally {
      setBusyTemplateId(null);
    }
  }

  async function destroy(id: string) {
    try {
      await apiFetch(`${API_BASE}/environments/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      pushError(err instanceof Error ? err.message : "Failed to destroy environment.");
    }
  }

  return (
    <main className="container">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <h1>BoxWizard</h1>
      <p className="subtitle">Short-lived sandboxes, one click at a time.</p>
      <p className={`api-status api-status--${apiStatus}`}>
        Local service: {apiStatus === "online" ? "connected" : apiStatus === "offline" ? "not running (start packages/mcp-server)" : "checking..."}
      </p>

      <section>
        <h2>Templates</h2>
        <div className="template-grid">
          {templates.map((t) => (
            <div className="template-card" key={t.id}>
              <div className="template-kind">{t.kind === "vm" ? "VM" : "Container"}</div>
              <div className="template-label">{t.label}</div>
              <button disabled={busyTemplateId === t.id || apiStatus !== "online"} onClick={() => launch(t)}>
                {busyTemplateId === t.id ? "Launching..." : "Launch"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Running &amp; Recent Environments</h2>
        {environments.length === 0 && <p className="empty-state">Nothing running yet - launch a template above.</p>}
        <table className="env-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Template / Image</th>
              <th>Status</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>TTL Expires</th>
              <th>Access</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {environments.map((e) => {
              const { cpu, mem } = formatUsage(e.usage);
              const disabledReason = e.connection ? connectionDisabledReason(e.connection) : null;
              return (
                <tr key={e.id}>
                  <td>{e.kind}</td>
                  <td>{e.template ?? e.image}</td>
                  <td>{e.status}</td>
                  <td className="numeric-cell">{cpu}</td>
                  <td className="numeric-cell">{mem}</td>
                  <td>{new Date(e.ttlExpiresAt).toLocaleTimeString()}</td>
                  <td>
                    {e.connection && e.status === "running" ? (
                      <button
                        className="link-button"
                        disabled={!!disabledReason}
                        title={disabledReason ?? undefined}
                        onClick={() => openConnection(e.connection!)}
                      >
                        {connectionLabel(e.connection)}
                      </button>
                    ) : (
                      <span className="empty-state">-</span>
                    )}
                  </td>
                  <td>
                    {e.status !== "destroyed" && e.status !== "destroying" && (
                      <button onClick={() => destroy(e.id)}>Destroy</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default App;
