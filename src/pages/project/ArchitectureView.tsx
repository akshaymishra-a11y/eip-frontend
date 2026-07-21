import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarSparkline } from '../../components/charts/Sparkline';
import { Card, EmptyState, Icon, PageHeader, StatusPill } from '../../components/ui';
import {
  deleteDiscoveredService,
  fetchContainerEvents,
  fetchDeployments,
  fetchDiscoveredServices,
  fetchErrorCountInWindow,
  fetchLatestInfraSnapshots,
  fetchMyProjectRole,
  fetchOwningRepository,
  fetchPipelineDefinitions,
  fetchProjectActiveAlerts,
  fetchServiceCpuTrend,
  fetchServiceDependencyEdges,
  isServiceOnline,
} from '../../lib/api';
import { useConfirm } from '../../lib/confirm-context';
import { describeSupabaseError } from '../../lib/errors';
import { useOrg } from '../../lib/org-context';
import { useProject } from '../../lib/project-context';
import type {
  AlertHistoryEntry,
  ContainerEvent,
  ContainerEventType,
  DependencyEdge,
  Deployment,
  DeploymentPlatform,
  DiscoveredService,
  InfraSnapshot,
  PipelineDefinition,
  ProjectRole,
  Repository,
  ServiceType,
} from '../../lib/types';

const TYPE_LABEL: Record<ServiceType, string> = {
  application: 'Application',
  database: 'Database',
  cache: 'Cache',
  external_api: 'External API',
};

const DEPLOYMENT_ICON: Record<DeploymentPlatform, string> = {
  docker: 'inventory_2',
  ecs: 'cloud_queue',
  kubernetes: 'hub',
  'bare-metal': 'dns',
};

const DEPLOYMENT_LABEL: Record<DeploymentPlatform, string> = {
  docker: 'Docker',
  ecs: 'AWS ECS',
  kubernetes: 'Kubernetes',
  'bare-metal': 'Bare metal',
};

const EVENT_CLASS: Record<ContainerEventType, string> = {
  start: 'text-success bg-success-light',
  scale_up: 'text-success bg-success-light',
  stop: 'text-text-muted bg-background',
  scale_down: 'text-warning bg-warning-light',
  restart: 'text-warning bg-warning-light',
  die: 'text-danger bg-danger-light',
  oom_kill: 'text-danger bg-danger-light',
};

const EVENT_LABEL: Record<ContainerEventType, string> = {
  start: 'Started',
  stop: 'Stopped',
  die: 'Died',
  restart: 'Restarted',
  oom_kill: 'OOM killed',
  scale_up: 'Scaled up',
  scale_down: 'Scaled down',
};

type NodeStatus = 'healthy' | 'warning' | 'critical';
type NodeKind = 'application' | 'database' | 'cache' | 'external';

type GraphNode = {
  id: string;
  name: string;
  kind: NodeKind;
  service: DiscoveredService | null;
  status: NodeStatus;
  online: boolean;
  col: number;
  row: number;
};

const KIND_ICON: Record<NodeKind, string> = {
  application: 'dns',
  database: 'storage',
  cache: 'speed',
  external: 'public',
};

const KIND_LABEL: Record<NodeKind, string> = {
  application: 'Service',
  database: 'Database',
  cache: 'Cache',
  external: 'External dependency',
};

const STATUS_DOT: Record<NodeStatus, string> = {
  healthy: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-danger',
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  healthy: 'Operational',
  warning: 'Degraded',
  critical: 'Critical',
};

const COL_FOR_KIND: Record<NodeKind, number> = { application: 0, database: 1, cache: 1, external: 2 };

const NODE_W = 200;
const NODE_H = 72;
const COL_GAP = 260;
const ROW_GAP = 96;
const PADDING = 40;

function spanKindToNodeKind(kind: DependencyEdge['kind']): NodeKind {
  if (kind === 'db') return 'database';
  if (kind === 'cache') return 'cache';
  if (kind === 'external') return 'external';
  return 'application';
}

