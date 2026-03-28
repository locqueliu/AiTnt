import { app, BrowserWindow, protocol, net, screen } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { open, stat } from 'fs/promises'
import { createReadStream } from 'fs'
import { Readable } from 'stream'
import { sniffImage } from './utils/sniffImage'
import { sniffVideo } from './utils/sniffVideo'
import { initUpdater } from './updater'
import { kvGetItem, kvSetItem } from './persist/kv'

// Register the local resource scheme before app ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'aitnt', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }
])

let mainWindow: BrowserWindow | null = null

const WINDOW_STATE_KEY = 'window:main'
const DEFAULT_BOUNDS = { width: 1200, height: 800 }
const MIN_BOUNDS = { width: 860, height: 640 }

type WindowState = {
  bounds: { x: number, y: number, width: number, height: number }
  isMaximized?: boolean
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function isFiniteNum(x: any): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

function coerceBounds(raw: any): WindowState['bounds'] | null {
  const b = raw && typeof raw === 'object' ? raw : null
  if (!b) return null
  const x = Number(b.x)
  const y = Number(b.y)
  const width = Number(b.width)
  const height = Number(b.height)
  if (![x, y, width, height].every(isFiniteNum)) return null
  if (width < 100 || height < 100) return null
  return { x, y, width, height }
}

function isMostlyVisible(bounds: WindowState['bounds']) {
  const displays = screen.getAllDisplays()
  for (const d of displays) {
    const wa = d.workArea
    const ix0 = Math.max(bounds.x, wa.x)
    const iy0 = Math.max(bounds.y, wa.y)
    const ix1 = Math.min(bounds.x + bounds.width, wa.x + wa.width)
    const iy1 = Math.min(bounds.y + bounds.height, wa.y + wa.height)
    const iw = Math.max(0, ix1 - ix0)
    const ih = Math.max(0, iy1 - iy0)
    // At least a reasonable portion of the window is inside some display.
    if (iw >= 160 && ih >= 120) return true
  }
  return false
}

function normalizeBounds(bounds: WindowState['bounds']) {
  const primary = screen.getPrimaryDisplay().workArea
  const maxW = Math.max(MIN_BOUNDS.width, primary.width)
  const maxH = Math.max(MIN_BOUNDS.height, primary.height)

  const width = clamp(bounds.width, MIN_BOUNDS.width, maxW)
  const height = clamp(bounds.height, MIN_BOUNDS.height, maxH)

  let x = bounds.x
  let y = bounds.y

  if (!isMostlyVisible({ x, y, width, height })) {
    x = Math.round(primary.x + (primary.width - width) / 2)
    y = Math.round(primary.y + (primary.height - height) / 2)
  }

  return { x, y, width, height }
}

async function loadWindowState(): Promise<WindowState | null> {
  try {
    const raw = await kvGetItem(WINDOW_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const bounds = coerceBounds(parsed?.bounds)
    if (!bounds) return null
    return { bounds, isMaximized: Boolean(parsed?.isMaximized) }
  } catch {
    return null
  }
}

async function saveWindowState(win: BrowserWindow) {
  try {
    const isMaximized = win.isMaximized()
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
    const payload: WindowState = {
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      isMaximized
    }
    await kvSetItem(WINDOW_STATE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

function makeDebounced(fn: () => void, waitMs: number) {
  let t: NodeJS.Timeout | null = null
  return () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = null
      fn()
    }, waitMs)
  }
}

async function createWindow() {
  const saved = await loadWindowState()
  const start = saved?.bounds
    ? normalizeBounds(saved.bounds)
    : normalizeBounds({
      x: 0,
      y: 0,
      width: DEFAULT_BOUNDS.width,
      height: DEFAULT_BOUNDS.height
    })

  mainWindow = new BrowserWindow({
    x: start.x,
    y: start.y,
    width: start.width,
    height: start.height,
    title: 'AiTnt',
    show: false,
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true, // 闅愯棌榛樿鐨?Windows 鑿滃崟鏍?(File, Edit 绛?
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  // 褰诲簳绉婚櫎榛樿鑿滃崟
  mainWindow.removeMenu()

  // 娉ㄥ唽鎵€鏈?IPC 浜嬩欢鐩戝惉 (澶勭悊鍓嶇鍙戞潵鐨勭郴缁熺骇璇锋眰)
  registerIpcHandlers(mainWindow)

  // Initialize the updater bridge for packaged builds.
  initUpdater(mainWindow)

  if (saved?.isMaximized) {
    try {
      mainWindow.maximize()
    } catch {
      // ignore
    }
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    // Load the Vite dev server in development.
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // mainWindow.webContents.openDevTools()
  } else {
    // 鐢熶骇鐜锛氬姞杞芥墦鍖呭悗鐨?HTML 鏂囦欢
    // Vite build output is dist/index.html (see vite.config.ts outDir)
    mainWindow.loadFile(join(__dirname, '../index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.show()
  })

  const debouncedSave = makeDebounced(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    void saveWindowState(mainWindow)
  }, 320)

  mainWindow.on('resize', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) return
    if (mainWindow.isMaximized()) return
    debouncedSave()
  })
  mainWindow.on('move', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) return
    if (mainWindow.isMaximized()) return
    debouncedSave()
  })
  mainWindow.on('maximize', () => debouncedSave())
  mainWindow.on('unmaximize', () => debouncedSave())
  mainWindow.on('close', () => {
    if (!mainWindow) return
    void saveWindowState(mainWindow)
  })
}

