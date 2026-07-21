import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Icon, KpiCard, PageHeader, StatusPill } from '../../components/ui';
import { ResourceTrendChart } from '../../components/charts/ResourceTrendChart';
import { DailyInfraTrendChart, type DailyInfraTrendPoint } from '../../components/charts/DailyInfraTrendChart';
import {
  fetchDbQueryMetrics,
  fetchInfraCpuTrend,
  fetchInfraDailyTrend,
  fetchLatestInfraSnapshots,
  fetchProjectActiveAlerts,
  type DbQueryMetrics,
} from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { AlertHistoryEntry, AlertType, InfraSnapshot } from '../../lib/types';

const alertTitle: Record<AlertType, string> = {
  high_cpu: 'High CPU Usage',
  high_memory: 'High Memory Usage',
  high_error_rate: 'Elevated Error Rate',
  high_latency: 'Elevated Latency',
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// Anything at/above this is flagged red in the slow-query list — matches the
// SDK's own wrapDatabase() default slowQueryThresholdMs so what's shown here
// lines up with what triggers a warn-level log for the same query.
const SLOW_QUERY_MS = 200;

function formatUptime(seconds: number | null) {
  if (seconds == null) return '—';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function barTone(pct: number) {
  if (pct >= 85) return 'bg-danger';
  if (pct >= 70) return 'bg-warning';
  return 'bg-success';
}

function textTone(pct: number) {
  if (pct >= 85) return 'text-danger';
  if (pct >= 70) return 'text-warning';
  return 'text-success';
}

export default function InfrastructureDashboard() {
  const { project } = useProject();
  const [snapshots, setSnapshots] = useState<InfraSnapshot[]>([]);
  const [dbMetrics, setDbMetrics] = useState<DbQueryMetrics | null>(null);
  const [cpuTrend, setCpuTrend] = useState<{ label: string; avgCpu: number }[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyInfraTrendPoint[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!project) return;
    const [infraData, dbData, trendData, alertData, dailyMetrics] = await Promise.all([
      fetchLatestInfraSnapshots(project.id),
      fetchDbQueryMetrics(project.id),
      fetchInfraCpuTrend(project.id),
      fetchProjectActiveAlerts(project.id),
      fetchInfraDailyTrend(project.id, 30),
    ]);
    setSnapshots(infraData);
    setDbMetrics(dbData);
    setCpuTrend(trendData);
    setActiveAlerts(alertData);
    setDailyTrend(
      dailyMetrics.map((d) => ({
        date: d.date,
        avgCpuPercent: d.avg_cpu_percent ?? 0,
        avgMemoryPercent: d.avg_memory_percent ?? 0,
        avgEventLoopLagMs: d.avg_event_loop_lag_ms ?? 0,
      }))
    );
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const avgCpu = snapshots.length ? snapshots.reduce((s, x) => s + (x.cpu_percent ?? 0), 0) / snapshots.length : 0;
  const avgMemPct = snapshots.length
    ? (snapshots.reduce((s, x) => s + (x.memory_total_mb ? (x.memory_used_mb ?? 0) / x.memory_total_mb : 0), 0) / snapshots.length) * 100
    : 0;
  const maxUptime = snapshots.length ? Math.max(...snapshots.map((s) => s.uptime_seconds ?? 0)) : null;
  const diskSamples = snapshots.filter((s) => s.disk_used_pct != null);
  const avgDiskPct = diskSamples.length ? diskSamples.reduce((s, x) => s + (x.disk_used_pct ?? 0), 0) / diskSamples.length : null;
  const lagSamples = snapshots.filter((s) => s.event_loop_lag_ms != null);
  const avgLag = lagSamples.length ? lagSamples.reduce((s, x) => s + (x.event_loop_lag_ms ?? 0), 0) / lagSamples.length : null;

  return (
    <>
      <PageHeader title="Infrastructure Dashboard" subtitle="CPU, memory, uptime, and per-service resource usage." />

      {!loading && snapshots.length === 0 ? (
        <Card>
          <EmptyState icon="dns" title="No infrastructure data yet" description="Once the SDK reports heartbeats, resource metrics will appear here." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            <KpiCard label="Avg CPU" value={`${avgCpu.toFixed(1)}%`} icon="memory" deltaTone={avgCpu >= 85 ? 'danger' : avgCpu >= 70 ? 'warning' : 'success'} />
            <KpiCard label="Avg Memory" value={`${avgMemPct.toFixed(1)}%`} icon="dns" deltaTone={avgMemPct >= 85 ? 'danger' : avgMemPct >= 70 ? 'warning' : 'success'} />
            <KpiCard label="Instances Reporting" value={snapshots.length} icon="hub" />
            <KpiCard label="Longest Uptime" value={formatUptime(maxUptime)} icon="schedule" />
            <KpiCard label="Disk Usage" value={avgDiskPct != null ? `${avgDiskPct.toFixed(1)}%` : '—'} icon="save" />
            <KpiCard label="Event Loop Lag" value={avgLag != null ? `${avgLag.toFixed(1)}ms` : '—'} icon="hourglass_bottom" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
            <Card className="lg:col-span-8 p-5">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-text-primary">Resource Trends</h2>
                <p className="text-xs text-text-secondary">Avg CPU across reporting services, last 24 hours</p>
              </div>
              <ResourceTrendChart data={cpuTrend} />
            </Card>

            <Card className="lg:col-span-4 p-5">
              <h2 className="text-base font-semibold text-text-primary mb-4">Incident Queue</h2>
              {activeAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-6 border border-dashed border-border rounded-lg text-center">
                  <Icon name="check_circle" className="text-success text-[24px]" />
                  <p className="text-xs text-text-secondary">All systems stable</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`border-l-4 rounded-md p-2.5 ${
                        alert.severity === 'critical' ? 'border-l-danger bg-danger/5' : 'border-l-warning bg-warning/5'
                      }`}
                    >
                      <p className="text-xs font-semibold text-text-primary">{alertTitle[alert.alert_type]}</p>
                      <p className="text-[11px] text-text-secondary mt-0.5">{alert.message}</p>
                      <span className="text-[11px] text-text-muted">{timeAgo(alert.triggered_at)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Link
                to="/alerts"
                className="mt-4 w-full flex items-center justify-center h-9 border border-border rounded-md text-sm font-medium text-text-primary hover:bg-background"
              >
                View Alert Console
              </Link>
            </Card>
          </div>

          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">30-Day Trend</h2>
              <span className="text-xs text-text-secondary">Daily rollup — avg CPU/memory (left) vs. event loop lag (right)</span>
            </div>
            {dailyTrend.length > 0 ? (
              <DailyInfraTrendChart data={dailyTrend} />
            ) : (
              <p className="text-sm text-text-secondary py-8 text-center">
                No daily trend data yet — this fills in after the first nightly aggregation run.
              </p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Services</h2>
            </div>
            <div className="divide-y divide-border">
              {snapshots.map((s) => {
                const memPct = s.memory_total_mb ? ((s.memory_used_mb ?? 0) / s.memory_total_mb) * 100 : 0;
                const cpuPct = s.cpu_percent ?? 0;
                const instanceLabel = s.pod_name || s.ecs_task_arn || s.container_id;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        {s.service_name}
                        {instanceLabel && <span className="ml-2 text-xs font-normal text-text-secondary">· {instanceLabel}</span>}
                      </div>
                      <div className="text-xs text-text-secondary">Uptime {formatUptime(s.uptime_seconds)}</div>
                    </div>
                    <div className="w-56 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-semibold ${textTone(cpuPct)}`}>{cpuPct.toFixed(1)}% CPU</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-background overflow-hidden">
                        <div className={`h-full rounded-full ${barTone(cpuPct)}`} style={{ width: `${Math.min(cpuPct, 100)}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-semibold ${textTone(memPct)}`}>{memPct.toFixed(1)}% Mem</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-background overflow-hidden">
                        <div className={`h-full rounded-full ${barTone(memPct)}`} style={{ width: `${Math.min(memPct, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {dbMetrics && dbMetrics.totalQueries > 0 && (
            <Card className="overflow-hidden mt-6">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-base font-semibold text-text-primary">Database Queries</h2>
                <span className="text-xs text-text-secondary">Last 24 hours</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 border-b border-border">
                <div>
                  <div className="text-xs text-text-secondary mb-1">Total Queries</div>
                  <div className="text-lg font-semibold text-text-primary">{dbMetrics.totalQueries}</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary mb-1">Avg Duration</div>
                  <div className="text-lg font-semibold text-text-primary">{dbMetrics.avgDurationMs.toFixed(0)}ms</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary mb-1">Failed</div>
                  <div className={`text-lg font-semibold ${dbMetrics.failedCount > 0 ? 'text-danger' : 'text-text-primary'}`}>
                    {dbMetrics.failedCount}
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-text-primary">Slowest Queries</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-secondary uppercase tracking-wide border-b border-border">
                    <th className="px-5 py-2.5 font-semibold">Query</th>
                    <th className="px-5 py-2.5 font-semibold">DB</th>
                    <th className="px-5 py-2.5 font-semibold">Duration</th>
                    <th className="px-5 py-2.5 font-semibold">Status</th>
                    <th className="px-5 py-2.5 font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dbMetrics.slowQueries.map((q) => (
                    <tr key={q.id}>
                      <td className="px-5 py-3 font-mono text-xs text-text-primary max-w-md truncate">{q.query_text ?? '—'}</td>
                      <td className="px-5 py-3 text-text-secondary">{q.db_type}</td>
                      <td className={`px-5 py-3 font-semibold ${q.duration_ms >= SLOW_QUERY_MS ? 'text-danger' : 'text-text-primary'}`}>
                        {q.duration_ms.toFixed(0)}ms
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill tone={q.success ? 'success' : 'danger'}>{q.success ? 'OK' : 'FAILED'}</StatusPill>
                      </td>
                      <td className="px-5 py-3 text-text-secondary">{new Date(q.occurred_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </>
  );
}
