import { create } from 'zustand'
import type { NodeManifest } from './types'
import { builtinNodeManifests } from './builtinNodes'

function isObject(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === 'object'
}

function toStr(x: unknown) {
  return typeof x === 'string' ? x : ''
}

function normalizeManifest(raw: unknown): NodeManifest | null {
  if (!isObject(raw)) return null

  const schema_version = toStr(raw.schema_version)
  const node_id = toStr(raw.node_id)
  const version = toStr(raw.version)
  const display_name = toStr(raw.display_name)

  const iface = (raw as any).interface
  const inputs = iface?.inputs
  const outputs = iface?.outputs

  if (schema_version !== '1.0') return null
  if (!node_id || !version || !display_name) return null
  if (!Array.isArray(inputs) || !Array.isArray(outputs)) return null

  const m: NodeManifest = {
    schema_version: '1.0',
    node_id,
    version,
    display_name,
    description: toStr((raw as any).description) || undefined,
    category: toStr((raw as any).category) || undefined,
    tags: Array.isArray((raw as any).tags) ? (raw as any).tags.filter((t: any) => typeof t === 'string') : undefined,
    search_aliases: Array.isArray((raw as any).search_aliases) ? (raw as any).search_aliases.filter((t: any) => typeof t === 'string') : undefined,
    runtime: {
      kind: toStr((raw as any).runtime?.kind) || 'custom',
      entry: toStr((raw as any).runtime?.entry) || undefined
    },
    interface: {
      inputs: inputs as any,
      outputs: outputs as any,
      params: Array.isArray(iface?.params) ? (iface.params as any) : undefined
    },
    permissions: Array.isArray((raw as any).permissions) ? (raw as any).permissions.filter((p: any) => typeof p === 'string') : undefined
  }

  return m
}

export interface NodeRegistryState {
  builtins: NodeManifest[]
  customs: NodeManifest[]
  loading: boolean
  error: string | null
  roots: string[]

  refresh: () => Promise<void>
  getManifest: (nodeId: string) => NodeManifest | undefined
}

export const useNodeRegistryStore = create<NodeRegistryState>()((set, get) => ({
  builtins: builtinNodeManifests,
  customs: [],
  loading: false,
  error: null,
  roots: [],

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const api = (window as any).aitntAPI
      if (!api || typeof api.listCustomNodes !== 'function') {
        set({ customs: [], roots: [], loading: false })
        return
      }

      const r = await api.listCustomNodes()
      if (!r || r.success !== true) {
        set({ customs: [], roots: [], loading: false, error: 'listCustomNodes failed' })
        return
      }

      const customs: NodeManifest[] = []
      const seen = new Set<string>()
      const builtinIds = new Set(get().builtins.map(b => b.node_id))

      for (const it of Array.isArray(r.nodes) ? r.nodes : []) {
        const m = normalizeManifest(it?.manifest)
        if (!m) continue
        if (builtinIds.has(m.node_id)) continue
        if (seen.has(m.node_id)) continue
        seen.add(m.node_id)
        customs.push(m)
      }

      set({ customs, roots: [String(r.root || '')].filter(Boolean), loading: false, error: r.warning ? String(r.warning) : null })
    } catch (e: any) {
      set({ customs: [], roots: [], loading: false, error: e?.message || 'refresh failed' })
    }
  },

  getManifest: (nodeId: string) => {
    const s = get()
    return s.customs.find(n => n.node_id === nodeId) || s.builtins.find(n => n.node_id === nodeId)
  }
}))

