import { ScanProgress, ScanResult } from '@genie-ai/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type ScanStatus = 'running' | 'done' | 'error';
export type ProgressListener = (progress: ScanProgress) => void;

export interface StoredScan {
  id: string;
  status: ScanStatus;
  result?: ScanResult;
  error?: string;
  progress: ScanProgress;
  startedAt: string;
  updatedAt: string;
}

export class ScanStore {
  private readonly scans = new Map<string, StoredScan>();
  private readonly listeners = new Map<string, Set<ProgressListener>>();
  private readonly storePath: string;

  constructor(storePath = path.join(os.homedir(), '.genie', 'scan-store.json')) {
    this.storePath = storePath;
    this.loadFromDisk();
  }

  startScan(id: string): StoredScan {
    const now = new Date().toISOString();
    const scan: StoredScan = {
      id,
      status: 'running',
      progress: { phase: 'walking', message: 'Starting...', percent: 0 },
      startedAt: now,
      updatedAt: now,
    };
    this.scans.set(id, scan);
    this.listeners.set(id, new Set());
    this.persistToDisk();
    return scan;
  }

  updateProgress(id: string, progress: ScanProgress): void {
    const scan = this.scans.get(id);
    if (!scan) return;

    scan.progress = progress;
    scan.updatedAt = new Date().toISOString();
    this.listeners.get(id)?.forEach((listener) => listener(progress));
  }

  setScanResult(id: string, result: ScanResult): void {
    const scan = this.scans.get(id);
    if (!scan) return;

    scan.result = result;
    scan.status = 'done';
    scan.updatedAt = new Date().toISOString();
    this.updateProgress(id, { phase: 'done', message: 'Complete', percent: 100 });
    this.persistToDisk();
  }

  setScanError(id: string, error: string): void {
    const scan = this.scans.get(id);
    if (!scan) return;

    scan.error = error;
    scan.status = 'error';
    scan.updatedAt = new Date().toISOString();
    this.updateProgress(id, { phase: 'done', message: `Failed: ${error}`, percent: 100 });
    this.persistToDisk();
  }

  getScan(id: string): StoredScan | null {
    return this.scans.get(id) ?? null;
  }

  getScanResult(id: string): ScanResult | null {
    return this.scans.get(id)?.result ?? null;
  }

  getProgress(id: string): ScanProgress | null {
    return this.scans.get(id)?.progress ?? null;
  }

  subscribeProgress(id: string, listener: ProgressListener): () => void {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)?.add(listener);

    const currentProgress = this.getProgress(id);
    if (currentProgress) listener(currentProgress);

    return () => {
      this.listeners.get(id)?.delete(listener);
    };
  }

  private loadFromDisk(): void {
    try {
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as SerializedStoredScan[];
      for (const scan of parsed) {
        const restored = restoreScan(scan);
        this.scans.set(restored.id, restored);
        this.listeners.set(restored.id, new Set());
      }
    } catch {
      // Missing or corrupt persisted scans should not stop the live server.
    }
  }

  private persistToDisk(): void {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      const scans = [...this.scans.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 50)
        .map(serializeScan);
      fs.writeFileSync(this.storePath, JSON.stringify(scans, null, 2), 'utf-8');
    } catch {
      // Persistence is best-effort; API responses still come from live memory.
    }
  }
}

interface SerializedStoredScan extends Omit<StoredScan, 'result'> {
  result?: SerializedScanResult;
}

interface SerializedScanResult extends Omit<ScanResult, 'deps'> {
  deps: Omit<ScanResult['deps'], 'dependencies'> & {
    dependencies: Array<[string, ScanResult['deps']['dependencies'] extends Map<string, infer Value> ? Value : never]>;
  };
}

function serializeScan(scan: StoredScan): SerializedStoredScan {
  return {
    ...scan,
    result: scan.result ? {
      ...scan.result,
      deps: {
        ...scan.result.deps,
        dependencies: [...scan.result.deps.dependencies.entries()],
      },
    } : undefined,
  };
}

function restoreScan(scan: SerializedStoredScan): StoredScan {
  return {
    ...scan,
    status: scan.status === 'running' ? 'error' : scan.status,
    error: scan.status === 'running' ? 'Interrupted by server restart.' : scan.error,
    result: scan.result ? {
      ...scan.result,
      deps: {
        ...scan.result.deps,
        dependencies: new Map(scan.result.deps.dependencies),
      },
    } : undefined,
  };
}
