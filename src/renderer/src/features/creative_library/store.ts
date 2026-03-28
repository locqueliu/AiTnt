import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fileJSONStorage } from '../../core/persist/fileStorage'
import type { CreativeIdea, CreativeLibraryMode, CreativeCategory, CreativePromptIdea, CreativeOptimizeIdea } from './types'
import { DEFAULT_OPTIMIZE_IDEAS, DEFAULT_PROMPT_IDEAS } from './data/defaultIdeas'

// 鍒涙剰搴撶姸鎬佺鐞嗭紙鎸佷箙鍖栧埌鏈湴锛?
type CreativeLibraryState = {
  promptIdeas: CreativePromptIdea[]
  optimizeIdeas: CreativeOptimizeIdea[]

  // 鏈€杩戜娇鐢細瀛樺偍鍒涙剰 id锛堟寜鏃堕棿鍊掑簭锛屽幓閲嶏級
  recentUsedIds: string[]

  // UI 鐘舵€?  activeMode: CreativeLibraryMode
  setActiveMode: (mode: CreativeLibraryMode) => void

  activeCategory: CreativeCategory
  setActiveCategory: (category: CreativeCategory) => void

  search: string
  setSearch: (v: string) => void

  // 鏁版嵁鎿嶄綔
  addPromptIdea: (idea: Omit<CreativePromptIdea, 'id' | 'createdAt' | 'updatedAt'>) => void
  addOptimizeIdea: (idea: Omit<CreativeOptimizeIdea, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateIdea: (id: string, updates: Partial<CreativeIdea>) => void
  removeIdea: (id: string) => void
  toggleFavorite: (id: string) => void

  // 璁板綍鏈€杩戜娇鐢?  recordUsed: (id: string) => void

  // 瀵煎叆/瀵煎嚭锛堝厛鍋氭渶绠€锛氬瓧绗︿覆锛?  exportJson: () => string
  importJson: (json: string) => { ok: boolean, error?: string }
}

export const useCreativeLibraryStore = create<CreativeLibraryState>()(
  persist(
    (set, get) => ({
      promptIdeas: DEFAULT_PROMPT_IDEAS,
      optimizeIdeas: DEFAULT_OPTIMIZE_IDEAS,

      recentUsedIds: [],

      activeMode: 't2i',
      setActiveMode: (mode) => set({ activeMode: mode }),

      activeCategory: 'all',
      setActiveCategory: (category) => set({ activeCategory: category }),

      search: '',
      setSearch: (v) => set({ search: v }),

      addPromptIdea: (idea) => set((state) => {
        const now = Date.now()
        const newIdea: CreativePromptIdea = {
          ...idea,
          kind: 'prompt',
          id: `idea_${now}_${Math.floor(Math.random() * 1000)}`,
          createdAt: now,
          updatedAt: now
        }
        return { promptIdeas: [newIdea, ...state.promptIdeas] }
      }),

      addOptimizeIdea: (idea) => set((state) => {
        const now = Date.now()
        const newIdea: CreativeOptimizeIdea = {
          ...idea,
          kind: 'optimize',
          id: `idea_${now}_${Math.floor(Math.random() * 1000)}`,
          createdAt: now,
          updatedAt: now
        }
        return { optimizeIdeas: [newIdea, ...state.optimizeIdeas] }
      }),

      updateIdea: (id, updates) => set((state) => ({
        promptIdeas: state.promptIdeas.map(i => i.id === id ? { ...i, ...updates, updatedAt: Date.now() } as any : i),
        optimizeIdeas: state.optimizeIdeas.map(i => i.id === id ? { ...i, ...updates, updatedAt: Date.now() } as any : i)
      })),

      removeIdea: (id) => set((state) => ({
        promptIdeas: state.promptIdeas.filter(i => i.id !== id),
        optimizeIdeas: state.optimizeIdeas.filter(i => i.id !== id)
      })),

      toggleFavorite: (id) => set((state) => ({
        promptIdeas: state.promptIdeas.map(i => i.id === id ? { ...i, favorite: !i.favorite, updatedAt: Date.now() } : i),
        optimizeIdeas: state.optimizeIdeas.map(i => i.id === id ? { ...i, favorite: !i.favorite, updatedAt: Date.now() } : i)
      })),

      recordUsed: (id) => set((state) => {
        const max = 20
        const next = [id, ...state.recentUsedIds.filter(x => x !== id)].slice(0, max)
        return { recentUsedIds: next }
      }),

      exportJson: () => {
        const { promptIdeas, optimizeIdeas } = get()
        return JSON.stringify({ promptIdeas, optimizeIdeas }, null, 2)
      },

      importJson: (json) => {
        try {
          const parsed = JSON.parse(json)
          if (!parsed || typeof parsed !== 'object') {
            return { ok: false, error: 'JSON 鏍煎紡涓嶆纭' }
          }

          const now = Date.now()
          const normalizeMode = (m: any): CreativeLibraryMode => {
            const v = String(m || '').trim()
            if (v === 't2i' || v === 'i2i' || v === 't2v' || v === 'i2v') return v as CreativeLibraryMode
            return 't2i'
          }
          const normalizeBase = (x: any) => {
            return {
              id: String(x.id || `idea_${now}_${Math.floor(Math.random() * 1000)}`),
              mode: normalizeMode(x.mode),
              title: String(x.title || '鏈懡鍚嶅垱鎰'),
              category: String(x.category || '鍏朵粬') as any,
              listTitle: typeof x.listTitle === 'string' && x.listTitle.trim() ? x.listTitle.trim() : undefined,
              listSubtitle: typeof x.listSubtitle === 'string' && x.listSubtitle.trim() ? x.listSubtitle.trim() : undefined,
              coverKind: (x.coverKind === 'emoji' || x.coverKind === 'image') ? x.coverKind : undefined,
              coverValue: typeof x.coverValue === 'string' ? x.coverValue : undefined,
              tags: Array.isArray(x.tags) ? x.tags.map(String) : undefined,
              favorite: Boolean(x.favorite),
              createdAt: Number.isFinite(x.createdAt) ? x.createdAt : now,
              updatedAt: Number.isFinite(x.updatedAt) ? x.updatedAt : now
            }
          }

          // 鍏煎鏃ф牸寮忥細{ ideas: [...] }
          if (Array.isArray((parsed as any).ideas)) {
            const oldIdeas = (parsed as any).ideas as any[]
            const prompts: CreativePromptIdea[] = []
            const opts: CreativeOptimizeIdea[] = []
            for (const x of oldIdeas) {
              if (!x || typeof x !== 'object') continue
              const base = normalizeBase(x)
              const p = String(x.prompt || '').trim()
              const o = typeof x.optimizeCustomText === 'string' ? x.optimizeCustomText.trim() : ''
              if (p) {
                prompts.push({ ...base, kind: 'prompt', prompt: p })
              }
              if (o) {
                opts.push({ ...base, kind: 'optimize', id: base.id + '_opt', optimizeCustomText: o })
              }
            }
            set({ promptIdeas: prompts, optimizeIdeas: opts })
            return { ok: true }
          }

          // 鏂版牸寮忥細{ promptIdeas, optimizeIdeas }
          const promptsRaw = Array.isArray((parsed as any).promptIdeas) ? (parsed as any).promptIdeas : []
          const optsRaw = Array.isArray((parsed as any).optimizeIdeas) ? (parsed as any).optimizeIdeas : []

          const prompts: CreativePromptIdea[] = (promptsRaw as any[])
            .filter(x => x && typeof x === 'object')
            .map(x => ({
              ...normalizeBase(x),
              kind: 'prompt' as const,
              prompt: String((x as any).prompt || '').trim()
            }))
            .filter(i => i.prompt.trim())

          const opts: CreativeOptimizeIdea[] = (optsRaw as any[])
            .filter(x => x && typeof x === 'object')
            .map(x => ({
              ...normalizeBase(x),
              kind: 'optimize' as const,
              optimizeCustomText: String((x as any).optimizeCustomText || '').trim()
            }))
            .filter(i => i.optimizeCustomText.trim())

          set({ promptIdeas: prompts, optimizeIdeas: opts })
          return { ok: true }
        } catch (e: any) {
          return { ok: false, error: e?.message || 'JSON 瑙ｆ瀽澶辫触' }
        }
      }
    }),
    {
      // 淇濇寔鏃?key锛氳鍘嗗彶鏁版嵁鍙互鑷姩杩佺Щ
      name: 'aitnt-creative-library-v1',
      storage: fileJSONStorage,
      version: 2,
      migrate: (persistedState: any) => {
        // 浠?v1 ideas[] 杩佺Щ鍒?v2 promptIdeas[] + optimizeIdeas[]
        try {
          if (!persistedState || typeof persistedState !== 'object') return persistedState
          if (Array.isArray(persistedState.promptIdeas) || Array.isArray(persistedState.optimizeIdeas)) return persistedState
          const old = Array.isArray(persistedState.ideas) ? persistedState.ideas : []
          if (!Array.isArray(old)) return persistedState

          const now = Date.now()
          const normalizeMode = (m: any): CreativeLibraryMode => {
            const v = String(m || '').trim()
            if (v === 't2i' || v === 'i2i' || v === 't2v' || v === 'i2v') return v as CreativeLibraryMode
            return 't2i'
          }
          const prompts: CreativePromptIdea[] = []
          const opts: CreativeOptimizeIdea[] = []

          for (const x of old) {
            if (!x || typeof x !== 'object') continue
            const base: any = {
              id: String(x.id || `idea_${now}_${Math.floor(Math.random() * 1000)}`),
              mode: normalizeMode((x as any).mode),
              title: String(x.title || '鏈懡鍚嶅垱鎰'),
              category: String(x.category || '鍏朵粬') as any,
              listTitle: typeof x.listTitle === 'string' ? x.listTitle : undefined,
              listSubtitle: typeof x.listSubtitle === 'string' ? x.listSubtitle : undefined,
              coverKind: (x.coverKind === 'emoji' || x.coverKind === 'image') ? x.coverKind : undefined,
              coverValue: typeof x.coverValue === 'string' ? x.coverValue : undefined,
              tags: Array.isArray(x.tags) ? x.tags.map(String) : undefined,
              favorite: Boolean(x.favorite),
              createdAt: Number.isFinite(x.createdAt) ? x.createdAt : now,
              updatedAt: Number.isFinite(x.updatedAt) ? x.updatedAt : now
            }
            const p = String((x as any).prompt || '').trim()
            const o = typeof (x as any).optimizeCustomText === 'string' ? String((x as any).optimizeCustomText).trim() : ''
            if (p) prompts.push({ ...base, kind: 'prompt', prompt: p })
            if (o) opts.push({ ...base, kind: 'optimize', id: base.id + '_opt', optimizeCustomText: o })
          }
          const next = { ...persistedState }
          delete (next as any).ideas
          next.promptIdeas = prompts
          next.optimizeIdeas = opts
          return next
        } catch {
          return persistedState
        }
      }
    }
  )
)

