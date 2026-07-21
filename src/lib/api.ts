import { apiFetch, apiFetchBlob, apiFetchForm } from './api-client';
import type {
  AccessScope,
  AiProviderName,
  AlertHistoryEntry,
  ArchitectureType,
  CloudAccount,
  CloudAccountAuthMethod,
  CloudProvider,
  CloudAccountWithTrustPolicy,
  CloudCostSnapshot,
  CloudCostForecast,
  CloudEdge,
  CloudGraphView,
  CloudHealthEvent,
  CloudHealthScore,
  CloudInsight,
  CloudNode,
  CostOptimizationRecommendation,
  CostOptimizationStatus,
  CloudResource,
  CodeScan,
  ContainerEvent,
  CustomPlanPriceEstimate,
  DailyApiMetric,
  DailyErrorMetric,
  DailyInfraMetric,
  DailySecurityMetric,
  DbQuery,
  DependencyEdge,
  Deployment,
  DeploymentCorrelation,
  DiscoveredContainer,
  DiscoveredService,
  Environment,
  ErrorEvent,
  ErrorGroup,
  ErrorGroupAiSummary,
  ErrorGroupStatus,
  ErrorRateAnomaly,
  FindingSeverity,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentTimelineEvent,
  InfraResource,
  InfraSnapshot,
  IntegrationTool,
  IpAllowlistEntry,
  JiraIssue,
  JiraSprint,
  LogEntry,
  LogLevel,
  MigrationCorrelation,
  OrgInvite,
  Organization,
  OrganizationAiConfig,
  OrganizationMember,
  OrganizationRole,
  OrganizationSubscription,
  Pipeline,
  PipelineDefinition,
  PipelineDefinitionStage,
  PipelineRun,
  PipelineRunJob,
  Plan,
  Project,
  ProjectHealth,
  ProjectIntegration,
  ProjectInvite,
  ProjectMember,
  ProjectRole,
  RepoBranch,
  Repository,
  Requirement,
  RequirementDocument,
  RetentionDataType,
  RetentionPolicy,
  ScanTool,
  SpanRecord,
  TraceSummary,
  VulnerabilityFinding,
} from './types';

export async function fetchOrganizations(): Promise<Organization[]> {
  return apiFetch<Organization[]>('/api/orgs');
}

export async function createOrganization(params: {
  name: string;
  description?: string;
}): Promise<Organization> {
  return apiFetch<Organization>('/api/orgs', { method: 'POST', body: params });
}

export async function updateOrganization(id: string, params: { name: string; description?: string }): Promise<Organization> {
  return apiFetch<Organization>(`/api/orgs/${id}`, { method: 'PATCH', body: params });
}

export async function deleteOrganization(id: string): Promise<void> {
  await apiFetch<void>(`/api/orgs/${id}`, { method: 'DELETE' });
}

export async function fetchMyRole(organizationId: string): Promise<OrganizationRole | null> {
  return apiFetch<OrganizationRole | null>(`/api/orgs/${organizationId}/my-role`);
}

export async function removeMember(organizationId: string, userId: string): Promise<void> {
  await apiFetch<void>(`/api/orgs/${organizationId}/members/${userId}`, { method: 'DELETE' });
}

export async function inviteMember(organizationId: string, email: string, role: 'admin' | 'member'): Promise<OrgInvite> {
  return apiFetch<OrgInvite>(`/api/orgs/${organizationId}/invites`, { method: 'POST', body: { email: email.trim().toLowerCase(), role } });
}

export async function fetchPendingInvites(organizationId: string): Promise<OrgInvite[]> {
  return apiFetch<OrgInvite[]>(`/api/orgs/${organizationId}/invites`);
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await apiFetch<void>(`/api/orgs/invites/${inviteId}`, { method: 'DELETE' });
}

export async function redeemPendingInvites(): Promise<void> {
  await apiFetch<void>('/api/orgs/redeem-invites', { method: 'POST' });
}

export async function redeemPendingProjectInvites(): Promise<void> {
  await apiFetch<void>('/api/projects/redeem-invites', { method: 'POST' });
}

export async function fetchMyProjectRole(projectId: string): Promise<ProjectRole | null> {
  return apiFetch<ProjectRole | null>(`/api/projects/${projectId}/my-role`);
}

export async function fetchProjectMembers(projectId: string): Promise<ProjectMember[]> {
  return apiFetch<ProjectMember[]>(`/api/projects/${projectId}/members`);
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await apiFetch<void>(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
}

export async function inviteProjectMember(projectId: string, email: string, role: ProjectRole): Promise<ProjectInvite> {
  return apiFetch<ProjectInvite>(`/api/projects/${projectId}/invites`, { method: 'POST', body: { email: email.trim().toLowerCase(), role } });
}

export async function fetchProjectPendingInvites(projectId: string): Promise<ProjectInvite[]> {
  return apiFetch<ProjectInvite[]>(`/api/projects/${projectId}/invites`);
}

export async function revokeProjectInvite(inviteId: string): Promise<void> {
  await apiFetch<void>(`/api/projects/invites/${inviteId}`, { method: 'DELETE' });
}

export async function updateProfile(fullName: string): Promise<void> {
  await apiFetch<void>('/api/users/me', { method: 'PATCH', body: { fullName } });
}

export async function changePassword(newPassword: string): Promise<void> {
  await apiFetch<void>('/api/users/me/password', { method: 'PATCH', body: { newPassword } });
}

export async function fetchProjects(organizationId: string, includeArchived = false): Promise<Project[]> {
  return apiFetch<Project[]>(`/api/orgs/${organizationId}/projects`, { query: { includeArchived } });
}

export async function fetchProject(projectId: string): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${projectId}`);
}

export async function fetchOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  return apiFetch<OrganizationMember[]>(`/api/orgs/${organizationId}/members`);
}

export async function regenerateProjectApiKey(project: Project): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${project.id}/regenerate-api-key`, { method: 'POST' });
}

