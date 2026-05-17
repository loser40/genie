import { Router } from 'express';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { getActiveCapsuleMarkerPath, getCapsulePath, loadActiveCapsule, loadCapsule } from '@genie-ai/core';

interface BridgeQuery {
  path?: string;
}

interface MemoryExchange {
  user: string;
  ai: string;
  platform?: string;
  sourceUrl?: string;
  capturedAt?: string;
}

interface MemoryPayload {
  exchanges?: unknown;
  replace?: unknown;
  platform?: unknown;
  sourceUrl?: unknown;
}

interface MemoryStoreFile {
  version: 1;
  updatedAt: string;
  exchanges: MemoryExchange[];
}

const memoryFilePath = process.env.GENIE_MEMORY_FILE || path.join(os.homedir(), '.genie', 'chat-memory.json');

export function createBridgeRouter(): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    response.json({
      ok: true,
      service: 'genie-extension-bridge',
      capsuleRequired: true,
    });
  });

  router.get('/capsule', async (request, response) => {
    const projectPath = readProjectPath(request.query);
    if (!projectPath) {
      const activeCapsule = await loadActiveCapsule();
      if (!activeCapsule) {
        response.status(404).json({
          error: 'No active capsule found. Run genie capsule create <path> or pass ?path=<absolute project path>.',
          capsule: null,
        });
        return;
      }

      response.json({
        capsule: activeCapsule,
        generatedAt: new Date().toISOString(),
        active: true,
      });
      return;
    }

    const capsule = await loadCapsule(projectPath);
    if (!capsule) {
      response.status(404).json({
        error: 'No capsule found for this project. Run genie capsule create <path> first.',
        projectPath,
      });
      return;
    }

    response.json({
      capsule,
      generatedAt: new Date().toISOString(),
    });
  });

  router.delete('/capsule', async (_request, response) => {
    await clearActiveCapsule();
    response.json({
      ok: true,
      capsule: null,
      clearedAt: new Date().toISOString(),
    });
  });

  router.get('/memory', async (_request, response) => {
    const store = await readMemoryStore();
    response.json({
      exchanges: store.exchanges,
      count: store.exchanges.length,
      updatedAt: store.updatedAt,
    });
  });

  router.post('/memory', async (request, response) => {
    const payload = request.body as MemoryPayload | MemoryExchange[] | unknown;
    const incoming = normalizeMemoryExchanges(payload);
    if (incoming.length === 0) {
      response.status(400).json({ error: 'No valid memory exchanges were provided.' });
      return;
    }

    // MEMORY FIX: Strict OVERWRITE — incoming exchanges completely replace old ones.
    // This prevents the append-based memory leak that caused ghost data across sessions.
    const nextStore: MemoryStoreFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      exchanges: incoming,
    };

    await writeMemoryStore(nextStore);
    response.json({
      ok: true,
      saved: incoming.length,
      total: nextStore.exchanges.length,
      updatedAt: nextStore.updatedAt,
    });
  });

  router.delete('/memory', async (_request, response) => {
    const emptyStore = createEmptyMemoryStore();
    emptyStore.updatedAt = new Date().toISOString();
    await writeMemoryStore(emptyStore);
    response.json({
      ok: true,
      cleared: true,
      updatedAt: emptyStore.updatedAt,
    });
  });

  return router;
}

async function clearActiveCapsule(): Promise<void> {
  const activeCapsule = await loadActiveCapsule();
  if (activeCapsule) {
    const capsuleDir = path.join(path.resolve(activeCapsule.projectPath), '.genie');
    const exactCapsulePath = getCapsulePath(activeCapsule.projectPath, activeCapsule.projectName);
    await fs.rm(exactCapsulePath, { force: true });

    const entries = await fs.readdir(capsuleDir).catch(() => []);
    await Promise.all(entries
      .filter((entry) => entry.endsWith('.capsule.json'))
      .map((entry) => fs.rm(path.join(capsuleDir, entry), { force: true })));
  }

  await fs.rm(getActiveCapsuleMarkerPath(), { force: true });
}

function readProjectPath(query: BridgeQuery): string | null {
  const value = query.path;
  return typeof value === 'string' && value.trim() ? value : null;
}

async function readMemoryStore(): Promise<MemoryStoreFile> {
  try {
    const raw = await fs.readFile(memoryFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MemoryStoreFile>;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      exchanges: Array.isArray(parsed.exchanges)
        ? parsed.exchanges
          .map((exchange) => normalizeMemoryExchange(exchange))
          .filter((exchange): exchange is MemoryExchange => exchange !== null)
        : [],
    };
  } catch {
    return createEmptyMemoryStore();
  }
}

async function writeMemoryStore(store: MemoryStoreFile): Promise<void> {
  await fs.mkdir(path.dirname(memoryFilePath), { recursive: true });
  await fs.writeFile(memoryFilePath, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function createEmptyMemoryStore(): MemoryStoreFile {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    exchanges: [],
  };
}

function normalizeMemoryExchanges(payload: unknown): MemoryExchange[] {
  const envelope = isRecord(payload) ? payload as MemoryPayload : null;
  const source = Array.isArray(payload) ? payload : envelope?.exchanges;
  const platform = readOptionalString(envelope?.platform);
  const sourceUrl = readOptionalString(envelope?.sourceUrl);
  if (!Array.isArray(source)) return [];

  return source
    .map((item) => normalizeMemoryExchange(item, platform, sourceUrl))
    .filter((item): item is MemoryExchange => item !== null);
}

function normalizeMemoryExchange(item: unknown, fallbackPlatform?: string, fallbackSourceUrl?: string): MemoryExchange | null {
  if (!isRecord(item)) return null;
  const user = readOptionalString(item.user) || readOptionalString(item.User);
  const ai = readOptionalString(item.ai) || readOptionalString(item.assistant) || readOptionalString(item.AI);
  if (!user || !ai) return null;

  return {
    user,
    ai,
    platform: readOptionalString(item.platform) || fallbackPlatform,
    sourceUrl: readOptionalString(item.sourceUrl) || fallbackSourceUrl,
    capturedAt: readOptionalString(item.capturedAt) || new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? collapseWhitespace(value) : undefined;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
