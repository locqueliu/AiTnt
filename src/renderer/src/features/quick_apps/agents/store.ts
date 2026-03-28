import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fileJSONStorage } from '../../../core/persist/fileStorage'
import {
  DEFAULT_AGENT_1_TEMPLATE,
  DEFAULT_AGENT_1_TITLE,
  DEFAULT_AGENT_2_TEMPLATE,
  DEFAULT_AGENT_2_TITLE,
  DEFAULT_AGENT_3_TEMPLATE,
  DEFAULT_AGENT_3_TITLE
} from './defaults'

export type AgentRole = 'agent_1' | 'agent_2' | 'agent_3'

export type AgentPreset = {
  id: string
  role: AgentRole
  title: string
  text: string
  favorite?: boolean
  createdAt: number
  updatedAt: number
}

type AgentPresetState = {
  presets: AgentPreset[]
  activePresetId: Record<AgentRole, string | null>

  setActivePreset: (role: AgentRole, id: string | null) => void
  addPreset: (role: AgentRole, title: string, text: string) => AgentPreset
  updatePreset: (id: string, updates: Partial<Pick<AgentPreset, 'title' | 'text' | 'favorite'>>) => void
  removePreset: (id: string) => void
}

function makeDefaultPresets(): AgentPreset[] {
  const now = Date.now()
  const mk = (role: AgentRole, title: string, text: string): AgentPreset => ({
    id: `qa_preset_${role}_${now}_${Math.floor(Math.random() * 1000)}`,
    role,
    title,
    text,
    favorite: true,
    createdAt: now,
    updatedAt: now
  })

  return [
    mk('agent_1', DEFAULT_AGENT_1_TITLE, DEFAULT_AGENT_1_TEMPLATE),
    mk('agent_2', DEFAULT_AGENT_2_TITLE, DEFAULT_AGENT_2_TEMPLATE),
    mk('agent_3', DEFAULT_AGENT_3_TITLE, DEFAULT_AGENT_3_TEMPLATE)
  ]
}

export const useQuickAppAgentPresetStore = create<AgentPresetState>()(
  persist(
    (set, get) => ({
      presets: makeDefaultPresets(),
      activePresetId: { agent_1: null, agent_2: null, agent_3: null },

      setActivePreset: (role, id) => set((state) => ({
        activePresetId: { ...state.activePresetId, [role]: id || null }
      })),

      addPreset: (role, title, text) => {
        const now = Date.now()
        const preset: AgentPreset = {
          id: `qa_preset_${role}_${now}_${Math.floor(Math.random() * 1000)}`,
          role,
          title: String(title || '鏈懡鍚嶆ā鏉?).trim() || '鏈懡鍚嶆ā鏉?,
          text: String(text || '').trim(),
          favorite: false,
          createdAt: now,
          updatedAt: now
        }
        set((state) => ({
          presets: [preset, ...state.presets],
          activePresetId: { ...state.activePresetId, [role]: preset.id }
        }))
        return preset
      },

      updatePreset: (id, updates) => set((state) => ({
        presets: state.presets.map(p => p.id === id ? {
          ...p,
          ...updates,
          title: typeof updates.title === 'string' ? updates.title : p.title,
          text: typeof updates.text === 'string' ? updates.text : p.text,
          updatedAt: Date.now()
        } : p)
      })),

      removePreset: (id) => set((state) => {
        const next = state.presets.filter(p => p.id !== id)
        const active: any = { ...state.activePresetId }
        for (const role of ['agent_1', 'agent_2', 'agent_3'] as AgentRole[]) {
          if (active[role] === id) active[role] = null
        }
        return { presets: next, activePresetId: active }
      })
    }),
    {
      name: 'aitnt-quick-app-agent-presets-v1',
      storage: fileJSONStorage,
      version: 1,
      migrate: (persistedState: any) => {
        try {
          if (!persistedState || typeof persistedState !== 'object') return persistedState
          if (!Array.isArray(persistedState.presets)) persistedState.presets = makeDefaultPresets()
          if (!persistedState.activePresetId || typeof persistedState.activePresetId !== 'object') {
            persistedState.activePresetId = { agent_1: null, agent_2: null, agent_3: null }
          }
          return persistedState
        } catch {
          return persistedState
        }
      }
    }
  )
)

export function pickDefaultPresetText(role: AgentRole): string {
  const state = useQuickAppAgentPresetStore.getState()
  const preset = state.presets.find(p => p.role === role)
  return preset?.text || ''
}

