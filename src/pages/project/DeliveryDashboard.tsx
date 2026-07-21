import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Icon, KpiCard, PageHeader, StatusPill } from '../../components/ui';
import {
  fetchDeployments,
  fetchDiscoveredContainers,
  fetchInfraResources,
  fetchPipelineDefinitionStages,
  fetchPipelineDefinitions,
  fetchPipelineRunJobs,
  fetchPipelineRuns,
  fetchPipelines,
  fetchRepoBranches,
  fetchRepositories,
} from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type {
  Deployment,
  DiscoveredContainer,
  InfraResource,
  InfraResourceSource,
  Pipeline,
  PipelineDefinition,
  PipelineDefinitionProvider,
  PipelineDefinitionStage,
  PipelineRun,
  PipelineRunJob,
  RepoBranch,
  Repository,
} from '../../lib/types';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

type PipelineWithRun = {
  pipeline: Pipeline;
  latestRun: PipelineRun | null;
  jobs: PipelineRunJob[];
};

type RepoGroup = {
  repo: Repository;
  branches: RepoBranch[];
  pipelines: PipelineWithRun[];
};

type PipelineDefWithStages = {
  def: PipelineDefinition;
  stages: PipelineDefinitionStage[];
};

const PROVIDER_LABEL: Record<PipelineDefinitionProvider, string> = {
  github_actions: 'GitHub Actions',
  azure_pipelines: 'Azure Pipelines',
  gitlab_ci: 'GitLab CI',
  circleci: 'CircleCI',
  bitbucket_pipelines: 'Bitbucket Pipelines',
  jenkins: 'Jenkins',
  other: 'Other',
};

const PROVIDER_ICON: Record<PipelineDefinitionProvider, string> = {
  github_actions: 'hub',
  azure_pipelines: 'cloud_sync',
  gitlab_ci: 'merge_type',
  circleci: 'autorenew',
  bitbucket_pipelines: 'water_drop',
  jenkins: 'precision_manufacturing',
  other: 'settings',
};

// Decorative per-provider colors (not status colors) — purely to tell
// providers apart at a glance in the grouped pipeline list. Loosely nods to
// each provider's own brand hue so it reads as "this is GitLab" rather than
// implying good/bad like the success/warning/danger tones do elsewhere.
const PROVIDER_CHIP_CLASSES: Record<PipelineDefinitionProvider, string> = {
  github_actions: 'bg-slate-100 text-slate-700',
  azure_pipelines: 'bg-sky-50 text-sky-600',
  gitlab_ci: 'bg-orange-50 text-orange-600',
  circleci: 'bg-emerald-50 text-emerald-600',
  bitbucket_pipelines: 'bg-blue-50 text-blue-600',
  jenkins: 'bg-red-50 text-red-600',
  other: 'bg-background text-text-secondary',
};

// Left-edge accent on each pipeline card, same hue family as its chip —
// groups a service's pipelines by provider at a glance (Gestalt proximity)
// without repeating the full chip color across the whole card border.
const PROVIDER_ACCENT_BORDER: Record<PipelineDefinitionProvider, string> = {
  github_actions: 'border-l-slate-400',
  azure_pipelines: 'border-l-sky-400',
  gitlab_ci: 'border-l-orange-400',
  circleci: 'border-l-emerald-400',
  bitbucket_pipelines: 'border-l-blue-400',
  jenkins: 'border-l-red-400',
  other: 'border-l-border',
};

const INFRA_SOURCE_LABEL: Record<InfraResourceSource, string> = {
  terraform: 'Terraform',
  kubernetes: 'Kubernetes',
  helm: 'Helm',
};

const INFRA_SOURCE_ICON: Record<InfraResourceSource, string> = {
  terraform: 'terrain',
  kubernetes: 'workspaces',
  helm: 'sailing',
};

