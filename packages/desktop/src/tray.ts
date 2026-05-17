import { app, BrowserWindow, Menu, nativeImage, screen, Tray } from 'electron';
import * as path from 'path';
import { forceStopServerProcess } from './server-process';

let tray: Tray | null = null;

export function setupTray(win: BrowserWindow, onPlaceLamp: () => void): void {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, '../assets/tray-icon.png'))
    .resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip('GENIE - AI Code Maintainability');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show GENIE',
      click: () => {
        win.show();
        win.focus();
      },
    },
    {
      label: 'Hide GENIE',
      click: () => win.hide(),
    },
    { type: 'separator' },
    {
      label: 'Place Lamp at Cursor',
      click: onPlaceLamp,
    },
    {
      label: 'Reset Position',
      click: () => resetWindowPosition(win),
    },
    { type: 'separator' },
    {
      label: 'Quit GENIE',
      click: () => {
        forceStopServerProcess();
        tray?.destroy();
        app.exit(0);
      },
    },
  ]));

  tray.on('click', () => {
    if (win.isVisible()) win.hide();
    else {
      win.show();
      win.focus();
    }
  });
}

function placeWindowAtCursor(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const clamped = clampToWorkArea({
    ...win.getBounds(),
    x: Math.round(cursor.x),
    y: Math.round(cursor.y),
  });

  win.setPosition(clamped.x, clamped.y);
  win.show();
  win.moveTop();
}

function resetWindowPosition(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  const [winWidth, winHeight] = win.getSize();

  win.setPosition(
    Math.round(x + width - winWidth),
    Math.round(y + height - winHeight),
  );
  win.show();
  win.moveTop();
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
