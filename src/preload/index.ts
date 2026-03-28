import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  getPersistConfig: () => ipcRenderer.invoke('persist:get-config'),
  setPersistConfig: (patch: any) => ipcRenderer.invoke('persist:set-config', patch),
  openDataRoot: () => ipcRenderer.invoke('persist:open-data-root'),
  persistGetItem: (key: string) => ipcRenderer.invoke('persist:kv-get', key),
  persistSetItem: (key: string, value: string) => ipcRenderer.invoke('persist:kv-set', key, value),
  persistRemoveItem: (key: string) => ipcRenderer.invoke('persist:kv-remove', key),

  inputImageCacheStats: () => ipcRenderer.invoke('cache:input-images:stats'),
  clearInputImageCache: () => ipcRenderer.invoke('cache:input-images:clear'),
  removeInputImageCacheFile: (args: { localPath?: string, filePath?: string }) =>
    ipcRenderer.invoke('cache:input-images:remove-file', args),

  minimizeWindow: () => ipcRenderer.send('window-minimize'),

  downloadImage: (args: { url: string, saveDir: string, fileName: string }) =>
    ipcRenderer.invoke('download-and-save-image', args),

  downloadVideo: (args: { url: string, saveDir: string, fileName: string }) =>
    ipcRenderer.invoke('download-and-save-video', args),

  showItemInFolder: (args: { filePath: string }) =>
    ipcRenderer.invoke('show-item-in-folder', args),

  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  exportImagesToDir: (args: { items: { url: string, fileName: string }[], saveDir: string }) =>
    ipcRenderer.invoke('export-images-to-dir', args),

  exportVideosToDir: (args: { items: { url: string, fileName: string }[], saveDir: string }) =>
    ipcRenderer.invoke('export-videos-to-dir', args),

  copyImageToClipboard: (args: { url: string }) =>
    ipcRenderer.invoke('copy-image-to-clipboard', args),

  callPython: (args: any) => ipcRenderer.invoke('call-python-engine', args),

  listCustomNodes: () => ipcRenderer.invoke('list-custom-nodes'),
  openCustomNodesFolder: () => ipcRenderer.invoke('open-custom-nodes-folder'),

  onMessage: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },

  updaterSetChannel: (channel: 'stable' | 'beta') => ipcRenderer.invoke('updater:set-channel', channel),
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterQuitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  updaterOpenReleases: () => ipcRenderer.invoke('updater:open-releases'),
  onUpdaterEvent: (callback: (evt: any) => void) => {
    ipcRenderer.on('aitnt-updater-event', (_event, evt) => callback(evt))
  }
}

contextBridge.exposeInMainWorld('aitntAPI', api)
