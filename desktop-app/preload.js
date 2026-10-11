const { contextBridge } = require('electron');

// Expose a minimal API to the renderer for security
contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  isDesktopApp: true
});
