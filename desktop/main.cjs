/* Local-only Electron host. The renderer has no Node access; the preload exposes only two updater commands. */
const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { registerUpdater } = require('./update.cjs');
const { rendererAsset } = require('./assets.cjs');

const SCHEME = 'sbos';
const HOST = 'app';
const ENTRY = `${SCHEME}://${HOST}/index.html`;
const POLICY = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data: blob:",
  "worker-src 'self' blob:", "connect-src 'self' blob: data:", 'media-src blob: data:',
  "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

function isLocal(url) {
  try {
    const { protocol: scheme, host } = new URL(url);
    return scheme === `${SCHEME}:` && host === HOST;
  } catch { return false; }
}

async function serveAsset(request) {
  if (request.method !== 'GET' || !isLocal(request.url)) return new Response(null, { status: 403 });
  const asset = rendererAsset(new URL(request.url).pathname);
  if (!asset || asset.file === 'sw.js') return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(path.join(app.getAppPath(), asset.file));
    return new Response(bytes, { headers: { 'Content-Type': asset.type, 'Content-Security-Policy': POLICY } });
  } catch { return new Response(null, { status: 404 }); }
}

let win;
function openWindow() {
  win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 360, minHeight: 300,
    show: false, backgroundColor: '#0b1020',
    icon: path.join(app.getAppPath(), 'assets/icons/icon-512.png'),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => { win = null; });
  win.loadURL(`${ENTRY}?version=${encodeURIComponent(app.getVersion())}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    protocol.handle(SCHEME, serveAsset);
    registerUpdater({ app, dialog, ipcMain, net, shell, getWindow: () => win, entry: ENTRY });
    const ses = session.defaultSession;
    ses.setPermissionCheckHandler((_contents, permission, origin, details) =>
      permission === 'media' && isLocal(origin) && details.mediaType === 'video');
    ses.setPermissionRequestHandler((_contents, permission, respond, details) =>
      respond(permission === 'media' && isLocal(details.requestingUrl)
        && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'video'));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'togglefullscreen' }] }, { role: 'windowMenu' },
    ]));
    openWindow();
    app.on('activate', () => { if (!win) openWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
