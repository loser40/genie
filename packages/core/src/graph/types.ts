export type NodeStatus = 'chaos' | 'duplicate' | 'warning' | 'dead' | 'healthy';

export interface GraphNode {
  id: string;
  relativePath: string;
  label: string;
  status: NodeStatus;
  importCount: number;
  importedByCount: number;
  isCircular: boolean;
  lineCount: number;
  readable: boolean;
  diagnostics: string[];
  debtScore: number;
  issues: string[];
  position?: {
    x: number;
    y: number;
  };
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  isCircular: boolean;
}

export interface GraphStats {
  totalFiles: number;
  chaosCount: number;
  duplicateCount: number;
  deadCount: number;
  warningCount: number;
  unreadableCount: number;
  diagnosticCount: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  circularChains: string[][];
  orphanNodes: string[];
  healthScore: number;
  stats: GraphStats;
}
