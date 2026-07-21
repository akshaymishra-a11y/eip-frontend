import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Icon, PageHeader, Pagination, StatusPill } from '../../components/ui';
import { RequestVolumeChart } from '../../components/charts/RequestVolumeChart';
import { DailyErrorTrendChart, type DailyErrorTrendPoint } from '../../components/charts/DailyErrorTrendChart';
import {
  classifyErrorSeverity,
  fetchApiMetrics,
  fetchErrorDailyTrend,
  fetchErrorGroupAffectedUserCount,
  fetchErrorGroupAiSummary,
  fetchErrorGroupOccurrences,
  fetchErrorGroups,
  fetchErrorRateAnomalies,
  fetchErrorSummary,
  fetchMigrationCorrelation,
  fetchTraces,
  generateErrorGroupAiSummary,
  generateErrorGroupRootCause,
  reopenErrorGroup,
  resolveErrorGroup,
  type ApiMetrics,
  type ErrorSeverity,
  type ErrorSummary,
} from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useProject } from '../../lib/project-context';
import type {
  ErrorEvent,
  ErrorGroup,
  ErrorGroupAiSummary,
  ErrorGroupStatus,
  ErrorRateAnomaly,
  MigrationCorrelation,
  TraceSummary,
} from '../../lib/types';

const PAGE_SIZE = 10;
const TRACE_MATCH_WINDOW_MS = 30_000;

const SEVERITY_STYLES: Record<ErrorSeverity, { dot: string; text: string; badgeBg: string; badgeText: string; label: string }> = {
  critical: { dot: 'bg-danger', text: 'text-danger', badgeBg: 'bg-danger-light', badgeText: 'text-danger', label: 'CRITICAL' },
  warning: { dot: 'bg-warning', text: 'text-warning', badgeBg: 'bg-warning-light', badgeText: 'text-warning', label: 'WARNING' },
  info: { dot: 'bg-primary', text: 'text-primary', badgeBg: 'bg-primary-light', badgeText: 'text-primary', label: 'INFO' },
};

const GROUP_STATUS_STYLES: Record<ErrorGroupStatus, { badgeBg: string; badgeText: string; label: string }> = {
  active: { badgeBg: 'bg-primary-light', badgeText: 'text-primary', label: 'ACTIVE' },
  resolved: { badgeBg: 'bg-success-light', badgeText: 'text-success', label: 'RESOLVED' },
  regressed: { badgeBg: 'bg-danger-light', badgeText: 'text-danger', label: 'REGRESSED' },
};

// error_events has no source_file path context beyond a long absolute path — showing just
// the last couple of segments (e.g. "services/payment.js") keeps the badge from wrapping.
function shortenPath(file: string) {
  const segments = file.split(/[\\/]/).filter(Boolean);
  return segments.slice(-2).join('/');
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : null;
}

