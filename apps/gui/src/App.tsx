import { useEffect, useState } from "react";
import "./App.css";

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

interface EnvironmentRecord {
  id: string;
  kind: "container" | "vm";
  template: string | null;
  image: string | null;
  status: string;
  ttlExpiresAt: string;
}

function App() {
  const [templates, setTemplates] = useState<EnvironmentTemplate[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([]);
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);

  async function refresh() {
    try {
      const [templatesRes, envsRes] = await Promise.all([
        fetch(`${API_BASE}/templates`),
        fetch(`${API_BASE}/environments`),
      ]);
      const templatesJson = await templatesRes.json();
      const envsJson = await envsRes.json();
      setTemplates(templatesJson.templates);
      setEnvironments(envsJson.environments);
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  async function launch(template: EnvironmentTemplate) {
    setBusyTemplateId(template.id);
    try {
      await fetch(`${API_BASE}/environments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: template.kind,
          template: template.id,
          ttlSeconds: template.defaultTtlSeconds,
        }),
      });
      await refresh();
    } finally {
      setBusyTemplateId(null);
    }
  }

  async function destroy(id: string) {
    await fetch(`${API_BASE}/environments/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <main className="container">
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
              <th>TTL Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {environments.map((e) => (
              <tr key={e.id}>
                <td>{e.kind}</td>
                <td>{e.template ?? e.image}</td>
                <td>{e.status}</td>
                <td>{new Date(e.ttlExpiresAt).toLocaleTimeString()}</td>
                <td>
                  {e.status !== "destroyed" && e.status !== "destroying" && (
                    <button onClick={() => destroy(e.id)}>Destroy</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default App;
