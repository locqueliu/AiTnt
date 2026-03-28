import { create } from 'zustand'
import { generateImage, RequestDebug, ResponseDebug } from '../../core/api/image'
import { kvGetJsonMigrate, kvRemove, kvSetJson } from '../../core/persist/kvClient'

// 鍥剧墖鐢熸垚浠诲姟鍏ㄥ眬瀛樺偍锛堜慨澶嶏細鐢熸垚涓垏鎹㈤〉闈㈠鑷翠换鍔′涪澶憋級
// 璁捐鐩爣锛?// - 鐢熸垚璇锋眰涓庣姸鎬佹洿鏂颁笉渚濊禆鏌愪釜椤甸潰缁勪欢鏄惁鎸傝浇
// - 鎴愬姛/澶辫触缁撴灉鍙法椤甸潰淇濈暀锛涘埛鏂版寜閽彲浠?localStorage 閲嶆柊鍔犺浇

export interface ImageTask {
  id: string
  createdAt?: number
  mode: 't2i' | 'i2i'
  status: 'loading' | 'success' | 'error'
  url?: string
  errorMsg?: string
  ratio: string
  prompt: string
  optimizePreference?: string
  targetSize?: string
  actualSize?: string

  // 璋冭瘯锛氱敤浜庡鍒垛€滆姹備唬鐮佲€濓紙鍐呴儴宸茶劚鏁?apiKey锛?  request?: RequestDebug

  // 璋冭瘯锛氱敤浜庡湪棰勮閲屽睍绀衡€滄帴鍙ｈ繑鍥炩€濓紙鍐呴儴宸茶劚鏁忓苟鎴柇锛?  response?: ResponseDebug

  // 鍥剧敓鍥撅細杈撳叆鍥剧墖淇℃伅锛堜粎鐢ㄤ簬灞曠ず/鎺掓煡锛屼笉瀛樺ぇ浣撶Н base64锛?  inputImageName?: string
  inputImageNames?: string[]
  inputImageCount?: number
}

type GenerateArgs = {
  mode: 't2i' | 'i2i'
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  ratio: string
  targetSize: string
  imageSize: string
  optimizePreference?: string
  batchCount: number
  inputImagesBase64?: string[]
  inputImageNames?: string[]
  // 鑷姩淇濆瓨寮€鍏筹細鍏抽棴鏃朵笉瑙﹀彂涓昏繘绋嬩笅杞斤紝鍙睍绀鸿繙绔?url
  saveDir?: string
}

type GenerateOneArgs = {
  mode: 't2i' | 'i2i'
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  ratio: string
  targetSize: string
  imageSize: string
  optimizePreference?: string
  inputImagesBase64?: string[]
  inputImageNames?: string[]
  saveDir?: string
}

type ImageGenState = {
  tasks: ImageTask[]
  hydrateFromStorage: () => void
  refreshFromStorage: () => void
  patchTask: (id: string, patch: Partial<ImageTask>) => void
  deleteTask: (id: string) => void
  clearTasks: () => void
  clearTasksByMode: (mode: 't2i' | 'i2i') => void
  enqueueGenerateBatch: (args: GenerateArgs) => void
  enqueueGenerateOne: (args: GenerateOneArgs) => void
}

const LS_KEY = 'aitnt-image-tasks'
const LOADING_STALE_MS = 1000 * 60 * 20 // 20 鍒嗛挓锛氶槻姝㈤噸鍚悗姘歌繙 loading

function formatErrorMessage(e: any): string {
  const base = String(e?.message || '鐢熸垚澶辫触')
  const status = e?.response?.status
  const data = e?.response?.data

  let extra = ''
  if (status) extra += ` (HTTP ${status})`

  if (data !== undefined) {
    let body = ''
    try {
      body = typeof data === 'string' ? data : JSON.stringify(data)
    } catch {
      body = ''
    }
    body = (body || '').trim()
    if (body) {
      // 閬垮厤鎶婃暣娈?HTML/瓒呴暱鎶ラ敊濉炶繘 localStorage
      if (body.length > 1200) body = body.slice(0, 1200) + '...'
      extra += `\n${body}`
    }
  }

  return `${base}${extra}`
}

