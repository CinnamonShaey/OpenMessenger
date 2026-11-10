// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CinnamonShaey
// Bridge for the screen-share picker window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  get: () => ipcRenderer.invoke('picker:get'),
  choose: (id, audio) => ipcRenderer.send('picker:choose', id, audio),
  cancel: () => ipcRenderer.send('picker:cancel'),
});
