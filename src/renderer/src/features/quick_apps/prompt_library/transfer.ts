import type { PromptSet } from './store'

export type PromptSetExportV1 = {
  schema: 'aitnt.prompt_set.v1'
  exportedAt: number
  appId: 'product_shot'

  name: string
  category?: string
  tags?: string[]

  agent1Template: string
  agent2Template: string
  agent3Template: string

  agent1Model?: string
  agent2Model?: string
  genModel?: string
  genRatio?: string
  genRes?: string
}

export type PromptSetBundleExportV1 = {
  schema: 'aitnt.prompt_set_bundle.v1'
  exportedAt: number
  appId: 'product_shot'
  sets: PromptSetExportV1[]
}

function sanitizeText(s: any) {
  return String(s ?? '').replace(/\r\n/g, '\n')
}

export function safeFileName(name: string) {
  return String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').slice(0, 120) || 'template'
}

export function makeUniqueFileName(baseNameNoExt: string, used: Set<string>) {
  const base = safeFileName(baseNameNoExt)
  let cur = base
  let i = 2
  while (used.has(cur.toLowerCase())) {
    cur = `${base}(${i})`
    i += 1
  }
  used.add(cur.toLowerCase())
  return `${cur}.json`
}

export function downloadJson(fileName: string, obj: unknown) {
  const text = JSON.stringify(obj, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 200)
}

export function exportPromptSetV1(set: PromptSet): PromptSetExportV1 {
  return {
    schema: 'aitnt.prompt_set.v1',
    exportedAt: Date.now(),
    appId: 'product_shot',
    name: String(set.name || '').trim() || '鏈懡鍚嶆ā鏉跨粍',
    category: String(set.category || '').trim() || undefined,
    tags: Array.isArray(set.tags) ? set.tags.map(String).map(s => s.trim()).filter(Boolean).slice(0, 24) : undefined,
    agent1Template: sanitizeText(set.agent1Template),
    agent2Template: sanitizeText(set.agent2Template),
    agent3Template: sanitizeText(set.agent3Template),
    agent1Model: String(set.agent1Model || '').trim() || undefined,
    agent2Model: String(set.agent2Model || '').trim() || undefined,
    genModel: String(set.genModel || '').trim() || undefined,
    genRatio: String(set.genRatio || '').trim() || undefined,
    genRes: String(set.genRes || '').trim() || undefined
  }
}

function isObj(v: any): v is Record<string, any> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function sanitizeExportV1(x: any): PromptSetExportV1 | null {
  if (!isObj(x)) return null
  const a1 = sanitizeText(x.agent1Template)
  const a2 = sanitizeText(x.agent2Template)
  const a3 = sanitizeText(x.agent3Template)
  const name = String(x.name || '').trim()
  if (!name || !a1.trim() || !a2.trim() || !a3.trim()) return null
  return {
    schema: 'aitnt.prompt_set.v1',
    exportedAt: Number(x.exportedAt || Date.now()) || Date.now(),
    appId: 'product_shot',
    name,
    category: String(x.category || '').trim() || undefined,
    tags: Array.isArray(x.tags) ? x.tags.map(String).map(s => s.trim()).filter(Boolean).slice(0, 24) : undefined,
    agent1Template: a1,
    agent2Template: a2,
    agent3Template: a3,
    agent1Model: String(x.agent1Model || '').trim() || undefined,
    agent2Model: String(x.agent2Model || '').trim() || undefined,
    genModel: String(x.genModel || '').trim() || undefined,
    genRatio: String(x.genRatio || '').trim() || undefined,
    genRes: String(x.genRes || '').trim() || undefined
  }
}

export function parsePromptSetImports(text: string): PromptSetExportV1[] {
  const raw = String(text || '').trim()
  if (!raw) return []
  const parsed = JSON.parse(raw)

  // bundle
  if (isObj(parsed) && Array.isArray((parsed as any).sets)) {
    const list = ((parsed as any).sets as any[])
      .map(sanitizeExportV1)
      .filter(Boolean) as PromptSetExportV1[]
    return list
  }

  // single
  const one = sanitizeExportV1(parsed)
  return one ? [one] : []
}

export function makeUniqueImportedName(existing: PromptSet[], desiredName: string, category?: string) {
  const base = String(desiredName || '').trim() || '鏈懡鍚嶆ā鏉跨粍'
  const cat = String(category || '').trim()
  const exists = (name: string) => {
    return (existing || []).some(s => {
      if (s.appId !== 'product_shot') return false
      if (String(s.name || '').trim() !== name) return false
      return String(s.category || '').trim() === cat
    })
  }

  if (!exists(base)) return base
  const withSuffix = `${base}锛堝鍏ワ級`
  if (!exists(withSuffix)) return withSuffix
  let i = 2
  while (true) {
    const n = `${base}锛堝鍏?{i}锛塦
    if (!exists(n)) return n
    i += 1
  }
}

export async function pickJsonFiles(multiple: boolean): Promise<File[]> {
  return await new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.multiple = Boolean(multiple)
    input.onchange = () => {
      const files = Array.from(input.files || [])
      resolve(files)
    }
    input.click()
  })
}

