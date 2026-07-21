import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, KpiCard, PageHeader, StatusPill } from '../components/ui';
import { Loader } from '../components/Loader';
import { fetchOrganizationAlertHistory, fetchOrganizationHealth, fetchProjects } from '../lib/api';
import { useOrg } from '../lib/org-context';
import type { AlertHistoryEntry, AlertType, Project, ProjectHealth } from '../lib/types';

function healthTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

const alertTitle: Record<AlertType, string> = {
  high_cpu: 'High CPU Usage',
  high_memory: 'High Memory Usage',
  high_error_rate: 'Elevated Error Rate',
  high_latency: 'Elevated Latency',
};

function exportProjectsCsv(orgName: string, projects: Project[], healthByProjectId: Map<string, ProjectHealth>) {
  const header = 'Project,Environment,Health Score\n';
  const rows = projects
    .map((p) => `"${p.name}","${p.environment}",${healthByProjectId.get(p.id)?.score ?? ''}`)
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${orgName || 'organization'}-health-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
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

export default function OrganizationDashboard() {
  const { currentOrganization } = useOrg();
  const [projects, setProjects] = useState<Project[]>([]);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [healthByProjectId, setHealthByProjectId] = useState<Map<string, ProjectHealth>>(new Map());
  const [activeAlerts, setActiveAlerts] = useState<AlertHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganization) return;
    const [projectData, healthData, alertData] = await Promise.all([
      fetchProjects(currentOrganization.id),
      fetchOrganizationHealth(currentOrganization.id),
      fetchOrganizationAlertHistory(currentOrganization.id),
    ]);
    setProjects(projectData);
    setAvgScore(healthData.avgScore);
    setHealthByProjectId(healthData.byProjectId);
    setActiveAlerts(alertData.active);
  }, [currentOrganization]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const healthy = projects.filter((p) => (healthByProjectId.get(p.id)?.score ?? -1) >= 80).length;
  const warning = projects.filter((p) => {
    const score = healthByProjectId.get(p.id)?.score;
    return score != null && score < 80;
  }).length;

  return (
    <>
      <PageHeader
        title="System Health Overview"
        subtitle={currentOrganization ? `${currentOrganization.name} · real-time status of your engineering ecosystem.` : undefined}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => exportProjectsCsv(currentOrganization?.name ?? '', projects, healthByProjectId)}
            >
              <Icon name="download" className="text-[18px]" />
              Export Report
            </Button>
            <Link to="/projects/new">
              <Button variant="primary">
                <Icon name="add" className="text-[18px]" />
                Deploy Project
              </Button>
            </Link>
          </>
        }
      />

      {loading ? (
        <Loader fullScreen={false} messages={['Loading dashboard...', 'Fetching organization health...']} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total Projects" value={projects.length} icon="folder" />
            <KpiCard label="Healthy Projects" value={healthy} icon="verified" deltaTone="success" />
            <KpiCard label="Warning Projects" value={warning} icon="warning" deltaTone={warning > 0 ? 'warning' : 'neutral'} />
            <KpiCard
              label="Active Alerts"
              value={activeAlerts.length}
              icon="notifications_active"
              deltaTone={activeAlerts.length > 0 ? 'danger' : 'success'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
            <Card className="lg:col-span-8 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Key Projects</h2>
                  <p className="text-xs text-text-secondary">Average health score across the organization</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-text-primary">{avgScore ?? '–'}</div>
                  <div className="text-xs text-text-secondary">avg / 100</div>
                </div>
              </div>
              {projects.length === 0 ? (
                <EmptyState
                  icon="folder_open"
                  title="No projects yet"
                  description="Create your first project to start discovering architecture, APIs, and health metrics."
                  action={
                    <Link to="/projects/new">
                      <Button variant="primary">Create Project</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="divide-y divide-border">
                  {projects.slice(0, 6).map((project) => {
                    const health = healthByProjectId.get(project.id);
                    return (
                      <Link
                        key={project.id}
                        to={`/projects/${project.id}`}
                        className="flex items-center justify-between py-3 hover:bg-background/60 -mx-2 px-2 rounded transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon name="dns" className="text-primary text-[18px]" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">{project.name}</div>
                            <div className="text-xs text-text-secondary truncate">
                              {project.description || project.environment}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <StatusPill tone={health ? healthTone(health.score) : 'neutral'}>
                            {health ? `${health.score}/100` : 'No data'}
                          </StatusPill>
                          <Icon name="chevron_right" className="text-text-muted text-[18px]" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="lg:col-span-4 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-text-primary">Active Alerts</h2>
                {activeAlerts.some((a) => a.severity === 'critical') && (
                  <span className="text-xs font-semibold text-danger bg-danger/10 px-2 py-0.5 rounded-full">
                    {activeAlerts.filter((a) => a.severity === 'critical').length} Critical
                  </span>
                )}
              </div>
              {activeAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-6 border border-dashed border-border rounded-lg text-center">
                  <Icon name="check_circle" className="text-success text-[28px]" />
                  <p className="text-sm text-text-secondary">All systems stable</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`border-l-4 rounded-md p-3 ${
                        alert.severity === 'critical' ? 'border-l-danger bg-danger/5' : 'border-l-warning bg-warning/5'
                      }`}
                    >
                      <p className="text-sm font-semibold text-text-primary">
                        {alertTitle[alert.alert_type]} — {alert.project_name}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">{alert.message}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-text-muted">{timeAgo(alert.triggered_at)}</span>
                        <Link to="/alerts" className="text-xs font-semibold text-primary hover:underline">
                          View Details
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
