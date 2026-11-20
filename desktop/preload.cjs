const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('smartboardWindow', { toggleFullscreen: () => ipcRenderer.invoke('sbos:window:fullscreen') });
contextBridge.exposeInMainWorld('smartboardUpdates', {
  prepare: () => ipcRenderer.invoke('sbos:update:prepare'),
  install: () => ipcRenderer.invoke('sbos:update:install'),
});
contextBridge.exposeInMainWorld('smartboardLibrary', {
  systemAudioSupported: process.platform === 'win32',
  open: () => ipcRenderer.invoke('sbos:library:open'),
  save: (key, json) => ipcRenderer.invoke('sbos:library:save', key, json),
  start: (kind) => ipcRenderer.invoke('sbos:library:start', kind),
  append: (id, bytes) => ipcRenderer.invoke('sbos:library:append', id, bytes),
  finish: (id) => ipcRenderer.invoke('sbos:library:finish', id),
});
