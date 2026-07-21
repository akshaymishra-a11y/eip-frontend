import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function ResourceTrendChart({ data }: { data: { label: string; avgCpu: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} interval={3} />
        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={36} unit="%" />
        <Tooltip
          cursor={{ stroke: '#2563EB', strokeWidth: 1 }}
          contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12 }}
          labelStyle={{ color: '#0F172A', fontWeight: 600 }}
          formatter={(value) => [`${value}%`, 'Avg CPU']}
        />
        <Area type="monotone" dataKey="avgCpu" stroke="#2563EB" fill="#2563EB" fillOpacity={0.12} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
