import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, Card, EmptyState, Icon, PageHeader, StatusPill } from '../../components/ui';
import { RequestVolumeChart } from '../../components/charts/RequestVolumeChart';
import { LatencyHistogramChart } from '../../components/charts/LatencyHistogramChart';
import { DailyTrendChart, type DailyTrendPoint } from '../../components/charts/DailyTrendChart';
import { BarSparkline, LineSparkline } from '../../components/charts/Sparkline';
import { fetchApiDailyTrend, fetchApiMetrics, fetchDiscoveredServices, type ApiMetrics } from '../../lib/api';
import { useProject } from '../../lib/project-context';

const SLA_LATENCY_MS = 150;
const CRITICAL_ERROR_RATE_PCT = 1;

function exportApiReport(projectName: string, metrics: ApiMetrics) {
  const lines = [
    `Project,${projectName}`,
    `Requests (24h),${metrics.totalRequests}`,
    `Avg Latency,${metrics.avgLatencyMs.toFixed(0)}ms`,
    `P50 Latency,${metrics.p50LatencyMs.toFixed(0)}ms`,
    `P95 Latency,${metrics.p95LatencyMs.toFixed(0)}ms`,
    `P99 Latency,${metrics.p99LatencyMs.toFixed(0)}ms`,
    `Error Rate,${metrics.errorRatePct.toFixed(2)}%`,
    '',
    'Endpoint,Method,Requests,Errors,Avg Latency,P95 Latency,Success',
    ...metrics.topEndpoints.map(
      (ep) =>
        `${ep.path},${ep.method},${ep.count},${ep.errorCount},${ep.avgLatencyMs.toFixed(0)}ms,${ep.p95LatencyMs.toFixed(0)}ms,${ep.successPct.toFixed(1)}%`
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}-api-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-primary bg-primary-light',
  POST: 'text-success bg-success-light',
  PUT: 'text-warning bg-warning-light',
  PATCH: 'text-warning bg-warning-light',
  DELETE: 'text-danger bg-danger-light',
};

function endpointStatus(ep: ApiMetrics['topEndpoints'][number]): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (ep.successPct < 99 || ep.p95LatencyMs > SLA_LATENCY_MS * 1.5) return { label: 'Slow', tone: 'warning' };
  if (ep.p95LatencyMs <= SLA_LATENCY_MS / 3) return { label: 'Optimal', tone: 'success' };
  return { label: 'Active', tone: 'success' };
}

