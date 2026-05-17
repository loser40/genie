import { Node, Project, SyntaxKind, ts } from 'ts-morph';
import * as path from 'path';

export interface DuplicateOccurrence {
  filePath: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  functionName?: string;
  snippet: string;
}

export interface DuplicateGroup {
  id: string;
  fingerprint: string;
  occurrences: DuplicateOccurrence[];
  lineCount: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestedPath: string;
}

const MIN_DUPLICATE_LINES = 5;

export async function findDuplicates(rootPath: string): Promise<DuplicateGroup[]> {
  const resolvedRoot = path.resolve(rootPath);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const globRoot = toPosix(resolvedRoot);
  project.addSourceFilesAtPaths([
    `${globRoot}/**/*.ts`,
    `${globRoot}/**/*.tsx`,
    `${globRoot}/**/*.js`,
    `${globRoot}/**/*.jsx`,
    `!${globRoot}/**/node_modules/**`,
    `!${globRoot}/**/.git/**`,
    `!${globRoot}/**/.genie/**`,
    `!${globRoot}/**/dist/**`,
    `!${globRoot}/**/build/**`,
    `!${globRoot}/**/.next/**`,
    `!${globRoot}/**/*.d.ts`,
    `!${globRoot}/**/*.test.*`,
    `!${globRoot}/**/*.spec.*`,
  ]);

  const fingerprintMap = new Map<string, DuplicateOccurrence[]>();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (isExcluded(filePath)) continue;

    const relativePath = toPosix(path.relative(resolvedRoot, filePath));
    for (const node of getFunctionLikeNodes(sourceFile)) {
      const body = getBodyNode(node);
      if (!body) continue;

      const startLine = node.getStartLineNumber();
      const endLine = node.getEndLineNumber();
      const lineCount = endLine - startLine + 1;
      if (lineCount < MIN_DUPLICATE_LINES) continue;

      const fingerprint = createFingerprint(body);
      if (!fingerprint) continue;

      const occurrence: DuplicateOccurrence = {
        filePath,
        relativePath,
        startLine,
        endLine,
        functionName: getFunctionName(node),
        snippet: body.getText().replace(/\s+/g, ' ').slice(0, 180),
      };

      fingerprintMap.set(fingerprint, [...(fingerprintMap.get(fingerprint) ?? []), occurrence]);
    }
  }

  const groups: DuplicateGroup[] = [];
  let index = 0;
  for (const [fingerprint, occurrences] of fingerprintMap) {
    const uniqueOccurrences = dedupeOccurrences(occurrences);
    if (uniqueOccurrences.length < 2) continue;

    const lineCount = Math.max(...uniqueOccurrences.map((occurrence) => occurrence.endLine - occurrence.startLine + 1));
    groups.push({
      id: `dup_${++index}`,
      fingerprint,
      occurrences: uniqueOccurrences,
      lineCount,
      severity: severityFor(uniqueOccurrences.length, lineCount),
      suggestedPath: suggestPath(uniqueOccurrences, resolvedRoot),
    });
  }

  return groups.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.lineCount - a.lineCount);
}

function getFunctionLikeNodes(sourceFile: Node): Node[] {
  return sourceFile.getDescendants().filter((node) =>
    Node.isFunctionDeclaration(node)
    || Node.isMethodDeclaration(node)
    || Node.isFunctionExpression(node)
    || Node.isArrowFunction(node)
    || Node.isConstructorDeclaration(node)
    || Node.isGetAccessorDeclaration(node)
    || Node.isSetAccessorDeclaration(node),
  );
}

function getBodyNode(node: Node): Node | undefined {
  if (Node.isArrowFunction(node)) return node.getBody();
  if (Node.isFunctionDeclaration(node)) return node.getBody();
  if (Node.isMethodDeclaration(node)) return node.getBody();
  if (Node.isFunctionExpression(node)) return node.getBody();
  if (Node.isConstructorDeclaration(node)) return node.getBody();
  if (Node.isGetAccessorDeclaration(node)) return node.getBody();
  if (Node.isSetAccessorDeclaration(node)) return node.getBody();
  return undefined;
}