function formatSecondsAfter(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

// Error Intelligence Phase 1 (P0): renders the "first appeared after release
// X" / "started N minutes after deployment" line from a group's denormalized
// first-seen snapshot (populated at ingest time, self-healed by
// backfill_error_group_deployment_links() when GitHub Deployments syncing
// lags an error's ingest) — no live RPC needed for this common case.
function FirstSeenReleaseLine({ group }: { group: ErrorGroup }) {
  const releaseLabel = group.first_seen_release_version || shortSha(group.first_seen_git_commit_sha);
  if (!releaseLabel && group.first_seen_deployment_id == null) {
    return <p className="text-[11px] text-text-muted mt-0.5">No release/deployment info reported for this error</p>;
  }
  return (
    <p className="text-[11px] text-text-muted mt-0.5">
      First appeared on {releaseLabel ?? 'unknown release'}
      {group.first_seen_deployment_id && group.first_seen_seconds_after_deploy != null && (
        <> — started {formatSecondsAfter(group.first_seen_seconds_after_deploy)} after deployment</>
      )}
    </p>
  );
}

function DeltaText({ value, format, goodWhen }: { value: number; format: (v: number) => string; goodWhen: 'up' | 'down' }) {
  const isUp = value > 0;
  const isGood = value === 0 || (goodWhen === 'up' ? isUp : !isUp);
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${isGood ? 'text-success' : 'text-danger'}`}>
      <Icon name={value === 0 ? 'trending_flat' : isUp ? 'arrow_upward' : 'arrow_downward'} className="text-[14px]" />
      {format(value)}
    </span>
  );
}

// Nearest same-service span within a short window is our best-effort stand-in for a real
// trace_id on error_events — the table doesn't record one directly (see supabase/schema.sql).
function findNearestTrace(event: { service_name: string; occurred_at: string }, traces: TraceSummary[]): string | null {
  const eventTime = new Date(event.occurred_at).getTime();
  let best: { traceId: string; diff: number } | null = null;
  for (const trace of traces) {
    if (trace.serviceName !== event.service_name || trace.status !== 'error') continue;
    const diff = Math.abs(new Date(trace.occurredAt).getTime() - eventTime);
    if (diff <= TRACE_MATCH_WINDOW_MS && (!best || diff < best.diff)) best = { traceId: trace.traceId, diff };
  }
  return best?.traceId ?? null;
}

function StatCard({
  label,
  icon,
  iconTone,
  danger,
  children,
}: {
  label: string;
  icon: string;
  iconTone: 'primary' | 'danger' | 'warning';
  danger?: boolean;
  children: ReactNode;
}) {
  const toneClasses: Record<'primary' | 'danger' | 'warning', string> = {
    primary: 'bg-primary-light text-primary',
    danger: 'bg-danger-light text-danger',
    warning: 'bg-warning-light text-warning',
  };
  // Plain div, not <Card>: Card hard-codes bg-surface, which loses the
  // cascade to bg-danger-light in Tailwind's generated stylesheet order —
  // appending it silently never tinted this card red for danger metrics.
  return (
    <div className={`rounded-lg shadow-sm p-5 border ${danger ? 'bg-danger-light border-danger/30' : 'bg-surface border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{label}</span>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${toneClasses[iconTone]}`}>
          <Icon name={icon} className="text-[16px]" />
        </div>
      </div>
      {children}
    </div>
  );
}

// Infrastructure state captured at the moment this specific error occurred
// (Error Intelligence Phase 1) — cheap, last-sampled snapshot from the SDK
// (see collector.js's sample/peek split), not a live re-read. Renders
// nothing if the SDK that reported this event predates Phase 1 and never
// sent any of these fields.
function InfraSnapshotLine({ event }: { event: ErrorEvent }) {
  const hasMetrics = event.cpu_percent != null || event.memory_used_mb != null || event.event_loop_lag_ms != null;
  const hasIdentity = !!(event.hostname || event.container_id || event.pod_name || event.ecs_task_arn || event.ecs_cluster_name);
  if (!hasMetrics && !hasIdentity) return null;
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 text-xs">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon name="memory" className="text-[14px] text-text-muted" />
        <span className="font-semibold text-text-primary">Infrastructure at error time</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 font-mono text-text-secondary">
        {event.cpu_percent != null && <span>CPU: {event.cpu_percent.toFixed(1)}%</span>}
        {event.memory_used_mb != null && (
          <span>
            Mem: {Math.round(event.memory_used_mb)}
            {event.memory_total_mb ? `/${Math.round(event.memory_total_mb)}` : ''} MB
          </span>
        )}
        {event.event_loop_lag_ms != null && <span>Loop lag: {event.event_loop_lag_ms.toFixed(1)}ms</span>}
        {event.hostname && <span className="truncate">Host: {event.hostname}</span>}
        {event.container_id && <span className="truncate">Container: {event.container_id.slice(0, 12)}</span>}
        {event.pod_name && <span className="truncate">Pod: {event.pod_name}</span>}
        {event.node_name && <span className="truncate">Node: {event.node_name}</span>}
        {event.namespace && <span className="truncate">Namespace: {event.namespace}</span>}
        {event.ecs_cluster_name && <span className="truncate">ECS Cluster: {event.ecs_cluster_name}</span>}
        {event.ecs_task_arn && <span className="truncate col-span-2 sm:col-span-3">ECS Task: {event.ecs_task_arn}</span>}
      </div>
    </div>
  );
}

