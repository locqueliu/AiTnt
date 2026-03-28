import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  kind: ToastKind
  text: string
  details?: string
}

type ToastState = {
  toasts: ToastItem[]
  push: (t: { kind: ToastKind, text: string, details?: string, timeoutMs?: number }) => void
  remove: (id: string) => void
  clear: () => void
}

function makeId() {
  return `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (t) => {
    const id = makeId()
    const item: ToastItem = {
      id,
      kind: t.kind,
      text: String(t.text || ''),
      details: t.details ? String(t.details) : undefined
    }
    set(state => ({ toasts: [item, ...(state.toasts || [])].slice(0, 4) }))

    const timeout = Math.max(1200, Math.min(12000, Number(t.timeoutMs) || 3200))
    window.setTimeout(() => {
      // avoid removing if already cleared
      const cur = get().toasts
      if (!cur.find(x => x.id === id)) return
      get().remove(id)
    }, timeout)
  },

  remove: (id) => set(state => ({ toasts: (state.toasts || []).filter(t => t.id !== id) })),
  clear: () => set({ toasts: [] })
}))

// Non-hook helper
export function uiToast(kind: ToastKind, text: string, details?: string) {
  useToastStore.getState().push({ kind, text, details })
}
