import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { DependencyResult } from '../analyzers/dependency';
import { AIAnalysisResult } from '../ai/engine';
import { GraphData } from '../graph/types';
import { WishCapsule } from './types';

const CAPSULE_VERSION = '1.0';
const ACTIVE_CAPSULE_FILE = path.join(os.homedir(), '.genie', 'active-capsule.json');

export async function createCapsule(
  projectPath: string,
  deps: DependencyResult,
  ai: AIAnalysisResult,
  existing?: WishCapsule,
  graph?: GraphData,
): Promise<WishCapsule> {
  const resolvedProjectPath = path.resolve(projectPath);
  const projectName = path.basename(resolvedProjectPath);
  const now = new Date().toISOString();
  const criticalNodes = getCriticalNodes(deps);
  const topModules = getTopModules(deps);
  const layerStructure = inferLayerStructure(ai.projectType, topModules);

  const capsule: WishCapsule = {
    version: CAPSULE_VERSION,
    id: existing?.id ?? randomUUID(),
    projectName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    projectPath: resolvedProjectPath,
    architecture: {
      summary: trimText(ai.architectureSummary, 900),
      projectType: ai.projectType,
      primaryLanguage: ai.primaryLanguage,
      moduleCount: deps.dependencies.size,
      topModules,
      layerStructure,
    },
    dependencies: {
      circularChains: deps.circularChains.slice(0, 25),
      criticalNodes,
      orphanFiles: deps.orphanFiles.slice(0, 50),
      edgeCount: deps.edges.length,
    },
    graph: graph ? buildCapsuleGraph(graph, ai) : existing?.graph,
    issues: {
      healthScore: ai.healthScore,
      openIssues: ai.issues.map((issue) => issue.title).slice(0, 25),
      fixedIssues: existing?.issues.fixedIssues ?? [],
      lastScanAt: now,
    },
    aiContext: {
      capsuleSummary: trimText(ai.capsuleSummary, 1800),
      keyPatterns: ai.keyPatterns.slice(0, 20),
      knownConstraints: ai.knownConstraints.slice(0, 20),
    },
    injectText: '',
  };

  capsule.injectText = buildInjectText(capsule, ai);
  await writeCapsule(resolvedProjectPath, capsule);
  await writeActiveCapsuleMarker(capsule);
  return capsule;
}

function buildCapsuleGraph(graph: GraphData, ai: AIAnalysisResult): NonNullable<WishCapsule['graph']> {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      relativePath: node.relativePath,
      label: node.label,
      status: node.status,
      lineCount: node.lineCount,
      importCount: node.importCount,
      importedByCount: node.importedByCount,
      isCircular: node.isCircular,
      readable: node.readable,
      diagnostics: node.diagnostics,
      debtScore: node.debtScore,
      issues: ai.issues
        .filter((issue) => issue.affectedFiles.includes(node.relativePath))
        .map((issue) => ({
          id: issue.id,
          title: issue.title,
          severity: issue.severity,
          impact: issue.impact,
          fix: issue.fix,
        })),
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      isCircular: edge.isCircular,
    })),
    stats: graph.stats,
    healthScore: graph.healthScore,
  };
}

export function getCapsulePath(projectPath: string, projectName = path.basename(path.resolve(projectPath))): string {
  return path.join(path.resolve(projectPath), '.genie', `${projectName}.capsule.json`);
}

export function getActiveCapsuleMarkerPath(): string {
  return ACTIVE_CAPSULE_FILE;
}

function getCriticalNodes(deps: DependencyResult): string[] {
  return [...deps.dependencies.entries()]
    .sort((a, b) =>
      b[1].importedBy.length - a[1].importedBy.length
      || b[1].imports.length - a[1].imports.length
      || a[0].localeCompare(b[0]),
    )
    .slice(0, 10)
    .map(([file]) => file);
}

function getTopModules(deps: DependencyResult): string[] {
  return [...deps.dependencies.entries()]
    .sort((a, b) =>
      b[1].imports.length - a[1].imports.length
      || b[1].importedBy.length - a[1].importedBy.length
      || a[0].localeCompare(b[0]),
    )
    .slice(0, 12)
    .map(([file]) => file);
}

function inferLayerStructure(projectType: string, topModules: string[]): string {
  if (projectType.toLowerCase() === 'flutter') return 'Flutter / Feature Modules';
  const modules = topModules.map((modulePath) => modulePath.toLowerCase());
  const has = (needle: string) => modules.some((modulePath) => modulePath.includes(needle));
  if (has('controller') && has('service')) return 'MVC / NestJS';
  if (has('component') && has('hook')) return 'React + Hooks';
  if (has('router') || has('route')) return 'Express / Routes';
  if (has('page') && has('app')) return 'Next.js App Router';
  return 'Custom';
}

function buildInjectText(capsule: WishCapsule, ai: AIAnalysisResult): string {
  const circularText = capsule.dependencies.circularChains.length > 0
    ? capsule.dependencies.circularChains.slice(0, 3).map((chain) => chain.join(' -> ')).join(' | ')
    : 'none';
  const issueText = ai.issues.length > 0
    ? ai.issues.slice(0, 4).map((issue) => `[${issue.severity}] ${issue.title}`).join(' | ')
    : 'none';

  const text = [
    `# /genie: ${capsule.projectName}`,
    `Type: ${capsule.architecture.projectType} | Lang: ${capsule.architecture.primaryLanguage} | Health: ${capsule.issues.healthScore}/100`,
    `Architecture: ${capsule.architecture.summary}`,
    `Critical files: ${capsule.dependencies.criticalNodes.slice(0, 5).join(', ') || 'none'}`,
    `Circular deps: ${circularText}`,
    `Open issues: ${issueText}`,
    `Patterns: ${capsule.aiContext.keyPatterns.join(', ') || 'none'}`,
    capsule.aiContext.capsuleSummary,
  ].filter(Boolean).join('\n');
  return trimText(text, 2200);
}

async function writeCapsule(projectPath: string, capsule: WishCapsule): Promise<void> {
  const capsuleDir = path.join(projectPath, '.genie');
  await fs.mkdir(capsuleDir, { recursive: true });
  await fs.writeFile(getCapsulePath(projectPath, capsule.projectName), JSON.stringify(capsule, null, 2), 'utf-8');
}

async function writeActiveCapsuleMarker(capsule: WishCapsule): Promise<void> {
  await fs.mkdir(path.dirname(ACTIVE_CAPSULE_FILE), { recursive: true, mode: 0o700 });
  await fs.writeFile(ACTIVE_CAPSULE_FILE, `${JSON.stringify({
    projectName: capsule.projectName,
    projectPath: capsule.projectPath,
    capsulePath: getCapsulePath(capsule.projectPath, capsule.projectName),
    updatedAt: capsule.updatedAt,
  }, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
}

function trimText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}
