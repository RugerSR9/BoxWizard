import { Boxes, Cpu, MemoryStick, MonitorSmartphone } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { Card, CardBody } from "../components/ui/Card";
import { EnvironmentCard } from "../components/dashboard/EnvironmentCard";
import { useAppData } from "../context/AppDataContext";

function StatCard({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-accent-soft text-accent shrink-0">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-ink-subtle">{label}</div>
        <div className="text-lg font-semibold text-ink leading-tight">{value}</div>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { environments, apiStatus, history, destroyEnvironment, openConnection } = useAppData();

  const active = environments.filter((e) => e.status === "running" || e.status === "provisioning");
  const containers = active.filter((e) => e.kind === "container").length;
  const vms = active.filter((e) => e.kind === "vm").length;
  const totalCpuPercent = active.reduce((sum, e) => sum + (e.usage?.cpuPercent ?? 0), 0);
  const totalMemMb = active.reduce((sum, e) => sum + (e.usage?.memoryUsedMb ?? 0), 0);

  return (
    <>
      <TopBar title="Dashboard" subtitle="Overview of running and recent environments" apiStatus={apiStatus} />
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Boxes} label="Active environments" value={String(active.length)} />
          <StatCard icon={MonitorSmartphone} label="Containers / VMs" value={`${containers} / ${vms}`} />
          <StatCard icon={Cpu} label="Total CPU in use" value={`${totalCpuPercent.toFixed(1)}%`} />
          <StatCard icon={MemoryStick} label="Total memory in use" value={`${totalMemMb} MB`} />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-ink mb-3">Running &amp; recent environments</h2>
          {environments.length === 0 ? (
            <Card>
              <CardBody className="text-sm text-ink-subtle py-8 text-center">
                Nothing running yet - launch one from the Templates page.
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {environments.map((env) => (
                <EnvironmentCard
                  key={env.id}
                  environment={env}
                  history={history.get(env.id) ?? []}
                  onOpenConnection={() => env.connection && openConnection(env.connection)}
                  onDestroy={() => destroyEnvironment(env.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
