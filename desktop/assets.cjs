// Shared by the local desktop protocol and the development preview.
const { extname } = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function rendererAsset(pathname) {
  const file = pathname === '/' ? '/index.html' : pathname;
  if (!/^\/(?:(?:index|install|student)\.html|manifest\.webmanifest|sw\.js|(?:assets|css|js|vendor)\/(?:[\w-]+\/)*[\w.-]+)$/.test(file)) return null;
  const type = TYPES[extname(file)];
  return type ? { file: file.slice(1), type } : null;
}

module.exports = { rendererAsset };
