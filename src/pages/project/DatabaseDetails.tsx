import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Card, EmptyState, Icon } from '../../components/ui';
import { fetchDbQueryMetrics, fetchDiscoveredServices, fetchServiceDependencyEdges, type DbQueryMetrics } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { DependencyEdge, DiscoveredService } from '../../lib/types';

// Matches the SDK's own wrapDatabase() default slowQueryThresholdMs — see
// InfrastructureDashboard's identical constant.
const SLOW_QUERY_MS = 200;
const BUCKET_COUNT = 12;

const RANGES = { '1H': 1, '6H': 6, '24H': 24 } as const;
type RangeKey = keyof typeof RANGES;

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function percentile(sortedAsc: number[], p: number) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.max(0, Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-text-secondary',
};

const TONE_BAR: Record<Tone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-text-muted',
};

const TONE_CHIP: Record<Tone, string> = {
  primary: 'bg-primary-light text-primary',
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  neutral: 'bg-background text-text-secondary',
};

function BentoKpi({
  label,
  icon,
  value,
  delta,
  deltaTone = 'neutral',
  hint,
  progressPct,
  progressTone = 'primary',
}: {
  label: string;
  icon: string;
  value: string;
  delta?: string;
  deltaTone?: Tone;
  hint?: string;
  progressPct: number;
  progressTone?: Tone;
}) {
  return (
    <Card className="p-5">
      <div className="flex justify-between items-start mb-4">
        <span className="text-text-secondary text-[11px] font-bold uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${TONE_CHIP[progressTone]}`}>
          <Icon name={icon} className="text-[18px]" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-text-primary">{value}</span>
        {delta && <span className={`text-xs font-bold ${TONE_TEXT[deltaTone]}`}>{delta}</span>}
      </div>
      {hint && <p className="text-text-secondary text-xs mt-2">{hint}</p>}
      <div className="mt-4 h-1 w-full bg-background rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${TONE_BAR[progressTone]}`} style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }} />
      </div>
    </Card>
  );
}

