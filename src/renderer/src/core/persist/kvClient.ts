type KvApi = {
  persistGetItem?: (key: string) => Promise<{ success: boolean, value: string | null }>
  persistSetItem?: (key: string, value: string) => Promise<{ success: boolean }>
  persistRemoveItem?: (key: string) => Promise<{ success: boolean }>
}

function getApi(): KvApi {
  return (window as any)?.aitntAPI || {}
}

export async function kvGetString(key: string): Promise<string | null> {
  const k = String(key || '').trim()
  if (!k) return null

  const api = getApi()
  if (api.persistGetItem) {
    try {
      const r = await api.persistGetItem(k)
      if (r && r.success) return (r.value ?? null)
    } catch {
      // ignore
    }
  }

  // Fallback for non-Electron environments
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

export async function kvSetString(key: string, value: string): Promise<void> {
  const k = String(key || '').trim()
  if (!k) return
  const v = String(value ?? '')

  const api = getApi()
  if (api.persistSetItem) {
    try {
      await api.persistSetItem(k, v)
      return
    } catch {
      // ignore
    }
  }

  try {
    localStorage.setItem(k, v)
  } catch {
    // ignore
  }
}

export async function kvRemove(key: string): Promise<void> {
  const k = String(key || '').trim()
  if (!k) return

  const api = getApi()
  if (api.persistRemoveItem) {
    try {
      await api.persistRemoveItem(k)
      return
    } catch {
      // ignore
    }
  }

  try {
    localStorage.removeItem(k)
  } catch {
    // ignore
  }
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return (parsed as T) ?? fallback
  } catch {
    return fallback
  }
}

export async function kvGetJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await kvGetString(key)
  return safeJsonParse<T>(raw, fallback)
}

export async function kvSetJson(key: string, value: any): Promise<void> {
  try {
    await kvSetString(key, JSON.stringify(value ?? null))
  } catch {
    // ignore
  }
}

// One-time migration helper:
// - Prefer kv file storage when present
// - If kv missing, fallback to localStorage for old installs, then write into kv
export async function kvGetJsonMigrate<T>(key: string, fallback: T): Promise<T> {
  const k = String(key || '').trim()
  if (!k) return fallback

  const fromKv = await kvGetString(k)
  if (fromKv != null) return safeJsonParse<T>(fromKv, fallback)

  let fromLs: string | null = null
  try {
    fromLs = localStorage.getItem(k)
  } catch {
    fromLs = null
  }

  if (fromLs == null) return fallback

  const parsed = safeJsonParse<T>(fromLs, fallback)
  // Persist migrated raw content (best-effort)
  try {
    await kvSetString(k, fromLs)
  } catch {
    // ignore
  }
  return parsed
}

export async function kvGetStringMigrate(key: string): Promise<string | null> {
  const k = String(key || '').trim()
  if (!k) return null

  const fromKv = await kvGetString(k)
  if (fromKv != null) return fromKv

  let fromLs: string | null = null
  try {
    fromLs = localStorage.getItem(k)
  } catch {
    fromLs = null
  }
  if (fromLs == null) return null

  try {
    await kvSetString(k, fromLs)
  } catch {
    // ignore
  }
  return fromLs
}

