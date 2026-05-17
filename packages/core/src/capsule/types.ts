export interface WishCapsule {
  version: '1.0';
  id: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  projectPath: string;
  architecture: {
    summary: string;
    projectType: string;
    primaryLanguage: string;
    moduleCount: number;
    topModules: string[];
    layerStructure: string;
  };
  dependencies: {
    circularChains: string[][];
    criticalNodes: string[];
    orphanFiles: string[];
    edgeCount: number;
  };
  graph?: {
    nodes: Array<{
      id: string;
      relativePath: string;
      label: string;
      status: 'chaos' | 'duplicate' | 'warning' | 'dead' | 'healthy';
      lineCount: number;
      importCount: number;
      importedByCount: number;
      isCircular: boolean;
      readable: boolean;
      diagnostics: string[];
      debtScore: number;
      issues: Array<{
        id: string;
        title: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        impact: string;
        fix: string;
      }>;
    }>;
    edges: Array<{
      id: string;
      from: string;
      to: string;
      isCircular: boolean;
    }>;
    stats: {
      totalFiles: number;
      chaosCount: number;
      duplicateCount: number;
      deadCount: number;
      warningCount: number;
      unreadableCount: number;
      diagnosticCount: number;
    };
    healthScore: number;
  };
  issues: {
    healthScore: number;
    openIssues: string[];
    fixedIssues: string[];
    lastScanAt: string;
  };
  aiContext: {
    capsuleSummary: string;
    keyPatterns: string[];
    knownConstraints: string[];
  };
  injectText: string;
}
