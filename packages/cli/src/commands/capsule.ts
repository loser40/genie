import chalk from 'chalk';
import ora from 'ora';
import { loadCapsule, scanProject } from '@genie-ai/core';

export async function capsuleCommand(action: 'create' | 'show', projectPath: string): Promise<void> {
  if (action === 'show') {
    const capsule = await loadCapsule(projectPath);
    if (!capsule) {
      console.log(chalk.red(`\nNo capsule found. Run: genie capsule create ${projectPath}\n`));
      return;
    }

    console.log(chalk.magenta(`\n${capsule.projectName} - Wish Capsule`));
    console.log(chalk.gray('Health  : ') + chalk.cyan(`${capsule.issues.healthScore}/100`));
    console.log(chalk.gray('Updated : ') + capsule.updatedAt);
    console.log(chalk.gray('Issues  : ') + (capsule.issues.openIssues.slice(0, 3).join(' | ') || 'none'));
    console.log(chalk.gray('\n/genie inject text:\n'));
    console.log(chalk.cyan(capsule.injectText) + '\n');
    return;
  }

  const spinner = ora('Scanning and creating capsule...').start();
  try {
    const result = await scanProject({ projectPath, skipAI: false, taskType: 'capsule' }, (progress) => {
      spinner.text = progress.message;
    });
    spinner.succeed('Wish Capsule created');
    console.log(chalk.magenta(`\n.genie/${result.projectName}.capsule.json`));
    console.log(chalk.gray('Run genie inject to use it in any AI session.\n'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(message);
    process.exitCode = 1;
  }
}
