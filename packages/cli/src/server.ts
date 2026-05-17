import { Server } from 'http';
import { createServer } from '@genie-ai/server';

export function startHeadlessBridgeServer(port = 14747): Server {
  return createServer({
    port,
    host: '127.0.0.1',
    bridgeOnly: true,
    silent: true,
  }).listen();
}
