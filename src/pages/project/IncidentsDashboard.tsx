import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, PageHeader } from '../../components/ui';
import {
  attachIncidentErrorGroup,
  createIncident,
  detachIncidentErrorGroup,
  fetchErrorGroups,
  fetchIncidentErrorGroups,
  fetchIncidents,
  fetchIncidentTimeline,
  updateIncidentStatus,
  type LinkedErrorGroup,
} from '../../lib/api';
import { describeSupabaseError } from '../../lib/errors';
import { useProject } from '../../lib/project-context';
import type { ErrorGroup, Incident, IncidentSeverity, IncidentStatus, IncidentTimelineEvent } from '../../lib/types';

const STATUS_ORDER: IncidentStatus[] = ['open', 'investigating', 'monitoring', 'resolved'];

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

// Mirrors GROUP_STATUS_STYLES' custom-badge convention in ErrorDashboard.tsx
// rather than the shared StatusPill component — StatusPill's tone enum
// (success/warning/danger/neutral) has no "primary" option, and this needs
// four visually distinct tones for four lifecycle states.
const STATUS_STYLES: Record<IncidentStatus, { badgeBg: string; badgeText: string }> = {
  open: { badgeBg: 'bg-danger-light', badgeText: 'text-danger' },
  investigating: { badgeBg: 'bg-primary-light', badgeText: 'text-primary' },
  monitoring: { badgeBg: 'bg-warning-light', badgeText: 'text-warning' },
  resolved: { badgeBg: 'bg-success-light', badgeText: 'text-success' },
};

const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const SEVERITY_STYLES: Record<IncidentSeverity, { dot: string; badgeBg: string; badgeText: string }> = {
  critical: { dot: 'bg-danger', badgeBg: 'bg-danger-light', badgeText: 'text-danger' },
  high: { dot: 'bg-warning', badgeBg: 'bg-warning-light', badgeText: 'text-warning' },
  medium: { dot: 'bg-primary', badgeBg: 'bg-primary-light', badgeText: 'text-primary' },
  low: { dot: 'bg-text-muted', badgeBg: 'bg-background', badgeText: 'text-text-secondary' },
};

