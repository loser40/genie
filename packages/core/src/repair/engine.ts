import * as fs from 'fs';
import * as path from 'path';
import { callAI } from '../ai/caller';
import { GenieConfig, loadConfig } from '../config';
import { ProjectFile } from '../scanner/file-walker';
import { ScanProgress, ScanResult, scanProject } from '../scanner';

export interface RepairApplyOptions {
  projectPath: string;
  allowFallback?: boolean;
}

export interface RepairProgress {
  phase: 'scan' | 'ai' | 'fallback' | 'backup' | 'write' | 'capsule' | 'verify' | 'handoff' | 'done';
  message: string;
  percent: number;
}

export interface RepairApplyResult {
  success: boolean;
  projectPath: string;
  rewrittenFiles: string[];
  backups: string[];
  finalHealthScore: number;
  summary: RepairScanSummary | null;
  message: string;
  usedFallback: boolean;
  handoffMode: boolean;
}

export interface RepairScanSummary {
  healthScore: number;
  filesScanned: number;
  issueCount: number;
  projectName: string;
  capsule: boolean;
  projectPath: string;
  circularChains: number;
  duplicateGroups: number;
}

interface RepairSourceFile {
  relativePath: string;
  absolutePath: string;
  content: string;
  extension: string;
}

interface FileRewrite {
  relativePath: string;
  absolutePath: string;
  content: string;
  usedFallback: boolean;
}

interface FileBackup {
  absolutePath: string;
  relativePath: string;
}

const MAX_REPAIR_FILES = 5;
const MIN_TARGET_REPAIR_FILES = 3;
const MAX_REPAIR_CONTEXT_CHARS = 95_000;
const SOURCE_EXTENSIONS = new Set([
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
]);

export async function applyAutonomousRepair(
  options: RepairApplyOptions,
  onProgress?: (progress: RepairProgress) => void,
): Promise<RepairApplyResult> {
  const projectPath = path.resolve(options.projectPath);
  const allowFallback = options.allowFallback ?? true;
  const emit = (phase: RepairProgress['phase'], message: string, percent: number): void => {
    onProgress?.({ phase, message, percent });
  };

  emit('scan', 'Scanning project before repair...', 6);
  const config = await loadConfig().catch(() => null);
  const initialScan = await scanProject({
    projectPath,
    skipAI: !config?.setupComplete,
    skipCapsule: true,
    taskType: 'repair',
  }, mapScanProgress(onProgress, 'scan', 6, 30));

  const sourceFiles = collectRepairSourceFiles(projectPath, initialScan);
  if (sourceFiles.length === 0) {
    return createWebHandoffResult(projectPath, initialScan, 'No writable repair candidate files were found.', emit, onProgress);
  }

  let rewrites: FileRewrite[] = [];
  if (config?.setupComplete) {
    emit('ai', 'Asking AI for complete file rewrites...', 34);
    rewrites = await requestAIRewrites(config, projectPath, initialScan, sourceFiles).catch(() => []);
  }

  let usedFallback = false;
  if (rewrites.length === 0 && allowFallback) {
    emit('fallback', 'AI rewrite unavailable. Running deterministic HTML fallback...', 48);
    rewrites = buildFallbackRewrites(projectPath, sourceFiles);
    usedFallback = rewrites.length > 0;
  }

  if (rewrites.length === 0) {
    return createWebHandoffResult(projectPath, initialScan, 'No valid rewrite blocks were produced.', emit, onProgress);
  }

  emit('backup', 'Creating file backups...', 58);
  const backups = backupFiles(projectPath, rewrites);

  emit('write', 'Overwriting repaired files...', 66);
  applyFileRewrites(rewrites);

  emit('capsule', 'Regenerating Wish Capsule...', 76);
  await scanProject({
    projectPath,
    skipAI: !config?.setupComplete,
    taskType: 'capsule',
  }, mapScanProgress(onProgress, 'capsule', 76, 88));

  emit('verify', 'Running live verification scan...', 90);
  const finalScan = await scanProject({
    projectPath,
    skipAI: !config?.setupComplete,
    skipCapsule: true,
    taskType: 'scan',
  }, mapScanProgress(onProgress, 'verify', 90, 99));

  emit('done', 'Repair complete.', 100);
  return {
    success: true,
    projectPath,
    rewrittenFiles: rewrites.map((rewrite) => rewrite.relativePath),
    backups: backups.map((backup) => backup.relativePath),
    finalHealthScore: finalScan.graph.healthScore,
    summary: toScanSummary(finalScan),
    message: 'Files successfully rewritten.',
    usedFallback,
    handoffMode: false,
  };
}