app.whenReady().then(() => {
  // Register the local resource protocol.
  protocol.handle('aitnt', async (request) => {
    // aitnt://C:/Users/... 
    // 娉ㄦ剰锛歳equest.url 鍙兘浼氳娴忚鍣ㄦ爣鍑嗗寲锛屼緥濡傛妸鐩樼杞皬鍐欙紝骞跺彲鑳藉甫涓婇澶栫殑鏂滄潬
    try {
       // 缁熶竴瑙ｆ瀽 URL锛氭柊鏍煎紡浼樺厛鐢?query锛堟渶绋冲畾锛夛紝鏃ф牸寮忓吋瀹?pathname
       // - 鏂版牸寮忥細aitnt://local?path=C%3A%5CUsers%5C...%5Cxxx.jpg
       // - 鏃ф牸寮忥細aitnt:///C:/Users/... 鎴?aitnt://C:/Users/...
       const u = new URL(request.url)

       let filePath: string | null = null

       if (u.hostname === 'local') {
         // searchParams.get() already returns a decoded string.
         filePath = u.searchParams.get('path')
       }

       if (!filePath) {
         // Legacy format: recover C:/... from pathname.
         const p = (u.pathname || '').replace(/^\/+/, '')
         filePath = decodeURIComponent(p)
       }

       if (!filePath) {
         return new Response('Not Found', { status: 404 })
       }

        const st = await stat(filePath)
        if (!st.isFile()) {
          return new Response('Not Found', { status: 404 })
        }

        // Sniff a short header to infer the correct MIME type.
        let mimeType = 'application/octet-stream'
        try {
          const fh = await open(filePath, 'r')
          try {
            const head = Buffer.alloc(Math.min(8192, Math.max(512, st.size || 0)))
            const r = await fh.read(head, 0, head.length, 0)
            const slice = r.bytesRead > 0 ? head.subarray(0, r.bytesRead) : head
            const sniffedImg = sniffImage(slice)
            const sniffedVid = sniffedImg ? null : sniffVideo(slice)
            mimeType = sniffedImg?.mime || sniffedVid?.mime || mimeType
          } finally {
            await fh.close()
          }
        } catch {
          // ignore
        }

        if (mimeType === 'application/octet-stream') {
          const lower = filePath.toLowerCase()
          if (lower.endsWith('.png')) mimeType = 'image/png'
          else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mimeType = 'image/jpeg'
          else if (lower.endsWith('.webp')) mimeType = 'image/webp'
          else if (lower.endsWith('.gif')) mimeType = 'image/gif'
          else if (lower.endsWith('.mp4')) mimeType = 'video/mp4'
          else if (lower.endsWith('.webm')) mimeType = 'video/webm'
          else if (lower.endsWith('.mov')) mimeType = 'video/quicktime'
        }

        const size = st.size
        const range = request.headers.get('range') || request.headers.get('Range')

        // 鏀寔 Range锛氳棰戦瑙?鎷栧姩杩涘害鏉″父渚濊禆 206 Partial Content
        if (range) {
          const m = /^bytes=(\d*)-(\d*)$/i.exec(range.trim())
          if (m) {
            const rawStart = m[1]
            const rawEnd = m[2]
            let start = rawStart ? Number(rawStart) : NaN
            let end = rawEnd ? Number(rawEnd) : NaN

            // suffix range: bytes=-500
            if (!rawStart && rawEnd) {
              const suffix = Number(rawEnd)
              if (Number.isFinite(suffix) && suffix > 0) {
                start = Math.max(0, size - suffix)
                end = size - 1
              }
            }

            if (!Number.isFinite(start) || start < 0) start = 0
            if (!Number.isFinite(end) || end <= 0) end = size - 1
            if (end >= size) end = size - 1

            if (start > end || start >= size) {
              return new Response(null, {
                status: 416,
                headers: {
                  'content-range': `bytes */${size}`,
                  'cache-control': 'no-store'
                }
              })
            }

            const nodeStream = createReadStream(filePath, { start, end })
            const webStream = Readable.toWeb(nodeStream as any) as ReadableStream
            const chunkSize = end - start + 1
            return new Response(webStream, {
              status: 206,
              headers: {
                'content-type': mimeType,
                'content-length': String(chunkSize),
                'accept-ranges': 'bytes',
                'content-range': `bytes ${start}-${end}/${size}`,
                'cache-control': 'no-store'
              }
            })
          }
        }

        const nodeStream = createReadStream(filePath)
        const webStream = Readable.toWeb(nodeStream as any) as ReadableStream
        return new Response(webStream, {
          headers: {
            'content-type': mimeType,
            'content-length': String(size),
            'accept-ranges': 'bytes',
            'cache-control': 'no-store'
          }
        })
    } catch (error) {
      console.error('Failed to load local resource:', request.url, error)
      return new Response('Not Found', { status: 404 })
    }
  })

  void createWindow()
})

// Quit when all windows are closed on non-macOS platforms.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

