import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { scanProject } from '@genie-ai/core';
import { ScanStore } from '../storage/scan-store';

interface ScanRequestBody {
  path?: string;
  projectPath?: string;
  skipAI?: boolean | string;
  skipCapsule?: boolean | string;
}

export function createScanRouter(store: ScanStore): Router {
  const router = Router();
  const upload = multer({ dest: os.tmpdir() });

  router.post('/', upload.single('zip'), async (request, response) => {
    try {
      const body = request.body as ScanRequestBody;
      let projectPath = body.projectPath ?? body.path;

      if (!projectPath && request.file) {
        projectPath = await extractZip(request.file.path);
      }

      if (!projectPath) {
        response.status(400).json({ error: 'Provide projectPath, path, or a zip file.' });
        return;
      }

      const scanId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const skipAI = parseBoolean(body.skipAI, false);
      const skipCapsule = parseBoolean(body.skipCapsule, false);

      store.startScan(scanId);
      response.json({ scanId, status: 'started' });

      scanProject({ projectPath, skipAI, skipCapsule }, (progress) => store.updateProgress(scanId, progress))
        .then((result) => store.setScanResult(scanId, result))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          store.setScanError(scanId, message);
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ error: message });
    }
  });

  router.get('/:id/status', (request, response) => {
    const scan = store.getScan(request.params.id);
    if (!scan) {
      response.status(404).json({ error: 'Scan not found' });
      return;
    }

    response.json({
      id: scan.id,
      status: scan.status,
      progress: scan.progress,
      error: scan.error,
      hasResult: Boolean(scan.result),
      startedAt: scan.startedAt,
      updatedAt: scan.updatedAt,
    });
  });

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

    response.json(scan.result);
  });

  return router;
}

async function extractZip(zipPath: string): Promise<string> {
  const destination = path.join(os.tmpdir(), `genie_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(destination, { recursive: true });
  new AdmZip(zipPath).extractAllTo(destination, true);
  await fs.rm(zipPath, { force: true }).catch(() => undefined);
  return destination;
}

function parseBoolean(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}