async function createWebHandoffResult(
  projectPath: string,
  initialScan: ScanResult,
  reason: string,
  emit: (phase: RepairProgress['phase'], message: string, percent: number) => void,
  onProgress?: (progress: RepairProgress) => void,
): Promise<RepairApplyResult> {
  emit('handoff', 'Local repair failed. Creating Web Capsule for handoff...', 64);
  const capsuleScan = await scanProject({
    projectPath,
    skipAI: false,
    taskType: 'capsule',
  }, mapScanProgress(onProgress, 'handoff', 64, 96));

  emit('done', 'Web Capsule generated for handoff.', 100);
  return {
    success: false,
    projectPath,
    rewrittenFiles: [],
    backups: [],
    finalHealthScore: capsuleScan.graph.healthScore,
    summary: toScanSummary(capsuleScan.capsule ? capsuleScan : initialScan),
    message: reason,
    usedFallback: false,
    handoffMode: true,
  };
}

function mapScanProgress(
  onProgress: ((progress: RepairProgress) => void) | undefined,
  phase: RepairProgress['phase'],
  start: number,
  end: number,
): (progress: ScanProgress) => void {
  return (progress) => {
    const percent = start + Math.round((end - start) * (progress.percent / 100));
    onProgress?.({ phase, message: progress.message, percent });
  };
}

async function requestAIRewrites(
  config: GenieConfig,
  projectPath: string,
  scan: ScanResult,
  sourceFiles: RepairSourceFile[],
): Promise<FileRewrite[]> {
  const response = await callAI(buildAutonomousRepairPrompt(projectPath, scan, sourceFiles), config, 'repair');
  return parseFileRewrites(response, projectPath, false, new Set(sourceFiles.map((file) => file.relativePath)));
}

function buildAutonomousRepairPrompt(
  projectPath: string,
  result: ScanResult,
  sourceFiles: RepairSourceFile[],
): string {
  const targetPaths = new Set(sourceFiles.map((file) => file.relativePath));
  const issues = (result.ai?.issues ?? [])
    .filter((issue) => issue.affectedFiles.length === 0 || issue.affectedFiles.some((file) => targetPaths.has(file)))
    .slice(0, 12)
    .map((issue) => `- [${issue.severity}] ${issue.title}\n  Files: ${issue.affectedFiles.join(', ') || 'unknown'}\n  Fix: ${issue.fix}`)
    .join('\n');

  const plan = (result.ai?.repairPlan ?? [])
    .slice(0, 8)
    .map((step) => `${step.order}. ${step.action} (risk:${step.risk}, automatable:${step.automatable})`)
    .join('\n');

  const darkSpots = sourceFiles
    .map((file, index) => `${index + 1}. ${file.relativePath} (${file.extension}, ${file.content.split(/\r\n|\r|\n/).length} lines)`)
    .join('\n');

  const files = sourceFiles
    .map((file) => [
      `--- BEGIN FILE filepath="${file.relativePath}" ---`,
      file.content,
      `--- END FILE filepath="${file.relativePath}" ---`,
    ].join('\n'))
    .join('\n\n');

  return `You are an expert autonomous engineer. I am giving you the 3 worst files in this project. Fix their architecture, resolve circular dependencies, and output the entire rewritten files in markdown blocks with filepath attributes. DO NOT output conversational text.

PROJECT ROOT:
${projectPath}

CURRENT LIVE HEALTH:
${result.graph.healthScore}/100

LIVE ISSUES:
${issues || 'none'}

REPAIR PLAN:
${plan || 'none'}

DARK SPOTS SELECTED FOR THIS TOKEN-SAFE SNIPER REPAIR:
${darkSpots || 'none'}

SOURCE FILES - ONLY THESE FILES MAY BE REWRITTEN:
${files}

Return ONLY complete file rewrites wrapped in markdown blocks.
Each block must use this exact shape:
\`\`\`html filepath="bad_website.html"
<complete corrected file contents>
\`\`\`

Rules:
- Use the real relative filepath in the filepath attribute.
- Rewrite only files included in SOURCE FILES.
- Each block must contain the full replacement file, not a patch or excerpt.
- For HTML files, return valid, complete HTML5 with closed tags and accessible structure.
- Preserve the user's intended behavior while fixing compile/runtime blockers and structural debt.
- Do not include prose, explanations, diffs, JSON, or shell commands.
- If no safe repair is possible, return no code blocks.`;
}

