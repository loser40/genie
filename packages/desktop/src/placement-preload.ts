import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('placement', {
  place: () => ipcRenderer.send('place-lamp-from-overlay'),
  cancel: () => ipcRenderer.send('cancel-lamp-placement'),
});

declare global {
  interface Window {
    placement: {
      place: () => void;
      cancel: () => void;
    };
  }
}
