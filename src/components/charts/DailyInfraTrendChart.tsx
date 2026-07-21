import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type DailyInfraTrendPoint = { date: string; avgCpuPercent: number; avgMemoryPercent: number; avgEventLoopLagMs: number };

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const NAME_LABEL: Record<string, string> = {
  avgCpuPercent: 'Avg CPU',
  avgMemoryPercent: 'Avg Memory',
  avgEventLoopLagMs: 'Event loop lag',
};

export function DailyInfraTrendChart({ data }: { data: DailyInfraTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#64748B' }}
          axisLine={{ stroke: '#E2E8F0' }}
          tickLine={false}
          interval={Math.max(0, Math.ceil(data.length / 6) - 1)}
          tickFormatter={formatDateLabel}
        />
        <YAxis yAxisId="pct" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={40} unit="%" />
        <YAxis yAxisId="lag" orientation="right" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12 }}
          labelStyle={{ color: '#0F172A', fontWeight: 600 }}
          labelFormatter={(date) => formatDateLabel(date as string)}
          formatter={(value, name) => [
            name === 'avgEventLoopLagMs' ? `${Number(value).toFixed(1)}ms` : `${Number(value).toFixed(1)}%`,
            NAME_LABEL[name as string] ?? name,
          ]}
        />
        <Line yAxisId="pct" type="monotone" dataKey="avgCpuPercent" stroke="#2563EB" strokeWidth={2} dot={false} />
        <Line yAxisId="pct" type="monotone" dataKey="avgMemoryPercent" stroke="#F59E0B" strokeWidth={2} dot={false} />
        <Line yAxisId="lag" type="monotone" dataKey="avgEventLoopLagMs" stroke="#64748B" strokeWidth={2} strokeDasharray="4 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
