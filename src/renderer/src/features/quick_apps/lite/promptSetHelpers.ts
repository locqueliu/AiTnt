import type { PromptSet } from '../prompt_library/store'

export type PromptSetImportDraft = {
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

function sanitizeText(value: unknown) {
  return String(value ?? '').replace(/\r\n/g, '\n')
}

export function safeFileName(value: string) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120) || 'aitnt-template'
}

export function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 200)
}

export function readFileText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read the selected file.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsText(file)
  })
}

function parseTags(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const tags = value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, 24)
  return tags.length > 0 ? tags : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toImportDraft(value: unknown): PromptSetImportDraft | null {
  if (!isRecord(value)) return null

  const name = String(value.name || '').trim()
  const agent1Template = sanitizeText(value.agent1Template)
  const agent2Template = sanitizeText(value.agent2Template)
  const agent3Template = sanitizeText(value.agent3Template)

  if (!name || !agent1Template.trim() || !agent2Template.trim() || !agent3Template.trim()) {
    return null
  }

  return {
    name,
    category: String(value.category || '').trim() || undefined,
    tags: parseTags(value.tags),
    agent1Template,
    agent2Template,
    agent3Template,
    agent1Model: String(value.agent1Model || '').trim() || undefined,
    agent2Model: String(value.agent2Model || '').trim() || undefined,
    genModel: String(value.genModel || '').trim() || undefined,
    genRatio: String(value.genRatio || '').trim() || undefined,
    genRes: String(value.genRes || '').trim() || undefined
  }
}

export function parsePromptSetImports(text: string): PromptSetImportDraft[] {
  const raw = String(text || '').trim()
  if (!raw) return []

  const parsed = JSON.parse(raw)
  if (isRecord(parsed) && Array.isArray(parsed.sets)) {
    return parsed.sets.map(toImportDraft).filter(Boolean) as PromptSetImportDraft[]
  }

  const single = toImportDraft(parsed)
  return single ? [single] : []
}

export function makeUniquePromptSetName(existing: PromptSet[], desiredName: string, category?: string) {
  const base = String(desiredName || '').trim() || 'Untitled Prompt Set'
  const categoryValue = String(category || '').trim()
  const matches = (name: string) =>
    (existing || []).some((set) => {
      if (set.appId !== 'product_shot') return false
      if (String(set.name || '').trim() !== name) return false
      return String(set.category || '').trim() === categoryValue
    })

  if (!matches(base)) return base

  let suffix = 2
  while (true) {
    const nextName = `${base} ${suffix}`
    if (!matches(nextName)) return nextName
    suffix += 1
  }
}

export function exportPromptSet(set: PromptSet) {
  return {
    schema: 'aitnt.prompt_set.v1',
    exportedAt: Date.now(),
    appId: 'product_shot',
    name: String(set.name || '').trim() || 'Untitled Prompt Set',
    category: String(set.category || '').trim() || undefined,
    tags: parseTags(set.tags),
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

export function exportPromptSetBundle(sets: PromptSet[]) {
  return {
    schema: 'aitnt.prompt_set_bundle.v1',
    exportedAt: Date.now(),
    appId: 'product_shot',
    sets: (sets || []).filter((set) => set.appId === 'product_shot').map(exportPromptSet)
  }
}

export function makeStarterPromptSet(name = 'Core Product Visuals') {
  return {
    appId: 'product_shot' as const,
    name,
    category: 'Commerce',
    tags: ['product', 'studio', 'clean-light'],
    favorite: true,
    agent1Template: [
      'You are a product analysis specialist.',
      'Review the provided product photos and describe the product identity, materials, construction, key selling points, and visual details that must stay consistent.',
      'Return a concise production-ready brief in English.'
    ].join('\n\n'),
    agent2Template: [
      'You are an art director for premium commerce imagery.',
      'Use the product photos and any extra references to design a strong scene direction, camera plan, lighting setup, styling notes, and composition guidance.',
      'Return a concise creative direction brief in English.'
    ].join('\n\n'),
    agent3Template: [
      'Combine the product brief and the creative direction into one final image prompt.',
      'Keep the description clear, cinematic, and production-ready.',
      'Do not mention internal roles or step names.'
    ].join('\n\n'),
    genRatio: '1:1',
    genRes: '1K'
  }
}
