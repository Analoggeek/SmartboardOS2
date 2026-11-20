import { test } from 'node:test';
import assert from 'node:assert/strict';
import india from '../js/map-india.js';
import countries from '../js/map-data.js';
import { appArt } from '../js/app-art.js';

const contains = ([x, y], ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i], [c, d] = ring[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) hit = !hit;
  }
  return hit;
};

test('India detail includes the mainland and Andamans, excludes open sea, and includes detailed river paths', () => {
  assert.equal(countries.length, 242);
  assert.equal(new Set(countries.map(row => row[3])).size, 242);
  const land = (p) => india.outline.some(([outer, ...holes]) => contains(p, outer) && !holes.some(hole => contains(p, hole)));
  for (const point of [[77.10, 28.70], [79.08, 21.14], [77.60, 13.00], [92.74, 11.64]]) assert(land(point), `Expected land at ${point}`);
  assert(!land([73.5, 11]));
  for (const name of ['Ganges', 'Brahmaputra', 'Godavari', 'Narmada', 'Krishna']) {
    assert(india.rivers.some(row => row[0] === name && row[2].some(line => line.length > 20)), `Missing detailed ${name} path`);
  }
});

test('dimensional icons have independent gradient IDs when repeated in home and app grid', () => {
  const svg = appArt('maps') + appArt('maps') + appArt('maps');
  const ids = [...svg.matchAll(/id="(app-art-[^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, 9);
  for (const [, key] of svg.matchAll(/url\(#([^)]+)\)/g)) assert(ids.includes(key));
});
