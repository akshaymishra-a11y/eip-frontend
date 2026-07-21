import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Icon, KpiCard, PageHeader, StatusPill } from '../../components/ui';
import { fetchJiraIssues, fetchJiraSprints } from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { JiraIssue, JiraSprint } from '../../lib/types';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

// resolved_at_source is Jira's own resolution timestamp — the primary signal
// for "done". The status-name fallback covers instances/workflows where a
// custom "Done"-like status is reached without Jira ever populating
// resolutiondate (not every workflow sets a resolution).
const DONE_STATUSES = new Set(['done', 'closed', 'resolved']);

function isIssueDone(issue: JiraIssue): boolean {
  if (issue.resolved_at_source) return true;
  return issue.status ? DONE_STATUSES.has(issue.status.toLowerCase()) : false;
}

function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

// Purely categorical column-header dot color (todo/in-progress/done reads as
// neutral/warning/success) — a loose keyword match since Jira status names
// are free-form per project/workflow, not an enum this app controls.
const STATUS_COLUMN_TONE: Array<{ match: RegExp; tone: StatusTone }> = [
  { match: /done|closed|resolved/i, tone: 'success' },
  { match: /progress|review|testing/i, tone: 'warning' },
  { match: /block|fail/i, tone: 'danger' },
];

function statusTone(status: string): StatusTone {
  return STATUS_COLUMN_TONE.find((s) => s.match.test(status))?.tone ?? 'neutral';
}

const STATUS_DOT_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-text-muted',
};