export function generateApiKey(environment: Environment): string {
  const prefix = environment === 'production' ? 'eip_live' : 'eip_test';
  const random = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${random}`;
}

export async function createProject(params: {
  organizationId: string;
  name: string;
  description?: string;
  environment: Environment;
  apiKey?: string;
  accessScope?: AccessScope;
}): Promise<Project> {
  const apiKey = params.apiKey ?? generateApiKey(params.environment);
  return apiFetch<Project>(`/api/orgs/${params.organizationId}/projects`, {
    method: 'POST',
    body: { name: params.name, description: params.description, environment: params.environment, apiKey, accessScope: params.accessScope },
  });
}

// Subscription/billing (no payment processor wired up yet — see the note on
// the `plans`/`organization_subscriptions` tables in supabase/schema.sql).

export async function getPlans(): Promise<Plan[]> {
  return apiFetch<Plan[]>('/api/plans');
}

export async function getOrgSubscription(organizationId: string): Promise<OrganizationSubscription | null> {
  return apiFetch<OrganizationSubscription | null>(`/api/orgs/${organizationId}/subscription`);
}

export type OrgProjectUsage = { activeCount: number; maxProjects: number | null };

export type OrgUsageBreakdown = {
  apiCallsIngested: number;
  logsIngested: number;
  tracesIngested: number;
  dbQueriesIngested: number;
  storageUsedMb: number | null;
};

type OrgUsageResponse = { projectUsage: OrgProjectUsage; usageBreakdown: OrgUsageBreakdown; seatCount: number };

// GET /api/orgs/:id/usage bundles projectUsage/usageBreakdown/seatCount in
// one backend call (billing.service.ts#getUsage) — getOrgProjectUsage/
// getOrgUsageBreakdown/getOrgSeatCount each still call it independently and
// pick out their own piece, rather than restructuring every call site that
// only needs one of the three, at the cost of some redundant fetches when a
// page happens to need more than one (not a hot path).
export async function getOrgProjectUsage(organizationId: string): Promise<OrgProjectUsage> {
  const usage = await apiFetch<OrgUsageResponse>(`/api/orgs/${organizationId}/usage`);
  return usage.projectUsage;
}

// Real usage, no enforcement: everything ingested for this org so far this
// calendar month, plus the latest nightly storage snapshot. Plan limits
// (Plan.max_api_requests_per_month) are display-only — see the note on that
// column in supabase/schema.sql.
export async function getOrgUsageBreakdown(organizationId: string): Promise<OrgUsageBreakdown> {
  const usage = await apiFetch<OrgUsageResponse>(`/api/orgs/${organizationId}/usage`);
  return usage.usageBreakdown;
}

// Seats are never gated (see the "What's gated" decision in the subscription
// plan) — shown purely as an informational usage stat.
export async function getOrgSeatCount(organizationId: string): Promise<number> {
  const usage = await apiFetch<OrgUsageResponse>(`/api/orgs/${organizationId}/usage`);
  return usage.seatCount;
}

// Powers the "Data Retention" panel on the Billing page — how long each
// telemetry type is kept before cleanup_expired_telemetry() deletes it,
// for the org's *current* plan specifically (retention varies by plan).
export async function getRetentionPolicies(planId: string): Promise<RetentionPolicy[]> {
  return apiFetch<RetentionPolicy[]>('/api/retention-policies', { query: { planId } });
}

// The button that calls this in OrgBilling.tsx is the seam a future Stripe
// Checkout redirect replaces. The backend re-evaluates the grace period as
// part of this same call (billing.service.ts#updateSubscription).
export async function updateOrgPlan(organizationId: string, planId: string): Promise<void> {
  await apiFetch<OrganizationSubscription>(`/api/orgs/${organizationId}/subscription`, { method: 'PATCH', body: { planId } });
}

// Live price preview as the user adjusts the retention builder — read-only,
// no plan is created/changed.
export async function estimateCustomPlanPrice(
  organizationId: string,
  retentionDays: Record<RetentionDataType, number>
): Promise<CustomPlanPriceEstimate> {
  return apiFetch<CustomPlanPriceEstimate>(`/api/orgs/${organizationId}/custom-plan/estimate`, {
    method: 'POST',
    body: {
      logsDays: retentionDays.logs,
      tracesDays: retentionDays.traces,
      dbQueriesDays: retentionDays.db_queries,
      apiCallsDays: retentionDays.api_calls,
    },
  });
}

// Builds (or edits, since this upserts by a deterministic id) an org's own
// custom retention plan and switches organization_subscriptions to it —
// owner-only, price computed by the same formula estimateCustomPlanPrice()
// previews (billing.service.ts#createCustomPlan).
export async function createCustomPlan(
  organizationId: string,
  retentionDays: Record<RetentionDataType, number>
): Promise<CustomPlanPriceEstimate> {
  return apiFetch<CustomPlanPriceEstimate>(`/api/orgs/${organizationId}/custom-plan`, {
    method: 'POST',
    body: {
      logsDays: retentionDays.logs,
      tracesDays: retentionDays.traces,
      dbQueriesDays: retentionDays.db_queries,
      apiCallsDays: retentionDays.api_calls,
    },
  });
}

export async function fetchIpAllowlist(projectId: string): Promise<IpAllowlistEntry[]> {
  return apiFetch<IpAllowlistEntry[]>(`/api/projects/${projectId}/ip-allowlist`);
}

export async function addIpAllowlistEntry(projectId: string, label: string, cidr: string): Promise<IpAllowlistEntry> {
  return apiFetch<IpAllowlistEntry>(`/api/projects/${projectId}/ip-allowlist`, { method: 'POST', body: { label, cidr } });
}

export async function removeIpAllowlistEntry(id: string): Promise<void> {
  await apiFetch<void>(`/api/projects/ip-allowlist/${id}`, { method: 'DELETE' });
}

export async function updateProject(
  id: string,
  params: { name: string; description?: string; environment: Environment }
): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${id}`, { method: 'PATCH', body: params });
}

