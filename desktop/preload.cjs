const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('smartboardUpdates', {
  prepare: () => ipcRenderer.invoke('sbos:update:prepare'),
  install: () => ipcRenderer.invoke('sbos:update:install'),
});
