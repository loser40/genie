import { callAI } from './caller';
import { buildAnalysisPrompt } from './prompts';
import { requireConfig } from '../config';
import { DependencyResult } from '../analyzers/dependency';
import { DuplicateGroup } from '../analyzers/duplicates';
import { ProjectFile } from '../scanner/file-walker';
import { asRecord, readArray, readBoolean, readNumber, readString } from '../utils';
import { AITaskType } from './router';

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type RepairRisk = 'safe' | 'moderate' | 'risky';

export interface AIIssue {
  id: string;
  title: string;
  severity: IssueSeverity;
  explanation: string;
  impact: string;
  fix: string;
  codeComment: string;
  affectedFiles: string[];
  automatable: boolean;
}

export interface AIRepairStep {
  order: number;
  action: string;
  rationale: string;
  risk: RepairRisk;
  automatable: boolean;
}

export interface AIAnalysisResult {
  healthScore: number;
  architectureSummary: string;
  projectType: string;
  primaryLanguage: string;
  issues: AIIssue[];
  repairPlan: AIRepairStep[];
  capsuleSummary: string;
  keyPatterns: string[];
  knownConstraints: string[];
}

export async function runAIAnalysis(
  projectName: string,
  files: ProjectFile[],
  deps: DependencyResult,
  duplicates: DuplicateGroup[],
  taskType: AITaskType = 'scan',
): Promise<AIAnalysisResult> {
  try {
    const config = await requireConfig();
    const prompt = buildAnalysisPrompt(projectName, files, deps, duplicates);
    const raw = await callAI(prompt, config, taskType);
    const structural = buildStructuralFallbackAnalysis(files, deps, duplicates);
    const ai = normalizeAIResult(JSON.parse(extractJson(raw)));
    return mergeWithStructuralTruth(ai, structural);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GENIE] AI analysis unavailable, using structural fallback: ${message}`);
    return buildStructuralFallbackAnalysis(files, deps, duplicates);
  }
}

export function buildStructuralFallbackAnalysis(
  files: ProjectFile[],
  deps: DependencyResult,
  duplicates: DuplicateGroup[],
): AIAnalysisResult {
  const circularCount = deps.circularChains.length;
  const unreadableFiles = files.filter((file) => !file.readable);
  const diagnosticFiles = files.filter((file) => file.diagnostics.length > 0);
  const diagnosticCount = diagnosticFiles.reduce((sum, file) => sum + file.diagnostics.length, 0);
  const criticalDuplicateCount = duplicates.filter((duplicate) => duplicate.severity === 'critical').length;
  const highDuplicateCount = duplicates.filter((duplicate) => duplicate.severity === 'high').length;
  const largeFiles = files
    .filter((file) => file.lineCount >= 500)
    .sort((a, b) => b.lineCount - a.lineCount);
  const hugeFileCount = largeFiles.filter((file) => file.lineCount >= 1000).length;
  const healthScore = calculateStructuralHealthScore({
    fileCount: files.length,
    unreadableCount: unreadableFiles.length,
    diagnosticCount,
    circularCount,
    criticalDuplicateCount,
    highDuplicateCount,
    largeFileCount: largeFiles.length,
    hugeFileCount,
  });
  const issues: AIIssue[] = [
    ...unreadableFiles.slice(0, 8).map((file, index): AIIssue => ({
      id: `unreadable_file_${index + 1}`,
      title: `Unreadable file: ${file.relativePath}`,
      severity: 'critical',
      explanation: 'The scanner could not read this file as source text, so GENIE cannot safely analyze or repair it.',
      impact: 'A project with unreadable source cannot receive a trustworthy health score or autonomous repair.',
      fix: 'Restore the file as readable UTF-8 source or remove it from the source tree if it is generated/binary output.',
      codeComment: '// GENIE: This file could not be read during the live scan.',
      affectedFiles: [file.relativePath],
      automatable: false,
    })),
    ...diagnosticFiles.slice(0, 10).map((file, index): AIIssue => ({
      id: `source_diagnostic_${index + 1}`,
      title: `Source diagnostic in ${file.relativePath}`,
      severity: file.diagnostics.length >= 3 ? 'critical' : 'high',
      explanation: file.diagnostics.join(' '),
      impact: 'Syntax or structure issues can prevent compilation, rendering, or reliable AI-assisted refactoring.',
      fix: 'Rewrite the file into valid, complete source with balanced structure before making higher-level architecture changes.',
      codeComment: '// GENIE: Fix source syntax/structure before extending this file.',
      affectedFiles: [file.relativePath],
      automatable: true,
    })),
    ...deps.circularChains.slice(0, 8).map((chain, index): AIIssue => ({
      id: `circular_${index + 1}`,
      title: `Circular dependency chain ${index + 1}`,
      severity: chain.length > 3 ? 'high' : 'medium',
      explanation: 'Modules import each other in a cycle, which usually grows from quick feature additions without a stable boundary.',
      impact: 'Cycles make initialization order fragile, complicate testing, and increase the chance of hidden coupling.',
      fix: 'Move shared contracts or utilities into a lower-level module and make imports flow in one direction.',
      codeComment: '// GENIE: Break this circular dependency by moving shared logic into a lower-level module.',
      affectedFiles: chain,
      automatable: false,
    })),
    ...duplicates.slice(0, 8).map((duplicate): AIIssue => ({
      id: duplicate.id,
      title: `Duplicate logic across ${duplicate.occurrences.length} locations`,
      severity: duplicate.severity,
      explanation: 'GENIE found repeated AST structure, often caused by prompt-by-prompt code growth instead of shared abstractions.',
      impact: 'Bug fixes and behavior changes must be repeated manually across every copy.',
      fix: `Extract the repeated logic into ${duplicate.suggestedPath} and replace each occurrence with a shared call.`,
      codeComment: '// GENIE: This logic repeats elsewhere. Extract it into a shared helper before extending it.',
      affectedFiles: duplicate.occurrences.map((occurrence) => occurrence.relativePath),
      automatable: duplicate.severity !== 'critical',
    })),
    ...largeFiles.slice(0, 6).map((file, index): AIIssue => ({
      id: `large_file_${index + 1}`,
      title: `Large file: ${file.relativePath}`,
      severity: file.lineCount >= 1000 ? 'high' : 'medium',
      explanation: 'This file is large enough that unrelated responsibilities may have accumulated in one place.',
      impact: 'Large files are harder for humans and AI tools to repair safely because every change has more hidden context.',
      fix: 'Split cohesive sections into smaller modules and keep state, UI, and data access concerns separated.',
      codeComment: '// GENIE: Consider splitting this large file into focused modules before adding more behavior.',
      affectedFiles: [file.relativePath],
      automatable: false,
    })),
  ];

  return {
    healthScore,
    architectureSummary: `${files.length} live files scanned with ${diagnosticCount} source diagnostics, ${circularCount} circular chains, ${deps.orphanFiles.length} orphan files, ${duplicates.length} duplicate logic groups, and ${largeFiles.length} large-file risks.`,
    projectType: inferProjectType(deps, files),
    primaryLanguage: inferPrimaryLanguage(deps, files),
    issues,
    repairPlan: issues.slice(0, 8).map((issue, index) => ({
      order: index + 1,
      action: issue.fix,
      rationale: issue.impact,
      risk: issue.severity === 'critical' || issue.severity === 'high' ? 'moderate' : 'safe',
      automatable: issue.automatable,
    })),
    capsuleSummary: `${files.length} files; ${diagnosticCount} source diagnostics; ${circularCount} circular chains; ${duplicates.length} duplicate groups; ${largeFiles.length} large files; top risks: ${issues.slice(0, 3).map((issue) => issue.title).join('; ') || 'none'}.`,
    keyPatterns: inferPatterns(deps, files),
    knownConstraints: [],
  };
}

function mergeWithStructuralTruth(ai: AIAnalysisResult, structural: AIAnalysisResult): AIAnalysisResult {
  const structuralIssueIds = new Set(structural.issues.map((issue) => issue.id));
  const aiIssueIds = new Set(ai.issues.map((issue) => issue.id));
  const missingStructuralIssues = structural.issues.filter((issue) => structuralIssueIds.has(issue.id) && !aiIssueIds.has(issue.id));

  return {
    ...ai,
    healthScore: Math.min(ai.healthScore, structural.healthScore),
    issues: [...missingStructuralIssues, ...ai.issues],
    repairPlan: ai.repairPlan.length > 0 ? ai.repairPlan : structural.repairPlan,
    architectureSummary: structural.healthScore < ai.healthScore
      ? `${ai.architectureSummary} Structural scanner capped health at ${structural.healthScore}/100 because live filesystem diagnostics found concrete risk.`
      : ai.architectureSummary,
    capsuleSummary: ai.capsuleSummary || structural.capsuleSummary,
    keyPatterns: unique([...structural.keyPatterns, ...ai.keyPatterns]),
    knownConstraints: unique([...structural.knownConstraints, ...ai.knownConstraints]),
  };
}

function calculateStructuralHealthScore(input: {
  fileCount: number;
  unreadableCount: number;
  diagnosticCount: number;
  circularCount: number;
  criticalDuplicateCount: number;
  highDuplicateCount: number;
  largeFileCount: number;
  hugeFileCount: number;
}): number {
  if (input.fileCount === 0 || input.unreadableCount > 0) return 10;

  const raw = 100
    - input.diagnosticCount * 14
    - input.circularCount * 15
    - input.criticalDuplicateCount * 20
    - input.highDuplicateCount * 10
    - input.largeFileCount * 4
    - input.hugeFileCount * 6;

  return Math.max(10, clampScore(raw));
}

function extractJson(raw: string): string {
  const withoutFences = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const firstBrace = withoutFences.indexOf('{');
  const lastBrace = withoutFences.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('AI response did not contain a JSON object');
  }
  return withoutFences.slice(firstBrace, lastBrace + 1);
}

function normalizeAIResult(value: unknown): AIAnalysisResult {
  const record = asRecord(value);
  return {
    healthScore: clampScore(readNumber(record.healthScore, 50)),
    architectureSummary: readString(record.architectureSummary, 'No architecture summary returned.'),
    projectType: readString(record.projectType, 'Other'),
    primaryLanguage: readString(record.primaryLanguage, 'Mixed'),
    issues: readArray(record.issues).map(normalizeIssue),
    repairPlan: readArray(record.repairPlan).map(normalizeRepairStep),
    capsuleSummary: readString(record.capsuleSummary, ''),
    keyPatterns: readArray(record.keyPatterns).map((item) => readString(item, '')).filter(Boolean),
    knownConstraints: readArray(record.knownConstraints).map((item) => readString(item, '')).filter(Boolean),
  };
}

function normalizeIssue(value: unknown, index: number): AIIssue {
  const record = asRecord(value);
  return {
    id: readString(record.id, `issue_${index + 1}`),
    title: readString(record.title, 'Untitled issue'),
    severity: normalizeSeverity(record.severity),
    explanation: readString(record.explanation, ''),
    impact: readString(record.impact, ''),
    fix: readString(record.fix, ''),
    codeComment: readString(record.codeComment, ''),
    affectedFiles: readArray(record.affectedFiles).map((item) => readString(item, '')).filter(Boolean),
    automatable: readBoolean(record.automatable, false),
  };
}

function normalizeRepairStep(value: unknown, index: number): AIRepairStep {
  const record = asRecord(value);
  return {
    order: readNumber(record.order, index + 1),
    action: readString(record.action, ''),
    rationale: readString(record.rationale, ''),
    risk: normalizeRisk(record.risk),
    automatable: readBoolean(record.automatable, false),
  };
}

function inferProjectType(deps: DependencyResult, projectFiles: ProjectFile[]): string {
  const files = [
    ...projectFiles.map((file) => file.relativePath),
    ...deps.dependencies.keys(),
  ].join('\n').toLowerCase();
  if (files.includes('pubspec.yaml') || files.includes('.dart') || files.includes('/lib/main.dart')) return 'Flutter';
  if (files.includes('next.config') || files.includes('/app/') || files.includes('/pages/')) return 'Next.js';
  if (files.includes('nest') || files.includes('.controller.') || files.includes('.module.')) return 'NestJS';
  if (files.includes('express') || files.includes('/routes/')) return 'Express';
  if (files.includes('.vue')) return 'Vue';
  if (files.includes('.tsx') || files.includes('/components/')) return 'React';
  if (files.includes('.java')) return 'Java';
  if (files.includes('.cpp') || files.includes('.hpp') || files.includes('.cc') || files.includes('.cxx')) return 'C++';
  if (files.includes('.py')) return 'Python';
  if (files.includes('.html') || files.includes('.htm')) return 'Static HTML';
  return files.trim() ? 'Node.js' : 'Other';
}

function inferPrimaryLanguage(deps: DependencyResult, projectFiles: ProjectFile[]): string {
  const files = unique([
    ...projectFiles.map((file) => file.relativePath),
    ...deps.dependencies.keys(),
  ]);
  const tsCount = files.filter((file) => file.endsWith('.ts') || file.endsWith('.tsx')).length;
  const jsCount = files.filter((file) => file.endsWith('.js') || file.endsWith('.jsx')).length;
  const dartCount = files.filter((file) => file.endsWith('.dart')).length;
  const pyCount = files.filter((file) => file.endsWith('.py')).length;
  const htmlCount = files.filter((file) => file.endsWith('.html') || file.endsWith('.htm')).length;
  const cssCount = files.filter((file) => file.endsWith('.css')).length;
  const javaCount = files.filter((file) => file.endsWith('.java')).length;
  const cppCount = files.filter((file) => /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx)$/.test(file)).length;
  const jsonCount = files.filter((file) => file.endsWith('.json')).length;
  const max = Math.max(tsCount, jsCount, dartCount, pyCount, htmlCount, cssCount, javaCount, cppCount, jsonCount);
  if (max === 0) return 'Mixed';
  const total = tsCount + jsCount + dartCount + pyCount + htmlCount + cssCount + javaCount + cppCount + jsonCount;
  if (tsCount === max && tsCount > total - tsCount) return 'TypeScript';
  if (jsCount === max && jsCount > total - jsCount) return 'JavaScript';
  if (dartCount === max && dartCount > total - dartCount) return 'Dart';
  if (pyCount === max && pyCount > total - pyCount) return 'Python';
  if (htmlCount === max && htmlCount > total - htmlCount) return 'HTML';
  if (cssCount === max && cssCount > total - cssCount) return 'CSS';
  if (javaCount === max && javaCount > total - javaCount) return 'Java';
  if (cppCount === max && cppCount > total - cppCount) return 'C++';
  if (jsonCount === max && jsonCount > total - jsonCount) return 'JSON';
  return 'Mixed';
}

function inferPatterns(deps: DependencyResult, projectFiles: ProjectFile[]): string[] {
  const files = unique([
    ...projectFiles.map((file) => file.relativePath),
    ...deps.dependencies.keys(),
  ]).map((file) => file.toLowerCase());
  const patterns = new Set<string>();
  if (files.some((file) => file.includes('/lib/') || file.endsWith('.dart'))) patterns.add('Flutter/Dart app');
  if (files.some((file) => file.includes('prisma'))) patterns.add('Prisma ORM');
  if (files.some((file) => file.includes('mongoose'))) patterns.add('Mongoose ODM');
  if (files.some((file) => file.includes('controller'))) patterns.add('Controller layer');
  if (files.some((file) => file.includes('service'))) patterns.add('Service layer');
  if (files.some((file) => file.includes('route'))) patterns.add('Route handlers');
  if (files.some((file) => file.includes('component'))) patterns.add('Component UI');
  if (files.some((file) => file.includes('hook'))) patterns.add('React hooks');
  if (files.some((file) => file.includes('auth') || file.includes('jwt'))) patterns.add('Authentication');
  return [...patterns];
}

function normalizeSeverity(value: unknown): IssueSeverity {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function normalizeRisk(value: unknown): RepairRisk {
  return value === 'safe' || value === 'moderate' || value === 'risky' ? value : 'moderate';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
