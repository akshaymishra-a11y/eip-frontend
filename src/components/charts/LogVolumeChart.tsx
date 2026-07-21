import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const LEVEL_COLOR = {
  debug: '#94A3B8',
  info: '#2563EB',
  warn: '#F59E0B',
  error: '#EF4444',
};

export type LogVolumeBucket = {
  label: string;
  debug: number;
  info: number;
  warn: number;
  error: number;
};

export function LogVolumeChart({ data }: { data: LogVolumeBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} interval={3} />
        <Tooltip
          cursor={{ fill: '#F8FAFC' }}
          contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12 }}
          labelStyle={{ color: '#0F172A', fontWeight: 600 }}
        />
        <Bar dataKey="debug" stackId="level" fill={LEVEL_COLOR.debug} />
        <Bar dataKey="info" stackId="level" fill={LEVEL_COLOR.info} />
        <Bar dataKey="warn" stackId="level" fill={LEVEL_COLOR.warn} />
        <Bar dataKey="error" stackId="level" fill={LEVEL_COLOR.error} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
