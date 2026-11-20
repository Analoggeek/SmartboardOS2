import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertBlankBoardPage, insertDocumentPages, MAX_BOARD_PAGES } from '../js/board-document.js';
import { localPart } from '../js/pptx-import.js';
import { cameraFrame, paintCameraFrame } from '../js/camera-layout.js';

test('PPTX relationships are resolved within the deck, not to network or local filesystem resources', () => {
  const slide = 'ppt/slides/slide1.xml';
  assert.equal(localPart(slide, '../media/image 1.jpg'), 'ppt/media/image 1.jpg');
  assert.equal(localPart(slide, '../slideLayouts/slideLayout1.xml'), 'ppt/slideLayouts/slideLayout1.xml');
  for (const path of ['https://example.com/ppt/media/a.jpg','../../../../ppt/media/a.jpg','../media/%2e%2e/a.jpg','../media/svg.svg','../embeddings/document.bin']) {
    assert.equal(localPart(slide,path),'');
  }
});

test('rounded camera recording center-crops a square frame and clips the recording, not just the preview', () => {
  assert.deepEqual(cameraFrame(1920,1080,1920,'rounded'),{width:1080,height:1080});
  assert.deepEqual(cameraFrame(1920,1080,1280,'wide'),{width:1280,height:720});
  const actions = [], video = {videoWidth:1920,videoHeight:1080};
  const ctx = new Proxy({}, { get: (_, name) => (...args) => actions.push([name,...args]) });
  paintCameraFrame(ctx,video,480,480,'rounded');
  assert.deepEqual(actions.slice(-4),[['roundRect',0,0,480,480,76.8],['clip'],['drawImage',video,420,0,1080,1080,0,0,480,480],['restore']]);
});

test('direct document imports replace only the pristine board, or insert after the current page', () => {
  const plain = {bg:'grid',objects:[]}, lesson = {bg:'plain',title:'Lesson',objects:[{type:'stroke'}]}, template = {bg:'cornell',objects:[]};
  const imported = [{title:'First PDF page'},{title:'Second PDF page'}];
  assert.deepEqual(insertDocumentPages([plain],0,imported),{pageIndex:0,pages:imported});
  assert.deepEqual(insertDocumentPages([lesson,template],0,imported),{pageIndex:1,pages:[lesson,...imported,template]});
  assert.deepEqual(insertDocumentPages([template],0,imported),{pageIndex:1,pages:[template,...imported]});
  assert.throws(()=>insertDocumentPages(Array(MAX_BOARD_PAGES).fill(plain),0,imported),/300 pages/);
});


test('inserting blank pages between imported pages preserves order, metadata and ink', () => {
  for (const source of ['document', 'slide']) {
    const bgImage = {src:'data:image/jpeg;base64,AA==',w:100,h:100};
    const first = {source, bg:'plain', bgColor:'#fff', title:'First', bgImage, objects:[{type:'stroke'}]};
    const last = {source, bg:'plain', bgColor:'#fff', title:'Last', bgImage, objects:[]};
    const input = [first, last];
    const result = insertBlankBoardPage(input, 0);
    assert.equal(result.pageIndex, 1);
    assert.equal(result.pages[0], first);
    assert.equal(result.pages[2], last);
    assert.deepEqual(result.pages[1], {objects:[],bg:'grid',bgColor:undefined,bgImage:null});
    assert.deepEqual(input, [first, last]);
    assert.throws(() => insertBlankBoardPage(Array(MAX_BOARD_PAGES).fill(first), 0), /page limit/);
  }
});

test('a new board page inherits the surface but not ink or titles', () => {
  const template = {bg:'cornell',bgColor:'#fff5dd',title:'Lesson',objects:[{type:'stroke'}]};
  assert.deepEqual(insertBlankBoardPage([template], 0), {
    pageIndex:1, pages:[template,{objects:[],bg:'cornell',bgColor:'#fff5dd',bgImage:null}],
  });
});
