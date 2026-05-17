import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { loadConfig, ScanResult, scanProject } from '@genie-ai/core';

export async function scanCommand(projectPath: string, options: { ai?: boolean; json?: boolean }): Promise<void> {
  const spinner = ora('Initializing GENIE...').start();

  try {
    const resolvedProjectPath = path.resolve(projectPath);
    const config = await loadConfig();
    const skipAI = !config?.setupComplete;
    const result = await scanProject({ projectPath: resolvedProjectPath, skipAI }, (progress) => {
      spinner.text = `${progress.message} (${progress.percent}%)`;
    });

    spinner.succeed('Scan complete');

    if (options.json) {
      console.log(JSON.stringify(serializeScanResult(result), null, 2));
      return;
    }

    printReport(result);

    if (skipAI) {
      console.log(chalk.gray('Run genie setup to enable live AI repair analysis.\n'));
    } else if (options.ai) {
      console.log(chalk.gray('AI analysis used your configured provider from ~/.genie/config.json.\n'));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(message);
    process.exitCode = 1;
  }
}

function printReport(result: ScanResult): void {
  const score = result.graph.healthScore;
  const color = score >= 70 ? chalk.green : score >= 40 ? chalk.yellow : chalk.red;

  console.log('\n' + chalk.bold.magenta('GENIE REPORT'));
  console.log(chalk.gray(`Project : ${result.projectName}`));
  console.log(chalk.gray(`Files   : ${result.filesScanned}`));
  console.log(`Health  : ${color.bold(`${score} / 100`)}\n`);

  if (result.deps.circularChains.length > 0) {
    console.log(chalk.red(`Circular dependencies (${result.deps.circularChains.length})`));
    result.deps.circularChains.slice(0, 5).forEach((chain) => console.log(chalk.red(`  ${chain.join(' -> ')}`)));
    console.log();
  }

  if (result.duplicates.length > 0) {
    console.log(chalk.yellow(`Duplicate groups (${result.duplicates.length})`));
    result.duplicates.slice(0, 5).forEach((duplicate) => {
      console.log(chalk.yellow(`  [${duplicate.severity}] x${duplicate.occurrences.length} -> ${duplicate.suggestedPath}`));
    });
    console.log();
  }

  if (result.ai) {
    console.log(chalk.cyan(result.ai.architectureSummary));
    result.ai.issues.slice(0, 5).forEach((issue) => {
      console.log(`  [${issue.severity.toUpperCase()}] ${issue.title}`);
    });
    console.log();
  }

  if (result.capsule) {
    console.log(chalk.magenta(`Wish Capsule -> .genie/${result.projectName}.capsule.json`));
    console.log(chalk.gray('Use genie inject to paste project memory into any AI session.\n'));
  }
}

function serializeScanResult(result: ScanResult): unknown {
  return {
    ...result,
    deps: {
      ...result.deps,
      dependencies: Object.fromEntries(result.deps.dependencies),
    },
  };
}
