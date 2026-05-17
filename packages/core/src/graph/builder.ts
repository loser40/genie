import { DependencyResult } from '../analyzers/dependency';
import { DuplicateGroup } from '../analyzers/duplicates';
import { AIAnalysisResult } from '../ai/engine';
import { ProjectFile } from '../scanner/file-walker';
import { GraphData, GraphEdge, GraphNode } from './types';
import { layoutNodes } from './layout';

export function buildGraphData(
  files: ProjectFile[],
  deps: DependencyResult,
  duplicates: DuplicateGroup[],
  ai: AIAnalysisResult | null,
): GraphData {
  const fileByPath = new Map(files.map((file) => [file.relativePath, file]));
  const duplicateFiles = new Set(duplicates.flatMap((duplicate) => duplicate.occurrences.map((occurrence) => occurrence.relativePath)));
  const deadFiles = new Set(deps.orphanFiles);
  const circularFiles = new Set(deps.circularChains.flat());
  const largeFiles = new Set(files.filter((file) => file.lineCount >= 500).map((file) => file.relativePath));
  const allFiles = unique([
    ...files.map((file) => file.relativePath),
    ...deps.dependencies.keys(),
  ]);

  const nodes: GraphNode[] = allFiles.map((file) => {
    const dep = deps.dependencies.get(file);
    const projectFile = fileByPath.get(file);
    const importCount = dep?.imports.length ?? 0;
    const importedByCount = dep?.importedBy.length ?? 0;
    const issueIds = (ai?.issues ?? [])
      .filter((issue) => issue.affectedFiles.includes(file))
      .map((issue) => issue.id);
    const diagnostics = projectFile?.diagnostics ?? [];
    const readable = projectFile?.readable ?? true;
    const status = !readable || diagnostics.length > 0 || circularFiles.has(file)
      ? 'chaos'
      : duplicateFiles.has(file)
        ? 'duplicate'
        : deadFiles.has(file)
          ? 'dead'
          : importCount > 15 || largeFiles.has(file)
            ? 'warning'
            : 'healthy';

    return {
      id: file,
      relativePath: file,
      label: labelFor(file),
      status,
      importCount,
      importedByCount,
      isCircular: dep?.isCircular ?? false,
      lineCount: projectFile?.lineCount ?? 0,
      readable,
      diagnostics,
      debtScore: calculateNodeDebt(status, {
        importCount,
        importedByCount,
        isCircular: dep?.isCircular ?? false,
        issueCount: issueIds.length,
        lineCount: projectFile?.lineCount ?? 0,
        diagnosticCount: diagnostics.length,
        readable,
      }),
      issues: issueIds,
    };
  });

  const edges: GraphEdge[] = deps.edges.map((edge) => ({
    id: `${edge.from}__${edge.to}`,
    from: edge.from,
    to: edge.to,
    isCircular: edge.isCircular,
  }));

  const positionedNodes = layoutNodes(nodes);
  const stats = {
    totalFiles: positionedNodes.length,
    chaosCount: positionedNodes.filter((node) => node.status === 'chaos').length,
    duplicateCount: positionedNodes.filter((node) => node.status === 'duplicate').length,
    deadCount: positionedNodes.filter((node) => node.status === 'dead').length,
    warningCount: positionedNodes.filter((node) => node.status === 'warning').length,
    unreadableCount: positionedNodes.filter((node) => !node.readable).length,
    diagnosticCount: positionedNodes.reduce((sum, node) => sum + node.diagnostics.length, 0),
  };

  const healthScore = ai?.healthScore
    ?? calculateGraphHealth(stats, positionedNodes.length);

  return {
    nodes: positionedNodes,
    edges,
    circularChains: deps.circularChains,
    orphanNodes: deps.orphanFiles,
    healthScore,
    stats,
  };
}

function calculateGraphHealth(stats: GraphData['stats'], totalFiles: number): number {
  if (totalFiles === 0 || stats.unreadableCount > 0) return 10;

  const raw = 100
    - stats.chaosCount * 22
    - stats.duplicateCount * 10
    - stats.deadCount * 4
    - stats.warningCount * 5
    - stats.diagnosticCount * 14;

  return Math.max(10, Math.min(100, Math.round(raw)));
}

function calculateNodeDebt(
  status: GraphNode['status'],
  data: {
    importCount: number;
    importedByCount: number;
    isCircular: boolean;
    issueCount: number;
    lineCount: number;
    diagnosticCount: number;
    readable: boolean;
  },
): number {
  if (!data.readable) return 100;
  const statusDebt = {
    chaos: 82,
    duplicate: 62,
    dead: 34,
    warning: 28,
    healthy: 0,
  }[status];
  const sizeDebt = data.lineCount >= 1000 ? 30 : data.lineCount >= 500 ? 18 : data.lineCount >= 250 ? 8 : 0;
  const couplingDebt = Math.min(18, data.importCount + Math.floor(data.importedByCount / 2));
  const diagnosticDebt = Math.min(60, data.diagnosticCount * 18);
  const issueDebt = Math.min(32, data.issueCount * 8);
  const circularDebt = data.isCircular ? 35 : 0;

  return Math.min(100, Math.round(statusDebt + sizeDebt + couplingDebt + diagnosticDebt + issueDebt + circularDebt));
}

function labelFor(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
