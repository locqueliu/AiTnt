import { app, shell } from 'electron'
import { join, resolve, isAbsolute, dirname } from 'path'
import { mkdir, readFile, rename, writeFile, copyFile } from 'fs/promises'
import { existsSync } from 'fs'

export type PersistConfig = {
  setupCompleted: boolean
  dataRoot: string
  imageOutputDirectory: string
  videoOutputDirectory: string
}

const CONFIG_FILE = 'aitnt-config.json'

function configDir() {
  // Keep this outside Electron userData so manual reinstall/uninstall won't wipe it.
  // Documents is user-visible and easy to back up.
  return join(app.getPath('documents'), 'AiTnt')
}

function defaultDataRoot() {
  // Easier for normal users to find/backup than AppData
  return join(app.getPath('documents'), 'AiTnt')
}

function normalizeAbsPath(p: string) {
  const raw = String(p || '').trim()
  if (!raw) return ''
  return isAbsolute(raw) ? raw : resolve(raw)
}

function defaultConfig(): PersistConfig {
  const root = defaultDataRoot()
  return {
    setupCompleted: false,
    dataRoot: root,
    imageOutputDirectory: join(root, 'output', 'images'),
    videoOutputDirectory: join(root, 'output', 'videos')
  }
}

function configPath() {
  return join(configDir(), CONFIG_FILE)
}

function legacyConfigPath() {
  // Previous versions stored config under userData.
  // Try to migrate from there when upgrading.
  const legacyUserData = String(process.env.AITNT_LEGACY_USER_DATA || '').trim() || app.getPath('userData')
  return join(legacyUserData, CONFIG_FILE)
}

function isSubPath(child: string, parent: string): boolean {
  const c = resolve(String(child || ''))
  const p = resolve(String(parent || ''))
  const sep = /\\/.test(p) ? '\\' : '/'
  const pp = p.endsWith(sep) ? p : (p + sep)
  return c.toLowerCase().startsWith(pp.toLowerCase())
}

function assertValidDataRoot(absDataRoot: string) {
  const root = resolve(String(absDataRoot || ''))
  const exeDir = dirname(app.getPath('exe'))
  const resDir = String(process.resourcesPath || '')

  // Prevent choosing install/resources directories; those may be deleted on uninstall/reinstall.
  if (root && exeDir && isSubPath(root, exeDir)) {
    throw new Error('Data root cannot be inside the app install directory. Choose a separate path such as D:\\AiTnt.')
  }
  if (root && resDir && isSubPath(root, resDir)) {
    throw new Error('Data root cannot be inside the app install directory. Choose a separate path such as D:\\AiTnt.')
  }
}

let cached: PersistConfig | null = null
let cachedWarning: string | null = null

export function getPersistConfigWarning(): string | null {
  return cachedWarning
}

