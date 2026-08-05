import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import type { ResourceHistoryPoint } from "../../hooks/useResourceHistory";

export interface ResourceSparklineProps {
  label: string;
  valueLabel: string;
  data: ResourceHistoryPoint[];
  dataKey: "cpuPercent" | "memoryUsedMb";
  color: string;
  domainMax?: number;
}

/**
 * Minimal "CloudWatch mini-graph" style area chart - no axes/gridlines/
 * tooltips, just a clean trend line plus the current value shown as text.
 * Deliberately generic (label/dataKey/color/domain as props) so adding a
 * third metric later (e.g. disk, network) is a one-line usage, not a new
 * component.
 */
export function ResourceSparkline({ label, valueLabel, data, dataKey, color, domainMax }: ResourceSparklineProps) {
  const gradientId = `sparkline-${dataKey}-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
  const hasData = data.length > 1;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-subtle font-medium">{label}</span>
        <span className="text-ink font-semibold tabular-nums">{valueLabel}</span>
      </div>
      <div className="h-11 -mx-1">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, domainMax ?? "auto"]} />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={1.75}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full flex items-center text-[11px] text-ink-subtle/70">Collecting data...</div>
        )}
      </div>
    </div>
  );
}
