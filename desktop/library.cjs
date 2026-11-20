const { randomUUID } = require('node:crypto');
const { mkdir, open, rename, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const MAX_CHUNK = 24 * 1024 * 1024;
const MAX_SNAPSHOT = 64 * 1024 * 1024;
function dateFolder(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(x => String(x).padStart(2, '0')).join('-');
}
function registerLibrary({ app, ipcMain, shell, getWindow, entry }) {
  const root = () => join(app.getPath('documents'), 'SmartBoardOS');
  const sessions = new Map();
  const handle = (name, fn) => ipcMain.handle(`sbos:library:${name}`, (event, ...args) => {
    if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url.split('?')[0] !== entry) {
      throw new Error('Not available here');
    }
    return fn(...args);
  });
  handle('open', async () => { await mkdir(root(), { recursive: true }); return shell.openPath(root()); });
  let saves = Promise.resolve();
  handle('save', (key, json) => {
    if (typeof key !== 'string' || !/^(board|notes|pdf-[a-f0-9]{1,128}-\d{1,5}-\d{1,3})$/.test(key)
      || typeof json !== 'string' || Buffer.byteLength(json) > MAX_SNAPSHOT) throw new Error('Invalid or oversized snapshot');
    const dir = join(root(), dateFolder(), 'Classroom');
    const write = saves.catch(() => {}).then(async () => {
      await mkdir(dir, { recursive: true });
      const tmp = join(dir, `${key}.${randomUUID()}.tmp`);
      try { await writeFile(tmp, json, { flag: 'wx' }); await rename(tmp, join(dir, `${key}.json`)); }
      finally { await rm(tmp, { force: true }); }
    });
    saves = write;
    return write;
  });
  handle('start', async (kind) => {
    if (!['screen', 'camera', 'audio'].includes(kind) || sessions.size) throw new Error('A recording is already active');
    const id = randomUUID();
    const dir = join(root(), dateFolder(), 'Recordings');
    const name = `${kind}-${new Date().toTimeString().slice(0, 8).replaceAll(':', '-')}-${id.slice(0, 8)}.webm`;
    const final = join(dir, name);
    const partial = `${final}.partial`;
    const record = { partial, final, name, busy: false, bytes: 0 };
    sessions.set(id, record);
    try { await mkdir(dir, { recursive: true }); record.file = await open(partial, 'wx'); return id; }
    catch (error) { sessions.delete(id); throw error; }
  });
  handle('append', async (id, bytes) => {
    const record = sessions.get(id);
    if (!record?.file || record.busy || !ArrayBuffer.isView(bytes) || bytes.byteLength > MAX_CHUNK) throw new Error('Invalid recording chunk');
    record.busy = true;
    try { await record.file.writeFile(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); record.bytes += bytes.byteLength; }
    finally { record.busy = false; }
  });
  handle('finish', async (id) => {
    const record = sessions.get(id);
    if (!record?.file || record.busy) throw new Error('Recording has not finished writing');
    sessions.delete(id);
    try { await record.file.sync(); } finally { await record.file.close(); }
    if (!record.bytes) { await rm(record.partial, { force: true }); return null; }
    await rename(record.partial, record.final);
    return record.name;
  });
}
module.exports = { registerLibrary, dateFolder };
