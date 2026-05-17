import { glob } from 'fast-glob';
import ignore from 'ignore';
import * as path from 'path';
import * as fs from 'fs/promises';

export type ProjectLanguage =
  | 'typescript'
  | 'javascript'
  | 'dart'
  | 'python'
  | 'vue'
  | 'svelte'
  | 'html'
  | 'css'
  | 'java'
  | 'cpp'
  | 'json'
  | 'unknown';

export interface ProjectFile {
  absolutePath: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  lineCount: number;
  language: ProjectLanguage;
  readable: boolean;
  diagnostics: string[];
}

const EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.dart',
  '.py',
  '.vue',
  '.svelte',
  '.html',
  '.htm',
  '.css',
  '.java',
  '.cpp',
  '.cc',
  '.cxx',
  '.c',
  '.hpp',
  '.hh',
  '.hxx',
  '.h',
  '.json',
];
const COMMON_EXCLUDES = [
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
];

export async function walkProject(rootPath: string): Promise<ProjectFile[]> {
  const resolvedRoot = path.resolve(rootPath);
  const gitignore = await loadGitignore(resolvedRoot);
  const entries = await glob(EXTENSIONS.map((extension) => `**/*${extension}`), {
    cwd: resolvedRoot,
    absolute: false,
    dot: true,
    followSymbolicLinks: false,
    ignore: COMMON_EXCLUDES,
    onlyFiles: true,
    unique: true,
  });

  const files: ProjectFile[] = [];
  for (const entry of entries.sort()) {
    const relativePath = toPosix(entry);
    if (gitignore.ignores(relativePath)) continue;

    const absolutePath = path.join(resolvedRoot, entry);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) continue;

    const extension = path.extname(absolutePath).toLowerCase();
    const readResult = await readSourceFile(absolutePath);
    files.push({
      absolutePath,
      relativePath,
      extension,
      sizeBytes: stat.size,
      lineCount: countLines(readResult.content),
      language: languageForExtension(extension),
      readable: readResult.readable,
      diagnostics: readResult.diagnostics,
    });
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function readSourceFile(absolutePath: string): Promise<{ content: string; readable: boolean; diagnostics: string[] }> {
  const extension = path.extname(absolutePath).toLowerCase();
  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    return {
      content,
      readable: true,
      diagnostics: diagnoseSource(content, extension),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: '',
      readable: false,
      diagnostics: [`Unreadable source file: ${message}`],
    };
  }
}

async function loadGitignore(rootPath: string): Promise<ReturnType<typeof ignore>> {
  const matcher = ignore();
  const gitignorePath = path.join(rootPath, '.gitignore');
  const content = await fs.readFile(gitignorePath, 'utf-8').catch(() => '');
  if (content.trim()) matcher.add(content);
  matcher.add(COMMON_EXCLUDES.map((pattern) => pattern.replace(/^\*\*\//, '')));
  return matcher;
}

function languageForExtension(extension: string): ProjectLanguage {
  if (extension === '.ts' || extension === '.tsx') return 'typescript';
  if (extension === '.js' || extension === '.jsx') return 'javascript';
  if (extension === '.dart') return 'dart';
  if (extension === '.py') return 'python';
  if (extension === '.vue') return 'vue';
  if (extension === '.svelte') return 'svelte';
  if (extension === '.html' || extension === '.htm') return 'html';
  if (extension === '.css') return 'css';
  if (extension === '.java') return 'java';
  if (['.cpp', '.cc', '.cxx', '.c', '.hpp', '.hh', '.hxx', '.h'].includes(extension)) return 'cpp';
  if (extension === '.json') return 'json';
  return 'unknown';
}

function diagnoseSource(content: string, extension: string): string[] {
  const diagnostics: string[] = [];
  const trimmed = content.trim();

  if (!trimmed) {
    diagnostics.push('File is empty or contains no readable code.');
    return diagnostics;
  }

  if (extension === '.json') {
    try {
      JSON.parse(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`Invalid JSON syntax: ${message}`);
    }
  }

  if (extension === '.html' || extension === '.htm') {
    diagnostics.push(...diagnoseHtml(trimmed));
  }

  if (['.ts', '.tsx', '.js', '.jsx', '.dart', '.py', '.css', '.java', '.cpp', '.cc', '.cxx', '.c', '.hpp', '.hh', '.hxx', '.h'].includes(extension)) {
    diagnostics.push(...diagnoseBalancedDelimiters(content));
  }

  return diagnostics;
}

function diagnoseHtml(content: string): string[] {
  const diagnostics: string[] = [];
  if (!/^<!doctype\s+html/i.test(content)) diagnostics.push('HTML document is missing <!DOCTYPE html>.');
  if (!/<html[\s>]/i.test(content) || !/<\/html>/i.test(content)) diagnostics.push('HTML document is missing a balanced <html> root.');
  if (!/<head[\s>]/i.test(content) || !/<\/head>/i.test(content)) diagnostics.push('HTML document is missing a balanced <head> section.');
  if (!/<body[\s>]/i.test(content) || !/<\/body>/i.test(content)) diagnostics.push('HTML document is missing a balanced <body> section.');

  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack: string[] = [];
  const tagPattern = /<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(content)) !== null) {
    const fullTag = match[0];
    const tag = (match[1] ?? '').toLowerCase();
    if (!tag || voidTags.has(tag) || fullTag.endsWith('/>') || fullTag.startsWith('<!')) continue;

    if (fullTag.startsWith('</')) {
      const last = stack.pop();
      if (last !== tag) {
        diagnostics.push(`HTML closing tag mismatch: expected </${last ?? 'none'}> but found </${tag}>.`);
        break;
      }
    } else {
      stack.push(tag);
    }
  }

  if (stack.length > 0) {
    diagnostics.push(`HTML has unclosed tag <${stack[stack.length - 1]}>.`);
  }

  return diagnostics;
}

function diagnoseBalancedDelimiters(content: string): string[] {
  const diagnostics: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const opening = new Set(Object.values(pairs));
  const stack: string[] = [];
  let quote: '"' | "'" | '`' | null = null;
  let escaped = false;

  for (const char of content) {
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (opening.has(char)) {
      stack.push(char);
      continue;
    }

    const expected = pairs[char];
    if (expected) {
      const actual = stack.pop();
      if (actual !== expected) {
        diagnostics.push(`Unbalanced delimiter: found "${char}" without matching "${expected}".`);
        return diagnostics;
      }
    }
  }

  if (stack.length > 0) diagnostics.push(`Unbalanced delimiter: missing closing token for "${stack[stack.length - 1]}".`);
  if (quote) diagnostics.push(`Unclosed string literal using ${quote}.`);
  return diagnostics;
}

function countLines(content: string): number {
  if (!content) return 0;
  return content.split(/\r\n|\r|\n/).length;
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
