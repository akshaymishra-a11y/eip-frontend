// Category → icon/color mapping for the Architecture Explorer (Module 8,
// docs/CLOUD_INTELLIGENCE_PLATFORM_DESIGN.md §10.3). One visual style per
// resource *category*, not per exact node_type, per the design doc's
// "shared component per category, not per node_type" simplification.
// node_type → category here mirrors backend/src/jobs/pollers/cloud/*.collectors.ts's
// `category` field on each collector — kept as a small duplicated lookup
// (display-layer concern, same pattern as e.g. IncidentsService's
// SEVERITY_LABELS mirroring the dashboard) rather than fetching the mapping
// from the backend on every render.
export type ResourceCategory =
  | 'compute'
  | 'database'
  | 'networking'
  | 'load_balancing'
  | 'edge'
  | 'storage'
  | 'messaging'
  | 'api_layer'
  | 'security';

const NODE_TYPE_CATEGORY: Record<string, ResourceCategory> = {
  ec2_instance: 'compute',
  auto_scaling_group: 'compute',
  ecs_cluster: 'compute',
  ecs_service: 'compute',
  ecs_task: 'compute',
  eks_cluster: 'compute',
  eks_node_group: 'compute',
  lambda_function: 'compute',
  rds_instance: 'database',
  aurora_cluster: 'database',
  dynamodb_table: 'database',
  elasticache_redis: 'database',
  vpc: 'networking',
  subnet: 'networking',
  route_table: 'networking',
  security_group: 'networking',
  internet_gateway: 'networking',
  nat_gateway: 'networking',
  transit_gateway: 'networking',
  transit_gateway_attachment: 'networking',
  vpc_endpoint: 'networking',
  network_acl: 'networking',
  vpc_peering_connection: 'networking',
  alb: 'load_balancing',
  nlb: 'load_balancing',
  target_group: 'load_balancing',
  cloudfront_distribution: 'edge',
  s3_bucket: 'storage',
  efs_filesystem: 'storage',
  sqs_queue: 'messaging',
  sns_topic: 'messaging',
  eventbridge_bus: 'messaging',
  api_gateway: 'api_layer',
  iam_role: 'security',
  iam_policy: 'security',
  secrets_manager_secret: 'security',
};

export function categoryForNodeType(nodeType: string): ResourceCategory {
  return NODE_TYPE_CATEGORY[nodeType] ?? 'compute';
}

export const CATEGORY_STYLE: Record<ResourceCategory, { icon: string; color: string; label: string }> = {
  compute: { icon: 'dns', color: '#2563eb', label: 'Compute' },
  database: { icon: 'storage', color: '#059669', label: 'Database' },
  networking: { icon: 'lan', color: '#7c3aed', label: 'Networking' },
  load_balancing: { icon: 'balance', color: '#d97706', label: 'Load Balancing' },
  edge: { icon: 'public', color: '#0891b2', label: 'Edge' },
  storage: { icon: 'inventory_2', color: '#4b5563', label: 'Storage' },
  messaging: { icon: 'forum', color: '#db2777', label: 'Messaging' },
  api_layer: { icon: 'api', color: '#ea580c', label: 'API Layer' },
  security: { icon: 'security', color: '#dc2626', label: 'Security' },
};

const HEALTHY_STATES = new Set(['running', 'available', 'active', 'attached', 'in-use', 'ok', 'issuance']);
const UNHEALTHY_STATES = new Set(['stopped', 'failed', 'deleting', 'error', 'terminated', 'detached']);
const TRANSITIONING_STATES = new Set(['pending', 'modifying', 'creating', 'syncing', 'provisioning', 'rebooting']);

export function stateTone(state: string | null): 'success' | 'danger' | 'warning' | 'neutral' {
  if (!state) return 'neutral';
  const s = state.toLowerCase();
  if (HEALTHY_STATES.has(s)) return 'success';
  if (UNHEALTHY_STATES.has(s)) return 'danger';
  if (TRANSITIONING_STATES.has(s)) return 'warning';
  return 'neutral';
}

export function humanizeNodeType(nodeType: string): string {
  return nodeType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
