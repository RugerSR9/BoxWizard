import { TopBar } from "../components/layout/TopBar";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { useAppData } from "../context/AppDataContext";
import { API_BASE } from "../lib/apiClient";

/**
 * Thin placeholder - establishes the settings page pattern (route + sidebar
 * entry already wired) without building out real configuration yet.
 */
export function Settings() {
  const { apiStatus } = useAppData();

  return (
    <>
      <TopBar title="Settings" subtitle="Local service and app preferences" apiStatus={apiStatus} />
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="max-w-lg">
          <CardHeader title="Local service" subtitle="BoxWizard talks to a local REST API for all environment lifecycle operations" />
          <CardBody className="text-sm text-ink-subtle space-y-1">
            <p>
              Endpoint: <span className="text-ink font-mono">{API_BASE}</span>
            </p>
            <p>More settings (custom endpoint, default TTLs, theme) are coming soon.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
