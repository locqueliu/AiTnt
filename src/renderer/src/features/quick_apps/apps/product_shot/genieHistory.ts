import { useEffect, useMemo, useState } from 'react'
import { kvGetJsonMigrate, kvSetJson } from '../../../../core/persist/kvClient'

type GenieTemplateSource = 'editor' | 'set'

export type GenieHistoryItem = {
  id: string
  createdAt: number

  providerId?: string
  model?: string

  templateSource: GenieTemplateSource
  baseSetId?: string

  idea: string
  useImages: boolean
  imageSendCount: number

  raw: string
  parsed?: { agent1Template: string, agent2Template: string, agent3Template: string, notes?: string[] }
}

const STORAGE_KEY = 'aitnt-qa-product-shot-genie-history:v1'
const MAX_ITEMS = 30

function clampInt(n: any, min: number, max: number) {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

function sanitizeText(s: any) {
  return String(s ?? '').replace(/\r\n/g, '\n')
}

function makeId() {
  return `qa_ps_genie_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function sanitizeItem(x: any): GenieHistoryItem | null {
  if (!x || typeof x !== 'object') return null
  const createdAt = Number(x.createdAt || 0)
  const raw = sanitizeText(x.raw)
  const idea = sanitizeText(x.idea)
  const templateSource = String(x.templateSource || '') as GenieTemplateSource
  const useImages = Boolean(x.useImages)
  const imageSendCount = clampInt(x.imageSendCount, 0, 99)

  if (!createdAt || !raw.trim()) return null
  if (templateSource !== 'editor' && templateSource !== 'set') return null

  const parsed = x.parsed && typeof x.parsed === 'object'
    ? {
      agent1Template: sanitizeText(x.parsed.agent1Template),
      agent2Template: sanitizeText(x.parsed.agent2Template),
      agent3Template: sanitizeText(x.parsed.agent3Template),
      notes: Array.isArray(x.parsed.notes)
        ? (x.parsed.notes as any[]).map(sanitizeText).map(s => s.trim()).filter(Boolean).slice(0, 12)
        : undefined
    }
    : undefined

  return {
    id: String(x.id || '').trim() || makeId(),
    createdAt,
    providerId: String(x.providerId || '').trim() || undefined,
    model: String(x.model || '').trim() || undefined,
    templateSource,
    baseSetId: String(x.baseSetId || '').trim() || undefined,
    idea: idea.trim().slice(0, 1600),
    useImages,
    imageSendCount,
    raw: raw.trim(),
    parsed: (parsed && parsed.agent1Template.trim() && parsed.agent2Template.trim() && parsed.agent3Template.trim()) ? parsed : undefined
  }
}

export function useGenieHistory() {
  const [hydrated, setHydrated] = useState(false)
  const [items, setItems] = useState<GenieHistoryItem[]>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const v = await kvGetJsonMigrate<any>(STORAGE_KEY, null)
        if (!alive) return
        const list = Array.isArray(v) ? v : (Array.isArray(v?.items) ? v.items : [])
        const next = (list as any[])
          .map(sanitizeItem)
          .filter(Boolean) as GenieHistoryItem[]
        next.sort((a, b) => b.createdAt - a.createdAt)
        setItems(next.slice(0, MAX_ITEMS))
      } catch {
        // ignore
      } finally {
        if (alive) setHydrated(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const t = window.setTimeout(() => {
      void kvSetJson(STORAGE_KEY, (items || []).slice(0, MAX_ITEMS))
    }, 320)
    return () => window.clearTimeout(t)
  }, [hydrated, items])

  const api = useMemo(() => {
    return {
      hydrated,
      items,
      add: (input: Omit<GenieHistoryItem, 'id' | 'createdAt'> & { createdAt?: number }) => {
        const now = Number(input.createdAt || Date.now()) || Date.now()
        const created: GenieHistoryItem = {
          id: makeId(),
          createdAt: now,
          providerId: String(input.providerId || '').trim() || undefined,
          model: String(input.model || '').trim() || undefined,
          templateSource: input.templateSource,
          baseSetId: String(input.baseSetId || '').trim() || undefined,
          idea: sanitizeText(input.idea).trim().slice(0, 1600),
          useImages: Boolean(input.useImages),
          imageSendCount: clampInt(input.imageSendCount, 0, 99),
          raw: sanitizeText(input.raw).trim(),
          parsed: input.parsed
        }
        setItems(prev => [created, ...(prev || [])].slice(0, MAX_ITEMS))
        return created
      },
      remove: (id: string) => setItems(prev => (prev || []).filter(x => x.id !== id)),
      clear: () => setItems([])
    }
  }, [hydrated, items])

  return api
}

