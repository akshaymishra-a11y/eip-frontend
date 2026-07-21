import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, KpiCard, PageHeader, Pagination, StatusPill } from '../../components/ui';
import { Loader } from '../../components/Loader';
import { LatencyHistogramChart } from '../../components/charts/LatencyHistogramChart';
import { fetchTraces } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { TraceSummary } from '../../lib/types';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const PAGE_SIZE = 20;

const LATENCY_BUCKET_EDGES = [50, 100, 150, 200, 250];

function buildLatencyBuckets(durations: number[]) {
  const counts = new Array(LATENCY_BUCKET_EDGES.length + 1).fill(0);
  for (const duration of durations) {
    const bucketIndex = LATENCY_BUCKET_EDGES.findIndex((edge) => duration < edge);
    counts[bucketIndex === -1 ? LATENCY_BUCKET_EDGES.length : bucketIndex] += 1;
  }
  return counts.map((count, i) => ({
    label:
      i === 0
        ? `0-${LATENCY_BUCKET_EDGES[0]}ms`
        : i === LATENCY_BUCKET_EDGES.length
          ? `${LATENCY_BUCKET_EDGES[i - 1]}ms+`
          : `${LATENCY_BUCKET_EDGES[i - 1]}-${LATENCY_BUCKET_EDGES[i]}ms`,
    count,
  }));
}

export default function TracesDashboard() {
  const { project } = useProject();
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!project) return;
    const data = await fetchTraces(project.id);
    setTraces(data);
  }, [project]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    load().finally(() => setLoading(false));
  }, [load]);

  const errorCount = traces.filter((t) => t.status === 'error').length;
  const avgDuration = traces.length ? traces.reduce((s, t) => s + t.durationMs, 0) / traces.length : 0;
  const pagedTraces = useMemo(() => traces.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [traces, page]);

  return (
    <>
      <PageHeader title="Traces Dashboard" subtitle="Request-level traces captured within this process, last 24 hours." />

      {loading ? (
        <Loader fullScreen={false} messages={['Loading traces...', 'Grouping spans by trace ID...']} />
      ) : traces.length === 0 ? (
        <Card>
          <EmptyState
            icon="route"
            title="No traces yet"
            description="Traces appear here once the SDK's middleware starts handling requests for this project."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KpiCard label="Traces (24h)" value={traces.length} icon="route" />
            <KpiCard label="Avg Root Duration" value={`${avgDuration.toFixed(0)}ms`} icon="timer" />
            <KpiCard label="Traces with Errors" value={errorCount} icon="error" deltaTone={errorCount > 0 ? 'danger' : 'success'} />
          </div>

          <Card className="p-5 mb-6">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-text-primary">Latency Distribution</h2>
              <p className="text-xs text-text-secondary">Root span duration, last 24 hours</p>
            </div>
            <LatencyHistogramChart data={buildLatencyBuckets(traces.map((t) => t.durationMs))} />
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Recent Traces</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-secondary uppercase tracking-wide border-b border-border">
                  <th className="px-5 py-2.5 font-semibold">Root</th>
                  <th className="px-5 py-2.5 font-semibold">Service</th>
                  <th className="px-5 py-2.5 font-semibold">Duration</th>
                  <th className="px-5 py-2.5 font-semibold">Spans</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedTraces.map((trace) => (
                  <tr key={trace.traceId}>
                    <td className="px-5 py-3">
                      <Link
                        to={`/projects/${project?.id}/traces/${trace.traceId}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {trace.rootName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-text-secondary">{trace.serviceName}</td>
                    <td className="px-5 py-3 text-text-primary font-medium">{trace.durationMs.toFixed(0)}ms</td>
                    <td className="px-5 py-3 text-text-secondary">{trace.spanCount}</td>
                    <td className="px-5 py-3">
                      <StatusPill tone={trace.status === 'error' ? 'danger' : 'success'}>{trace.status.toUpperCase()}</StatusPill>
                    </td>
                    <td className="px-5 py-3 text-text-secondary">{timeAgo(trace.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={traces.length} onPageChange={setPage} />
          </Card>
        </>
      )}
    </>
  );
}
