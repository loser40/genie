declare const chrome: any;

interface Window {
  GenieGraphifyUtils: {
    BRIDGE_ORIGIN: string;
    MEMORY_CHUNK_SIZE: number;
    buildActionPromptBlock(fetchedData: string): string;
    buildChatMemoryBlock(chunk: MemoryChunk): string;
    buildCodebaseMemoryBlock(capsule: WishCapsule): string;
    buildDynamicRepairPrompt(capsule: WishCapsule): string;
    checkBridgeHealth(): Promise<boolean>;
    clearCapsule(): Promise<void>;
    edgeColor(edge: CapsuleGraphEdge, capsule: WishCapsule): string;
    fetchCapsule(projectPath?: string): Promise<{ capsule: WishCapsule; generatedAt: string; active?: boolean }>;
    fetchMemory(): Promise<BridgeMemoryResponse>;
    findEditor(): Element | null;
    formatIssueCount(node: CapsuleGraphNode): string;
    getStoredProjectPath(): Promise<string>;
    nodeColor(node: CapsuleGraphNode, capsule: WishCapsule): string;
    nodeRadius(node: CapsuleGraphNode): number;
    nextMemoryChunk(): Promise<MemoryChunk>;
    normalizeProjectPath(value: string): string;
    postMemory(exchanges: BridgeMemoryExchange[], meta?: MemoryCaptureMeta): Promise<BridgeMemorySaveResponse>;
    setMemoryPointer(pointer: number): Promise<void>;
    setStoredProjectPath(projectPath: string): Promise<void>;
    insertTextIntoEditor(editor: Element | null, text: string): void;
  };
}

interface CapsuleIssue {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  impact: string;
  fix: string;
}

interface CapsuleGraphNode {
  id: string;
  relativePath: string;
  label: string;
  status: 'chaos' | 'duplicate' | 'warning' | 'dead' | 'healthy';
  lineCount: number;
  importCount: number;
  importedByCount: number;
  isCircular: boolean;
  readable?: boolean;
  diagnostics?: string[];
  debtScore?: number;
  issues: CapsuleIssue[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface CapsuleGraphEdge {
  id: string;
  from: string;
  to: string;
  isCircular: boolean;
}

interface WishCapsule {
  healthScore?: number;
  diagnostics?: string[];
  stats?: {
    totalFiles?: number;
  };
  projectName: string;
  projectPath: string;
  updatedAt: string;
  architecture: {
    summary: string;
    projectType: string;
    primaryLanguage: string;
    layerStructure: string;
  };
  issues: {
    healthScore: number;
    openIssues: string[];
  };
  graph?: {
    nodes: CapsuleGraphNode[];
    edges: CapsuleGraphEdge[];
    healthScore: number;
    stats: {
      totalFiles: number;
      chaosCount: number;
      duplicateCount: number;
      deadCount: number;
      warningCount: number;
      unreadableCount?: number;
      diagnosticCount?: number;
    };
  };
  injectText: string;
}

interface BridgeMemoryExchange {
  user: string;
  ai: string;
  platform?: string;
  sourceUrl?: string;
  capturedAt?: string;
}

interface BridgeMemoryResponse {
  exchanges: BridgeMemoryExchange[];
  count: number;
  updatedAt: string;
}

interface BridgeMemorySaveResponse {
  ok: boolean;
  saved: number;
  total: number;
  updatedAt: string;
}

interface MemoryCaptureMeta {
  platform?: string;
  sourceUrl?: string;
}

interface MemoryChunk {
  exchanges: BridgeMemoryExchange[];
  part: number;
  startIndex: number;
  total: number;
}

interface RawChatMessage {
  role: 'user' | 'ai';
  text: string;
}

declare module 'd3';
