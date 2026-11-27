'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mp', {
  info: () => ipcRenderer.invoke('app:info'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.send('settings:set', patch),

  emulate: (webContentsId, params) => ipcRenderer.invoke('emu:apply', webContentsId, params),
  screenshot: (webContentsId, name) => ipcRenderer.invoke('shot:screen', webContentsId, name),
  screenshotRect: (rect, name) => ipcRenderer.invoke('shot:rect', rect, name),

  scanPorts: () => ipcRenderer.invoke('scan:ports'),
  pickPath: (kind) => ipcRenderer.invoke('dialog:open', kind),
  openPath: (p) => ipcRenderer.invoke('path:open', p),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  lanQr: (url) => ipcRenderer.invoke('lan:qr', url),

  setTheme: (dark) => ipcRenderer.send('ui:theme', dark),
  showInFolder: (p) => ipcRenderer.invoke('shell:show', p),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),

  onShortcut: (cb) => ipcRenderer.on('shortcut', (_e, name, webContentsId) => cb(name, webContentsId)),
  onFilesChanged: (cb) => ipcRenderer.on('watch:changed', (_e, payload) => cb(payload)),
});
