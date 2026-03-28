import { ipcMain, BrowserWindow, shell, clipboard, nativeImage, dialog, app } from 'electron'
import { join, resolve } from 'path'
import { writeFile, mkdir, rm } from 'fs/promises'
import { existsSync, type Dirent } from 'fs'
import { copyFile } from 'fs/promises'
import { readFile } from 'fs/promises'
import { readdir, stat } from 'fs/promises'
import { sniffImage } from '../utils/sniffImage'
import { sniffVideo } from '../utils/sniffVideo'
import { checkForUpdates, downloadUpdate, openReleasesPage, quitAndInstall, setUpdateChannel, type UpdateChannel } from '../updater'
import { getPersistConfig, getPersistConfigWarning, openDataRootInExplorer, resolveUserPath, setPersistConfig } from '../persist/config'
import { kvGetItem, kvRemoveItem, kvSetItem } from '../persist/kv'

const I2V_INPUT_MANIFEST_KEY = 'aitnt-video-i2v-input-manifest:v1'
const QA_PRODUCT_SHOT_INPUT_MANIFEST_KEY = 'aitnt-qa-product-shot-input-manifest:v1'
const QA_PRODUCT_SHOT_SESSION_KEY = 'aitnt-qa-product-shot-session:v1'

function isSubPath(child: string, parent: string): boolean {
  const c = resolve(String(child || ''))
  const p = resolve(String(parent || ''))
  const sep = /\\/.test(p) ? '\\' : '/'
  const pp = p.endsWith(sep) ? p : (p + sep)
  return c.toLowerCase().startsWith(pp.toLowerCase())
}

async function getInputImageCacheRoot() {
  const cfg = await getPersistConfig()
  return join(cfg.dataRoot, 'cache', 'input-images')
}

async function dirStats(root: string): Promise<{ fileCount: number, totalBytes: number }> {
  if (!root || !existsSync(root)) return { fileCount: 0, totalBytes: 0 }
  let fileCount = 0
  let totalBytes = 0
  const walk = async (dir: string) => {
    const ents = await readdir(dir, { withFileTypes: true } as const) as unknown as Dirent[]
    for (const ent of ents) {
      const p = join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(p)
      } else if (ent.isFile()) {
        try {
          const st = await stat(p)
          fileCount += 1
          totalBytes += Number(st.size || 0)
        } catch {
          // ignore
        }
      }
    }
  }
  try {
    await walk(root)
  } catch {
    return { fileCount: 0, totalBytes: 0 }
  }
  return { fileCount, totalBytes }
}