function collectRepairSourceFiles(projectPath: string, result: ScanResult): RepairSourceFile[] {
  const candidateScores = new Map<string, number>();
  const addCandidate = (relativePath: string, score: number): void => {
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized) return;
    candidateScores.set(normalized, Math.max(candidateScores.get(normalized) ?? 0, score));
  };

  for (const issue of result.ai?.issues ?? []) {
    issue.affectedFiles.forEach((file) => addCandidate(file, severityDebt(issue.severity) + 18));
  }

  for (const chain of result.deps.circularChains.slice(0, 5)) {
    chain.forEach((file) => addCandidate(file, 88));
  }

  for (const duplicate of result.duplicates.slice(0, 5)) {
    duplicate.occurrences.forEach((occurrence) => addCandidate(occurrence.relativePath, severityDebt(duplicate.severity) + 8));
  }

  for (const node of result.graph.nodes) {
    addCandidate(node.relativePath, node.debtScore + statusDebt(node.status));
  }

  const rankedCandidates = [...candidateScores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rankedPaths = rankedCandidates.length > 0
    ? rankedCandidates
    : result.graph.nodes
      .map((node): [string, number] => [node.relativePath, node.debtScore])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const filesByPath = new Map<string, RepairSourceFile>();
  let totalChars = 0;

  for (const [candidate] of rankedPaths) {
    if (filesByPath.size >= MAX_REPAIR_FILES) break;

    const absolutePath = resolveInsideProject(projectPath, candidate);
    if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;

    const extension = path.extname(absolutePath).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(extension)) continue;

    const content = fs.readFileSync(absolutePath, 'utf-8');
    if (totalChars + content.length > MAX_REPAIR_CONTEXT_CHARS && filesByPath.size >= Math.min(MIN_TARGET_REPAIR_FILES, rankedPaths.length)) continue;

    const relativePath = toProjectRelativePath(projectPath, absolutePath);
    filesByPath.set(relativePath, {
      relativePath,
      absolutePath,
      content,
      extension,
    });
    totalChars += content.length;
  }

  return [...filesByPath.values()];
}