function serviceTypeToNodeKind(type: ServiceType): NodeKind {
  if (type === 'database') return 'database';
  if (type === 'cache') return 'cache';
  if (type === 'external_api') return 'external';
  return 'application';
}

// No single column/status is stored anywhere — this derives a 3-tier health signal from
// the same online/CPU/container-event signals already shown elsewhere on this page.
function deriveStatus(online: boolean, infra: InfraSnapshot | undefined, recentEvents: ContainerEvent[]): NodeStatus {
  const hadFailure = recentEvents.some((e) => e.event_type === 'die' || e.event_type === 'oom_kill');
  if (!online || hadFailure) return 'critical';
  const hadDegrade = recentEvents.some((e) => e.event_type === 'restart' || e.event_type === 'scale_down');
  const highCpu = infra?.cpu_percent != null && infra.cpu_percent > 75;
  if (hadDegrade || highCpu) return 'warning';
  return 'healthy';
}

function nodeX(node: GraphNode) {
  return PADDING + node.col * COL_GAP;
}
function nodeY(node: GraphNode) {
  return PADDING + node.row * ROW_GAP;
}

function edgePath(source: GraphNode, target: GraphNode) {
  const forward = target.col >= source.col;
  const sx = nodeX(source) + (forward ? NODE_W : 0);
  const sy = nodeY(source) + NODE_H / 2;
  const tx = nodeX(target) + (forward ? 0 : NODE_W);
  const ty = nodeY(target) + NODE_H / 2;
  const midX = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
}