// Terraform/Kubernetes/Helm each get their own accent (Terraform's violet
// nods to its real brand color) so the three groups are easy to tell apart.
const INFRA_SOURCE_CHIP_CLASSES: Record<InfraResourceSource, string> = {
  terraform: 'bg-violet-50 text-violet-600',
  kubernetes: 'bg-blue-50 text-blue-600',
  helm: 'bg-cyan-50 text-cyan-600',
};

const TERRAFORM_CATEGORY_ICON: Record<string, string> = {
  vpc: 'lan',
  ecs: 'dns',
  eks: 'workspaces',
  rds: 'storage',
  alb: 'router',
  security_group: 'security',
};

const K8S_KIND_ICON: Record<string, string> = {
  Deployment: 'deployed_code',
  Service: 'lan',
  Ingress: 'router',
  StatefulSet: 'database',
  DaemonSet: 'memory',
  ConfigMap: 'settings',
  Secret: 'key',
  Namespace: 'folder',
  Job: 'schedule',
  CronJob: 'schedule',
};

function infraResourceIcon(resource: InfraResource) {
  if (resource.source === 'terraform') return TERRAFORM_CATEGORY_ICON[resource.resource_category ?? ''] ?? 'category';
  if (resource.source === 'kubernetes') return K8S_KIND_ICON[resource.resource_type] ?? 'widgets';
  return INFRA_SOURCE_ICON.helm;
}

function jobTone(job: PipelineRunJob): StatusTone {
  if (job.status !== 'completed') return 'warning';
  if (job.conclusion === 'success') return 'success';
  if (job.conclusion === 'failure' || job.conclusion === 'timed_out' || job.conclusion === 'action_required') return 'danger';
  return 'neutral';
}

function jobStatusIcon(tone: StatusTone) {
  if (tone === 'success') return 'check';
  if (tone === 'danger') return 'close';
  if (tone === 'warning') return 'sync';
  return 'radio_button_unchecked';
}

const STEP_CIRCLE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success text-white',
  danger: 'bg-danger text-white',
  warning: 'bg-warning text-white',
  neutral: 'bg-background border border-border text-text-muted',
};

const PILL_TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  neutral: 'bg-background text-text-secondary',
};

function runTone(pw: PipelineWithRun): StatusTone {
  if (!pw.latestRun) return 'neutral';
  if (pw.latestRun.status !== 'completed') return 'warning';
  if (pw.latestRun.conclusion === 'success') return 'success';
  if (pw.latestRun.conclusion === 'failure') return 'danger';
  return 'neutral';
}