function normalizeTasks(list: ImageTask[]): ImageTask[] {
  const now = Date.now()
  return (list || []).map(t => {
    // 鍏煎鏃х増鏈繚瀛樼殑 aitnt://C:/...锛圕hromium 浼氭妸 C: 褰撴垚 host 瀵艰嚧鐩樼涓㈠け锛夛紝缁熶竴淇涓?aitnt:///C:/...
    let url = t.url
    if (url && url.startsWith('aitnt://') && !url.startsWith('aitnt:///')) {
      url = url.replace(/^aitnt:\/\/([A-Za-z]:\/)/, 'aitnt:///$1')
    }

    const createdAt = t.createdAt || now
    const mode = (t as any).mode === 'i2i' ? 'i2i' : 't2i'
    const optimizePreference = t.optimizePreference || ''

    const inputImageNames = Array.isArray((t as any).inputImageNames) ? (t as any).inputImageNames.map(String) : undefined
    const inputImageCount = typeof (t as any).inputImageCount === 'number'
      ? (t as any).inputImageCount
      : (inputImageNames ? inputImageNames.length : undefined)

    // 濡傛灉鏄巻鍙查仐鐣欑殑 loading锛堜緥濡傚簲鐢ㄩ噸鍚?鍒锋柊锛夛紝鏍囪涓?error锛岄伩鍏嶆案杩滃崱浣?    if (t.status === 'loading' && now - createdAt > LOADING_STALE_MS) {
      return {
        ...t,
        url,
        createdAt,
        mode,
        optimizePreference,
        inputImageNames,
        inputImageCount,
        status: 'error',
        errorMsg: t.errorMsg || '浠诲姟宸蹭腑鏂紙鍙兘鏄垏鎹㈤〉闈?鍒锋柊/閲嶅惎瀵艰嚧锛?
      }
    }

    return { ...t, url, createdAt, mode, optimizePreference, inputImageNames, inputImageCount }
  })
}

async function loadFromStorage(): Promise<ImageTask[]> {
  const parsed = await kvGetJsonMigrate<ImageTask[]>(LS_KEY, [])
  return normalizeTasks(Array.isArray(parsed) ? parsed : [])
}

async function saveToStorage(tasks: ImageTask[]) {
  await kvSetJson(LS_KEY, tasks)
}