export async function updateProjectAccessScope(id: string, accessScope: AccessScope): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${id}/access-scope`, { method: 'PATCH', body: { accessScope } });
}

export async function archiveProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${id}/archive`, { method: 'POST' });
}

export async function unarchiveProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/api/projects/${id}/unarchive`, { method: 'POST' });
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch<void>(`/api/projects/${id}`, { method: 'DELETE' });
}

// A service is considered "online" if it's reported a heartbeat within the
// last 2 minutes (the SDK's default flush interval is 10s, so this gives
// generous room for a couple of missed flushes before flagging it offline).
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

export function isServiceOnline(service: DiscoveredService): boolean {
  return Date.now() - new Date(service.last_seen_at).getTime() < ONLINE_THRESHOLD_MS;
}

// Removes a discovered_services row and every other table's rows scoped to
// that service (errors, spans, logs, pipeline/container discovery, etc.).
// Needs projectId (unlike the old delete_discovered_service(p_service_id)
// RPC) since the backend route is nested under
// projects/:projectId/discovered-services/:serviceId — updated the one call
// site (ArchitectureView.tsx) to pass it, since it already has project.id in scope.
export async function deleteDiscoveredService(projectId: string, serviceId: string): Promise<void> {
  await apiFetch<void>(`/api/projects/${projectId}/discovered-services/${serviceId}`, { method: 'DELETE' });
}

export async function fetchDiscoveredServices(projectId: string): Promise<DiscoveredService[]> {
  return apiFetch<DiscoveredService[]>(`/api/projects/${projectId}/discovered-services`);
}

export async function fetchContainerEvents(projectId: string, limit = 50): Promise<ContainerEvent[]> {
  return apiFetch<ContainerEvent[]>(`/api/projects/${projectId}/telemetry/container-events`, { query: { limit } });
}

export async function fetchLatestCodeScans(projectId: string): Promise<CodeScan[]> {
  return apiFetch<CodeScan[]>(`/api/projects/${projectId}/code-scans`);
}

export async function fetchVulnerabilityFindings(
  projectId: string,
  opts?: { severity?: FindingSeverity; tool?: ScanTool; service?: string; page?: number; pageSize?: number }
): Promise<{ data: VulnerabilityFinding[]; total: number }> {
  return apiFetch<{ data: VulnerabilityFinding[]; total: number }>(`/api/projects/${projectId}/vulnerability-findings`, {
    query: { severity: opts?.severity, tool: opts?.tool, service: opts?.service, page: opts?.page, pageSize: opts?.pageSize },
  });
}

// project_integrations holds admin-configured credentials (SonarQube token,
// GitHub PAT) that a scheduled job polls automatically (backend/src/jobs) —
// Config can contain secrets, so RLS restricts these rows to org owners/admins.
export async function fetchProjectIntegrations(projectId: string): Promise<ProjectIntegration[]> {
  return apiFetch<ProjectIntegration[]>(`/api/projects/${projectId}/integrations`);
}

export async function createProjectIntegration(params: {
  projectId: string;
  serviceName: string;
  tool: IntegrationTool;
  config: ProjectIntegration['config'];
  pollIntervalMinutes?: number;
}): Promise<ProjectIntegration> {
  return apiFetch<ProjectIntegration>(`/api/projects/${params.projectId}/integrations`, {
    method: 'POST',
    body: { serviceName: params.serviceName, tool: params.tool, config: params.config, pollIntervalMinutes: params.pollIntervalMinutes },
  });
}

export async function updateProjectIntegration(
  projectId: string,
  id: string,
  patch: Partial<Pick<ProjectIntegration, 'enabled' | 'config' | 'service_name' | 'poll_interval_minutes'>>
): Promise<ProjectIntegration> {
  return apiFetch<ProjectIntegration>(`/api/projects/${projectId}/integrations/${id}`, {
    method: 'PATCH',
    body: {
      enabled: patch.enabled,
      config: patch.config,
      serviceName: patch.service_name,
      pollIntervalMinutes: patch.poll_interval_minutes,
    },
  });
}

export async function deleteProjectIntegration(projectId: string, id: string): Promise<void> {
  await apiFetch<void>(`/api/projects/${projectId}/integrations/${id}`, { method: 'DELETE' });
}

// Delivery Intelligence (PRD v2): Repository -> Pipeline -> Deployment,
// populated by the poll-github-repo job (backend/src/jobs/pollers) from a
// project_integrations row with tool='github_repo'.

export async function fetchRepositories(projectId: string): Promise<Repository[]> {
  return apiFetch<Repository[]>(`/api/projects/${projectId}/repositories`);
}

// Impact Analysis: "which repo owns this service" — looks up the github_repo
// integration configured for this exact service_name (if any), then matches
// its configured repo against this project's `repositories` rows. Returns
// null (not an error) when no such integration is configured, which the
// Architecture View service panel treats as "not linked yet".
export async function fetchOwningRepository(projectId: string, serviceName: string): Promise<Repository | null> {
  return apiFetch<Repository | null>(`/api/projects/${projectId}/repositories/owner`, { query: { serviceName } });
}

// Needs projectId (the backend route is nested under
// projects/:projectId/repositories/:repositoryId/branches) — updated the one
// call site (DeliveryDashboard.tsx) to pass it, since it already has
// project.id in scope.
export async function fetchRepoBranches(projectId: string, repositoryId: string): Promise<RepoBranch[]> {
  return apiFetch<RepoBranch[]>(`/api/projects/${projectId}/repositories/${repositoryId}/branches`);
}

export async function fetchPipelines(projectId: string): Promise<Pipeline[]> {
  return apiFetch<Pipeline[]>(`/api/projects/${projectId}/pipelines`);
}

// Needs projectId — same reason as fetchRepoBranches above.
export async function fetchPipelineRuns(projectId: string, pipelineId: string, limit = 5): Promise<PipelineRun[]> {
  return apiFetch<PipelineRun[]>(`/api/projects/${projectId}/pipelines/${pipelineId}/runs`, { query: { limit } });
}

// Needs projectId — same reason as fetchRepoBranches above.
export async function fetchPipelineRunJobs(projectId: string, pipelineRunId: string): Promise<PipelineRunJob[]> {
  return apiFetch<PipelineRunJob[]>(`/api/projects/${projectId}/pipeline-runs/${pipelineRunId}/jobs`);
}

export async function fetchDeployments(projectId: string, limit = 20): Promise<Deployment[]> {
  return apiFetch<Deployment[]>(`/api/projects/${projectId}/deployments`, { query: { limit } });
}

// Impact Analysis: "did errors spike after this deployment" — a plain count
// rather than fetching rows, since only the number is ever shown.
export async function fetchErrorCountInWindow(
  projectId: string,
  serviceName: string,
  start: Date,
  end: Date
): Promise<number> {
  return apiFetch<number>(`/api/projects/${projectId}/telemetry/error-count`, {
    query: { serviceName, start: start.toISOString(), end: end.toISOString() },
  });
}

// Zero-config CI/CD + Docker discovery (SDK static file scan) — the
// complement to fetchRepositories/fetchPipelines above, which need a
// github_repo integration.
export async function fetchPipelineDefinitions(projectId: string): Promise<PipelineDefinition[]> {
  return apiFetch<PipelineDefinition[]>(`/api/projects/${projectId}/pipeline-definitions`);
}

// Needs projectId — same reason as fetchRepoBranches above.
export async function fetchPipelineDefinitionStages(projectId: string, pipelineDefinitionId: string): Promise<PipelineDefinitionStage[]> {
  return apiFetch<PipelineDefinitionStage[]>(`/api/projects/${projectId}/pipeline-definitions/${pipelineDefinitionId}/stages`);
}

export async function fetchDiscoveredContainers(projectId: string): Promise<DiscoveredContainer[]> {
  return apiFetch<DiscoveredContainer[]>(`/api/projects/${projectId}/discovered-containers`);
}

// Terraform/Kubernetes/Helm resources discovered by the SDK's zero-config
// static scan (sdk/src/iac-detect.js) — same source as fetchPipelineDefinitions
// and fetchDiscoveredContainers above.
export async function fetchInfraResources(projectId: string): Promise<InfraResource[]> {
  return apiFetch<InfraResource[]>(`/api/projects/${projectId}/infra-resources`);
}

export type ApiMetrics = {
  totalRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRatePct: number;
  count4xx: number;
  count5xx: number;
  requestCountDeltaPct: number; // trailing 12h vs leading 12h of the 24h window
  p95LatencyDeltaMs: number;
  errorRateDeltaPct: number; // percentage points
  hourlyVolume: number[]; // 24 buckets, oldest -> newest
  hourlyAvgLatency: number[]; // 24 buckets, oldest -> newest
  latencyBuckets: { label: string; count: number }[];
  topEndpoints: {
    method: string;
    path: string;
    count: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    errorCount: number;
    successPct: number;
  }[];
};

export async function fetchApiMetrics(projectId: string): Promise<ApiMetrics> {
  return apiFetch<ApiMetrics>(`/api/projects/${projectId}/telemetry/api-calls`);
}

export type ErrorSeverity = 'critical' | 'warning' | 'info';

// error_events has no severity column, so we classify from the error name —
// "...Error"/"...Exception" names are the ones that actually crash a request,
// timeouts/retries are degraded-but-handled, everything else is informational.
export function classifyErrorSeverity(errorName: string): ErrorSeverity {
  if (/error$/i.test(errorName)) return 'critical';
  if (/timeout|exception|fail/i.test(errorName)) return 'warning';
  return 'info';
}

export type ErrorSummary = {
  recent: ErrorEvent[];
  hourlyTrend: number[]; // 24 buckets, oldest -> newest
  grouped: {
    errorName: string;
    message: string | null;
    count: number;
    lastOccurredAt: string;
    sourceFile: string | null;
    sourceLine: number | null;
    sourceFunction: string | null;
    occurrences: ErrorEvent[];
  }[];
  totalErrors24h: number;
  totalErrorsDeltaPct: number; // trailing 12h vs leading 12h of the last 24h
  criticalErrors24h: number;
  criticalErrorsDeltaCount: number; // vs the prior 24h
  avgErrorsPerDay: number; // trailing 7-day average
};

export async function fetchErrorSummary(projectId: string): Promise<ErrorSummary> {
  return apiFetch<ErrorSummary>(`/api/projects/${projectId}/telemetry/error-events`);
}

// Error Intelligence Phase 1 (P0): persistent grouping/fingerprint source,
// replacing the fragile client-side "error_name::message" grouping computed
// over fetchErrorSummary()'s capped 200-row window above. This is what the
// Error Dashboard's Top/All Error Groups panels read from — fetchErrorSummary
// above stays as-is for the KPI cards/hourly trend, which don't need group
// identity.
export async function fetchErrorGroups(
  projectId: string,
  options?: { status?: ErrorGroupStatus; serviceName?: string; page?: number; pageSize?: number }
): Promise<{ groups: ErrorGroup[]; total: number }> {
  return apiFetch(`/api/projects/${projectId}/error-groups`, {
    query: { status: options?.status, serviceName: options?.serviceName, page: options?.page, pageSize: options?.pageSize },
  });
}

export async function fetchErrorGroupOccurrences(
  errorGroupId: string,
  page = 0,
  pageSize = 20
): Promise<{ occurrences: ErrorEvent[]; total: number }> {
  return apiFetch(`/api/error-groups/${errorGroupId}/occurrences`, { query: { page, pageSize } });
}

// Powers "started N minutes after deployment" for any individual error
// occurrence, not just a group's first-seen snapshot. Keyed by errorGroupId —
// project_id/service_name are looked up server-side from the error group row
// (error-groups.service.ts#correlationContext) rather than trusted from the caller.
export async function fetchDeploymentCorrelation(
  errorGroupId: string,
  occurredAt?: string,
  windowMinutes?: number
): Promise<DeploymentCorrelation | null> {
  return apiFetch(`/api/error-groups/${errorGroupId}/deployment-correlation`, { query: { occurredAt, windowMinutes } });
}

// Error Intelligence Phase 1 (P0), gap fix: the fourth thing deployment
// correlation was supposed to link errors to (deployments, pipeline runs,
// release versions, database migrations) — missed in the first pass. Default
// window is wider than deployments' (24h vs. 6h) since migrations are
// lower-frequency and their impact can surface well after the migration itself ran.
export async function fetchMigrationCorrelation(
  errorGroupId: string,
  occurredAt?: string,
  windowMinutes?: number
): Promise<MigrationCorrelation | null> {
  return apiFetch(`/api/error-groups/${errorGroupId}/migration-correlation`, { query: { occurredAt, windowMinutes } });
}

// resolvedBy is now taken from the authenticated caller on the backend
// (req.user.id) rather than trusted from the client.
export async function resolveErrorGroup(errorGroupId: string): Promise<void> {
  await apiFetch(`/api/error-groups/${errorGroupId}/resolve`, { method: 'PATCH' });
}

export async function reopenErrorGroup(errorGroupId: string): Promise<void> {
  await apiFetch(`/api/error-groups/${errorGroupId}/reopen`, { method: 'PATCH' });
}

export async function fetchLatestInfraSnapshots(projectId: string): Promise<InfraSnapshot[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/infra-snapshots`);
}