// "Resolve / Reopen" action row — a routine engineering action any project
// member can take (see error_groups_update_member RLS policy), not
// admin-gated. Owner assignment was deliberately dropped (not part of this
// product's scope) — source-location context replaces it as the thing shown
// alongside these buttons, see SourceLocationLine below.
function GroupActions({
  group,
  currentUserId,
  onResolve,
  onReopen,
}: {
  group: ErrorGroup;
  currentUserId: string | undefined;
  onResolve: (group: ErrorGroup) => void;
  onReopen: (group: ErrorGroup) => void;
}) {
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {group.status === 'resolved' ? (
        <button
          type="button"
          onClick={() => onReopen(group)}
          className="h-7 px-2.5 rounded-md text-xs font-semibold text-primary border border-primary/30 hover:bg-primary-light"
        >
          Reopen
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onResolve(group)}
          disabled={!currentUserId}
          className="h-7 px-2.5 rounded-md text-xs font-semibold text-success border border-success/30 hover:bg-success-light disabled:opacity-50"
        >
          Resolve
        </button>
      )}
    </div>
  );
}

// Prominent source-location badge — where the error actually occurred in
// code. Replaces the owner-assignment control in the visual slot it used to
// occupy; this project cares about "which function/class threw it," not
// "who's assigned to it."
function SourceLocationLine({ group }: { group: ErrorGroup }) {
  if (!group.source_file && !group.source_function) return null;
  return (
    <div className="inline-flex items-center gap-1.5 text-xs font-mono bg-background border border-border rounded-md px-2 py-1 text-text-secondary">
      <Icon name="code" className="text-[14px] text-text-muted" />
      <span className="font-semibold text-text-primary">{group.source_function || '<anonymous>'}</span>
      {group.source_file && (
        <>
          <span className="text-text-muted">—</span>
          <span>
            {shortenPath(group.source_file)}
            {group.source_line ? `:${group.source_line}` : ''}
          </span>
        </>
      )}
    </div>
  );
}

// Error Intelligence Phase 1 (P0), gap fix: deployment correlation was
// supposed to also link errors to database migrations, not just
// deployments — fetched lazily per expanded group (not in the initial
// batch load) since it's a secondary detail, not needed for the list view.
function MigrationCorrelationLine({ group }: { group: ErrorGroup }) {
  const [correlation, setCorrelation] = useState<MigrationCorrelation | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setCorrelation(undefined);
    fetchMigrationCorrelation(group.id, group.first_seen_at).then((result) => {
      if (!cancelled) setCorrelation(result);
    });
    return () => {
      cancelled = true;
    };
  }, [group.id, group.first_seen_at]);

  if (correlation === undefined) return null; // still loading — avoid a flash of "no migration" before the query resolves
  if (!correlation) {
    return <p className="text-[11px] text-text-muted">No recent database migration detected before this error.</p>;
  }
  return (
    <p className="text-[11px] text-text-muted">
      Nearest migration: {correlation.migration_name} ({correlation.tool}) — applied {formatSecondsAfter(correlation.minutes_after * 60)} before
      this error first appeared
    </p>
  );
}

// Error Intelligence Phase 2 (Tier 2.1) — "N unique users affected" rollup,
// fetched lazily per expanded group like MigrationCorrelationLine above.
// Only meaningful once the host app opts into monitor.setUser() — renders
// nothing (not a "0 users" line) when the count is 0, since that's
// indistinguishable from "this app hasn't opted in yet" and a confident
// zero would be misleading.
function AffectedUserCountLine({ group }: { group: ErrorGroup }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCount(null);
    fetchErrorGroupAffectedUserCount(group.id).then((result) => {
      if (!cancelled) setCount(result);
    });
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  if (!count) return null;
  return (
    <p className="text-[11px] text-text-muted flex items-center gap-1">
      <Icon name="group" className="text-[13px]" />
      {count} unique user{count > 1 ? 's' : ''} affected
    </p>
  );
}

