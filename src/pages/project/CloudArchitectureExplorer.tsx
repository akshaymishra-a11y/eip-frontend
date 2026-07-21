import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, Icon, PageHeader } from '../../components/ui';
import { CloudAccountsPanel } from '../../components/cloud/CloudAccountsPanel';
import { CloudGraphCanvas } from '../../components/cloud/CloudGraphCanvas';
import {
  fetchCloudGraph,
  fetchCloudHealthEvents,
  fetchCloudHealthScore,
  fetchCloudInsights,
  fetchCostOptimizations,
  updateCloudInsight,
  updateCostOptimization,
} from '../../lib/api';
import { useProject } from '../../lib/project-context';
import type { CloudEdge, CloudGraphView, CloudHealthEvent, CloudHealthScore, CloudInsight, CloudNode, CostOptimizationRecommendation } from '../../lib/types';
import { CATEGORY_STYLE, categoryForNodeType, humanizeNodeType } from '../../lib/cloud-graph-style';
import { describeSupabaseError } from '../../lib/errors';

// Module 8 — Architecture Visualization Engine
// (docs/CLOUD_INTELLIGENCE_PLATFORM_DESIGN.md §10). 5 view modes, one shared
// canvas (CloudGraphCanvas), one backend endpoint per view
// (GET cloud-graph?view=). The node-click detail panel shows open Module 9
// health events for the selected node — full parity with
// ArchitectureView.tsx's richer impact-analysis drawer (CPU/error
// correlation, deployment history) is still a possible follow-up, not this
// pass's scope.

function healthScoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

