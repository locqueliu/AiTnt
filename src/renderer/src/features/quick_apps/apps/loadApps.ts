import type { QuickAppWorkflow } from '../types'

type ModuleShape = { default?: QuickAppWorkflow }

function normalizeWorkflow(w: QuickAppWorkflow): QuickAppWorkflow {
  const meta = w?.meta as any
  if (!meta || typeof meta !== 'object') {
    throw new Error('quick app workflow: missing meta')
  }
  if (!meta.id || typeof meta.id !== 'string') {
    throw new Error('quick app workflow: missing meta.id')
  }
  if (!meta.name || typeof meta.name !== 'string') {
    throw new Error(`quick app workflow ${meta.id}: missing meta.name`)
  }
  if (!meta.kind) meta.kind = 'image'
  if (meta.requiresImage == null) meta.requiresImage = true
  if (meta.requiresPrompt == null) meta.requiresPrompt = true
  return w
}

function buildCatalog() {
  const mods = import.meta.glob('./*/workflow.ts', { eager: true }) as Record<string, ModuleShape>
  const list: QuickAppWorkflow[] = []
  for (const k of Object.keys(mods)) {
    const m = mods[k]
    if (!m?.default) continue
    list.push(normalizeWorkflow(m.default))
  }

  // Stable ordering: category -> name
  list.sort((a, b) => {
    const ca = String(a.meta.category || '')
    const cb = String(b.meta.category || '')
    if (ca !== cb) return ca.localeCompare(cb)
    return String(a.meta.name || '').localeCompare(String(b.meta.name || ''))
  })

  const byId = new Map<string, QuickAppWorkflow>()
  for (const w of list) {
    byId.set(w.meta.id, w)
  }

  return { list, byId }
}

export const quickAppsCatalog = buildCatalog()
