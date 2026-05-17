import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { forceStopServerProcess, startServerProcess } from './server-process';
import { setupTray } from './tray';

let widgetWindow: BrowserWindow | null = null;
let placementOverlay: BrowserWindow | null = null;
let isQuitting = false;
let forceInteractive = false;
let ignoringMouseEvents = false;
let hitRegionTimer: NodeJS.Timeout | null = null;
let placeRequestWatcher: fs.FSWatcher | null = null;
let placeRequestDebounce: NodeJS.Timeout | null = null;
type HitRegion = { x: number; y: number; width: number; height: number };

let hitRegions: HitRegion[] = [
  { x: 126, y: 300, width: 234, height: 220 },
  { x: 180, y: 230, width: 130, height: 190 },
];

const WIDGET_WIDTH = 360;
const WIDGET_HEIGHT = 520;
const PLACE_REQUEST_FILE = 'genie-place-lamp.request';

function debugLog(message: string): void {
  if (process.env.GENIE_DEBUG_LIFECYCLE !== '1') return;
  fs.appendFileSync(path.join(process.cwd(), 'debug-lifecycle.log'), `${new Date().toISOString()} ${message}\n`);
}

function getWidgetBounds(): Electron.Rectangle {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;

  return {
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    x: x + width - WIDGET_WIDTH,
    y: y + height - WIDGET_HEIGHT,
  };
}

function createWidgetWindow(): BrowserWindow {
  const bounds = getWidgetBounds();

  widgetWindow = new BrowserWindow({
    ...bounds,
    title: 'GENIE Desktop',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    focusable: true,
    show: false,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false,
      backgroundThrottling: true,
      sandbox: false,
    },
  });

  widgetWindow.setBackgroundColor('#00000000');
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  registerWidgetContextMenu(widgetWindow);
  widgetWindow.loadFile(path.join(__dirname, '../renderer-dist/index.html'));

  const showWidget = (): void => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    widgetWindow.setBounds(getWidgetBounds(), false);
    debugLog(`showWidget bounds=${JSON.stringify(widgetWindow.getBounds())}`);
    widgetWindow.showInactive();
    widgetWindow.moveTop();
    widgetWindow.setAlwaysOnTop(true, 'screen-saver');
    applyWindowShape();
    if (supportsWindowShape()) {
      setMousePassthrough(false);
    } else {
      setMousePassthrough(true);
      startHitRegionPolling();
    }
  };

  widgetWindow.once('ready-to-show', showWidget);
  widgetWindow.webContents.once('did-finish-load', () => {
    debugLog('did-finish-load');
    setTimeout(showWidget, 50);
    if (process.env.GENIE_DEBUG_CAPTURE === '1') {
      setTimeout(async () => {
        if (!widgetWindow || widgetWindow.isDestroyed()) return;
        const capture = await widgetWindow.webContents.capturePage();
        fs.writeFileSync(path.join(process.cwd(), 'debug-widget-render.png'), capture.toPNG());
      }, 1200);
    }
  });

  widgetWindow.on('close', (event) => {
    debugLog(`window close isQuitting=${isQuitting}`);
    if (!isQuitting) {
      event.preventDefault();
      widgetWindow?.hide();
    }
  });

  return widgetWindow;
}

function startHitRegionPolling(): void {
  if (hitRegionTimer) return;
  hitRegionTimer = setInterval(updateMousePassthrough, 45);
  hitRegionTimer.unref();
  updateMousePassthrough();
}

function supportsWindowShape(): boolean {
  return Boolean(widgetWindow && typeof widgetWindow.setShape === 'function');
}

function applyWindowShape(): void {
  if (!widgetWindow || widgetWindow.isDestroyed() || !supportsWindowShape()) return;
  widgetWindow.setShape(hitRegions.map((region) => ({
    x: Math.round(region.x),
    y: Math.round(region.y),
    width: Math.round(region.width),
    height: Math.round(region.height),
  })));
}

function updateMousePassthrough(): void {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  if (supportsWindowShape()) {
    setMousePassthrough(false);
    return;
  }
  setMousePassthrough(!forceInteractive && !isCursorInHitRegion());
}

function setMousePassthrough(ignore: boolean): void {
  if (!widgetWindow || widgetWindow.isDestroyed() || ignoringMouseEvents === ignore) return;
  ignoringMouseEvents = ignore;
  widgetWindow.setIgnoreMouseEvents(ignore, { forward: true });
}

function isCursorInHitRegion(): boolean {
  if (!widgetWindow || widgetWindow.isDestroyed()) return false;
  const cursor = screen.getCursorScreenPoint();
  const bounds = widgetWindow.getBounds();
  const x = cursor.x - bounds.x;
  const y = cursor.y - bounds.y;

  return hitRegions.some((region) => (
    x >= region.x
    && x <= region.x + region.width
    && y >= region.y
    && y <= region.y + region.height
  ));
}

function registerWidgetContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      {
        label: 'Place Lamp at Cursor',
        click: () => beginPlacementMode(win),
      },
      {
        label: 'Reset Position',
        click: () => win.setBounds(getWidgetBounds(), false),
      },
      { type: 'separator' },
      {
        label: 'Hide GENIE',
        click: () => win.hide(),
      },
    ]).popup({ window: win });
  });
}

