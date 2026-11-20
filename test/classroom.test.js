import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEraserIndex, eraseStroke } from '../js/eraser.js';
import library from '../desktop/library.cjs';
import map from '../js/map-data.js';
import states from '../js/map-states.js';
import physical from '../js/map-physical.js';

const { dateFolder, registerLibrary } = library;

test('inking eraser clips the middle of a sparse stroke without deleting the rest', () => {
  const pts = [{ x: -10, y: 0, p: 0 }, { x: 10, y: 0, p: 1 }];
  const clipped = eraseStroke(pts, { x: 0, y: 0 }, 5);
  assert.deepEqual(clipped.map(part => part.map(point => point.x)), [[-10, -5], [5, 10]]);
  assert.equal(clipped[0][1].p, .25);
  assert.equal(eraseStroke(pts, { x: 5, y: 100 }, 5), null);
  assert.deepEqual(eraseStroke(pts, { x: 0, y: 0 }, 30), []);
});

test('archive writes authenticated daily checkpoints and concatenates recording chunks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sbos-classroom-'));
  try {
    const handlers = new Map();
    const frame = { url: 'sbos://app/index.html?version=1.4.0' };
    const contents = { mainFrame: frame };
    const event = { sender: contents, senderFrame: frame };
    registerLibrary({ app: { getPath: () => root }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      shell: { openPath: path => path }, getWindow: () => ({ webContents: contents }), entry: 'sbos://app/index.html' });
    const send = (name, ...args) => handlers.get(`sbos:library:${name}`)(event, ...args);
    assert.throws(() => send('save', '../../outside', '{}'), /Invalid/);
    assert.throws(() => handlers.get('sbos:library:open')({ sender: {} }), /Not available/);
    await send('save', 'board', '{"version":1}');
    await send('save', 'board', '{"version":2}');
    const dir = join(root, 'SmartBoardOS', dateFolder());
    assert.equal(await readFile(join(dir, 'Classroom', 'board.json'), 'utf8'), '{"version":2}');
    const id = await send('start', 'camera');
    await assert.rejects(send('start', 'screen'), /already active/);
    await send('append', id, new Uint8Array([8, 2]));
    await send('append', id, new Uint8Array([3]));
    const name = await send('finish', id);
    assert.match(name, /^camera-.*\.webm$/);
    assert.deepEqual([...await readFile(join(dir, 'Recordings', name))], [8, 2, 3]);
    assert.deepEqual(await readdir(join(dir, 'Recordings')), [name]);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test('bundled atlas covers each continental section and major geographic examples', () => {
  const regions = new Set(map.map(([, region]) => region));
  for (const region of ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica']) assert.ok(regions.has(region));
  assert.ok(map.some(([name, region]) => name === 'India' && region === 'Asia'));
});


test('eraser index skips distant ink on large boards and preserves layer order when it splits a stroke', () => {
  const objects = Array.from({ length: 10000 }, (_, i) => ({ i, x: i*32, y: i*32, w: 16, h: 16 }));
  const index = createEraserIndex(objects, o => o, 8);
  let visits = 0;
  assert.ok(index.visit({ x: 6404, y: 6404 }, o => { visits++; return [{ ...o, part: 1 }, { ...o, part: 2 }]; }));
  assert.equal(visits, 1);
  const result = index.objects();
  assert.deepEqual(result.slice(199,203).map(o => [o.i,o.part || 0]), [[199,0],[200,1],[200,2],[201,0]]);
});

test('offline atlas has dedicated geometry, India subdivisions and Asian classroom landmarks', () => {
  assert.ok(map.length >= 240);
  assert.equal(new Set(map.map(row => row[3])).size, map.length);
  const india = map.find(row => row[3] === 'IND');
  assert.deepEqual(india.slice(0,2), ['India','Asia']);
  assert.ok(india[2].length > 1);
  assert.equal(states.filter(row => row[0] === 'IND').length,36);
  assert.ok(physical.ranges.some(row => row[0] === 'Himalayas'));
  assert.ok(physical.peaks.some(row => row[0] === 'Mount Everest'));
  assert.ok(physical.rivers.some(row => /Ganges|Ganga/i.test(row[0])));
});
