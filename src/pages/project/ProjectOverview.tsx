import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Icon, PageHeader, StatusPill } from '../../components/ui';
import { Loader } from '../../components/Loader';
import {
  fetchApiMetrics,
  fetchDeployments,
  fetchDiscoveredContainers,
  fetchDiscoveredServices,
  fetchErrorSummary,
  fetchInfraResources,
  fetchLatestCodeScans,
  fetchLatestInfraSnapshots,
  fetchPipelines,
  fetchProjectActiveAlerts,
  fetchProjectHealth,
  fetchRepositories,
  fetchServiceDependencyEdges,
  fetchTraces,
  fetchVulnerabilityFindings,
  isServiceOnline,
  type ApiMetrics,
} from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type {
  AlertHistoryEntry,
  AlertType,
  CodeScan,
  Deployment,
  DiscoveredContainer,
  DiscoveredService,
  ErrorEvent,
  InfraResource,
  InfraSnapshot,
  Pipeline,
  ProjectHealth,
  Repository,
} from '../../lib/types';
import { RequestVolumeChart } from '../../components/charts/RequestVolumeChart';
import { BarSparkline } from '../../components/charts/Sparkline';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

function healthTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

function healthLabel(score: number): string {
  if (score >= 80) return 'Healthy';
  if (score >= 50) return 'Needs Attention';
  return 'Critical';
}

function formatCompact(n: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function formatUptime(totalSeconds: number) {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// CPU/memory pressure, not a status tone reused from elsewhere — thresholds
// chosen so "success" only means genuinely comfortable headroom.
function meterTone(pct: number): 'success' | 'warning' | 'danger' {
  if (pct >= 90) return 'danger';
  if (pct >= 70) return 'warning';
  return 'success';
}

const TONE_RING: Record<Tone, string> = {
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  neutral: '#94A3B8',
};

// The unfilled track uses the same *-light token already in tailwind.config.js
// as every other status surface in this app (StatusPill, KpiCard's icon chip) —
// a lighter step of the same ramp, not an unrelated gray.
const TONE_TRACK: Record<Tone, string> = {
  success: '#ECFDF5',
  warning: '#FFFBEB',
  danger: '#FEF2F2',
  neutral: '#F1F5F9',
};

const METER_TRACK_CLASS: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-success-light',
  warning: 'bg-warning-light',
  danger: 'bg-danger-light',
};

const METER_FILL_CLASS: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

function Meter({ pct }: { pct: number }) {
  const tone = meterTone(pct);
  return (
    <div className={`h-1.5 rounded-full overflow-hidden ${METER_TRACK_CLASS[tone]}`}>
      <div
        className={`h-full rounded-full transition-all ${METER_FILL_CLASS[tone]}`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  );
}

function HealthGauge({ score, tone }: { score: number; tone: Tone }) {
  const size = 116;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(score, 0), 100) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={TONE_TRACK[tone]} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_RING[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-text-primary leading-none">{Math.round(score)}</span>
        <span className="text-[11px] text-text-secondary mt-1">/ 100</span>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  hint,
  trend,
  delta,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: number[];
  delta?: { value: number; goodWhen: 'up' | 'down' };
}) {
  const deltaGood = delta && (delta.value === 0 || (delta.goodWhen === 'up' ? delta.value > 0 : delta.value < 0));
  return (
    <div className="flex flex-col gap-1.5 py-3 sm:py-0 sm:px-4 sm:first:pl-0">
      <div className="flex items-center gap-1.5 text-text-secondary">
        <Icon name={icon} className="text-[16px]" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-text-primary">{value}</span>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${deltaGood ? 'text-success' : 'text-danger'}`}>
            <Icon name={delta.value === 0 ? 'trending_flat' : delta.value > 0 ? 'trending_up' : 'trending_down'} className="text-[13px]" />
            {Math.abs(delta.value).toFixed(1)}%
          </span>
        )}
      </div>
      {hint && <span className="text-[11px] text-text-secondary">{hint}</span>}
      {trend && (
        <div className="mt-0.5 -mx-1 w-24">
          <BarSparkline data={trend} color={TONE_RING.neutral} />
        </div>
      )}
    </div>
  );
}

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

