// 娓叉煋杩涚▼鍙敤鐨?Electron 棰勫姞杞?API 绫诲瀷澹版槑
// 璇存槑锛氳繖閲屼粎鍋氱被鍨嬫彁绀猴紱鐪熷疄瀹炵幇浣嶄簬 src/preload/index.ts 涓?src/main/ipc/index.ts

export {}

declare global {
  interface Window {
    aitntAPI?: {
      getSystemInfo: () => Promise<{ platform: string, arch: string }>
      getAppVersion: () => Promise<{ success: boolean, version: string, name: string }>
      minimizeWindow: () => void

      // File-based persistence config
      getPersistConfig: () => Promise<{ success: boolean, config: { setupCompleted: boolean, dataRoot: string, imageOutputDirectory: string, videoOutputDirectory: string }, warning?: string }>
      setPersistConfig: (patch: any) => Promise<{ success: boolean, config?: { setupCompleted: boolean, dataRoot: string, imageOutputDirectory: string, videoOutputDirectory: string }, error?: string }>
      openDataRoot: () => Promise<{ ok: boolean, path?: string }>
      persistGetItem: (key: string) => Promise<{ success: boolean, value: string | null }>
      persistSetItem: (key: string, value: string) => Promise<{ success: boolean }>
      persistRemoveItem: (key: string) => Promise<{ success: boolean }>

      // Input image cache (dataRoot/cache/input-images)
      inputImageCacheStats: () => Promise<{ success: boolean, root?: string, fileCount?: number, totalBytes?: number, error?: string }>
      clearInputImageCache: () => Promise<{ success: boolean, error?: string }>
      removeInputImageCacheFile: (args: { localPath?: string, filePath?: string }) => Promise<{ success: boolean, error?: string }>

      // 涓嬭浇鍥剧墖鍒版湰鍦帮紙鐢变富杩涚▼瀹屾垚鏂囦欢鍐欏叆锛?      downloadImage: (args: { url: string, saveDir: string, fileName: string }) => Promise<{ success: boolean, localPath?: string, error?: string }>

      // 涓嬭浇瑙嗛鍒版湰鍦?      downloadVideo: (args: { url: string, saveDir: string, fileName: string }) => Promise<{ success: boolean, localPath?: string, error?: string }>

      // 鍦ㄨ祫婧愮鐞嗗櫒涓畾浣嶆枃浠?      showItemInFolder: (args: { filePath: string }) => Promise<{ success: boolean }>

      // 閫夋嫨鐩綍锛堢敤浜庡鍑猴級
      selectDirectory: () => Promise<{ success: boolean, dirPath?: string | null, error?: string }>

      // 瀵煎嚭澶氬紶鍥剧墖鍒扮洰褰曪紙鏀寔鏈湴澶嶅埗/杩滅涓嬭浇锛?      exportImagesToDir: (args: { items: { url: string, fileName: string }[], saveDir: string }) => Promise<{ success: boolean, saved?: string[], failed?: { fileName: string, error: string }[], error?: string }>

      // 瀵煎嚭澶氭瑙嗛鍒扮洰褰?      exportVideosToDir: (args: { items: { url: string, fileName: string }[], saveDir: string }) => Promise<{ success: boolean, saved?: string[], failed?: { fileName: string, error: string }[], error?: string }>

      // 灏嗗浘鐗囧鍒跺埌绯荤粺鍓创鏉匡紙鐢变富杩涚▼瀹屾垚锛屽彲闈犳€ф洿楂橈級
      copyImageToClipboard: (args: { url: string }) => Promise<{ success: boolean, error?: string }>

      // 鑺傜偣搴擄細鎵弿 custom_nodes
      listCustomNodes: () => Promise<{ success: boolean, root: string, nodes: Array<{ manifest: any, manifestPath: string }>, warning?: string }>

      // 鎵撳紑 custom_nodes 鏂囦欢澶?      openCustomNodesFolder: () => Promise<{ success: boolean, root: string, error?: string }>

      callPython: (args: any) => Promise<any>
      onMessage: (channel: string, callback: (...args: any[]) => void) => void

      // Auto updater
      updaterSetChannel: (channel: 'stable' | 'beta') => Promise<{ success: boolean, channel?: 'stable' | 'beta' }>
      updaterCheck: () => Promise<{ success: boolean, error?: string }>
      updaterDownload: () => Promise<{ success: boolean, error?: string }>
      updaterQuitAndInstall: () => Promise<{ success: boolean, error?: string }>
      updaterOpenReleases: () => Promise<{ ok: boolean, url?: string }>
      onUpdaterEvent: (callback: (evt: any) => void) => void
    }
  }
}

