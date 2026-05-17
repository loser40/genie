import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as path from 'path';
import { applyAutonomousRepair, RepairApplyResult, ScanResult, scanProject } from '@genie-ai/core';

export async function repairCommand(projectPath: string): Promise<void> {
  const resolvedProjectPath = path.resolve(projectPath);
  const spinner = ora('Running live GENIE repair analysis...').start();

  try {
    const preview = await scanProject({
      projectPath: resolvedProjectPath,
      skipAI: false,
      skipCapsule: true,
      taskType: 'repair',
    }, (progress) => {
      spinner.text = `${progress.message} (${progress.percent}%)`;
    });

    spinner.succeed('Repair analysis complete');
    printRepairReport(preview);

    const shouldApply = await promptApplyRepair();
    if (!shouldApply) {
      console.log(chalk.gray('Autonomous repair skipped. No files were changed.\n'));
      return;
    }

    const repairSpinner = ora('GENIE is rewriting files...').start();
    const result = await applyAutonomousRepair({
      projectPath: resolvedProjectPath,
      allowFallback: true,
    }, (progress) => {
      repairSpinner.text = `${progress.message} (${progress.percent}%)`;
    });

    if (result.handoffMode) {
      repairSpinner.succeed('Web Capsule generated for handoff.');
      console.log(chalk.yellow('\nLocal repair failed (Code too complex). A Web Capsule has been generated. Open Claude or ChatGPT and click the GENIE Lamp to inject this context.\n'));
      return;
    }

    if (!result.success) {
      repairSpinner.fail(result.message);
      process.exitCode = 1;
      return;
    }

    repairSpinner.succeed(result.message);
    printRepairResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(message);
    process.exitCode = 1;
  }
}

function printRepairReport(result: ScanResult): void {
  const score = result.graph.healthScore;
  const color = score >= 70 ? chalk.green : score >= 40 ? chalk.yellow : chalk.red;

  console.log('\n' + chalk.bold.magenta('GENIE REPAIR PLAN'));
  console.log(chalk.gray(`Project : ${result.projectName}`));
  console.log(chalk.gray(`Path    : ${result.projectPath}`));
  console.log(chalk.gray(`Files   : ${result.filesScanned}`));
  console.log(`Health  : ${color.bold(`${score} / 100`)}\n`);

  const issues = result.ai?.issues ?? [];
  if (issues.length === 0) {
    console.log(chalk.green('No repair issues were detected from the live scan.\n'));
    return;
  }

  console.log(chalk.yellow('Top live issues'));
  for (const issue of issues.slice(0, 8)) {
    console.log(`  [${issue.severity.toUpperCase()}] ${issue.title}`);
    if (issue.affectedFiles.length > 0) {
      console.log(chalk.gray(`    ${issue.affectedFiles.slice(0, 4).join(', ')}`));
    }
    console.log(chalk.gray(`    ${issue.fix}`));
  }
  console.log();
}

async function promptApplyRepair(): Promise<boolean> {
  const { answer } = await inquirer.prompt<{ answer: string }>([{
    type: 'input',
    name: 'answer',
    message: 'GENIE has a repair plan. Do you want to apply these changes autonomously? (y/n)',
    validate: (value: string) => /^[yn]$/i.test(value.trim()) || 'Type y or n',
  }]);

  return answer.trim().toLowerCase() === 'y';
}

function printRepairResult(result: RepairApplyResult): void {
  console.log(chalk.green('\nFiles successfully rewritten.'));
  for (const file of result.rewrittenFiles) {
    console.log(chalk.gray(`  rewritten ${file}`));
  }

  if (result.backups.length > 0) {
    console.log(chalk.cyan('\nBackups'));
    for (const backup of result.backups) {
      console.log(chalk.gray(`  ${backup}`));
    }
  }

  console.log(chalk.green(`\nMemory Capsule Updated.`));
  console.log(chalk.cyan('Running Live Verification Scan...'));
  console.log(`Health: ${chalk.bold(`${result.finalHealthScore} / 100`)}\n`);
}
