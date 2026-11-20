const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { rendererAsset } = require('../desktop/assets.cjs');

const root = join(__dirname, '..');
const port = Number(process.env.PORT || 5173);
createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const asset = rendererAsset(new URL(req.url, 'http://preview.test').pathname);
    if (!asset) { res.writeHead(404).end(); return; }
    const bytes = await readFile(join(root, asset.file));
    res.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404).end(); }
}).listen(port, '0.0.0.0', () => console.log(`SmartBoardOS preview is listening on port ${port}`));
