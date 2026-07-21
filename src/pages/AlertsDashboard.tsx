import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, Icon, KpiCard, PageHeader, Pagination } from '../components/ui';
import { fetchOrganizationAlertHistory } from '../lib/api';
import { useOrg } from '../lib/org-context';
import type { AlertHistoryEntry, AlertSeverity, AlertType } from '../lib/types';

const RESOLVED_PAGE_SIZE = 10;

const SEVERITY_FILTERS: { value: AlertSeverity | 'all'; label: string }[] = [
  { value: 'all', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
];

const severityClass: Record<AlertSeverity, string> = {
  critical: 'border-danger text-danger',
  warning: 'border-warning text-warning',
};

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

function AlertRow({ alert }: { alert: AlertHistoryEntry }) {
  const resolved = !!alert.resolved_at;
  return (
    <div className="flex gap-3">
      <span
        className={`w-3.5 h-3.5 rounded-full bg-surface border-2 mt-1 shrink-0 ${
          resolved ? 'border-text-muted' : severityClass[alert.severity].split(' ')[0]
        }`}
      />
      <div className={`flex-1 bg-surface border border-border rounded-lg p-4 ${resolved ? 'opacity-70' : ''}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-primary font-medium">{alert.project_name}</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className={`font-bold ${resolved ? 'text-text-secondary' : severityClass[alert.severity].split(' ')[1]}`}>
              {resolved ? 'RESOLVED' : alert.severity.toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-text-secondary">{timeAgo(resolved ? alert.resolved_at! : alert.triggered_at)}</span>
        </div>
        <p className="text-sm font-semibold text-text-primary">{alertTitle[alert.alert_type]}</p>
        <p className="text-sm text-text-secondary">{alert.message}</p>
      </div>
    </div>
  );
}

export default function AlertsDashboard() {
  const { currentOrganization } = useOrg();
  const [active, setActive] = useState<AlertHistoryEntry[]>([]);
  const [resolved, setResolved] = useState<AlertHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [resolvedPage, setResolvedPage] = useState(1);

  const load = useCallback(async () => {
    if (!currentOrganization) return;
    const data = await fetchOrganizationAlertHistory(currentOrganization.id);
    setActive(data.active);
    setResolved(data.resolved);
  }, [currentOrganization]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const criticalCount = active.filter((a) => a.severity === 'critical').length;
  const warningCount = active.filter((a) => a.severity === 'warning').length;

  const filteredActive = useMemo(
    () => (severityFilter === 'all' ? active : active.filter((a) => a.severity === severityFilter)),
    [active, severityFilter]
  );
  const filteredResolved = useMemo(
    () => (severityFilter === 'all' ? resolved : resolved.filter((a) => a.severity === severityFilter)),
    [resolved, severityFilter]
  );

  useEffect(() => {
    setResolvedPage(1);
  }, [severityFilter]);

  const pagedResolved = useMemo(
    () => filteredResolved.slice((resolvedPage - 1) * RESOLVED_PAGE_SIZE, resolvedPage * RESOLVED_PAGE_SIZE),
    [filteredResolved, resolvedPage]
  );

  return (
    <>
      <PageHeader
        title="Alerts Dashboard"
        subtitle="Real-time incident monitoring across your organization."
        actions={
          !loading && (active.length > 0 || resolved.length > 0) ? (
            <>
              <KpiCard label="Active Critical" value={criticalCount} icon="error" deltaTone={criticalCount > 0 ? 'danger' : 'success'} />
              <KpiCard label="Active Warning" value={warningCount} icon="warning" deltaTone={warningCount > 0 ? 'warning' : 'success'} />
            </>
          ) : undefined
        }
      />

      {!loading && (active.length > 0 || resolved.length > 0) && (
        <div className="flex items-center gap-2 mb-5">
          <Icon name="filter_list" className="text-text-secondary text-[18px]" />
          {SEVERITY_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setSeverityFilter(f.value)}
              className={`h-8 px-3 rounded-md text-xs font-semibold transition-colors ${
                severityFilter === f.value ? 'bg-primary text-white' : 'bg-white border border-border text-text-secondary hover:bg-background'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {!loading && active.length === 0 && resolved.length === 0 ? (
        <Card>
          <EmptyState
            icon="notifications"
            title="No alerts yet"
            description="Alerts open automatically when a project's telemetry crosses a threshold — nothing has, yet."
          />
        </Card>
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="text-base font-semibold text-text-primary mb-3">Active ({filteredActive.length})</h2>
            {filteredActive.length === 0 ? (
              <p className="text-sm text-text-secondary">Nothing is breaching right now.</p>
            ) : (
              <div className="space-y-3">
                {filteredActive.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </div>
            )}
          </div>

          {filteredResolved.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-text-primary mb-3">Resolved ({filteredResolved.length})</h2>
              <div className="space-y-3">
                {pagedResolved.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </div>
              <Card className="mt-3">
                <Pagination
                  page={resolvedPage}
                  pageSize={RESOLVED_PAGE_SIZE}
                  total={filteredResolved.length}
                  onPageChange={setResolvedPage}
                />
              </Card>
            </div>
          )}
        </div>
      )}
    </>
  );
}