export async function fetchInfraCpuTrend(projectId: string): Promise<{ label: string; avgCpu: number }[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/infra-snapshots/cpu-trend`);
}

// Same hourly-bucketing as fetchInfraCpuTrend, scoped to one service — backs the
// per-node health sparkline in the Architecture View detail panel.
export async function fetchServiceCpuTrend(projectId: string, serviceName: string): Promise<number[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/infra-snapshots/cpu-trend/${encodeURIComponent(serviceName)}`);
}

export async function fetchProjectHealth(projectId: string): Promise<ProjectHealth | null> {
  return apiFetch(`/api/projects/${projectId}/telemetry/health`);
}

export type DbQueryMetrics = {
  totalQueries: number;
  avgDurationMs: number;
  failedCount: number;
  slowQueries: DbQuery[]; // top 10 by duration_ms desc
  queries: DbQuery[]; // full fetched window, oldest last (for bucketing/trend charts)
};

export async function fetchDbQueryMetrics(projectId: string, dbType?: string, windowHours = 24): Promise<DbQueryMetrics> {
  return apiFetch(`/api/projects/${projectId}/telemetry/db-queries`, { query: { dbType, windowHours } });
}

// A "trace" isn't its own table — it's derived by grouping spans by
// trace_id. The root span (parent_span_id is null) carries the request's
// name/service/status/duration; everything else in the group is a child
// call (e.g. a DB query) made while handling it. See spans' comment in
// supabase/schema.sql for why this only covers one process's call graph,
// not cross-service distributed tracing.
export async function fetchTraces(projectId: string): Promise<TraceSummary[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/traces`);
}

export async function fetchTraceSpans(projectId: string, traceId: string): Promise<SpanRecord[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/spans`, { query: { traceId } });
}

