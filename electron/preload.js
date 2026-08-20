const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadAccounts: () => ipcRenderer.invoke('accounts:load'),
  saveAccounts: (data) => ipcRenderer.invoke('accounts:save', data),
  startCapture: () => ipcRenderer.invoke('capture:start'),
  stopCapture: () => ipcRenderer.invoke('capture:stop'),
  captureRegion: (rect) => ipcRenderer.invoke('capture:region', rect),
  openPath: (filePath) => ipcRenderer.invoke('app:openPath', filePath),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop'),
  saveImage: (dataUrl, defaultName) => ipcRenderer.invoke('image:save', { dataUrl, defaultName }),
  copyImage: (dataUrl) => ipcRenderer.invoke('image:copy', dataUrl),
  saveVoucherRecord: (phone, content) => ipcRenderer.invoke('voucher:save', { phone, content }),
  saveVoucherExportRecord: (record) => ipcRenderer.invoke('voucher:exportRecord', record),
  getExportedVoucherCodes: () => ipcRenderer.invoke('voucher:exportedCodes'),
  getVoucherExportRecords: () => ipcRenderer.invoke('voucher:exportRecords'),
  cancelVoucherExport: (record) => ipcRenderer.invoke('voucher:cancelExport', record),
  deployVoucherPage: (html, fileId) => ipcRenderer.invoke('voucher:deployPage', { html, fileId }),
  deleteVoucherPage: (fileId) => ipcRenderer.invoke('voucher:deletePage', { fileId }),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getAppVersion: () => ipcRenderer.invoke('updater:version'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('updater:updateAvailable', (event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on('updater:updateNotAvailable', () => callback());
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('updater:downloadProgress', (event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('updater:updateDownloaded', (event, info) => callback(info));
  },
  onUpdaterError: (callback) => {
    ipcRenderer.on('updater:error', (event, err) => callback(err));
  },
  onCaptureProgress: (callback) => {
    ipcRenderer.on('capture:progress', (event, msg) => callback(msg));
  },
  onCaptureData: (callback) => {
    ipcRenderer.on('capture:data', (event, data) => callback(data));
  },
  onCaptureDone: (callback) => {
    ipcRenderer.on('capture:done', (event, data) => callback(data));
  },
  saveGoodsVoucherPng: (dataUrl, fileName) => ipcRenderer.invoke('goods:savePng', { dataUrl, fileName }),
  openGoodsSnapDir: () => ipcRenderer.invoke('goods:openSnapDir'),
});
