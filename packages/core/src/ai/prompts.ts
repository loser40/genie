import { DependencyResult } from '../analyzers/dependency';
import { DuplicateGroup } from '../analyzers/duplicates';
import { ProjectFile } from '../scanner/file-walker';

export function buildAnalysisPrompt(
  projectName: string,
  files: ProjectFile[],
  deps: DependencyResult,
  duplicates: DuplicateGroup[],
): string {
  const totalLines = files.reduce((sum, file) => sum + file.lineCount, 0);
  const languageSummary = summarizeLanguages(files);
  const fileTree = files
    .slice(0, 120)
    .map((file) => {
      const diagnostics = file.diagnostics.length > 0 ? ` diagnostics:${file.diagnostics.join(' | ')}` : '';
      const readable = file.readable ? '' : ' unreadable';
      return `  ${file.relativePath} (${file.language}, ${file.lineCount} lines${readable}${diagnostics})`;
    })
    .join('\n') || '  none';

  const topModules = [...deps.dependencies.entries()]
    .sort((a, b) => b[1].importedBy.length - a[1].importedBy.length)
    .slice(0, 8)
    .map(([file, dep]) => `  ${file} (usedBy:${dep.importedBy.length} imports:${dep.imports.length})`)
    .join('\n') || '  none';

  const circularChains = deps.circularChains.map((chain) => `  ${chain.join(' -> ')}`).join('\n') || '  none';
  const duplicateList = duplicates
    .slice(0, 6)
    .map((duplicate) => {
      const files = duplicate.occurrences.map((occurrence) => occurrence.relativePath).join(', ');
      return `  [${duplicate.severity}] x${duplicate.occurrences.length} in ${files} (${duplicate.lineCount} lines)`;
    })
    .join('\n') || '  none';

  return `You are GENIE - AI Maintainability and Code Repair System.
Analyze this structural data and return a JSON repair analysis.

PROJECT: ${projectName}
FILES: ${files.length}
LINES: ${totalLines}
LANGUAGES: ${languageSummary}
ORPHANS: ${deps.orphanFiles.slice(0, 5).join(', ') || 'none'}

LIVE FILE INVENTORY:
${fileTree}

TOP MODULES BY USAGE:
${topModules}

CIRCULAR DEPENDENCY CHAINS (${deps.circularChains.length}):
${circularChains}

DUPLICATE LOGIC GROUPS (${duplicates.length}):
${duplicateList}

Return ONLY this JSON. No markdown. No preamble. No explanation after.
{
  "healthScore": <integer 0-100>,
  "architectureSummary": "<2-3 sentences>",
  "projectType": "<Next.js|NestJS|Express|React|Vue|Flutter|Node.js|Python|Java|C++|Static HTML|Other>",
  "primaryLanguage": "<TypeScript|JavaScript|Dart|Python|HTML|CSS|Java|C++|JSON|Mixed>",
  "issues": [
    {
      "id": "issue_1",
      "title": "<short title>",
      "severity": "<critical|high|medium|low>",
      "explanation": "<why this happened, especially if from repeated AI prompts>",
      "impact": "<what breaks if unfixed>",
      "fix": "<concrete fix instructions>",
      "codeComment": "// GENIE: <comment to inject into affected files>",
      "affectedFiles": ["<relative/path.ts>"],
      "automatable": <true|false>
    }
  ],
  "repairPlan": [
    { "order": 1, "action": "<what>", "rationale": "<why first>", "risk": "<safe|moderate|risky>", "automatable": <bool> }
  ],
  "capsuleSummary": "<max 350 tokens of compressed project intelligence for future AI sessions>",
  "keyPatterns": ["<e.g. JWT Auth, REST API, Prisma ORM>"],
  "knownConstraints": ["<e.g. PostgreSQL, Redis, Stripe>"]
}`;
}

function summarizeLanguages(files: ProjectFile[]): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.language, (counts.get(file.language) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([language, count]) => `${language}:${count}`)
    .join(', ') || 'unknown';
}