// Error Intelligence Phase 1 (P0), gap fix: error->trace visibility existed
// (an error row links to /traces/:traceId), but not the reverse — viewing a
// cross-service trace had no way to show that an error happened inside it.
// error_events.trace_id only exists on events reported by a Phase-1-or-later
// SDK (see error_events' Phase 1 columns in supabase/schema.sql) — an older
// SDK's error rows have a null trace_id and simply won't match here.
export async function fetchTraceErrors(projectId: string, traceId: string): Promise<ErrorEvent[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/traces/${traceId}/errors`);
}

// Error Intelligence Phase 2 (Tier 2.1) — read-time "N unique users
// affected" rollup for one error group, via the error_group_affected_user_count()
// RPC. Only meaningful for groups whose events actually opted into
// monitor.setUser() — returns 0 otherwise, not an error.
export async function fetchErrorGroupAffectedUserCount(errorGroupId: string): Promise<number> {
  const result = await apiFetch<{ count: number }>(`/api/error-groups/${errorGroupId}/affected-users`);
  return result.count;
}

// Error Intelligence Phase 2 (Tier 2.5) — statistical (z-score) spike
// detection on the daily error count. Empty array means "nothing anomalous
// today," not "not computed."
export async function fetchErrorRateAnomalies(projectId: string): Promise<ErrorRateAnomaly[]> {
  return apiFetch(`/api/projects/${projectId}/error-anomalies`);
}

// AI Copilot narrow slice (Tier 5.4) — backs the "AI Business Impact
// Summary" card on the Error Dashboard. Cached one row per error_group in
// error_group_ai_summaries, written only by the generateErrorGroupAiSummary
// backend endpoint (service role), so this read never sees a partial/
// in-progress write.
export async function fetchErrorGroupAiSummary(errorGroupId: string): Promise<ErrorGroupAiSummary | null> {
  return apiFetch(`/api/error-groups/${errorGroupId}/ai-summary`);
}

export async function generateErrorGroupAiSummary(errorGroupId: string): Promise<ErrorGroupAiSummary> {
  return apiFetch(`/api/error-groups/${errorGroupId}/ai-summary/generate`, { method: 'POST' });
}

// Error Intelligence Phase 3 — shares the ai-summary row above; there's no
// separate GET since fetchErrorGroupAiSummary() already returns whatever
// root-cause fields exist alongside the business-impact ones.
export async function generateErrorGroupRootCause(errorGroupId: string): Promise<ErrorGroupAiSummary> {
  return apiFetch(`/api/error-groups/${errorGroupId}/root-cause/generate`, { method: 'POST' });
}

// The Service Dependency Graph isn't backed by a separate edges table —
// it's derived by grouping spans with a non-null `target` (DB/cache calls)
// by (service_name, target, kind). Each group is one real, observed edge
// from the app to a dependency, with call count/latency/error stats.
export async function fetchServiceDependencyEdges(projectId: string): Promise<DependencyEdge[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/dependency-edges`);
}