function formatCompact(n: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function DeltaBadge({ value, format, goodWhen }: { value: number; format: (v: number) => string; goodWhen: 'up' | 'down' }) {
  const isUp = value > 0;
  const isGood = value === 0 || (goodWhen === 'up' ? isUp : !isUp);
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isGood ? 'text-success' : 'text-danger'}`}>
      <Icon name={value === 0 ? 'trending_flat' : isUp ? 'trending_up' : 'trending_down'} className="text-[14px]" />
      {format(value)}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  delta,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  delta: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{label}</span>
        {delta}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-text-primary">{value}</span>
        <span className="text-xs text-text-secondary">{hint}</span>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </Card>
  );
}

export default function ApiDashboard() {
  const { project } = useProject();
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [serviceCount, setServiceCount] = useState(0);
  const [dailyTrend, setDailyTrend] = useState<DailyTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!project) return;
    const [metricsData, services, dailyMetrics] = await Promise.all([
      fetchApiMetrics(project.id),
      fetchDiscoveredServices(project.id),
      fetchApiDailyTrend(project.id, 30),
    ]);
    setMetrics(metricsData);
    setServiceCount(services.filter((s) => s.service_type === 'application').length);
    setDailyTrend(
      dailyMetrics.map((d) => ({
        date: d.date,
        requests: d.total_requests,
        errorRatePct: d.total_requests > 0 ? (d.total_errors / d.total_requests) * 100 : 0,
      }))
    );
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const degradedCount = metrics?.topEndpoints.filter((ep) => endpointStatus(ep).tone === 'warning').length ?? 0;
  const healthyCount = (metrics?.topEndpoints.length ?? 0) - degradedCount;
  const errorRateBarPct = metrics ? Math.min(100, (metrics.errorRatePct / CRITICAL_ERROR_RATE_PCT) * 100) : 0;

  return (
    <>
      <PageHeader
        title="API Observability Engine"
        subtitle={
          serviceCount > 0
            ? `Real-time performance metrics and endpoint health across ${serviceCount} distributed service${serviceCount === 1 ? '' : 's'}.`
            : 'Real-time performance metrics and endpoint health.'
        }
        actions={
          metrics && metrics.totalRequests > 0 ? (
            <>
              <Button variant="secondary" type="button" disabled title="Currently fixed to the last 24 hours">
                <Icon name="calendar_month" className="text-[18px]" />
                Last 24 Hours
              </Button>
              <Button variant="primary" onClick={() => exportApiReport(project?.name ?? 'project', metrics)} type="button">
                <Icon name="download" className="text-[18px]" />
                Export Report
              </Button>
            </>
          ) : undefined
        }
      />

      {!loading && (!metrics || metrics.totalRequests === 0) ? (
        <Card>
          <EmptyState icon="swap_horiz" title="No API traffic yet" description="Install the SDK and hit an endpoint to see metrics here." />
        </Card>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              label="Request Count"
              value={formatCompact(metrics.totalRequests)}
              hint="Total / Day"
              delta={<DeltaBadge value={metrics.requestCountDeltaPct} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`} goodWhen="up" />}
            >
              <BarSparkline data={metrics.hourlyVolume} />
            </StatCard>

            <StatCard
              label="P95 Latency"
              value={`${metrics.p95LatencyMs.toFixed(0)}ms`}
              hint={`SLA ${SLA_LATENCY_MS}ms`}
              delta={<DeltaBadge value={metrics.p95LatencyDeltaMs} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}ms`} goodWhen="down" />}
            >
              <LineSparkline data={metrics.hourlyAvgLatency} color={metrics.p95LatencyMs > SLA_LATENCY_MS ? '#F59E0B' : '#2563EB'} />
            </StatCard>

            <StatCard
              label="Error Rate"
              value={`${metrics.errorRatePct.toFixed(2)}%`}
              hint="4xx/5xx only"
              delta={<DeltaBadge value={metrics.errorRateDeltaPct} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`} goodWhen="down" />}
            >
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-danger-light overflow-hidden">
                  <div className="h-full rounded-full bg-secondary" style={{ width: `${errorRateBarPct}%` }} />
                </div>
                <span className="text-[9px] font-bold text-danger uppercase tracking-wide shrink-0">
                  Critical range &gt; {CRITICAL_ERROR_RATE_PCT}%
                </span>
              </div>
            </StatCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-text-primary">Request Trends</h2>
              </div>
              <RequestVolumeChart data={metrics.hourlyVolume} />
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-text-primary">Latency Distribution</h2>
                <span className="text-xs text-text-secondary">Histogram (ms)</span>
              </div>
              <LatencyHistogramChart data={metrics.latencyBuckets} />
            </Card>
          </div>

          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">30-Day Trend</h2>
              <span className="text-xs text-text-secondary">Daily rollup — requests (left) vs. error rate (right)</span>
            </div>
            {dailyTrend.length > 0 ? (
              <DailyTrendChart data={dailyTrend} />
            ) : (
              <p className="text-sm text-text-secondary py-8 text-center">
                No daily trend data yet — this fills in after the first nightly aggregation run.
              </p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Endpoint Performance Monitoring</h2>
              <div className="flex items-center gap-2">
                <StatusPill tone="success">Healthy: {healthyCount}</StatusPill>
                <StatusPill tone="warning">Degraded: {degradedCount}</StatusPill>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-secondary uppercase tracking-wide border-b border-border">
                    <th className="px-5 py-2.5 font-semibold">Endpoint Path</th>
                    <th className="px-5 py-2.5 font-semibold">Method</th>
                    <th className="px-5 py-2.5 font-semibold">Requests</th>
                    <th className="px-5 py-2.5 font-semibold">Errors</th>
                    <th className="px-5 py-2.5 font-semibold">P95 Latency</th>
                    <th className="px-5 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metrics.topEndpoints.map((ep) => {
                    const status = endpointStatus(ep);
                    return (
                      <tr key={`${ep.method} ${ep.path}`}>
                        <td className="px-5 py-3 font-mono text-text-primary truncate">{ep.path}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[ep.method] ?? 'bg-background text-text-secondary'}`}
                          >
                            {ep.method}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-text-primary font-medium">{ep.count}</td>
                        <td className={`px-5 py-3 font-medium ${ep.errorCount > 0 ? 'text-danger' : 'text-text-secondary'}`}>
                          {ep.errorCount}
                        </td>
                        <td className="px-5 py-3 text-text-secondary">{ep.p95LatencyMs.toFixed(0)}ms</td>
                        <td className="px-5 py-3">
                          <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}
