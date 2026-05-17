import chalk from 'chalk';
import { Socket } from 'net';
import { startHeadlessBridgeServer } from '../server.js';

export async function bridgeCommand(options: { port?: string }): Promise<void> {
  const port = Number.parseInt(options.port ?? '14747', 10);
  if (await isGenieBridgeHealthy(port)) {
    console.log(chalk.green(`\nGENIE extension bridge is already running at http://127.0.0.1:${port}/bridge/health\n`));
    return;
  }
  if (await isPortOpen(port)) {
    throw new Error(`Port ${port} is already in use by another process. Stop it or run: genie bridge --port <free-port>`);
  }

  startHeadlessBridgeServer(port);

  console.log(chalk.green(`\nGENIE headless bridge running at http://127.0.0.1:${port}/bridge/health`));
  console.log(chalk.gray('Endpoints: /bridge/health, /bridge/capsule, /bridge/memory\n'));
}

async function isGenieBridgeHealthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/bridge/health`);
    if (!response.ok) return false;
    const payload = await response.json() as { service?: string };
    return payload.service === 'genie-extension-bridge';
  } catch {
    return false;
  }
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}
