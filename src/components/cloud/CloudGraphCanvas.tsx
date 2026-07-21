import { useEffect } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Icon, StatusPill } from '../ui';
import type { CloudEdge, CloudNode } from '../../lib/types';
import { CATEGORY_STYLE, categoryForNodeType, humanizeNodeType, stateTone } from '../../lib/cloud-graph-style';

// Module 8 — Architecture Visualization Engine
// (docs/CLOUD_INTELLIGENCE_PLATFORM_DESIGN.md §10). One canvas, parameterized
// by whichever pre-filtered node/edge set the caller passes in (see
// fetchCloudGraph()) — the 5 view modes are just different data going into
// this same component, not 5 different canvases.
//
// Known simplification vs. the full design: true React Flow parent/child
// subflow grouping (VPC→subnet containment, account→region grouping) is NOT
// implemented yet — every view renders as a flat dagre-laid-out graph. The
// design doc's grouping column is a visual nicety on top of what's here, not
// a blocker to the graph being useful; worth a follow-up pass once there's
// real multi-VPC data to design the grouping UX against.

const NODE_WIDTH = 220;
const NODE_HEIGHT = 76;

type CloudNodeData = {
  label: string;
  nodeType: string;
  category: ReturnType<typeof categoryForNodeType>;
  state: string | null;
  region: string | null;
  raw: CloudNode;
};

function CloudResourceNode({ data }: NodeProps) {
  const nodeData = data as unknown as CloudNodeData;
  const style = CATEGORY_STYLE[nodeData.category];
  const tone = stateTone(nodeData.state);
  return (
    <div
      style={{ borderLeftColor: style.color, width: NODE_WIDTH }}
      className="rounded-md border border-border border-l-4 bg-white shadow-sm px-3 py-2"
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        <Icon name={style.icon} className="text-[13px]" />
        {humanizeNodeType(nodeData.nodeType)}
      </div>
      <div className="text-sm font-semibold text-text-primary truncate" title={nodeData.label}>
        {nodeData.label}
      </div>
      <div className="flex items-center justify-between mt-1 gap-2">
        <span className="text-[10px] text-text-muted truncate">{nodeData.region ?? 'global'}</span>
        {nodeData.state && <StatusPill tone={tone}>{nodeData.state}</StatusPill>}
      </div>
    </div>
  );
}

const nodeTypes = { cloudResource: CloudResourceNode };

function layoutWithDagre(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR'): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return pos ? { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } } : n;
  });
}

function edgeLabel(edgeType: string): string {
  return edgeType.replace(/_/g, ' ').toLowerCase();
}

function CloudGraphInner({
  nodes: cloudNodes,
  edges: cloudEdges,
  direction,
  onNodeClick,
}: {
  nodes: CloudNode[];
  edges: CloudEdge[];
  direction: 'TB' | 'LR';
  onNodeClick?: (node: CloudNode) => void;
}) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const baseNodes: Node[] = cloudNodes.map((n) => ({
      id: n.id,
      type: 'cloudResource',
      position: { x: 0, y: 0 },
      data: {
        label: n.name || n.external_id,
        nodeType: n.node_type,
        category: categoryForNodeType(n.node_type),
        state: n.state,
        region: n.region,
        raw: n,
      } satisfies CloudNodeData,
    }));

    const baseEdges: Edge[] = cloudEdges.map((e) => {
      const hasError = e.edge_type === 'SERVICE_CALL' && Number(e.metadata?.errorCount ?? 0) > 0;
      return {
        id: e.id,
        source: e.from_node_id,
        target: e.to_node_id,
        label: edgeLabel(e.edge_type),
        labelStyle: { fontSize: 10, fill: '#64748b' },
        style: {
          strokeDasharray: e.confidence < 1 ? '5 5' : undefined,
          stroke: hasError ? '#dc2626' : '#94a3b8',
        },
      };
    });

    setRfNodes(layoutWithDagre(baseNodes, baseEdges, direction));
    setRfEdges(baseEdges);
  }, [cloudNodes, cloudEdges, direction, setRfNodes, setRfEdges]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_event, node) => onNodeClick?.((node.data as unknown as CloudNodeData).raw)}
      fitView
      minZoom={0.1}
    >
      <Background />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}

export function CloudGraphCanvas(props: {
  nodes: CloudNode[];
  edges: CloudEdge[];
  direction?: 'TB' | 'LR';
  onNodeClick?: (node: CloudNode) => void;
  height?: number;
}) {
  return (
    <div style={{ height: props.height ?? 600 }} className="rounded-lg border border-border overflow-hidden">
      <ReactFlowProvider>
        <CloudGraphInner nodes={props.nodes} edges={props.edges} direction={props.direction ?? 'TB'} onNodeClick={props.onNodeClick} />
      </ReactFlowProvider>
    </div>
  );
}
