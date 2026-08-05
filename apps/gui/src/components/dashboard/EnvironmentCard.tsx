import { Container, MonitorSmartphone, Terminal, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { Button } from "../ui/Button";
import { StatusPill, KindBadge } from "../ui/StatusPill";
import { ResourceSparkline } from "./ResourceSparkline";
import type { EnvironmentRecord } from "../../lib/types";
import { connectionLabel, connectionDisabledReason } from "../../lib/types";
import type { ResourceHistoryPoint } from "../../hooks/useResourceHistory";
import { formatCountdown } from "../../lib/format";
import { useNow } from "../../hooks/useNow";

export interface EnvironmentCardProps {
  environment: EnvironmentRecord;
  history: ResourceHistoryPoint[];
  onOpenConnection: () => void;
  onDestroy: () => void;
}

export function EnvironmentCard({ environment, history, onOpenConnection, onDestroy }: EnvironmentCardProps) {
  const now = useNow(1000);
  const isVm = environment.kind === "vm";
  const Icon = isVm ? MonitorSmartphone : Container;
  const disabledReason = environment.connection ? connectionDisabledReason(environment.connection) : null;
  const canDestroy = environment.status !== "destroyed" && environment.status !== "destroying";
  const usage = environment.usage;

  return (
    <Card hoverable className="flex flex-col">
      <CardHeader
        icon={<Icon size={18} className="text-ink-subtle shrink-0 mt-0.5" />}
        title={environment.template ?? environment.image ?? environment.id}
        subtitle={
          <span className="flex items-center gap-1.5">
            <KindBadge kind={environment.kind} />
            <span className="text-ink-subtle">{environment.runtime}</span>
          </span>
        }
        actions={<StatusPill status={environment.status} />}
      />
      <CardBody className="flex flex-col gap-3">
        {environment.status === "running" && usage ? (
          <div className="grid grid-cols-2 gap-3">
            <ResourceSparkline
              label="CPU"
              valueLabel={`${usage.cpuPercent.toFixed(1)}%`}
              data={history}
              dataKey="cpuPercent"
              color="var(--color-accent)"
              domainMax={100}
            />
            <ResourceSparkline
              label="Memory"
              valueLabel={`${usage.memoryUsedMb} / ${usage.memoryLimitMb} MB`}
              data={history}
              dataKey="memoryUsedMb"
              color="var(--color-kind-vm)"
              domainMax={usage.memoryLimitMb}
            />
          </div>
        ) : (
          <p className="text-xs text-ink-subtle">
            {environment.status === "provisioning" ? "Starting up..." : "No live metrics for this environment."}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-ink-subtle pt-1 border-t border-border">
          <span>{formatCountdown(environment.ttlExpiresAt, now)}</span>
          <div className="flex items-center gap-1.5">
            {environment.connection && environment.status === "running" && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Terminal size={14} />}
                disabled={!!disabledReason}
                title={disabledReason ?? undefined}
                onClick={onOpenConnection}
              >
                {connectionLabel(environment.connection)}
              </Button>
            )}
            {canDestroy && (
              <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={onDestroy}>
                Destroy
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