function HealthScoreBadge({ health }: { health: CloudHealthScore }) {
  const tone = healthScoreTone(health.score);
  const toneClass = tone === 'success' ? 'text-success bg-success-light' : tone === 'warning' ? 'text-warning bg-warning-light' : 'text-danger bg-danger-light';
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${toneClass}`}>
      <Icon name="monitor_heart" className="text-[18px]" />
      <span>Health {health.score}/100</span>
      {(health.criticalCount > 0 || health.warningCount > 0) && (
        <span className="text-xs font-normal opacity-80">
          ({health.criticalCount} critical, {health.warningCount} warning)
        </span>
      )}
    </div>
  );
}

const VIEW_TABS: { value: CloudGraphView; label: string; icon: string }[] = [
  { value: 'infrastructure', label: 'Infrastructure', icon: 'dns' },
  { value: 'service', label: 'Service', icon: 'hub' },
  { value: 'network', label: 'Network', icon: 'lan' },
  { value: 'vpc', label: 'VPC', icon: 'account_tree' },
  { value: 'dependency', label: 'Dependency', icon: 'device_hub' },
];

function NodeDetailPanel({ node, healthEvents, onClose }: { node: CloudNode; healthEvents: CloudHealthEvent[]; onClose: () => void }) {
  const style = CATEGORY_STYLE[categoryForNodeType(node.node_type)];
  const tagEntries = Object.entries(node.tags ?? {});
  const metadataEntries = Object.entries(node.metadata ?? {}).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0));
  const nodeEvents = healthEvents.filter((e) => e.cloud_node_id === node.id);

  return (
    <Card className="p-5 lg:col-span-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ color: style.color }}>
            <Icon name={style.icon} className="text-[18px]" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{node.name || node.external_id}</h3>
            <p className="text-xs text-text-secondary">{humanizeNodeType(node.node_type)}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>

      <dl className="space-y-1.5 text-xs mb-3">
        <div className="flex justify-between"><dt className="text-text-secondary">External ID</dt><dd className="text-text-primary font-mono truncate max-w-[60%]">{node.external_id}</dd></div>
        <div className="flex justify-between"><dt className="text-text-secondary">Region</dt><dd className="text-text-primary">{node.region ?? 'global'}</dd></div>
        <div className="flex justify-between"><dt className="text-text-secondary">State</dt><dd className="text-text-primary">{node.state ?? '—'}</dd></div>
        <div className="flex justify-between"><dt className="text-text-secondary">Last seen</dt><dd className="text-text-primary">{new Date(node.last_seen_at).toLocaleString()}</dd></div>
      </dl>

      {nodeEvents.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-text-primary mb-1">Open health issues</p>
          <div className="space-y-1.5">
            {nodeEvents.map((e) => (
              <div
                key={e.id}
                className={`text-xs rounded px-2 py-1.5 ${e.severity === 'critical' ? 'bg-danger-light text-danger' : e.severity === 'warning' ? 'bg-warning-light text-warning' : 'bg-background text-text-secondary'}`}
              >
                {e.detail ?? e.event_type}
              </div>
            ))}
          </div>
        </div>
      )}

      {tagEntries.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-text-primary mb-1">Tags</p>
          <div className="flex flex-wrap gap-1">
            {tagEntries.map(([k, v]) => (
              <span key={k} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 text-text-secondary">
                {k}={v}
              </span>
            ))}
          </div>
        </div>
      )}

      {metadataEntries.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-primary mb-1">Metadata</p>
          <pre className="text-[10px] bg-background border border-border rounded p-2 overflow-auto max-h-64">
            {JSON.stringify(Object.fromEntries(metadataEntries), null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}

const RECOMMENDATION_LABEL: Record<string, string> = {
  underutilized_ec2: 'Underutilized EC2 instance',
  idle_load_balancer: 'Idle load balancer',
  unused_elastic_ip: 'Unused Elastic IP',
  oversized_database: 'Oversized database',
  idle_nat_gateway: 'Idle NAT gateway',
};

// Module 10 — cost-optimization recommendations, scoped to the cloud_accounts/
// cloud_nodes graph (not the older project_integrations-based CloudDashboard.tsx),
// since recommendations are attributed to a cloud_node_id from that graph.
function CostOptimizationsPanel({ projectId }: { projectId: string }) {
  const [recommendations, setRecommendations] = useState<CostOptimizationRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchCostOptimizations(projectId, 'open')
      .then(setRecommendations)
      .catch(() => setRecommendations([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDismiss = useCallback(
    async (id: string) => {
      try {
        await updateCostOptimization(projectId, id, 'dismissed');
      } catch {
        // best-effort — a failed dismiss just leaves the row visible to retry
      }
      load();
    },
    [projectId, load],
  );

  if (loading || recommendations.length === 0) return null;

  const totalSavings = recommendations.reduce((sum, r) => sum + (r.estimated_monthly_savings_usd ?? 0), 0);

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-text-primary">Cost Optimization Recommendations</h2>
        {totalSavings > 0 && <span className="text-sm font-medium text-success">Up to ${totalSavings.toFixed(2)}/mo potential savings</span>}
      </div>
      <div className="space-y-2">
        {recommendations.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 border border-border rounded-md px-3 py-2">
            <div>
              <p className="text-sm font-medium text-text-primary">{RECOMMENDATION_LABEL[r.recommendation_type] ?? r.recommendation_type}</p>
              <p className="text-xs text-text-secondary">
                {r.estimated_monthly_savings_usd != null && `~$${r.estimated_monthly_savings_usd.toFixed(2)}/mo · `}
                detected {new Date(r.detected_at).toLocaleDateString()}
              </p>
            </div>
            <button type="button" onClick={() => handleDismiss(r.id)} className="text-xs text-text-muted hover:text-text-primary shrink-0">
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

const INSIGHT_ICON: Record<string, string> = {
  single_point_of_failure: 'warning',
  public_exposure_risk: 'lock_open',
  cost_spike: 'trending_up',
  resource_waste: 'delete_sweep',
  high_dependency_service: 'hub',
  network_misconfiguration: 'settings_ethernet',
  architecture_risk: 'error',
};

// Module 11 — same account-scoped rationale as CostOptimizationsPanel.
function CloudInsightsPanel({ projectId }: { projectId: string }) {
  const [insights, setInsights] = useState<CloudInsight[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchCloudInsights(projectId, 'open')
      .then(setInsights)
      .catch(() => setInsights([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDismiss = useCallback(
    async (id: string) => {
      try {
        await updateCloudInsight(projectId, id, 'dismissed');
      } catch {
        // best-effort — a failed dismiss just leaves the row visible to retry
      }
      load();
    },
    [projectId, load],
  );

  if (loading || insights.length === 0) return null;

  return (
    <Card className="p-5 mb-6">
      <h2 className="text-base font-semibold text-text-primary mb-3">Cloud Insights</h2>
      <div className="space-y-2">
        {insights.map((insight) => {
          const toneClass =
            insight.severity === 'critical' ? 'border-danger/40 bg-danger-light' : insight.severity === 'warning' ? 'border-warning/40 bg-warning-light' : 'border-border bg-background';
          return (
            <div key={insight.id} className={`flex items-start justify-between gap-3 border rounded-md px-3 py-2.5 ${toneClass}`}>
              <div className="flex items-start gap-2.5 min-w-0">
                <Icon name={INSIGHT_ICON[insight.insight_type] ?? 'info'} className="text-[18px] text-text-secondary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{insight.title}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{insight.impact}</p>
                  <p className="text-xs text-text-muted mt-1 italic">{insight.recommendation}</p>
                </div>
              </div>
              <button type="button" onClick={() => handleDismiss(insight.id)} className="text-xs text-text-muted hover:text-text-primary shrink-0">
                Dismiss
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function CloudArchitectureExplorer() {
  const { project } = useProject();
  const [view, setView] = useState<CloudGraphView>('infrastructure');
  const [nodes, setNodes] = useState<CloudNode[]>([]);
  const [edges, setEdges] = useState<CloudEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<CloudNode | null>(null);
  const [selectedVpcId, setSelectedVpcId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Populated from the infrastructure view's own nodes rather than a second
  // fetch — every vpc node discovery ever wrote is already in that response.
  const [availableVpcs, setAvailableVpcs] = useState<CloudNode[]>([]);

  // Module 9 — fetched once per project (not per view switch), since open
  // health events/score are project-wide, not view-scoped.
  const [healthScore, setHealthScore] = useState<CloudHealthScore | null>(null);
  const [healthEvents, setHealthEvents] = useState<CloudHealthEvent[]>([]);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    fetchCloudGraph(project.id, 'infrastructure')
      .then((res) => {
        if (!cancelled) setAvailableVpcs(res.nodes.filter((n) => n.node_type === 'vpc'));
      })
      .catch(() => {
        if (!cancelled) setAvailableVpcs([]);
      });
    Promise.all([fetchCloudHealthScore(project.id), fetchCloudHealthEvents(project.id)])
      .then(([score, events]) => {
        if (cancelled) return;
        setHealthScore(score);
        setHealthEvents(events);
      })
      .catch(() => {
        if (!cancelled) {
          setHealthScore(null);
          setHealthEvents([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  useEffect(() => {
    if (!project) return;
    if (view === 'vpc' && !selectedVpcId) {
      setNodes([]);
      setEdges([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSelectedNode(null);
    // `cancelled` guards against a stale, slower-to-resolve request from a
    // PREVIOUS tab/VPC selection overwriting the current one's result after
    // the fact — without it, switching tabs quickly could show the right
    // graph for an instant and then have it silently replaced by an older
    // in-flight response landing late.
    fetchCloudGraph(project.id, view, view === 'vpc' ? selectedVpcId : undefined)
      .then((res) => {
        if (cancelled) return;
        setNodes(res.nodes);
        setEdges(res.edges);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(describeSupabaseError(err, 'Could not load the cloud graph.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, view, selectedVpcId]);

  const direction = view === 'dependency' ? 'LR' : 'TB';
  const emptyMessage = useMemo(() => {
    if (view === 'vpc' && !selectedVpcId) return 'Select a VPC above to view its topology.';
    return 'No resources discovered yet for this view — connect a cloud account below and run a sync.';
  }, [view, selectedVpcId]);

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Cloud Architecture Explorer"
          subtitle="Automatically discovered infrastructure, network topology, and service dependencies."
        />
        {healthScore && <HealthScoreBadge health={healthScore} />}
      </div>

      <div className="mb-6">
        {project && <CloudAccountsPanel projectId={project.id} />}
      </div>

      {project && <CloudInsightsPanel projectId={project.id} />}
      {project && <CostOptimizationsPanel projectId={project.id} />}

      <div className="flex items-center gap-2 mb-4 border-b border-border">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setView(tab.value)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              view === tab.value ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon name={tab.icon} className="text-[16px]" />
            {tab.label}
          </button>
        ))}
      </div>

      {view === 'vpc' && (
        <div className="mb-4">
          <select
            value={selectedVpcId}
            onChange={(e) => setSelectedVpcId(e.target.value)}
            className="h-10 px-3 bg-white border border-border rounded-md text-sm text-text-primary"
          >
            <option value="">Select a VPC…</option>
            {availableVpcs.map((vpc) => (
              <option key={vpc.id} value={vpc.id}>
                {vpc.name || vpc.external_id} ({vpc.region})
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className={selectedNode ? 'lg:col-span-8' : 'lg:col-span-12'}>
          {!loading && nodes.length === 0 ? (
            <Card>
              <EmptyState icon="account_tree" title="Nothing to show yet" description={emptyMessage} />
            </Card>
          ) : (
            <CloudGraphCanvas nodes={nodes} edges={edges} direction={direction} onNodeClick={setSelectedNode} height={640} />
          )}
        </div>
        {selectedNode && <NodeDetailPanel node={selectedNode} healthEvents={healthEvents} onClose={() => setSelectedNode(null)} />}
      </div>
    </>
  );
}