export async function fetchLogs(
  projectId: string,
  opts?: { level?: LogLevel; service?: string; search?: string; traceId?: string; page?: number; pageSize?: number }
): Promise<{ data: LogEntry[]; total: number }> {
  return apiFetch(`/api/projects/${projectId}/telemetry/log-events`, {
    query: {
      level: opts?.level,
      service: opts?.service,
      search: opts?.search,
      traceId: opts?.traceId,
      page: opts?.page,
      pageSize: opts?.pageSize,
    },
  });
}

export async function fetchProjectArchitecture(projectId: string): Promise<ArchitectureType | null> {
  const services = await fetchDiscoveredServices(projectId);
  if (services.length === 0) return null;
  // discovered_services also holds auto-detected dependencies (databases,
  // caches, external APIs) as their own rows alongside the app itself —
  // only 'application' rows represent actual deployable services, so those
  // are what decide monolith vs. microservices.
  const appServices = services.filter((s) => s.service_type === 'application');
  return appServices.length <= 1 ? 'monolith' : 'microservices';
}

// AI Copilot expansion — on-demand org-wide executive summary (Health Center).
export async function generateExecutiveSummary(organizationId: string): Promise<{ summary: string; generatedAt: string }> {
  return apiFetch(`/api/orgs/${organizationId}/health/executive-summary`, { method: 'POST' });
}

export async function fetchOrganizationHealth(organizationId: string): Promise<{ avgScore: number | null; byProjectId: Map<string, ProjectHealth> }> {
  const result = await apiFetch<{ avgScore: number | null; byProjectId: Record<string, ProjectHealth> }>(`/api/orgs/${organizationId}/health`);
  return { avgScore: result.avgScore, byProjectId: new Map(Object.entries(result.byProjectId)) };
}

export type ActivityFeedItem = {
  id: string;
  kind: 'error' | 'service_discovered';
  title: string;
  detail: string;
  occurred_at: string;
};

export async function fetchRecentActivity(organizationId: string, limit = 5): Promise<ActivityFeedItem[]> {
  return apiFetch(`/api/orgs/${organizationId}/recent-activity`, { query: { limit } });
}

export async function fetchOrganizationAlertHistory(
  organizationId: string
): Promise<{ active: AlertHistoryEntry[]; resolved: AlertHistoryEntry[] }> {
  return apiFetch(`/api/orgs/${organizationId}/alert-history`);
}

export async function fetchProjectActiveAlerts(projectId: string): Promise<AlertHistoryEntry[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/alert-history`);
}

// Daily aggregation layer (docs/optimization_plan.md, Sprint 2): long-range
// trend reads, backed by daily_api_metrics/daily_error_metrics/etc. instead
// of raw telemetry — the point is a trend that survives a plan's raw
// retention window (see cleanup_expired_telemetry() in supabase/schema.sql),
// not a replacement for the 24h-detail fetchApiMetrics/fetchErrorSummary/etc.
// above. `days` counts back from yesterday, since aggregate_daily_telemetry()
// only ever populates fully-elapsed days.

export async function fetchApiDailyTrend(projectId: string, days = 30): Promise<DailyApiMetric[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/daily-api-metrics`, { query: { days } });
}

