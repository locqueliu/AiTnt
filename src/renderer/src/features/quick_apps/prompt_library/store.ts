import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fileJSONStorage } from '../../../core/persist/fileStorage'

export type PromptSetAppId = 'product_shot'

export type PromptSet = {
  id: string
  appId: PromptSetAppId
  name: string
  category?: string
  tags?: string[]
  favorite?: boolean
  coverUrl?: string
  createdAt: number
  updatedAt: number

  agent1Template: string
  agent2Template: string
  agent3Template: string

  // optional defaults
  agent1Model?: string
  agent2Model?: string
  genModel?: string
  genRatio?: string
  genRes?: string
}

type PromptLibraryState = {
  sets: PromptSet[]
  activeSetIdByApp: Record<PromptSetAppId, string | null>

  setActive: (appId: PromptSetAppId, id: string | null) => void
  addSet: (set: Omit<PromptSet, 'id' | 'createdAt' | 'updatedAt'>) => PromptSet
  updateSet: (id: string, patch: Partial<Omit<PromptSet, 'id' | 'appId' | 'createdAt'>>) => void
  removeSet: (id: string) => void
  toggleFavorite: (id: string) => void
}

function makeId() {
  return `qa_pset_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function sanitizeText(s: any) {
  return String(s ?? '').replace(/\r\n/g, '\n')
}

export const usePromptLibraryStore = create<PromptLibraryState>()(
  persist(
    (set, get) => ({
      sets: [],
      activeSetIdByApp: { product_shot: null },

      setActive: (appId, id) => set((state) => ({
        activeSetIdByApp: { ...state.activeSetIdByApp, [appId]: id || null }
      })),

      addSet: (setInput) => {
        const now = Date.now()
        const created: PromptSet = {
          id: makeId(),
          appId: setInput.appId,
          name: String(setInput.name || 'Untitled Prompt Set').trim() || 'Untitled Prompt Set',
          category: String(setInput.category || '').trim() || undefined,
          tags: Array.isArray(setInput.tags) ? setInput.tags.map(String).map(s => s.trim()).filter(Boolean).slice(0, 12) : undefined,
          favorite: Boolean(setInput.favorite),
          coverUrl: String((setInput as any)?.coverUrl || '').trim() || undefined,
          createdAt: now,
          updatedAt: now,

          agent1Template: sanitizeText(setInput.agent1Template),
          agent2Template: sanitizeText(setInput.agent2Template),
          agent3Template: sanitizeText(setInput.agent3Template),

          agent1Model: String(setInput.agent1Model || '').trim() || undefined,
          agent2Model: String(setInput.agent2Model || '').trim() || undefined,
          genModel: String(setInput.genModel || '').trim() || undefined,
          genRatio: String(setInput.genRatio || '').trim() || undefined,
          genRes: String(setInput.genRes || '').trim() || undefined
        }

        set((state) => ({
          sets: [created, ...(state.sets || [])],
          activeSetIdByApp: { ...state.activeSetIdByApp, [created.appId]: created.id }
        }))
        return created
      },

      updateSet: (id, patch) => set((state) => ({
        sets: (state.sets || []).map(s => s.id !== id ? s : {
          ...s,
          ...patch,
          name: typeof patch.name === 'string' ? (patch.name.trim() || s.name) : s.name,
          category: typeof patch.category === 'string' ? (patch.category.trim() || undefined) : s.category,
          coverUrl: typeof (patch as any).coverUrl === 'string' ? (((patch as any).coverUrl as string).trim() || undefined) : s.coverUrl,
          agent1Template: typeof patch.agent1Template === 'string' ? sanitizeText(patch.agent1Template) : s.agent1Template,
          agent2Template: typeof patch.agent2Template === 'string' ? sanitizeText(patch.agent2Template) : s.agent2Template,
          agent3Template: typeof patch.agent3Template === 'string' ? sanitizeText(patch.agent3Template) : s.agent3Template,
          agent1Model: typeof patch.agent1Model === 'string' ? (patch.agent1Model.trim() || undefined) : s.agent1Model,
          agent2Model: typeof patch.agent2Model === 'string' ? (patch.agent2Model.trim() || undefined) : s.agent2Model,
          genModel: typeof patch.genModel === 'string' ? (patch.genModel.trim() || undefined) : s.genModel,
          genRatio: typeof patch.genRatio === 'string' ? (patch.genRatio.trim() || undefined) : s.genRatio,
          genRes: typeof patch.genRes === 'string' ? (patch.genRes.trim() || undefined) : s.genRes,
          updatedAt: Date.now()
        })
      })),

      removeSet: (id) => set((state) => {
        const target = (state.sets || []).find(s => s.id === id) || null
        const next = (state.sets || []).filter(s => s.id !== id)
        const active = { ...state.activeSetIdByApp }
        if (target && active[target.appId] === id) active[target.appId] = null
        return { sets: next, activeSetIdByApp: active }
      }),

      toggleFavorite: (id) => set((state) => ({
        sets: (state.sets || []).map(s => s.id !== id ? s : { ...s, favorite: !s.favorite, updatedAt: Date.now() })
      }))
    }),
    {
      name: 'aitnt-prompt-library-v1',
      storage: fileJSONStorage,
      version: 1,
      migrate: (persisted: any) => {
        try {
          if (!persisted || typeof persisted !== 'object') return persisted
          if (!Array.isArray(persisted.sets)) persisted.sets = []
          // coverUrl is optional; keep as-is
          if (!persisted.activeSetIdByApp || typeof persisted.activeSetIdByApp !== 'object') {
            persisted.activeSetIdByApp = { product_shot: null }
          }
          if (persisted.activeSetIdByApp.product_shot === undefined) persisted.activeSetIdByApp.product_shot = null
          return persisted
        } catch {
          return persisted
        }
      }
    }
  )
)

export function listPromptSetsForApp(appId: PromptSetAppId) {
  const sets = usePromptLibraryStore.getState().sets || []
  return sets
    .filter(s => s.appId === appId)
    .slice()
    .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.updatedAt - a.updatedAt)
}

