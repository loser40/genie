import { useEffect, useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, Edge, MiniMap, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { Link, useParams } from 'react-router-dom';
import { fetchGraph } from '../api';
import { GraphData, GraphNodeData, NodeStatus } from '../types';

const nodeColors: Record<NodeStatus, string> = {
  chaos: '#ef4444',
  duplicate: '#f97316',
  warning: '#f59e0b',
  dead: '#6b7280',
  healthy: '#22c55e',
};

export function GraphPage(): JSX.Element {
  const { id = '' } = useParams();
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [selected, setSelected] = useState<GraphNodeData | null>(null);

  useEffect(() => {
    if (!id || id === 'latest') return;
    fetchGraph(id).then(setGraph).catch(() => setGraph(null));
  }, [id]);

  const nodes = useMemo<Node[]>(() => (graph?.nodes ?? []).map((node) => ({
    id: node.id,
    data: { label: node.label },
    position: node.position ?? { x: 0, y: 0 },
    style: {
      background: nodeColors[node.status],
      border: '1px solid rgba(255,255,255,.35)',
      borderRadius: 8,
      color: '#05030f',
      fontWeight: 800,
      padding: 10,
    },
  })), [graph]);

  const edges = useMemo<Edge[]>(() => (graph?.edges ?? []).map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    animated: edge.isCircular,
    style: {
      stroke: edge.isCircular ? '#ef4444' : '#8b5cf6',
      strokeDasharray: edge.isCircular ? '8 6' : undefined,
      strokeWidth: edge.isCircular ? 3 : 2,
    },
  })), [graph]);

  return (
    <main className="page">
      <div className="topbar">
        <Link className="brand" to="/">GENIE</Link>
        <Link className="ghost-button" to={`/scan/${id}`}>Scan</Link>
      </div>
      <h1 className="page-title">Dependency Graph</h1>
      <div className="graph-layout">
        <div className="graph-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => setSelected(graph?.nodes.find((candidate) => candidate.id === node.id) ?? null)}
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        <aside className="side-panel" style={{ padding: 16 }}>
          <h2>Legend</h2>
          <div className="legend">
            {Object.entries(nodeColors).map(([status, color]) => (
              <span className="legend-item" key={status}><span className="legend-dot" style={{ background: color }} />{status}</span>
            ))}
          </div>
          <h2 style={{ marginTop: 24 }}>Issues</h2>
          {selected ? (
            <div>
              <strong>{selected.relativePath}</strong>
              <p>Imports: {selected.importCount}</p>
              <p>Used by: {selected.importedByCount}</p>
              <p>Status: {selected.status}</p>
              <p>Issue ids: {selected.issues.join(', ') || 'none'}</p>
            </div>
          ) : <p>Select a node.</p>}
        </aside>
      </div>
    </main>
  );
}
