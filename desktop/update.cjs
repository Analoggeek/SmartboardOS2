/* Download only the official full installer for this platform, then verify it before launch. */
const { createHash } = require('node:crypto');
const { createWriteStream } = require('node:fs');
const { mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const RELEASES = 'https://api.github.com/repos/Analoggeek/SmartboardOS2/releases/latest';
const DOWNLOAD = 'https://github.com/Analoggeek/SmartboardOS2/releases/download/';

function selectInstaller(release, current, platform, arch) {
  const version = /^desktop-v(\d+\.\d+\.\d+)$/.exec(release.tag_name || '')?.[1];
  if (!version || release.draft || release.prerelease || !/^\d+\.\d+\.\d+$/.test(current)) throw new Error('Invalid release');
  const old = current.split('.').map(Number);
  const delta = version.split('.').map((n, i) => Number(n) - old[i]).find(Boolean);
  if (!(delta > 0)) return null;
  const target = { win32: ['win', 'exe'], darwin: ['mac', 'dmg'] }[platform];
  if (!target || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported platform');
  const name = `SmartBoardOS-${version}-${target[0]}-${arch}.${target[1]}`;
  const url = `${DOWNLOAD}${release.tag_name}/${name}`;
  const asset = release.assets?.find((a) => a.name === name && a.browser_download_url === url);
  const digest = /^sha256:([a-f0-9]{64})$/.exec(asset?.digest || '')?.[1];
  if (!digest || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 1024 ** 3) {
    throw new Error('Installer or checksum is missing');
  }
  return { version, name, url, size: asset.size, digest };
}

async function downloadInstaller(fetch, installer, directory) {
  const dir = await mkdtemp(join(directory, 'smartboard-update-'));
  const path = join(dir, installer.name);
  try {
    const signal = AbortSignal.timeout(10 * 60 * 1000);
    const response = await fetch(installer.url, { signal });
    if (!response.ok || !response.body) throw new Error('Installer unavailable');
    let size = 0;
    const hash = createHash('sha256');
    const verify = new Transform({ transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > installer.size) return callback(new Error('Installer exceeds expected size'));
      hash.update(chunk);
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(path, { flags: 'wx' }), { signal });
    if (size !== installer.size || hash.digest('hex') !== installer.digest) throw new Error('Installer checksum mismatch');
    return { dir, path };
  } catch (e) {
    await rm(dir, { force: true, recursive: true });
    throw e;
  }
}

function registerUpdater({ app, dialog, ipcMain, net, shell, getWindow, entry }) {
  let busy = false;
  let prepared;
  const authorized = (e) => {
    const win = getWindow();
    return app.isPackaged && win && e.sender === win.webContents
      && e.senderFrame === e.sender.mainFrame && e.senderFrame.url.split('?')[0] === entry;
  };
  ipcMain.handle('sbos:update:prepare', async (e) => {
    if (!authorized(e)) return { status: 'unavailable' };
    if (busy) return { status: 'busy' };
    if (prepared) return { status: 'ready', version: prepared.version, platform: process.platform };
    busy = true;
    try {
      const response = await net.fetch(RELEASES, {
        headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000),
      });
      if (response.status === 404) return { status: 'unavailable' };
      if (!response.ok) throw new Error(`Release lookup failed: ${response.status}`);
      const selected = selectInstaller(await response.json(), app.getVersion(), process.platform, process.arch);
      if (!selected) return { status: 'current' };
      const files = await downloadInstaller(net.fetch.bind(net), selected, app.getPath('temp'));
      prepared = { ...files, version: selected.version };
      return { status: 'ready', version: selected.version, platform: process.platform };
    } catch (err) {
      console.warn('Update preparation failed:', err.message);
      return { status: 'error' };
    } finally { busy = false; }
  });
  ipcMain.handle('sbos:update:install', async (e) => {
    if (!authorized(e) || !prepared || busy) return { status: 'unavailable' };
    busy = true;
    try {
      const isMac = process.platform === 'darwin';
      const { response } = await dialog.showMessageBox(getWindow(), {
        type: 'info', buttons: [isMac ? 'Open disk image' : 'Install update', 'Later'], defaultId: 0, cancelId: 1,
        message: `SmartBoardOS ${prepared.version} is ready`,
        detail: isMac ? 'Quit SmartBoardOS after the disk image opens, then drag the new app into Applications to replace it.'
          : 'SmartBoardOS will close and the full offline setup will run. Your classroom data stays on this device.',
      });
      if (response !== 0) return { status: 'later' };
      const failure = await shell.openPath(prepared.path);
      if (failure) throw new Error(failure);
      if (!isMac) setImmediate(() => app.quit());
      return { status: 'opened' };
    } catch (err) {
      console.warn('Update launch failed:', err.message);
      return { status: 'error' };
    } finally { busy = false; }
  });
}

module.exports = { registerUpdater, selectInstaller, downloadInstaller };
