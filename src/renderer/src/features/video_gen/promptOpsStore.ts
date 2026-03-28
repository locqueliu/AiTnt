import { create } from 'zustand'
import { uiToast } from '../ui/toastStore'
import { optimizePrompt, translatePromptToEnglish } from '../../core/api/chat'
import { loadVideoUiPersisted, saveVideoUiPersisted, type VideoUiState } from './utils/persistUi'
import { kvGetJsonMigrate, kvSetJson } from '../../core/persist/kvClient'

export type VideoPromptOpKind = 'optimize' | 'translate'
export type VideoPromptMode = 't2v' | 'i2v'

export type VideoPromptHistoryItem = { id: string, op: VideoPromptOpKind, text: string, at: number }

type RefImageLike = {
  sourceDataUrl?: string
  localPath?: string
  dataUrl?: string
}

type ModeState = {
  busy: VideoPromptOpKind | null
  lastResult: { op: VideoPromptOpKind, text: string, at: number } | null
  history: VideoPromptHistoryItem[]
  historyHydrated?: boolean
}

type StoreState = {
  byMode: Record<VideoPromptMode, ModeState>

  hydrateHistory: (mode: VideoPromptMode) => void

  optimize: (args: {
    mode: VideoPromptMode
    baseUrl: string
    apiKey: string
    model: string
    prompt: string
    preference?: string
    refImages?: RefImageLike[]
    fallbackUi: VideoUiState
  }) => void

  translate: (args: {
    mode: VideoPromptMode
    baseUrl: string
    apiKey: string
    model: string
    prompt: string
    preference?: string
    fallbackUi: VideoUiState
  }) => void
}

function historyKey(mode: VideoPromptMode) {
  return `aitnt-video-prompt-history:v1:${mode}`
}

