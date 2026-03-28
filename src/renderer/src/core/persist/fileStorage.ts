import { createJSONStorage } from 'zustand/middleware'

type RawStorage = {
  getItem: (name: string) => Promise<string | null>
  setItem: (name: string, value: string) => Promise<void>
  removeItem: (name: string) => Promise<void>
}

function getRawStorage(): RawStorage {
  return {
    getItem: async (name: string) => {
      const api = (window as any).aitntAPI
      if (!api?.persistGetItem) return null
      const r = await api.persistGetItem(String(name || ''))
      return (r && r.success) ? (r.value ?? null) : null
    },
    setItem: async (name: string, value: string) => {
      const api = (window as any).aitntAPI
      if (!api?.persistSetItem) return
      await api.persistSetItem(String(name || ''), String(value ?? ''))
    },
    removeItem: async (name: string) => {
      const api = (window as any).aitntAPI
      if (!api?.persistRemoveItem) return
      await api.persistRemoveItem(String(name || ''))
    }
  }
}

export const fileJSONStorage = createJSONStorage(() => getRawStorage() as any)