function deploymentTone(status: string | null): StatusTone {
  if (!status) return 'neutral';
  if (status === 'success') return 'success';
  if (status === 'failure' || status === 'error') return 'danger';
  if (status === 'in_progress' || status === 'queued' || status === 'pending') return 'warning';
  return 'neutral';
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

// Compact, non-stretching chip flow for a pipeline run's jobs — each chip's
// color/icon reflects that job's actual status/conclusion from the GitHub
// API, so this is real live status, not a progress bar (chips don't stretch
// to fill the row — a job list of 3 or 8 looks the same size per chip).
function RunStepper({ jobs }: { jobs: PipelineRunJob[] }) {
  return (
    <div className="flex items-center flex-wrap gap-y-2 gap-x-1">
      {jobs.map((job, i) => {
        const tone = jobTone(job);
        return (
          <Fragment key={job.id}>
            {i > 0 && <Icon name="chevron_right" className="text-[14px] text-text-muted shrink-0" />}
            <span className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-xs font-medium ${PILL_TONE_CLASSES[tone]}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${STEP_CIRCLE_CLASSES[tone]}`}>
                <Icon name={jobStatusIcon(tone)} className="text-[10px]" />
              </span>
              {job.name}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

// Colored by what kind of stage it is (build/test/deploy/...), not by
// run status — these have no run history at all (it's just the ordered
// stage list parsed from a CI file), so a red/green/amber status color here
// would falsely imply pass/fail. The keyword tint is purely categorical, so
// a "Deploy" stage always reads the same regardless of whether it succeeded.
const STAGE_KEYWORD_CLASSES: Array<{ match: RegExp; className: string }> = [
  { match: /deploy|release|publish|ship/i, className: 'bg-emerald-50 text-emerald-700' },
  { match: /test|qa|verify|e2e/i, className: 'bg-violet-50 text-violet-700' },
  { match: /security|scan|audit|vulnerab/i, className: 'bg-rose-50 text-rose-700' },
  { match: /lint|format|analy/i, className: 'bg-amber-50 text-amber-700' },
  { match: /build|compile|package/i, className: 'bg-sky-50 text-sky-700' },
  { match: /checkout|clone|setup|install/i, className: 'bg-slate-100 text-slate-700' },
];

function stageChipClasses(name: string) {
  return STAGE_KEYWORD_CLASSES.find((k) => k.match.test(name))?.className ?? 'bg-background text-text-secondary';
}

function StageStepper({ stages }: { stages: PipelineDefinitionStage[] }) {
  return (
    <div className="flex items-center flex-wrap gap-1.5">
      {stages.map((stage, i) => (
        <Fragment key={stage.id}>
          {i > 0 && <Icon name="chevron_right" className="text-[14px] text-text-muted shrink-0" />}
          <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${stageChipClasses(stage.name)}`}>{stage.name}</span>
        </Fragment>
      ))}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  count,
  chipClassName = 'bg-primary-light text-primary',
}: {
  icon: string;
  title: string;
  description?: string;
  count?: number;
  chipClassName?: string;
}) {
  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${chipClassName}`}>
          <Icon name={icon} className="text-[17px]" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {count !== undefined && (
          <span className="text-xs font-semibold text-text-secondary bg-background rounded-full px-2 py-0.5">{count}</span>
        )}
      </div>
      {description && <p className="text-xs text-text-secondary mt-1.5 ml-11">{description}</p>}
    </div>
  );
}

export default function DeliveryDashboard() {
  const { project } = useProject();
  const [repoGroups, setRepoGroups] = useState<RepoGroup[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [pipelineDefs, setPipelineDefs] = useState<PipelineDefWithStages[]>([]);
  const [containers, setContainers] = useState<DiscoveredContainer[]>([]);
  const [infraResources, setInfraResources] = useState<InfraResource[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!project) return;
    const [repos, allPipelines, deploymentRows, pipelineDefRows, containerRows, infraResourceRows] = await Promise.all([
      fetchRepositories(project.id),
      fetchPipelines(project.id),
      fetchDeployments(project.id),
      fetchPipelineDefinitions(project.id),
      fetchDiscoveredContainers(project.id),
      fetchInfraResources(project.id),
    ]);

    const groups = await Promise.all(
      repos.map(async (repo) => {
        const branches = await fetchRepoBranches(project.id, repo.id);
        const pipelines = allPipelines.filter((p) => p.repository_id === repo.id);
        const pipelinesWithRuns = await Promise.all(
          pipelines.map(async (pipeline) => {
            const runs = await fetchPipelineRuns(project.id, pipeline.id, 1);
            const latestRun = runs[0] ?? null;
            const jobs = latestRun ? await fetchPipelineRunJobs(project.id, latestRun.id) : [];
            return { pipeline, latestRun, jobs };
          })
        );
        return { repo, branches, pipelines: pipelinesWithRuns };
      })
    );

    const defsWithStages = await Promise.all(
      pipelineDefRows.map(async (def) => ({ def, stages: await fetchPipelineDefinitionStages(project.id, def.id) }))
    );

    setRepoGroups(groups);
    setDeployments(deploymentRows);
    setPipelineDefs(defsWithStages);
    setContainers(containerRows);
    setInfraResources(infraResourceRows);
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Delivery data changes on the order of minutes (CI runs, deploys, files
  // changing), not seconds — a lighter poll than the telemetry dashboards is
  // enough to reflect either the poll-github-repo Edge Function's ~30 minute
  // cron cadence or the SDK's own heartbeat interval.
  useEffect(() => {
    if (!project) return;
    const interval = setInterval(() => load(), 30_000);
    return () => clearInterval(interval);
  }, [project, load]);

  const hasAnyRepo = repoGroups.length > 0;
  const hasNothing =
    !loading && !hasAnyRepo && pipelineDefs.length === 0 && containers.length === 0 && infraResources.length === 0;

  const livePipelineCount = repoGroups.reduce((sum, g) => sum + g.pipelines.length, 0);
  const branchCount = repoGroups.reduce((sum, g) => sum + g.branches.length, 0);

  // KPI chip colors reflect real signal, same convention as the other
  // dashboards (e.g. SecurityDashboard, InfrastructureDashboard) — danger
  // for a failing run/deployment, success once there's healthy coverage,
  // neutral only when there's nothing to judge yet.
  const allLivePipelines = repoGroups.flatMap((g) => g.pipelines);
  const pipelinesTone: StatusTone = allLivePipelines.some((pw) => runTone(pw) === 'danger')
    ? 'danger'
    : allLivePipelines.some((pw) => runTone(pw) === 'warning')
      ? 'warning'
      : livePipelineCount + pipelineDefs.length > 0
        ? 'success'
        : 'neutral';
  const deploymentsTone: StatusTone = deployments[0] ? deploymentTone(deployments[0].status) : 'neutral';
  const infraTone: StatusTone = containers.length + infraResources.length > 0 ? 'success' : 'neutral';

  const resourcesBySource = useMemo(() => {
    const groups: Record<InfraResourceSource, InfraResource[]> = { terraform: [], kubernetes: [], helm: [] };
    for (const r of infraResources) groups[r.source].push(r);
    return groups;
  }, [infraResources]);

  // Grouped by service rather than shown as a flat list — a service name
  // buried at the far right of an otherwise unrelated-looking row (the
  // previous layout) makes it hard to tell which pipelines belong together.
  const pipelineDefsByService = useMemo(() => {
    const groups = new Map<string, PipelineDefWithStages[]>();
    for (const item of pipelineDefs) {
      const list = groups.get(item.def.service_name) ?? [];
      list.push(item);
      groups.set(item.def.service_name, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [pipelineDefs]);

  return (
    <>
      <PageHeader
        title="Delivery Dashboard"
        subtitle={
          project ? `${project.environment.toUpperCase()} · repository, CI/CD pipelines, deployments, and containers` : undefined
        }
      />

      {hasNothing ? (
        <Card>
          <EmptyState
            icon="account_tree"
            title="No delivery data yet"
            description="Connect a GitHub repository from Project Settings → Integrations for live pipeline runs and deployments, or just install the SDK in a service with a CI config / Dockerfile / docker-compose.yml — pipeline stages and containers are discovered automatically, no integration required."
            action={
              project ? (
                <Link
                  to={`/projects/${project.id}/settings`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
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
              label="Repositories"
              value={repoGroups.length}
              icon="folder_code"
              hint={repoGroups.length > 0 ? `${branchCount} branch${branchCount === 1 ? '' : 'es'} tracked` : 'None connected yet'}
            />
            <KpiCard
              label="CI/CD Pipelines"
              value={livePipelineCount + pipelineDefs.length}
              icon="account_tree"
              hint={`${livePipelineCount} live via GitHub · ${pipelineDefs.length} via SDK`}
              deltaTone={pipelinesTone}
            />
            <KpiCard
              label="Deployments"
              value={deployments.length}
              icon="rocket_launch"
              hint={deployments[0] ? `Last: ${timeAgo(deployments[0].updated_at_source)}` : 'None recorded yet'}
              deltaTone={deploymentsTone}
            />
            <KpiCard
              label="Infrastructure"
              value={containers.length + infraResources.length}
              icon="dns"
              hint={`${containers.length} container${containers.length === 1 ? '' : 's'} · ${infraResources.length} IaC resource${infraResources.length === 1 ? '' : 's'}`}
              deltaTone={infraTone}
            />
          </div>

          {hasAnyRepo ? (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary flex items-center gap-2">
                <Icon name="verified" className="text-[14px] text-primary" />
                Live from GitHub
              </h3>

              {repoGroups.map(({ repo, branches, pipelines }) => (
                <Card key={repo.id} className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                        <Icon name="folder_code" className="text-[18px]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {repo.html_url ? (
                            <a
                              href={repo.html_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-base font-semibold text-text-primary hover:underline hover:text-primary truncate"
                            >
                              {repo.full_name}
                            </a>
                          ) : (
                            <span className="text-base font-semibold text-text-primary truncate">{repo.full_name}</span>
                          )}
                          {repo.visibility && <StatusPill tone="neutral">{repo.visibility}</StatusPill>}
                        </div>
                        {repo.description && <p className="text-xs text-text-secondary mt-1 max-w-2xl">{repo.description}</p>}
                        <div className="flex items-center gap-3 mt-2 text-xs text-text-secondary flex-wrap">
                          {repo.primary_language && (
                            <span className="flex items-center gap-1">
                              <Icon name="code" className="text-[14px]" />
                              {repo.primary_language}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Icon name="fork_right" className="text-[14px]" />
                            {branches.length} branch{branches.length === 1 ? '' : 'es'} · default {repo.default_branch ?? '—'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Icon name="sync" className="text-[14px]" />
                            Synced {timeAgo(repo.last_synced_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {pipelines.length === 0 ? (
                    <p className="text-sm text-text-secondary border-t border-border pt-3">
                      No GitHub Actions workflows found in .github/workflows.
                    </p>
                  ) : (
                    <div className="border-t border-border pt-4 space-y-5">
                      {pipelines.map((pw) => (
                        <div key={pw.pipeline.id}>
                          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                            <div className="flex items-center gap-2">
                              <Icon name="developer_board" className="text-[16px] text-text-secondary" />
                              <span className="text-sm font-semibold text-text-primary">{pw.pipeline.name}</span>
                              {pw.pipeline.workflow_file && (
                                <span className="text-xs text-text-muted font-mono">{pw.pipeline.workflow_file}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusPill tone={runTone(pw)}>
                                {pw.latestRun ? pw.latestRun.conclusion ?? pw.latestRun.status ?? 'unknown' : 'no runs yet'}
                              </StatusPill>
                              {pw.latestRun?.html_url && (
                                <a
                                  href={pw.latestRun.html_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary hover:underline"
                                >
                                  View run →
                                </a>
                              )}
                            </div>
                          </div>

                          {pw.jobs.length > 0 ? (
                            <div className="pl-1">
                              <RunStepper jobs={pw.jobs} />
                            </div>
                          ) : (
                            <p className="text-xs text-text-muted pl-6">No job data for the latest run yet.</p>
                          )}

                          {pw.latestRun && (
                            <p className="text-xs text-text-muted pl-1 mt-2">
                              {pw.latestRun.head_branch ?? '—'} @ {pw.latestRun.head_sha?.slice(0, 7) ?? '—'} by{' '}
                              {pw.latestRun.actor ?? 'unknown'} · {timeAgo(pw.latestRun.run_started_at)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}

              <Card className="overflow-hidden">
                <SectionHeader
                  icon="rocket_launch"
                  title="Deployments"
                  count={deployments.length}
                  chipClassName="bg-amber-50 text-amber-600"
                />
                {deployments.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      icon="rocket_launch"
                      title="No deployments yet"
                      description="Deployments reported by GitHub Actions will appear here."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-text-secondary uppercase tracking-wide border-b border-border">
                          <th className="px-5 py-2.5 font-semibold">Environment</th>
                          <th className="px-5 py-2.5 font-semibold">Service</th>
                          <th className="px-5 py-2.5 font-semibold">Ref / SHA</th>
                          <th className="px-5 py-2.5 font-semibold">Status</th>
                          <th className="px-5 py-2.5 font-semibold">When</th>
                          <th className="px-5 py-2.5 font-semibold">Runtime</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {deployments.map((deployment) => (
                          <tr key={deployment.id} className="hover:bg-background/60 transition-colors">
                            <td className="px-5 py-3 font-medium text-text-primary">{deployment.environment}</td>
                            <td className="px-5 py-3 text-text-secondary">{deployment.service_name}</td>
                            <td className="px-5 py-3 font-mono text-xs text-text-secondary">
                              {deployment.ref ?? '—'} {deployment.sha ? `@ ${deployment.sha.slice(0, 7)}` : ''}
                            </td>
                            <td className="px-5 py-3">
                              <StatusPill tone={deploymentTone(deployment.status)}>{deployment.status ?? 'unknown'}</StatusPill>
                            </td>
                            <td className="px-5 py-3 text-text-secondary text-xs">{timeAgo(deployment.updated_at_source)}</td>
                            <td className="px-5 py-3">
                              {project && (
                                <Link
                                  to={`/projects/${project.id}/architecture`}
                                  className="text-xs text-primary hover:underline"
                                  title="See this service's discovered runtime & infrastructure"
                                >
                                  View runtime →
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card className="p-5 flex items-center gap-4 flex-wrap">
              <div className="w-9 h-9 rounded-lg bg-background text-text-muted flex items-center justify-center shrink-0">
                <Icon name="folder_off" className="text-[18px]" />
              </div>
              <p className="text-sm text-text-secondary flex-1 min-w-[200px]">
                No GitHub repository connected — connect one for live pipeline runs, real deployment status, and branch info.
              </p>
              {project && (
                <Link to={`/projects/${project.id}/settings`} className="text-sm font-semibold text-primary hover:underline shrink-0">
                  Go to Settings →
                </Link>
              )}
            </Card>
          )}

          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary flex items-center gap-2">
            <Icon name="bolt" className="text-[14px] text-primary" />
            Zero-config discovery via SDK — no integration or token required
          </h3>

          <Card className="overflow-hidden">
            <SectionHeader
              icon="account_tree"
              title="Discovered Pipelines"
              count={pipelineDefs.length}
              description="Detected from CI config files (.github/workflows, .gitlab-ci.yml, azure-pipelines.yml, .circleci/config.yml, bitbucket-pipelines.yml, Jenkinsfile). Shows pipeline structure only, not run history."
            />
            {pipelineDefsByService.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="account_tree"
                  title="No CI config detected yet"
                  description="Once the SDK sees a supported CI config file in a service's working directory, its stages show up here on the next heartbeat."
                  iconClassName="bg-primary-light text-primary"
                />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pipelineDefsByService.map(([serviceName, defs]) => (
                  <div key={serviceName} className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-md bg-background flex items-center justify-center">
                        <Icon name="dns" className="text-[14px] text-text-secondary" />
                      </span>
                      <h3 className="text-sm font-semibold text-text-primary">{serviceName}</h3>
                      <span className="text-xs text-text-secondary">
                        {defs.length} pipeline{defs.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {defs.map(({ def, stages }) => (
                        <div
                          key={def.id}
                          className={`border border-border border-l-4 rounded-lg p-3.5 hover:shadow-sm hover:border-l-[6px] transition-all ${PROVIDER_ACCENT_BORDER[def.provider]}`}
                        >
                          <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${PROVIDER_CHIP_CLASSES[def.provider]}`}
                              >
                                <Icon name={PROVIDER_ICON[def.provider]} className="text-[14px]" />
                              </span>
                              <span className="text-sm font-semibold text-text-primary shrink-0">{PROVIDER_LABEL[def.provider]}</span>
                              {def.name && def.name !== PROVIDER_LABEL[def.provider] && (
                                <>
                                  <span className="text-text-muted shrink-0">·</span>
                                  <span className="text-sm text-text-secondary truncate">{def.name}</span>
                                </>
                              )}
                            </div>
                            <span className="text-xs text-text-muted font-mono truncate">{def.file_path}</span>
                          </div>
                          {stages.length > 0 ? (
                            <StageStepper stages={stages} />
                          ) : (
                            <p className="text-xs text-text-muted">No stages parsed from this file.</p>
                          )}
                          <p className="text-[11px] text-text-muted mt-2">Seen {timeAgo(def.last_seen_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <SectionHeader
              icon="inventory_2"
              title="Discovered Containers"
              count={containers.length}
              chipClassName="bg-teal-50 text-teal-600"
            />
            {containers.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="inventory_2"
                  title="No Dockerfile or compose file detected yet"
                  description="A Dockerfile or docker-compose.yml in a service's working directory shows up here automatically."
                  iconClassName="bg-teal-50 text-teal-600"
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-secondary uppercase tracking-wide border-b border-border">
                      <th className="px-5 py-2.5 font-semibold">Container</th>
                      <th className="px-5 py-2.5 font-semibold">Service</th>
                      <th className="px-5 py-2.5 font-semibold">Source</th>
                      <th className="px-5 py-2.5 font-semibold">Image</th>
                      <th className="px-5 py-2.5 font-semibold">Ports</th>
                      <th className="px-5 py-2.5 font-semibold">Depends On</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {containers.map((c) => (
                      <tr key={c.id} className="hover:bg-background/60 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Icon name="inventory_2" className="text-[15px] text-text-muted" />
                            <span className="font-medium text-text-primary">{c.container_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-text-secondary">{c.service_name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-text-secondary">{c.source_file}</td>
                        <td className="px-5 py-3 font-mono text-xs text-text-secondary">{c.image ?? '—'}</td>
                        <td className="px-5 py-3 font-mono text-xs text-text-secondary">{(c.ports ?? []).join(', ') || '—'}</td>
                        <td className="px-5 py-3 text-xs text-text-secondary">{(c.depends_on ?? []).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <SectionHeader
              icon="dns"
              title="Discovered Infrastructure"
              count={infraResources.length}
              description="Detected from Terraform (*.tf), Kubernetes manifests, and Helm charts (Chart.yaml). Lists declared resources; doesn't infer relationships between them."
              chipClassName="bg-violet-50 text-violet-600"
            />
            {infraResources.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="dns"
                  title="No Terraform, Kubernetes, or Helm files detected yet"
                  description="Terraform resources, Kubernetes manifests, or a Helm chart in a service's working directory show up here automatically."
                  iconClassName="bg-violet-50 text-violet-600"
                />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(['terraform', 'kubernetes', 'helm'] as const).map((source) =>
                  resourcesBySource[source].length === 0 ? null : (
                    <div key={source} className="p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center ${INFRA_SOURCE_CHIP_CLASSES[source]}`}>
                          <Icon name={INFRA_SOURCE_ICON[source]} className="text-[14px]" />
                        </span>
                        <h3 className="text-sm font-semibold text-text-primary">{INFRA_SOURCE_LABEL[source]}</h3>
                        <span className="text-xs font-semibold text-text-secondary bg-background rounded-full px-2 py-0.5">
                          {resourcesBySource[source].length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {resourcesBySource[source].map((resource) => (
                          <div
                            key={resource.id}
                            className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-background/40 hover:bg-background hover:border-text-muted/40 transition-colors"
                            title={resource.source_file}
                          >
                            <Icon name={infraResourceIcon(resource)} className="text-[16px] text-text-secondary shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-text-primary truncate max-w-[220px]">
                                {resource.resource_name}
                              </div>
                              <div className="text-[11px] text-text-secondary truncate max-w-[220px]">
                                {resource.resource_type}
                                {resource.namespace && ` · ns: ${resource.namespace}`}
                                {' · '}
                                {resource.service_name}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