function makeId() {
  return `vh_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function normalizeHistory(raw: any): VideoPromptHistoryItem[] {
  const list = Array.isArray(raw) ? raw : []
  const out: VideoPromptHistoryItem[] = []
  for (const x of list) {
    if (!x || typeof x !== 'object') continue
    const op = (x as any).op === 'translate' ? 'translate' : 'optimize'
    const text = String((x as any).text || '').trim()
    const at = Number((x as any).at || 0)
    const id = String((x as any).id || '').trim() || makeId()
    if (!text) continue
    out.push({ id, op, text, at: Number.isFinite(at) && at > 0 ? at : Date.now() })
  }
  return out.slice(0, 30)
}

async function saveHistory(mode: VideoPromptMode, items: VideoPromptHistoryItem[]) {
  try {
    await kvSetJson(historyKey(mode), items.slice(0, 30))
  } catch {
    // ignore
  }
}

function isDataUrl(s: string) {
  return /^data:/i.test(String(s || ''))
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

async function srcToDataUrl(src: string): Promise<string> {
  const s = String(src || '').trim()
  if (!s) throw new Error('missing src')
  if (isDataUrl(s)) return s
  const resp = await fetch(s)
  if (!resp.ok) throw new Error(`璇诲彇鍥剧墖澶辫触锛?{resp.status}`)
  const blob = await resp.blob()
  return await blobToDataUrl(blob)
}

async function resolveRefImageDataUrls(refImages: RefImageLike[] | undefined): Promise<string[]> {
  const list = Array.isArray(refImages) ? refImages : []
  if (!list.length) return []

  const out: string[] = []
  for (const img of list) {
    const src = String(img?.sourceDataUrl || '').trim()
    if (src && isDataUrl(src)) {
      out.push(src)
      continue
    }

    const p = String(img?.localPath || img?.dataUrl || '').trim()
    if (!p) continue
    try {
      const dataUrl = await srcToDataUrl(p)
      if (isDataUrl(dataUrl)) out.push(dataUrl)
    } catch {
      // ignore single image failure
    }
  }

  return out
}

async function persistPrompt(mode: VideoPromptMode, prompt: string, fallbackUi: VideoUiState) {
  try {
    const cur = await loadVideoUiPersisted(mode, fallbackUi)
    await saveVideoUiPersisted(mode, { ...cur, prompt: String(prompt || '') })
  } catch {
    // ignore
  }
}

export const useVideoPromptOpsStore = create<StoreState>((set, get) => ({
  byMode: {
    t2v: { busy: null, lastResult: null, history: [], historyHydrated: false },
    i2v: { busy: null, lastResult: null, history: [], historyHydrated: false }
  },

  hydrateHistory: (mode) => {
    const cur = get().byMode[mode]
    if (cur?.historyHydrated) return
    // mark hydrated early to avoid duplicate loads
    set(state => ({
      byMode: {
        ...state.byMode,
        [mode]: { ...state.byMode[mode], historyHydrated: true }
      }
    }))
    ;(async () => {
      try {
        const raw = await kvGetJsonMigrate<any>(historyKey(mode), [])
        const parsed = normalizeHistory(raw)
        set(state => ({
          byMode: {
            ...state.byMode,
            [mode]: { ...state.byMode[mode], history: parsed, historyHydrated: true }
          }
        }))
      } catch {
        // ignore
      }
    })()
  },

  optimize: (args) => {
    const mode = args.mode
    const cur = get().byMode[mode]
    if (cur?.busy) return

    set(state => ({
      byMode: {
        ...state.byMode,
        [mode]: { ...state.byMode[mode], busy: 'optimize' }
      }
    }))

    ;(async () => {
      try {
        const refDataUrls = await resolveRefImageDataUrls(args.refImages)
        const out = await optimizePrompt(
          args.baseUrl,
          args.apiKey,
          args.model,
          args.prompt,
          args.preference,
          refDataUrls
        )

        await persistPrompt(mode, out, args.fallbackUi)

        const item: VideoPromptHistoryItem = { id: makeId(), op: 'optimize', text: out, at: Date.now() }
        const prev = get().byMode[mode]?.history || []
        const nextHistory = [item, ...prev.filter(x => x.text !== out)].slice(0, 30)
        await saveHistory(mode, nextHistory)

        set(state => ({
          byMode: {
            ...state.byMode,
            [mode]: {
              busy: null,
              lastResult: { op: 'optimize', text: out, at: item.at },
              history: nextHistory,
              historyHydrated: true
            }
          }
        }))
        uiToast('success', '浼樺寲瀹屾垚')
      } catch (e: any) {
        uiToast('error', `浼樺寲澶辫触锛?{e?.message || '鏈煡閿欒'}`)
        set(state => ({
          byMode: {
            ...state.byMode,
            [mode]: { ...state.byMode[mode], busy: null }
          }
        }))
      }
    })()
  },

  translate: (args) => {
    const mode = args.mode
    const cur = get().byMode[mode]
    if (cur?.busy) return

    set(state => ({
      byMode: {
        ...state.byMode,
        [mode]: { ...state.byMode[mode], busy: 'translate' }
      }
    }))

    ;(async () => {
      try {
        const out = await translatePromptToEnglish(
          args.baseUrl,
          args.apiKey,
          args.model,
          args.prompt,
          args.preference
        )
        await persistPrompt(mode, out, args.fallbackUi)

        const item: VideoPromptHistoryItem = { id: makeId(), op: 'translate', text: out, at: Date.now() }
        const prev = get().byMode[mode]?.history || []
        const nextHistory = [item, ...prev.filter(x => x.text !== out)].slice(0, 30)
        await saveHistory(mode, nextHistory)

        set(state => ({
          byMode: {
            ...state.byMode,
            [mode]: {
              busy: null,
              lastResult: { op: 'translate', text: out, at: item.at },
              history: nextHistory,
              historyHydrated: true
            }
          }
        }))
        uiToast('success', '宸茬敓鎴愯嫳鏂囨彁绀鸿瘝')
      } catch (e: any) {
        uiToast('error', `缈昏瘧澶辫触锛?{e?.message || '鏈煡閿欒'}`)
        set(state => ({
          byMode: {
            ...state.byMode,
            [mode]: { ...state.byMode[mode], busy: null }
          }
        }))
      }
    })()
  }
}))

