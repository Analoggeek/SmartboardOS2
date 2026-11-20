import { test } from 'node:test';
import assert from 'node:assert/strict';
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
