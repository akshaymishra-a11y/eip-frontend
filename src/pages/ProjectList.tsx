import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, PageHeader, Pagination, StatusPill } from '../components/ui';
import { fetchOrganizationAlertHistory, fetchOrganizationHealth, fetchProjects, getOrgProjectUsage, type OrgProjectUsage } from '../lib/api';
import { useOrg } from '../lib/org-context';
import type { Project, ProjectHealth } from '../lib/types';

const PAGE_SIZE = 6;

const ENV_LABEL: Record<string, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
};

type HealthTone = 'success' | 'warning' | 'danger';

function healthTone(score: number): HealthTone {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

const healthBarClass: Record<HealthTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const STATUS_LABEL: Record<HealthTone, string> = {
  success: 'Healthy',
  warning: 'Warning',
  danger: 'Critical',
};

const STATUS_PILL_CLASS: Record<HealthTone, string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
};

export default function ProjectList() {
  const { currentOrganization } = useOrg();
  const [projects, setProjects] = useState<Project[]>([]);
  const [healthByProjectId, setHealthByProjectId] = useState<Map<string, ProjectHealth>>(new Map());
  const [alertCountByProjectId, setAlertCountByProjectId] = useState<Map<string, number>>(new Map());
  const [usage, setUsage] = useState<OrgProjectUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<HealthTone | 'all'>('all');
  const [envFilter, setEnvFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!currentOrganization) return;
    const [projectData, healthData, alertData, usageData] = await Promise.all([
      fetchProjects(currentOrganization.id, showArchived),
      fetchOrganizationHealth(currentOrganization.id),
      fetchOrganizationAlertHistory(currentOrganization.id),
      getOrgProjectUsage(currentOrganization.id),
    ]);
    setProjects(projectData);
    setHealthByProjectId(healthData.byProjectId);
    setUsage(usageData);
    const counts = new Map<string, number>();
    for (const alert of alertData.active) {
      counts.set(alert.project_id, (counts.get(alert.project_id) ?? 0) + 1);
    }
    setAlertCountByProjectId(counts);
  }, [currentOrganization, showArchived]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (envFilter !== 'all' && p.environment !== envFilter) return false;
      if (query.trim() && !p.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (statusFilter !== 'all') {
        const score = healthByProjectId.get(p.id)?.score;
        if (score == null || healthTone(score) !== statusFilter) return false;
      }
      return true;
    });
  }, [projects, query, envFilter, statusFilter, healthByProjectId]);

  useEffect(() => {
    setPage(1);
  }, [query, envFilter, statusFilter, showArchived]);

  const pagedProjects = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const atProjectLimit = usage?.maxProjects != null && usage.activeCount >= usage.maxProjects;

  const hasActiveFilters = query.trim() !== '' || statusFilter !== 'all' || envFilter !== 'all' || showArchived;
  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setEnvFilter('all');
    setShowArchived(false);
  };

  return (
    <>
      <PageHeader
        title="Project Inventory"
        subtitle={`Manage and monitor health across ${projects.length} project${projects.length === 1 ? '' : 's'}.`}
        actions={
          atProjectLimit ? (
            <Link to="/billing">
              <Button variant="primary">
                <Icon name="upgrade" className="text-[18px]" />
                Upgrade to Add Projects
              </Button>
            </Link>
          ) : (
            <Link to="/projects/new">
              <Button variant="primary">
                <Icon name="add" className="text-[18px]" />
                Create Project
              </Button>
            </Link>
          )
        }
      />

      {atProjectLimit && (
        // Plain div, not <Card>: Card hard-codes bg-surface (white), which can
        // silently win the cascade over an appended bg-* override depending on
        // class order in Tailwind's generated stylesheet — see OrgBilling.tsx.
        <div className="rounded-lg shadow-sm p-4 mb-6 border border-warning/40 bg-warning-light flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-full bg-warning/15 text-warning flex items-center justify-center shrink-0">
            <Icon name="warning" className="text-[20px]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">You've reached your plan's project limit</p>
            <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
              {usage?.activeCount} of {usage?.maxProjects} active projects used. Archive a project or{' '}
              <Link to="/billing" className="font-semibold text-primary hover:underline">
                upgrade your plan
              </Link>{' '}
              to create more.
            </p>
          </div>
        </div>
      )}

      <Card className="p-4 flex flex-wrap items-center gap-4 mb-6">
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider pr-4 border-r border-border">
          Filters:
        </span>
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]" />
          <input
            placeholder="Search projects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as HealthTone | 'all')}
          className="h-9 px-3 bg-background border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        >
          <option value="all">All Statuses</option>
          <option value="success">Healthy</option>
          <option value="warning">Warning</option>
          <option value="danger">Critical</option>
        </select>
        <select
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
          className="h-9 px-3 bg-background border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        >
          <option value="all">All Environments</option>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <Icon name={showArchived ? 'check_box' : 'check_box_outline_blank'} className="text-[18px]" />
          Show archived
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-semibold text-primary hover:underline ml-auto"
          >
            Clear All
          </button>
        )}
      </Card>

      {!loading && filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="folder_open"
            title="No projects yet"
            description="Create your first project to start monitoring architecture, APIs, and infrastructure health."
            action={
              <Link to="/projects/new">
                <Button variant="primary">Create Project</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pagedProjects.map((project) => {
              const health = healthByProjectId.get(project.id);
              const archived = project.status === 'archived';
              const tone = health ? healthTone(health.score) : null;
              const alertCount = alertCountByProjectId.get(project.id) ?? 0;
              const isCritical = tone === 'danger';
              return (
                <Link key={project.id} to={`/projects/${project.id}`}>
                  <Card
                    className={`relative overflow-hidden p-5 h-full hover:shadow-md transition-shadow ${
                      archived ? 'opacity-60' : ''
                    } ${isCritical ? 'border-2 border-danger/30 shadow-danger/5' : ''}`}
                  >
                    {isCritical && (
                      <div className="absolute top-3 right-3">
                        <div className="absolute inset-0 rounded-full bg-danger/20 animate-ping" />
                        <Icon name="report" className="relative text-danger text-[20px]" />
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-text-primary truncate">{project.name}</h3>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <StatusPill tone="neutral">{ENV_LABEL[project.environment] ?? project.environment}</StatusPill>
                          {tone && tone !== 'success' && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_PILL_CLASS[tone]}`}
                            >
                              {STATUS_LABEL[tone]}
                            </span>
                          )}
                          {archived && <StatusPill tone="neutral">Archived</StatusPill>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-2xl font-bold ${tone ? `text-${tone}` : 'text-text-muted'}`}>
                          {health ? `${health.score}%` : '—'}
                        </div>
                        <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Health</div>
                      </div>
                    </div>

                    <div className="h-1.5 rounded-full bg-background overflow-hidden mt-3 mb-4">
                      <div
                        className={`h-full rounded-full ${healthBarClass[tone ?? 'danger']}`}
                        style={{ width: `${health ? health.score : 0}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                      <div
                        className={`rounded-lg p-2 text-center ${
                          isCritical && alertCount > 0 ? 'bg-danger/5 border border-danger/10' : 'bg-background'
                        }`}
                      >
                        <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Alerts</div>
                        <div className={`text-sm font-semibold ${alertCount > 0 ? 'text-danger' : 'text-text-primary'}`}>
                          {alertCount}
                        </div>
                      </div>
                      <div className="rounded-lg p-2 text-center bg-background">
                        <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Latency</div>
                        <div className="text-sm font-semibold text-text-primary">
                          {health?.avg_latency_ms != null ? `${Math.round(health.avg_latency_ms)}ms` : '—'}
                        </div>
                      </div>
                      <div className={`rounded-lg p-2 text-center ${isCritical ? 'bg-danger/5 border border-danger/10' : 'bg-background'}`}>
                        <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Error Rate</div>
                        <div className={`text-sm font-semibold ${isCritical ? 'text-danger' : 'text-text-primary'}`}>
                          {health ? `${(health.error_rate_1h * 100).toFixed(1)}%` : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-3 mt-3 border-t border-border/60">
                      <span className="text-xs text-text-secondary">
                        {alertCount > 0 ? (
                          <span className={isCritical ? 'text-danger font-medium' : 'text-warning font-medium'}>
                            {alertCount} active alert{alertCount === 1 ? '' : 's'}
                          </span>
                        ) : (
                          ' '
                        )}
                      </span>
                      <span className="text-primary text-xs font-semibold flex items-center gap-1">
                        Details
                        <Icon name="arrow_forward" className="text-[14px]" />
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}

            <Link to={atProjectLimit ? '/billing' : '/projects/new'}>
              <div className="min-h-[240px] h-full bg-background border-2 border-dashed border-border rounded-lg p-5 flex flex-col items-center justify-center gap-3 text-center hover:border-primary/50 hover:bg-white transition-all">
                <div className="w-12 h-12 rounded-full bg-white border border-border flex items-center justify-center text-text-muted group-hover:text-primary">
                  <Icon name={atProjectLimit ? 'upgrade' : 'add'} className="text-[28px]" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">
                    {atProjectLimit ? 'Upgrade to Add More' : 'Add New Project'}
                  </h4>
                  <p className="text-xs text-text-secondary mt-1 px-2">
                    {atProjectLimit
                      ? "You've used every project slot on your current plan."
                      : 'Connect a repository or deploy a pre-configured template.'}
                  </p>
                </div>
              </div>
            </Link>
          </div>

          <Card className="mt-4">
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          </Card>
        </>
      )}
    </>
  );
}
