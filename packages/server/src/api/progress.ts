import { Router } from 'express';
import { ScanStore } from '../storage/scan-store';

export function createProgressRouter(store: ScanStore): Router {
  const router = Router();

  router.get('/:scanId', (request, response) => {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    const unsubscribe = store.subscribeProgress(request.params.scanId, (progress) => {
      response.write(`data: ${JSON.stringify(progress)}\n\n`);
      if (progress.phase === 'done') {
        response.end();
        unsubscribe();
      }
    });

    request.on('close', unsubscribe);
  });

  return router;
}