function parseFileRewrites(raw: string, projectPath: string, usedFallback: boolean, allowedPaths?: Set<string>): FileRewrite[] {
  const rewrites = new Map<string, FileRewrite>();
  const normalizedAllowedPaths = allowedPaths ? new Set([...allowedPaths].map(normalizeRelativePath)) : null;
  const fencePattern = /```[ \t]*([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(raw)) !== null) {
    const info = match[1] ?? '';
    const content = cleanRewriteContent(match[2] ?? '');
    const contextBeforeFence = raw.slice(Math.max(0, match.index - 320), match.index);
    const requestedPath = extractRewritePath(info) ?? extractRewritePath(contextBeforeFence);
    if (!requestedPath) continue;

    const absolutePath = resolveInsideProject(projectPath, requestedPath);
    if (!absolutePath) continue;

    const relativePath = toProjectRelativePath(projectPath, absolutePath);
    if (normalizedAllowedPaths && !normalizedAllowedPaths.has(normalizeRelativePath(relativePath))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) continue;
    if (!content.trim()) continue;

    rewrites.set(relativePath, {
      relativePath,
      absolutePath,
      content: ensureTrailingNewline(content),
      usedFallback,
    });
  }

  return [...rewrites.values()];
}

function extractRewritePath(value: string): string | null {
  const patterns = [
    /\b(?:filepath|file|path)\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>]+))/i,
    /\b(?:filepath|file|path)\s*:\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>]+))/i,
    /<[^>]*\b(?:filepath|file|path)\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>]+))[^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(value);
    const found = match?.slice(1).find(Boolean);
    if (found) return found.trim();
  }

  return null;
}

function cleanRewriteContent(content: string): string {
  return content.replace(/^\s*\r?\n/, '').replace(/\r?\n\s*$/, '\n');
}

function buildFallbackRewrites(projectPath: string, sourceFiles: RepairSourceFile[]): FileRewrite[] {
  return sourceFiles
    .filter((file) => file.extension === '.html' || file.extension === '.htm')
    .map((file) => ({
      relativePath: file.relativePath,
      absolutePath: resolveInsideProject(projectPath, file.relativePath) ?? file.absolutePath,
      content: ensureTrailingNewline(rebuildHtmlDocument(file.content)),
      usedFallback: true,
    }));
}

function rebuildHtmlDocument(content: string): string {
  const title = cleanText(matchFirst(content, /<title[^>]*>([\s\S]*?)(?:<\/title>|<title>|$)/i) || 'Repaired Website');
  const h1 = cleanText(matchFirst(content, /<h1[^>]*>([\s\S]*?)(?:<\/h1>|<|$)/i) || title);
  const paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)(?:<\/p>|$)/gi)]
    .map((match) => cleanText(match[1] ?? ''))
    .filter(Boolean);
  const sections = [...content.matchAll(/<h2[^>]*>([\s\S]*?)(?:<\/h[2-6]>|<|$)/gi)]
    .map((match) => cleanText(match[1] ?? ''))
    .filter(Boolean);
  const listItems = unique([...content.matchAll(/<li[^>]*>([\s\S]*?)(?:<\/li>|<li|<\/[ou]l>|$)/gi)]
    .map((match) => cleanText(match[1] ?? ''))
    .filter(Boolean));
  const imageSrc = cleanAttribute(matchFirst(content, /<img[^>]*\bsrc=(["']?)([^"'\s>]+)\1/i, 2) || '');

  const intro = paragraphs[0] || 'This page has been repaired into valid, accessible HTML.';
  const about = paragraphs[1] || 'The structure now uses semantic sections, closed tags, and responsive styling.';
  const sectionTitle = sections[0] || 'About';
  const items = listItems.length > 0 ? listItems : ['Clean HTML', 'Accessible layout', 'Responsive design'];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.6;
      color: #172033;
      background: #f6f4ff;
    }

    body {
      margin: 0;
    }

    main {
      max-width: 860px;
      margin: 0 auto;
      padding: 48px 20px;
    }

    section {
      background: #ffffff;
      border: 1px solid #ded8ff;
      border-radius: 14px;
      box-shadow: 0 14px 36px rgba(83, 55, 150, 0.14);
      margin-bottom: 22px;
      padding: 28px;
    }

    h1,
    h2 {
      line-height: 1.2;
      margin: 0 0 14px;
    }

    h1 {
      color: #5b21b6;
      font-size: 2.4rem;
    }

    h2 {
      color: #6d28d9;
      font-size: 1.45rem;
    }

    ul {
      padding-left: 1.25rem;
    }

    img {
      border-radius: 12px;
      display: block;
      height: auto;
      max-width: 100%;
    }

    button {
      background: #7c3aed;
      border: 0;
      border-radius: 999px;
      color: #ffffff;
      cursor: pointer;
      font-weight: 700;
      padding: 12px 18px;
    }
  </style>
</head>
<body>
  <main>
    <section aria-labelledby="page-title">
      <h1 id="page-title">${escapeHtml(h1)}</h1>
      <p>${escapeHtml(intro)}</p>
    </section>

    <section aria-labelledby="about-title">
      <h2 id="about-title">${escapeHtml(sectionTitle)}</h2>
      <p>${escapeHtml(about)}</p>
    </section>

    <section aria-labelledby="list-title">
      <h2 id="list-title">Highlights</h2>
      <ul>
${items.map((item) => `        <li>${escapeHtml(item)}</li>`).join('\n')}
      </ul>
    </section>
${imageSrc ? `
    <section aria-labelledby="image-title">
      <h2 id="image-title">Image</h2>
      <img src="${escapeHtml(imageSrc)}" alt="Website visual">
    </section>` : ''}

    <section aria-labelledby="action-title">
      <h2 id="action-title">Action</h2>
      <button type="button">Click Me</button>
    </section>
  </main>
</body>
</html>`;
}