export default function DatabaseDetails() {
  const { project } = useProject();
  const { dbType } = useParams<{ dbType: string }>();
  const [range, setRange] = useState<RangeKey>('6H');
  const [metrics, setMetrics] = useState<DbQueryMetrics | null>(null);
  const [edges, setEdges] = useState<DependencyEdge[]>([]);
  const [service, setService] = useState<DiscoveredService | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!project || !dbType) return;
    const [metricsData, edgeData, services] = await Promise.all([
      fetchDbQueryMetrics(project.id, dbType, RANGES[range]),
      fetchServiceDependencyEdges(project.id),
      fetchDiscoveredServices(project.id),
    ]);
    setMetrics(metricsData);
    setEdges(edgeData);
    setService(services.find((s) => s.name === dbType && s.service_type === 'database') ?? null);
  }, [project, dbType, range]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const callingServices = edges.filter((e) => e.kind === 'db' && e.to === dbType);
  const totalEdgeCalls = callingServices.reduce((sum, e) => sum + e.callCount, 0);
  const totalEdgeErrors = callingServices.reduce((sum, e) => sum + e.errorCount, 0);
  const edgeSuccessPct = totalEdgeCalls > 0 ? ((totalEdgeCalls - totalEdgeErrors) / totalEdgeCalls) * 100 : 100;

  const totalQueries = metrics?.totalQueries ?? 0;
  const failedCount = metrics?.failedCount ?? 0;
  const avgDurationMs = metrics?.avgDurationMs ?? 0;
  const errorRatePct = totalQueries > 0 ? (failedCount / totalQueries) * 100 : 0;
  const successRatePct = 100 - errorRatePct;
  const isHealthy = totalQueries === 0 || errorRatePct < 5;
  const hasData = totalQueries > 0 || callingServices.length > 0;

  const buckets = useMemo(() => {
    const windowMs = RANGES[range] * 60 * 60 * 1000;
    const bucketMs = windowMs / BUCKET_COUNT;
    const now = Date.now();
    const list = Array.from({ length: BUCKET_COUNT }, (_, i) => {
      const start = now - (BUCKET_COUNT - i) * bucketMs;
      const end = start + bucketMs;
      return { start, end, count: 0, errorCount: 0 };
    });
    for (const q of metrics?.queries ?? []) {
      const t = new Date(q.occurred_at).getTime();
      const bucket = list.find((b) => t >= b.start && t < b.end);
      if (bucket) {
        bucket.count += 1;
        if (!q.success) bucket.errorCount += 1;
      }
    }
    return list.map((b) => ({
      label: new Date(b.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      count: b.count,
      errorCount: b.errorCount,
    }));
  }, [metrics, range]);

  const peakBucketCount = Math.max(1, ...buckets.map((b) => b.count));
  const recentBucketCount = buckets[buckets.length - 1]?.count ?? 0;
  const firstHalf = buckets.slice(0, Math.floor(BUCKET_COUNT / 2)).reduce((s, b) => s + b.count, 0);
  const secondHalf = buckets.slice(Math.floor(BUCKET_COUNT / 2)).reduce((s, b) => s + b.count, 0);
  const volumeTrendPct = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : secondHalf > 0 ? 100 : 0;

  const p95Duration = useMemo(() => {
    const durations = (metrics?.queries ?? []).map((q) => q.duration_ms).sort((a, b) => a - b);
    return percentile(durations, 95);
  }, [metrics]);

  const callCountByText = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of metrics?.queries ?? []) {
      const key = q.query_text ?? '';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [metrics]);

  const hasAlert = (metrics?.slowQueries ?? []).some((q) => q.duration_ms >= SLOW_QUERY_MS);

  return (
    <>
      <nav className="flex items-center gap-2 text-text-muted text-xs mb-3">
        <Link to={`/projects/${project?.id}/architecture`} className="hover:text-text-primary">
          Architecture
        </Link>
        <Icon name="chevron_right" className="text-[14px]" />
        <Link to={`/projects/${project?.id}/dependencies`} className="hover:text-text-primary">
          Service Dependency Graph
        </Link>
        <Icon name="chevron_right" className="text-[14px]" />
        <span className="text-primary font-semibold">{dbType}</span>
      </nav>

      <div className="flex items-end justify-between gap-4 mb-1 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">{dbType}</h1>
            {hasData && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  isHealthy ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isHealthy ? 'bg-success' : 'bg-danger'}`} />
                {isHealthy ? 'Healthy' : 'Degraded'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-text-secondary text-sm flex-wrap">
            <span className="flex items-center gap-1.5">
              <Icon name="database" className="text-[16px]" /> {totalQueries} queries traced
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="flex items-center gap-1.5">
              <Icon name="hub" className="text-[16px]" /> {callingServices.length} calling service{callingServices.length === 1 ? '' : 's'}
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="flex items-center gap-1.5">
              <Icon name="schedule" className="text-[16px]" />
              {service ? `Last seen ${timeAgo(service.last_seen_at)}` : 'Not registered as a discovered service'}
            </span>
          </div>
        </div>
        <Link
          to={`/projects/${project?.id}/infrastructure`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-md text-sm hover:bg-primary-hover transition-colors"
        >
          <Icon name="query_stats" className="text-[18px]" /> View in Infrastructure Dashboard
        </Link>
      </div>

      {!loading && !hasData ? (
        <Card className="mt-6">
          <EmptyState
            icon="database"
            title="No activity observed for this database"
            description="Metrics appear here once the SDK observes queries against this database (e.g. via wrapDatabase())."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
            <BentoKpi
              label="Query Volume"
              icon="database"
              value={String(totalQueries)}
              delta={buckets.some((b) => b.count > 0) ? `${volumeTrendPct >= 0 ? '↑' : '↓'} ${Math.abs(volumeTrendPct).toFixed(0)}%` : undefined}
              hint={`Peak: ${peakBucketCount} in busiest bucket, last ${range}`}
              progressPct={(recentBucketCount / peakBucketCount) * 100}
              progressTone="primary"
            />
            <BentoKpi
              label="Avg Query Time"
              icon="timer"
              value={`${avgDurationMs.toFixed(0)}ms`}
              delta={avgDurationMs >= SLOW_QUERY_MS ? `+${(avgDurationMs - SLOW_QUERY_MS).toFixed(0)}ms over target` : 'Within target'}
              deltaTone={avgDurationMs >= SLOW_QUERY_MS ? 'danger' : 'success'}
              hint={`P95: ${p95Duration.toFixed(0)}ms`}
              progressPct={(avgDurationMs / SLOW_QUERY_MS) * 100}
              progressTone={avgDurationMs >= SLOW_QUERY_MS ? 'danger' : 'warning'}
            />
            <BentoKpi
              label="Success Rate"
              icon="bolt"
              value={`${successRatePct.toFixed(1)}%`}
              delta={failedCount > 0 ? `${failedCount} failed` : 'All succeeded'}
              deltaTone={failedCount > 0 ? 'danger' : 'success'}
              hint={`${totalQueries - failedCount} of ${totalQueries} queries succeeded`}
              progressPct={successRatePct}
              progressTone={successRatePct >= 99 ? 'success' : successRatePct >= 95 ? 'warning' : 'danger'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
            <Card className="lg:col-span-8 overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex justify-between items-center">
                <h2 className="text-base font-semibold text-text-primary">Query Activity</h2>
                <div className="flex gap-1.5">
                  {(Object.keys(RANGES) as RangeKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRange(key)}
                      className={`px-2.5 py-1 text-xs font-bold rounded ${
                        range === key ? 'bg-primary text-white' : 'bg-white border border-border text-text-secondary hover:bg-background'
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-semibold text-text-secondary">Query Volume</span>
                    <span className="text-sm font-bold text-primary">{totalQueries}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart data={buckets} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} interval={3} />
                      <Tooltip
                        cursor={{ fill: '#F8FAFC' }}
                        contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 12 }}
                        labelStyle={{ color: '#0F172A', fontWeight: 600 }}
                      />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                        {buckets.map((b, i) => (
                          <Cell key={i} fill={b.errorCount > 0 ? '#EF4444' : '#2563EB'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-semibold text-text-secondary">Success Rate</span>
                    <span className={`text-sm font-bold ${TONE_TEXT[successRatePct >= 99 ? 'success' : successRatePct >= 95 ? 'warning' : 'danger']}`}>
                      {successRatePct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-[110px] w-full rounded-lg border border-border bg-background flex items-center justify-center relative overflow-hidden">
                    <div
                      className={`absolute inset-x-0 bottom-0 ${successRatePct >= 99 ? 'bg-success/10' : successRatePct >= 95 ? 'bg-warning/10' : 'bg-danger/10'}`}
                      style={{ height: `${successRatePct}%` }}
                    />
                    <span className={`relative text-xs font-bold uppercase tracking-wide ${TONE_TEXT[successRatePct >= 99 ? 'success' : successRatePct >= 95 ? 'warning' : 'danger']}`}>
                      {successRatePct >= 99 ? 'Optimal performance' : successRatePct >= 95 ? 'Minor errors' : 'Elevated errors'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-semibold text-text-secondary">P95 Latency</span>
                    <span className={`text-sm font-bold ${p95Duration >= SLOW_QUERY_MS ? 'text-danger' : 'text-text-primary'}`}>
                      {p95Duration.toFixed(0)}ms
                    </span>
                  </div>
                  <div className="h-[110px] w-full flex items-center justify-center bg-background border border-border rounded-lg">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-text-primary">{p95Duration.toFixed(0)}</div>
                      <div className="text-[10px] text-text-muted uppercase tracking-wide">ms · 95th percentile</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-4 overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex justify-between items-center">
                <h2 className="text-base font-semibold text-text-primary">Calling Services</h2>
              </div>
              {callingServices.length === 0 ? (
                <div className="px-6 py-8 text-sm text-text-secondary text-center">No traced calls to this database yet.</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-background text-text-muted border-b border-border">
                    <tr>
                      <th className="px-6 py-3 font-bold text-[11px] uppercase">Service</th>
                      <th className="px-6 py-3 font-bold text-[11px] uppercase text-right">Calls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {callingServices.map((edge) => (
                      <tr key={edge.from}>
                        <td className="px-6 py-3 font-medium text-text-primary">
                          {edge.from}
                          <div className="text-[11px] text-text-muted font-normal">
                            {edge.avgDurationMs.toFixed(0)}ms avg
                            {edge.errorCount > 0 && <span className="text-danger"> · {edge.errorCount} errors</span>}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-right font-mono">{edge.callCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {totalEdgeCalls > 0 && (
                <div className="p-5 bg-background/60 border-t border-border">
                  <div className="flex items-center justify-between text-xs font-bold text-text-muted mb-2">
                    <span>CALL HEALTH (24H)</span>
                    <span className="text-text-primary">{edgeSuccessPct.toFixed(1)}% success</span>
                  </div>
                  <div className="h-2 w-full bg-background rounded-full overflow-hidden flex">
                    <div className="h-full bg-success" style={{ width: `${edgeSuccessPct}%` }} />
                    <div className="h-full bg-danger" style={{ width: `${100 - edgeSuccessPct}%` }} />
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-text-primary">Slowest Queries</h2>
                {hasAlert && <span className="bg-danger-light text-danger px-2 py-0.5 rounded text-[10px] font-bold">ALERT</span>}
              </div>
              <div className="flex items-center gap-4 text-xs text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-danger" /> {'>'}= {SLOW_QUERY_MS}ms
                </span>
                <span>
                  Top {metrics?.slowQueries.length ?? 0} of {totalQueries} in last {range}
                </span>
              </div>
            </div>
            {!metrics || metrics.slowQueries.length === 0 ? (
              <div className="px-6 py-8 text-sm text-text-secondary text-center">No queries recorded for this database in this window.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-background text-text-muted border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-bold text-[11px] uppercase">Query Trace</th>
                    <th className="px-6 py-3 font-bold text-[11px] uppercase text-center">Duration</th>
                    <th className="px-6 py-3 font-bold text-[11px] uppercase text-center">Calls (window)</th>
                    <th className="px-6 py-3 font-bold text-[11px] uppercase text-center">Status</th>
                    <th className="px-6 py-3 font-bold text-[11px] uppercase text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metrics.slowQueries.map((q) => (
                    <tr key={q.id} className="hover:bg-background/60 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium font-mono text-text-primary truncate max-w-md">{q.query_text ?? '—'}</span>
                          <span className="text-[10px] text-text-muted uppercase">{q.db_type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`font-bold text-sm ${q.duration_ms >= SLOW_QUERY_MS ? 'text-danger' : 'text-text-primary'}`}>
                          {q.duration_ms.toFixed(0)}ms
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center text-text-secondary">{callCountByText.get(q.query_text ?? '') ?? 1}</td>
                      <td className="px-6 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            q.success ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
                          }`}
                        >
                          {q.success ? 'OK' : 'FAILED'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-text-secondary">{timeAgo(q.occurred_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
