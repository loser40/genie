import { Router } from 'express';
import { getInjectText } from '@genie-ai/core';
import { ScanStore } from '../storage/scan-store';

export function createCapsuleRouter(store: ScanStore): Router {
  const router = Router();

  router.get('/:id', (request, response) => {
    const scan = store.getScan(request.params.id);
    if (!scan) {
      response.status(404).json({ error: 'Scan not found' });
      return;
    }
    if (scan.error) {
      response.status(500).json({ error: scan.error });
      return;
    }
    if (!scan.result) {
      response.status(202).json({ status: scan.status, progress: scan.progress });
      return;
    }

    response.json(scan.result.capsule ?? null);
  });

  router.get('/:id/inject', async (request, response) => {
    const scan = store.getScan(request.params.id);
    if (!scan?.result) {
      response.status(404).json({ error: 'Scan result not found' });
      return;
    }

    response.type('text/plain').send(await getInjectText(scan.result.projectPath));
  });

  return router;
}
