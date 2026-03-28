import type { ApiProvider } from '../store'

export type ApiKeyUsage = 'image' | 'prompt' | 'translate' | 'video' | 'models'

export function resolveApiKey(provider: ApiProvider | undefined | null, usage: ApiKeyUsage): string {
  const p = provider as any
  if (!p) return ''

  const usageMap = (p.keyUsage || {}) as any
  const id = usage === 'image'
    ? usageMap.imageKeyId
    : usage === 'prompt'
      ? usageMap.promptKeyId
      : usage === 'translate'
        ? usageMap.translateKeyId
        : usage === 'video'
          ? usageMap.videoKeyId
          : usageMap.modelsKeyId

  const list = Array.isArray(p.apiKeys) ? p.apiKeys : []
  if (id) {
    const hit = list.find((k: any) => String(k?.id) === String(id))
    const v = String(hit?.apiKey || '').trim()
    if (v) return v
  }

  // fallback: first apiKeys
  if (list.length > 0) {
    const v = String(list[0]?.apiKey || '').trim()
    if (v) return v
  }

  // legacy fallback
  return String(p.apiKey || '').trim()
}

export function listApiKeys(provider: ApiProvider | undefined | null): Array<{ id: string, label: string }> {
  const p = provider as any
  const list = Array.isArray(p?.apiKeys) ? p.apiKeys : []
  return list
    .map((k: any) => {
      const id = String(k?.id || '')
      const name = String(k?.name || '').trim() || 'Key'
      const group = String(k?.group || '').trim()
      const label = group ? `${name} (${group})` : name
      return { id, label }
    })
    .filter((x: { id: string, label: string }) => x.id)
}

export function makeKeyId(): string {
  return `key_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}
