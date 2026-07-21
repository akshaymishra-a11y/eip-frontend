import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, KpiCard, PageHeader, StatusPill } from '../components/ui';
import { Loader } from '../components/Loader';
import { fetchOrganizationHealth, fetchProjects, generateExecutiveSummary } from '../lib/api';
import { useOrg } from '../lib/org-context';
import type { Project, ProjectHealth } from '../lib/types';

// AI Copilot expansion — on-demand (button-triggered, not auto-loaded on
// page view) so a Gemini call doesn't fire every time someone opens this
// page. Kept as a self-contained component so its loading/error state
// doesn't tangle with the rest of the page's data loading.
function ExecutiveSummaryCard({ organizationId }: { organizationId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateExecutiveSummary(organizationId);
      setSummary(result.summary);
      setGeneratedAt(result.generatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the executive summary.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Icon name="auto_awesome" className="text-[18px] text-primary" />
          <h2 className="text-base font-semibold text-text-primary">AI Executive Summary</h2>
        </div>
        <Button variant="secondary" onClick={handleGenerate} disabled={loading}>
          <Icon name="refresh" className="text-[16px]" />
          {loading ? 'Generating...' : summary ? 'Regenerate' : 'Generate Summary'}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!error && summary && (
        <>
          <p className="text-sm text-text-primary leading-relaxed">{summary}</p>
          {generatedAt && <p className="text-xs text-text-muted mt-2">Generated {new Date(generatedAt).toLocaleString()}</p>}
        </>
      )}
      {!error && !summary && !loading && (
        <p className="text-sm text-text-secondary">Generate an AI-written summary of engineering health across every active project — errors, alerts, security, and cloud posture in one paragraph.</p>
      )}
    </Card>
  );
}

function healthTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

function exportHealthReport(orgName: string, projects: Project[], healthByProjectId: Map<string, ProjectHealth>) {
  const header = 'Project,Environment,Health Score\n';
  const rows = projects
    .map((p) => `"${p.name}","${p.environment}",${healthByProjectId.get(p.id)?.score ?? ''}`)
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${orgName || 'organization'}-health-center-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HealthCenter() {
  const { currentOrganization } = useOrg();
  const [projects, setProjects] = useState<Project[]>([]);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [healthByProjectId, setHealthByProjectId] = useState<Map<string, ProjectHealth>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentOrganization) return;
    const [projectData, healthData] = await Promise.all([
      fetchProjects(currentOrganization.id),
      fetchOrganizationHealth(currentOrganization.id),
    ]);
    setProjects(projectData);
    setAvgScore(healthData.avgScore);
    setHealthByProjectId(healthData.byProjectId);
  }, [currentOrganization]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const withHealth = projects
    .map((p) => ({ project: p, health: healthByProjectId.get(p.id) }))
    .sort((a, b) => (a.health?.score ?? 100) - (b.health?.score ?? 100));
  const atRisk = withHealth.filter((p) => p.health && p.health.score < 50);
  const healthyCount = withHealth.filter((p) => (p.health?.score ?? -1) >= 80).length;
  const warningCount = withHealth.filter((p) => p.health && p.health.score >= 50 && p.health.score < 80).length;
  const criticalCount = atRisk.length;
  const distributionTotal = Math.max(projects.length, 1);

  return (
    <>
      <PageHeader
        title="Health Center"
        subtitle="Executive summary of engineering health across the organization."
        actions={
          projects.length > 0 ? (
            <Button
              variant="secondary"
              onClick={() => exportHealthReport(currentOrganization?.name ?? '', projects, healthByProjectId)}
            >
              <Icon name="download" className="text-[18px]" />
              Export Report
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <Loader fullScreen={false} messages={['Loading system health...', 'Aggregating project scores...']} />
      ) : projects.length === 0 ? (
        <Card>
          <EmptyState icon="favorite" title="No projects yet" description="Create a project to start tracking its health score here." />
        </Card>
      ) : (
        <>
          {currentOrganization && <ExecutiveSummaryCard organizationId={currentOrganization.id} />}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KpiCard
              label="Overall Health Score"
              value={avgScore ?? '–'}
              hint="/ 100"
              icon="favorite"
              deltaTone={avgScore != null ? healthTone(avgScore) : 'neutral'}
            />
            <KpiCard label="Projects Tracked" value={projects.length} icon="folder" />
            <KpiCard label="At Risk (&lt; 50)" value={atRisk.length} icon="report" deltaTone={atRisk.length > 0 ? 'danger' : 'success'} />
          </div>

          <Card className="p-5 mb-6">
            <h2 className="text-base font-semibold text-text-primary mb-4">Service Distribution</h2>
            <div className="space-y-3">
              {[
                { label: 'Healthy', count: healthyCount, tone: 'success' as const },
                { label: 'Warning', count: warningCount, tone: 'warning' as const },
                { label: 'Critical', count: criticalCount, tone: 'danger' as const },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-text-primary">{row.label}</span>
                    <span className="text-text-secondary">
                      {row.count} project{row.count === 1 ? '' : 's'} ({Math.round((row.count / distributionTotal) * 100)}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-background overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-${row.tone}`}
                      style={{ width: `${(row.count / distributionTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {atRisk.length > 0 && (
            <Card className="p-5 mb-6 border-l-4 border-l-danger">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="report" className="text-danger text-[20px]" />
                <h2 className="text-base font-semibold text-text-primary">Risk Indicators</h2>
              </div>
              <div className="space-y-2">
                {atRisk.map(({ project, health }) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="flex items-center justify-between text-sm hover:bg-background/60 -mx-2 px-2 py-1.5 rounded"
                  >
                    <span className="text-text-primary font-medium">{project.name}</span>
                    <span className="text-danger font-semibold">{health?.score}/100</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Service Health</h2>
            </div>
            <div className="divide-y divide-border">
              {withHealth.map(({ project, health }) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-background/60"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{project.name}</p>
                    <p className="text-xs text-text-secondary capitalize">{project.environment}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32 h-1.5 rounded-full bg-background overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          health ? (healthTone(health.score) === 'success' ? 'bg-success' : healthTone(health.score) === 'warning' ? 'bg-warning' : 'bg-danger') : 'bg-text-muted'
                        }`}
                        style={{ width: `${health ? Math.min(health.score, 100) : 0}%` }}
                      />
                    </div>
                    <StatusPill tone={health ? healthTone(health.score) : 'neutral'}>{health ? `${health.score}/100` : 'No data'}</StatusPill>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