export const useImageGenStore = create<ImageGenState>((set, get) => ({
  tasks: [],

  hydrateFromStorage: () => {
    void (async () => {
      const tasks = await loadFromStorage()
      set({ tasks })
    })()
  },

  refreshFromStorage: () => {
    // 鍒锋柊锛氶噸鏂拌鍙栨寔涔呭寲骞跺仛鍏煎淇
    void (async () => {
      const tasks = await loadFromStorage()
      set({ tasks })
    })()
  },

  patchTask: (id, patch) => {
    set(state => {
      const next = state.tasks.map(t => (t.id === id ? { ...t, ...patch } : t))
      void saveToStorage(next)
      return { tasks: next }
    })
  },

  deleteTask: (id) => {
    set(state => {
      const next = state.tasks.filter(t => t.id !== id)
      void saveToStorage(next)
      return { tasks: next }
    })
  },

  clearTasks: () => {
    set({ tasks: [] })
    void kvRemove(LS_KEY)
  },

  clearTasksByMode: (mode) => {
    set(state => {
      const next = state.tasks.filter(t => t.mode !== mode)
      void saveToStorage(next)
      return { tasks: next }
    })
  },

  enqueueGenerateBatch: (args) => {
    const now = Date.now()
      const newTasks: ImageTask[] = Array.from({ length: Math.max(1, Math.min(10, args.batchCount || 1)) }).map((_, i) => ({
        id: `${now}_${i}`,
        createdAt: now,
        mode: args.mode,
        status: 'loading',
        ratio: args.ratio,
        prompt: args.prompt,
        targetSize: args.targetSize,
        optimizePreference: args.optimizePreference || '',
        inputImageName: (args.inputImageNames && args.inputImageNames[0]) || undefined,
        inputImageNames: args.inputImageNames,
        inputImageCount: Array.isArray(args.inputImageNames) ? args.inputImageNames.length : undefined
      }))

    set(state => {
      const next = [...newTasks, ...state.tasks]
      void saveToStorage(next)
      return { tasks: next }
    })

    // 骞跺彂鍙戦€佽姹傦紙璇锋眰鍦?store 鍐呭惎鍔紝椤甸潰鍗歌浇鍚庝粛浼氱户缁苟鏇存柊 store锛?    newTasks.forEach(async (task) => {
      try {
          const urls = await generateImage({
            baseUrl: args.baseUrl,
            apiKey: args.apiKey,
            model: args.model,
            prompt: args.prompt,
            n: 1,
            size: args.targetSize
            ,aspectRatio: (args.ratio === 'Auto' ? '1:1' : args.ratio)
            ,imageSize: args.imageSize
            ,image: (Array.isArray(args.inputImagesBase64) && args.inputImagesBase64.length > 0) ? args.inputImagesBase64 : undefined
            ,onRequest: (req) => {
              get().patchTask(task.id, { request: req })
            }
            ,onResponse: (resp) => {
              get().patchTask(task.id, { response: resp })
            }
          })

        if (urls.length > 0) {
          // 鍏堢敤杩滅 url 绔嬪嵆灞曠ず锛岄伩鍏嶇瓑寰呬笅杞藉鑷粹€滄樉绀哄緢鎱⑩€?          const remoteUrl = urls[0]
          get().patchTask(task.id, { status: 'success', url: remoteUrl })

          // 鑷姩淇濆瓨锛氬悗鍙颁笅杞斤紝鎴愬姛鍚庢妸 url 鎹㈡垚鏈湴 aitnt://local
          if (args.saveDir && window.aitntAPI?.downloadImage) {
            const fileName = `aitnt_${Date.now()}_${Math.floor(Math.random() * 1000)}`
            try {
              const dl = await window.aitntAPI.downloadImage({ url: remoteUrl, saveDir: args.saveDir, fileName })
              if (dl.success && dl.localPath) {
                get().patchTask(task.id, { url: dl.localPath })
              }
            } catch {
              // 蹇界暐涓嬭浇澶辫触锛屼繚鐣欒繙绔?url
            }
          }
        } else {
          get().patchTask(task.id, { status: 'error', errorMsg: 'no images returned' })
        }
      } catch (e: any) {
        get().patchTask(task.id, { status: 'error', errorMsg: formatErrorMessage(e) })
      }
    })
  },

  enqueueGenerateOne: (args) => {
    const now = Date.now()
    const task: ImageTask = {
      id: `${now}_remake`,
      createdAt: now,
      mode: args.mode,
      status: 'loading',
      ratio: args.ratio,
      prompt: args.prompt,
      targetSize: args.targetSize,
      optimizePreference: args.optimizePreference || '',
      inputImageName: (args.inputImageNames && args.inputImageNames[0]) || undefined,
      inputImageNames: args.inputImageNames,
      inputImageCount: Array.isArray(args.inputImageNames) ? args.inputImageNames.length : undefined
    }

    set(state => {
      const next = [task, ...state.tasks]
      void saveToStorage(next)
      return { tasks: next }
    })

    ;(async () => {
      try {
        const urls = await generateImage({
          baseUrl: args.baseUrl,
          apiKey: args.apiKey,
          model: args.model,
          prompt: args.prompt,
          n: 1,
          size: args.targetSize
          ,aspectRatio: (args.ratio === 'Auto' ? '1:1' : args.ratio)
          ,imageSize: args.imageSize
          ,image: (Array.isArray(args.inputImagesBase64) && args.inputImagesBase64.length > 0) ? args.inputImagesBase64 : undefined
          ,onRequest: (req) => {
            get().patchTask(task.id, { request: req })
          }
          ,onResponse: (resp) => {
            get().patchTask(task.id, { response: resp })
          }
        })

        if (urls.length > 0) {
          const remoteUrl = urls[0]
          get().patchTask(task.id, { status: 'success', url: remoteUrl })

          if (args.saveDir && window.aitntAPI?.downloadImage) {
            const fileName = `aitnt_${Date.now()}_${Math.floor(Math.random() * 1000)}`
            try {
              const dl = await window.aitntAPI.downloadImage({ url: remoteUrl, saveDir: args.saveDir, fileName })
              if (dl.success && dl.localPath) {
                get().patchTask(task.id, { url: dl.localPath })
              }
            } catch {
              // 蹇界暐
            }
          }
        } else {
          get().patchTask(task.id, { status: 'error', errorMsg: 'no images returned' })
        }
      } catch (e: any) {
        get().patchTask(task.id, { status: 'error', errorMsg: formatErrorMessage(e) })
      }
    })()
  }
}))

