import { join } from 'path'
import { mkdir, readFile, rename, writeFile, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { getPersistConfig } from './config'

type KvFile = {
  v: 1
  items: Record<string, string>
}

// Serialize read-modify-write operations to avoid lost updates when
// multiple IPC calls persist state concurrently.
let opQueue: Promise<any> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = opQueue.then(fn, fn)
  opQueue = p.then(
    () => undefined,
    () => undefined
  )
  return p
}

async function kvPath() {
  const cfg = await getPersistConfig()
  return join(cfg.dataRoot, 'state', 'persist.json')
}

async function load(): Promise<KvFile> {
  const fp = await kvPath()
  try {
    if (!existsSync(fp)) return { v: 1, items: {} }
    const raw = await readFile(fp, 'utf8')
    const parsed = JSON.parse(raw)
    const items = (parsed && typeof parsed === 'object' && parsed.items && typeof parsed.items === 'object') ? parsed.items : {}
    return { v: 1, items: items as Record<string, string> }
  } catch {
    // Try backup
    try {
      const bak = fp + '.bak'
      if (existsSync(bak)) {
        const raw = await readFile(bak, 'utf8')
        const parsed = JSON.parse(raw)
        const items = (parsed && typeof parsed === 'object' && parsed.items && typeof parsed.items === 'object') ? parsed.items : {}
        return { v: 1, items: items as Record<string, string> }
      }
    } catch {
      // ignore
    }
    return { v: 1, items: {} }
  }
}

async function save(file: KvFile) {
  const fp = await kvPath()
  try {
    const cfg = await getPersistConfig()
    await mkdir(join(cfg.dataRoot, 'state'), { recursive: true })
  } catch {
    // ignore
  }

  // Backup previous state (best-effort)
  try {
    if (existsSync(fp)) {
      await copyFile(fp, fp + '.bak')
    }
  } catch {
    // ignore
  }

  const tmp = fp + '.tmp'
  await writeFile(tmp, JSON.stringify(file, null, 2), 'utf8')
  try {
    await rename(tmp, fp)
  } catch {
    // fallback
    await writeFile(fp, JSON.stringify(file, null, 2), 'utf8')
  }
}

export async function kvGetItem(key: string): Promise<string | null> {
  // Ensure any queued writes are flushed first
  await opQueue
  const k = String(key || '')
  if (!k) return null
  const f = await load()
  return Object.prototype.hasOwnProperty.call(f.items, k) ? String(f.items[k]) : null
}

export async function kvSetItem(key: string, value: string): Promise<void> {
  await enqueue(async () => {
    const k = String(key || '')
    if (!k) return
    const v = String(value ?? '')
    const f = await load()
    f.items[k] = v
    await save(f)
  })
}

export async function kvRemoveItem(key: string): Promise<void> {
  await enqueue(async () => {
    const k = String(key || '')
    if (!k) return
    const f = await load()
    delete f.items[k]
    await save(f)
  })
}
