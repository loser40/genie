import chalk from 'chalk';
import { exec } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setupBrowserCommand(): Promise<void> {
  const extensionDir = path.resolve(__dirname, '../../../extension/dist');
  if (!existsSync(extensionDir)) {
    throw new Error('Compiled extension folder not found. Run: pnpm --filter @genie-ai/extension build');
  }

  openChromeExtensionsPage();
  openExtensionFolder(extensionDir);

  console.log(chalk.green('✔ Chrome Extensions page opened.'));
  console.log(chalk.green('✔ Extension folder opened.'));
  console.log(chalk.bold('👉 Step 1: Turn on \'Developer Mode\' in the top right of Chrome.'));
  console.log(chalk.bold('👉 Step 2: Drag and drop the opened folder directly into the Chrome window.'));
  console.log(chalk.gray('\nRun genie bridge in another terminal so the extension can read live Capsules.\n'));
}

function openChromeExtensionsPage(): void {
  if (process.platform === 'win32') {
    exec('start chrome "chrome://extensions/"', { windowsHide: true });
    return;
  }

  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${command} "chrome://extensions/"`);
}

function openExtensionFolder(extensionDir: string): void {
  if (process.platform === 'win32') {
    exec(`explorer "${escapeForWindowsCommand(extensionDir)}"`, { windowsHide: true });
    return;
  }

  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${command} "${extensionDir.replace(/"/g, '\\"')}"`);
}

function escapeForWindowsCommand(value: string): string {
  return value.replace(/"/g, '""');
}