function backupFiles(projectPath: string, rewrites: FileRewrite[]): FileBackup[] {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(projectPath, '.genie', 'backups', timestamp);
  const backups: FileBackup[] = [];

  for (const rewrite of rewrites) {
    if (!fs.existsSync(rewrite.absolutePath)) continue;

    const backupPath = path.join(backupRoot, rewrite.relativePath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(rewrite.absolutePath, backupPath);
    backups.push({
      absolutePath: backupPath,
      relativePath: toProjectRelativePath(projectPath, backupPath),
    });
  }

  return backups;
}

function applyFileRewrites(rewrites: FileRewrite[]): void {
  for (const rewrite of rewrites) {
    fs.mkdirSync(path.dirname(rewrite.absolutePath), { recursive: true });
    fs.writeFileSync(rewrite.absolutePath, rewrite.content, 'utf-8');
  }
}

function emptyRepairResult(projectPath: string, scan: ScanResult, message: string): RepairApplyResult {
  return {
    success: false,
    projectPath,
    rewrittenFiles: [],
    backups: [],
    finalHealthScore: scan.graph.healthScore,
    summary: toScanSummary(scan),
    message,
    usedFallback: false,
    handoffMode: false,
  };
}

function toScanSummary(result: ScanResult): RepairScanSummary {
  return {
    healthScore: result.graph.healthScore,
    filesScanned: result.filesScanned,
    issueCount: result.duplicates.length + result.deps.circularChains.length + (result.ai?.issues.length ?? 0),
    projectName: result.projectName,
    capsule: Boolean(result.capsule),
    projectPath: result.projectPath,
    circularChains: result.deps.circularChains.length,
    duplicateGroups: result.duplicates.length,
  };
}

function resolveInsideProject(projectPath: string, filePath: string): string | null {
  const normalizedInput = filePath.replace(/^["']|["']$/g, '').trim();
  if (!normalizedInput) return null;

  const resolvedRoot = path.resolve(projectPath);
  const absolutePath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(resolvedRoot, normalizedInput);
  const relative = path.relative(resolvedRoot, absolutePath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolutePath;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/^["']|["']$/g, '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function statusDebt(status: string): number {
  return {
    chaos: 42,
    duplicate: 30,
    warning: 18,
    dead: 10,
    healthy: 0,
  }[status] ?? 0;
}

function severityDebt(severity: string): number {
  return {
    critical: 100,
    high: 78,
    medium: 46,
    low: 22,
  }[severity] ?? 30;
}

function toProjectRelativePath(projectPath: string, absolutePath: string): string {
  return path.relative(path.resolve(projectPath), absolutePath).replace(/\\/g, '/');
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function matchFirst(content: string, pattern: RegExp, group = 1): string {
  return pattern.exec(content)?.[group] ?? '';
}

function cleanText(value: string): string {
  return stripTags(value)
    .replace(/\s+/g, ' ')
    .replace(/\bhtm\b/gi, 'HTML')
    .trim();
}

function cleanAttribute(value: string): string {
  return value.replace(/[<>"']/g, '').trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