const TIMELINE_ICONS: Record<IncidentTimelineEvent['event_type'], string> = {
  created: 'flag',
  status_changed: 'sync_alt',
  error_group_linked: 'link',
  error_group_unlinked: 'link_off',
  comment: 'chat_bubble',
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badgeBg} ${style.badgeText}`}>
      {STATUS_LABELS[status].toUpperCase()}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const style = SEVERITY_STYLES[severity];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badgeBg} ${style.badgeText}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {SEVERITY_LABELS[severity].toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Create-incident inline form
// ---------------------------------------------------------------------------
function CreateIncidentForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { project } = useProject();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!project || !title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createIncident(project.id, { title: title.trim(), description: description.trim() || undefined, severity });
      onCreated();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not create incident.'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="p-5 mb-6">
      <h2 className="text-base font-semibold text-text-primary mb-4">New Incident</h2>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide" htmlFor="incidentTitle">
            Title <span className="text-danger">*</span>
          </label>
          <input
            id="incidentTitle"
            required
            placeholder="e.g. Checkout payment failures spiking"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide" htmlFor="incidentDescription">
            Description <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            id="incidentDescription"
            rows={3}
            placeholder="What's happening, and who's aware so far…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide" htmlFor="incidentSeverity">
            Severity
          </label>
          <select
            id="incidentSeverity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            className="h-10 px-2.5 bg-white border border-border rounded-md text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button variant="primary" type="button" disabled={!title.trim() || creating} onClick={handleSubmit}>
            {creating ? 'Creating…' : 'Create Incident'}
          </Button>
          <Button variant="secondary" type="button" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Detail panel for one expanded incident: status control, linked error
// groups (+ attach control), and chronological timeline. Lazily loaded on
// expand, same pattern as GroupOccurrences in ErrorDashboard.tsx.
// ---------------------------------------------------------------------------
function IncidentDetailPanel({
  incident,
  projectId,
  onChanged,
}: {
  incident: Incident;
  projectId: string;
  onChanged: () => void;
}) {
  const [linkedGroups, setLinkedGroups] = useState<LinkedErrorGroup[] | null>(null);
  const [timeline, setTimeline] = useState<IncidentTimelineEvent[] | null>(null);
  const [availableGroups, setAvailableGroups] = useState<Pick<ErrorGroup, 'id' | 'error_name' | 'occurrence_count'>[]>([]);
  const [attachSelection, setAttachSelection] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [linked, events] = await Promise.all([fetchIncidentErrorGroups(incident.id), fetchIncidentTimeline(incident.id)]);
    setLinkedGroups(linked);
    setTimeline(events);
  }, [incident.id]);

  useEffect(() => {
    setLinkedGroups(null);
    setTimeline(null);
    reload();
  }, [reload]);

  // All of the project's error groups, for the "attach" dropdown — filtered
  // client-side against whatever's already linked (linkedGroups), so this
  // only needs to be fetched once per project rather than re-fetched on
  // every link/unlink.
  useEffect(() => {
    let cancelled = false;
    fetchErrorGroups(projectId, { pageSize: 200 }).then(({ groups }) => {
      if (!cancelled) setAvailableGroups(groups);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const linkedIds = useMemo(() => new Set((linkedGroups ?? []).map((g) => g.id)), [linkedGroups]);
  const attachOptions = useMemo(() => availableGroups.filter((g) => !linkedIds.has(g.id)), [availableGroups, linkedIds]);

  const handleStatusChange = async (newStatus: IncidentStatus) => {
    if (newStatus === incident.status) return;
    setBusy(true);
    setActionError(null);
    try {
      await updateIncidentStatus(incident.id, newStatus);
      onChanged();
      reload();
    } catch (err) {
      setActionError(describeSupabaseError(err, 'Could not update status.'));
    } finally {
      setBusy(false);
    }
  };

  const handleAttach = async () => {
    if (!attachSelection) return;
    setBusy(true);
    setActionError(null);
    try {
      await attachIncidentErrorGroup(incident.id, attachSelection);
      setAttachSelection('');
      reload();
    } catch (err) {
      setActionError(describeSupabaseError(err, 'Could not attach error group.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDetach = async (group: LinkedErrorGroup) => {
    setBusy(true);
    setActionError(null);
    try {
      await detachIncidentErrorGroup(incident.id, group.id);
      reload();
    } catch (err) {
      setActionError(describeSupabaseError(err, 'Could not unlink error group.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 ml-5 space-y-4">
      {incident.description && <p className="text-sm text-text-secondary">{incident.description}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-text-secondary">Status:</span>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy || s === incident.status}
            onClick={() => handleStatusChange(s)}
            className={`h-7 px-2.5 rounded-md text-xs font-semibold border transition-colors disabled:cursor-default ${
              s === incident.status
                ? `${STATUS_STYLES[s].badgeBg} ${STATUS_STYLES[s].badgeText} border-transparent`
                : 'border-border text-text-secondary hover:bg-background'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {actionError && <p className="text-xs text-danger">{actionError}</p>}

      <div>
        <p className="text-xs font-semibold text-text-secondary mb-1.5">Linked Error Groups</p>
        {linkedGroups === null ? (
          <p className="text-xs text-text-secondary">Loading…</p>
        ) : linkedGroups.length === 0 ? (
          <p className="text-xs text-text-muted">No error groups linked yet.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
            {linkedGroups.map((group) => (
              <div key={group.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <Link to={`/projects/${projectId}/errors`} className="min-w-0 flex-1 hover:underline">
                  <span className="font-medium text-text-primary truncate block">{group.error_name}</span>
                  <span className="text-xs text-text-secondary truncate block">
                    {group.service_name} · {group.occurrence_count.toLocaleString()} occurrences
                    {group.message ? ` · ${group.message}` : ''}
                  </span>
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDetach(group)}
                  title="Unlink from this incident"
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-danger"
                >
                  <Icon name="link_off" className="text-[16px]" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-2">
          <select
            value={attachSelection}
            onChange={(e) => setAttachSelection(e.target.value)}
            className="flex-1 h-9 px-2.5 bg-white border border-border rounded-md text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Attach an existing error group…</option>
            {attachOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.error_name} ({g.occurrence_count.toLocaleString()} occurrences)
              </option>
            ))}
          </select>
          <Button variant="secondary" type="button" disabled={!attachSelection || busy} onClick={handleAttach} className="h-9 px-3 text-xs">
            Attach
          </Button>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-secondary mb-1.5">Timeline</p>
        {timeline === null ? (
          <p className="text-xs text-text-secondary">Loading…</p>
        ) : (
          <div className="space-y-2">
            {timeline.map((event) => (
              <div key={event.id} className="flex items-start gap-2 text-xs">
                <Icon name={TIMELINE_ICONS[event.event_type]} className="text-[14px] text-text-muted mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-text-primary">{event.message}</span>
                  <span className="text-text-muted ml-2">{timeAgo(event.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function IncidentsDashboard() {
  const { project } = useProject();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!project) return;
    const data = await fetchIncidents(project.id);
    setIncidents(data);
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <>
      <PageHeader
        title="Incidents"
        subtitle={project ? `${project.environment.toUpperCase()} · coordinated response tracking for grouped errors` : undefined}
        actions={
          !showCreateForm && (
            <Button variant="primary" type="button" onClick={() => setShowCreateForm(true)}>
              <Icon name="add" className="text-[18px]" />
              New Incident
            </Button>
          )
        }
      />

      {showCreateForm && (
        <CreateIncidentForm
          onCancel={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            load();
          }}
        />
      )}

      {!loading && incidents.length === 0 ? (
        <Card>
          <EmptyState
            icon="crisis_alert"
            title="No incidents yet"
            description="No incidents yet — create one to start tracking a coordinated response, or link error groups from an existing incident."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {incidents.map((incident) => {
              const isExpanded = expandedId === incident.id;
              return (
                <div key={incident.id} className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                    className="w-full flex items-start gap-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold text-text-primary truncate">{incident.title}</span>
                          <SeverityBadge severity={incident.severity} />
                          <StatusBadge status={incident.status} />
                        </div>
                        <span className="text-xs text-text-secondary shrink-0">Opened {timeAgo(incident.opened_at)}</span>
                      </div>
                      {incident.description && (
                        <p className="text-xs text-text-secondary truncate mt-0.5">{incident.description}</p>
                      )}
                    </div>
                    <Icon
                      name={isExpanded ? 'expand_less' : 'expand_more'}
                      className="text-text-muted text-[18px] shrink-0 mt-0.5"
                    />
                  </button>

                  {isExpanded && project && (
                    <IncidentDetailPanel incident={incident} projectId={project.id} onChanged={load} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
