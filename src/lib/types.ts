export type Environment = 'production' | 'staging' | 'development';

// Org-level "bring your own AI key" — never carries the raw key itself
// (configured just tells the UI a key is stored server-side in Vault).
export type AiProviderName = 'gemini' | 'openai' | 'anthropic';

export type OrganizationAiConfig = {
  provider: AiProviderName | null;
  model: string | null;
  enabled: boolean;
  configured: boolean;
};

export type Organization = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
};

export type ProjectStatus = 'active' | 'archived';
export type AccessScope = 'read_only' | 'standard' | 'full';

export type Project = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  environment: Environment;
  api_key: string;
  status: ProjectStatus;
  access_scope: AccessScope;
  created_by: string;
  created_at: string;
};

export type IpAllowlistEntry = {
  id: string;
  project_id: string;
  label: string;
  cidr: string;
  status: 'active' | 'disabled';
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

export type OrganizationRole = 'owner' | 'admin' | 'member';

export type OrganizationMember = {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  created_at: string;
  profile: Profile | null;
};

export type ServiceType = 'application' | 'database' | 'cache' | 'external_api';

export type DeploymentPlatform = 'docker' | 'ecs' | 'kubernetes' | 'bare-metal';

export type DiscoveredService = {
  id: string;
  project_id: string;
  name: string;
  service_type: ServiceType;
  framework: string | null;
  runtime: string | null;
  os_info: string | null;
  hostname: string | null;
  node_env: string | null;
  language: string | null;
  deployment_platform: DeploymentPlatform | null;
  container_id: string | null;
  container_image: string | null;
  cluster_name: string | null;
  orchestrator_ref: string | null;
  namespace: string | null;
  sonar_project_key: string | null;
  sonar_host_url: string | null;
  last_seen_at: string;
  created_at: string;
};

export type ContainerEventType = 'start' | 'stop' | 'die' | 'restart' | 'oom_kill' | 'scale_up' | 'scale_down';

export type ContainerEvent = {
  id: string;
  project_id: string;
  service_name: string;
  platform: DeploymentPlatform;
  container_id: string | null;
  event_type: ContainerEventType;
  reason: string | null;
  occurred_at: string;
};

export type ScanTool = 'sonarqube' | 'sarif' | 'npm-audit';
export type QualityGateStatus = 'passed' | 'failed' | 'warn';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingType = 'vulnerability' | 'bug' | 'code_smell' | 'security_hotspot' | 'dependency';
export type FindingStatus = 'open' | 'fixed' | 'ignored';

export type CodeScan = {
  id: string;
  project_id: string;
  service_name: string;
  tool: ScanTool;
  quality_gate_status: QualityGateStatus | null;
  bugs: number | null;
  vulnerabilities: number | null;
  code_smells: number | null;
  security_hotspots: number | null;
  coverage: number | null;
  duplicated_lines_density: number | null;
  security_rating: string | null;
  reliability_rating: string | null;
  maintainability_rating: string | null;
  scanned_at: string;
  created_at: string;
};

export type VulnerabilityFinding = {
  id: string;
  project_id: string;
  service_name: string;
  tool: ScanTool;
  severity: FindingSeverity;
  finding_type: FindingType;
  title: string;
  description: string | null;
  file_path: string | null;
  line_number: number | null;
  package_name: string | null;
  package_version: string | null;
  fixed_version: string | null;
  cve_id: string | null;
  status: FindingStatus;
  detected_at: string;
  created_at: string;
};

// Tier 5.1/5.2 (docs/PENDING_FEATURES_AND_ROADMAP.md) added 'aws_cloud' and
// 'jira' — see supabase/migrations/0002_cloud_finops.sql and
// 0003_jira_delivery_health.sql for the widened project_integrations tool
// check constraint this must stay in sync with.
export type IntegrationTool = 'sonarqube' | 'github_artifacts' | 'github_repo' | 'aws_cloud' | 'jira';
export type IntegrationStatus = 'ok' | 'error';

export type SonarQubeIntegrationConfig = {
  sonarUrl: string;
  sonarToken: string;
  projectKey: string;
};

export type GithubArtifactsIntegrationConfig = {
  repo: string; // "owner/repo"
  token: string;
  artifactName: string;
  reportType: 'sarif' | 'npm-audit';
  lastArtifactId?: number;
};

export type GithubRepoIntegrationConfig = {
  repo: string; // "owner/repo"
  token: string;
};

// Tier 5.1 — mirrors supabase/functions/_shared/types.ts's
// AwsCloudIntegrationConfig (duplicated by hand across the web/Edge-Function
// boundary, same convention as every other *IntegrationConfig here).
export type AwsCloudIntegrationConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

// Tier 5.2 — mirrors supabase/functions/_shared/types.ts's
// JiraIntegrationConfig. boardId is an optional escape hatch for when
// Agile-board discovery via projectKey is ambiguous (see poll-jira/index.ts).
export type JiraIntegrationConfig = {
  baseUrl: string; // e.g. "https://your-domain.atlassian.net"
  email: string;
  apiToken: string;
  projectKey: string;
  boardId?: number;
};

export type ProjectIntegration = {
  id: string;
  project_id: string;
  service_name: string;
  tool: IntegrationTool;
  enabled: boolean;
  config:
    | SonarQubeIntegrationConfig
    | GithubArtifactsIntegrationConfig
    | GithubRepoIntegrationConfig
    | AwsCloudIntegrationConfig
    | JiraIntegrationConfig;
  poll_interval_minutes: number;
  last_polled_at: string | null;
  last_status: IntegrationStatus | null;
  last_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

// Tier 5.1 — mirrors public.cloud_resources (supabase/migrations/0002_cloud_finops.sql).
export type CloudResource = {
  id: string;
  project_id: string;
  service_name: string;
  provider: string;
  resource_type: string;
  resource_id: string;
  resource_name: string | null;
  region: string | null;
  state: string | null;
  tags: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  last_seen_at: string;
};

// Tier 5.1 — mirrors public.cloud_cost_snapshots.
export type CloudCostSnapshot = {
  id: string;
  project_id: string;
  service_name: string;
  provider: string;
  date: string;
  service_category: string;
  amount_usd: number;
  currency: string;
  synced_at: string;
};

// Cloud Intelligence Platform v3, Module 1 — mirrors public.cloud_accounts
// (supabase/migrations/0013_cloud_accounts.sql, widened for multi-cloud by
// 0016_multi_cloud_accounts.sql — see docs/MULTI_CLOUD_ARCHITECTURE_DESIGN.md).
// vault_secret_id is never present — the backend strips it from every response.
export type CloudProvider = 'aws' | 'azure' | 'gcp';
export type CloudAccountAuthMethod = 'iam_role' | 'access_key' | 'service_principal' | 'service_account_key';
export type CloudAccountSyncStatus = 'pending' | 'syncing' | 'ok' | 'error';

export type CloudAccount = {
  id: string;
  project_id: string;
  provider: CloudProvider;
  account_identifier: string;
  account_alias: string | null;
  auth_method: CloudAccountAuthMethod;
  role_arn: string | null;
  external_id: string | null;
  access_key_id: string | null;
  tenant_id: string | null;
  client_id: string | null;
  gcp_service_account_email: string | null;
  connected_regions: string[];
  enabled: boolean;
  sync_status: CloudAccountSyncStatus;
  last_discovery_at: string | null;
  last_error: string | null;
  discovery_interval_minutes: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

// Only present on the create() response for authMethod='iam_role' — the
// trust policy JSON to paste into the customer's AWS account.
export type CloudAccountWithTrustPolicy = CloudAccount & {
  trustPolicy?: Record<string, unknown>;
  setupInstructions?: string;
};

// Cloud Intelligence Platform v3, Module 3 — mirrors public.cloud_nodes/
// cloud_edges (supabase/migrations/0014_cloud_graph.sql). `node_type` is a
// deliberately open string set, not a closed union — see the design doc §1.4.4.
export type CloudNode = {
  id: string;
  project_id: string;
  cloud_account_id: string;
  node_type: string;
  provider: string;
  region: string | null;
  external_id: string;
  name: string | null;
  state: string | null;
  tags: Record<string, string>;
  metadata: Record<string, any>;
  first_seen_at: string;
  last_seen_at: string;
};

export type CloudEdgeType = 'CONNECTS_TO' | 'DEPENDS_ON' | 'HOSTED_IN' | 'ROUTES_TO' | 'BELONGS_TO' | 'SERVICE_CALL';

export type CloudEdge = {
  id: string;
  project_id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: CloudEdgeType;
  discovered_via: string;
  confidence: number;
  metadata: Record<string, any>;
  first_seen_at: string;
  last_seen_at: string;
};

export type CloudGraphView = 'infrastructure' | 'service' | 'network' | 'vpc' | 'dependency';

// Cloud Intelligence Platform v3, Module 9 — mirrors public.cloud_health_events
// (supabase/migrations/0019_cloud_health.sql).
export type CloudHealthEventType = 'stopped' | 'failed_task' | 'unhealthy_target' | 'failed_invocation' | 'disappeared' | 'degraded';
export type CloudHealthSeverity = 'info' | 'warning' | 'critical';

export type CloudHealthEvent = {
  id: string;
  project_id: string;
  cloud_node_id: string;
  event_type: CloudHealthEventType;
  severity: CloudHealthSeverity;
  detail: string | null;
  detected_at: string;
  resolved_at: string | null;
};

export type CloudHealthScore = {
  score: number;
  criticalCount: number;
  warningCount: number;
};

// Cloud Intelligence Platform v3, Module 10 — mirrors public.cost_optimization_recommendations
// (supabase/migrations/0020_cloud_cost_intelligence.sql).
export type CostOptimizationType = 'underutilized_ec2' | 'idle_load_balancer' | 'unused_elastic_ip' | 'oversized_database' | 'idle_nat_gateway';
export type CostOptimizationStatus = 'open' | 'dismissed' | 'resolved';

export type CostOptimizationRecommendation = {
  id: string;
  project_id: string;
  cloud_node_id: string | null;
  recommendation_type: CostOptimizationType;
  estimated_monthly_savings_usd: number | null;
  detail: Record<string, any>;
  status: CostOptimizationStatus;
  detected_at: string;
  updated_at: string;
};

export type CloudCostForecast = {
  history: { date: string; totalUsd: number }[];
  forecast: { date: string; forecastUsd: number }[];
};

// Cloud Intelligence Platform v3, Module 11 — mirrors public.cloud_insights
// (supabase/migrations/0021_cloud_insights.sql).
export type CloudInsightType =
  | 'architecture_risk'
  | 'single_point_of_failure'
  | 'cost_spike'
  | 'resource_waste'
  | 'high_dependency_service'
  | 'network_misconfiguration'
  | 'public_exposure_risk';

export type CloudInsight = {
  id: string;
  project_id: string;
  insight_type: CloudInsightType;
  severity: CloudHealthSeverity;
  title: string;
  impact: string;
  recommendation: string;
  affected_node_ids: string[];
  status: CostOptimizationStatus;
  detected_at: string;
  updated_at: string;
};

// Tier 5.2 — mirrors public.jira_issues (supabase/migrations/0003_jira_delivery_health.sql).
export type JiraIssue = {
  id: string;
  project_id: string;
  service_name: string;
  jira_key: string;
  issue_type: string | null;
  status: string | null;
  summary: string | null;
  assignee: string | null;
  priority: string | null;
  sprint_name: string | null;
  story_points: number | null;
  created_at_source: string | null;
  updated_at_source: string | null;
  resolved_at_source: string | null;
  last_synced_at: string;
};

// Tier 5.2 — mirrors public.jira_sprints.
export type JiraSprint = {
  id: string;
  project_id: string;
  service_name: string;
  jira_sprint_id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  start_date: string | null;
  end_date: string | null;
  complete_date: string | null;
  goal: string | null;
  last_synced_at: string;
};

// Tier 5.5 — mirrors public.incidents (supabase/migrations/0006_incident_management.sql).
export type IncidentStatus = 'open' | 'investigating' | 'monitoring' | 'resolved';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export type Incident = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  opened_at: string;
  resolved_at: string | null;
  created_by: string | null;
  updated_at: string;
};

export type IncidentErrorGroup = {
  incident_id: string;
  error_group_id: string;
  added_at: string;
};

export type IncidentTimelineEvent = {
  id: string;
  incident_id: string;
  event_type: 'created' | 'status_changed' | 'error_group_linked' | 'error_group_unlinked' | 'comment';
  message: string | null;
  created_by: string | null;
  created_at: string;
};

// --- Delivery Intelligence (PRD v2): Repository -> Pipeline -> Deployment ---

export type Repository = {
  id: string;
  project_id: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  full_name: string;
  default_branch: string | null;
  description: string | null;
  primary_language: string | null;
  visibility: string | null;
  html_url: string | null;
  last_synced_at: string | null;
  created_at: string;
};

export type RepoBranch = {
  id: string;
  project_id: string;
  repository_id: string;
  name: string;
  is_default: boolean;
  last_commit_sha: string | null;
  last_commit_at: string | null;
  created_at: string;
};

export type Pipeline = {
  id: string;
  project_id: string;
  repository_id: string;
  provider: 'github_actions';
  workflow_id: number;
  workflow_file: string | null;
  name: string;
  state: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_conclusion: string | null;
  created_at: string;
};

export type PipelineRun = {
  id: string;
  project_id: string;
  pipeline_id: string;
  run_id: number;
  run_number: number | null;
  event: string | null;
  status: string | null;
  conclusion: string | null;
  actor: string | null;
  head_branch: string | null;
  head_sha: string | null;
  run_started_at: string | null;
  run_completed_at: string | null;
  html_url: string | null;
  created_at: string;
};

export type PipelineRunJobStep = {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
};

export type PipelineRunJob = {
  id: string;
  project_id: string;
  pipeline_run_id: string;
  job_id: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps: PipelineRunJobStep[] | null;
  html_url: string | null;
  created_at: string;
};

export type Deployment = {
  id: string;
  project_id: string;
  service_name: string;
  repository_id: string;
  pipeline_run_id: string | null;
  deployment_id: number;
  environment: string;
  ref: string | null;
  sha: string | null;
  platform: string;
  status: string | null;
  description: string | null;
  created_at_source: string | null;
  updated_at_source: string | null;
  html_url: string | null;
  created_at: string;
};

// --- Zero-config CI/CD + Docker discovery (SDK static file scan, see
// sdk/src/pipeline-detect.js) — complements Repository/Pipeline/Deployment
// above, which requires a github_repo integration and only covers GitHub
// Actions run history. This covers every CI system's *structure* for free.

export type PipelineDefinitionProvider =
  | 'github_actions'
  | 'azure_pipelines'
  | 'gitlab_ci'
  | 'circleci'
  | 'bitbucket_pipelines'
  | 'jenkins'
  | 'other';

export type PipelineDefinition = {
  id: string;
  project_id: string;
  service_name: string;
  provider: PipelineDefinitionProvider;
  file_path: string;
  name: string | null;
  last_seen_at: string;
  created_at: string;
};

export type PipelineDefinitionStage = {
  id: string;
  project_id: string;
  pipeline_definition_id: string;
  name: string;
  stage_order: number;
  created_at: string;
};

export type DockerBuildStage = {
  name: string;
  base_image: string;
};

export type DiscoveredContainer = {
  id: string;
  project_id: string;
  service_name: string;
  source_file: string;
  container_name: string;
  image: string | null;
  build_stages: DockerBuildStage[] | null;
  ports: string[] | null;
  depends_on: string[] | null;
  volumes: string[] | null;
  last_seen_at: string;
  created_at: string;
};

export type InfraResourceSource = 'terraform' | 'kubernetes' | 'helm';

export type InfraResource = {
  id: string;
  project_id: string;
  service_name: string;
  source: InfraResourceSource;
  source_file: string;
  resource_type: string;
  resource_category: string | null;
  resource_name: string;
  namespace: string | null;
  metadata: Record<string, unknown> | null;
  last_seen_at: string;
  created_at: string;
};

export type ArchitectureType = 'monolith' | 'microservices';

export type ApiCall = {
  id: string;
  project_id: string;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  occurred_at: string;
};

export type ErrorEvent = {
  id: string;
  project_id: string;
  service_name: string;
  error_name: string;
  message: string | null;
  stack: string | null;
  endpoint: string | null;
  source_file: string | null;
  source_line: number | null;
  source_function: string | null;
  // Error Intelligence Phase 1 (P0) — all nullable: an SDK that hasn't been
  // upgraded, or that upgraded without configuring release/trace options,
  // still ingests successfully with these left null.
  release_version: string | null;
  git_commit_sha: string | null;
  git_branch: string | null;
  environment: string | null;
  deployment_id: string | null;
  fingerprint: string | null;
  error_group_id: string | null;
  trace_id: string | null;
  span_id: string | null;
  cpu_percent: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  event_loop_lag_ms: number | null;
  hostname: string | null;
  container_id: string | null;
  pod_name: string | null;
  node_name: string | null;
  namespace: string | null;
  ecs_task_arn: string | null;
  ecs_cluster_name: string | null;
  headers: Record<string, unknown> | null;
  request_body: Record<string, unknown> | null;
  query_params: Record<string, unknown> | null;
  // Error Intelligence Phase 2 (Tier 2.1) — populated only when the host
  // app opts in via monitor.setUser({id, email}); null otherwise.
  end_user_id: string | null;
  end_user_email: string | null;
  occurred_at: string;
};

// Error Intelligence Phase 1 (P0) — persistent grouping/fingerprint row,
// replacing the previous client-side "error_name::message" grouping. Mirrors
// public.error_groups 1:1.
export type ErrorGroupStatus = 'active' | 'resolved' | 'regressed';

export type ErrorGroup = {
  id: string;
  project_id: string;
  service_name: string;
  fingerprint: string;
  error_name: string;
  message: string | null;
  source_file: string | null;
  source_line: number | null;
  source_function: string | null;
  status: ErrorGroupStatus;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  resolved_at: string | null;
  resolved_by: string | null;
  owner_user_id: string | null;
  first_seen_release_version: string | null;
  first_seen_git_commit_sha: string | null;
  first_seen_git_branch: string | null;
  first_seen_deployment_id: string | null;
  first_seen_seconds_after_deploy: number | null;
  created_at: string;
};

// Result shape of the nearest_prior_deployment() RPC — used for the "started
// N minutes after deployment" banner for any individual error occurrence,
// not just a group's first-seen snapshot.
export type DeploymentCorrelation = {
  deployment_id: string;
  deployed_at: string;
  seconds_after: number;
  sha: string | null;
  ref: string | null;
  environment: string | null;
};

// Result shape of the nearest_prior_migration() RPC — see
// database_migrations in supabase/schema.sql for the "file mtime, not a real
// migration-run timestamp" caveat this correlation inherits.
export type MigrationCorrelation = {
  migration_id: string;
  tool: string;
  migration_name: string;
  applied_at: string;
  minutes_after: number;
};

// AI Copilot narrow slice (Tier 5.4) — backs the "Summarize with AI" card on
// the Error Dashboard. Generated on demand by the generate-error-summary
// Edge Function (Anthropic Messages API), cached one row per error_group so
// re-opening an already-summarized group doesn't re-call the LLM.
export type ErrorGroupAiSummary = {
  id: string;
  project_id: string;
  error_group_id: string;
  summary: string | null;
  business_flow: string | null;
  model: string | null;
  generated_at: string | null;
  // Error Intelligence Phase 3 (supabase/migrations/0023_error_group_root_cause.sql)
  // — same row, generated by a separate on-demand action.
  root_cause_hypothesis: string | null;
  likely_culprit_function: string | null;
  likely_culprit_location: string | null;
  contributing_factors: string[];
  suggested_fix: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
  root_cause_generated_at: string | null;
};

// Result shape of the detect_error_rate_anomalies() RPC (Error Intelligence
// Phase 2, Tier 2.5) — only ever returns a row when today's daily error
// count is a genuine statistical outlier (z-score > 2) against its trailing
// baseline, so an empty array means "nothing anomalous," not "not computed."
export type ErrorRateAnomaly = {
  metric: string;
  date: string;
  value: number;
  baseline_avg: number;
  baseline_stddev: number;
  z_score: number;
};

export type InfraSnapshot = {
  id: string;
  project_id: string;
  service_name: string;
  cpu_percent: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  uptime_seconds: number | null;
  event_loop_lag_ms: number | null;
  disk_used_pct: number | null;
  container_id: string | null;
  pod_name: string | null;
  node_name: string | null;
  namespace: string | null;
  ecs_task_arn: string | null;
  ecs_cluster_name: string | null;
  occurred_at: string;
};

export type DbQuery = {
  id: string;
  project_id: string;
  db_type: string;
  query_text: string | null;
  duration_ms: number;
  success: boolean;
  error_message: string | null;
  // Error Intelligence Phase 2 (Tier 2.2) — best-effort, may be null for a
  // query shape sdk/src/sql-context.js can't confidently classify.
  table_name: string | null;
  operation: string | null;
  occurred_at: string;
};

export type ProjectHealth = {
  project_id: string;
  score: number;
  total_requests_1h: number;
  avg_latency_ms: number | null;
  error_rate_1h: number;
  avg_cpu: number | null;
  avg_mem_pct: number | null;
  latest_uptime_seconds: number | null;
};

export type AlertSeverity = 'critical' | 'warning';

export type AlertType = 'high_cpu' | 'high_memory' | 'high_error_rate' | 'high_latency';

export type ActiveAlert = {
  project_id: string;
  project_name: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  triggered_at: string;
};

export type AlertHistoryEntry = {
  id: string;
  project_id: string;
  project_name: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  triggered_at: string;
  resolved_at: string | null;
};

export type SpanKind = 'server' | 'db' | 'cache' | 'external' | 'internal';
export type SpanStatus = 'ok' | 'error';

export type SpanRecord = {
  id: string;
  project_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  service_name: string;
  name: string;
  kind: SpanKind;
  target: string | null;
  status: SpanStatus;
  duration_ms: number;
  occurred_at: string;
};

export type TraceSummary = {
  traceId: string;
  rootName: string;
  serviceName: string;
  status: SpanStatus;
  durationMs: number;
  spanCount: number;
  occurredAt: string;
};

export type DependencyEdge = {
  from: string;
  to: string;
  kind: SpanKind;
  callCount: number;
  avgDurationMs: number;
  errorCount: number;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  id: string;
  project_id: string;
  service_name: string;
  level: LogLevel;
  message: string;
  trace_id: string | null;
  metadata: Record<string, unknown> | null;
  // Sprint 4 (docs/optimization_plan.md) — true when sdk/src/index.js's
  // log() truncated this message at maxLogSizeBytes (default 4KB).
  is_truncated: boolean;
  occurred_at: string;
};

export type OrgInvite = {
  id: string;
  organization_id: string;
  email: string;
  role: 'admin' | 'member';
  invited_by: string | null;
  created_at: string;
  redeemed_at: string | null;
};

export type ProjectRole = 'admin' | 'member';

export type ProjectMember = {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string;
  profile: Profile | null;
};

export type ProjectInvite = {
  id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  invited_by: string | null;
  created_at: string;
  redeemed_at: string | null;
};

export type Plan = {
  id: string;
  name: string;
  max_projects: number | null; // null = unlimited
  price_cents: number;
  sort_order: number;
  max_api_requests_per_month: number | null; // null = custom/unlimited; display-only, not enforced
  is_custom: boolean; // true for a single org's dynamically-created custom-retention plan (see create_custom_plan())
  organization_id: string | null; // set only when is_custom — the one org this plan is scoped to
  created_at: string;
};

export type SubscriptionStatus = 'active' | 'grace_period' | 'suspended';

export type OrganizationSubscription = {
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  grace_period_ends_at: string | null;
  updated_at: string;
};

export type RetentionDataType = 'logs' | 'traces' | 'db_queries' | 'api_calls';

export type RetentionPolicy = {
  plan_id: string;
  data_type: RetentionDataType;
  retention_days: number;
};

// Shape returned by both estimate_custom_plan_price() (live preview) and
// create_custom_plan() (the same breakdown, plus plan_id, for whatever
// actually got saved) — see supabase/schema.sql for how each cents figure
// is derived (Supabase's real per-GB storage cost + a target margin).
export type CustomPlanPriceEstimate = {
  base_fee_cents: number;
  price_per_gb_cents: number;
  infra_cost_per_gb_cents: number;
  target_margin_pct: number;
  estimated_gb: number;
  storage_cost_cents: number;
  total_cents: number;
  has_usage_data: boolean; // false when there's no ingestion this month or last month to project a rate from — storage_cost is 0 regardless of retention days chosen
  breakdown: Record<RetentionDataType, { retention_days: number; estimated_gb: number }>;
  plan_id?: string;
};

// Daily aggregation layer (docs/optimization_plan.md, Sprint 2) — one row per
// (project, day), populated by aggregate_daily_telemetry(). Meant for
// long-range trend views spanning longer than a plan's raw retention window,
// not a replacement for the existing 24h-detail types above (ApiCall,
// ErrorEvent, InfraSnapshot), which real-time/detail dashboards still read.

export type DailyApiMetric = {
  project_id: string;
  date: string;
  total_requests: number;
  total_errors: number;
  count_4xx: number;
  count_5xx: number;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  p99_latency_ms: number | null;
  updated_at: string;
};

export type DailyErrorMetric = {
  project_id: string;
  date: string;
  total_errors: number;
  critical_errors: number;
  warning_errors: number;
  info_errors: number;
  updated_at: string;
};

export type DailyInfraMetric = {
  project_id: string;
  date: string;
  avg_cpu_percent: number | null;
  avg_memory_percent: number | null;
  avg_event_loop_lag_ms: number | null;
  updated_at: string;
};

export type DailySecurityMetric = {
  project_id: string;
  date: string;
  vulnerabilities_found: number;
  vulnerabilities_fixed: number;
  updated_at: string;
};

// Tier 5.3 — mirrors public.requirement_documents/public.requirements
// (BRD/PRD/SRS upload -> LLM-extracted structured requirements).
export type RequirementDocumentStatus = 'pending' | 'processing' | 'processed' | 'failed';

export type RequirementDocument = {
  id: string;
  project_id: string;
  title: string;
  source_filename: string | null;
  status: RequirementDocumentStatus;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
  storage_key: string | null;
  file_size_bytes: number | null;
  webhook_url: string | null;
};

export type SuggestedTestCase = { title: string; steps: string[] };

export type Requirement = {
  id: string;
  document_id: string;
  requirement_key: string;
  category: 'functional' | 'non_functional' | 'business_rule' | 'constraint';
  title: string;
  description: string | null;
  priority: 'must' | 'should' | 'could' | 'wont' | null;
  source_excerpt: string | null;
  ai_confidence: number | null;
  suggested_test_cases: SuggestedTestCase[] | null;
};
