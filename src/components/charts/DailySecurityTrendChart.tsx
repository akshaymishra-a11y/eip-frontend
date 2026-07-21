import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type DailySecurityTrendPoint = { date: string; vulnerabilitiesFound: number; vulnerabilitiesFixed: number };

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DailySecurityTrendChart({ data }: { data: DailySecurityTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
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
          cursor={{ fill: '#F8FAFC' }}
          contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12 }}
          labelStyle={{ color: '#0F172A', fontWeight: 600 }}
          labelFormatter={(date) => formatDateLabel(date as string)}
          formatter={(value, name) => [value, name === 'vulnerabilitiesFixed' ? 'Fixed' : 'Found']}
        />
        <Bar dataKey="vulnerabilitiesFound" fill="#F59E0B" radius={[3, 3, 0, 0]} />
        <Bar dataKey="vulnerabilitiesFixed" fill="#10B981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
