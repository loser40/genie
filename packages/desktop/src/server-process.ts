import { ChildProcess, spawn, spawnSync } from 'child_process';
import { Socket } from 'net';
import * as path from 'path';

let serverProcess: ChildProcess | null = null;

export async function startServerProcess(): Promise<void> {
  if (serverProcess) return;
  if (await isPortOpen(14747)) {
    process.stdout.write('[GENIE Server] existing process detected on 14747; reusing it.\n');
    return;
  }

  const serverScript = path.join(__dirname, '../../server/dist/index.js');
  serverProcess = spawn(resolveNodeExecutable(), [serverScript], {
    env: { ...process.env, PORT: '14747', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[GENIE Server] ${chunk.toString()}`);
  });
  serverProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[GENIE Server Error] ${chunk.toString()}`);
  });
  serverProcess.on('exit', () => {
    serverProcess = null;
  });
}

export function stopServerProcess(): void {
  forceStopServerProcess();
}

export function forceStopServerProcess(): void {
  const child = serverProcess;
  serverProcess = null;
  if (!child || !child.pid) return;

  try {
    process.kill(child.pid, 'SIGTERM');
  } catch {
    // The process may already be gone.
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(child.pid, 'SIGKILL');
  } catch {
    // The process may already be gone.
  }
}

function resolveNodeExecutable(): string {
  if (process.env.GENIE_NODE_EXEC_PATH) return process.env.GENIE_NODE_EXEC_PATH;
  if (!process.execPath.toLowerCase().endsWith('electron.exe')) return process.execPath;
  return 'node';
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
