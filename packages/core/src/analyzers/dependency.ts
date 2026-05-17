import { glob } from 'fast-glob';
import madge from 'madge';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface RawDep {
  file: string;
  imports: string[];
  importedBy: string[];
  isCircular: boolean;
  circularWith: string[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  isCircular: boolean;
}

export interface DependencyResult {
  dependencies: Map<string, RawDep>;
  circularChains: string[][];
  orphanFiles: string[];
  edges: DependencyEdge[];
}

interface MadgeResult {
  obj(): Record<string, string[]>;
  circular(): string[][];
  orphans(): string[];
}

export async function analyzeDependencies(rootPath: string): Promise<DependencyResult> {
  const resolvedRoot = path.resolve(rootPath);
  const result = await madge(resolvedRoot, {
    baseDir: resolvedRoot,
    fileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    excludeRegExp: [/node_modules/, /\.git/, /\.genie/, /\.next/, /\.test\./, /\.spec\./, /\.d\.ts$/, /dist/, /build/],
    includeNpm: false,
  }) as MadgeResult;

  const objectGraph = mergeGraphs(normalizeGraph(result.obj()), await analyzeDartImports(resolvedRoot), await analyzeTextImports(resolvedRoot));
  const circularChains = uniqueChains([
    ...result.circular().map((chain) => chain.map(normalizePath)),
    ...findCircularChains(objectGraph),
  ]);
  const circularFiles = new Set(circularChains.flat());
  const dependencies = new Map<string, RawDep>();

  for (const [file, imports] of Object.entries(objectGraph)) {
    const circularWith = unique(
      circularChains
        .filter((chain) => chain.includes(file))
        .flat()
        .filter((chainFile) => chainFile !== file),
    );

    dependencies.set(file, {
      file,
      imports,
      importedBy: [],
      isCircular: circularFiles.has(file),
      circularWith,
    });
  }

  for (const [file, imports] of Object.entries(objectGraph)) {
    for (const importedFile of imports) {
      const dep = dependencies.get(importedFile);
      if (dep) dep.importedBy.push(file);
    }
  }

  const edges = Object.entries(objectGraph).flatMap(([file, imports]) =>
    imports.map((importedFile) => ({
      from: file,
      to: importedFile,
      isCircular: circularChains.some((chain) => chain.includes(file) && chain.includes(importedFile)),
    })),
  );

  const orphanFiles = unique([
    ...result.orphans().map(normalizePath),
    ...[...dependencies.values()]
      .filter((dep) => dep.importedBy.length === 0)
      .map((dep) => dep.file),
  ]).sort();

  return {
    dependencies,
    circularChains,
    orphanFiles,
    edges,
  };
}

async function analyzeTextImports(rootPath: string): Promise<Record<string, string[]>> {
  const extensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cpp', 'cc', 'cxx', 'c', 'hpp', 'hh', 'hxx', 'h', 'css', 'html', 'htm', 'json'];
  const entries = await glob(extensions.map((extension) => `**/*.${extension}`), {
    cwd: rootPath,
    absolute: false,
    dot: true,
    followSymbolicLinks: false,
    onlyFiles: true,
    unique: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/.genie/**',
      '**/.dart_tool/**',
      '**/.idea/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/.turbo/**',
      '**/.cache/**',
      '**/vendor/**',
      '**/*.min.js',
      '**/*.d.ts',
    ],
  });
  if (entries.length === 0) return {};

  const files = new Set(entries.map(normalizePath));
  const graph: Record<string, string[]> = {};
  for (const entry of entries.sort()) {
    const relativePath = normalizePath(entry);
    const absolutePath = path.join(rootPath, entry);
    const content = await fs.readFile(absolutePath, 'utf-8').catch(() => '');
    graph[relativePath] = unique(extractImportSpecifiers(content, path.extname(relativePath).toLowerCase())
      .map((specifier) => resolveLocalImport(relativePath, specifier, files))
      .filter((importPath): importPath is string => Boolean(importPath)))
      .sort();
  }

  return graph;
}

