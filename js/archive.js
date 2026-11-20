import { toast } from './utils.js';

let warned = false;
// IndexedDB remains the live store; write a daily checkpoint to the desktop library after idle.
export function archiveWriter(key) {
  let timer;
  const write = async (payload) => {
    clearTimeout(timer);
    if (!window.smartboardLibrary) return;
    try { await window.smartboardLibrary.save(key, JSON.stringify(payload)); warned = false; }
    catch (e) {
      console.warn('Daily checkpoint could not be written', e);
      if (!warned) toast('Could not write to the lesson folder. Check permissions or free disk space.', 'warn', 5500);
      warned = true;
    }
  };
  return { write, schedule(payload) { clearTimeout(timer); timer = setTimeout(() => write(payload), 1800); } };
}
