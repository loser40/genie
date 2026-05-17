import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as d3 from 'd3';
import '../utils';
import './sidepanel.css';

const utils = window.GenieGraphifyUtils;

type D3Node = CapsuleGraphNode & d3.SimulationNodeDatum;
type D3Link = d3.SimulationLinkDatum<D3Node> & CapsuleGraphEdge;

function SidePanel(): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [projectPath, setProjectPath] = useState('');
  const [capsule, setCapsule] = useState<WishCapsule | null>(null);
  const [selectedNode, setSelectedNode] = useState<CapsuleGraphNode | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'missing'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!capsule?.graph || !svgRef.current) return;
    renderGraph(svgRef.current, capsule, setSelectedNode);
  }, [capsule]);

  async function initialize(): Promise<void> {
    const storedPath = await utils.getStoredProjectPath();
    setProjectPath(storedPath);
    await loadCapsule(storedPath, true);
  }

  async function saveAndLoad(): Promise<void> {
    const normalized = utils.normalizeProjectPath(projectPath);
    await utils.setStoredProjectPath(normalized);
    setProjectPath(normalized);
    await loadCapsule(normalized, false);
  }

  async function loadCapsule(pathValue: string, preferActive: boolean): Promise<void> {
    setState('loading');
    setMessage('');

    if (!(await utils.checkBridgeHealth())) {
      setState('offline');
      setCapsule(null);
      setMessage('Local Server Offline. Run genie bridge, then refresh.');
      return;
    }

    try {
      const normalizedPath = utils.normalizeProjectPath(pathValue);
      const payload = await utils.fetchCapsule(preferActive && !normalizedPath ? undefined : normalizedPath);
      setProjectPath(payload.capsule.projectPath);
      await utils.setStoredProjectPath(payload.capsule.projectPath);
      if (!payload.capsule.graph?.nodes?.length) {
        setState('missing');
        setCapsule(payload.capsule);
        setMessage('Capsule has no graph detail yet. Run genie capsule create on this project.');
        return;
      }
      setCapsule(payload.capsule);
      setSelectedNode(payload.capsule.graph.nodes[0] ?? null);
      setState('ready');
    } catch (error) {
      setState('missing');
      setCapsule(null);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="panel-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">GENIE Capsule</p>
          <h1>{capsule?.projectName ?? 'Graphify Memory'}</h1>
        </div>
        <strong>{capsule ? `${capsule.issues.healthScore} / 100` : state}</strong>
      </header>

      <section className="path-row">
        <textarea value={projectPath} onChange={(event) => setProjectPath(event.target.value)} spellCheck={false} />
        <button type="button" onClick={saveAndLoad}>Refresh</button>
      </section>

      {state === 'ready' && capsule?.graph ? (
        <section className="workspace">
          <svg ref={svgRef} aria-label="GENIE architecture graph" />
          <aside className="details">
            {selectedNode ? <NodeDetails node={selectedNode} /> : <p>Select a node to inspect dark spots.</p>}
          </aside>
        </section>
      ) : (
        <section className={`empty ${state}`}>
          <h2>{state === 'offline' ? 'Local Server Offline' : 'No Live Graph Loaded'}</h2>
          <p>{message}</p>
        </section>
      )}
    </main>
  );
}

function NodeDetails({ node }: { node: CapsuleGraphNode }): JSX.Element {
  return (
    <div>
      <p className="eyebrow">Selected Node</p>
      <h2>{node.label}</h2>
      <dl>
        <div><dt>Path</dt><dd>{node.relativePath}</dd></div>
        <div><dt>Status</dt><dd>{node.status}</dd></div>
        <div><dt>Lines</dt><dd>{node.lineCount}</dd></div>
        <div><dt>Imports</dt><dd>{node.importCount}</dd></div>
        <div><dt>Used by</dt><dd>{node.importedByCount}</dd></div>
      </dl>
      <h3>Dark Spots</h3>
      {node.issues.length > 0 ? (
        node.issues.map((issue) => (
          <article key={issue.id} className="issue">
            <b>[{issue.severity}] {issue.title}</b>
            <p>{issue.impact || 'No impact text recorded.'}</p>
            <span>{issue.fix || 'No fix text recorded.'}</span>
          </article>
        ))
      ) : (
        <p className="quiet">No file-specific open issues recorded for this node.</p>
      )}
    </div>
  );
}

function renderGraph(
  svgElement: SVGSVGElement,
  capsule: WishCapsule,
  onSelect: (node: CapsuleGraphNode) => void,
): void {
  const graph = capsule.graph;
  if (!graph) return;

  const width = Math.max(420, svgElement.clientWidth || 760);
  const height = Math.max(420, svgElement.clientHeight || 640);
  const nodes: D3Node[] = graph.nodes.map((node) => ({ ...node }));
  const links: D3Link[] = graph.edges.map((edge) => ({ ...edge, source: edge.from, target: edge.to }));

  const svg = d3.select(svgElement);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const linkLayer = svg.append('g').attr('class', 'links');
  const nodeLayer = svg.append('g').attr('class', 'nodes');

  const linksSelection = linkLayer
    .selectAll('line')
    .data(links)
    .enter()
    .append('line')
    .attr('stroke-width', (link: D3Link) => link.isCircular ? 2.2 : 1.1)
    .attr('stroke', (link: D3Link) => utils.edgeColor(link, capsule))
    .attr('opacity', (link: D3Link) => link.isCircular ? 0.7 : 0.42);

  const nodeGroups = nodeLayer
    .selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'node')
    .call(d3.drag<SVGGElement, D3Node>()
      .on('start', (event: any, node: D3Node) => {
        if (!event.active) simulation.alphaTarget(0.22).restart();
        node.fx = node.x;
        node.fy = node.y;
      })
      .on('drag', (event: any, node: D3Node) => {
        node.fx = event.x;
        node.fy = event.y;
      })
      .on('end', (event: any, node: D3Node) => {
        if (!event.active) simulation.alphaTarget(0);
        node.fx = null;
        node.fy = null;
      }));

  nodeGroups
    .append('circle')
    .attr('r', (node: D3Node) => utils.nodeRadius(node))
    .attr('fill', (node: D3Node) => utils.nodeColor(node, capsule))
    .attr('stroke', 'rgba(255,255,255,0.72)')
    .attr('stroke-width', 1);

  nodeGroups
    .append('title')
    .text((node: D3Node) => `${node.relativePath}\n${utils.formatIssueCount(node)}`);

  nodeGroups.on('click', (_event: MouseEvent, node: D3Node) => onSelect(node));

  const simulation = d3.forceSimulation<D3Node>(nodes)
    .force('link', d3.forceLink<D3Node, D3Link>(links).id((node: D3Node) => node.id).distance((link: D3Link) => link.isCircular ? 80 : 122))
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide<D3Node>().radius((node: D3Node) => utils.nodeRadius(node) + 9));

  simulation.on('tick', () => {
    linksSelection
      .attr('x1', (link: D3Link) => (link.source as D3Node).x ?? 0)
      .attr('y1', (link: D3Link) => (link.source as D3Node).y ?? 0)
      .attr('x2', (link: D3Link) => (link.target as D3Node).x ?? 0)
      .attr('y2', (link: D3Link) => (link.target as D3Node).y ?? 0);

    nodeGroups.attr('transform', (node: D3Node) => `translate(${node.x ?? 0},${node.y ?? 0})`);
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(<SidePanel />);
