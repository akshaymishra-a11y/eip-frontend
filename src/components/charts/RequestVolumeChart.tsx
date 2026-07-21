import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Icon } from '../ui';

const PRIMARY = '#2563EB';
const HIGHLIGHT = '#EF4444';

type ChartPoint = { label: string; count: number };

function RequestVolumeTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-text-primary mb-0.5">{label}</p>
      <p className="text-text-secondary">
        <span className="font-bold text-text-primary">{payload[0].value.toLocaleString()}</span> requests
      </p>
    </div>
  );
}

export function RequestVolumeChart({ data, highlightIndex }: { data: number[]; highlightIndex?: number }) {
  const now = new Date();
  const chartData: ChartPoint[] = data.map((count, i) => {
    const hoursAgo = data.length - 1 - i;
    const hour = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).getHours();
    return { label: `${hour}:00`, count };
  });

  if (chartData.every((d) => d.count === 0)) {
    return (
      <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-center">
        <Icon name="show_chart" className="text-text-muted text-[28px]" />
        <p className="text-sm text-text-secondary">No request traffic in this window yet.</p>
      </div>
    );
  }

  // Marks one specific hour (e.g. an error-rate spike) in red — the rest of the
  // line stays unhighlighted, so returning `false` here (no dots at all) keeps
  // the line clean whenever no caller asked for a highlight.
  const renderDot = (props: { cx?: number; cy?: number; index?: number }) => {
    if (props.index !== highlightIndex) return <g key={`dot-${props.index}`} />;
    return (
      <circle
        key={`dot-${props.index}`}
        cx={props.cx}
        cy={props.cy}
        r={5}
        fill={HIGHLIGHT}
        stroke="#FFFFFF"
        strokeWidth={2}
      />
    );
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="requestVolumeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.22} />
            <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#EEF2F7" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#94A3B8' }}
          axisLine={{ stroke: '#E2E8F0' }}
          tickLine={false}
          interval={3}
        />
        <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
        <Tooltip cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }} content={<RequestVolumeTooltip />} />
        <Area
          type="monotone"
          dataKey="count"
          stroke={PRIMARY}
          strokeWidth={2}
          fill="url(#requestVolumeFill)"
          dot={highlightIndex !== undefined ? renderDot : false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#FFFFFF', fill: PRIMARY }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
