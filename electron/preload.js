const { contextBridge, ipcRenderer } = require('electron');

// Expose protected desktop API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  printReceipt: (options) => ipcRenderer.invoke('print-receipt', options),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  restartAndInstallUpdate: () => ipcRenderer.invoke('restart-and-install-update'),
  onUpdaterStatus: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('updater-status', subscription);
    return () => ipcRenderer.removeListener('updater-status', subscription);
  },
});