// 娉ㄥ唽鎵€鏈変富杩涚▼涓庢覆鏌撹繘绋嬬殑閫氫俊浜嬩欢
export function registerIpcHandlers(window: BrowserWindow) {
  
  // 绀轰緥锛氬墠绔兂鐭ラ亾褰撳墠绯荤粺鐜
  ipcMain.handle('get-system-info', () => {
    return { platform: process.platform, arch: process.arch }
  })

  ipcMain.handle('get-app-version', () => {
    return { success: true, version: app.getVersion(), name: app.getName() }
  })

  // Persistent config / storage (file-based, stable across installs)
  ipcMain.handle('persist:get-config', async () => {
    const cfg = await getPersistConfig()
    const warning = getPersistConfigWarning()
    return { success: true, config: cfg, warning: warning || undefined }
  })

  ipcMain.handle('persist:set-config', async (_event, patch) => {
    try {
      const next = await setPersistConfig(patch || {})
      return { success: true, config: next }
    } catch (e: any) {
      return { success: false, error: e?.message || 'set config failed' }
    }
  })

  ipcMain.handle('persist:open-data-root', async () => {
    return openDataRootInExplorer()
  })

  ipcMain.handle('persist:kv-get', async (_event, key: string) => {
    const v = await kvGetItem(String(key || ''))
    return { success: true, value: v }
  })

  ipcMain.handle('persist:kv-set', async (_event, key: string, value: string) => {
    await kvSetItem(String(key || ''), String(value ?? ''))
    return { success: true }
  })

  ipcMain.handle('persist:kv-remove', async (_event, key: string) => {
    await kvRemoveItem(String(key || ''))
    return { success: true }
  })

  // --- Input image cache (dataRoot/cache/input-images) ---
  ipcMain.handle('cache:input-images:stats', async () => {
    try {
      const root = await getInputImageCacheRoot()
      const s = await dirStats(root)
      return { success: true, root, ...s }
    } catch (e: any) {
      return { success: false, error: e?.message || 'failed' }
    }
  })

  ipcMain.handle('cache:input-images:clear', async () => {
    try {
      const root = await getInputImageCacheRoot()
      // Safety: never delete outside dataRoot/cache/input-images
      const cfg = await getPersistConfig()
      const safeRoot = join(cfg.dataRoot, 'cache', 'input-images')
      if (!isSubPath(root, safeRoot) && resolve(root).toLowerCase() !== resolve(safeRoot).toLowerCase()) {
        throw new Error('unsafe cache root')
      }

      await rm(root, { recursive: true, force: true })
      await mkdir(root, { recursive: true })
      // Clear known manifests
      await kvRemoveItem(I2V_INPUT_MANIFEST_KEY)
      await kvRemoveItem(QA_PRODUCT_SHOT_INPUT_MANIFEST_KEY)
      await kvRemoveItem(QA_PRODUCT_SHOT_SESSION_KEY)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'failed' }
    }
  })

  ipcMain.handle('cache:input-images:remove-file', async (_event, args: { localPath?: string, filePath?: string }) => {
    try {
      const raw = String(args?.filePath || args?.localPath || '').trim()
      if (!raw) return { success: false, error: 'missing path' }

      let filePath = raw
      try {
        if (/^aitnt:\/\//i.test(raw)) {
          const u = new URL(raw)
          if (u.hostname === 'local') {
            filePath = String(u.searchParams.get('path') || '').trim()
          }
        }
      } catch {
        // ignore
      }

      if (!filePath) return { success: false, error: 'missing file path' }

      const root = await getInputImageCacheRoot()
      if (!isSubPath(filePath, root)) {
        return { success: false, error: 'unsafe path' }
      }

      await rm(filePath, { force: true })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'failed' }
    }
  })

  // --- Auto updater ---
  ipcMain.handle('updater:set-channel', async (_event, ch: UpdateChannel) => {
    const c: UpdateChannel = (ch === 'beta') ? 'beta' : 'stable'
    setUpdateChannel(c)
    return { success: true, channel: c }
  })

  ipcMain.handle('updater:check', async () => {
    const r = await checkForUpdates()
    return { success: r.ok, error: (r as any).error }
  })

  ipcMain.handle('updater:download', async () => {
    const r = await downloadUpdate()
    return { success: r.ok, error: (r as any).error }
  })

  ipcMain.handle('updater:quit-and-install', async () => {
    const r = quitAndInstall()
    return { success: r.ok, error: (r as any).error }
  })

  ipcMain.handle('updater:open-releases', async () => {
    return openReleasesPage()
  })

  // 涓嬭浇杩滅鍥剧墖骞朵繚瀛樺埌鏈湴
  ipcMain.handle('download-and-save-image', async (event, { url, saveDir, fileName }) => {
    try {
      // 鍏煎鐩稿璺緞锛氫緥濡?settings 榛樿鍊间负 "output"
      const resolvedSaveDir = await resolveUserPath(saveDir, 'image')

      // 纭繚淇濆瓨鐩綍瀛樺湪
      if (!existsSync(resolvedSaveDir)) {
        await mkdir(resolvedSaveDir, { recursive: true })
      }

      // Read image data from either http(s) or a data URL.
      let contentType = ''
      let buffer: Buffer

      if (typeof url === 'string' && url.startsWith('data:')) {
        // data URL: data:image/png;base64,....
        const m = /^data:([^;]+);base64,(.+)$/i.exec(url)
        if (!m) throw new Error('Invalid data url')
        contentType = String(m[1] || '').toLowerCase()
        buffer = Buffer.from(m[2], 'base64')
      } else {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
        // Some CDNs return octet-stream headers, so we still sniff the payload.
        contentType = (response.headers.get('content-type') || '').toLowerCase()
        const arrayBuffer = await response.arrayBuffer()
        buffer = Buffer.from(arrayBuffer)
      }

      const sniffed = sniffImage(buffer)
      const looksLikeImage = Boolean(sniffed) || contentType.startsWith('image/')
      if (!looksLikeImage) {
        // 涓嶆槸鍥剧墖锛氬緢鍙兘鏄?HTML/JSON 閿欒椤碉紙渚嬪閴存潈澶辫触/棰濆害涓嶈冻/璺宠浆鐧诲綍椤碉級
        const preview = buffer.toString('utf8', 0, Math.min(buffer.length, 220))
        throw new Error(`Invalid image response: content-type=${contentType || 'unknown'}; body=${preview}`)
      }

      // 鎵╁睍鍚嶄紭鍏堢敤鍡呮帰缁撴灉锛堟瘮 header 鏇村彲闈狅級
      const ext = sniffed?.ext
        || (contentType.includes('png')
          ? '.png'
          : (contentType.includes('jpeg') || contentType.includes('jpg'))
            ? '.jpg'
            : contentType.includes('webp')
              ? '.webp'
              : contentType.includes('gif')
                ? '.gif'
                : '.img')

      // Normalize the base filename before saving locally.
      const baseName = String(fileName || 'aitnt_image').replace(/\.[^/.]+$/, '')
      const finalName = `${baseName}${ext}`
      const filePath = join(resolvedSaveDir, finalName)
      await writeFile(filePath, buffer)

      // 杩斿洖鏈湴鐨勭粷瀵硅矾寰勶細浣跨敤 query 鎼哄甫鐪熷疄 Windows 璺緞锛岄伩鍏嶇洏绗?鏂滄潬鍦?URL 鏍囧噯鍖栨椂琚牬鍧?      // 渚嬪锛歯exa://local?path=C%3A%5CUsers%5C...%5Cxxx.jpg
      return { success: true, localPath: `aitnt://local?path=${encodeURIComponent(filePath)}` }
    } catch (error: any) {
      console.error('Download image error:', error)
      return { success: false, error: error.message }
    }
  })

  // 涓嬭浇杩滅瑙嗛骞朵繚瀛樺埌鏈湴
  ipcMain.handle('download-and-save-video', async (event, { url, saveDir, fileName }) => {
    try {
      const resolvedSaveDir = await resolveUserPath(saveDir, 'video')
      if (!existsSync(resolvedSaveDir)) {
        await mkdir(resolvedSaveDir, { recursive: true })
      }

      if (!url || typeof url !== 'string') throw new Error('invalid url')

      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`)
      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const sniffed = sniffVideo(buffer)
      const looksLikeVideo = Boolean(sniffed) || contentType.startsWith('video/')
      if (!looksLikeVideo) {
        const preview = buffer.toString('utf8', 0, Math.min(buffer.length, 220))
        throw new Error(`Invalid video response: content-type=${contentType || 'unknown'}; body=${preview}`)
      }

      const ext = sniffed?.ext
        || (contentType.includes('webm')
          ? '.webm'
          : (contentType.includes('quicktime') || contentType.includes('mov'))
            ? '.mov'
            : '.mp4')

      const baseName = String(fileName || 'aitnt_video').replace(/\.[^/.]+$/, '')
      const finalName = `${baseName}${ext}`
      const filePath = join(resolvedSaveDir, finalName)
      await writeFile(filePath, buffer)

      return { success: true, localPath: `aitnt://local?path=${encodeURIComponent(filePath)}` }
    } catch (error: any) {
      console.error('Download video error:', error)
      return { success: false, error: error.message }
    }
  })

  // Export videos to a target folder.
  ipcMain.handle('export-videos-to-dir', async (event, args: { items: { url: string, fileName: string }[], saveDir: string }) => {
    const { items, saveDir } = args || ({} as any)
    if (!Array.isArray(items) || !saveDir) {
      return { success: false, error: 'invalid args' }
    }

    try {
       const resolvedSaveDir = await resolveUserPath(saveDir, 'video')
      if (!existsSync(resolvedSaveDir)) {
        await mkdir(resolvedSaveDir, { recursive: true })
      }

      const saved: string[] = []
      const failed: { fileName: string, error: string }[] = []

      for (const it of items) {
        try {
          const url = String(it.url || '')
          const baseName = String(it.fileName || 'aitnt_export').replace(/\.[^/.]+$/, '')

          // 鏈湴 aitnt://local?path=...
          if (url.startsWith('aitnt://')) {
            const u = new URL(url)
            if (u.hostname === 'local') {
              const srcPath = u.searchParams.get('path')
              if (!srcPath) throw new Error('missing local path')
              const buf = await readFile(srcPath)
              const sniffed = sniffVideo(buf)
              const ext = sniffed?.ext || '.mp4'
              const dest = join(resolvedSaveDir, `${baseName}${ext}`)
              await copyFile(srcPath, dest)
              saved.push(dest)
              continue
            }
          }

          if (!/^https?:\/\//i.test(url)) {
            throw new Error('unsupported url')
          }

          const response = await fetch(url)
          if (!response.ok) throw new Error(`fetch failed: ${response.status} ${response.statusText}`)
          const contentType = (response.headers.get('content-type') || '').toLowerCase()
          const arrayBuffer = await response.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const sniffed = sniffVideo(buffer)
          const looksLikeVideo = Boolean(sniffed) || contentType.startsWith('video/')
          if (!looksLikeVideo) {
            const preview = buffer.toString('utf8', 0, Math.min(buffer.length, 220))
            throw new Error(`invalid video response: content-type=${contentType || 'unknown'}; body=${preview}`)
          }

          const ext = sniffed?.ext
            || (contentType.includes('webm')
              ? '.webm'
              : (contentType.includes('quicktime') || contentType.includes('mov'))
                ? '.mov'
                : '.mp4')

          const dest = join(resolvedSaveDir, `${baseName}${ext}`)
          await writeFile(dest, buffer)
          saved.push(dest)
        } catch (e: any) {
          failed.push({ fileName: String(it.fileName || 'aitnt_export'), error: e?.message || 'export failed' })
        }
      }

      return { success: true, saved, failed }
    } catch (e: any) {
      return { success: false, error: e?.message || 'export failed' }
    }
  })

  // Reveal a file in the system file explorer.
  ipcMain.handle('show-item-in-folder', async (event, { filePath }) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false }
      }
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (e) {
      return { success: false }
    }
  })

  // Select a directory for save or export actions.
  ipcMain.handle('select-directory', async () => {
    try {
      const r = await dialog.showOpenDialog(window, {
        title: '閫夋嫨淇濆瓨浣嶇疆',
        properties: ['openDirectory', 'createDirectory']
      })
      if (r.canceled) return { success: true, dirPath: null }
      const p = r.filePaths && r.filePaths[0]
      return { success: true, dirPath: p || null }
    } catch (e: any) {
      return { success: false, error: e?.message || 'select directory failed' }
    }
  })

  // 瀵煎嚭澶氬紶鍥剧墖鍒版寚瀹氱洰褰曪細鏀寔杩滅涓嬭浇 + 鏈湴鏂囦欢澶嶅埗
  ipcMain.handle('export-images-to-dir', async (event, args: { items: { url: string, fileName: string }[], saveDir: string }) => {
    const { items, saveDir } = args || ({} as any)
    if (!Array.isArray(items) || !saveDir) {
      return { success: false, error: 'invalid args' }
    }

    try {
      const resolvedSaveDir = await resolveUserPath(saveDir, 'image')
      if (!existsSync(resolvedSaveDir)) {
        await mkdir(resolvedSaveDir, { recursive: true })
      }

      const saved: string[] = []
      const failed: { fileName: string, error: string }[] = []

      for (const it of items) {
        try {
          const url = String(it.url || '')
          const baseName = String(it.fileName || 'aitnt_export').replace(/\.[^/.]+$/, '')

          // data url
          if (url.startsWith('data:')) {
            const m = /^data:([^;]+);base64,(.+)$/i.exec(url)
            if (!m) throw new Error('Invalid data url')
            const contentType = String(m[1] || '').toLowerCase()
            const buffer = Buffer.from(m[2], 'base64')
            const sniffed = sniffImage(buffer)
            const ext = sniffed?.ext
              || (contentType.includes('png')
                ? '.png'
                : (contentType.includes('jpeg') || contentType.includes('jpg'))
                  ? '.jpg'
                  : contentType.includes('webp')
                    ? '.webp'
                    : contentType.includes('gif')
                      ? '.gif'
                      : '.img')
            const dest = join(resolvedSaveDir, `${baseName}${ext}`)
            await writeFile(dest, buffer)
            saved.push(dest)
            continue
          }

          // 鏈湴 aitnt://local?path=...
          if (url.startsWith('aitnt://')) {
            const u = new URL(url)
            if (u.hostname === 'local') {
              const srcPath = u.searchParams.get('path')
              if (!srcPath) throw new Error('missing local path')

              const buf = await readFile(srcPath)
              const sniffed = sniffImage(buf)
              const ext = sniffed?.ext || '.img'
              const dest = join(resolvedSaveDir, `${baseName}${ext}`)
              await copyFile(srcPath, dest)
              saved.push(dest)
              continue
            }
          }

          // 杩滅锛歨ttp(s)
          if (!/^https?:\/\//i.test(url)) {
            throw new Error('unsupported url')
          }

          const response = await fetch(url)
          if (!response.ok) throw new Error(`fetch failed: ${response.status} ${response.statusText}`)
          const contentType = (response.headers.get('content-type') || '').toLowerCase()
          const arrayBuffer = await response.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const sniffed = sniffImage(buffer)
          const looksLikeImage = Boolean(sniffed) || contentType.startsWith('image/')
          if (!looksLikeImage) {
            const preview = buffer.toString('utf8', 0, Math.min(buffer.length, 220))
            throw new Error(`invalid image response: content-type=${contentType || 'unknown'}; body=${preview}`)
          }

          const ext = sniffed?.ext
            || (contentType.includes('png')
              ? '.png'
              : (contentType.includes('jpeg') || contentType.includes('jpg'))
                ? '.jpg'
                : contentType.includes('webp')
                  ? '.webp'
                  : contentType.includes('gif')
                    ? '.gif'
                    : '.img')

          const dest = join(resolvedSaveDir, `${baseName}${ext}`)
          await writeFile(dest, buffer)
          saved.push(dest)
        } catch (e: any) {
          failed.push({ fileName: String(it.fileName || 'aitnt_export'), error: e?.message || 'export failed' })
        }
      }

      return { success: true, saved, failed }
    } catch (e: any) {
      return { success: false, error: e?.message || 'export failed' }
    }
  })

  // 澶嶅埗鍥剧墖鍒扮郴缁熷壀璐存澘
  ipcMain.handle('copy-image-to-clipboard', async (event, { url }) => {
    try {
      if (!url || typeof url !== 'string') {
        return { success: false, error: 'invalid url' }
      }

      // 缁熶竴鑾峰彇鍥剧墖 buffer
      let buffer: Buffer | null = null

      // 鏈湴锛歯exa://local?path=...
      if (url.startsWith('aitnt://')) {
        try {
          const u = new URL(url)
          if (u.hostname === 'local') {
            const p = u.searchParams.get('path')
            if (p) {
              buffer = await readFile(p)
            }
          }
        } catch {
          // 蹇界暐锛岃蛋鍚庣画 fallback
        }
      }

      // data url
      if (!buffer && typeof url === 'string' && url.startsWith('data:')) {
        const m = /^data:([^;]+);base64,(.+)$/i.exec(url)
        if (m) {
          buffer = Buffer.from(m[2], 'base64')
        }
      }

      // 杩滅锛歨ttp(s)
      if (!buffer && /^https?:\/\//i.test(url)) {
        const resp = await fetch(url)
        if (!resp.ok) {
          return { success: false, error: `fetch failed: ${resp.status}` }
        }
        const ab = await resp.arrayBuffer()
        buffer = Buffer.from(ab)
      }

      if (!buffer) {
        return { success: false, error: 'unsupported url' }
      }

      const img = nativeImage.createFromBuffer(buffer)
      if (img.isEmpty()) {
        return { success: false, error: 'invalid image buffer' }
      }

      clipboard.writeImage(img)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'copy failed' }
    }
  })

  // 绀轰緥锛氱獥鍙ｆ渶灏忓寲
  ipcMain.on('window-minimize', () => {
    if (window.isMinimizable()) {
      window.minimize()
    }
  })

  // 绀轰緥锛氳皟鐢ㄦ湰鍦?Python 寮曟搸 (棰勭暀缁欏悗鏈?AI 绠楁硶)
  ipcMain.handle('call-python-engine', async (event, args) => {
    // Placeholder bridge for a future local Python engine.
    console.log('Received Python bridge call:', args)
    return { success: true, message: 'Python Engine connected' }
  })

  // 鑺傜偣搴擄細鎵弿 custom_nodes 鐩綍涓嬬殑 node.json
  ipcMain.handle('list-custom-nodes', async () => {
    const root = resolve('custom_nodes')

    try {
      if (!existsSync(root)) {
        await mkdir(root, { recursive: true })
      }
    } catch (e: any) {
      // If the folder cannot be created, return an empty node list with a warning.
      return { success: true, root, nodes: [], warning: e?.message || 'cannot create custom_nodes' }
    }

    type Listed = { manifest: any; manifestPath: string }
    const out: Listed[] = []

    const maxDepth = 8
    const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]

    while (stack.length > 0) {
      const cur = stack.pop()!
      if (cur.depth > maxDepth) continue
      let entries: string[] = []
      try {
        entries = await readdir(cur.dir)
      } catch {
        continue
      }

      for (const name of entries) {
        const full = join(cur.dir, name)
        let st: any
        try {
          st = await stat(full)
        } catch {
          continue
        }

        if (st.isDirectory()) {
          // skip hidden-ish folders
          if (name.startsWith('.')) continue
          stack.push({ dir: full, depth: cur.depth + 1 })
          continue
        }

        if (!st.isFile()) continue
        if (name.toLowerCase() !== 'node.json') continue

        try {
          const text = await readFile(full, 'utf8')
          const parsed = JSON.parse(text)
          out.push({ manifest: parsed, manifestPath: full })
        } catch {
          // ignore bad json
        }
      }
    }

    return { success: true, root, nodes: out }
  })

  // 鎵撳紑 custom_nodes 鏂囦欢澶癸紙渚涚敤鎴锋暣鐞嗚妭鐐癸級
  ipcMain.handle('open-custom-nodes-folder', async () => {
    const root = resolve('custom_nodes')
    try {
      if (!existsSync(root)) {
        await mkdir(root, { recursive: true })
      }
      await shell.openPath(root)
      return { success: true, root }
    } catch (e: any) {
      return { success: false, error: e?.message || 'open folder failed', root }
    }
  })

}