export default function ArchitectureView() {
  const { project } = useProject();
  const { currentOrganization, currentRole } = useOrg();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [services, setServices] = useState<DiscoveredService[]>([]);
  const [infra, setInfra] = useState<InfraSnapshot[]>([]);
  const [containerEvents, setContainerEvents] = useState<ContainerEvent[]>([]);
  const [dependencyEdges, setDependencyEdges] = useState<DependencyEdge[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertHistoryEntry[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [pipelineDefs, setPipelineDefs] = useState<PipelineDefinition[]>([]);
  const [owningRepo, setOwningRepo] = useState<Repository | null>(null);
  const [errorWindow, setErrorWindow] = useState<{ before: number; after: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cpuTrend, setCpuTrend] = useState<number[]>([]);
  const [scale, setScale] = useState(1);
  const [myProjectRole, setMyProjectRole] = useState<ProjectRole | null>(null);
  const [removingServiceId, setRemovingServiceId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  const isOrgAdmin =
    !!project && currentOrganization?.id === project.organization_id && (currentRole === 'owner' || currentRole === 'admin');
  const canManageServices = isOrgAdmin || myProjectRole === 'admin';

  useEffect(() => {
    if (!project) return;
    fetchMyProjectRole(project.id)
      .then(setMyProjectRole)
      .catch(() => setMyProjectRole(null));
  }, [project]);

  const load = useCallback(async () => {
    if (!project) return;
    // Independent fetches — container_events/dependency edges/alerts/deployments/
    // pipeline defs are newer or derived queries, and one failing shouldn't blank
    // out the rest of the page.
    const [servicesResult, infraResult, eventsResult, edgesResult, alertsResult, deploymentsResult, pipelineDefsResult] =
      await Promise.allSettled([
        fetchDiscoveredServices(project.id),
        fetchLatestInfraSnapshots(project.id),
        fetchContainerEvents(project.id),
        fetchServiceDependencyEdges(project.id),
        fetchProjectActiveAlerts(project.id),
        fetchDeployments(project.id),
        fetchPipelineDefinitions(project.id),
      ]);

    if (servicesResult.status === 'fulfilled') setServices(servicesResult.value);
    else console.error('[ArchitectureView] fetchDiscoveredServices failed:', servicesResult.reason);

    if (infraResult.status === 'fulfilled') setInfra(infraResult.value);
    else console.error('[ArchitectureView] fetchLatestInfraSnapshots failed:', infraResult.reason);

    if (eventsResult.status === 'fulfilled') setContainerEvents(eventsResult.value);
    else console.error('[ArchitectureView] fetchContainerEvents failed:', eventsResult.reason);

    if (edgesResult.status === 'fulfilled') setDependencyEdges(edgesResult.value);
    else console.error('[ArchitectureView] fetchServiceDependencyEdges failed:', edgesResult.reason);

    if (alertsResult.status === 'fulfilled') setActiveAlerts(alertsResult.value);
    else console.error('[ArchitectureView] fetchProjectActiveAlerts failed:', alertsResult.reason);

    if (deploymentsResult.status === 'fulfilled') setDeployments(deploymentsResult.value);
    else console.error('[ArchitectureView] fetchDeployments failed:', deploymentsResult.reason);

    if (pipelineDefsResult.status === 'fulfilled') setPipelineDefs(pipelineDefsResult.value);
    else console.error('[ArchitectureView] fetchPipelineDefinitions failed:', pipelineDefsResult.reason);
  }, [project]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const infraByService = useMemo(() => new Map(infra.map((s) => [s.service_name, s])), [infra]);

  const { nodes, nodesByName, resolvedEdges, allEdges, contentWidth, contentHeight, busiestEdge, appServiceCount } = useMemo(() => {
    const now = Date.now();
    const recentEventsByService = new Map<string, ContainerEvent[]>();
    for (const ev of containerEvents) {
      if (now - new Date(ev.occurred_at).getTime() > 60 * 60 * 1000) continue;
      const list = recentEventsByService.get(ev.service_name) ?? [];
      list.push(ev);
      recentEventsByService.set(ev.service_name, list);
    }

    const byName = new Map<string, GraphNode>();
    for (const service of services) {
      const online = isServiceOnline(service);
      byName.set(service.name, {
        id: service.id,
        name: service.name,
        kind: serviceTypeToNodeKind(service.service_type),
        service,
        status: deriveStatus(online, infraByService.get(service.name), recentEventsByService.get(service.name) ?? []),
        online,
        col: 0,
        row: 0,
      });
    }
    // Dependency edges reference call targets (and occasionally callers) that aren't
    // necessarily registered in discovered_services yet — synthesize a node so the
    // edge still renders instead of silently getting dropped. A target can be called
    // by more than one service (e.g. 3 services all hitting "postgres"), so its error
    // status has to be aggregated across every edge that names it, not just whichever
    // edge happens to be encountered first.
    const targetHasErrors = new Map<string, boolean>();
    for (const edge of dependencyEdges) {
      targetHasErrors.set(edge.to, (targetHasErrors.get(edge.to) ?? false) || edge.errorCount > 0);
    }
    for (const edge of dependencyEdges) {
      if (!byName.has(edge.from)) {
        byName.set(edge.from, { id: `dep:from:${edge.from}`, name: edge.from, kind: 'application', service: null, status: 'healthy', online: true, col: 0, row: 0 });
      }
      if (!byName.has(edge.to)) {
        byName.set(edge.to, {
          id: `dep:to:${edge.to}:${edge.kind}`,
          name: edge.to,
          kind: spanKindToNodeKind(edge.kind),
          service: null,
          status: targetHasErrors.get(edge.to) ? 'critical' : 'healthy',
          online: true,
          col: 0,
          row: 0,
        });
      }
    }

    const columns: GraphNode[][] = [[], [], []];
    for (const node of byName.values()) columns[COL_FOR_KIND[node.kind]].push(node);
    columns.forEach((col) => {
      col.sort((a, b) => a.name.localeCompare(b.name));
      col.forEach((node, rowIndex) => {
        node.col = columns.indexOf(col);
        node.row = rowIndex;
      });
    });

    const maxRows = Math.max(1, ...columns.map((c) => c.length));
    const resolved = dependencyEdges
      .map((edge) => ({ edge, source: byName.get(edge.from), target: byName.get(edge.to), inferred: false }))
      .filter((e): e is { edge: DependencyEdge; source: GraphNode; target: GraphNode; inferred: boolean } => !!e.source && !!e.target);

    // A monolith has exactly one application node, so any database/cache/external node
    // that isn't already linked by a traced call (e.g. no wrapDatabase() instrumentation
    // yet) can only belong to that one service — connect it rather than leaving it
    // floating with no line at all, which reads as "unrelated" instead of "untraced".
    const appServiceCount = services.filter((s) => s.service_type === 'application').length;
    if (appServiceCount === 1) {
      const soleApp = Array.from(byName.values()).find((n) => n.service?.service_type === 'application');
      if (soleApp) {
        const connectedIds = new Set(resolved.flatMap((r) => [r.source.id, r.target.id]));
        for (const node of byName.values()) {
          if (node.kind === 'application' || connectedIds.has(node.id)) continue;
          const kind: DependencyEdge['kind'] = node.kind === 'database' ? 'db' : node.kind === 'cache' ? 'cache' : 'external';
          resolved.push({
            edge: { from: soleApp.name, to: node.name, kind, callCount: 0, avgDurationMs: 0, errorCount: 0 },
            source: soleApp,
            target: node,
            inferred: true,
          });
        }
      }
    }

    return {
      nodes: Array.from(byName.values()),
      nodesByName: byName,
      resolvedEdges: resolved,
      allEdges: resolved.map((r) => r.edge),
      contentWidth: PADDING * 2 + NODE_W + (columns.length - 1) * COL_GAP,
      contentHeight: PADDING * 2 + NODE_H + (maxRows - 1) * ROW_GAP,
      busiestEdge: dependencyEdges.length ? dependencyEdges.reduce((a, b) => (b.callCount > a.callCount ? b : a)) : null,
      appServiceCount,
    };
  }, [services, dependencyEdges, infraByService, containerEvents]);

  const selectedNode = selectedId ? (nodesByName.get(selectedId) ?? nodes.find((n) => n.id === selectedId)) ?? null : null;

  useEffect(() => {
    if (!project || !selectedNode?.service) {
      setCpuTrend([]);
      return;
    }
    let cancelled = false;
    fetchServiceCpuTrend(project.id, selectedNode.service.name).then((data) => {
      if (!cancelled) setCpuTrend(data);
    });
    return () => {
      cancelled = true;
    };
  }, [project, selectedNode]);

  const selectedInfra = selectedNode?.service ? infraByService.get(selectedNode.service.name) : undefined;
  const relatedEdges = selectedNode
    ? selectedNode.kind === 'application'
      ? allEdges.filter((e) => e.from === selectedNode.name)
      : allEdges.filter((e) => e.to === selectedNode.name)
    : [];

  // Impact Analysis (PRD v2): "which repo owns this service", "which
  // pipeline/deployment touched it", "did errors spike after the last
  // deploy". Dependency-direction questions ("what depends on this" / "what
  // breaks if this goes down") are already answered above by relatedEdges —
  // this only covers what that doesn't.
  const serviceDeployments = useMemo(
    () => (selectedNode?.service ? deployments.filter((d) => d.service_name === selectedNode.service!.name) : []),
    [deployments, selectedNode]
  );
  const servicePipelineDefs = useMemo(
    () => (selectedNode?.service ? pipelineDefs.filter((p) => p.service_name === selectedNode.service!.name) : []),
    [pipelineDefs, selectedNode]
  );
  // fetchDeployments already orders by updated_at_source desc, so the first
  // match for this service is its most recent deployment.
  const latestDeployment = serviceDeployments[0] ?? null;

  useEffect(() => {
    if (!project || !selectedNode?.service) {
      setOwningRepo(null);
      return;
    }
    let cancelled = false;
    fetchOwningRepository(project.id, selectedNode.service.name)
      .then((repo) => {
        if (!cancelled) setOwningRepo(repo);
      })
      .catch(() => {
        if (!cancelled) setOwningRepo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project, selectedNode]);

  useEffect(() => {
    if (!project || !latestDeployment) {
      setErrorWindow(null);
      return;
    }
    let cancelled = false;
    const deployedAt = new Date(latestDeployment.updated_at_source || latestDeployment.created_at_source || latestDeployment.created_at);
    const before = new Date(deployedAt.getTime() - 60 * 60 * 1000);
    const after = new Date(deployedAt.getTime() + 60 * 60 * 1000);
    Promise.all([
      fetchErrorCountInWindow(project.id, latestDeployment.service_name, before, deployedAt),
      fetchErrorCountInWindow(project.id, latestDeployment.service_name, deployedAt, after),
    ])
      .then(([beforeCount, afterCount]) => {
        if (!cancelled) setErrorWindow({ before: beforeCount, after: afterCount });
      })
      .catch(() => {
        if (!cancelled) setErrorWindow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project, latestDeployment]);

  const handleRemoveService = async (serviceId: string, serviceName: string) => {
    if (!project) return;
    const confirmed = await confirm({
      title: `Remove ${serviceName}?`,
      message: 'This deletes all of its errors, spans, logs, and discovered pipelines/containers. This can\'t be undone.',
      tone: 'danger',
      confirmLabel: 'Remove Service',
    });
    if (!confirmed) return;
    setRemoveError(null);
    setRemovingServiceId(serviceId);
    try {
      await deleteDiscoveredService(project.id, serviceId);
      setSelectedId(null);
      await load();
    } catch (err) {
      setRemoveError(describeSupabaseError(err, 'Could not remove service.'));
    } finally {
      setRemovingServiceId(null);
    }
  };

  const zoomIn = () => setScale((s) => Math.min(2, Math.round((s + 0.1) * 10) / 10));
  const zoomOut = () => setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10));
  const recenter = () => {
    setScale(1);
    const el = containerRef.current;
    if (el) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    }
  };

  return (
    <>
      <PageHeader title="Architecture View" subtitle="Auto-discovered from live SDK telemetry." />

      {!loading && services.length === 0 ? (
        <Card>
          <EmptyState icon="schema" title="No architecture discovered yet" description="Once your SDK starts sending telemetry, discovered services will appear here." />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="relative h-[620px] bg-secondary">
              <div
                ref={containerRef}
                className="eip-graph-canvas relative w-full h-full overflow-auto cursor-grab active:cursor-grabbing select-none"
                onMouseDown={(e) => {
                  const el = containerRef.current;
                  if (!el) return;
                  dragState.current = { startX: e.pageX, startY: e.pageY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
                }}
                onMouseMove={(e) => {
                  const el = containerRef.current;
                  if (!dragState.current || !el) return;
                  el.scrollLeft = dragState.current.scrollLeft - (e.pageX - dragState.current.startX);
                  el.scrollTop = dragState.current.scrollTop - (e.pageY - dragState.current.startY);
                }}
                onMouseUp={() => (dragState.current = null)}
                onMouseLeave={() => (dragState.current = null)}
              >
                <div style={{ width: contentWidth * scale, height: contentHeight * scale }}>
                  <div style={{ width: contentWidth, height: contentHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="relative">
                    <svg className="absolute inset-0 pointer-events-none" width={contentWidth} height={contentHeight}>
                      {resolvedEdges.map(({ edge, source, target, inferred }) => (
                        <path
                          key={`${edge.from}->${edge.to}->${edge.kind}`}
                          d={edgePath(source, target)}
                          fill="none"
                          stroke={inferred ? '#94A3B8' : edge.errorCount > 0 ? '#EF4444' : '#64748B'}
                          strokeWidth={inferred ? 2 : 2.5}
                          strokeDasharray={inferred ? '3 4' : undefined}
                          opacity={inferred ? 0.7 : 1}
                          className={!inferred && edge === busiestEdge ? 'eip-animated-connection' : undefined}
                        />
                      ))}
                    </svg>

                    {nodes.map((node) => {
                      const isSelected = selectedId === node.id;
                      const shapeClass = node.kind === 'external' ? 'rounded-full' : node.kind === 'database' || node.kind === 'cache' ? 'rounded-xl' : 'rounded-md';
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => setSelectedId(node.id)}
                          style={{ left: nodeX(node), top: nodeY(node), width: NODE_W, height: NODE_H }}
                          className={`absolute flex flex-col justify-center gap-1 px-3 bg-white/5 backdrop-blur border text-left transition-colors hover:bg-white/10 ${shapeClass} ${
                            isSelected ? 'border-primary ring-2 ring-primary/30' : node.kind === 'external' ? 'border-slate-500 border-dashed' : 'border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[node.status]}`} />
                            <Icon name={KIND_ICON[node.kind]} className="text-slate-300 text-[16px] shrink-0" />
                            <span className="text-sm font-medium text-white truncate">{node.name}</span>
                            {node.service?.deployment_platform && (
                              <span className="ml-auto shrink-0" title={DEPLOYMENT_LABEL[node.service.deployment_platform]}>
                                <Icon name={DEPLOYMENT_ICON[node.service.deployment_platform]} className="text-slate-400 text-[14px]" />
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate pl-[22px]">
                            {node.service
                              ? `${node.service.language ? `${node.service.language} · ` : ''}${node.service.framework || TYPE_LABEL[node.service.service_type]}`
                              : KIND_LABEL[node.kind]}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="absolute top-3 left-3 text-xs uppercase tracking-wide font-semibold text-slate-400 bg-black/30 backdrop-blur rounded px-2 py-1 pointer-events-none">
                {appServiceCount <= 1 ? 'Monolith' : 'Microservices'} · {appServiceCount} service{appServiceCount === 1 ? '' : 's'} ·{' '}
                {resolvedEdges.length} connection{resolvedEdges.length === 1 ? '' : 's'}
                {resolvedEdges.length === 0 && dependencyEdges.length === 0 && ' (none traced yet)'}
              </div>

              <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10">
                <button type="button" title="Zoom In" onClick={zoomIn} className="w-9 h-9 bg-white/90 backdrop-blur border border-border rounded shadow flex items-center justify-center hover:bg-white">
                  <Icon name="add" className="text-[18px]" />
                </button>
                <button type="button" title="Zoom Out" onClick={zoomOut} className="w-9 h-9 bg-white/90 backdrop-blur border border-border rounded shadow flex items-center justify-center hover:bg-white">
                  <Icon name="remove" className="text-[18px]" />
                </button>
                <button type="button" title="Recenter" onClick={recenter} className="w-9 h-9 bg-white/90 backdrop-blur border border-border rounded shadow flex items-center justify-center hover:bg-white">
                  <Icon name="recenter" className="text-[18px]" />
                </button>
              </div>

              <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur border border-border rounded-lg px-3 py-2 flex gap-4 text-xs z-10">
                {(['healthy', 'warning', 'critical'] as const).map((status) => (
                  <span key={status} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                    {STATUS_LABEL[status]}
                  </span>
                ))}
              </div>

              <div
                className={`absolute top-0 right-0 h-full w-[340px] bg-white shadow-2xl border-l border-border transition-transform duration-300 overflow-y-auto z-20 ${
                  selectedNode ? 'translate-x-0' : 'translate-x-full'
                }`}
              >
                {selectedNode && (
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="text-base font-semibold text-text-primary">Service Details</h2>
                      <button type="button" onClick={() => setSelectedId(null)} className="p-1 hover:bg-background rounded">
                        <Icon name="close" className="text-[18px] text-text-secondary" />
                      </button>
                    </div>

                    <div className="space-y-5">
                      <section>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[selectedNode.status]}`} />
                          <span className="text-base font-bold text-text-primary truncate">{selectedNode.name}</span>
                        </div>
                        <p className="text-xs text-text-secondary">
                          {selectedNode.service ? TYPE_LABEL[selectedNode.service.service_type] : KIND_LABEL[selectedNode.kind]} ·{' '}
                          {STATUS_LABEL[selectedNode.status]}
                        </p>
                      </section>

                      {selectedInfra && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-background p-3 rounded border border-border">
                            <div className="text-xs text-text-secondary mb-1">CPU</div>
                            <div className="text-lg font-mono font-semibold text-text-primary">
                              {selectedInfra.cpu_percent != null ? `${selectedInfra.cpu_percent.toFixed(1)}%` : '—'}
                            </div>
                          </div>
                          <div className="bg-background p-3 rounded border border-border">
                            <div className="text-xs text-text-secondary mb-1">Memory</div>
                            <div className="text-lg font-mono font-semibold text-text-primary">
                              {selectedInfra.memory_used_mb != null && selectedInfra.memory_total_mb
                                ? `${selectedInfra.memory_used_mb.toFixed(0)}/${selectedInfra.memory_total_mb.toFixed(0)}MB`
                                : '—'}
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedNode.service && cpuTrend.some((v) => v > 0) && (
                        <section>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">CPU (Last 24h)</h3>
                          <BarSparkline data={cpuTrend} color={selectedNode.status === 'critical' ? '#EF4444' : selectedNode.status === 'warning' ? '#F59E0B' : '#2563EB'} />
                        </section>
                      )}

                      {selectedNode.service && (
                        <dl className="space-y-2 text-sm">
                          <Row label="Language" value={selectedNode.service.language ?? '—'} />
                          <Row label="Framework" value={selectedNode.service.framework ?? '—'} />
                          <Row label="Runtime" value={selectedNode.service.runtime ?? '—'} />
                          <Row label="Host" value={selectedNode.service.hostname ?? '—'} />
                          <Row label="Environment" value={selectedNode.service.node_env ?? '—'} />
                          {selectedNode.service.deployment_platform && (
                            <>
                              <Row label="Platform" value={DEPLOYMENT_LABEL[selectedNode.service.deployment_platform]} />
                              {selectedNode.service.container_id && <Row label="Container ID" value={selectedNode.service.container_id} />}
                              {selectedNode.service.container_image && <Row label="Image" value={selectedNode.service.container_image} />}
                              {selectedNode.service.cluster_name && <Row label="Cluster" value={selectedNode.service.cluster_name} />}
                            </>
                          )}
                          <Row label="Last seen" value={new Date(selectedNode.service.last_seen_at).toLocaleString()} />
                        </dl>
                      )}

                      {selectedNode.service && (
                        <section>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">Delivery &amp; Impact</h3>
                          <dl className="space-y-2 text-sm">
                            <div className="flex justify-between border-b border-border pb-2">
                              <dt className="text-text-secondary">Owning Repository</dt>
                              <dd className="text-text-primary font-medium text-right truncate max-w-[60%]">
                                {owningRepo ? (
                                  owningRepo.html_url ? (
                                    <a href={owningRepo.html_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                      {owningRepo.full_name}
                                    </a>
                                  ) : (
                                    owningRepo.full_name
                                  )
                                ) : (
                                  <span className="text-text-muted italic font-normal">Not linked</span>
                                )}
                              </dd>
                            </div>

                            {latestDeployment ? (
                              <>
                                <Row
                                  label="Last Deployment"
                                  value={`${latestDeployment.environment} · ${new Date(
                                    latestDeployment.updated_at_source || latestDeployment.created_at_source || latestDeployment.created_at
                                  ).toLocaleString()}`}
                                />
                                {errorWindow && (
                                  <div className="flex justify-between border-b border-border pb-2">
                                    <dt className="text-text-secondary">Errors (1h before → after)</dt>
                                    <dd
                                      className={`font-medium text-right ${
                                        errorWindow.after > errorWindow.before ? 'text-danger' : 'text-text-primary'
                                      }`}
                                    >
                                      {errorWindow.before} → {errorWindow.after}
                                    </dd>
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-text-muted">No deployments recorded for this service yet.</p>
                            )}
                          </dl>

                          {servicePipelineDefs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                              {servicePipelineDefs.map((def) => (
                                <StatusPill key={def.id} tone="neutral">
                                  {def.provider.replace(/_/g, ' ')}
                                </StatusPill>
                              ))}
                            </div>
                          )}
                        </section>
                      )}

                      {relatedEdges.length > 0 && (
                        <section>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
                            {selectedNode.kind === 'application' ? 'Calls' : 'Called By'}
                          </h3>
                          <div className="space-y-1.5">
                            {relatedEdges.map((edge) => {
                              const otherName = selectedNode.kind === 'application' ? edge.to : edge.from;
                              const otherNode = nodesByName.get(otherName);
                              return (
                                <button
                                  key={`${edge.from}-${edge.to}-${edge.kind}`}
                                  type="button"
                                  onClick={() => otherNode && setSelectedId(otherNode.id)}
                                  disabled={!otherNode}
                                  className="w-full flex items-center justify-between p-2 hover:bg-background rounded border border-transparent hover:border-border transition-colors text-left disabled:cursor-default"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Icon name={KIND_ICON[spanKindToNodeKind(edge.kind)]} className="text-primary text-[18px] shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm text-text-primary truncate">{otherName}</p>
                                      <p className="text-[11px] text-text-secondary">
                                        {edge.callCount > 0 ? (
                                          <>
                                            {edge.callCount} calls · {edge.avgDurationMs.toFixed(0)}ms avg
                                            {edge.errorCount > 0 && <span className="text-danger"> · {edge.errorCount} errors</span>}
                                          </>
                                        ) : (
                                          <span className="italic">Not traced yet — inferred from monolith topology</span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                  {otherNode && <Icon name="chevron_right" className="text-text-muted text-[16px] shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      )}

                      {activeAlerts.length > 0 && (
                        <section>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">Active Project Alerts</h3>
                          <div className="space-y-2">
                            {activeAlerts.slice(0, 3).map((alert) => (
                              <div key={alert.id} className="bg-danger-light text-danger p-3 rounded border border-danger/20 flex gap-2.5">
                                <Icon name="warning" className="text-[18px] shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-xs">{alert.message}</div>
                                  <div className="text-[11px] opacity-80">{new Date(alert.triggered_at).toLocaleString()}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      <button
                        type="button"
                        onClick={() => project && navigate(`/projects/${project.id}/infrastructure`)}
                        className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-primary-hover active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                        <Icon name="analytics" className="text-[18px]" />
                        View Full Analytics
                      </button>

                      {selectedNode.service && canManageServices && (
                        <button
                          type="button"
                          disabled={removingServiceId === selectedNode.service.id}
                          onClick={() => selectedNode.service && handleRemoveService(selectedNode.service.id, selectedNode.service.name)}
                          className="w-full border border-danger/30 text-danger py-2.5 rounded-lg font-semibold text-sm hover:bg-danger-light active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Icon name="delete" className="text-[18px]" />
                          {removingServiceId === selectedNode.service.id ? 'Removing…' : 'Remove Service'}
                        </button>
                      )}
                      {removeError && <p className="text-xs text-danger">{removeError}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-1">Container Events</h3>
            <p className="text-xs text-text-secondary mb-4">
              Lifecycle events from Docker/ECS/Kubernetes, reported by the <code>eip-watch</code> CLI — restarts, crashes, OOM kills, and scaling.
            </p>
            {containerEvents.length === 0 ? (
              <EmptyState
                icon="dns"
                title="No container events yet"
                description="Run `eip-watch --docker` (or --ecs/--kubernetes) alongside your services to start tracking container lifecycle events."
              />
            ) : (
              <div className="space-y-2">
                {containerEvents.map((event) => (
                  <div key={event.id} className="flex items-center gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                    <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${EVENT_CLASS[event.event_type]}`}>
                      {EVENT_LABEL[event.event_type]}
                    </span>
                    <span className="text-sm text-text-primary font-medium truncate">{event.service_name}</span>
                    <span className="text-xs text-text-secondary">{DEPLOYMENT_LABEL[event.platform]}</span>
                    {event.reason && <span className="text-xs text-text-muted truncate">{event.reason}</span>}
                    <span className="ml-auto text-xs text-text-muted whitespace-nowrap">
                      {new Date(event.occurred_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border pb-2">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-text-primary font-medium text-right truncate max-w-[60%]">{value}</dd>
    </div>
  );
}
