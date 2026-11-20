/* Tiny persistence layer: localStorage for settings, IndexedDB for files & big data */

const NS = 'sbos:';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('store.set failed', e); return false; }
  },
  del(key) { try { localStorage.removeItem(NS + key); } catch { /* noop */ } },
  keys() { return Object.keys(localStorage).filter((k) => k.startsWith(NS)).map((k) => k.slice(NS.length)); },
  clearAll() { this.keys().forEach((k) => this.del(k)); },
};

/* ---------------- IndexedDB ---------------- */
const DB_NAME = 'smartboardos';
const DB_VERSION = 1;
const STORES = ['kv', 'media', 'docs', 'boards'];
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export const idb = {
  async get(storeName, key) {
    try {
      const os = await tx(storeName);
      return await new Promise((res, rej) => {
        const r = os.get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    } catch { return undefined; }
  },
  async set(storeName, key, value) {
    try {
      const os = await tx(storeName, 'readwrite');
      return await new Promise((res, rej) => {
        const r = os.put(value, key);
        os.transaction.oncomplete = () => res(true);
        os.transaction.onabort = () => rej(os.transaction.error || new Error('Storage transaction aborted'));
        r.onerror = () => rej(r.error);
      });
    } catch (e) { console.warn('idb.set', e); return false; }
  },
  async del(storeName, key) {
    try {
      const os = await tx(storeName, 'readwrite');
      return await new Promise((res, rej) => {
        const r = os.delete(key);
        os.transaction.oncomplete = () => res(true);
        os.transaction.onabort = () => rej(os.transaction.error || new Error('Storage transaction aborted'));
        r.onerror = () => rej(r.error);
      });
    } catch { return false; }
  },
  async all(storeName) {
    try {
      const os = await tx(storeName);
      return await new Promise((res, rej) => {
        const out = [];
        const r = os.openCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (c) { out.push(c.value); c.continue(); } else res(out);
        };
        r.onerror = () => rej(r.error);
      });
    } catch { return []; }
  },
  async clear(storeName) {
    try {
      const os = await tx(storeName, 'readwrite');
      return await new Promise((res, rej) => {
        const r = os.clear();
        os.transaction.oncomplete = () => res(true);
        os.transaction.onabort = () => rej(os.transaction.error || new Error('Storage transaction aborted'));
        r.onerror = () => rej(r.error);
      });
    } catch { return false; }
  },
};

/* ---------------- app state (with change events) ---------------- */
const listeners = new Map();

export const state = {
  get(key, fallback = null) { return store.get(key, fallback); },
  set(key, value) {
    store.set(key, value);
    (listeners.get(key) || []).forEach((fn) => { try { fn(value); } catch (e) { console.warn(e); } });
    return value;
  },
  on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(fn);
    return () => {
      const arr = listeners.get(key) || [];
      const i = arr.indexOf(fn);
      if (i > -1) arr.splice(i, 1);
    };
  },
};

/* ---------------- defaults ---------------- */
export const DEFAULT_SETTINGS = {
  theme: 'dark',          // dark | light
  accent: 'indigo',
  motion: true,
  contrast: false,
  largeControls: false,
  use24h: false,
  teacherName: 'Teacher',
  wallpaper: 'aurora',
  openWidgets: ['clock', 'timer', 'dice', 'note'],
  firstRun: true,
};

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
}
export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  store.set('settings', next);
  return next;
}
