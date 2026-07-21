import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Icon, PageHeader, StatusPill } from '../../components/ui';
import { fetchLogs, fetchTraceErrors, fetchTraceSpans } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { ErrorEvent, LogEntry, LogLevel, SpanRecord } from '../../lib/types';

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-text-muted bg-background',
  info: 'text-primary bg-primary-light',
  warn: 'text-warning bg-warning-light',
  error: 'text-danger bg-danger-light',
};

const KIND_ICON: Record<string, string> = {
  server: 'http',
  db: 'storage',
  cache: 'speed',
  external: 'public',
  internal: 'settings_ethernet',
};

const KIND_COLOR: Record<string, string> = {
  server: 'bg-primary',
  db: 'bg-warning',
  cache: 'bg-success',
  external: 'bg-secondary',
  internal: 'bg-text-muted',
};

export default function TraceDetails() {
  const { project } = useProject();
  const { traceId } = useParams<{ traceId: string }>();
  const [spans, setSpans] = useState<SpanRecord[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errors, setErrors] = useState<ErrorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!project || !traceId) return;
    const [spanData, logResult, errorData] = await Promise.all([
      fetchTraceSpans(project.id, traceId),
      fetchLogs(project.id, { traceId, pageSize: 50 }),
      fetchTraceErrors(project.id, traceId),
    ]);
    setSpans(spanData);
    setLogs(logResult.data);
    setErrors(errorData);
  }, [project, traceId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const waterfall = useMemo(() => {
    if (spans.length === 0) return { rows: [], totalMs: 0 };
    // occurred_at is recorded when a span *finishes*, so its start is
    // derived as occurred_at - duration_ms. Offsets below are relative to
    // the earliest computed start across all spans in the trace.
    const withStart = spans.map((s) => ({
      span: s,
      startMs: new Date(s.occurred_at).getTime() - s.duration_ms,
    }));
    const traceStart = Math.min(...withStart.map((s) => s.startMs));
    const traceEnd = Math.max(...withStart.map((s) => s.startMs + s.span.duration_ms));
    const totalMs = Math.max(1, traceEnd - traceStart);
    const rows = withStart
      .map(({ span, startMs }) => ({ span, offsetMs: startMs - traceStart }))
      .sort((a, b) => a.offsetMs - b.offsetMs);
    return { rows, totalMs };
  }, [spans]);

  const root = spans.find((s) => !s.parent_span_id);

  return (
    <>
      <div className="mb-2">
        <Link to={`/projects/${project?.id}/traces`} className="text-sm text-text-secondary hover:text-text-primary inline-flex items-center gap-1">
          <Icon name="arrow_back" className="text-[16px]" />
          Back to Traces
        </Link>
      </div>
      <PageHeader
        title={root ? root.name : 'Trace Details'}
        subtitle={traceId ? `Trace ID: ${traceId}` : undefined}
      />

      {!loading && spans.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-sm text-text-secondary">Trace not found or has no spans.</div>
        </Card>
      ) : (
        <>
          {errors.length > 0 && (
            <div className="mb-6 rounded-lg border border-danger/30 bg-danger-light px-4 py-3 flex items-center gap-2">
              <Icon name="error" className="text-[18px] text-danger" />
              <span className="text-sm font-semibold text-danger">
                {errors.length} error{errors.length > 1 ? 's' : ''} occurred in this trace
              </span>
            </div>
          )}

          <Card className="p-5 mb-6">
            <h2 className="text-base font-semibold text-text-primary mb-4">Waterfall</h2>
            <div className="space-y-2">
              {waterfall.rows.map(({ span, offsetMs }) => {
                const leftPct = (offsetMs / waterfall.totalMs) * 100;
                const widthPct = Math.max(0.5, (span.duration_ms / waterfall.totalMs) * 100);
                return (
                  <div key={span.id} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 flex items-center gap-1.5 text-xs text-text-secondary truncate">
                      <Icon name={KIND_ICON[span.kind] ?? 'settings_ethernet'} className="text-[14px]" />
                      <span className="truncate">{span.name}</span>
                    </div>
                    <div className="flex-1 relative h-5 bg-background rounded">
                      <div
                        className={`absolute top-0 h-5 rounded ${KIND_COLOR[span.kind] ?? 'bg-text-muted'} ${
                          span.status === 'error' ? 'ring-2 ring-danger' : ''
                        }`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        title={`${span.name} — ${span.duration_ms}ms`}
                      />
                    </div>
                    <div className="w-16 shrink-0 text-right text-xs font-medium text-text-primary">{span.duration_ms.toFixed(0)}ms</div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Spans ({spans.length})</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-secondary uppercase tracking-wide border-b border-border">
                  <th className="px-5 py-2.5 font-semibold">Kind</th>
                  <th className="px-5 py-2.5 font-semibold">Name</th>
                  <th className="px-5 py-2.5 font-semibold">Service</th>
                  <th className="px-5 py-2.5 font-semibold">Target</th>
                  <th className="px-5 py-2.5 font-semibold">Duration</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {spans.map((span) => (
                  <tr key={span.id}>
                    <td className="px-5 py-3 text-text-secondary capitalize">{span.kind}</td>
                    <td className="px-5 py-3 font-mono text-text-primary">{span.name}</td>
                    <td className="px-5 py-3 text-text-secondary">{span.service_name}</td>
                    <td className="px-5 py-3 text-text-secondary">{span.target ?? '—'}</td>
                    <td className="px-5 py-3 text-text-primary font-medium">{span.duration_ms.toFixed(0)}ms</td>
                    <td className="px-5 py-3">
                      <StatusPill tone={span.status === 'error' ? 'danger' : 'success'}>{span.status.toUpperCase()}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {errors.length > 0 && (
            <Card className="overflow-hidden mt-6">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <Icon name="error" className="text-[18px] text-danger" />
                <h2 className="text-base font-semibold text-text-primary">Errors ({errors.length})</h2>
              </div>
              <div className="divide-y divide-border">
                {errors.map((err) => {
                  const isExpanded = expandedErrorId === err.id;
                  return (
                    <div key={err.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedErrorId(isExpanded ? null : err.id)}
                        className="w-full flex items-start justify-between gap-3 px-5 py-3 text-left hover:bg-background"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-danger truncate">
                            {err.error_name}
                            {err.message ? `: ${err.message}` : ''}
                          </p>
                          <p className="text-xs text-text-secondary truncate">
                            {err.service_name}
                            {err.endpoint ? ` · ${err.endpoint}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-text-muted shrink-0 font-mono">{new Date(err.occurred_at).toLocaleString()}</span>
                      </button>
                      {isExpanded && err.stack && (
                        <div className="px-5 pb-4">
                          <pre className="bg-secondary text-slate-100 rounded-md p-3 text-[11px] leading-relaxed overflow-x-auto max-h-52 font-mono">
                            {err.stack}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {logs.length > 0 && (
            <Card className="overflow-hidden mt-6">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="text-base font-semibold text-text-primary">Related Logs ({logs.length})</h2>
              </div>
              <div className="divide-y divide-border font-mono text-xs">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded font-sans font-bold text-[10px] uppercase ${LEVEL_CLASS[log.level]}`}>
                      {log.level}
                    </span>
                    <span className="text-text-muted shrink-0">{new Date(log.occurred_at).toLocaleString()}</span>
                    <span className="text-text-secondary shrink-0">{log.service_name}</span>
                    <span className="text-text-primary flex-1 min-w-0 break-words">{log.message}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