function beginPlacementMode(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (placementOverlay && !placementOverlay.isDestroyed()) {
    placementOverlay.focus();
    return;
  }

  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  placementOverlay = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000001',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'placement-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  placementOverlay.setAlwaysOnTop(true, 'screen-saver');
  placementOverlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getPlacementOverlayHtml())}`);
  placementOverlay.once('ready-to-show', () => {
    placementOverlay?.show();
    placementOverlay?.focus();
  });
  placementOverlay.on('closed', () => {
    placementOverlay = null;
  });
}

function getPlacementOverlayHtml(): string {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          html, body {
            background: rgba(0, 0, 0, 0.01);
            cursor: crosshair;
            height: 100%;
            margin: 0;
            overflow: hidden;
            width: 100%;
          }
          .hint {
            background: rgba(12, 8, 28, 0.84);
            border: 1px solid rgba(167, 139, 250, 0.42);
            border-radius: 10px;
            color: #e9d5ff;
            font: 12px Consolas, monospace;
            left: 50%;
            padding: 9px 12px;
            position: fixed;
            top: 18px;
            transform: translateX(-50%);
          }
        </style>
      </head>
      <body>
        <div class="hint">Click anywhere to place GENIE. Right-click or Esc cancels.</div>
        <script>
          document.addEventListener('mousedown', (event) => {
            event.preventDefault();
            if (event.button === 0) window.placement.place();
            else window.placement.cancel();
          });
          document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') window.placement.cancel();
          });
        </script>
      </body>
    </html>
  `;
}

function placeWindowAtCursor(win: BrowserWindow, point = screen.getCursorScreenPoint()): void {
  if (win.isDestroyed()) return;
  const bounds = win.getBounds();
  const clamped = clampToWorkArea({
    ...bounds,
    x: Math.round(point.x),
    y: Math.round(point.y),
  });

  win.setPosition(clamped.x, clamped.y);
  win.show();
  win.moveTop();
}

function cancelPlacementMode(): void {
  if (!placementOverlay || placementOverlay.isDestroyed()) return;
  placementOverlay.close();
}

function completePlacementMode(): void {
  const targetPoint = screen.getCursorScreenPoint();
  cancelPlacementMode();
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    placeWindowAtCursor(widgetWindow, targetPoint);
  }
}

function startPlaceRequestWatcher(win: BrowserWindow): void {
  const requestFile = getPlaceRequestFile();
  fs.mkdirSync(path.dirname(requestFile), { recursive: true });
  fs.closeSync(fs.openSync(requestFile, 'a'));

  placeRequestWatcher?.close();
  placeRequestWatcher = fs.watch(path.dirname(requestFile), { persistent: false }, (_event, filename) => {
    if (filename?.toString() !== path.basename(requestFile)) return;
    if (placeRequestDebounce) clearTimeout(placeRequestDebounce);
    placeRequestDebounce = setTimeout(() => {
      placeWindowAtCursor(win);
    }, 180);
    placeRequestDebounce.unref();
  });
}

function stopPlaceRequestWatcher(): void {
  if (placeRequestDebounce) {
    clearTimeout(placeRequestDebounce);
    placeRequestDebounce = null;
  }
  if (!placeRequestWatcher) return;
  placeRequestWatcher.close();
  placeRequestWatcher = null;
}

function getPlaceRequestFile(): string {
  return path.join(app.getPath('temp'), PLACE_REQUEST_FILE);
}

app.whenReady().then(async () => {
  debugLog('app ready');
  await startServerProcess();
  const win = createWidgetWindow();
  setupTray(win, () => beginPlacementMode(win));
  startPlaceRequestWatcher(win);
  registerIpcHandlers(win);

  app.on('activate', () => {
    if (!win.isVisible()) win.show();
  });
});

app.on('before-quit', () => {
  debugLog('before-quit');
  isQuitting = true;
  stopHitRegionPolling();
  stopPlaceRequestWatcher();
  cancelPlacementMode();
  forceStopServerProcess();
});

app.on('window-all-closed', () => {
  debugLog('window-all-closed');
  // Keep the tray companion alive until the tray Quit action or app.quit().
});

ipcMain.on('set-interactive', (_event, interactive: boolean) => {
  forceInteractive = interactive;
  updateMousePassthrough();
});

ipcMain.on('set-hit-regions', (_event, regions: HitRegion[]) => {
  hitRegions = regions;
  applyWindowShape();
  updateMousePassthrough();
});

ipcMain.handle('get-window-bounds', () => {
  return widgetWindow?.getBounds() ?? getWidgetBounds();
});

ipcMain.on('quit-app', () => {
  emergencyQuit();
});

ipcMain.on('place-lamp-from-overlay', () => {
  completePlacementMode();
});

ipcMain.on('cancel-lamp-placement', () => {
  cancelPlacementMode();
});

function emergencyQuit(): void {
  debugLog('emergencyQuit');
  isQuitting = true;
  stopHitRegionPolling();
  stopPlaceRequestWatcher();
  cancelPlacementMode();
  forceStopServerProcess();
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.destroy();
  }
  app.exit(0);
}

function stopHitRegionPolling(): void {
  if (!hitRegionTimer) return;
  clearInterval(hitRegionTimer);
  hitRegionTimer = null;
}

function clampToWorkArea(bounds: Electron.Rectangle): Electron.Rectangle {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  const maxX = x + width - bounds.width;
  const maxY = y + height - bounds.height;

  return {
    ...bounds,
    x: Math.floor(Math.min(Math.max(bounds.x, x), maxX)),
    y: Math.floor(Math.min(Math.max(bounds.y, y), maxY)),
  };
}
