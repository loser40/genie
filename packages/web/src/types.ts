export type ScanPhase = 'walking' | 'dependencies' | 'duplicates' | 'ai' | 'graph' | 'capsule' | 'done';
export type NodeStatus = 'chaos' | 'duplicate' | 'warning' | 'dead' | 'healthy';

export interface ScanProgress {
  phase: ScanPhase;
  message: string;
  percent: number;
}

export interface AIIssue {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  explanation: string;
  impact: string;
  fix: string;
  codeComment: string;
  affectedFiles: string[];
  automatable: boolean;
}

export interface GraphNodeData {
  id: string;
  relativePath: string;
  label: string;
  status: NodeStatus;
  importCount: number;
  importedByCount: number;
  isCircular: boolean;
  lineCount: number;
  issues: string[];
  position?: { x: number; y: number };
}

export interface GraphEdgeData {
  id: string;
  from: string;
  to: string;
  isCircular: boolean;
}

export interface GraphData {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  circularChains: string[][];
  orphanNodes: string[];
  healthScore: number;
  stats: {
    totalFiles: number;
    chaosCount: number;
    duplicateCount: number;
    deadCount: number;
    warningCount: number;
  };
}

export interface DuplicateGroup {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestedPath: string;
  occurrences: Array<{ relativePath: string; startLine: number; endLine: number }>;
}

export interface WishCapsule {
  projectName: string;
  updatedAt: string;
  injectText: string;
  issues: {
    healthScore: number;
    openIssues: string[];
  };
  architecture: {
    summary: string;
    projectType: string;
    primaryLanguage: string;
    topModules: string[];
  };
}

export interface ScanResult {
  id: string;
  projectPath: string;
  projectName: string;
  scannedAt: string;
  filesScanned: number;
  duplicates: DuplicateGroup[];
  ai: {
    healthScore: number;
    architectureSummary: string;
    issues: AIIssue[];
  } | null;
  graph: GraphData;
  capsule: WishCapsule | null;
  deps: {
    circularChains: string[][];
    orphanFiles: string[];
    edges: unknown[];
  };
}
