import { BrowserWindow, dialog, ipcMain } from 'electron';
import AdmZip from 'adm-zip';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { callAI, getInjectText, requireConfig, scanProject } from '@genie-ai/core';

export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle('genie:scan', async (_event, projectPath: string) => runScan(win, projectPath));

  ipcMain.handle('genie:scan-zip', async (_event, zipPath: string) => {
    const destination = path.join(os.tmpdir(), `genie_drop_${Date.now()}`);
    await fs.mkdir(destination, { recursive: true });
    new AdmZip(zipPath).extractAllTo(destination, true);
    return runScan(win, destination);
  });

  ipcMain.handle('genie:inject', async (_event, projectPath: string) => getInjectText(projectPath));

  ipcMain.handle('genie:capsule', async (_event, projectPath: string) => {
    const result = await scanProject({ projectPath, skipAI: false }, (progress) => win.webContents.send('scan:progress', progress));
    return { success: true, capsule: result.capsule };
  });

  ipcMain.handle('genie:ask', async (_event, question: string) => {
    try {
      const config = await requireConfig();
      return callAI([
        'You are GENIE, a concise desktop code-maintenance companion.',
        'Answer practically about code architecture, scanning, maintainability, and repair.',
        `Developer question: ${question}`,
      ].join('\n\n'), config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `GENIE: ${message}`;
    }
  });

  ipcMain.handle('genie:open-folder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select project folder to scan',
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}

async function runScan(win: BrowserWindow, projectPath: string): Promise<unknown> {
  try {
    const result = await scanProject({ projectPath, skipAI: false }, (progress) => {
      win.webContents.send('scan:progress', progress);
    });
    const summary = {
      healthScore: result.graph.healthScore,
      filesScanned: result.filesScanned,
      issueCount: result.duplicates.length + result.deps.circularChains.length,
      projectName: result.projectName,
      capsule: Boolean(result.capsule),
      projectPath: result.projectPath,
      circularChains: result.deps.circularChains.length,
      duplicateGroups: result.duplicates.length,
    };
    win.webContents.send('scan:done', summary);
    return { success: true, result, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    win.webContents.send('scan:error', { message });
    return { success: false, error: message };
  }
}
