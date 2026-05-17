import chalk from 'chalk';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import open from 'open';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from '@genie-ai/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startCommand(options: { port?: string; desktop?: boolean }): Promise<void> {
  if (options.desktop) {
    launchDesktop();
    return;
  }

  const port = Number.parseInt(options.port ?? '14747', 10);
  const webDir = path.resolve(__dirname, '../../../web/dist');
  const server = createServer({ port, webDir });
  server.listen();

  const url = `http://127.0.0.1:${port}`;
  console.log(chalk.bold.magenta(`\nGENIE running at ${url}\n`));
  await open(url);
}

function launchDesktop(): void {
  const workspaceRoot = path.resolve(__dirname, '../../../..');
  const desktopDir = path.join(workspaceRoot, 'packages', 'desktop');
  const mainScript = path.join(desktopDir, 'dist', 'main.js');
  const electronBin = process.platform === 'win32'
    ? path.join(workspaceRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(workspaceRoot, 'node_modules', '.bin', 'electron');

  if (!existsSync(mainScript)) {
    throw new Error('Desktop build not found. Run pnpm --filter @genie-ai/desktop build first.');
  }

  if (!existsSync(electronBin)) {
    throw new Error('Electron binary not found. Run pnpm install --ignore-scripts, then node node_modules/electron/install.js.');
  }

  const child = spawn(electronBin, [mainScript], {
    cwd: desktopDir,
    detached: true,
    env: { ...process.env, GENIE_NODE_EXEC_PATH: process.execPath },
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();
  console.log(chalk.bold.magenta('GENIE desktop widget launched.'));
}