export async function fetchErrorDailyTrend(projectId: string, days = 30): Promise<DailyErrorMetric[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/daily-error-metrics`, { query: { days } });
}

export async function fetchInfraDailyTrend(projectId: string, days = 30): Promise<DailyInfraMetric[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/daily-infra-metrics`, { query: { days } });
}

export async function fetchSecurityDailyTrend(projectId: string, days = 30): Promise<DailySecurityMetric[]> {
  return apiFetch(`/api/projects/${projectId}/telemetry/daily-security-metrics`, { query: { days } });
}

// Tier 5.1 (Cloud & FinOps): AWS resource inventory + 30-day cost snapshots,
// synced by the poll-aws-cloud job from a project_integrations row with
// tool='aws_cloud'.
export async function fetchCloudResources(projectId: string): Promise<CloudResource[]> {
  return apiFetch(`/api/projects/${projectId}/cloud-resources`);
}

export async function fetchCloudCostSnapshots(projectId: string): Promise<CloudCostSnapshot[]> {
  return apiFetch(`/api/projects/${projectId}/cloud-cost-snapshots`);
}

// Cloud Intelligence Platform v3, Module 1 — cloud_accounts CRUD. Admin-only
// server-side (RLS), so list()/create() will 403 for a non-admin project
// member; the UI should only surface the connector form to owners/admins.
export async function fetchCloudAccounts(projectId: string): Promise<CloudAccount[]> {
  return apiFetch(`/api/projects/${projectId}/cloud-accounts`);
}

export async function createCloudAccount(
  projectId: string,
  params: {
    provider: CloudProvider;
    accountIdentifier: string;
    accountAlias?: string;
    authMethod: CloudAccountAuthMethod;
    roleArn?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    serviceAccountKeyJson?: string;
    connectedRegions: string[];
    discoveryIntervalMinutes?: number;
  }
): Promise<CloudAccountWithTrustPolicy> {
  return apiFetch(`/api/projects/${projectId}/cloud-accounts`, { method: 'POST', body: params });
}

export async function updateCloudAccount(
  id: string,
  patch: Partial<{
    accountAlias: string;
    connectedRegions: string[];
    enabled: boolean;
    discoveryIntervalMinutes: number;
    roleArn: string;
    accessKeyId: string;
    secretAccessKey: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
    serviceAccountKeyJson: string;
  }>
): Promise<CloudAccount> {
  return apiFetch(`/api/cloud-accounts/${id}`, { method: 'PATCH', body: patch });
}

export async function deleteCloudAccount(id: string): Promise<void> {
  await apiFetch<void>(`/api/cloud-accounts/${id}`, { method: 'DELETE' });
}

export async function syncCloudAccount(id: string): Promise<{ accountId: string; status: string }> {
  return apiFetch(`/api/cloud-accounts/${id}/sync`, { method: 'POST' });
}

// Module 3/8 — the graph itself. fetchCloudGraph backs the Architecture
// Explorer's 5 view modes (one pre-filtered node+edge set per view, computed
// server-side — see backend/src/cloud-intelligence/graph-views.ts).
export async function fetchCloudNodes(projectId: string, filters?: { nodeType?: string; region?: string }): Promise<CloudNode[]> {
  return apiFetch(`/api/projects/${projectId}/cloud-nodes`, { query: filters });
}

export async function fetchCloudEdges(projectId: string, filters?: { edgeType?: string }): Promise<CloudEdge[]> {
  return apiFetch(`/api/projects/${projectId}/cloud-edges`, { query: filters });
}

export async function fetchCloudGraph(
  projectId: string,
  view: CloudGraphView,
  vpcId?: string
): Promise<{ nodes: CloudNode[]; edges: CloudEdge[] }> {
  return apiFetch(`/api/projects/${projectId}/cloud-graph`, { query: { view, vpcId } });
}

// Module 9 — cloud_health_events read API (backend/src/cloud-intelligence/cloud-health.{service,controller}.ts).
export async function fetchCloudHealthEvents(projectId: string, includeResolved = false): Promise<CloudHealthEvent[]> {
  return apiFetch(`/api/projects/${projectId}/cloud-health`, { query: { includeResolved: includeResolved || undefined } });
}

export async function fetchCloudHealthScore(projectId: string): Promise<CloudHealthScore> {
  return apiFetch(`/api/projects/${projectId}/cloud-health/score`);
}

// Module 10 — cost forecast + optimization recommendations (backend/src/cloud-intelligence/cloud-cost.{service,controller}.ts).
export async function fetchCloudCostForecast(projectId: string): Promise<CloudCostForecast> {
  return apiFetch(`/api/projects/${projectId}/cloud-cost/forecast`);
}

export async function fetchCostOptimizations(projectId: string, status?: CostOptimizationStatus): Promise<CostOptimizationRecommendation[]> {
  return apiFetch(`/api/projects/${projectId}/cost-optimizations`, { query: { status } });
}

export async function updateCostOptimization(
  projectId: string,
  id: string,
  status: CostOptimizationStatus
): Promise<CostOptimizationRecommendation> {
  return apiFetch(`/api/projects/${projectId}/cost-optimizations/${id}`, { method: 'PATCH', body: { status } });
}

// Module 11 — cloud_insights read/update API (backend/src/cloud-intelligence/cloud-insights.{service,controller}.ts).
export async function fetchCloudInsights(projectId: string, status?: CostOptimizationStatus): Promise<CloudInsight[]> {
  return apiFetch(`/api/projects/${projectId}/cloud-insights`, { query: { status } });
}

