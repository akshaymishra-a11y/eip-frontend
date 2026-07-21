import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type DailyTrendPoint = { date: string; requests: number; errorRatePct: number };

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DailyTrendChart({ data }: { data: DailyTrendPoint[] }) {
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
        <YAxis yAxisId="requests" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={40} />
        <YAxis
          yAxisId="errorRate"
          orientation="right"
          tick={{ fontSize: 11, fill: '#64748B' }}
          axisLine={false}
          tickLine={false}
          width={40}
          unit="%"
        />
        <Tooltip
          contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12 }}
          labelStyle={{ color: '#0F172A', fontWeight: 600 }}
          labelFormatter={(date) => formatDateLabel(date as string)}
          formatter={(value, name) => [
            name === 'errorRatePct' ? `${Number(value).toFixed(2)}%` : value,
            name === 'errorRatePct' ? 'Error rate' : 'Requests',
          ]}
        />
        <Line yAxisId="requests" type="monotone" dataKey="requests" stroke="#2563EB" strokeWidth={2} dot={false} />
        <Line yAxisId="errorRate" type="monotone" dataKey="errorRatePct" stroke="#EF4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
