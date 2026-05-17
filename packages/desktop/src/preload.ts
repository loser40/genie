import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('genie', {
  setInteractive: (value: boolean) => ipcRenderer.send('set-interactive', value),
  setHitRegions: (regions: Array<{ x: number; y: number; width: number; height: number }>) => {
    ipcRenderer.send('set-hit-regions', regions);
  },
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  quitApp: () => ipcRenderer.send('quit-app'),
  getFilePath: (file: File) => webUtils.getPathForFile(file),

  scanProject: (projectPath: string) => ipcRenderer.invoke('genie:scan', projectPath),
  scanZip: (zipPath: string) => ipcRenderer.invoke('genie:scan-zip', zipPath),
  getInjectText: (projectPath: string) => ipcRenderer.invoke('genie:inject', projectPath),
  createCapsule: (projectPath: string) => ipcRenderer.invoke('genie:capsule', projectPath),
  askGenie: (question: string) => ipcRenderer.invoke('genie:ask', question),
  openFolder: () => ipcRenderer.invoke('genie:open-folder'),

  onScanProgress: (callback: (data: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('scan:progress', listener);
    return () => ipcRenderer.removeListener('scan:progress', listener);
  },
  onScanDone: (callback: (data: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('scan:done', listener);
    return () => ipcRenderer.removeListener('scan:done', listener);
  },
  onScanError: (callback: (data: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('scan:error', listener);
    return () => ipcRenderer.removeListener('scan:error', listener);
  },
});

declare global {
  interface Window {
    genie: {
      setInteractive: (value: boolean) => void;
      setHitRegions: (regions: Array<{ x: number; y: number; width: number; height: number }>) => void;
      getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
      quitApp: () => void;
      getFilePath: (file: File) => string;
      scanProject: (projectPath: string) => Promise<unknown>;
      scanZip: (zipPath: string) => Promise<unknown>;
      getInjectText: (projectPath: string) => Promise<string>;
      createCapsule: (projectPath: string) => Promise<unknown>;
      askGenie: (question: string) => Promise<string>;
      openFolder: () => Promise<string | null>;
      onScanProgress: (callback: (data: unknown) => void) => () => void;
      onScanDone: (callback: (data: unknown) => void) => () => void;
      onScanError: (callback: (data: unknown) => void) => () => void;
    };
  }
}
