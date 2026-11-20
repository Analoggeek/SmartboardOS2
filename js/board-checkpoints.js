import { idb } from './db.js';
const KEY = 'board-checkpoints-v1';
let chain = Promise.resolve();
export const listCheckpoints = async () => (await idb.get('kv', KEY)) || [];
export function checkpoint(board, label, force = false) {
  if (!force && !board.pages.some(p => p.bgImage || p.objects.length)) return Promise.resolve(true);
  chain = chain.catch(() => {}).then(async () => {
    const items = await listCheckpoints();
    const now = Date.now();
    if (!force && items[0] && now - items[0].ts < 300000) return true;
    const json = JSON.stringify({ pages: board.pages, pageIndex: board.pageIndex, version: 1 });
    if (json.length > 16_000_000) return !force;
    if (items[0]?.json === json) return true;
    const next = [{ ts: now, label, json }];
    let size = json.length;
    for (const item of items) {
      if (next.length >= 6 || size + item.json.length > 20_000_000) break;
      size += item.json.length; next.push(item);
    }
    return idb.set('kv', KEY, next);
  });
  return chain;
}
