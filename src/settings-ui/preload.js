// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CinnamonShaey
// Bridge for the Settings window (sandboxed; no Node access for the page).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('om', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  previewAccent: (hex) => ipcRenderer.send('settings:preview-accent', hex),
  testSound: () => ipcRenderer.send('settings:test-sound'),
  open: (what) => ipcRenderer.send('settings:open', what),
  createShortcut: () => ipcRenderer.send('settings:shortcut'),
  onState: (cb) => ipcRenderer.on('settings:state', (_e, s) => cb(s)),
  onGoto: (cb) => ipcRenderer.on('settings:goto', (_e, id) => cb(id)),
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.send('update:download'),
    install: () => ipcRenderer.send('update:install'),
    onState: (cb) => ipcRenderer.on('update:state', (_e, s) => cb(s)),
  },
});
