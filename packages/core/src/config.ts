import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';

export const CONFIG_DIR = path.join(os.homedir(), '.genie');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export const CONFIG_DIR_MODE = 0o700;
export const CONFIG_FILE_MODE = 0o600;

export interface GenieConfig {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey: string;
  setupComplete: boolean;
  setupAt: string;
}

const GenieConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  apiKey: z.string(),
  setupComplete: z.boolean(),
  setupAt: z.string().min(1),
});

export function parseConfig(raw: unknown): GenieConfig {
  return GenieConfigSchema.parse(raw);
}

export async function loadConfig(): Promise<GenieConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    await hardenConfigPermissions();
    return parseConfig(JSON.parse(raw));
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function saveConfig(config: GenieConfig): Promise<void> {
  const validated = parseConfig(config);
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: CONFIG_DIR_MODE });
  await fs.chmod(CONFIG_DIR, CONFIG_DIR_MODE).catch(() => undefined);

  const tmpFile = `${CONFIG_FILE}.${process.pid}.tmp`;
  const data = JSON.stringify(validated, null, 2);

  await fs.writeFile(tmpFile, data, {
    encoding: 'utf-8',
    flag: 'w',
    mode: CONFIG_FILE_MODE,
  });
  await fs.chmod(tmpFile, CONFIG_FILE_MODE).catch(() => undefined);
  await fs.rename(tmpFile, CONFIG_FILE);
  await fs.chmod(CONFIG_FILE, CONFIG_FILE_MODE).catch(() => undefined);
}

export async function requireConfig(): Promise<GenieConfig> {
  const config = await loadConfig();
  if (!config?.setupComplete) {
    throw new Error('GENIE is not configured. Run: genie setup');
  }
  return config;
}

export async function deleteConfig(): Promise<void> {
  await fs.rm(CONFIG_FILE, { force: true });
}

export async function hasConfig(): Promise<boolean> {
  return (await loadConfig()) !== null;
}

async function hardenConfigPermissions(): Promise<void> {
  await fs.chmod(CONFIG_DIR, CONFIG_DIR_MODE).catch(() => undefined);
  await fs.chmod(CONFIG_FILE, CONFIG_FILE_MODE).catch(() => undefined);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
