import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { channels } from './channels';
import { assertTrustedSender, isAllowedNavigation, trustedOriginFor } from './security';
import { CoreProcessSupervisor } from './supervisor';
import { validateCreate, validateFocus, validateReference, validateSnapshot } from './validation';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

protocol.registerSchemesAsPrivileged([
  { scheme: 'fielora', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let appWindow: BrowserWindow | undefined;
let trustedOrigin = '';
let quitting = false;
const supervisor = new CoreProcessSupervisor();

function assertBridgeEvent(event: IpcMainInvokeEvent): void {
  if (!appWindow || !event.senderFrame) throw new Error('Untrusted bridge sender');
  assertTrustedSender({
    senderId: event.sender.id,
    expectedSenderId: appWindow.webContents.id,
    frameUrl: event.senderFrame.url,
    isMainFrame: event.senderFrame === event.sender.mainFrame,
  }, trustedOrigin);
}

function handle(channel: string, validator: (payload: unknown) => unknown, method: string): void {
  ipcMain.handle(channel, async (event, payload) => {
    assertBridgeEvent(event);
    return supervisor.request(method, validator(payload));
  });
}

function registerBridgeHandlers(): void {
  handle(channels.fieldCreate, validateCreate, 'command.field.create');
  ipcMain.handle(channels.fieldList, async (event) => {
    assertBridgeEvent(event);
    return supervisor.request('query.field.list');
  });
  handle(channels.fieldGet, validateReference, 'query.field.get');
  handle(channels.fieldUpdateFocus, validateFocus, 'command.field.update_focus');
  handle(channels.surfaceSaveSnapshot, validateSnapshot, 'command.surface.save_snapshot');
  handle(channels.surfaceLatestSnapshot, validateReference, 'query.surface.latest_snapshot');
  ipcMain.handle(channels.coreHealth, (event) => { assertBridgeEvent(event); return supervisor.getHealth(); });
  ipcMain.handle(channels.coreRetry, async (event) => { assertBridgeEvent(event); await supervisor.retry(); });
  ipcMain.handle(channels.coreOpenLogs, async (event) => {
    assertBridgeEvent(event);
    const dbPath = supervisor.getHealth().db_path;
    if (dbPath) await shell.openPath(path.join(path.dirname(path.dirname(dbPath)), 'logs'));
  });
  ipcMain.handle(channels.coreQuit, (event) => { assertBridgeEvent(event); app.quit(); });
  ipcMain.handle(channels.testKillCore, (event) => { assertBridgeEvent(event); supervisor.killForTest(); });
}

async function registerApplicationProtocol(): Promise<void> {
  protocol.handle('fielora', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    let relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (relative.startsWith('main_window/')) relative = relative.slice('main_window/'.length);
    if (relative.includes('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 });
    const rendererRoot = path.join(app.getAppPath(), '.webpack', 'renderer', 'main_window');
    try {
      const bytes = await readFile(path.join(rendererRoot, relative));
      const type = relative.endsWith('.html') ? 'text/html; charset=utf-8'
        : relative.endsWith('.js') ? 'text/javascript; charset=utf-8'
          : relative.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream';
      return new Response(bytes, {
        headers: {
          'Content-Type': type,
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

async function createWindow(): Promise<void> {
  trustedOrigin = trustedOriginFor(app.isPackaged, MAIN_WINDOW_WEBPACK_ENTRY);
  appWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f5f7fb',
    show: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  appWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  appWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, trustedOrigin)) event.preventDefault();
  });
  appWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  appWindow.once('ready-to-show', () => appWindow?.show());
  if (app.isPackaged) await appWindow.loadURL('fielora://app/index.html');
  else await appWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => { if (appWindow) { appWindow.restore(); appWindow.focus(); } });
  app.whenReady().then(async () => {
    registerBridgeHandlers();
    if (app.isPackaged) await registerApplicationProtocol();
    await createWindow();
    supervisor.on('notification', (message) => appWindow?.webContents.send(channels.coreEvent, (message as { params: unknown }).params));
    supervisor.on('health', () => appWindow?.webContents.send(channels.coreEvent, { event: 'event.core.health' }));
    void supervisor.start().catch((error) => console.error('Core startup failed', error));
  });
}

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void supervisor.shutdown().finally(() => app.exit(0));
});

app.on('window-all-closed', () => app.quit());
