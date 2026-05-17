import { Router } from 'express';
import { applyAutonomousRepair } from '@genie-ai/core';

interface RepairApplyBody {
  projectPath?: unknown;
  path?: unknown;
  allowFallback?: unknown;
}

export function createRepairRouter(): Router {
  const router = Router();

  router.post('/apply', async (request, response) => {
    try {
      const body = request.body as RepairApplyBody;
      const projectPath = readPath(body.projectPath) || readPath(body.path);
      if (!projectPath) {
        response.status(400).json({ error: 'Provide projectPath.' });
        return;
      }

      const result = await applyAutonomousRepair({
        projectPath,
        allowFallback: readBoolean(body.allowFallback, true),
      });

      response.status(result.success || result.handoffMode ? 200 : 422).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.status(500).json({ error: message });
    }
  });

  return router;
}

function readPath(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/^["']|["']$/g, '') : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}
