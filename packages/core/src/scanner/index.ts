import * as path from 'path';
import { walkProject } from './file-walker';
import { analyzeDependencies, DependencyResult } from '../analyzers/dependency';
import { findDuplicates, DuplicateGroup } from '../analyzers/duplicates';
import { runAIAnalysis, AIAnalysisResult } from '../ai/engine';
import { buildGraphData } from '../graph/builder';
import { createCapsule } from '../capsule/creator';
import { loadCapsule } from '../capsule/loader';
import { GraphData } from '../graph/types';
import { WishCapsule } from '../capsule/types';
import { AITaskType } from '../ai/router';

export interface ScanConfig {
  projectPath: string;
  skipAI?: boolean;
  skipCapsule?: boolean;
  taskType?: AITaskType;
}

export interface ScanProgress {
  phase: 'walking' | 'dependencies' | 'duplicates' | 'ai' | 'graph' | 'capsule' | 'done';
  message: string;
  percent: number;
}

export interface ScanResult {
  id: string;
  projectPath: string;
  projectName: string;
  scannedAt: string;
  filesScanned: number;
  deps: DependencyResult;
  duplicates: DuplicateGroup[];
  ai: AIAnalysisResult | null;
  graph: GraphData;
  capsule: WishCapsule | null;
}

export async function scanProject(
  config: ScanConfig,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  const projectPath = path.resolve(config.projectPath);
  const projectName = path.basename(projectPath);
  const emit = (phase: ScanProgress['phase'], message: string, percent: number): void => {
    onProgress?.({ phase, message, percent });
  };

  emit('walking', 'Discovering project files...', 8);
  const files = await walkProject(projectPath).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GENIE] File scan failed for ${projectPath}: ${message}`);
    return [];
  });

  emit('dependencies', 'Building dependency graph...', 25);
  const deps = await analyzeDependencies(projectPath).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GENIE] Dependency analysis failed for ${projectPath}: ${message}`);
    return emptyDependencyResult();
  });

  emit('duplicates', 'Scanning for duplicate logic...', 48);
  const duplicates = await findDuplicates(projectPath).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GENIE] Duplicate analysis failed for ${projectPath}: ${message}`);
    return [] as DuplicateGroup[];
  });

  let ai: AIAnalysisResult | null = null;
  if (!config.skipAI) {
    emit('ai', 'Running AI repair analysis...', 68);
    ai = await runAIAnalysis(projectName, files, deps, duplicates, config.taskType ?? 'scan');
  }

  emit('graph', 'Building architecture graph...', 84);
  const graph = buildGraphData(files, deps, duplicates, ai);

  let capsule: WishCapsule | null = null;
  if (!config.skipCapsule && ai) {
    emit('capsule', 'Creating Wish Capsule...', 94);
    capsule = await createCapsule(projectPath, deps, ai, await loadCapsule(projectPath) ?? undefined, graph);
  }

  emit('done', 'Analysis complete!', 100);
  return {
    id: `scan_${Date.now()}`,
    projectPath,
    projectName,
    scannedAt: new Date().toISOString(),
    filesScanned: files.length,
    deps,
    duplicates,
    ai,
    graph,
    capsule,
  };
}

function emptyDependencyResult(): DependencyResult {
  return {
    dependencies: new Map(),
    circularChains: [],
    orphanFiles: [],
    edges: [],
  };
}
