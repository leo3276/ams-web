const { contextBridge, ipcRenderer } = require('electron');

// Expose protected desktop API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  printReceipt: (options) => ipcRenderer.invoke('print-receipt', options),
});