async function readJsonFile(fp: string): Promise<any | null> {
  try {
    if (!existsSync(fp)) return null
    const raw = await readFile(fp, 'utf8')
    if (!raw || !raw.trim()) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function writeJsonFileSafe(fp: string, obj: any) {
  const dir = dirname(fp)
  await ensureDir(dir)

  // backup previous
  try {
    if (existsSync(fp)) {
      await copyFile(fp, fp + '.bak')
    }
  } catch {
    // ignore
  }

  const tmp = fp + '.tmp'
  const buf = JSON.stringify(obj, null, 2)
  await writeFile(tmp, buf, 'utf8')
  try {
    await rename(tmp, fp)
  } catch {
    // fallback
    await writeFile(fp, buf, 'utf8')
    try { await rename(tmp, fp + '.tmp.bak') } catch { /* ignore */ }
  }
}

async function ensureDir(p: string) {
  if (!p) return
  try {
    await mkdir(p, { recursive: true })
  } catch {
    // ignore
  }
}

async function ensureConfigDirs(cfg: PersistConfig) {
  await ensureDir(cfg.dataRoot)
  await ensureDir(join(cfg.dataRoot, 'state'))
  await ensureDir(cfg.imageOutputDirectory)
  await ensureDir(cfg.videoOutputDirectory)
}

export async function getPersistConfig(): Promise<PersistConfig> {
  if (cached) return cached
  const fp = configPath()
  const d = defaultConfig()
  try {
    if (!existsSync(fp)) {
      // migrate legacy config (userData -> Documents)
      const legacy = legacyConfigPath()
      if (existsSync(legacy)) {
        try {
          await ensureDir(configDir())
          const buf = await readFile(legacy)
          await writeFile(fp, buf)
        } catch {
          // ignore
        }
      }
    }

    let parsed = await readJsonFile(fp)
    if (!parsed) {
      parsed = await readJsonFile(fp + '.bak')
    }
    if (!parsed) {
      // Last resort: legacy config (might still exist for users upgrading)
      const legacy = legacyConfigPath()
      parsed = await readJsonFile(legacy)
      if (!parsed) parsed = await readJsonFile(legacy + '.bak')
      if (parsed) {
        try {
          await writeJsonFileSafe(fp, parsed)
        } catch {
          // ignore
        }
      }
    }

    if (!parsed) {
      await ensureConfigDirs(d)
      await ensureDir(configDir())
      await writeJsonFileSafe(fp, d)
      cached = d
      cachedWarning = null
      return d
    }

    let root = normalizeAbsPath(parsed?.dataRoot) || d.dataRoot
    let setupCompleted = Boolean(parsed?.setupCompleted)

    cachedWarning = null
    try {
      assertValidDataRoot(root)
    } catch (e: any) {
      // Keep user-selected path, but force re-setup to pick a safer location.
      cachedWarning = String(e?.message || 'Unsafe data root path')
      setupCompleted = false
    }

    const img = normalizeAbsPath(parsed?.imageOutputDirectory) || join(root, 'output', 'images')
    const vid = normalizeAbsPath(parsed?.videoOutputDirectory) || join(root, 'output', 'videos')
    const cfg: PersistConfig = {
      setupCompleted,
      dataRoot: root,
      imageOutputDirectory: img,
      videoOutputDirectory: vid
    }
    await ensureConfigDirs(cfg)
    cached = cfg
    return cfg
  } catch {
    await ensureConfigDirs(d)
    try {
      await ensureDir(configDir())
      await writeJsonFileSafe(fp, d)
    } catch {
      // ignore
    }
    cached = d
    cachedWarning = null
    return d
  }
}

export async function setPersistConfig(patch: Partial<PersistConfig>) {
  const prev = await getPersistConfig()
  const next: PersistConfig = { ...prev, ...patch }

  next.dataRoot = normalizeAbsPath(next.dataRoot) || prev.dataRoot
  assertValidDataRoot(next.dataRoot)
  next.imageOutputDirectory = normalizeAbsPath(next.imageOutputDirectory) || join(next.dataRoot, 'output', 'images')
  next.videoOutputDirectory = normalizeAbsPath(next.videoOutputDirectory) || join(next.dataRoot, 'output', 'videos')

  // migrate state file when dataRoot changes
  if (next.dataRoot !== prev.dataRoot) {
    const oldState = join(prev.dataRoot, 'state', 'persist.json')
    const newState = join(next.dataRoot, 'state', 'persist.json')
    try {
      await ensureDir(join(next.dataRoot, 'state'))
      if (existsSync(oldState) && !existsSync(newState)) {
        try {
          await rename(oldState, newState)
        } catch {
          const buf = await readFile(oldState)
          await writeFile(newState, buf)
        }
      }
    } catch {
      // ignore
    }
  }

  await ensureConfigDirs(next)
  await ensureDir(configDir())
  await writeJsonFileSafe(configPath(), next)
  cached = next
  cachedWarning = null
  return next
}

export async function openDataRootInExplorer() {
  const cfg = await getPersistConfig()
  void shell.openPath(cfg.dataRoot)
  return { ok: true, path: cfg.dataRoot }
}

export async function resolveUserPath(inputPath: string, kind: 'image' | 'video' | 'any' = 'any') {
  const cfg = await getPersistConfig()
  const raw = String(inputPath || '').trim()
  if (!raw) {
    if (kind === 'image') return cfg.imageOutputDirectory
    if (kind === 'video') return cfg.videoOutputDirectory
    return cfg.dataRoot
  }
  if (isAbsolute(raw)) return raw
  return join(cfg.dataRoot, raw)
}