function exportProjectReport(projectName: string, health: ProjectHealth | null, services: DiscoveredService[]) {
  const lines = [
    `Project,${projectName}`,
    `Health Score,${health?.score ?? ''}`,
    `Requests (1h),${health?.total_requests_1h ?? ''}`,
    `Error Rate (1h),${((health?.error_rate_1h ?? 0) * 100).toFixed(2)}%`,
    `Services,${services.length}`,
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const SERVICE_ICON: Record<string, string> = {
  application: 'dns',
  database: 'storage',
  cache: 'speed',
  external_api: 'public',
};

function deploymentTone(status: string | null): Tone {
  const s = status?.toLowerCase() ?? '';
  if (['success', 'completed', 'active'].includes(s)) return 'success';
  if (['failure', 'error', 'failed'].includes(s)) return 'danger';
  return 'neutral';
}

const CHIP_CLASS: Record<Tone, string> = {
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  neutral: 'bg-primary-light text-primary',
};

function SnapshotStat({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
  to,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  to: string;
}) {
  return (
    <Link to={to} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-background transition-colors">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${CHIP_CLASS[tone]}`}>
        <Icon name={icon} className="text-[18px]" />
      </div>
      <div className="min-w-0">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide block">{label}</span>
        <span className="text-sm font-bold text-text-primary block truncate">{value}</span>
        {hint && <span className="text-[11px] text-text-secondary block truncate">{hint}</span>}
      </div>
    </Link>
  );
}

function CapabilityTile({
  icon,
  title,
  description,
  active,
  to,
}: {
  icon: string;
  title: string;
  description: string;
  active: boolean;
  to?: string;
}) {
  const inner = (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-background transition-colors h-full">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-primary-light text-primary' : 'bg-background text-text-muted'}`}>
        <Icon name={icon} className="text-[20px]" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-success' : 'bg-text-muted'}`}
            title={active ? 'Detected on this project' : 'Not detected yet'}
          />
        </div>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  ) : (
    <div className="h-full">{inner}</div>
  );
}

type SetupStep = { key: string; label: string; done: boolean };

// Two sizes of the same data (steps computed once in the component below):
// `full` replaces the old plain "install the SDK" empty state when there's no
// telemetry at all, `compact` is a persistent nudge for projects that have
// *some* signal but haven't connected everything yet — shown until every step
// is done, then it disappears rather than nagging a mature project forever.
function SetupChecklist({ steps, projectId, variant }: { steps: SetupStep[]; projectId: string; variant: 'full' | 'compact' }) {
  const doneCount = steps.filter((s) => s.done).length;

  if (variant === 'compact') {
    return (
      <Card className="p-4 mb-6 border-primary/20 bg-primary-light/40">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Icon name="checklist" className="text-primary text-[20px] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">Finish setting up this project</p>
              <p className="text-xs text-text-secondary truncate">
                Still to do: {steps.filter((s) => !s.done).map((s) => s.label).join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-semibold text-text-secondary">
              {doneCount}/{steps.length} done
            </span>
            <Link to={`/projects/${projectId}/onboarding`}>
              <Button variant="secondary">Continue Setup</Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-primary-light text-primary flex items-center justify-center shrink-0">
          <Icon name="rocket_launch" className="text-[22px]" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-text-primary">Let's get this project reporting live data</h2>
          <p className="text-sm text-text-secondary mt-1">Complete these steps to unlock the full dashboard.</p>
        </div>
      </div>
      <div className="space-y-2.5 mb-5">
        {steps.map((step) => (
          <div key={step.key} className="flex items-center gap-3">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                step.done ? 'bg-success text-white' : 'bg-background border border-border'
              }`}
            >
              {step.done && <Icon name="check" className="text-[14px]" />}
            </div>
            <span className={`text-sm ${step.done ? 'text-text-secondary line-through' : 'text-text-primary font-medium'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <Link to={`/projects/${projectId}/onboarding`}>
          <Button variant="primary">
            <Icon name="arrow_forward" className="text-[18px]" />
            Start Setup Guide
          </Button>
        </Link>
        <Link to={`/projects/${projectId}/settings`} className="text-sm font-semibold text-primary hover:underline">
          View API Key
        </Link>
      </div>
    </Card>
  );
}

export default function ProjectOverview() {
  const { project, loading: projectLoading } = useProject();
  const [health, setHealth] = useState<ProjectHealth | null>(null);
  const [infra, setInfra] = useState<InfraSnapshot[]>([]);
  const [services, setServices] = useState<DiscoveredService[]>([]);
  const [apiMetrics, setApiMetrics] = useState<ApiMetrics | null>(null);
  const [recentErrors, setRecentErrors] = useState<ErrorEvent[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertHistoryEntry[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [containers, setContainers] = useState<DiscoveredContainer[]>([]);
  const [infraResources, setInfraResources] = useState<InfraResource[]>([]);
  const [vulnerabilityTotal, setVulnerabilityTotal] = useState(0);
  const [traceCount, setTraceCount] = useState(0);
  const [dependencyCount, setDependencyCount] = useState(0);
  const [codeScans, setCodeScans] = useState<CodeScan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!project) return;
    const [
      healthData,
      infraData,
      servicesData,
      apiData,
      errorData,
      alertData,
      repoData,
      pipelineData,
      deploymentData,
      containerData,
      infraResourceData,
      vulnerabilityData,
      traceData,
      dependencyData,
      codeScanData,
    ] = await Promise.all([
      fetchProjectHealth(project.id),
      fetchLatestInfraSnapshots(project.id),
      fetchDiscoveredServices(project.id),
      fetchApiMetrics(project.id),
      fetchErrorSummary(project.id),
      fetchProjectActiveAlerts(project.id),
      fetchRepositories(project.id),
      fetchPipelines(project.id),
      fetchDeployments(project.id),
      fetchDiscoveredContainers(project.id),
      fetchInfraResources(project.id),
      fetchVulnerabilityFindings(project.id, { pageSize: 1 }),
      fetchTraces(project.id),
      fetchServiceDependencyEdges(project.id),
      fetchLatestCodeScans(project.id),
    ]);
    setHealth(healthData);
    setInfra(infraData);
    setServices(servicesData);
    setApiMetrics(apiData);
    setRecentErrors(errorData.recent.slice(0, 5));
    setActiveAlerts(alertData);
    setRepositories(repoData);
    setPipelines(pipelineData);
    setDeployments(deploymentData);
    setContainers(containerData);
    setInfraResources(infraResourceData);
    setVulnerabilityTotal(vulnerabilityData.total);
    setTraceCount(traceData.length);
    setDependencyCount(dependencyData.length);
    setCodeScans(codeScanData);
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (projectLoading || loading || !project) {
    return (
      <>
        <Loader fullScreen={false} messages={['Loading project overview...', 'Fetching live telemetry...']} />
      </>
    );
  }

  const hasTelemetry = services.length > 0;
  const appServices = services.filter((s) => s.service_type === 'application');
  const languages = [...new Set(appServices.map((s) => s.language).filter(Boolean))];
  const frameworks = [...new Set(appServices.map((s) => s.framework).filter((f) => f && f !== 'unknown'))];
  const primaryStack = [languages.join('/'), frameworks.join('/')].filter(Boolean).join(' · ');
  const avgCpu = infra.length ? infra.reduce((s, x) => s + (x.cpu_percent ?? 0), 0) / infra.length : 0;
  const avgMemPct = infra.length
    ? (infra.reduce((s, x) => s + (x.memory_total_mb ? (x.memory_used_mb ?? 0) / x.memory_total_mb : 0), 0) / infra.length) * 100
    : 0;
  const maxUptime = infra.length ? Math.max(...infra.map((s) => s.uptime_seconds ?? 0)) : 0;

  const setupSteps: SetupStep[] = [
    { key: 'sdk', label: 'Install & initialize the SDK', done: services.length > 0 },
    { key: 'traffic', label: 'Send real request traffic', done: (apiMetrics?.totalRequests ?? 0) > 0 },
    { key: 'repo', label: 'Connect a Git repository', done: repositories.length > 0 },
    { key: 'scan', label: 'Enable security scanning', done: codeScans.length > 0 },
  ];
  const allSetupDone = setupSteps.every((s) => s.done);

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={`${project.environment} environment · created ${new Date(project.created_at).toLocaleDateString()}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => exportProjectReport(project.name, health, services)}>
              <Icon name="download" className="text-[18px]" />
              Export Report
            </Button>
            <Link to={`/projects/${project.id}/settings`}>
              <Button variant="secondary">
                <Icon name="settings" className="text-[18px]" />
                Settings
              </Button>
            </Link>
          </>
        }
      />

      {!hasTelemetry ? (
        <SetupChecklist variant="full" projectId={project.id} steps={setupSteps} />
      ) : (
        <>
          {!allSetupDone && <SetupChecklist variant="compact" projectId={project.id} steps={setupSteps} />}

          <Card className="p-6 mb-6">
            <div className="flex flex-col lg:flex-row items-center lg:items-stretch gap-6">
              <div className="flex items-center gap-5 shrink-0">
                <HealthGauge score={health?.score ?? 0} tone={health ? healthTone(health.score) : 'neutral'} />
                <div className="max-w-[220px]">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Project Health</span>
                  <div className="mt-1.5">
                    <StatusPill tone={health ? healthTone(health.score) : 'neutral'}>
                      {health ? healthLabel(health.score) : 'Unknown'}
                    </StatusPill>
                  </div>
                  <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                    {activeAlerts.length > 0
                      ? `${activeAlerts.length} active alert${activeAlerts.length === 1 ? '' : 's'} needs attention.`
                      : (apiMetrics?.errorRatePct ?? 0) > 1
                        ? `Error rate is elevated at ${(apiMetrics?.errorRatePct ?? 0).toFixed(1)}%.`
                        : 'All monitored services are within normal thresholds.'}
                  </p>
                </div>
              </div>

              <div className="hidden lg:block w-px bg-border" />

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
                <MiniStat
                  icon="dns"
                  label="Services"
                  value={services.length}
                  hint={`${services.filter(isServiceOnline).length} online`}
                />
                <MiniStat
                  icon="swap_horiz"
                  label="Requests / hr"
                  value={formatCompact(health?.total_requests_1h ?? 0)}
                  delta={apiMetrics ? { value: apiMetrics.requestCountDeltaPct, goodWhen: 'up' } : undefined}
                  trend={apiMetrics?.hourlyVolume}
                />
                <MiniStat
                  icon="error"
                  label="Error Rate"
                  value={`${(apiMetrics?.errorRatePct ?? 0).toFixed(1)}%`}
                  hint="last 24h, 4xx + 5xx"
                  delta={apiMetrics ? { value: apiMetrics.errorRateDeltaPct, goodWhen: 'down' } : undefined}
                />
                <MiniStat icon="schedule" label="Uptime" value={formatUptime(maxUptime)} hint="longest-running instance" />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
            <Card className="lg:col-span-6 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Request Volume</h2>
                  <p className="text-xs text-text-secondary">Last 24 hours</p>
                </div>
                {apiMetrics && apiMetrics.totalRequests > 0 && (
                  <div className="text-right">
                    <span className="text-xl font-bold text-text-primary block leading-none">
                      {formatCompact(apiMetrics.totalRequests)}
                    </span>
                    <span className="text-[11px] text-text-secondary">total requests</span>
                  </div>
                )}
              </div>
              <RequestVolumeChart data={apiMetrics?.hourlyVolume ?? new Array(24).fill(0)} />
            </Card>

            <Card className="lg:col-span-3 p-5">
              <h2 className="text-base font-semibold text-text-primary mb-4">Subsystems</h2>
              <div className="space-y-2">
                {services.slice(0, 4).map((s) => {
                  const online = isServiceOnline(s);
                  const stack = [s.language, s.framework, s.runtime].filter(Boolean).join(' · ');
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border border-border rounded-md px-3 py-2 hover:bg-background hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                          <Icon name={SERVICE_ICON[s.service_type] ?? 'dns'} className="text-[16px]" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-text-primary truncate block">{s.name}</span>
                          {stack && <span className="text-[11px] text-text-secondary truncate block">{stack}</span>}
                        </div>
                      </div>
                      <StatusPill tone={online ? 'success' : 'neutral'}>{online ? 'Online' : 'Offline'}</StatusPill>
                    </div>
                  );
                })}
              </div>
              {services.length > 4 && (
                <Link
                  to={`/projects/${project.id}/architecture`}
                  className="mt-3 flex items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View more
                  <Icon name="arrow_forward" className="text-[16px]" />
                </Link>
              )}
            </Card>

            <Card className="lg:col-span-3 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-text-primary">Active Alerts</h2>
                {activeAlerts.length > 0 && (
                  <span className="text-xs font-semibold text-danger bg-danger/10 px-2 py-0.5 rounded-full">
                    {activeAlerts.length}
                  </span>
                )}
              </div>
              {activeAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2.5 py-6 bg-success-light/60 rounded-lg text-center">
                  <div className="w-10 h-10 rounded-full bg-success-light text-success flex items-center justify-center">
                    <Icon name="check_circle" className="text-[22px]" />
                  </div>
                  <p className="text-xs font-medium text-text-secondary">All systems stable</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`border-l-4 rounded-md p-2.5 ${
                        alert.severity === 'critical' ? 'border-l-danger bg-danger/5' : 'border-l-warning bg-warning/5'
                      }`}
                    >
                      <p className="text-xs font-semibold text-text-primary">{alertTitle[alert.alert_type]}</p>
                      <p className="text-[11px] text-text-secondary mt-0.5">{alert.message}</p>
                      <span className="text-[11px] text-text-muted">{timeAgo(alert.triggered_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5 mb-6">
            <h2 className="text-base font-semibold text-text-primary mb-4">Delivery &amp; Infrastructure Snapshot</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <SnapshotStat
                icon="code"
                label="Repositories"
                value={repositories.length}
                hint={repositories.length > 0 ? repositories[0].full_name : 'None linked yet'}
                to={`/projects/${project.id}/architecture`}
              />
              <SnapshotStat
                icon="sync"
                label="CI/CD Pipelines"
                value={pipelines.length}
                hint={pipelines.length > 0 ? `${pipelines.filter((p) => p.last_run_conclusion === 'success').length} passing` : 'None detected yet'}
                to={`/projects/${project.id}/delivery`}
              />
              <SnapshotStat
                icon="rocket_launch"
                label="Latest Deployment"
                value={deployments.length > 0 ? deployments[0].environment : 'None yet'}
                hint={deployments.length > 0 ? `${deployments[0].sha?.slice(0, 7) ?? deployments[0].ref ?? ''} · ${timeAgo(deployments[0].created_at_source ?? deployments[0].created_at)}` : 'Connect a repo to track deployments'}
                tone={deployments.length > 0 ? deploymentTone(deployments[0].status) : 'neutral'}
                to={`/projects/${project.id}/delivery`}
              />
              <SnapshotStat
                icon="inventory_2"
                label="Containers"
                value={containers.length}
                hint={containers.length > 0 ? 'Discovered from Docker/Compose files' : 'None discovered yet'}
                to={`/projects/${project.id}/infrastructure`}
              />
              <SnapshotStat
                icon="account_tree"
                label="IaC Resources"
                value={infraResources.length}
                hint={infraResources.length > 0 ? 'Terraform / Kubernetes / Helm' : 'None discovered yet'}
                to={`/projects/${project.id}/infrastructure`}
              />
              <SnapshotStat
                icon="shield"
                label="Open Vulnerabilities"
                value={vulnerabilityTotal}
                hint={vulnerabilityTotal > 0 ? 'From static analysis scans' : 'No findings — all clear'}
                tone={vulnerabilityTotal > 0 ? 'danger' : 'success'}
                to={`/projects/${project.id}/security`}
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
            <Card className="lg:col-span-8 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-text-primary">Recent Errors</h2>
                <Link to={`/projects/${project.id}/errors`} className="text-xs font-semibold text-primary hover:underline">
                  View All
                </Link>
              </div>
              {recentErrors.length === 0 ? (
                <p className="text-sm text-text-secondary">No errors in the recent window.</p>
              ) : (
                <div className="divide-y divide-border">
                  {recentErrors.map((err) => (
                    <div key={err.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{err.error_name}</div>
                        <div className="text-xs text-text-secondary truncate">{err.message || err.service_name}</div>
                      </div>
                      <span className="text-xs text-text-muted shrink-0">{new Date(err.occurred_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="lg:col-span-4 p-5">
              <h2 className="text-base font-semibold text-text-primary mb-4">Resource Usage</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-text-secondary">CPU</span>
                    <span className="text-text-primary font-semibold">{avgCpu.toFixed(1)}%</span>
                  </div>
                  <Meter pct={avgCpu} />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-text-secondary">Memory</span>
                    <span className="text-text-primary font-semibold">{avgMemPct.toFixed(1)}%</span>
                  </div>
                  <Meter pct={avgMemPct} />
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      <Card className="p-5">
        <h2 className="text-base font-semibold text-text-primary mb-3">Project Details</h2>
        <dl className="divide-y divide-border text-sm">
          {primaryStack && (
            <div className="flex justify-between py-2">
              <dt className="text-text-secondary">Tech Stack</dt>
              <dd className="text-text-primary font-medium">{primaryStack}</dd>
            </div>
          )}
          <div className="flex justify-between py-2">
            <dt className="text-text-secondary">Environment</dt>
            <dd className="text-text-primary font-medium capitalize">{project.environment}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-text-secondary">API Key</dt>
            <dd className="text-text-primary font-mono text-xs">{maskKey(project.api_key)}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-text-secondary">Created</dt>
            <dd className="text-text-primary font-medium">{new Date(project.created_at).toLocaleString()}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-6">
        <h2 className="text-base font-semibold text-text-primary mb-1">What EIP Is Monitoring For You</h2>
        <p className="text-xs text-text-secondary mb-4">
          Everything below runs automatically once the SDK is installed — no extra configuration required.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <CapabilityTile
            icon="route"
            title="Distributed Tracing"
            description={
              traceCount > 0
                ? `${traceCount} traces captured, with full request-path timing across services.`
                : 'W3C-compliant distributed tracing — instrument a request to see traces appear here.'
            }
            active={traceCount > 0}
            to={`/projects/${project.id}/traces`}
          />
          <CapabilityTile
            icon="rocket_launch"
            title="Deployment Correlation"
            description={
              deployments.length > 0
                ? `${deployments.length} deployment${deployments.length === 1 ? '' : 's'} tracked — errors are auto-linked to the release that introduced them.`
                : 'Connect a GitHub repository to automatically correlate errors with deployments.'
            }
            active={deployments.length > 0}
            to={`/projects/${project.id}/delivery`}
          />
          <CapabilityTile
            icon="hub"
            title="Service Dependency Mapping"
            description={
              dependencyCount > 0
                ? `${dependencyCount} call path${dependencyCount === 1 ? '' : 's'} mapped automatically from live traffic.`
                : 'Cross-service calls (HTTP, DB, cache) are mapped automatically as traffic flows.'
            }
            active={dependencyCount > 0}
            to={`/projects/${project.id}/dependencies`}
          />
          <CapabilityTile
            icon="dns"
            title="Container &amp; IaC Discovery"
            description={
              containers.length + infraResources.length > 0
                ? `${containers.length} container${containers.length === 1 ? '' : 's'} and ${infraResources.length} IaC resource${infraResources.length === 1 ? '' : 's'} found from a static file scan.`
                : 'Docker, Kubernetes, and Terraform files are scanned automatically — zero manual setup.'
            }
            active={containers.length + infraResources.length > 0}
            to={`/projects/${project.id}/infrastructure`}
          />
          <CapabilityTile
            icon="shield"
            title="Security Scanning"
            description={
              vulnerabilityTotal > 0
                ? `${vulnerabilityTotal} finding${vulnerabilityTotal === 1 ? '' : 's'} surfaced from connected static-analysis scans.`
                : 'Connect SonarQube (or another supported scanner) to surface vulnerabilities here.'
            }
            active={vulnerabilityTotal > 0}
            to={`/projects/${project.id}/security`}
          />
          <CapabilityTile
            icon="lock"
            title="PII &amp; Secret Redaction"
            description="Headers, request bodies, and query params are redacted before anything ever leaves your service — always on, not opt-in."
            active
          />
        </div>
      </div>
    </>
  );
}

function maskKey(key: string) {
  if (key.length <= 14) return key;
  return `${key.slice(0, 10)}${'•'.repeat(10)}${key.slice(-4)}`;
}