export async function updateCloudInsight(projectId: string, id: string, status: CostOptimizationStatus): Promise<CloudInsight> {
  return apiFetch(`/api/projects/${projectId}/cloud-insights/${id}`, { method: 'PATCH', body: { status } });
}

// Tier 5.2 (Delivery Health): Jira issue/sprint read-only sync, via the
// poll-jira job from a project_integrations row with tool='jira'.
export async function fetchJiraIssues(projectId: string): Promise<JiraIssue[]> {
  return apiFetch(`/api/projects/${projectId}/jira-issues`);
}

export async function fetchJiraSprints(projectId: string): Promise<JiraSprint[]> {
  return apiFetch(`/api/projects/${projectId}/jira-sprints`);
}

// Tier 5.3 (Requirements & Validation): BRD/PRD/SRS upload -> LLM-extracted
// structured requirements + suggested test cases.
export async function fetchRequirementDocuments(projectId: string): Promise<RequirementDocument[]> {
  return apiFetch(`/api/projects/${projectId}/requirement-documents`);
}

// Extraction is triggered server-side (fire-and-forget) as part of this same
// call — no separate invoke step needed after upload.
export async function uploadRequirementDocument(
  projectId: string,
  params: { title: string; rawText: string; sourceFilename?: string; webhookUrl?: string }
): Promise<RequirementDocument> {
  return apiFetch(`/api/projects/${projectId}/requirement-documents`, { method: 'POST', body: params });
}

// Real file upload (PDF/DOCX/TXT/MD) — server extracts the text and stores
// the original file, alongside the paste-text path above.
export async function uploadRequirementDocumentFile(
  projectId: string,
  title: string,
  file: File,
  webhookUrl?: string
): Promise<RequirementDocument> {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('file', file);
  if (webhookUrl) formData.append('webhookUrl', webhookUrl);
  return apiFetchForm(`/api/projects/${projectId}/requirement-documents/upload-file`, formData);
}

export async function downloadRequirementDocumentFile(documentId: string): Promise<Blob> {
  return apiFetchBlob(`/api/requirement-documents/${documentId}/file`);
}

export async function processRequirementDocument(documentId: string): Promise<RequirementDocument> {
  return apiFetch(`/api/requirement-documents/${documentId}/process`, { method: 'POST' });
}

export async function fetchRequirements(documentId: string): Promise<Requirement[]> {
  return apiFetch(`/api/requirement-documents/${documentId}/requirements`);
}

// Tier 5.5 (Incidents): coordinated response tracking for grouped errors.
export async function fetchIncidents(projectId: string): Promise<Incident[]> {
  return apiFetch(`/api/projects/${projectId}/incidents`);
}

export async function createIncident(
  projectId: string,
  params: { title: string; description?: string; severity: IncidentSeverity }
): Promise<Incident> {
  return apiFetch(`/api/projects/${projectId}/incidents`, { method: 'POST', body: params });
}

// resolved_by is now stamped server-side from the authenticated caller,
// same convention as resolveErrorGroup above.
export async function updateIncidentStatus(incidentId: string, status: IncidentStatus): Promise<Incident> {
  return apiFetch(`/api/incidents/${incidentId}`, { method: 'PATCH', body: { status } });
}

export type LinkedErrorGroup = Pick<ErrorGroup, 'id' | 'error_name' | 'message' | 'occurrence_count' | 'service_name' | 'status'> & {
  added_at: string;
};

export async function fetchIncidentErrorGroups(incidentId: string): Promise<LinkedErrorGroup[]> {
  return apiFetch(`/api/incidents/${incidentId}/error-groups`);
}

export async function attachIncidentErrorGroup(incidentId: string, errorGroupId: string): Promise<void> {
  await apiFetch(`/api/incidents/${incidentId}/error-groups`, { method: 'POST', body: { errorGroupId } });
}

export async function detachIncidentErrorGroup(incidentId: string, errorGroupId: string): Promise<void> {
  await apiFetch(`/api/incidents/${incidentId}/error-groups/${errorGroupId}`, { method: 'DELETE' });
}

export async function fetchIncidentTimeline(incidentId: string): Promise<IncidentTimelineEvent[]> {
  return apiFetch(`/api/incidents/${incidentId}/timeline`);
}

// Org-level "bring your own AI key" — never round-trips the raw key; the
// backend only ever tells the client whether one is configured.
export async function fetchOrganizationAiConfig(organizationId: string): Promise<OrganizationAiConfig> {
  return apiFetch(`/api/orgs/${organizationId}/ai-config`);
}

export async function saveOrganizationAiConfig(
  organizationId: string,
  params: { provider: AiProviderName; model: string; apiKey: string }
): Promise<OrganizationAiConfig> {
  return apiFetch(`/api/orgs/${organizationId}/ai-config`, { method: 'POST', body: params });
}

export async function deleteOrganizationAiConfig(organizationId: string): Promise<void> {
  await apiFetch(`/api/orgs/${organizationId}/ai-config`, { method: 'DELETE' });
}

// Stateless — validates a provider/model/key combo without saving it, so the
// settings page can offer a "Test Connection" step before Save.
export async function testAiProviderKey(
  organizationId: string,
  params: { provider: AiProviderName; model: string; apiKey: string }
): Promise<{ ok: true }> {
  return apiFetch(`/api/orgs/${organizationId}/ai-config/test`, { method: 'POST', body: params });
}
