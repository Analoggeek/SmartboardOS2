import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import vm from 'node:vm';
import {offlineStatus} from '../js/offline.js';

const code = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const scope = 'https://example.test/SmartBoardOS2/';

function serviceWorker() {
  const events = new Map(), files = new Set();
  const self = { registration:{scope}, addEventListener:(event,fn) => events.set(event,fn) };
  const cache = { addAll: requests => requests.forEach(req => files.add(req.url)), keys: () => [...files].map(url => ({url})) };
  class Request { constructor(path) { this.url = new URL(path, scope).href; } }
  vm.runInNewContext(code, {self, URL, Request, caches:{open:async () => cache}});
  const dispatch = (name, event = {}) => new Promise(resolve => events.get(name)({ ...event, waitUntil: resolve }));
  const fakeWorker = { postMessage: (data, ports) => { void dispatch('message', {data,ports}); } };
  return { dispatch, files, fakeWorker };
}

test('offline status verifies the actual core cache, including under a GitHub Pages subpath', async () => {
  const {dispatch, files, fakeWorker} = serviceWorker();
  assert.equal(await offlineStatus(fakeWorker), false, 'registration before cache install is not sufficient');
  await dispatch('install');
  assert.equal(await offlineStatus(fakeWorker), true);
  for (const url of files) {
    const relative = url.slice(scope.length);
    if (relative) await access(new URL(`../${relative}`, import.meta.url));
  }
  files.delete(`${scope}vendor/pdf.worker.min.js`);
  assert.equal(await offlineStatus(fakeWorker), false, 'an evicted offline asset is detected');
});

test('offline status handles unavailable or older workers without claiming readiness', async () => {
  assert.equal(await offlineStatus(null), false);
  assert.equal(await offlineStatus({postMessage: () => {}}, 8), false);
  assert.equal(await offlineStatus({postMessage: () => { throw Error('Worker exited'); }}, 8), false);
});
