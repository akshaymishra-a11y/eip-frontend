import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// One row per day; one numeric key per AWS service_category present that
// day (categories are dynamic — driven by whatever Cost Explorer returns —
// so unlike the other Daily*TrendChart components in this folder, the set
// of dataKeys isn't known statically and is passed in via `categories`).
export type CloudCostTrendPoint = { date: string; [category: string]: string | number };

const PALETTE = ['#2563EB', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#0EA5E9', '#64748B', '#EF4444'];

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function CloudCostTrendChart({ data, categories }: { data: CloudCostTrendPoint[]; categories: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#64748B' }}
          axisLine={{ stroke: '#E2E8F0' }}
          tickLine={false}
          interval={Math.max(0, Math.ceil(data.length / 8) - 1)}
          tickFormatter={formatDateLabel}
        />
        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          cursor={{ fill: '#F8FAFC' }}
          contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12 }}
          labelStyle={{ color: '#0F172A', fontWeight: 600 }}
          labelFormatter={(date) => formatDateLabel(date as string)}
          formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {categories.map((category, i) => (
          <Bar
            key={category}
            dataKey={category}
            stackId="cost"
            fill={PALETTE[i % PALETTE.length]}
            radius={i === categories.length - 1 ? [3, 3, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
