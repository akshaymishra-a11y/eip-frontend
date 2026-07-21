import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

// Buckets whose lower bound sits at/above the SLA are flagged in warning/danger tones
// so the tail of slow requests stands out against the otherwise-healthy distribution.
const SLA_MS = 150;

function colorFor(label: string): string {
  const lowerBound = parseInt(label, 10);
  if (Number.isNaN(lowerBound) || lowerBound < SLA_MS) return '#2563EB';
  return label.endsWith('+') ? '#EF4444' : '#F59E0B';
}

export function LatencyHistogramChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
        <Tooltip
          cursor={{ fill: '#F8FAFC' }}
          contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12 }}
          labelStyle={{ color: '#0F172A', fontWeight: 600 }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((bucket) => (
            <Cell key={bucket.label} fill={colorFor(bucket.label)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
