#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig } from '@genie-ai/core';
import { bridgeCommand } from './commands/bridge.js';
import { capsuleCommand } from './commands/capsule.js';
import { injectCommand } from './commands/inject.js';
import { repairCommand } from './commands/repair.js';
import { scanCommand } from './commands/scan.js';
import { setupBrowserCommand } from './commands/setup-browser.js';
import { setupCommand } from './commands/setup.js';
import { startCommand } from './commands/start.js';

const program = new Command();

program
  .name('genie')
  .description('AI maintainability and code repair command center')
  .version('1.0.0');

program
  .command('setup')
  .description('Configure your BYOK AI provider')
  .option('--reset', 'reconfigure from scratch')
  .action(setupCommand);

program
  .command('setup-browser')
  .description('Open Chrome extension setup flow')
  .action(setupBrowserCommand);

program
  .command('bridge')
  .description('Run the local Chrome extension Capsule bridge')
  .option('-p, --port <port>', 'bridge port number', '14747')
  .action(bridgeCommand);

program
  .command('scan [path]')
  .description('Analyze a project for maintainability issues')
  .option('--ai', 'enable AI repair layer')
  .option('--json', 'output raw JSON')
  .action(async (projectPath: string | undefined, options: { ai?: boolean; json?: boolean }) => {
    await scanCommand(projectPath ?? await promptProjectPath(), options);
  });

program
  .command('repair [path]')
  .description('Prepare for autonomous repair')
  .action(async (projectPath: string | undefined) => {
    await repairCommand(projectPath ?? await promptProjectPath());
  });

program
  .command('manual <path>')
  .description('Run AI analysis for manual repair guidance')
  .action((projectPath: string) => scanCommand(projectPath, { ai: true }));

const capsule = new Command('capsule').description('Manage Wish Capsules');
capsule.command('create <path>').description('Create or refresh a Wish Capsule').action((projectPath: string) => capsuleCommand('create', projectPath));
capsule.command('show [path]').description('Show a Wish Capsule').action((projectPath?: string) => capsuleCommand('show', projectPath ?? process.cwd()));
program.addCommand(capsule);

program
  .command('inject [path]')
  .description('Print /genie context for any AI session')
  .action(injectCommand);

program
  .command('start')
  .description('Launch GENIE web dashboard or native desktop widget')
  .option('-p, --port <port>', 'port number', '14747')
  .option('--desktop', 'launch the native floating desktop widget')
  .action(startCommand);

async function main(): Promise<void> {
  if (process.argv.length === 2) {
    printBanner();
    await runInteractiveCommandCenter();
    return;
  }

  const shouldPrintBanner = !process.argv.includes('--json') && process.argv[2] !== 'inject';
  if (shouldPrintBanner) printBanner();

  const args = process.argv.slice(2);
  const commandNeedsAI = ['scan', 'repair', 'manual', 'capsule'].some((command) => args.includes(command));
  const wantsAI = args.includes('--ai') || args.includes('create') || args.includes('manual');

  if (commandNeedsAI && wantsAI) {
    const config = await loadConfig();
    if (!config?.setupComplete) {
      console.log(chalk.magenta('First time using AI features? Let us set up your provider.\n'));
      await setupCommand();
      console.log();
    }
  }

  await program.parseAsync(process.argv);
}

async function runInteractiveCommandCenter(): Promise<void> {
  const { action } = await inquirer.prompt<{ action: string }>([{
    type: 'select',
    name: 'action',
    message: 'GENIE Command Center',
    pageSize: 9,
    choices: [
      { name: 'Start Desktop Widget (genie start --desktop)', value: 'desktop' },
      { name: 'Start Extension Bridge (genie bridge)', value: 'bridge' },
      { name: 'Setup Browser Extension (genie setup-browser)', value: 'browser' },
      { name: 'Scan Project for Issues (genie scan)', value: 'scan' },
      { name: 'Run Autonomous Repair (genie repair)', value: 'repair' },
      { name: 'Manage Wish Capsules (genie capsule)', value: 'capsule' },
      { name: 'Setup BYOK & Provider (genie setup)', value: 'setup' },
      { name: 'Exit', value: 'exit' },
    ],
  } as never]);

  switch (action) {
    case 'desktop':
      await startCommand({ desktop: true });
      return;
    case 'bridge':
      await bridgeCommand({ port: '14747' });
      return;
    case 'browser':
      await setupBrowserCommand();
      return;
    case 'scan':
      await scanCommand(await promptProjectPath(), { ai: true });
      return;
    case 'repair':
      await repairCommand(await promptProjectPath());
      return;
    case 'capsule':
      await runCapsuleMenu();
      return;
    case 'setup':
      await setupCommand();
      return;
    default:
      console.log(chalk.gray('Goodbye.\n'));
  }
}

async function runCapsuleMenu(): Promise<void> {
  const { action } = await inquirer.prompt<{ action: 'create' | 'show' }>([{
    type: 'select',
    name: 'action',
    message: 'Wish Capsules',
    choices: [
      { name: 'Create / refresh capsule', value: 'create' },
      { name: 'Show capsule inject text', value: 'show' },
    ],
  } as never]);

  await capsuleCommand(action, await promptProjectPath());
}

async function promptProjectPath(): Promise<string> {
  const { projectPath } = await inquirer.prompt<{ projectPath: string }>([{
    type: 'input',
    name: 'projectPath',
    message: 'Press Enter to use current directory (.), or type a path:',
    default: '.',
    filter: normalizeTypedPath,
  }]);

  return projectPath;
}

function normalizeTypedPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '.';
  return trimmed.replace(/^["']|["']$/g, '');
}

function printBanner(): void {
  console.log(chalk.magenta('GENIE'));
  console.log(chalk.gray('AI builds software fast. GENIE makes it maintainable.\n'));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
  process.exitCode = 1;
});