function extractImportSpecifiers(content: string, extension: string): string[] {
  const specifiers: string[] = [];
  const pushMatches = (pattern: RegExp, group = 1): void => {
    for (const match of content.matchAll(pattern)) {
      const value = match[group];
      if (value) specifiers.push(value);
    }
  };

  if (['.ts', '.tsx', '.js', '.jsx'].includes(extension)) {
    pushMatches(/\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g);
    pushMatches(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g);
    pushMatches(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g);
  } else if (extension === '.py') {
    pushMatches(/^\s*from\s+([.\w]+)\s+import\s+/gm);
    pushMatches(/^\s*import\s+([.\w]+)/gm);
  } else if (['.cpp', '.cc', '.cxx', '.c', '.hpp', '.hh', '.hxx', '.h'].includes(extension)) {
    pushMatches(/^\s*#\s*include\s+"([^"]+)"/gm);
  } else if (extension === '.css') {
    pushMatches(/@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?/g);
    pushMatches(/url\(['"]?([^'")\s]+)['"]?\)/g);
  } else if (extension === '.html' || extension === '.htm') {
    pushMatches(/\b(?:src|href)=["']([^"']+)["']/gi);
  }

  return specifiers.filter((specifier) => !/^(?:https?:|data:|mailto:|#|node:)/i.test(specifier));
}

function resolveLocalImport(fromFile: string, specifier: string, files: Set<string>): string | null {
  const normalizedSpecifier = specifier.replace(/\\/g, '/').split(/[?#]/)[0];
  if (!normalizedSpecifier || normalizedSpecifier.startsWith('node_modules/')) return null;

  const base = normalizedSpecifier.startsWith('.')
    ? path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), normalizedSpecifier))
    : path.posix.normalize(normalizedSpecifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.py`,
    `${base}.java`,
    `${base}.cpp`,
    `${base}.cc`,
    `${base}.cxx`,
    `${base}.c`,
    `${base}.hpp`,
    `${base}.hh`,
    `${base}.hxx`,
    `${base}.h`,
    `${base}.css`,
    `${base}.html`,
    `${base}.htm`,
    `${base}.json`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.py`,
    `${base}/index.html`,
  ];

  return candidates.find((candidate) => files.has(normalizePath(candidate))) ?? null;
}

function normalizeGraph(graph: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(graph).map(([file, imports]) => [
      normalizePath(file),
      imports.map(normalizePath),
    ]),
  );
}

async function analyzeDartImports(rootPath: string): Promise<Record<string, string[]>> {
  const entries = await glob('**/*.dart', {
    cwd: rootPath,
    absolute: false,
    dot: true,
    followSymbolicLinks: false,
    onlyFiles: true,
    unique: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/.genie/**',
      '**/.dart_tool/**',
      '**/.idea/**',
      '**/coverage/**',
      '**/.next/**',
    ],
  });
  if (entries.length === 0) return {};

  const files = new Set(entries.map(normalizePath));
  const packageName = await readDartPackageName(rootPath);
  const graph: Record<string, string[]> = {};

  for (const entry of entries.sort()) {
    const relativePath = normalizePath(entry);
    const absolutePath = path.join(rootPath, entry);
    const content = await fs.readFile(absolutePath, 'utf-8').catch(() => '');
    const imports = [...content.matchAll(/^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/gm)]
      .map((match) => resolveDartImport(relativePath, match[1] ?? '', packageName, files))
      .filter((importPath): importPath is string => Boolean(importPath));

    graph[relativePath] = unique(imports);
  }

  return graph;
}

async function readDartPackageName(rootPath: string): Promise<string | null> {
  const pubspec = await fs.readFile(path.join(rootPath, 'pubspec.yaml'), 'utf-8').catch(() => '');
  const match = pubspec.match(/^\s*name:\s*([A-Za-z0-9_-]+)/m);
  return match?.[1] ?? null;
}

function resolveDartImport(
  fromFile: string,
  importPath: string,
  packageName: string | null,
  files: Set<string>,
): string | null {
  if (!importPath || importPath.startsWith('dart:')) return null;

  let candidate: string | null = null;
  if (importPath.startsWith('package:')) {
    const packagePrefix = packageName ? `package:${packageName}/` : '';
    if (!packagePrefix || !importPath.startsWith(packagePrefix)) return null;
    candidate = `lib/${importPath.slice(packagePrefix.length)}`;
  } else if (importPath.startsWith('.')) {
    candidate = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), importPath));
  }

  if (!candidate) return null;
  const normalized = normalizePath(candidate);
  if (files.has(normalized)) return normalized;
  const withExtension = `${normalized}.dart`;
  return files.has(withExtension) ? withExtension : null;
}

function mergeGraphs(...graphs: Array<Record<string, string[]>>): Record<string, string[]> {
  const merged = new Map<string, Set<string>>();
  for (const graph of graphs) {
    for (const [file, imports] of Object.entries(graph)) {
      const existing = merged.get(file) ?? new Set<string>();
      imports.forEach((importPath) => existing.add(importPath));
      merged.set(file, existing);
    }
  }
  return Object.fromEntries([...merged.entries()].map(([file, imports]) => [file, [...imports].sort()]));
}

function findCircularChains(graph: Record<string, string[]>): string[][] {
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const visit = (file: string): void => {
    visited.add(file);
    active.add(file);
    stack.push(file);

    for (const importPath of graph[file] ?? []) {
      if (!graph[importPath]) continue;
      if (active.has(importPath)) {
        const index = stack.indexOf(importPath);
        if (index >= 0) cycles.push(stack.slice(index));
      } else if (!visited.has(importPath)) {
        visit(importPath);
      }
    }

    stack.pop();
    active.delete(file);
  };

  for (const file of Object.keys(graph)) {
    if (!visited.has(file)) visit(file);
  }

  return uniqueChains(cycles);
}

function uniqueChains(chains: string[][]): string[][] {
  const seen = new Set<string>();
  const uniqueValues: string[][] = [];
  for (const chain of chains) {
    const key = [...chain].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueValues.push(chain);
  }
  return uniqueValues;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
