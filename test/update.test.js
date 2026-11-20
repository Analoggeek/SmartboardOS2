import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import updater from '../desktop/update.cjs';

const { selectInstaller, downloadInstaller } = updater;
const content = Buffer.from('test installer');
const digest = createHash('sha256').update(content).digest('hex');
const tag = 'desktop-v1.4.10';
function release() {
  return { tag_name: tag, assets: ['win-x64.exe', 'win-arm64.exe', 'mac-x64.dmg', 'mac-arm64.dmg'].map((target) => {
    const name = `SmartBoardOS-1.4.10-${target}`;
    return { name, browser_download_url: `https://github.com/Analoggeek/SmartboardOS2/releases/download/${tag}/${name}`,
      size: content.length, digest: `sha256:${digest}` };
  }) };
}

test('update selection compares numeric versions and matches the installed platform and CPU', () => {
  const info = release();
  assert.match(selectInstaller(info, '1.4.9', 'win32', 'arm64').name, /win-arm64\.exe$/);
  assert.match(selectInstaller(info, '1.4.9', 'darwin', 'x64').name, /mac-x64\.dmg$/);
  assert.equal(selectInstaller(info, '1.4.10', 'win32', 'x64'), null);
  assert.equal(selectInstaller(info, '2.0.0', 'win32', 'x64'), null);
  assert.throws(() => selectInstaller({ ...info, prerelease: true }, '1.4.1', 'win32', 'x64'));
  info.assets[0].browser_download_url = 'https://example.com/installer.exe';
  assert.throws(() => selectInstaller(info, '1.4.1', 'win32', 'x64'), /checksum is missing/);
});

test('installer download verifies contents and cleans up tampered or partial files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sbos-test-'));
  try {
    const asset = selectInstaller(release(), '1.4.9', 'win32', 'x64');
    const good = await downloadInstaller(async () => new Response(content), asset, dir);
    assert.deepEqual(await readFile(good.path), content);
    await assert.rejects(downloadInstaller(async () => new Response(Buffer.alloc(content.length)), asset, dir), /checksum mismatch/);
    await assert.rejects(downloadInstaller(async () => new Response(Buffer.alloc(content.length + 1)), asset, dir), /expected size/);
    assert.equal((await readdir(dir)).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
