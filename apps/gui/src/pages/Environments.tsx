import { Terminal, Trash2 } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { Table, Thead, Tr, Th, Td } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { StatusPill, KindBadge } from "../components/ui/StatusPill";
import { Card, CardBody } from "../components/ui/Card";
import { useAppData } from "../context/AppDataContext";
import { connectionDisabledReason, connectionLabel } from "../lib/types";
import { formatCountdown, formatRelativeTime } from "../lib/format";
import { useNow } from "../hooks/useNow";

export function Environments() {
  const { environments, apiStatus, destroyEnvironment, openConnection } = useAppData();
  const now = useNow(1000);

  return (
    <>
      <TopBar title="Environments" subtitle="All running and recent sandboxes" apiStatus={apiStatus} />
      <div className="flex-1 overflow-y-auto p-6">
        {environments.length === 0 ? (
          <Card>
            <CardBody className="text-sm text-ink-subtle py-8 text-center">
              Nothing running yet - launch one from the Templates page.
            </CardBody>
          </Card>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Kind</Th>
                <Th>Template / Image</Th>
                <Th>Runtime</Th>
                <Th>Status</Th>
                <Th>CPU</Th>
                <Th>Memory</Th>
                <Th>Created</Th>
                <Th>TTL</Th>
                <Th>Access</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {environments.map((e) => {
                const disabledReason = e.connection ? connectionDisabledReason(e.connection) : null;
                const canDestroy = e.status !== "destroyed" && e.status !== "destroying";
                return (
                  <Tr key={e.id}>
                    <Td>
                      <KindBadge kind={e.kind} />
                    </Td>
                    <Td className="font-medium">{e.template ?? e.image ?? e.id}</Td>
                    <Td className="text-ink-subtle">{e.runtime}</Td>
                    <Td>
                      <StatusPill status={e.status} />
                    </Td>
                    <Td className="tabular-nums whitespace-nowrap">{e.usage ? `${e.usage.cpuPercent.toFixed(1)}%` : "-"}</Td>
                    <Td className="tabular-nums whitespace-nowrap">
                      {e.usage ? `${e.usage.memoryUsedMb} / ${e.usage.memoryLimitMb} MB` : "-"}
                    </Td>
                    <Td className="text-ink-subtle whitespace-nowrap">{formatRelativeTime(e.createdAt, now)}</Td>
                    <Td className="text-ink-subtle whitespace-nowrap">{formatCountdown(e.ttlExpiresAt, now)}</Td>
                    <Td>
                      {e.connection && e.status === "running" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Terminal size={14} />}
                          disabled={!!disabledReason}
                          title={disabledReason ?? undefined}
                          onClick={() => openConnection(e.connection!)}
                        >
                          {connectionLabel(e.connection)}
                        </Button>
                      ) : (
                        <span className="text-ink-subtle">-</span>
                      )}
                    </Td>
                    <Td>
                      {canDestroy && (
                        <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => destroyEnvironment(e.id)}>
                          Destroy
                        </Button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}
