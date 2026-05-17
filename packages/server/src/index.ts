import express, { Express } from 'express';
import cors from 'cors';
import { Server } from 'http';
import * as path from 'path';
import { ScanStore } from './storage/scan-store';
import { createBridgeRouter } from './api/bridge';
import { createCapsuleRouter } from './api/capsule';
import { createGraphRouter } from './api/graph';
import { createProgressRouter } from './api/progress';
import { createRepairRouter } from './api/repair';
import { createScanRouter } from './api/scan';

export interface StartServerOptions {
  port?: number;
  host?: string;
  webDir?: string;
  bridgeOnly?: boolean;
  silent?: boolean;
}

export interface GenieServer {
  app: Express;
  store: ScanStore;
  listen(): Server;
}

export function createServer(options: StartServerOptions = {}): GenieServer {
  const app = express();
  const store = new ScanStore();
  const port = options.port ?? 14747;
  const host = options.host ?? '127.0.0.1';
  const bridgeOnly = options.bridgeOnly ?? false;
  const silent = options.silent ?? false;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.use('/bridge', createBridgeRouter());
  app.use('/api/repair', createRepairRouter());

  if (!bridgeOnly) {
    app.get('/health', (_request, response) => {
      response.json({ ok: true, service: 'genie-server' });
    });

    app.use('/api/scan', createScanRouter(store));
    app.use('/api/progress', createProgressRouter(store));
    app.use('/api/graph', createGraphRouter(store));
    app.use('/api/capsule', createCapsuleRouter(store));

    const webDir = options.webDir ?? path.join(__dirname, '../../web/dist');
    app.use(express.static(webDir));
    app.get('*', (_request, response) => {
      response.sendFile(path.join(webDir, 'index.html'));
    });
  }

  return {
    app,
    store,
    listen() {
      const httpServer = app.listen(port, host, () => {
        if (!silent) {
          const label = bridgeOnly ? 'GENIE bridge' : 'GENIE dashboard';
          process.stdout.write(`${label} -> http://${host}:${port}${bridgeOnly ? '/bridge/health' : ''}\n`);
        }
      });
      httpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          process.stderr.write(`GENIE server port ${port} is already in use. Reuse the running server or choose another port.\n`);
          process.exitCode = 1;
          return;
        }
        process.stderr.write(`GENIE server failed: ${error.message}\n`);
        process.exitCode = 1;
      });
      return httpServer;
    },
  };
}

export function startServer(options: StartServerOptions = {}): void {
  createServer(options).listen();
}

if (require.main === module) {
  startServer({
    port: Number(process.env.PORT ?? 14747),
    host: process.env.HOST ?? '127.0.0.1',
  });
}
