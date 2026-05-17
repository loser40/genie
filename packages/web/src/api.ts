import { GraphData, ScanResult } from './types';

export async function startScan(input: { projectPath?: string; zip?: File; skipAI?: boolean }): Promise<{ scanId: string; status: string }> {
  const hasZip = Boolean(input.zip);
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: hasZip ? undefined : { 'Content-Type': 'application/json' },
    body: hasZip ? buildScanForm(input) : JSON.stringify({ projectPath: input.projectPath, skipAI: input.skipAI ?? false }),
  });
  return readJson(response);
}

export async function fetchScan(scanId: string): Promise<ScanResult> {
  return readJson(await fetch(`/api/scan/${scanId}`));
}

export async function fetchGraph(scanId: string): Promise<GraphData> {
  return readJson(await fetch(`/api/graph/${scanId}`));
}

export async function fetchCapsule(scanId: string): Promise<unknown> {
  return readJson(await fetch(`/api/capsule/${scanId}`));
}

function buildScanForm(input: { projectPath?: string; zip?: File; skipAI?: boolean }): FormData {
  const form = new FormData();
  if (input.zip) form.set('zip', input.zip);
  if (input.projectPath) form.set('path', input.projectPath);
  form.set('skipAI', String(input.skipAI ?? false));
  return form;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || response.statusText);
  }
  return response.json() as Promise<T>;
}
