import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type DailyErrorTrendPoint = { date: string; totalErrors: number; criticalErrors: number };

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DailyErrorTrendChart({ data }: { data: DailyErrorTrendPoint[] }) {
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
        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12 }}
          labelStyle={{ color: '#0F172A', fontWeight: 600 }}
          labelFormatter={(date) => formatDateLabel(date as string)}
          formatter={(value, name) => [value, name === 'criticalErrors' ? 'Critical' : 'Total errors']}
        />
        <Line type="monotone" dataKey="totalErrors" stroke="#2563EB" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="criticalErrors" stroke="#EF4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
