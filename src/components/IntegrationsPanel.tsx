import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Icon } from './ui';
import {
  createProjectIntegration,
  deleteProjectIntegration,
  fetchDiscoveredServices,
  fetchProjectIntegrations,
  updateProjectIntegration,
} from '../lib/api';
import type {
  AwsCloudIntegrationConfig,
  DiscoveredService,
  GithubArtifactsIntegrationConfig,
  GithubRepoIntegrationConfig,
  IntegrationTool,
  JiraIntegrationConfig,
  ProjectIntegration,
  SonarQubeIntegrationConfig,
} from '../lib/types';
import { useConfirm } from '../lib/confirm-context';
import { describeSupabaseError, humanizeCloudSyncError } from '../lib/errors';

const TOOL_LABEL: Record<IntegrationTool, string> = {
  sonarqube: 'SonarQube',
  github_artifacts: 'GitHub Actions artifact (SARIF / npm audit)',
  github_repo: 'GitHub Repository (repo, pipelines, deployments)',
  aws_cloud: 'AWS Cloud (resource inventory + cost)',
  jira: 'Jira (issue + sprint sync)',
};

type AnyIntegrationConfig =
  | SonarQubeIntegrationConfig
  | GithubArtifactsIntegrationConfig
  | GithubRepoIntegrationConfig
  | AwsCloudIntegrationConfig
  | JiraIntegrationConfig;

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

// Fixed discrete set, matching the DB check constraint on
// project_integrations.poll_interval_minutes (supabase/schema.sql) — not a
// free-form number, so every value here is guaranteed to save.
const POLL_INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 1440, label: 'Once a day' },
];

function formatPollIntervalShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${minutes / 60}h`;
}

function emptyConfig(tool: IntegrationTool): AnyIntegrationConfig {
  if (tool === 'sonarqube') return { sonarUrl: '', sonarToken: '', projectKey: '' };
  if (tool === 'github_repo') return { repo: '', token: '' };
  if (tool === 'aws_cloud') return { accessKeyId: '', secretAccessKey: '', region: 'us-east-1' };
  if (tool === 'jira') return { baseUrl: '', email: '', apiToken: '', projectKey: '' };
  return { repo: '', token: '', artifactName: '', reportType: 'sarif' };
}

function inputClass() {
  return 'w-full h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';
}

export function IntegrationsPanel({ projectId }: { projectId: string }) {
  const confirm = useConfirm();
  const [integrations, setIntegrations] = useState<ProjectIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<IntegrationTool>('sonarqube');
  const [serviceName, setServiceName] = useState('default');
  const [config, setConfig] = useState<AnyIntegrationConfig>(emptyConfig('sonarqube'));
  const [pollIntervalMinutes, setPollIntervalMinutes] = useState(30);
  const [discoveredServices, setDiscoveredServices] = useState<DiscoveredService[]>([]);

  const load = useCallback(async () => {
    const rows = await fetchProjectIntegrations(projectId);
    setIntegrations(rows);
  }, [projectId]);

  useEffect(() => {
    // Best-effort — a service's sonar_project_key is only used to prefill
    // the form below, so a failure here shouldn't block the integrations list.
    fetchDiscoveredServices(projectId)
      .then(setDiscoveredServices)
      .catch(() => setDiscoveredServices([]));
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(describeSupabaseError(err, 'Could not load integrations.')))
      .finally(() => setLoading(false));
  }, [load]);

  const handleToolChange = (next: IntegrationTool) => {
    setTool(next);
    setConfig(emptyConfig(next));
  };

  const handleAdd = async () => {
    setError(null);
    if (tool === 'sonarqube') {
      const c = config as SonarQubeIntegrationConfig;
      if (!c.sonarUrl.trim() || !c.sonarToken.trim() || !c.projectKey.trim()) {
        setError('SonarQube URL, token, and project key are all required.');
        return;
      }
    } else if (tool === 'github_repo') {
      const c = config as GithubRepoIntegrationConfig;
      if (!c.repo.trim() || !c.token.trim()) {
        setError('Repo (owner/repo) and token are both required.');
        return;
      }
    } else if (tool === 'aws_cloud') {
      const c = config as AwsCloudIntegrationConfig;
      if (!c.accessKeyId.trim() || !c.secretAccessKey.trim() || !c.region.trim()) {
        setError('Access key ID, secret access key, and region are all required.');
        return;
      }
    } else if (tool === 'jira') {
      const c = config as JiraIntegrationConfig;
      if (!c.baseUrl.trim() || !c.email.trim() || !c.apiToken.trim() || !c.projectKey.trim()) {
        setError('Jira base URL, email, API token, and project key are all required.');
        return;
      }
    } else {
      const c = config as GithubArtifactsIntegrationConfig;
      if (!c.repo.trim() || !c.token.trim() || !c.artifactName.trim()) {
        setError('Repo (owner/repo), token, and artifact name are all required.');
        return;
      }
    }
    setSaving(true);
    try {
      await createProjectIntegration({
        projectId,
        serviceName: serviceName.trim() || 'default',
        tool,
        config,
        pollIntervalMinutes,
      });
      setShowForm(false);
      setServiceName('default');
      setConfig(emptyConfig(tool));
      setPollIntervalMinutes(30);
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not save integration.'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangeInterval = async (integration: ProjectIntegration, minutes: number) => {
    try {
      await updateProjectIntegration(projectId, integration.id, { poll_interval_minutes: minutes });
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not update polling interval.'));
    }
  };

  const handleToggleEnabled = async (integration: ProjectIntegration) => {
    try {
      await updateProjectIntegration(projectId, integration.id, { enabled: !integration.enabled });
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not update integration.'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: 'Remove this integration? Automatic polling for it will stop immediately.', tone: 'danger', confirmLabel: 'Remove' })))
      return;
    try {
      await deleteProjectIntegration(projectId, id);
      await load();
    } catch (err) {
      setError(describeSupabaseError(err, 'Could not remove integration.'));
    }
  };

  // The SDK auto-detects sonar.projectKey from sonar-project.properties/pom.xml/
  // build.gradle and reports it on every heartbeat (sdk/src/sonar-detect.js) —
  // surfaced here so setting up automatic scanning needs at most a token.
  const sonarCandidates = discoveredServices.filter((s) => s.sonar_project_key);

  const applySonarSuggestion = (service: DiscoveredService) => {
    setServiceName(service.name);
    setConfig((prev) => ({
      ...(prev as SonarQubeIntegrationConfig),
      projectKey: service.sonar_project_key || '',
      sonarUrl: service.sonar_host_url || (prev as SonarQubeIntegrationConfig).sonarUrl,
    }));
  };

  return (
    <Card className="p-6 lg:col-span-2">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Integrations</h2>
          <p className="text-xs text-text-secondary">
            Configure a tool once and the platform polls it automatically — no CI/CLI step needed. Only visible to org owners/admins
            since credentials are stored here.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setShowForm((v) => !v)}>
          <Icon name={showForm ? 'close' : 'add'} className="text-[16px]" />
          {showForm ? 'Cancel' : 'Add Integration'}
        </Button>
      </div>

      {showForm && (
        <div className="mt-4 border border-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Tool</label>
              <select value={tool} onChange={(e) => handleToolChange(e.target.value as IntegrationTool)} className={inputClass()}>
                <option value="sonarqube">SonarQube</option>
                <option value="github_artifacts">GitHub Actions artifact (SARIF / npm audit)</option>
                <option value="github_repo">GitHub Repository (repo, pipelines, deployments)</option>
                <option value="aws_cloud">AWS Cloud (resource inventory + cost)</option>
                <option value="jira">Jira (issue + sprint sync)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Service name</label>
              <input
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="default"
                autoComplete="off"
                className={inputClass()}
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Polling interval</label>
              <select
                value={pollIntervalMinutes}
                onChange={(e) => setPollIntervalMinutes(Number(e.target.value))}
                className={inputClass()}
              >
                {POLL_INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {tool === 'sonarqube' && sonarCandidates.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-secondary">Detected from your services:</span>
              {sonarCandidates.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => applySonarSuggestion(service)}
                  className="text-xs px-2.5 py-1 rounded-full border border-primary/40 text-primary bg-primary-light hover:border-primary"
                >
                  {service.name} → {service.sonar_project_key}
                </button>
              ))}
            </div>
          )}

          {tool === 'sonarqube' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                placeholder="Sonar URL (https://sonar.example.com)"
                value={(config as SonarQubeIntegrationConfig).sonarUrl}
                onChange={(e) => setConfig({ ...(config as SonarQubeIntegrationConfig), sonarUrl: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
              <input
                type="password"
                placeholder="Sonar token"
                value={(config as SonarQubeIntegrationConfig).sonarToken}
                onChange={(e) => setConfig({ ...(config as SonarQubeIntegrationConfig), sonarToken: e.target.value })}
                autoComplete="new-password"
                className={inputClass()}
              />
              <input
                placeholder="Project key"
                value={(config as SonarQubeIntegrationConfig).projectKey}
                onChange={(e) => setConfig({ ...(config as SonarQubeIntegrationConfig), projectKey: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
            </div>
          ) : tool === 'github_repo' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="owner/repo"
                value={(config as GithubRepoIntegrationConfig).repo}
                onChange={(e) => setConfig({ ...(config as GithubRepoIntegrationConfig), repo: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
              <input
                type="password"
                placeholder="GitHub token"
                value={(config as GithubRepoIntegrationConfig).token}
                onChange={(e) => setConfig({ ...(config as GithubRepoIntegrationConfig), token: e.target.value })}
                autoComplete="new-password"
                className={inputClass()}
              />
            </div>
          ) : tool === 'aws_cloud' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                placeholder="AWS Access Key ID"
                value={(config as AwsCloudIntegrationConfig).accessKeyId}
                onChange={(e) => setConfig({ ...(config as AwsCloudIntegrationConfig), accessKeyId: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
              <input
                type="password"
                placeholder="AWS Secret Access Key"
                value={(config as AwsCloudIntegrationConfig).secretAccessKey}
                onChange={(e) => setConfig({ ...(config as AwsCloudIntegrationConfig), secretAccessKey: e.target.value })}
                autoComplete="new-password"
                className={inputClass()}
              />
              <input
                placeholder="Region (e.g. us-east-1)"
                value={(config as AwsCloudIntegrationConfig).region}
                onChange={(e) => setConfig({ ...(config as AwsCloudIntegrationConfig), region: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
            </div>
          ) : tool === 'jira' ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                placeholder="Jira base URL (https://your-domain.atlassian.net)"
                value={(config as JiraIntegrationConfig).baseUrl}
                onChange={(e) => setConfig({ ...(config as JiraIntegrationConfig), baseUrl: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
              <input
                placeholder="Account email"
                value={(config as JiraIntegrationConfig).email}
                onChange={(e) => setConfig({ ...(config as JiraIntegrationConfig), email: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
              <input
                type="password"
                placeholder="API token"
                value={(config as JiraIntegrationConfig).apiToken}
                onChange={(e) => setConfig({ ...(config as JiraIntegrationConfig), apiToken: e.target.value })}
                autoComplete="new-password"
                className={inputClass()}
              />
              <input
                placeholder="Project key (e.g. PROJ)"
                value={(config as JiraIntegrationConfig).projectKey}
                onChange={(e) => setConfig({ ...(config as JiraIntegrationConfig), projectKey: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                placeholder="owner/repo"
                value={(config as GithubArtifactsIntegrationConfig).repo}
                onChange={(e) => setConfig({ ...(config as GithubArtifactsIntegrationConfig), repo: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
              <input
                type="password"
                placeholder="GitHub token"
                value={(config as GithubArtifactsIntegrationConfig).token}
                onChange={(e) => setConfig({ ...(config as GithubArtifactsIntegrationConfig), token: e.target.value })}
                autoComplete="new-password"
                className={inputClass()}
              />
              <input
                placeholder="Artifact name (as uploaded by CI)"
                value={(config as GithubArtifactsIntegrationConfig).artifactName}
                onChange={(e) => setConfig({ ...(config as GithubArtifactsIntegrationConfig), artifactName: e.target.value })}
                autoComplete="off"
                className={inputClass()}
              />
              <select
                value={(config as GithubArtifactsIntegrationConfig).reportType}
                onChange={(e) =>
                  setConfig({
                    ...(config as GithubArtifactsIntegrationConfig),
                    reportType: e.target.value as 'sarif' | 'npm-audit',
                  })
                }
                className={inputClass()}
              >
                <option value="sarif">SARIF</option>
                <option value="npm-audit">npm audit</option>
              </select>
            </div>
          )}

          <Button type="button" onClick={handleAdd} disabled={saving}>
            {saving ? 'Saving…' : 'Save Integration'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-danger mt-3">{error}</p>}

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : integrations.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-4 text-center">
            <p className="text-sm text-text-secondary">No integrations configured yet.</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
            {integrations.map((integration) => {
              const humanizedError =
                integration.last_status === 'error' && integration.last_error ? humanizeCloudSyncError(integration.last_error) : null;
              const isInfoTone = humanizedError?.tone === 'info';
              return (
              <div key={integration.id} className="flex items-center gap-3 px-3.5 py-3 flex-wrap">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    !integration.enabled
                      ? 'bg-text-muted'
                      : integration.last_status === 'error'
                        ? isInfoTone
                          ? 'bg-warning'
                          : 'bg-danger'
                        : integration.last_status === 'ok'
                          ? 'bg-success'
                          : 'bg-text-muted'
                  }`}
                  title={humanizedError?.summary ?? integration.last_status ?? 'not polled yet'}
                />
                <div className="min-w-0">
                  <div className="text-sm text-text-primary">
                    {TOOL_LABEL[integration.tool]} <span className="text-text-secondary">· {integration.service_name}</span>
                  </div>
                  <div className="text-xs text-text-secondary">
                    Polls every {formatPollIntervalShort(integration.poll_interval_minutes)} · last polled: {timeAgo(integration.last_polled_at)}
                    {humanizedError && (
                      <span className={isInfoTone ? 'text-warning' : 'text-danger'}> · {humanizedError.summary}</span>
                    )}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <select
                    value={integration.poll_interval_minutes}
                    onChange={(e) => handleChangeInterval(integration, Number(e.target.value))}
                    title="Polling interval"
                    className="text-xs h-8 px-2 rounded-md border border-border bg-white text-text-secondary"
                  >
                    {POLL_INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(integration)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      integration.enabled ? 'border-success text-success bg-success-light' : 'border-border text-text-secondary'
                    }`}
                  >
                    {integration.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(integration.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-danger"
                  >
                    <Icon name="delete" className="text-[18px]" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