export default function DeliveryHealthDashboard() {
  const { project } = useProject();
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!project) return;
    const [issuesRes, sprintsRes] = await Promise.allSettled([fetchJiraIssues(project.id), fetchJiraSprints(project.id)]);
    if (issuesRes.status === 'fulfilled') setIssues(issuesRes.value);
    else console.error('[DeliveryHealthDashboard] fetchJiraIssues failed:', issuesRes.reason);
    if (sprintsRes.status === 'fulfilled') setSprints(sprintsRes.value);
    else console.error('[DeliveryHealthDashboard] fetchJiraSprints failed:', sprintsRes.reason);
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Jira issue/sprint data syncs on poll-jira's ~15-30 min cron cadence — a
  // lighter poll than the telemetry dashboards, same as DeliveryDashboard's
  // GitHub-backed data.
  useEffect(() => {
    if (!project) return;
    const interval = setInterval(() => load(), 30_000);
    return () => clearInterval(interval);
  }, [project, load]);

  // Prefer the most-recently-started active sprint; if none is active (e.g.
  // between sprints, or a Kanban-only board with no sprints at all), fall
  // back to the most recently completed one so the view isn't just empty.
  const currentSprint = useMemo(() => {
    const active = sprints.filter((s) => s.state === 'active');
    if (active.length > 0) return active[0];
    const closed = sprints.filter((s) => s.state === 'closed' && s.complete_date);
    return closed[0] ?? null;
  }, [sprints]);

  // Issues are matched to the current sprint by name (jira_issues.sprint_name
  // is a denormalized text field synced from Jira's own custom sprint field,
  // not a foreign key to jira_sprints — see poll-jira/index.ts's
  // extractSprintName for why that field is inherently a best-effort parse).
  const sprintIssues = useMemo(() => {
    if (!currentSprint?.name) return [];
    return issues.filter((i) => i.sprint_name === currentSprint.name);
  }, [issues, currentSprint]);

  const columns = useMemo(() => {
    const groups = new Map<string, JiraIssue[]>();
    for (const issue of sprintIssues) {
      const key = issue.status ?? 'Unknown';
      const list = groups.get(key) ?? [];
      list.push(issue);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sprintIssues]);

  const burndown = useMemo(() => {
    const totalIssues = sprintIssues.length;
    const resolvedIssues = sprintIssues.filter(isIssueDone).length;
    const totalPoints = sprintIssues.reduce((sum, i) => sum + (i.story_points ?? 0), 0);
    const completedPoints = sprintIssues.filter(isIssueDone).reduce((sum, i) => sum + (i.story_points ?? 0), 0);
    return { totalIssues, resolvedIssues, totalPoints, completedPoints };
  }, [sprintIssues]);

  const hasAnyData = issues.length > 0 || sprints.length > 0;

  return (
    <>
      <PageHeader
        title="Delivery Health"
        subtitle={project ? `${project.environment.toUpperCase()} · Jira issue and sprint health (read-only sync)` : undefined}
      />

      {!loading && !hasAnyData ? (
        <Card>
          <EmptyState
            icon="task_alt"
            title="No Jira data yet"
            description="Connect a Jira Cloud site from Project Settings → Integrations and the platform polls it automatically (issues + sprints, read-only — no write-back to Jira) — no CI/CLI step needed."
            action={
              project ? (
                <Link to={`/projects/${project.id}/settings`} className="text-sm font-semibold text-primary hover:underline">
                  Go to Settings →
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Active/Recent Sprint"
              value={currentSprint?.name ?? '—'}
              icon="directions_run"
              hint={currentSprint ? (currentSprint.state ?? undefined) : 'No sprint synced yet'}
            />
            <KpiCard
              label="Issues Resolved"
              value={`${burndown.resolvedIssues} / ${burndown.totalIssues}`}
              icon="check_circle"
              deltaTone={burndown.totalIssues > 0 && burndown.resolvedIssues === burndown.totalIssues ? 'success' : 'neutral'}
              hint={currentSprint ? 'In current sprint' : undefined}
            />
            <KpiCard
              label="Story Points"
              value={`${burndown.completedPoints} / ${burndown.totalPoints}`}
              icon="trending_up"
              hint="Completed vs total in sprint"
            />
            <KpiCard
              label="Total Jira Issues"
              value={issues.length}
              icon="confirmation_number"
              hint={`${sprints.length} sprint${sprints.length === 1 ? '' : 's'} synced`}
            />
          </div>

          {!currentSprint ? (
            <Card className="p-5 flex items-center gap-4 flex-wrap">
              <div className="w-9 h-9 rounded-lg bg-background text-text-muted flex items-center justify-center shrink-0">
                <Icon name="event_busy" className="text-[18px]" />
              </div>
              <p className="text-sm text-text-secondary flex-1 min-w-[200px]">
                No active or closed sprint found yet — this board may be Kanban-only, or sprints haven't synced.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-primary-light text-primary">
                    <Icon name="view_kanban" className="text-[17px]" />
                  </div>
                  <h2 className="text-base font-semibold text-text-primary">{currentSprint.name}</h2>
                  <StatusPill tone={currentSprint.state === 'active' ? 'success' : 'neutral'}>
                    {currentSprint.state ?? 'unknown'}
                  </StatusPill>
                  {currentSprint.goal && <span className="text-xs text-text-secondary">{currentSprint.goal}</span>}
                </div>
                <p className="text-xs text-text-secondary mt-1.5 ml-11">
                  {formatDate(currentSprint.start_date)} – {formatDate(currentSprint.end_date)}
                </p>
              </div>

              {columns.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon="view_kanban"
                    title="No issues in this sprint yet"
                    description="Issues will appear here once poll-jira syncs them."
                  />
                </div>
              ) : (
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {columns.map(([status, statusIssues]) => {
                    const tone = statusTone(status);
                    return (
                      <div key={status} className="border border-border rounded-lg overflow-hidden">
                        <div className="px-3 py-2 border-b border-border bg-background/60 flex items-center justify-between">
                          <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_CLASSES[tone]}`} />
                            {status}
                          </span>
                          <span className="text-xs text-text-secondary bg-surface rounded-full px-2 py-0.5">
                            {statusIssues.length}
                          </span>
                        </div>
                        <div className="divide-y divide-border max-h-96 overflow-y-auto">
                          {statusIssues.map((issue) => (
                            <div key={issue.id} className="p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-mono text-text-muted">{issue.jira_key}</span>
                                {issue.story_points != null && (
                                  <span className="text-[10px] font-semibold bg-primary-light text-primary rounded-full px-1.5 py-0.5">
                                    {issue.story_points} pt{issue.story_points === 1 ? '' : 's'}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-text-primary mt-1 line-clamp-2">{issue.summary ?? '(no summary)'}</p>
                              <div className="flex items-center gap-2 mt-2 text-[11px] text-text-secondary flex-wrap">
                                {issue.issue_type && <span>{issue.issue_type}</span>}
                                {issue.assignee && <span>· {issue.assignee}</span>}
                                {issue.priority && <span>· {issue.priority}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-50 text-amber-600">
                <Icon name="history" className="text-[17px]" />
              </div>
              <h2 className="text-base font-semibold text-text-primary">All Synced Sprints</h2>
              <span className="text-xs font-semibold text-text-secondary bg-background rounded-full px-2 py-0.5">
                {sprints.length}
              </span>
            </div>
            {sprints.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="history"
                  title="No sprints synced yet"
                  description="Sprint history from the configured Jira board will appear here."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-secondary uppercase tracking-wide border-b border-border">
                      <th className="px-5 py-2.5 font-semibold">Sprint</th>
                      <th className="px-5 py-2.5 font-semibold">State</th>
                      <th className="px-5 py-2.5 font-semibold">Start</th>
                      <th className="px-5 py-2.5 font-semibold">End</th>
                      <th className="px-5 py-2.5 font-semibold">Synced</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sprints.map((sprint) => (
                      <tr key={sprint.id} className="hover:bg-background/60 transition-colors">
                        <td className="px-5 py-3 font-medium text-text-primary">{sprint.name}</td>
                        <td className="px-5 py-3">
                          <StatusPill tone={sprint.state === 'active' ? 'success' : 'neutral'}>
                            {sprint.state ?? 'unknown'}
                          </StatusPill>
                        </td>
                        <td className="px-5 py-3 text-text-secondary text-xs">{formatDate(sprint.start_date)}</td>
                        <td className="px-5 py-3 text-text-secondary text-xs">{formatDate(sprint.end_date)}</td>
                        <td className="px-5 py-3 text-text-secondary text-xs">{timeAgo(sprint.last_synced_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
