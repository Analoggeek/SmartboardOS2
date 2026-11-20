import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import renderer from '../desktop/assets.cjs';
import { runInNewContext } from 'node:vm';

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
const sw = readFileSync('sw.js', 'utf8');
const scope = 'https://example.test/board/';

function bootWorker({ cacheFailure = false } = {}) {
  const handlers = new Map();
  const cached = [];
  const removed = [];
  let activeCache;
  const base = {
    self: { registration: { scope }, clients: { claim() {} },
    addEventListener: (event, cb) => handlers.set(event, cb) },
    URL, Request: function (file) { this.url = new URL(file, scope).href; },
    caches: {
      async open(key) {
        activeCache = key;
        return {
          async addAll(items) {
            if (cacheFailure) throw new Error('Unavailable asset');
            cached.push(...items.map((req) => req.url));
          },
          async match(req) { return cached.find((url) => url === (req.url || req)); },
        };
      },
      async keys() { return [activeCache, 'sbos-v1.3.0', `sbos-offline:${scope}:old`, 'unrelated']; },
      async delete(key) { removed.push(key); },
    },
    fetch() { throw new Error('Network unavailable'); },
  };
  runInNewContext(sw, base);
  const event = (type, props = {}) => {
    let result;
    handlers.get(type)({ ...props, waitUntil: (p) => { result = p; }, respondWith: (p) => { result = p; } });
    return result;
  };
  return { event, cached, removed };
}

test('precache covers every local renderer file and PWA shortcut offline', async () => {
  const worker = bootWorker();
  await worker.event('install');
  const expected = ['./', 'index.html', 'install.html', 'manifest.webmanifest', ...['css', 'js', 'vendor', 'assets'].flatMap(files)];
  assert.deepEqual(worker.cached.sort(), expected.map((file) => new URL(file, scope).href).sort());
  const manifest = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  assert.deepEqual(manifest.shortcuts.map(({ url }) => url), ['./?app=whiteboard', './?app=class', './?app=maps']);
  for (const { url } of manifest.shortcuts) {
    assert.equal(await worker.event('fetch', { request: {
      url: new URL(url, scope).href, method: 'GET', mode: 'navigate',
    } }), scope);
  }
  await worker.event('activate');
  assert.deepEqual(worker.removed, ['sbos-v1.3.0', `sbos-offline:${scope}:old`]);
});

test('failed precache does not activate an incomplete update', async () => {
  const worker = bootWorker({ cacheFailure: true });
  await assert.rejects(worker.event('install'), /Unavailable asset/);
  assert.deepEqual(worker.cached, []);
  assert.deepEqual(worker.removed, []);
});


test('desktop/preview routes cover runtime assets without exposing project files', () => {
  for (const file of ['index.html', 'install.html', 'manifest.webmanifest', ...['css', 'js', 'vendor', 'assets'].flatMap(files)]) {
    assert.equal(renderer.rendererAsset(`/${file}`).file, file);
  }
  for (const route of ['/.git/config', '/package.json', '/desktop/main.cjs', '/js/../package.json', '/js/%2fmain.js']) {
    assert.equal(renderer.rendererAsset(route), null);
  }
});
