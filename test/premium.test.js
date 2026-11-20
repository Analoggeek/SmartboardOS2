import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from '../vendor/fflate/fflate.js';
import { checkBoard, encodeLesson, decodeLesson } from '../js/lesson-pack.js';
import { answers, chapterFor, circuitCurrent, thinLens } from '../js/lab-practice.js';
import { diagrams } from '../js/lab-diagrams.js';
import places from '../js/map-cities.js';

const sample = () => ({ title:'Motion', className:'9 A', subject:'Physics', chapter:'Speed', notes:'Private', savedAt:1750000000000,
  board:{version:1,pageIndex:0,pages:[{bg:'grid',title:'Example',objects:[{type:'stroke',tool:'pen',color:'#111111',size:3,points:[{x:14,y:35,p:.7}]}]}]},
  files:[{name:'worksheet.txt',blob:new Blob(['Worksheet content'])}] });

test('a portable Lesson Pack preserves editable pages, teaching notes and local attachments', async () => {
  const lesson = sample();
  const read = decodeLesson(await encodeLesson(lesson));
  assert.equal(read.notes, lesson.notes); assert.equal(read.savedAt, lesson.savedAt);
  assert.deepEqual(read.board,lesson.board); assert.equal(read.files[0].name,lesson.files[0].name);
  assert.equal(await read.files[0].blob.text(),'Worksheet content');
});
test('lesson import rejects compressed archives, unsafe attachment paths and external images', async () => {
  const lesson = sample();
  assert.throws(() => decodeLesson(zipSync({'unexpected.txt':strToU8('x')}, {level:0})), /Invalid or oversized/);
  assert.throws(() => decodeLesson(zipSync({'board.json':strToU8('x'.repeat(1000))}, {level:6})), /Invalid or oversized/);
  await assert.rejects(encodeLesson({...lesson, files:[{name:'../outside.txt',blob:new Blob(['x'])}]}), /Unsupported attachment/);
  assert.throws(() => checkBoard({...lesson.board, pages:[{ bg:'plain', objects:[{ type:'image', x:0, y:0, w:12, h:12, src:'https://example.org/not-local.png' }] }]}), /Unsupported image/);
});
test('offline lab models cover real, virtual and focal cases, and all worksheets have chapter keys', () => {
  assert.deepEqual(circuitCurrent(12,20,40), { current:.2,drop1:4,drop2:8 });
  assert.deepEqual(thinLens(20,40), { image:40,magnification:-1 });
  assert.deepEqual(thinLens(20,10), { image:-20,magnification:2 });
  assert.equal(thinLens(20,20).image,Infinity);
  for (const diagram of diagrams) {assert(answers[diagram.id]); assert.notEqual(chapterFor(diagram),'Foundations');}
});
test('offline city search uses sourced geographic coordinates', () => {
  assert(places.length > 1200);
  const city = places.find(([name]) => name === 'Jodhpur');
  assert.equal(city[2], 'IND'); assert(city[3] > 72 && city[3] < 74 && city[4] > 26 && city[4] < 27);
});