function getFunctionName(node: Node): string | undefined {
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node) || Node.isFunctionExpression(node)) {
    return node.getName();
  }
  if (Node.isConstructorDeclaration(node)) return 'constructor';
  if (Node.isGetAccessorDeclaration(node) || Node.isSetAccessorDeclaration(node)) return node.getName();
  if (Node.isArrowFunction(node)) {
    const parent = node.getParent();
    if (Node.isVariableDeclaration(parent)) return parent.getName();
    if (Node.isPropertyAssignment(parent)) return parent.getName();
  }
  return undefined;
}

function createFingerprint(node: Node): string {
  const canonical = canonicalize(node);
  if (canonical.length < 64) return '';
  return `${hash(canonical)}_${canonical.length}`;
}

function canonicalize(node: Node): string {
  const kind = node.getKind();
  if (kind === SyntaxKind.Identifier) return 'Identifier';
  if (kind === SyntaxKind.StringLiteral || kind === SyntaxKind.NoSubstitutionTemplateLiteral) return 'StringLiteral';
  if (kind === SyntaxKind.NumericLiteral) return 'NumericLiteral';
  if (kind === SyntaxKind.TrueKeyword || kind === SyntaxKind.FalseKeyword) return 'BooleanLiteral';
  if (kind === SyntaxKind.ThisKeyword) return 'ThisKeyword';
  if (kind === SyntaxKind.NullKeyword) return 'NullKeyword';

  const children = node.getChildren().filter((child) => !isTrivia(child));
  if (children.length === 0) return node.getKindName();

  return `${node.getKindName()}(${children.map(canonicalize).join(',')})`;
}

function isTrivia(node: Node): boolean {
  const kind = node.getKind();
  return kind === SyntaxKind.SyntaxList
    || kind === SyntaxKind.SemicolonToken
    || kind === SyntaxKind.OpenBraceToken
    || kind === SyntaxKind.CloseBraceToken
    || kind === SyntaxKind.OpenParenToken
    || kind === SyntaxKind.CloseParenToken
    || kind === SyntaxKind.CommaToken;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16);
}

function dedupeOccurrences(occurrences: DuplicateOccurrence[]): DuplicateOccurrence[] {
  const seen = new Set<string>();
  return occurrences.filter((occurrence) => {
    const key = `${occurrence.relativePath}:${occurrence.startLine}:${occurrence.endLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function severityFor(count: number, lineCount: number): DuplicateGroup['severity'] {
  if (count >= 5 || lineCount >= 80) return 'critical';
  if (count >= 3 || lineCount >= 40) return 'high';
  if (lineCount >= 20) return 'medium';
  return 'low';
}

function suggestPath(occurrences: DuplicateOccurrence[], rootPath: string): string {
  const dirs = occurrences.map((occurrence) => toPosix(path.dirname(path.relative(rootPath, occurrence.filePath))));
  const common = commonPath(dirs);
  return `${common || 'src'}/shared/utils.ts`;
}

function commonPath(paths: string[]): string {
  if (paths.length === 0) return '';
  const first = paths[0].split('/').filter(Boolean);
  const common: string[] = [];
  for (let index = 0; index < first.length; index += 1) {
    const segment = first[index];
    if (paths.every((candidate) => candidate.split('/').filter(Boolean)[index] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }
  return common.join('/');
}

function severityRank(severity: DuplicateGroup['severity']): number {
  return {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }[severity];
}

function isExcluded(filePath: string): boolean {
  const normalized = toPosix(filePath);
  return normalized.includes('/node_modules/')
    || normalized.includes('/.git/')
    || normalized.includes('/.genie/')
    || normalized.includes('/dist/')
    || normalized.includes('/build/')
    || normalized.includes('/.next/')
    || normalized.endsWith('.d.ts')
    || /\.test\.[tj]sx?$/.test(normalized)
    || /\.spec\.[tj]sx?$/.test(normalized);
}

function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