// Tier 5.4 (docs/PENDING_FEATURES_AND_ROADMAP.md): was a disabled "Coming
// Soon" placeholder marking the intended integration point for an AI
// service; now wired to a real one. Loads any cached summary on mount
// (error_group_ai_summaries, one row per group), and lets the user generate
// one on demand via the generate-error-summary Edge Function (Anthropic
// Messages API) if none exists yet. Untested against a real Anthropic API
// key — see that Edge Function's own header comment.
function AiSummaryCard({ group }: { group: ErrorGroup }) {
  const [summary, setSummary] = useState<ErrorGroupAiSummary | null | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(undefined);
    setError(null);
    fetchErrorGroupAiSummary(group.id).then((result) => {
      if (!cancelled) setSummary(result);
    });
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateErrorGroupAiSummary(group.id);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate AI summary');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-border bg-background/60 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon name="auto_awesome" className="text-[16px] text-primary" />
        <span className="text-xs font-semibold text-text-primary">AI Business Impact Summary</span>
      </div>
      {summary === undefined ? null : summary ? (
        <div>
          <p className="text-xs text-text-secondary mb-1.5">{summary.summary}</p>
          {summary.business_flow && (
            <p className="text-[11px] text-text-muted mb-2">
              Likely impacted flow: <span className="font-semibold text-text-secondary">{summary.business_flow}</span>
            </p>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="h-7 px-3 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs text-text-secondary mb-2">
            Summarize which business logic or user flow this error impacts — e.g. "This affects the checkout → payment confirmation flow" —
            based on the error's stack trace, affected service, and occurrence history.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="h-7 px-3 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Summarizing…' : 'Summarize with AI'}
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-danger mt-1.5">{error}</p>}
    </div>
  );
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-text-muted/10 text-text-muted',
};

// Error Intelligence Phase 3, narrow first slice — shares the same
// error_group_ai_summaries row as AiSummaryCard above (root_cause_hypothesis/
// contributing_factors/suggested_fix/confidence, see migration 0023), but is
// generated by a separate on-demand action, so this fetches and generates
// independently rather than sharing AiSummaryCard's state.
function RootCauseCard({ group }: { group: ErrorGroup }) {
  const [summary, setSummary] = useState<ErrorGroupAiSummary | null | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(undefined);
    setError(null);
    fetchErrorGroupAiSummary(group.id).then((result) => {
      if (!cancelled) setSummary(result);
    });
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateErrorGroupRootCause(group.id);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate root-cause analysis');
    } finally {
      setGenerating(false);
    }
  };

  const hasRootCause = summary?.root_cause_hypothesis;

  return (
    <div className="rounded-lg border border-dashed border-border bg-background/60 p-3 mt-2">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon name="troubleshoot" className="text-[16px] text-primary" />
        <span className="text-xs font-semibold text-text-primary">AI Root-Cause Analysis</span>
        {hasRootCause && summary?.confidence && (
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${CONFIDENCE_STYLE[summary.confidence]}`}>
            {summary.confidence} confidence
          </span>
        )}
      </div>
      {summary === undefined ? null : hasRootCause ? (
        <div>
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-0.5">Root cause</p>
          <p className="text-xs text-text-secondary mb-2">{summary!.root_cause_hypothesis}</p>

          {summary!.likely_culprit_function && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-0.5">Likely culprit</p>
              <code className="text-[11px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono">
                {summary!.likely_culprit_function}
                {summary!.likely_culprit_location && ` · ${summary!.likely_culprit_location}`}
              </code>
            </div>
          )}

          {summary!.contributing_factors.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-0.5">Contributing factors</p>
              <ul className="list-disc list-inside text-[11px] text-text-secondary">
                {summary!.contributing_factors.map((factor, i) => (
                  <li key={i}>{factor}</li>
                ))}
              </ul>
            </div>
          )}

          {summary!.suggested_fix && (
            <div className="mb-2 rounded-md bg-success/10 border border-success/20 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-success uppercase tracking-wide mb-0.5">Suggested fix</p>
              <p className="text-xs text-text-primary">{summary!.suggested_fix}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="h-7 px-3 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs text-text-secondary mb-2">
            Generate a technical root-cause hypothesis using this error's stack trace, nearest deployment/migration, and infrastructure state at
            the time it occurred.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="h-7 px-3 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Analyzing…' : 'Analyze Root Cause'}
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-danger mt-1.5">{error}</p>}
    </div>
  );
}

// Fetches occurrences for one group on demand (not embedded on ErrorGroup) —
// avoids loading every group's full occurrence list up front.
function GroupOccurrences({ groupId }: { groupId: string }) {
  const [occurrences, setOccurrences] = useState<ErrorEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchErrorGroupOccurrences(groupId, 0, 10).then(({ occurrences: rows }) => {
      if (!cancelled) setOccurrences(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (!occurrences) return <p className="text-xs text-text-secondary">Loading occurrences…</p>;
  const latest = occurrences[0];
  return (
    <div className="space-y-3">
      {latest?.stack && (
        <pre className="bg-secondary text-slate-100 rounded-md p-3 text-[11px] leading-relaxed overflow-x-auto max-h-52 font-mono">
          {latest.stack}
        </pre>
      )}
      {latest && <InfraSnapshotLine event={latest} />}
      <div>
        <p className="text-xs font-semibold text-text-secondary mb-1.5">Recent occurrences</p>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {occurrences.map((occ) => (
            <div key={occ.id} className="flex items-center justify-between gap-3 text-xs font-mono text-text-secondary">
              <span className="truncate">
                {occ.service_name} {occ.endpoint ? `:: ${occ.endpoint}` : ''}
                {occ.release_version || occ.git_commit_sha ? ` · ${occ.release_version || shortSha(occ.git_commit_sha)}` : ''}
              </span>
              <span className="shrink-0 text-text-muted">{timeAgo(occ.occurred_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ErrorDashboard() {
  const { project } = useProject();
  const { user } = useAuth();
  const [summary, setSummary] = useState<ErrorSummary | null>(null);
  const [apiMetrics, setApiMetrics] = useState<ApiMetrics | null>(null);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyErrorTrendPoint[]>([]);
  const [errorGroups, setErrorGroups] = useState<ErrorGroup[]>([]);
  const [anomalies, setAnomalies] = useState<ErrorRateAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [trendRangeHours, setTrendRangeHours] = useState<1 | 6 | 24>(24);
  const [severityFilter, setSeverityFilter] = useState<ErrorSeverity | 'all'>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [groupStatusFilter, setGroupStatusFilter] = useState<ErrorGroupStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const allGroupsRef = useRef<HTMLDivElement>(null);

  // "All Error Groups" renders much further down the page (below the events
  // table) — without this, clicking "View All" up in the Top Error Groups
  // panel silently revealed a whole new section off-screen with no visual
  // feedback that anything happened.
  useEffect(() => {
    if (showAllGroups) allGroupsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showAllGroups]);

  const load = useCallback(async () => {
    if (!project) return;
    const [errorData, apiData, traceData, dailyMetrics, groupsData, anomalyData] = await Promise.all([
      fetchErrorSummary(project.id),
      fetchApiMetrics(project.id),
      fetchTraces(project.id),
      fetchErrorDailyTrend(project.id, 30),
      fetchErrorGroups(project.id, {
        status: groupStatusFilter === 'all' ? undefined : groupStatusFilter,
        serviceName: serviceFilter === 'all' ? undefined : serviceFilter,
        pageSize: 100,
      }),
      fetchErrorRateAnomalies(project.id),
    ]);
    setSummary(errorData);
    setApiMetrics(apiData);
    setTraces(traceData);
    setDailyTrend(dailyMetrics.map((d) => ({ date: d.date, totalErrors: d.total_errors, criticalErrors: d.critical_errors })));
    setErrorGroups(groupsData.groups);
    setAnomalies(anomalyData);
  }, [project, groupStatusFilter, serviceFilter]);

  // Error Intelligence Phase 2 (Tier 2.6) — client-computed from the
  // already-fetched groups list, no extra query needed: a group flips to
  // 'regressed' automatically (see ingest_events()'s error branch) the
  // moment a resolved group sees a new occurrence, but nothing previously
  // surfaced *that this just happened* — this banner closes that gap.
  const regressedCount = useMemo(() => errorGroups.filter((g) => g.status === 'regressed').length, [errorGroups]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Best-effort "live" behavior: this is a polling dashboard, not a websocket stream —
  // refetch periodically so the "Live Connected" indicator reflects reality.
  useEffect(() => {
    if (!project) return;
    const interval = setInterval(() => load(), 15_000);
    return () => clearInterval(interval);
  }, [project, load]);

  const handleResolve = useCallback(
    async (group: ErrorGroup) => {
      if (!user) return;
      await resolveErrorGroup(group.id);
      load();
    },
    [user, load]
  );
  const handleReopen = useCallback(
    async (group: ErrorGroup) => {
      await reopenErrorGroup(group.id);
      load();
    },
    [load]
  );
  const trendData = useMemo(() => summary?.hourlyTrend.slice(24 - trendRangeHours) ?? [], [summary, trendRangeHours]);
  const spikeIndex = useMemo(() => {
    if (trendData.length < 2) return undefined;
    const max = Math.max(...trendData);
    const nonZero = trendData.filter((n) => n > 0);
    const median = nonZero.length ? nonZero.slice().sort((a, b) => a - b)[Math.floor(nonZero.length / 2)] : 0;
    if (max === 0 || max < median * 2) return undefined;
    return trendData.indexOf(max);
  }, [trendData]);
  const spikeHour = useMemo(() => {
    if (spikeIndex === undefined) return null;
    const hoursAgo = trendData.length - 1 - spikeIndex;
    const hour = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).getHours();
    return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
  }, [spikeIndex, trendData]);

  const serviceOptions = useMemo(
    () => Array.from(new Set((summary?.recent ?? []).map((e) => e.service_name))).sort(),
    [summary]
  );

  const filteredEvents = useMemo(
    () =>
      (summary?.recent ?? []).filter(
        (e) =>
          (severityFilter === 'all' || classifyErrorSeverity(e.error_name) === severityFilter) &&
          (serviceFilter === 'all' || e.service_name === serviceFilter)
      ),
    [summary, severityFilter, serviceFilter]
  );
  const pagedEvents = filteredEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Error Dashboard"
        subtitle={project ? `${project.environment.toUpperCase()} · real-time incident frequency and error health` : undefined}
      />

      {regressedCount > 0 && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger-light px-4 py-3 flex items-center gap-2">
          <Icon name="history" className="text-[18px] text-danger" />
          <span className="text-sm font-semibold text-danger">
            {regressedCount} previously-resolved error group{regressedCount > 1 ? 's have' : ' has'} regressed — reoccurring after being marked
            resolved.
          </span>
        </div>
      )}

      {anomalies.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning-light px-4 py-3 flex items-center gap-2">
          <Icon name="trending_up" className="text-[18px] text-warning" />
          <span className="text-sm font-semibold text-warning">
            Anomaly detected: today's error count ({anomalies[0].value.toFixed(0)}) is a statistical outlier vs. the trailing baseline (avg{' '}
            {anomalies[0].baseline_avg.toFixed(1)}, z-score {anomalies[0].z_score.toFixed(1)}).
          </span>
        </div>
      )}

      {!loading && (!summary || summary.recent.length === 0) ? (
        <Card>
          <EmptyState icon="bug_report" title="No errors reported" description="That's a good sign — or the SDK hasn't seen any yet." />
        </Card>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="Total Errors (24h)" icon="show_chart" iconTone="primary">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-text-primary">{summary.totalErrors24h.toLocaleString()}</span>
                <DeltaText value={summary.totalErrorsDeltaPct} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`} goodWhen="down" />
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Average: {Math.round(summary.avgErrorsPerDay).toLocaleString()} per 24h cycle
              </p>
            </StatCard>

            <StatCard label="Critical Errors" icon="priority_high" iconTone="danger" danger={summary.criticalErrors24h > 0}>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-bold ${summary.criticalErrors24h > 0 ? 'text-danger' : 'text-text-primary'}`}>
                  {summary.criticalErrors24h.toLocaleString()}
                </span>
                <DeltaText
                  value={summary.criticalErrorsDeltaCount}
                  format={(v) => `${v > 0 ? '+' : ''}${v} vs prior 24h`}
                  goodWhen="down"
                />
              </div>
              <p className={`text-xs mt-1 ${summary.criticalErrors24h > 0 ? 'text-danger font-medium' : 'text-text-secondary'}`}>
                {summary.criticalErrors24h > 0 ? 'Requires immediate engineering action' : 'No critical errors in the last 24 hours'}
              </p>
            </StatCard>

            <StatCard label="Error Rate (%)" icon="donut_large" iconTone="warning">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-text-primary">{(apiMetrics?.errorRatePct ?? 0).toFixed(2)}%</span>
                {apiMetrics && (
                  <DeltaText
                    value={apiMetrics.errorRateDeltaPct}
                    format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}
                    goodWhen="down"
                  />
                )}
              </div>
              <p className="text-xs text-text-secondary mt-1">SLA Threshold: 0.00%</p>
            </StatCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-text-primary">Error Trends</h2>
                <div className="inline-flex items-center gap-1 bg-background border border-border rounded-lg p-1">
                  {([1, 6, 24] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setTrendRangeHours(h)}
                      className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                        trendRangeHours === h ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {h}H
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-text-secondary mb-3">Real-time incident frequency across all services</p>
              <RequestVolumeChart data={trendData} highlightIndex={spikeIndex} />
              {spikeHour && (
                <p className="text-center text-xs font-semibold text-danger mt-2">{spikeHour} (SPIKE DETECTED)</p>
              )}
            </Card>

            <Card className="p-5 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-text-primary">Top Error Groups</h2>
                {errorGroups.length > 3 && (
                  <button type="button" onClick={() => setShowAllGroups((v) => !v)} className="text-xs font-semibold text-primary hover:underline">
                    {showAllGroups ? 'Show less' : 'View All'}
                  </button>
                )}
              </div>
              <div className="space-y-3 flex-1">
                {errorGroups.slice(0, 3).map((group) => {
                  const severity = classifyErrorSeverity(group.error_name);
                  const style = SEVERITY_STYLES[severity];
                  const statusStyle = GROUP_STATUS_STYLES[group.status];
                  return (
                    <div key={group.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badgeBg} ${style.badgeText}`}>
                            {style.label}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusStyle.badgeBg} ${statusStyle.badgeText}`}>
                            {statusStyle.label}
                          </span>
                        </div>
                        <span className="text-xs text-text-secondary shrink-0">{group.occurrence_count.toLocaleString()} occurrences</span>
                      </div>
                      <p className="font-semibold text-text-primary truncate">{group.error_name}</p>
                      {group.message && <p className="text-xs text-text-secondary truncate">{group.message}</p>}
                      <p className="text-xs text-text-muted truncate">Affected: {group.service_name}</p>
                      <div className="mt-1">
                        <SourceLocationLine group={group} />
                      </div>
                      <FirstSeenReleaseLine group={group} />
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">30-Day Trend</h2>
              <span className="text-xs text-text-secondary">Daily rollup — total errors vs. critical errors</span>
            </div>
            {dailyTrend.length > 0 ? (
              <DailyErrorTrendChart data={dailyTrend} />
            ) : (
              <p className="text-sm text-text-secondary py-8 text-center">
                No daily trend data yet — this fills in after the first nightly aggregation run.
              </p>
            )}
          </Card>

          <Card className="overflow-hidden mb-6">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Icon name="dns" className="text-[18px] text-text-secondary" />
                <h2 className="text-base font-semibold text-text-primary">Live Error Stream</h2>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill tone="success">Live Connected</StatusPill>
                <select
                  value={serviceFilter}
                  onChange={(e) => {
                    setServiceFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 px-2.5 bg-white border border-border rounded-md text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Services</option>
                  {serviceOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value as ErrorSeverity | 'all');
                    setPage(1);
                  }}
                  className="h-8 px-2.5 bg-white border border-border rounded-md text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-secondary uppercase tracking-wide border-b border-border">
                    <th className="px-5 py-2.5 font-semibold">Severity</th>
                    <th className="px-5 py-2.5 font-semibold">Timestamp</th>
                    <th className="px-5 py-2.5 font-semibold">Error Message</th>
                    <th className="px-5 py-2.5 font-semibold">Trace ID</th>
                    <th className="px-5 py-2.5 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedEvents.map((event) => {
                    const severity = classifyErrorSeverity(event.error_name);
                    const style = SEVERITY_STYLES[severity];
                    // Prefer the SDK's own W3C trace_id (Error Intelligence Phase 1) when
                    // present; fall back to the best-effort span-proximity match for
                    // events ingested by an older SDK that never reported one.
                    const traceId = event.trace_id || findNearestTrace(event, traces);
                    const isExpanded = expandedKey === event.id;
                    return (
                      <Fragment key={event.id}>
                        <tr
                          className="cursor-pointer hover:bg-background"
                          onClick={() => setExpandedKey(isExpanded ? null : event.id)}
                        >
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${style.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                              {style.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-text-secondary font-mono text-xs whitespace-nowrap">
                            {new Date(event.occurred_at).toLocaleString()}
                          </td>
                          <td className="px-5 py-3 max-w-md">
                            <p className="font-medium text-text-primary truncate">
                              {event.error_name}
                              {event.message ? `: ${event.message}` : ''}
                            </p>
                            <p className="text-xs text-text-secondary truncate">
                              Service: {event.service_name}
                              {(event.release_version || event.git_commit_sha) && (
                                <> · {event.release_version || shortSha(event.git_commit_sha)}{event.git_branch ? ` (${event.git_branch})` : ''}</>
                              )}
                            </p>
                          </td>
                          <td className="px-5 py-3">
                            {traceId ? (
                              <Link
                                to={`/projects/${project?.id}/traces/${traceId}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-mono text-xs bg-background border border-border rounded px-1.5 py-0.5 text-primary hover:underline"
                              >
                                {traceId.slice(0, 8)}
                              </Link>
                            ) : (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1">
                              {traceId && (
                                <Link
                                  to={`/projects/${project?.id}/traces/${traceId}`}
                                  onClick={(e) => e.stopPropagation()}
                                  title="View trace"
                                  className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:bg-border/40"
                                >
                                  <Icon name="visibility" className="text-[16px]" />
                                </Link>
                              )}
                              <button
                                type="button"
                                title="Copy error ID"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(event.id);
                                }}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:bg-border/40"
                              >
                                <Icon name="content_copy" className="text-[16px]" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (event.stack || event.cpu_percent != null || event.hostname) && (
                          <tr>
                            <td colSpan={5} className="px-5 pb-4 bg-background space-y-3">
                              {event.stack && (
                                <pre className="bg-secondary text-slate-100 rounded-md p-3 text-[11px] leading-relaxed overflow-x-auto max-h-52 font-mono">
                                  {event.stack}
                                </pre>
                              )}
                              <InfraSnapshotLine event={event} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={filteredEvents.length} onPageChange={setPage} />
            <p className="px-5 pb-4 text-xs text-text-secondary">
              Showing the most recent {summary.recent.length} events fetched · {summary.totalErrors24h.toLocaleString()} occurred in the
              last 24 hours.
            </p>
          </Card>

          {showAllGroups && (
            <div ref={allGroupsRef}>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-3">
                <h2 className="text-base font-semibold text-text-primary">All Error Groups</h2>
                <select
                  value={groupStatusFilter}
                  onChange={(e) => setGroupStatusFilter(e.target.value as ErrorGroupStatus | 'all')}
                  className="h-8 px-2.5 bg-white border border-border rounded-md text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="resolved">Resolved</option>
                  <option value="regressed">Regressed</option>
                </select>
              </div>
              <div className="divide-y divide-border">
                {errorGroups.map((group) => {
                  const isExpanded = expandedKey === group.id;
                  const statusStyle = GROUP_STATUS_STYLES[group.status];
                  return (
                    <div key={group.id} className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedKey(isExpanded ? null : group.id)}
                        className="w-full flex items-start gap-3 text-left"
                      >
                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_STYLES[classifyErrorSeverity(group.error_name)].dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-semibold text-text-primary truncate">{group.error_name}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${statusStyle.badgeBg} ${statusStyle.badgeText}`}>
                                {statusStyle.label}
                              </span>
                            </div>
                            <span className="text-xs text-text-secondary shrink-0">{timeAgo(group.last_seen_at)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 mt-0.5">
                            <span className="text-xs text-text-secondary truncate">{group.message || 'No message'}</span>
                            <span className="text-xs font-mono text-text-muted shrink-0">×{group.occurrence_count}</span>
                          </div>
                          <FirstSeenReleaseLine group={group} />
                        </div>
                        <Icon
                          name={isExpanded ? 'expand_less' : 'expand_more'}
                          className="text-text-muted text-[18px] shrink-0 mt-0.5"
                        />
                      </button>

                      <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                        <SourceLocationLine group={group} />
                        <GroupActions group={group} currentUserId={user?.id} onResolve={handleResolve} onReopen={handleReopen} />
                      </div>

                      {isExpanded && (
                        <div className="mt-3 ml-5 space-y-3">
                          <MigrationCorrelationLine group={group} />
                          <AffectedUserCountLine group={group} />
                          <AiSummaryCard group={group} />
                          <RootCauseCard group={group} />
                          <GroupOccurrences groupId={group.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {errorGroups.length === 0 && (
                  <p className="px-5 py-6 text-sm text-text-secondary text-center">No error groups match this filter.</p>
                )}
              </div>
            </Card>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
