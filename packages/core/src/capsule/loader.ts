import * as path from 'path';
import * as fs from 'fs/promises';
import { WishCapsule } from './types';
import { getActiveCapsuleMarkerPath, getCapsulePath } from './creator';

export async function loadCapsule(projectPath: string): Promise<WishCapsule | null> {
  const exactPath = getCapsulePath(projectPath);
  const exact = await readCapsule(exactPath);
  if (exact) return exact;

  const capsuleDir = path.join(path.resolve(projectPath), '.genie');
  const entries = await fs.readdir(capsuleDir).catch(() => []);
  const capsuleFile = entries.find((entry) => entry.endsWith('.capsule.json'));
  return capsuleFile ? readCapsule(path.join(capsuleDir, capsuleFile)) : null;
}

export async function loadActiveCapsule(): Promise<WishCapsule | null> {
  try {
    const raw = await fs.readFile(getActiveCapsuleMarkerPath(), 'utf-8');
    const marker = JSON.parse(stripBom(raw)) as { projectPath?: unknown; capsulePath?: unknown };
    if (typeof marker.capsulePath === 'string' && marker.capsulePath.trim()) {
      const exact = await readCapsule(marker.capsulePath);
      if (exact) return exact;
    }
    if (typeof marker.projectPath === 'string' && marker.projectPath.trim()) {
      return loadCapsule(marker.projectPath);
    }
  } catch {
    return null;
  }

  return null;
}

export async function getInjectText(projectPath: string): Promise<string> {
  const capsule = await loadCapsule(projectPath);
  return capsule?.injectText ?? '# /genie: No capsule found. Run: genie capsule create <path>';
}

async function readCapsule(capsulePath: string): Promise<WishCapsule | null> {
  try {
    const raw = await fs.readFile(capsulePath, 'utf-8');
    return JSON.parse(stripBom(raw)) as WishCapsule;
  } catch {
    return null;
  }
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}
