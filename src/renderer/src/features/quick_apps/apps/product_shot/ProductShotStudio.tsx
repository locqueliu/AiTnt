import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Copy, Images, Maximize2, Minus, Plus, Play, Settings2, Sparkles, X } from 'lucide-react'
import ImageDrop from '../../components/ImageDrop'
import MultiImageDrop from '../../components/MultiImageDrop'
import ModelPicker from '../../components/ModelPicker'
import type { QuickAppInputImage } from '../../types'
import { useSettingsStore } from '../../../settings/store'
import { resolveApiKey } from '../../../settings/utils/apiKeys'
import { uiConfirm, uiPrompt, uiTextEditor, uiTextViewer } from '../../../ui/dialogStore'
import { uiToast } from '../../../ui/toastStore'
import { chatCompletionsText, type ChatMessage } from '../../../../core/api/chatCompletions'
import { generateImage } from '../../../../core/api/image'
import { useQuickAppAgentPresetStore, type AgentRole } from '../../agents/store'
import { kvGetJson, kvGetJsonMigrate, kvRemove, kvSetJson } from '../../../../core/persist/kvClient'
import { ensureQuickAppImageData, isDataUrl, parseAiTntLocalPath, srcToDataUrl } from '../../utils/localImage'
import { formatRequestDebugForCopy } from '../../../image_gen/utils/requestDebug'
import { usePromptLibraryStore, type PromptSet } from '../../prompt_library/store'
import { useProductShotTaskStore, type TaskInputImage } from '../../product_shot_tasks/store'
import ProductShotPromptGenie from './ProductShotPromptGenie'
import '../../styles/quickApps.css'

type Slot = { key: string, label: string, required?: boolean }

const MAX_LLM_PRODUCT_ANGLES = 6
const MAX_GEN_PRODUCT_ANGLES = 8

const CACHE_SAVE_DIR = 'cache/input-images/i2v'

const PS_INPUT_MANIFEST_KEY_V1 = 'aitnt-qa-product-shot-input-manifest:v1'
const PS_SESSION_KEY_V1 = 'aitnt-qa-product-shot-session:v1'
const PS_INPUT_MANIFEST_KEY_V2 = 'aitnt-qa-product-shot-input-manifest:v2'
const PS_SESSION_KEY_V2 = 'aitnt-qa-product-shot-session:v2'

const PS_WORKSPACE_SCRATCH = '__scratch__'

function psInputKey(workspaceId: string) {
  return `${PS_INPUT_MANIFEST_KEY_V2}:${workspaceId}`
}

function psSessionKey(workspaceId: string) {
  return `${PS_SESSION_KEY_V2}:${workspaceId}`
}

const ALLOWED_RATIOS = ['Auto', '1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '21:9'] as const
const ALLOWED_RES = ['1K', '2K', '4K'] as const

function isAllowedRatio(v: string): v is (typeof ALLOWED_RATIOS)[number] {
  return (ALLOWED_RATIOS as any).includes(String(v || ''))
}

function isAllowedRes(v: string): v is (typeof ALLOWED_RES)[number] {
  return (ALLOWED_RES as any).includes(String(v || ''))
}

function clampInt(n: any, min: number, max: number) {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

type GenieTemplateSource = 'editor' | 'set'
type GenieSendFlags = {
  model: boolean
  wear_ref: boolean
  pose: boolean
  outfit: boolean
  scene: boolean
  product: boolean
}

const DEFAULT_GENIE_FLAGS: GenieSendFlags = {
  model: true,
  wear_ref: true,
  pose: true,
  outfit: true,
  scene: true,
  product: false
}

type InputManifestItem = { id: string, name: string, localPath: string, createdAt: number }
type ProductShotInputManifest = {
  productAngles: InputManifestItem[]
  slots: Record<string, InputManifestItem | null>
  updatedAt?: number
}

type ProductShotSession = {
  agent1Template?: string
  agent2Template?: string
  agent3Template?: string
  agent1Output?: string
  agent2Output?: string
  finalPrompt?: string
  outImages?: string[]
  outMetaByUrl?: Record<string, { createdAt: number, model: string, ratio: string, res: string, targetSize: string, actualSize?: string }>
  agent1Model?: string
  agent2Model?: string
  genModel?: string

  genRatio?: string
  genRes?: string

  taskBatchCount?: number

  genieTemplateSource?: GenieTemplateSource
  genieBaseSetId?: string
  genieUseImages?: boolean
  genieFlags?: Partial<GenieSendFlags>
  genieProductAngleCount?: number
  genieUserIdea?: string

  updatedAt?: number
}

// Keep in-memory snapshot so switching routes doesn't blank the UI
let memManifestByWs: Record<string, ProductShotInputManifest | null> = {}
let memSessionByWs: Record<string, ProductShotSession | null> = {}
let memDebugByWs: Record<string, Record<string, { request?: any, response?: any }>> = {}

function getFileNameFromPath(p: string): string {
  const s = String(p || '').replace(/\\/g, '/')
  const idx = s.lastIndexOf('/')
  return idx >= 0 ? s.slice(idx + 1) : s
}

function hasAiTntLocal(u: string) {
  return /^aitnt:\/\//i.test(String(u || ''))
}

function imageLocalPath(img: QuickAppInputImage | null | undefined): string {
  const lp = String((img as any)?.localPath || '').trim()
  if (lp && hasAiTntLocal(lp)) return lp
  const du = String((img as any)?.dataUrl || '').trim()
  if (du && hasAiTntLocal(du)) return du
  return ''
}

function normalizeId(img: QuickAppInputImage): string {
  return String(img?.id || '').trim() || `qa_img_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function joinNonEmpty(parts: Array<string | null | undefined>, sep = '\n\n') {
  return parts.map(s => String(s || '').trim()).filter(Boolean).join(sep)
}

function copyText(text: string) {
  const t = String(text || '')
  if (!t.trim()) {
    uiToast('info', '娌℃湁鍙鍒剁殑鍐呭')
    return
  }
  if (!navigator.clipboard?.writeText) {
    uiTextViewer(t, { title: '澶嶅埗鍐呭' })
    return
  }
  navigator.clipboard.writeText(t)
    .then(() => uiToast('success', '宸插鍒'))
    .catch(() => uiToast('error', '澶嶅埗澶辫触'))
}

function inferDataUrlExt(dataUrl: string) {
  const u = String(dataUrl || '')
  if (u.startsWith('data:image/png')) return 'png'
  if (u.startsWith('data:image/webp')) return 'webp'
  if (u.startsWith('data:image/jpeg')) return 'jpg'
  return 'png'
}

function safeFileName(s: string) {
  return String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').slice(0, 120) || 'image'
}

function formatBytes(n: number) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return '0B'
  if (v < 1024) return `${Math.round(v)}B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)}KB`
  return `${(v / (1024 * 1024)).toFixed(2)}MB`
}

function taskInputFromImg(img: QuickAppInputImage): TaskInputImage | null {
  const lp = String((img as any)?.localPath || (img as any)?.dataUrl || '').trim()
  if (!lp.startsWith('aitnt://local?path=')) return null
  return {
    id: String((img as any)?.id || '').trim() || `qa_img_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
    name: String(img?.name || 'image'),
    localPath: lp,
    createdAt: Number((img as any)?.createdAt || Date.now())
  }
}

function shortTs(ts: number) {
  const d = new Date(Number(ts || 0) || Date.now())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}${dd}-${hh}${mi}`
}

function isCachedLocalPath(s: string) {
  return /^aitnt:\/\/local\?path=/i.test(String(s || ''))
}

function tryGetLocalFilePathFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'aitnt:') return null
    if (u.hostname === 'local') return u.searchParams.get('path')
    const p = (u.pathname || '').replace(/^\/+/, '')
    return p ? decodeURIComponent(p) : null
  } catch {
    return null
  }
}

// same logic as image_gen: ratio + res => pixel size
function getSizeFromRatioAndRes(ratioStr: string, resStr: string): string {
  let base = 1024
  if (resStr === '2K') base = 2048
  if (resStr === '4K') base = 4096

  if (ratioStr === 'Auto') return `${base}x${base}`

  const [wStr, hStr] = String(ratioStr || '').split(':')
  const w = parseInt(wStr, 10)
  const h = parseInt(hStr, 10)
  if (!w || !h) return `${base}x${base}`

  let width = base
  let height = base
  if (w >= h) {
    width = base
    height = Math.round(base * h / w)
  } else {
    height = base
    width = Math.round(base * w / h)
  }
  width = Math.round(width / 8) * 8
  height = Math.round(height / 8) * 8
  return `${width}x${height}`
}

type SentItem = { label: string, img: QuickAppInputImage }

function SentImagesPanel(props: { title: string, items: SentItem[] }) {
  const { title, items } = props
  return (
    <div className="ps-sent">
      <div className="ps-sent-head">
        <div className="ps-sent-title">{title}</div>
        <div className="ps-sent-sub">锛堜互涓嬩负瀹為檯鍙戦€佺粰 AI 鐨勫帇缂╁浘锛屽彲涓嬭浇鏍稿锛?/div>
      </div>
      {items.length === 0 ? (
        <div className="ps-sent-empty">娌℃湁鍙彂閫佺殑鍥剧墖</div>
      ) : (
        <div className="ps-sent-grid">
          {items.map((it, idx) => {
            const ext = inferDataUrlExt(it.img.dataUrl)
            const fileName = safeFileName(`${it.label}_${idx + 1}.${ext}`)
            const meta = `${it.img.width || ''}${it.img.height ? `x${it.img.height}` : ''}${it.img.bytes ? ` 路 ${formatBytes(it.img.bytes)}` : ''}`.trim()
            const absPath = parseAiTntLocalPath(String(it.img.localPath || it.img.dataUrl || ''))
            return (
              <div key={`${it.label}_${idx}`} className="ps-sent-item">
                <div className="ps-sent-thumb">
                  <img src={it.img.dataUrl} alt={it.label} draggable={false} />
                </div>
                <div className="ps-sent-info">
                  <div className="ps-sent-lab" title={it.label}>{it.label}</div>
                  <div className="ps-sent-meta">{meta || ' '}</div>
                </div>
                <button
                  className="ps-sent-dl"
                  type="button"
                  onClick={async () => {
                    // ensure we download the actual sent (data url) image
                    try {
                      const src = String(it.img.sourceDataUrl || it.img.localPath || it.img.dataUrl || '')
                      const dataUrl = await srcToDataUrl(src)
                      const a = document.createElement('a')
                      a.href = dataUrl
                      a.download = fileName
                      a.click()
                    } catch {
                      // fallback: reveal cached file
                      const api = (window as any).aitntAPI
                      if (api?.showItemInFolder && absPath) {
                        try { await api.showItemInFolder({ filePath: absPath }) } catch { /* ignore */ }
                      }
                    }
                  }}
                  title={absPath ? '涓嬭浇澶辫触鏃朵細瀹氫綅鍒扮紦瀛樻枃浠' : '涓嬭浇'}
                >
                  涓嬭浇
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function assembleFinalPrompt(args: {
  agent3Template: string
  agent2Output: string
  agent1Output: string
}): string {
  const a3 = String(args.agent3Template || '').trim()
  const a2 = String(args.agent2Output || '').trim()
  const a1 = String(args.agent1Output || '').trim()

  return joinNonEmpty([
    a3,
    a2 ? `### **銆愰鍥炬媿鎽勫姩浣溿€?*\n\n${a2}` : '',
    a1 ? `浜у搧璇︾粏淇℃伅鎻愮ず璇嶏細\n\n${a1}` : ''
  ])
}

export default function ProductShotStudio() {
  const navigate = useNavigate()
  const loc = useLocation()
  const providers = useSettingsStore(s => s.providers)
  const activeProviderId = useSettingsStore(s => s.activeProviderId)
  const appsProviderId = useSettingsStore(s => s.appsProviderId)
  const autoSaveEnabled = useSettingsStore(s => s.autoSaveEnabled)
  const outputDirectory = useSettingsStore(s => s.outputDirectory)

  const effectiveProviderId = (appsProviderId || activeProviderId || '').trim()
  const provider = useMemo(() => providers.find(p => p.id === effectiveProviderId) || null, [providers, effectiveProviderId])

  const urlSetId = useMemo(() => {
    try {
      return new URLSearchParams(String(loc.search || '')).get('set') || ''
    } catch {
      return ''
    }
  }, [loc.search])

  const promptApiKey = useMemo(() => provider ? resolveApiKey(provider, 'prompt') : '', [provider])
  const promptModel = useMemo(() => String(provider?.selectedPromptModel || '').trim(), [provider])
  const imageApiKey = useMemo(() => provider ? resolveApiKey(provider, 'image') : '', [provider])
  const imageModel = useMemo(() => String(provider?.selectedImageModel || '').trim(), [provider])
  const baseUrl = useMemo(() => String(provider?.baseUrl || '').trim(), [provider])

  const allModels = useMemo(() => {
    const list = Array.isArray(provider?.models) ? provider!.models : []
    const out = list.map(String).map(s => s.trim()).filter(Boolean)
    const extra = [promptModel, imageModel].map(s => String(s || '').trim()).filter(Boolean)
    const uniq = new Set<string>([...extra, ...out])
    return Array.from(uniq)
  }, [provider, promptModel, imageModel])

  const slots: Slot[] = useMemo(() => ([
    { key: 'wear_ref', label: '浣╂埓鍙傝€冿紙鍙€夛級' },
    { key: 'model', label: '鎴戜滑鐨勬ā鐗癸紙鍙€夛級' },
    { key: 'outfit', label: '鏈嶈鍙傝€冿紙鍙€夛級' },
    { key: 'scene', label: '鍦烘櫙鍥撅紙鍙€夛級' },
    { key: 'pose', label: '鍙傝€冨Э鎬佸浘锛堝彲閫夛級' }
  ]), [])

  const [productAngles, setProductAngles] = useState<QuickAppInputImage[]>(() => {
    const m = memManifestByWs[PS_WORKSPACE_SCRATCH] || null
    if (!m) return []
    return (m.productAngles || [])
      .filter((x: any) => x && x.id && x.localPath)
      .slice(0, 24)
      .map((x: any) => ({
        id: String(x.id),
        name: String(x.name || 'image'),
        dataUrl: String(x.localPath),
        base64: '',
        localPath: String(x.localPath),
        createdAt: Number(x.createdAt || Date.now())
      }))
  })
  const [images, setImages] = useState<Record<string, QuickAppInputImage | null>>(() => {
    const init: Record<string, QuickAppInputImage | null> = {}
    for (const s of slots) init[s.key] = null
    const m = memManifestByWs[PS_WORKSPACE_SCRATCH] || null
    if (!m || !m.slots) return init
    for (const s of slots) {
      const it = (m.slots as any)[s.key] as InputManifestItem | null
      if (it && it.id && it.localPath) {
        init[s.key] = {
          id: String(it.id),
          name: String(it.name || 'image'),
          dataUrl: String(it.localPath),
          base64: '',
          localPath: String(it.localPath),
          createdAt: Number(it.createdAt || Date.now())
        }
      }
    }
    return init
  })

  const [inputHydratedWs, setInputHydratedWs] = useState<string>('')
  const [sessionHydratedWs, setSessionHydratedWs] = useState<string>('')
  const persistingRef = useRef({ manifest: 0 as any, session: 0 as any })

  const promptSets = usePromptLibraryStore(s => s.sets)
  const activeSetIdByApp = usePromptLibraryStore(s => s.activeSetIdByApp)
  const setActiveSet = usePromptLibraryStore(s => s.setActive)
  const addPromptSet = usePromptLibraryStore(s => s.addSet)
  const updatePromptSet = usePromptLibraryStore(s => s.updateSet)
  const removePromptSet = usePromptLibraryStore(s => s.removeSet)

  const addTask = useProductShotTaskStore(s => s.addTask)

  const presets = useQuickAppAgentPresetStore(s => s.presets)
  const activePresetId = useQuickAppAgentPresetStore(s => s.activePresetId)
  const setActivePreset = useQuickAppAgentPresetStore(s => s.setActivePreset)
  const addPreset = useQuickAppAgentPresetStore(s => s.addPreset)
  const updatePreset = useQuickAppAgentPresetStore(s => s.updatePreset)
  const removePreset = useQuickAppAgentPresetStore(s => s.removePreset)

  const presetsByRole = useMemo(() => {
    const map: Record<AgentRole, any[]> = { agent_1: [], agent_2: [], agent_3: [] }
    for (const p of presets) {
      if (p.role === 'agent_1' || p.role === 'agent_2' || p.role === 'agent_3') map[p.role].push(p)
    }
    for (const k of Object.keys(map) as AgentRole[]) {
      map[k].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.updatedAt - a.updatedAt)
    }
    return map
  }, [presets])

  const initialTextForRole = (role: AgentRole) => {
    const activeId = activePresetId?.[role]
    if (activeId) {
      const p = presets.find(x => x.id === activeId)
      if (p) return p.text
    }
    const first = presetsByRole[role]?.[0]
    return first?.text || ''
  }

  const seedSession = memSessionByWs[PS_WORKSPACE_SCRATCH] || null
  const [agent1Template, setAgent1Template] = useState(() => (seedSession?.agent1Template ?? initialTextForRole('agent_1')))
  const [agent2Template, setAgent2Template] = useState(() => (seedSession?.agent2Template ?? initialTextForRole('agent_2')))
  const [agent3Template, setAgent3Template] = useState(() => (seedSession?.agent3Template ?? initialTextForRole('agent_3')))

  const [agent1Output, setAgent1Output] = useState(() => String(seedSession?.agent1Output || ''))
  const [agent2Output, setAgent2Output] = useState(() => String(seedSession?.agent2Output || ''))
  const [finalPrompt, setFinalPrompt] = useState(() => String(seedSession?.finalPrompt || ''))
  const [outImages, setOutImages] = useState<string[]>(() => (
    Array.isArray(seedSession?.outImages) ? seedSession!.outImages!.map(String).filter(Boolean) : []
  ))

  const [outMetaByUrl, setOutMetaByUrl] = useState<Record<string, { createdAt: number, model: string, ratio: string, res: string, targetSize: string, actualSize?: string }>>(() => {
    const m = seedSession?.outMetaByUrl
    if (!m || typeof m !== 'object') return {}
    return m as any
  })

  const debugRef = useRef<Record<string, { request?: any, response?: any }>>(memDebugByWs[PS_WORKSPACE_SCRATCH] || {})
  const [debugTick, setDebugTick] = useState(0)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMsg, setPreviewMsg] = useState('')

  const [busy, setBusy] = useState<null | 'agent1' | 'agent2' | 'merge' | 'gen' | 'task'>(null)

  const editText = async (title: string, text: string, apply: (next: string) => void) => {
    const t = String(text || '')
    const next = await uiTextEditor(t, { title, size: 'lg' })
    if (next === null) return
    apply(String(next))
  }

  const missingRequired = useMemo(() => productAngles.length === 0, [productAngles])

  const canUseLLM = Boolean(baseUrl && promptApiKey && promptModel)
  const canGenImage = Boolean(baseUrl && imageApiKey && imageModel)

  const saveDir = useMemo(() => {
    return autoSaveEnabled ? String(outputDirectory || '').trim() || undefined : undefined
  }, [autoSaveEnabled, outputDirectory])

  const promptPinned = useMemo(() => {
    const list = (provider?.pinnedPromptModels || []).filter(Boolean)
    return list.slice(0, 4)
  }, [provider])

  const imagePinned = useMemo(() => {
    const list = (provider?.pinnedImageModels || []).filter(Boolean)
    return list.slice(0, 4)
  }, [provider])

  const [agent1Model, setAgent1Model] = useState(() => String(seedSession?.agent1Model || promptModel))
  const [agent2Model, setAgent2Model] = useState(() => String(seedSession?.agent2Model || promptModel))
  const [genModel, setGenModel] = useState(() => String(seedSession?.genModel || imageModel))

  const [genRatio, setGenRatio] = useState<'Auto' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '2:3' | '3:2' | '21:9'>(() => {
    const r = String(seedSession?.genRatio || '')
    return (['Auto', '1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '21:9'].includes(r) ? (r as any) : '1:1')
  })
  const [genRes, setGenRes] = useState<'1K' | '2K' | '4K'>(() => {
    const r = String(seedSession?.genRes || '')
    return (['1K', '2K', '4K'].includes(r) ? (r as any) : '1K')
  })
  const [genParamsOpen, setGenParamsOpen] = useState(false)

  const [taskBatchCount, setTaskBatchCount] = useState<number>(() => clampInt((seedSession as any)?.taskBatchCount, 1, 20))

  const [genieOpen, setGenieOpen] = useState(false)
  const [genieTemplateSource, setGenieTemplateSource] = useState<GenieTemplateSource>(() => (((seedSession as any)?.genieTemplateSource === 'set') ? 'set' : 'editor'))
  const [genieBaseSetId, setGenieBaseSetId] = useState<string>(() => String((seedSession as any)?.genieBaseSetId || 'follow-active'))
  const [genieUseImages, setGenieUseImages] = useState<boolean>(() => Boolean((seedSession as any)?.genieUseImages))
  const [genieFlags, setGenieFlags] = useState<GenieSendFlags>(() => ({ ...DEFAULT_GENIE_FLAGS, ...(((seedSession as any)?.genieFlags || {}) as any) }))
  const [genieProductAngleCount, setGenieProductAngleCount] = useState<number>(() => clampInt((seedSession as any)?.genieProductAngleCount, 0, 2))
  const [genieUserIdea, setGenieUserIdea] = useState<string>(() => String((seedSession as any)?.genieUserIdea || ''))

  const decTaskBatch = () => setTaskBatchCount(v => clampInt(v - 1, 1, 20))
  const incTaskBatch = () => setTaskBatchCount(v => clampInt(v + 1, 1, 20))

  const setsForProductShot = useMemo(() => {
    const list = (promptSets || []).filter(s => s.appId === 'product_shot')
    return list
      .slice()
      .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.updatedAt - a.updatedAt)
  }, [promptSets])

  const [activePromptSetId, setActivePromptSetId] = useState<string>(() => {
    const id = String((activeSetIdByApp as any)?.product_shot || '').trim()
    return id
  })

  useEffect(() => {
    const id = String((activeSetIdByApp as any)?.product_shot || '').trim()
    if (id && id !== activePromptSetId) setActivePromptSetId(id)
  }, [activeSetIdByApp])

  const activePromptSetObj = useMemo(() => {
    const id = String(activePromptSetId || '').trim()
    if (!id) return null
    return setsForProductShot.find(x => x.id === id) || null
  }, [activePromptSetId, setsForProductShot])

  const workspaceId = useMemo(() => {
    const id = String(activePromptSetId || '').trim()
    return id || PS_WORKSPACE_SCRATCH
  }, [activePromptSetId])

  const inputHydrated = inputHydratedWs === workspaceId
  const sessionHydrated = sessionHydratedWs === workspaceId

  const lastAppliedSetRef = useRef<{ id: string | null, a1: string, a2: string, a3: string, r: string, res: string, m1: string, m2: string, gm: string } | null>(null)

  const applyPromptSet = async (s: PromptSet) => {
    const nextId = String(s?.id || '').trim()
    if (!nextId) return
    // Switch workspace by template group id.
    // Per-template workspaces prevent images/outputs from leaking across groups.
    setActivePromptSetId(nextId)
    setActiveSet('product_shot', nextId)
    lastAppliedSetRef.current = null
    uiToast('success', `宸插垏鎹㈡ā鏉跨粍锛?{String(s.name || '').trim() || '鏈懡鍚'}`)
  }

  // Apply selected set from URL (ProductShotHome -> Studio)
  useEffect(() => {
    const id = String(urlSetId || '').trim()
    if (!id) return
    const cur = setsForProductShot.find(x => x.id === id) || null
    if (!cur) return

    // avoid re-applying when already selected
    if (String(activePromptSetId || '') === id) {
      // strip set param to avoid future re-triggers
      try {
        const sp = new URLSearchParams(String(loc.search || ''))
        if (sp.get('set')) {
          sp.delete('set')
          navigate(`/apps/product_shot?${sp.toString()}`, { replace: true })
        }
      } catch {
        // ignore
      }
      return
    }

    void (async () => {
      try {
        setActivePromptSetId(String(cur.id))
        setActiveSet('product_shot', String(cur.id))
      } finally {
        try {
          const sp = new URLSearchParams(String(loc.search || ''))
          if (sp.get('set')) {
            sp.delete('set')
            navigate(`/apps/product_shot?${sp.toString()}`, { replace: true })
          }
        } catch {
          // ignore
        }
      }
    })()
  }, [urlSetId, setsForProductShot, activePromptSetId, loc.search, navigate])

  const saveAsPromptSet = async () => {
    const name = await uiPrompt('妯℃澘缁勫悕绉', { title: '淇濆瓨鍒版彁绀鸿瘝搴', placeholder: '渚嬪锛氬附瀛愶紙ededed鑳屾櫙锛' })
    if (!name) return
    const category = await uiPrompt('鍒嗙被锛堝彲閫夛級', { title: '淇濆瓨鍒版彁绀鸿瘝搴', placeholder: '渚嬪锛氬附瀛?/ 楗板搧 / 琚滃瓙' })

    const created = addPromptSet({
      appId: 'product_shot',
      name,
      category: category || undefined,
      agent1Template: String(agent1Template || ''),
      agent2Template: String(agent2Template || ''),
      agent3Template: String(agent3Template || ''),
      agent1Model: String(agent1Model || ''),
      agent2Model: String(agent2Model || ''),
      genModel: String(genModel || ''),
      genRatio: String(genRatio || ''),
      genRes: String(genRes || '')
    })

    // Clone current workspace into the newly created template group workspace
    // so the UI doesn't blank on switch.
    try {
      const newWsId = String(created.id || '').trim() || PS_WORKSPACE_SCRATCH
      const m = buildManifest()
      const s = buildSession()
      memManifestByWs[newWsId] = m
      memSessionByWs[newWsId] = s
      await kvSetJson(psInputKey(newWsId), m)
      await kvSetJson(psSessionKey(newWsId), s)
    } catch {
      // ignore
    }

    setActivePromptSetId(created.id)
    setActiveSet('product_shot', created.id)
    lastAppliedSetRef.current = null
    uiToast('success', '宸蹭繚瀛樺埌鎻愮ず璇嶅簱')
  }

  const overwritePromptSet = async () => {
    const id = String(activePromptSetId || '').trim()
    if (!id) {
      uiToast('info', '璇峰厛閫夋嫨涓€涓ā鏉跨粍')
      return
    }
    const cur = setsForProductShot.find(x => x.id === id)
    const ok = await uiConfirm(`瑕嗙洊淇濆瓨妯℃澘缁勩€?{cur?.name || '鏈懡鍚'}銆嶏紵`, '瑕嗙洊淇濆瓨')
    if (!ok) return
    updatePromptSet(id, {
      agent1Template: String(agent1Template || ''),
      agent2Template: String(agent2Template || ''),
      agent3Template: String(agent3Template || ''),
      agent1Model: String(agent1Model || ''),
      agent2Model: String(agent2Model || ''),
      genModel: String(genModel || ''),
      genRatio: String(genRatio || ''),
      genRes: String(genRes || '')
    } as any)
    lastAppliedSetRef.current = { id, a1: String(agent1Template || ''), a2: String(agent2Template || ''), a3: String(agent3Template || ''), r: String(genRatio || ''), res: String(genRes || ''), m1: String(agent1Model || ''), m2: String(agent2Model || ''), gm: String(genModel || '') }
    uiToast('success', '宸茶鐩栦繚瀛')
  }

  const deletePromptSet = async () => {
    const id = String(activePromptSetId || '').trim()
    if (!id) {
      uiToast('info', '璇峰厛閫夋嫨涓€涓ā鏉跨粍')
      return
    }
    const cur = setsForProductShot.find(x => x.id === id)
    const ok = await uiConfirm(`纭畾鍒犻櫎妯℃澘缁勩€?{cur?.name || '鏈懡鍚'}銆嶏紵`, '鍒犻櫎')
    if (!ok) return
    removePromptSet(id)
    try {
      delete memManifestByWs[id]
      delete memSessionByWs[id]
      delete memDebugByWs[id]
      await kvRemove(psInputKey(id))
      await kvRemove(psSessionKey(id))
    } catch {
      // ignore
    }
    setActiveSet('product_shot', null)
    setActivePromptSetId('')
    lastAppliedSetRef.current = null
    uiToast('success', '宸插垹闄')
  }

  const createTask = async () => {
    const count = clampInt(taskBatchCount, 1, 20)
    if (!effectiveProviderId) {
      uiToast('info', '鏈€夋嫨 Provider锛堣鍏堝湪璁剧疆閲岄€夋嫨/閰嶇疆锛')
      return
    }
    if (missingRequired) {
      uiToast('info', '璇峰厛涓婁紶鑷冲皯涓€寮犫€滀骇鍝佷笉鍚岃搴﹀浘鈥')
      return
    }

    // Ensure inputs are cached to aitnt://local
    const ensureCached = async () => {
      // angles
      let nextAngles = productAngles.slice()
      for (let i = 0; i < nextAngles.length; i++) {
        const img = nextAngles[i]
        const lp = imageLocalPath(img)
        if (lp) continue
        const cached = await cacheInputImage(img, 'qa_ps_angle')
        nextAngles[i] = cached
      }
      setProductAngles(nextAngles)

      // slots
      const nextSlots: any = { ...images }
      for (const s of slots) {
        const img = nextSlots[s.key]
        if (!img) continue
        const lp = imageLocalPath(img)
        if (lp) continue
        nextSlots[s.key] = await cacheInputImage(img, `qa_ps_${s.key}`)
      }
      setImages(nextSlots)

      return { nextAngles, nextSlots }
    }

    setBusy('task')
    try {
      const cached = await ensureCached()
      const angleInputs: TaskInputImage[] = cached.nextAngles
        .map(taskInputFromImg)
        .filter(Boolean) as any

      if (angleInputs.length === 0) {
        uiToast('error', '鍥剧墖缂撳瓨澶辫触锛堣閲嶈瘯锛')
        return
      }

      const slotInputs: Record<string, TaskInputImage | null> = {}
      for (const s of slots) {
        const img = cached.nextSlots[s.key] as QuickAppInputImage | null
        slotInputs[s.key] = img ? taskInputFromImg(img) : null
      }

      const setObj = activePromptSetId ? setsForProductShot.find(x => x.id === activePromptSetId) : null
      const label = setObj ? `${String(setObj.category || '').trim() ? `${String(setObj.category).trim()}/` : ''}${String(setObj.name || '').trim()}` : '鏈垎缁?

      const baseTs = Date.now()
      const baseTitle = `${label} ${shortTs(baseTs)}`
      for (let i = 0; i < count; i++) {
        const title = count > 1 ? `${baseTitle} (${i + 1}/${count})` : baseTitle
        addTask({
          title,
          promptSetId: activePromptSetId || undefined,
          promptSetLabel: label,
          providerId: effectiveProviderId,
          productAngles: angleInputs.slice(),
          slots: { ...slotInputs },
          agent1Template: String(agent1Template || ''),
          agent2Template: String(agent2Template || ''),
          agent3Template: String(agent3Template || ''),
          agent1Model: String(effectiveAgent1Model || ''),
          agent2Model: String(effectiveAgent2Model || ''),
          genModel: String(effectiveGenModel || ''),
          genRatio: String(genRatio === 'Auto' ? '1:1' : genRatio),
          genRes: String(genRes || '1K'),
          agent1Output: String(agent1Output || ''),
          agent2Output: String(agent2Output || ''),
          finalPrompt: String(finalPrompt || ''),
          outImages: []
        } as any)
      }

      uiToast('success', `宸插垱寤?${count} 涓换鍔★細鍚庡彴鑷姩璺戝叏娴佺▼锛堝彲鍦ㄢ€滃簲鐢?浠诲姟鍒楄〃鈥濇煡鐪嬶級`)
    } catch (e: any) {
      uiToast('error', e?.message || '鍒涘缓浠诲姟澶辫触')
    } finally {
      setBusy(null)
    }
  }

  const [showAgent1Sent, setShowAgent1Sent] = useState(false)
  const [showAgent2Sent, setShowAgent2Sent] = useState(false)
  const [showGenSent, setShowGenSent] = useState(false)

  const effectiveAgent1Model = String(agent1Model || promptModel || '').trim()
  const effectiveAgent2Model = String(agent2Model || promptModel || '').trim()
  const effectiveGenModel = String(genModel || imageModel || '').trim()

  const previewMeta = useMemo(() => {
    if (!previewUrl) return null
    return (outMetaByUrl as any)?.[previewUrl] || null
  }, [previewUrl, outMetaByUrl])

  const previewDebug = useMemo(() => {
    if (!previewUrl) return null
    // debugRef is stable; debugTick triggers refresh
    return debugRef.current?.[previewUrl] || null
  }, [previewUrl, debugTick])

  const previewAbsPath = useMemo(() => {
    if (!previewUrl) return null
    return tryGetLocalFilePathFromUrl(previewUrl)
  }, [previewUrl])

  const previewFileName = useMemo(() => {
    const abs = String(previewAbsPath || '').trim()
    if (abs) return getFileNameFromPath(abs)
    const u = String(previewUrl || '').trim()
    if (!u) return ''
    if (u.startsWith('http://') || u.startsWith('https://')) {
      try {
        const x = new URL(u)
        return getFileNameFromPath(x.pathname)
      } catch {
        return ''
      }
    }
    return ''
  }, [previewUrl, previewAbsPath])

  // keep per-workspace debug cache
  const prevWsRef = useRef<string>(workspaceId)
  useEffect(() => {
    try {
      const prev = prevWsRef.current
      if (prev) memDebugByWs[prev] = debugRef.current || {}
      prevWsRef.current = workspaceId
      debugRef.current = memDebugByWs[workspaceId] || {}
      setDebugTick(v => v + 1)
      setPreviewUrl(null)
      setPreviewMsg('')
    } catch {
      // ignore
    }
  }, [workspaceId])

  // hydrate persisted manifest + session
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const key = psInputKey(workspaceId)
        let m = await kvGetJsonMigrate<ProductShotInputManifest | null>(key, null)

        // One-time migrate from v1 -> current workspace when v2 missing.
        if (!m) {
          const old = await kvGetJson<ProductShotInputManifest | null>(PS_INPUT_MANIFEST_KEY_V1, null)
          if (old && typeof old === 'object') {
            await kvSetJson(key, old)
            await kvRemove(PS_INPUT_MANIFEST_KEY_V1)
            m = old
          }
        }
        if (!alive) return

        const mem = memManifestByWs[workspaceId] || null
        const memTs = Number(mem?.updatedAt || 0)
        const diskTs = Number((m as any)?.updatedAt || 0)
        const use = (mem && memTs >= diskTs) ? mem : (m || null)
        const useObj: ProductShotInputManifest = (use && typeof use === 'object')
          ? (use as any)
          : { productAngles: [], slots: {}, updatedAt: Date.now() }

        const angles: QuickAppInputImage[] = (useObj.productAngles || [])
          .filter((x: any) => x && x.id && x.localPath)
          .slice(0, 24)
          .map((x: any) => ({
            id: String(x.id),
            name: String(x.name || 'image'),
            dataUrl: String(x.localPath),
            base64: '',
            localPath: String(x.localPath),
            createdAt: Number(x.createdAt || Date.now())
          }))

        const nextImages: Record<string, QuickAppInputImage | null> = {}
        for (const s of slots) nextImages[s.key] = null
        for (const s of slots) {
          const it = (useObj.slots || ({} as any))?.[s.key] as InputManifestItem | null
          if (it && it.id && it.localPath) {
            nextImages[s.key] = {
              id: String(it.id),
              name: String(it.name || 'image'),
              dataUrl: String(it.localPath),
              base64: '',
              localPath: String(it.localPath),
              createdAt: Number(it.createdAt || Date.now())
            }
          }
        }

        setProductAngles(angles)
        setImages(nextImages)

        memManifestByWs[workspaceId] = useObj
      } catch {
        // ignore
      } finally {
        if (alive) setInputHydratedWs(workspaceId)
      }
    })()
    return () => {
      alive = false
    }
  }, [slots, workspaceId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const key = psSessionKey(workspaceId)
        let s = await kvGetJsonMigrate<ProductShotSession | null>(key, null)

        // One-time migrate from v1 -> current workspace when v2 missing.
        if (!s) {
          const old = await kvGetJson<ProductShotSession | null>(PS_SESSION_KEY_V1, null)
          if (old && typeof old === 'object') {
            await kvSetJson(key, old)
            await kvRemove(PS_SESSION_KEY_V1)
            s = old
          }
        }
        if (!alive) return

        const mem = memSessionByWs[workspaceId] || null
        const memTs = Number(mem?.updatedAt || 0)
        const diskTs = Number((s as any)?.updatedAt || 0)
        const use = (mem && memTs >= diskTs) ? mem : (s || null)

        const initFromSet = (): ProductShotSession => {
          const setObj = String(activePromptSetId || '').trim() ? activePromptSetObj : null
          return {
            agent1Template: String(setObj?.agent1Template || initialTextForRole('agent_1')),
            agent2Template: String(setObj?.agent2Template || initialTextForRole('agent_2')),
            agent3Template: String(setObj?.agent3Template || initialTextForRole('agent_3')),
            agent1Output: '',
            agent2Output: '',
            finalPrompt: '',
            outImages: [],
            outMetaByUrl: {},
            agent1Model: String(setObj?.agent1Model || promptModel || ''),
            agent2Model: String(setObj?.agent2Model || promptModel || ''),
            genModel: String(setObj?.genModel || imageModel || ''),
            genRatio: String((setObj?.genRatio && isAllowedRatio(String(setObj.genRatio))) ? setObj.genRatio : '1:1'),
            genRes: String((setObj?.genRes && isAllowedRes(String(setObj.genRes))) ? setObj.genRes : '1K'),
            taskBatchCount: 1,
            genieTemplateSource: 'editor',
            genieBaseSetId: 'follow-active',
            genieUseImages: false,
            genieFlags: DEFAULT_GENIE_FLAGS,
            genieProductAngleCount: 0,
            genieUserIdea: '',
            updatedAt: Date.now()
          }
        }

        const useObj: ProductShotSession = (use && typeof use === 'object') ? (use as any) : initFromSet()

        if (typeof useObj?.agent1Template === 'string') setAgent1Template(useObj.agent1Template)
        if (typeof useObj?.agent2Template === 'string') setAgent2Template(useObj.agent2Template)
        if (typeof useObj?.agent3Template === 'string') setAgent3Template(useObj.agent3Template)
        if (typeof useObj?.agent1Output === 'string') setAgent1Output(useObj.agent1Output)
        if (typeof useObj?.agent2Output === 'string') setAgent2Output(useObj.agent2Output)
        if (typeof useObj?.finalPrompt === 'string') setFinalPrompt(useObj.finalPrompt)
        if (Array.isArray(useObj?.outImages)) setOutImages(useObj.outImages.map(String).filter(Boolean).slice(0, 60))
        if (useObj?.outMetaByUrl && typeof useObj.outMetaByUrl === 'object') {
          setOutMetaByUrl(useObj.outMetaByUrl as any)
        }
        if (typeof useObj?.agent1Model === 'string') setAgent1Model(useObj.agent1Model)
        if (typeof useObj?.agent2Model === 'string') setAgent2Model(useObj.agent2Model)
        if (typeof useObj?.genModel === 'string') setGenModel(useObj.genModel)

        if (typeof useObj?.genRatio === 'string') {
          const r = String(useObj.genRatio)
          if (['Auto', '1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '21:9'].includes(r)) setGenRatio(r as any)
        }
        if (typeof useObj?.genRes === 'string') {
          const rr = String(useObj.genRes)
          if (['1K', '2K', '4K'].includes(rr)) setGenRes(rr as any)
        }

        if (typeof (useObj as any)?.taskBatchCount === 'number') {
          setTaskBatchCount(clampInt((useObj as any).taskBatchCount, 1, 20))
        }

        if (typeof (useObj as any)?.genieTemplateSource === 'string') {
          const v = String((useObj as any).genieTemplateSource)
          if (v === 'set' || v === 'editor') setGenieTemplateSource(v as any)
        }
        if (typeof (useObj as any)?.genieBaseSetId === 'string') {
          const v = String((useObj as any).genieBaseSetId || '').trim()
          setGenieBaseSetId(v || 'follow-active')
        }
        if (typeof (useObj as any)?.genieUseImages === 'boolean') {
          setGenieUseImages(Boolean((useObj as any).genieUseImages))
        }
        if ((useObj as any)?.genieFlags && typeof (useObj as any).genieFlags === 'object') {
          setGenieFlags(prev => ({ ...prev, ...((useObj as any).genieFlags || {}) }))
        }
        if (typeof (useObj as any)?.genieProductAngleCount === 'number') {
          setGenieProductAngleCount(clampInt((useObj as any).genieProductAngleCount, 0, 2))
        }
        if (typeof (useObj as any)?.genieUserIdea === 'string') {
          setGenieUserIdea(String((useObj as any).genieUserIdea || ''))
        }

        memSessionByWs[workspaceId] = useObj
      } catch {
        // ignore
      } finally {
        if (alive) setSessionHydratedWs(workspaceId)
      }
    })()
    return () => {
      alive = false
    }
  }, [workspaceId, activePromptSetId, activePromptSetObj, promptModel, imageModel])

  const buildManifest = (): ProductShotInputManifest => {
    const pa: InputManifestItem[] = []
    for (const img of (productAngles || []).slice(0, 24)) {
      const lp = imageLocalPath(img)
      if (!lp) continue
      pa.push({
        id: normalizeId(img),
        name: String(img?.name || 'image'),
        localPath: lp,
        createdAt: Number(img?.createdAt || Date.now())
      })
    }
    const sl: Record<string, InputManifestItem | null> = {}
    for (const s of slots) {
      const img = images?.[s.key] || null
      const lp = imageLocalPath(img)
      if (!img || !lp) {
        sl[s.key] = null
      } else {
        sl[s.key] = {
          id: normalizeId(img),
          name: String(img?.name || 'image'),
          localPath: lp,
          createdAt: Number(img?.createdAt || Date.now())
        }
      }
    }
    return { productAngles: pa, slots: sl, updatedAt: Date.now() }
  }

  const buildSession = (): ProductShotSession => ({
    agent1Template: String(agent1Template || ''),
    agent2Template: String(agent2Template || ''),
    agent3Template: String(agent3Template || ''),
    agent1Output: String(agent1Output || ''),
    agent2Output: String(agent2Output || ''),
    finalPrompt: String(finalPrompt || ''),
    outImages: (outImages || []).map(String).filter(Boolean).slice(0, 60),
    outMetaByUrl: (() => {
      const urls = (outImages || []).map(String).filter(Boolean).slice(0, 60)
      const out: any = {}
      for (const u of urls) {
        const meta = (outMetaByUrl as any)?.[u]
        if (meta && typeof meta === 'object') out[u] = meta
      }
      return out
    })(),
    agent1Model: String(agent1Model || ''),
    agent2Model: String(agent2Model || ''),
    genModel: String(genModel || ''),
    genRatio: String(genRatio || ''),
    genRes: String(genRes || ''),

    taskBatchCount: clampInt(taskBatchCount, 1, 20),

    genieTemplateSource,
    genieBaseSetId: String(genieBaseSetId || 'follow-active'),
    genieUseImages,
    genieFlags,
    genieProductAngleCount: clampInt(genieProductAngleCount, 0, 2),
    genieUserIdea: String(genieUserIdea || ''),
    updatedAt: Date.now()
  })

  // persist manifest (cached local paths only)
  useEffect(() => {
    if (!inputHydrated) return
    window.clearTimeout(persistingRef.current.manifest)
    persistingRef.current.manifest = window.setTimeout(() => {
      const m = buildManifest()
      memManifestByWs[workspaceId] = m
      void kvSetJson(psInputKey(workspaceId), m)
    }, 420)
    return () => window.clearTimeout(persistingRef.current.manifest)
  }, [workspaceId, inputHydrated, productAngles, images, slots])

  // persist session (texts + selected models)
  useEffect(() => {
    if (!sessionHydrated) return
    window.clearTimeout(persistingRef.current.session)
    persistingRef.current.session = window.setTimeout(() => {
      const s = buildSession()
      memSessionByWs[workspaceId] = s
      void kvSetJson(psSessionKey(workspaceId), s)
    }, 420)
    return () => window.clearTimeout(persistingRef.current.session)
  }, [workspaceId, sessionHydrated, agent1Template, agent2Template, agent3Template, agent1Output, agent2Output, finalPrompt, outImages, outMetaByUrl, agent1Model, agent2Model, genModel, genRatio, genRes, taskBatchCount, genieTemplateSource, genieBaseSetId, genieUseImages, genieFlags, genieProductAngleCount, genieUserIdea])

  // best-effort flush on unmount
  useEffect(() => {
    return () => {
      try {
        if (inputHydrated) {
          const m = buildManifest()
          memManifestByWs[workspaceId] = m
          void kvSetJson(psInputKey(workspaceId), m)
        }
        if (sessionHydrated) {
          const s = buildSession()
          memSessionByWs[workspaceId] = s
          void kvSetJson(psSessionKey(workspaceId), s)
        }
      } catch {
        // ignore
      }
    }
  }, [workspaceId, inputHydrated, sessionHydrated, productAngles, images, slots, agent1Template, agent2Template, agent3Template, agent1Output, agent2Output, finalPrompt, outImages, outMetaByUrl, agent1Model, agent2Model, genModel, genRatio, genRes, taskBatchCount, genieTemplateSource, genieBaseSetId, genieUseImages, genieFlags, genieProductAngleCount, genieUserIdea])

  const sentItemsAgent1: SentItem[] = useMemo(() => {
    const items: SentItem[] = []
    for (const [i, img] of productAngles.slice(0, MAX_LLM_PRODUCT_ANGLES).entries()) {
      items.push({ label: `浜у搧涓嶅悓瑙掑害鍥?${i + 1}`, img })
    }
    if (images['wear_ref']) items.push({ label: '浣╂埓鍙傝€', img: images['wear_ref'] as QuickAppInputImage })
    if (images['model']) items.push({ label: '鎴戜滑鐨勬ā鐗', img: images['model'] as QuickAppInputImage })
    return items
  }, [productAngles, images])

  const sentItemsAgent2: SentItem[] = useMemo(() => {
    const items: SentItem[] = []
    for (const [i, img] of productAngles.slice(0, MAX_LLM_PRODUCT_ANGLES).entries()) {
      items.push({ label: `浜у搧涓嶅悓瑙掑害鍥?${i + 1}`, img })
    }
    const orderKeys = ['model', 'outfit', 'scene', 'pose', 'wear_ref'] as const
    const labels: Record<string, string> = {
      model: '鎴戜滑鐨勬ā鐗',
      outfit: '鏈嶈鍙傝€',
      scene: '鍦烘櫙鍥',
      pose: '鍙傝€冨Э鎬佸浘',
      wear_ref: '浣╂埓鍙傝€?
    }
    for (const k of orderKeys) {
      const img = (images as any)[k] as QuickAppInputImage | null
      if (img) items.push({ label: labels[k], img })
    }
    return items
  }, [productAngles, images])

  const sentItemsGen: SentItem[] = useMemo(() => {
    const items: SentItem[] = []
    for (const [i, img] of productAngles.slice(0, MAX_GEN_PRODUCT_ANGLES).entries()) {
      items.push({ label: `浜у搧涓嶅悓瑙掑害鍥?${i + 1}`, img })
    }
    const orderKeys = ['model', 'outfit', 'scene', 'pose', 'wear_ref'] as const
    const labels: Record<string, string> = {
      model: '鎴戜滑鐨勬ā鐗',
      outfit: '鏈嶈鍙傝€',
      scene: '鍦烘櫙鍥',
      pose: '鍙傝€冨Э鎬佸浘',
      wear_ref: '浣╂埓鍙傝€?
    }
    for (const k of orderKeys) {
      const img = (images as any)[k] as QuickAppInputImage | null
      if (img) items.push({ label: labels[k], img })
    }
    return items
  }, [productAngles, images])

  const sentSizeAgent1 = useMemo(() => sentItemsAgent1.reduce((sum, it) => sum + (it.img.bytes || 0), 0), [sentItemsAgent1])
  const sentSizeAgent2 = useMemo(() => sentItemsAgent2.reduce((sum, it) => sum + (it.img.bytes || 0), 0), [sentItemsAgent2])
  const sentSizeGen = useMemo(() => sentItemsGen.reduce((sum, it) => sum + (it.img.bytes || 0), 0), [sentItemsGen])

  const cacheInputImage = async (img: QuickAppInputImage, filePrefix: string) => {
    const api = (window as any).aitntAPI
    const id = normalizeId(img)
    const createdAt = Number(img?.createdAt || Date.now())

    const existing = imageLocalPath(img)
    if (existing) {
      return { ...img, id, createdAt, localPath: existing, dataUrl: existing }
    }

    const src = String(img.sourceDataUrl && isDataUrl(img.sourceDataUrl) ? img.sourceDataUrl : img.dataUrl)
    if (!api?.downloadImage || !isDataUrl(src)) {
      return { ...img, id, createdAt }
    }

    try {
      const saved = await api.downloadImage({ url: src, saveDir: CACHE_SAVE_DIR, fileName: `${filePrefix}_${id}` })
      const localPath = String(saved?.localPath || '')
      if (saved?.success && isCachedLocalPath(localPath)) {
        return { ...img, id, createdAt, localPath, dataUrl: localPath, sourceDataUrl: src }
      }
    } catch {
      // ignore
    }
    return { ...img, id, createdAt }
  }

  const removeCachedFile = async (img: QuickAppInputImage | null | undefined) => {
    const api = (window as any).aitntAPI
    const lp = imageLocalPath(img)
    if (!api?.removeInputImageCacheFile || !lp) return
    try {
      await api.removeInputImageCacheFile({ localPath: lp })
    } catch {
      // ignore
    }
  }

  const onProductAnglesChange = (nextRaw: QuickAppInputImage[]) => {
    const next = (nextRaw || []).map(x => ({ ...x, id: normalizeId(x), createdAt: Number(x.createdAt || Date.now()) }))
    const removed = (productAngles || []).filter(p => !next.some(n => String(n.id) === String(p.id)))
    setProductAngles(next)
    // best-effort cleanup removed cached files
    void Promise.all(removed.map(removeCachedFile))

    // cache new images (async)
    void (async () => {
      for (const img of next) {
        if (imageLocalPath(img)) continue
        const cached = await cacheInputImage(img, 'qa_ps_angle')
        const lp = imageLocalPath(cached)
        if (!lp) continue
        setProductAngles(prev => prev.map(p => String(p.id) === String(cached.id) ? cached : p))
      }
    })()
  }

  const onSlotChange = (key: string, nextImg: QuickAppInputImage | null) => {
    const prev = images?.[key] || null
    if (!nextImg) {
      setImages(p => ({ ...p, [key]: null }))
      void removeCachedFile(prev)
      return
    }

    const withId = { ...nextImg, id: normalizeId(nextImg), createdAt: Number(nextImg.createdAt || Date.now()) }
    setImages(p => ({ ...p, [key]: withId }))

    void (async () => {
      const cached = await cacheInputImage(withId, `qa_ps_${key}`)
      const lp = imageLocalPath(cached)
      if (!lp) return
      setImages(p => ({ ...p, [key]: cached }))
    })()
  }

  const runAgent1 = async () => {
    if (missingRequired) {
      uiToast('info', '璇峰厛涓婁紶鑷冲皯涓€寮犫€滀骇鍝佷笉鍚岃搴﹀浘鈥')
      return
    }
    if (!canUseLLM) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閰嶇疆鈥滄彁绀鸿瘝妯″瀷/Key鈥')
      return
    }
    setBusy('agent1')
    try {
      const parts: any[] = []
      parts.push({ type: 'text', text: '浠ヤ笅鏄緭鍏ュ浘鐗囷紙姣忓紶鍥剧墖鍓嶆垜閮戒細鐢ㄦ枃瀛楁爣娉ㄧ敤閫旓級銆傝涓ユ牸鎸夌収绯荤粺鎻愮ず瀹屾垚杈撳嚭銆' })

      const ensured = await Promise.all((sentItemsAgent1 || []).map(async (it) => ({
        label: it.label,
        img: await ensureQuickAppImageData(it.img)
      })))

      for (const it of ensured) {
        parts.push({ type: 'text', text: `銆?{it.label}銆慲 })
        parts.push({ type: 'image_url', image_url: { url: String(it.img.sourceDataUrl || it.img.dataUrl || '') } })
      }

      const messages: ChatMessage[] = [
        { role: 'system', content: String(agent1Template || '') },
        { role: 'user', content: parts }
      ]

      const text = await chatCompletionsText({
        baseUrl,
        apiKey: promptApiKey,
        model: effectiveAgent1Model || promptModel,
        messages,
        temperature: 0.4,
        maxTokens: 2000
      })
      setAgent1Output(text)
      uiToast('success', '宸茬敓鎴愪骇鍝佸垎鏋')
    } catch (e: any) {
      uiToast('error', e?.message || '鐢熸垚澶辫触')
    } finally {
      setBusy(null)
    }
  }

  const runAgent2 = async () => {
    if (missingRequired) {
      uiToast('info', '璇峰厛涓婁紶鑷冲皯涓€寮犫€滀骇鍝佷笉鍚岃搴﹀浘鈥')
      return
    }
    if (!canUseLLM) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閰嶇疆鈥滄彁绀鸿瘝妯″瀷/Key鈥')
      return
    }
    if (!String(agent1Output || '').trim()) {
      uiToast('info', '璇峰厛杩愯瑙掕壊1鐢熸垚鈥滀骇鍝佽缁嗕俊鎭彁绀鸿瘝鈥')
      return
    }

    setBusy('agent2')
    try {
      const intro = joinNonEmpty([
        '浠ヤ笅鏄潵鑷鑹?鐨勪骇鍝佽缁嗕俊鎭彁绀鸿瘝锛堣浣滀负閲嶈鍙傝€冿級锛',
        agent1Output,
        '',
        '璇风粨鍚堣緭鍏ュ浘鐗囩敓鎴愩€愰鍥炬媿鎽勫姩浣溿€戯紝涓ユ牸鎸夌郴缁熸牸寮忚緭鍑恒€?
      ], '\n')

      const parts: any[] = []
      parts.push({ type: 'text', text: intro })

      const ensured = await Promise.all((sentItemsAgent2 || []).map(async (it) => ({
        label: it.label,
        img: await ensureQuickAppImageData(it.img)
      })))

      for (const it of ensured) {
        parts.push({ type: 'text', text: `銆?{it.label}銆慲 })
        parts.push({ type: 'image_url', image_url: { url: String(it.img.sourceDataUrl || it.img.dataUrl || '') } })
      }

      const messages: ChatMessage[] = [
        { role: 'system', content: String(agent2Template || '') },
        { role: 'user', content: parts }
      ]

      const text = await chatCompletionsText({
        baseUrl,
        apiKey: promptApiKey,
        model: effectiveAgent2Model || promptModel,
        messages,
        temperature: 0.6,
        maxTokens: 2000
      })
      setAgent2Output(text)
      uiToast('success', '宸茬敓鎴愰鍥炬媿鎽勫姩浣')
    } catch (e: any) {
      uiToast('error', e?.message || '鐢熸垚澶辫触')
    } finally {
      setBusy(null)
    }
  }

  const mergeFinal = async () => {
    setBusy('merge')
    try {
      const merged = assembleFinalPrompt({ agent3Template, agent2Output, agent1Output })
      setFinalPrompt(merged)
      uiToast('success', '宸插悎骞剁敓鎴愭渶缁堟彁绀鸿瘝')
    } finally {
      setBusy(null)
    }
  }

  const runGenerate = async () => {
    if (missingRequired) {
      uiToast('info', '璇峰厛涓婁紶鑷冲皯涓€寮犫€滀骇鍝佷笉鍚岃搴﹀浘鈥')
      return
    }
    if (!canGenImage) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閰嶇疆鈥滅敓鍥炬ā鍨?Key鈥')
      return
    }
    const prompt = String(finalPrompt || '').trim()
    if (!prompt) {
      uiToast('info', '璇峰厛鍚堝苟鐢熸垚鏈€缁堟彁绀鸿瘝')
      return
    }

    setBusy('gen')
    try {
      const ensured = await Promise.all((sentItemsGen || []).map(async (it) => await ensureQuickAppImageData(it.img)))
      const base64s: string[] = ensured.map(x => String(x.base64 || '').trim()).filter(Boolean)

      const ratioToUse = genRatio === 'Auto' ? '1:1' : genRatio
      const targetSize = getSizeFromRatioAndRes(ratioToUse, genRes)

      let lastReq: any = null
      let lastResp: any = null

      const urls = await generateImage({
        baseUrl,
        apiKey: imageApiKey,
        model: effectiveGenModel || imageModel,
        prompt,
        n: 1,
        size: targetSize,
        aspectRatio: ratioToUse,
        imageSize: genRes,
        image: base64s.length > 0 ? base64s : undefined,
        saveDir,
        onRequest: (req) => {
          lastReq = req
        },
        onResponse: (resp) => {
          lastResp = resp
        }
      })

      const now = Date.now()
      const modelUsed = String(effectiveGenModel || imageModel || '')
      const ratioUsed = String(ratioToUse || '1:1')
      const resUsed = String(genRes || '1K')
      const sizeUsed = String(targetSize || '')

      if (urls && urls.length) {
        setOutMetaByUrl((prev) => {
          const next: any = { ...(prev || {}) }
          for (const u of urls.map(String).filter(Boolean)) {
            if (!next[u]) next[u] = { createdAt: now, model: modelUsed, ratio: ratioUsed, res: resUsed, targetSize: sizeUsed }
          }
          return next
        })

        if (lastReq || lastResp) {
          for (const u of urls.map(String).filter(Boolean)) {
            debugRef.current[u] = { request: lastReq || undefined, response: lastResp || undefined }
          }
          memDebugByWs[workspaceId] = debugRef.current
          setDebugTick(t => t + 1)
        }
      }
      setOutImages((prev) => {
        const merged = [...(urls || []).map(String).filter(Boolean), ...(prev || [])]
        const out: string[] = []
        const seen = new Set<string>()
        for (const u of merged) {
          const s = String(u || '').trim()
          if (!s) continue
          if (seen.has(s)) continue
          seen.add(s)
          out.push(s)
          if (out.length >= 60) break
        }
        return out
      })
      uiToast('success', '宸茬敓鎴愬浘鐗')
    } catch (e: any) {
      uiToast('error', e?.message || '鐢熸垚澶辫触')
    } finally {
      setBusy(null)
    }
  }

  const presetSelect = (role: AgentRole, value: string, setter: (t: string) => void) => {
    const id = value || null
    setActivePreset(role, id)
    if (!id) return
    const p = presets.find(x => x.id === id)
    if (p) setter(p.text)
  }

  const saveNewPreset = async (role: AgentRole, text: string) => {
    const title = await uiPrompt('璇疯緭鍏ユā鏉垮悕绉?, { title: '淇濆瓨涓洪璁?, placeholder: '渚嬪锛氬附瀛?浜у搧鍒嗘瀽' })
    if (!title) return
    const t = String(text || '').trim()
    if (!t) {
      uiToast('info', '妯℃澘鍐呭涓虹┖')
      return
    }
    addPreset(role, title, t)
    uiToast('success', '宸蹭繚瀛橀璁')
  }

  const overwritePreset = async (role: AgentRole, id: string | null, text: string) => {
    if (!id) {
      uiToast('info', '璇峰厛閫夋嫨涓€涓璁')
      return
    }
    const ok = await uiConfirm('瑕嗙洊淇濆瓨褰撳墠棰勮锛', '瑕嗙洊淇濆瓨')
    if (!ok) return
    updatePreset(id, { text: String(text || '') })
    uiToast('success', '宸茶鐩栦繚瀛')
  }

  const deletePreset = async (role: AgentRole, id: string | null) => {
    if (!id) {
      uiToast('info', '璇峰厛閫夋嫨涓€涓璁')
      return
    }
    const ok = await uiConfirm('纭畾鍒犻櫎璇ラ璁撅紵', '鍒犻櫎棰勮')
    if (!ok) return
    removePreset(id)
    setActivePreset(role, null)
    uiToast('success', '宸插垹闄')
  }

  return (
    <div className="qa-run ps-run">
      <div className="qa-run-head">
        <Link to="/apps/product_shot" className="qa-back"><ArrowLeft size={18} /> 杩斿洖</Link>
        <div className="qa-run-title">
          <div className="n">浜у搧鍥惧寮猴紙鑴氭湰娴佺▼锛?/div>
          <div className="d">瑙掕壊1鍒嗘瀽浜у搧缁嗚妭锛岃鑹?鍐欐媿鎽勫姩浣滐紝瑙掕壊3鍚堝苟鐢熸垚鏈€缁堜腑鏂囨彁绀鸿瘝</div>
        </div>
      </div>

      <div className="ps-body">
        <div className="qa-panel">
          <div className="qa-panel-title">杈撳叆绱犳潗</div>
          <div className="qa-field">
            <div className="qa-label">浜у搧涓嶅悓瑙掑害鍥撅紙蹇呭～锛?/div>
            <MultiImageDrop
              value={productAngles}
              onChange={onProductAnglesChange}
              disabled={Boolean(busy)}
              max={12}
              placeholder="涓婁紶浜у搧涓嶅悓瑙掑害鍥?
            />
          </div>

          {slots.map(s => (
            <div key={s.key} className="qa-field">
              <div className="qa-label">{s.label}</div>
              <ImageDrop
                value={images[s.key] || null}
                onChange={(next) => onSlotChange(s.key, next)}
                disabled={Boolean(busy)}
              />
            </div>
          ))}
        </div>

        <div className="qa-panel">
          <div className="qa-panel-titlebar">
            <div className="qa-panel-title">瑙掕壊妯℃澘</div>
            <button
              className="ps-mini"
              type="button"
              onClick={() => setGenieOpen(true)}
              disabled={Boolean(busy)}
              title="鎻愮ず璇嶇簿鐏碉細鏍规嵁浣犵殑鎯虫硶鐢熸垚涓€濂椾笁瑙掕壊妯℃澘"
            >
              <Bot size={14} /> 鎻愮ず璇嶇簿鐏?            </button>
          </div>

          <div className="ps-setbar">
            <div className="ps-setbar-k">妯℃澘缁?/div>
            <div className="ps-setbar-v">
              <select
                className="ps-select"
                value={activePromptSetId || ''}
                onChange={async (e) => {
                  const id = String(e.target.value || '').trim()
                  if (!id) {
                    setActivePromptSetId('')
                    setActiveSet('product_shot', null)
                    lastAppliedSetRef.current = null
                    return
                  }
                  const s = setsForProductShot.find(x => x.id === id)
                  if (s) await applyPromptSet(s)
                }}
                disabled={Boolean(busy)}
              >
                <option value="">閫夋嫨妯℃澘缁?..</option>
                {setsForProductShot.map(s => (
                  <option key={s.id} value={s.id}>{s.category ? `${s.category} / ${s.name}` : s.name}</option>
                ))}
              </select>

              <button className="ps-btn" type="button" onClick={() => void saveAsPromptSet()} disabled={Boolean(busy)} title="淇濆瓨褰撳墠涓夋妯℃澘涓庣敓鍥惧弬鏁板埌鎻愮ず璇嶅簱">淇濆瓨鍒板簱</button>
              <button className="ps-btn" type="button" onClick={() => void overwritePromptSet()} disabled={Boolean(busy)} title="瑕嗙洊淇濆瓨褰撳墠閫変腑鐨勬ā鏉跨粍">瑕嗙洊</button>
              <button className="ps-btn danger" type="button" onClick={() => void deletePromptSet()} disabled={Boolean(busy)} title="鍒犻櫎褰撳墠妯℃澘缁?>鍒犻櫎</button>
              <button
                className="ps-btn"
                type="button"
                onClick={() => navigate(`/apps/prompts?back=${encodeURIComponent('/apps/product_shot?view=studio')}`)}
                disabled={Boolean(busy)}
                title="鎵撳紑鎻愮ず璇嶅簱"
              >
                绠＄悊
              </button>
            </div>
          </div>

          <div className="ps-role">
            <div className="ps-role-head">
              <div className="ps-role-title">瑙掕壊1锛氫骇鍝佸垎鏋愬笀</div>
              <div className="ps-role-actions">
                 <button className="ps-iconbtn" type="button" onClick={() => void editText('瑙掕壊1妯℃澘锛氫骇鍝佸垎鏋愬笀', agent1Template, setAgent1Template)} title="灞曞紑缂栬緫">
                   <Maximize2 size={16} />
                 </button>
              </div>
            </div>
            <div className="ps-inline">
              <div className="ps-inline-k">妯″瀷</div>
              <div className="ps-inline-v">
                <ModelPicker
                  value={effectiveAgent1Model}
                  placeholder={promptModel ? `璺熼殢榛樿锛?{promptModel}锛塦 : '璺熼殢榛樿锛堟湭閫夋嫨锛'}
                  commonModels={promptPinned}
                  allModels={allModels}
                  onChange={setAgent1Model}
                  disabled={Boolean(busy)}
                />
                <button
                  className="ps-mini"
                  type="button"
                  onClick={() => setShowAgent1Sent(v => !v)}
                  disabled={Boolean(busy)}
                  title="鏌ョ湅瀹為檯鍙戦€佺粰 AI 鐨勫弬鑰冨浘锛堝帇缂╁悗锛?
                >
                  <Images size={14} /> 鍙戦€佸弬鑰冨浘 {sentItemsAgent1.length}{sentSizeAgent1 ? `锛?{formatBytes(sentSizeAgent1)}锛塦 : ''}
                </button>
              </div>
            </div>
            {showAgent1Sent ? (
              <SentImagesPanel title={`瑙掕壊1 鍙戦€佸弬鑰冨浘锛堟渶澶?${MAX_LLM_PRODUCT_ANGLES} 寮犱骇鍝佽搴﹀浘锛塦} items={sentItemsAgent1} />
            ) : null}
            <textarea className="ps-textarea" value={agent1Template} onChange={(e) => setAgent1Template(e.target.value)} spellCheck={false} />
            <button className="qa-primary" type="button" onClick={() => void runAgent1()} disabled={Boolean(busy)}>
              <Play size={16} /> {busy === 'agent1' ? '鍒嗘瀽涓?..' : '杩愯瑙掕壊1锛堜骇鍝佸垎鏋愶級'}
            </button>
          </div>

          <div className="ps-role" style={{ marginTop: 12 }}>
            <div className="ps-role-head">
              <div className="ps-role-title">瑙掕壊2锛氭憚褰卞婕?/div>
              <div className="ps-role-actions">
                 <button className="ps-iconbtn" type="button" onClick={() => void editText('瑙掕壊2妯℃澘锛氭憚褰卞婕', agent2Template, setAgent2Template)} title="灞曞紑缂栬緫">
                   <Maximize2 size={16} />
                 </button>
              </div>
            </div>
            <div className="ps-inline">
              <div className="ps-inline-k">妯″瀷</div>
              <div className="ps-inline-v">
                <ModelPicker
                  value={effectiveAgent2Model}
                  placeholder={promptModel ? `璺熼殢榛樿锛?{promptModel}锛塦 : '璺熼殢榛樿锛堟湭閫夋嫨锛'}
                  commonModels={promptPinned}
                  allModels={allModels}
                  onChange={setAgent2Model}
                  disabled={Boolean(busy)}
                />
                <button
                  className="ps-mini"
                  type="button"
                  onClick={() => setShowAgent2Sent(v => !v)}
                  disabled={Boolean(busy)}
                  title="鏌ョ湅瀹為檯鍙戦€佺粰 AI 鐨勫弬鑰冨浘锛堝帇缂╁悗锛?
                >
                  <Images size={14} /> 鍙戦€佸弬鑰冨浘 {sentItemsAgent2.length}{sentSizeAgent2 ? `锛?{formatBytes(sentSizeAgent2)}锛塦 : ''}
                </button>
              </div>
            </div>
            {showAgent2Sent ? (
              <SentImagesPanel title={`瑙掕壊2 鍙戦€佸弬鑰冨浘锛堟渶澶?${MAX_LLM_PRODUCT_ANGLES} 寮犱骇鍝佽搴﹀浘锛塦} items={sentItemsAgent2} />
            ) : null}
            <textarea className="ps-textarea" value={agent2Template} onChange={(e) => setAgent2Template(e.target.value)} spellCheck={false} />
            <button className="qa-primary" type="button" onClick={() => void runAgent2()} disabled={Boolean(busy)}>
              <Play size={16} /> {busy === 'agent2' ? '鐢熸垚涓?..' : '杩愯瑙掕壊2锛堥鍥炬媿鎽勫姩浣滐級'}
            </button>
          </div>

          <div className="ps-role" style={{ marginTop: 12 }}>
            <div className="ps-role-head">
              <div className="ps-role-title">瑙掕壊3锛氱敓鍥炬墽琛岃€咃紙鎷艰妯℃澘锛?/div>
              <div className="ps-role-actions">
                 <button className="ps-iconbtn" type="button" onClick={() => void editText('瑙掕壊3妯℃澘锛氱敓鍥炬墽琛岃€', agent3Template, setAgent3Template)} title="灞曞紑缂栬緫">
                   <Maximize2 size={16} />
                 </button>
              </div>
            </div>
            <div className="ps-inline">
              <div className="ps-inline-k">鐢熷浘妯″瀷</div>
              <div className="ps-inline-v">
                <ModelPicker
                  value={effectiveGenModel}
                  placeholder={imageModel ? `璺熼殢榛樿锛?{imageModel}锛塦 : '璺熼殢榛樿锛堟湭閫夋嫨锛'}
                  commonModels={imagePinned}
                  allModels={allModels}
                  onChange={setGenModel}
                  disabled={Boolean(busy)}
                />
                <button
                  className="ps-mini"
                  type="button"
                  onClick={() => setShowGenSent(v => !v)}
                  disabled={Boolean(busy)}
                  title="鏌ョ湅瀹為檯鍙戦€佺粰鐢熷浘鎺ュ彛鐨勫弬鑰冨浘锛堝帇缂╁悗锛?
                >
                  <Images size={14} /> 鍙戦€佸弬鑰冨浘 {sentItemsGen.length}{sentSizeGen ? `锛?{formatBytes(sentSizeGen)}锛塦 : ''}
                </button>

                <button
                  className="ps-mini"
                  type="button"
                  onClick={() => setGenParamsOpen(v => !v)}
                  disabled={Boolean(busy)}
                  title="灞曞紑璁剧疆姣斾緥涓庡垎杈ㄧ巼"
                >
                  <Settings2 size={14} /> 鍙傛暟
                </button>
              </div>
            </div>
            {genParamsOpen ? (
              <div className="ps-genparams">
                <div className="ps-genparams-row">
                  <div className="k">姣斾緥</div>
                  <div className="v">
                    <select className="ps-select" value={genRatio} onChange={(e) => setGenRatio(e.target.value as any)}>
                      <option value="Auto">Auto锛?:1锛?/option>
                      <option value="1:1">1:1</option>
                      <option value="3:4">3:4</option>
                      <option value="4:3">4:3</option>
                      <option value="9:16">9:16</option>
                      <option value="16:9">16:9</option>
                      <option value="2:3">2:3</option>
                      <option value="3:2">3:2</option>
                      <option value="21:9">21:9</option>
                    </select>
                  </div>
                </div>
                <div className="ps-genparams-row">
                  <div className="k">鍒嗚鲸鐜?/div>
                  <div className="v">
                    <select className="ps-select" value={genRes} onChange={(e) => setGenRes(e.target.value as any)}>
                      <option value="1K">1K</option>
                      <option value="2K">2K</option>
                      <option value="4K">4K</option>
                    </select>
                    <div className="ps-genparams-hint">瀹為檯鍍忕礌锛堥潪 comfly锛夛細{getSizeFromRatioAndRes(genRatio === 'Auto' ? '1:1' : genRatio, genRes)}</div>
                  </div>
                </div>
              </div>
            ) : null}
            {showGenSent ? (
              <SentImagesPanel title={`鐢熷浘 鍙戦€佸弬鑰冨浘锛堟渶澶?${MAX_GEN_PRODUCT_ANGLES} 寮犱骇鍝佽搴﹀浘锛塦} items={sentItemsGen} />
            ) : null}
            <textarea className="ps-textarea" value={agent3Template} onChange={(e) => setAgent3Template(e.target.value)} spellCheck={false} />
            <button className="qa-primary" type="button" onClick={() => void mergeFinal()} disabled={Boolean(busy)}>
              <Sparkles size={16} /> {busy === 'merge' ? '鍚堝苟涓?..' : '鍚堝苟鐢熸垚鏈€缁堟彁绀鸿瘝'}
            </button>
          </div>
        </div>

        <div className="qa-panel">
          <div className="qa-panel-title">杈撳嚭涓庣敓鎴?/div>

          <div className="ps-out">
            <div className="ps-out-head">
              <div className="ps-out-title">瑙掕壊1杈撳嚭锛氫骇鍝佽缁嗕俊鎭彁绀鸿瘝</div>
              <div className="ps-out-actions">
                <button className="ps-iconbtn" type="button" onClick={() => copyText(agent1Output)} title="澶嶅埗"><Copy size={16} /></button>
                 <button className="ps-iconbtn" type="button" onClick={() => void editText('瑙掕壊1杈撳嚭锛氫骇鍝佽缁嗕俊鎭彁绀鸿瘝', agent1Output, setAgent1Output)} title="灞曞紑缂栬緫"><Maximize2 size={16} /></button>
              </div>
            </div>
            <textarea className="ps-outarea" value={agent1Output} onChange={(e) => setAgent1Output(e.target.value)} placeholder="杩愯瑙掕壊1鍚庤緭鍑轰細鏄剧ず鍦ㄨ繖閲?.." spellCheck={false} />
          </div>

          <div className="ps-out" style={{ marginTop: 12 }}>
            <div className="ps-out-head">
              <div className="ps-out-title">瑙掕壊2杈撳嚭锛氶鍥炬媿鎽勫姩浣滐紙鍙慨鏀癸級</div>
              <div className="ps-out-actions">
                <button className="ps-iconbtn" type="button" onClick={() => copyText(agent2Output)} title="澶嶅埗"><Copy size={16} /></button>
                 <button className="ps-iconbtn" type="button" onClick={() => void editText('瑙掕壊2杈撳嚭锛氶鍥炬媿鎽勫姩浣', agent2Output, setAgent2Output)} title="灞曞紑缂栬緫"><Maximize2 size={16} /></button>
              </div>
            </div>
            <textarea className="ps-outarea" value={agent2Output} onChange={(e) => setAgent2Output(e.target.value)} placeholder="杩愯瑙掕壊2鍚庤緭鍑轰細鏄剧ず鍦ㄨ繖閲?.." spellCheck={false} />
          </div>

          <div className="ps-out" style={{ marginTop: 12 }}>
            <div className="ps-out-head">
              <div className="ps-out-title">鏈€缁堢敓鍥炬彁绀鸿瘝锛堜腑鏂囷紝鍙慨鏀癸級</div>
              <div className="ps-out-actions">
                <button className="ps-iconbtn" type="button" onClick={() => copyText(finalPrompt)} title="澶嶅埗"><Copy size={16} /></button>
                 <button className="ps-iconbtn" type="button" onClick={() => void editText('鏈€缁堢敓鍥炬彁绀鸿瘝锛堜腑鏂囷級', finalPrompt, setFinalPrompt)} title="灞曞紑缂栬緫"><Maximize2 size={16} /></button>
                <button className="ps-runbtn" type="button" onClick={() => void runGenerate()} disabled={Boolean(busy)}>
                  <Play size={16} /> {busy === 'gen' ? '鐢熷浘涓?..' : '寮€濮嬬敓鍥'}
                </button>

                <div className="ps-batch-control" title="鍙戝竷浠诲姟娆℃暟">
                  <button className="ps-batch-btn" type="button" onClick={decTaskBatch} disabled={Boolean(busy) || taskBatchCount <= 1} aria-label="鍑忓皯鍙戝竷娆℃暟">
                    <Minus size={14} />
                  </button>
                  <span className="ps-batch-value">{taskBatchCount}</span>
                  <button className="ps-batch-btn" type="button" onClick={incTaskBatch} disabled={Boolean(busy) || taskBatchCount >= 20} aria-label="澧炲姞鍙戝竷娆℃暟">
                    <Plus size={14} />
                  </button>
                </div>
                <button className="ps-runbtn ghost" type="button" onClick={() => void createTask()} disabled={Boolean(busy)} title={`鍒涘缓浠诲姟锛坸${taskBatchCount}锛夊苟鍚庡彴鑷姩璺戝叏娴佺▼`}>
                  <Sparkles size={16} /> {busy === 'task' ? '鍒涘缓涓?..' : '寮€濮嬩换鍔'}
                </button>
              </div>
            </div>
            <textarea className="ps-outarea" value={finalPrompt} onChange={(e) => setFinalPrompt(e.target.value)} placeholder="鐐瑰嚮鈥滃悎骞剁敓鎴愭渶缁堟彁绀鸿瘝鈥濆悗浼氭樉绀哄湪杩欓噷..." spellCheck={false} />
            {!provider ? (
              <div className="qa-hint">璇峰厛鍦ㄨ缃噷閰嶇疆 API 缃戠珯</div>
            ) : null}
            {provider && (!promptApiKey || !promptModel) ? (
              <div className="qa-hint">鎻愮ず璇嶆ā鍨嬫湭閰嶇疆锛氳鍦ㄨ缃腑閫夋嫨鎻愮ず璇嶆ā鍨嬪苟閰嶇疆 prompt Key</div>
            ) : null}
            {provider && (!imageApiKey || !imageModel) ? (
              <div className="qa-hint">鐢熷浘妯″瀷鏈厤缃細璇峰湪璁剧疆涓€夋嫨鐢熷浘妯″瀷骞堕厤缃?image Key</div>
            ) : null}
          </div>

          <div className="ps-out" style={{ marginTop: 12 }}>
            <div className="ps-out-head">
              <div className="ps-out-title">鐢熸垚缁撴灉</div>
              <div className="ps-out-sub">锛堢偣鍑诲浘鐗囧彲鍦ㄦ柊绐楀彛鏌ョ湅/淇濆瓨锛氬悗缁啀鍔狅級</div>
            </div>
            {outImages.length === 0 ? (
              <div className="qa-empty">
                <div className="t">杩樻病鏈夌粨鏋?/div>
                <div className="d">鍚堝苟鎻愮ず璇嶅悗鐐瑰嚮鈥滃紑濮嬬敓鍥锯€濄€?/div>
              </div>
            ) : (
              <div className="ps-result-grid">
                {outImages.map((u, i) => (
                  <div key={`${u}_${i}`} className="ps-result-item">
                    <img
                      src={u}
                      alt={`result_${i}`}
                      draggable={false}
                      onLoad={(e) => {
                        const img = e.currentTarget
                        const actual = `${img.naturalWidth}x${img.naturalHeight}`
                        setOutMetaByUrl((prev) => {
                          const next: any = { ...(prev || {}) }
                          const cur = next[u]
                          if (cur && cur.actualSize === actual) return prev
                          next[u] = { ...(cur || { createdAt: Date.now(), model: String(effectiveGenModel || imageModel || ''), ratio: String(genRatio === 'Auto' ? '1:1' : genRatio), res: String(genRes), targetSize: getSizeFromRatioAndRes(genRatio === 'Auto' ? '1:1' : genRatio, genRes) }), actualSize: actual }
                          return next
                        })
                      }}
                      onDoubleClick={() => {
                        setPreviewUrl(u)
                        setPreviewMsg('')
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ProductShotPromptGenie
        open={genieOpen}
        onClose={() => setGenieOpen(false)}
        disabled={Boolean(busy)}
        providerId={effectiveProviderId ? effectiveProviderId : null}
        baseUrl={baseUrl}
        apiKey={promptApiKey}
        model={String(effectiveAgent2Model || promptModel || '').trim()}
        templateSource={genieTemplateSource}
        onTemplateSourceChange={setGenieTemplateSource}
        baseSetId={genieBaseSetId}
        onBaseSetIdChange={setGenieBaseSetId}
        useImages={genieUseImages}
        onUseImagesChange={setGenieUseImages}
        flags={genieFlags}
        onFlagsChange={(patch) => setGenieFlags(prev => ({ ...prev, ...(patch as any) }))}
        productAngleCount={genieProductAngleCount}
        onProductAngleCountChange={(v) => setGenieProductAngleCount(clampInt(v, 0, 2))}
        userIdea={genieUserIdea}
        onUserIdeaChange={setGenieUserIdea}
        editorTemplates={{ agent1Template, agent2Template, agent3Template }}
        activeSet={activePromptSetObj}
        productAngles={productAngles}
        slots={images as any}
        onApplyAll={(t) => {
          setAgent1Template(String(t.agent1Template || ''))
          setAgent2Template(String(t.agent2Template || ''))
          setAgent3Template(String(t.agent3Template || ''))
        }}
      />

      {/* Preview modal (same behavior as ImageGen) */}
      <div className={`ps-preview-modal ${previewUrl ? 'show' : ''}`} onMouseDown={() => setPreviewUrl(null)}>
        {previewUrl ? (
          <div className="ps-preview-card" onMouseDown={(e) => e.stopPropagation()}>
            <button className="ps-preview-close" type="button" onClick={() => setPreviewUrl(null)} aria-label="鍏抽棴">
              <X size={22} />
            </button>
            <div className="ps-preview-media">
              <img
                src={previewUrl}
                alt="Preview"
                className="ps-preview-img"
                onLoad={(e) => {
                  const img = e.currentTarget
                  const actual = `${img.naturalWidth}x${img.naturalHeight}`
                  const url = String(previewUrl)
                  setOutMetaByUrl((prev) => {
                    const next: any = { ...(prev || {}) }
                    const cur = next[url]
                    if (cur && cur.actualSize === actual) return prev
                    next[url] = { ...(cur || { createdAt: Date.now(), model: String(effectiveGenModel || imageModel || ''), ratio: String(genRatio === 'Auto' ? '1:1' : genRatio), res: String(genRes), targetSize: getSizeFromRatioAndRes(genRatio === 'Auto' ? '1:1' : genRatio, genRes) }), actualSize: actual }
                    return next
                  })
                }}
              />
            </div>
            <div className="ps-preview-side">
              <div className="ps-preview-title">鍥剧墖鎿嶄綔</div>
              <div className="ps-preview-actions">
                <button
                  type="button"
                  className="ps-preview-btn"
                  onClick={async () => {
                    const url = String(previewUrl)
                    const localPath = tryGetLocalFilePathFromUrl(url)
                    if (localPath && window.aitntAPI?.showItemInFolder) {
                      const r = await window.aitntAPI.showItemInFolder({ filePath: localPath })
                      setPreviewMsg(r.success ? '宸插湪璧勬簮绠＄悊鍣ㄤ腑瀹氫綅鏂囦欢' : '瀹氫綅鏂囦欢澶辫触')
                      return
                    }

                    if (window.aitntAPI?.downloadImage && window.aitntAPI?.showItemInFolder) {
                      const fileName = `aitnt_${Date.now()}_save`
                      const dl = await window.aitntAPI.downloadImage({ url, saveDir: outputDirectory, fileName })
                      if (!dl.success || !dl.localPath) {
                        setPreviewMsg(`淇濆瓨澶辫触锛?{dl.error || '鏈煡閿欒'}`)
                        return
                      }
                      const p = tryGetLocalFilePathFromUrl(dl.localPath)
                      if (p) {
                        await window.aitntAPI.showItemInFolder({ filePath: p })
                        setPreviewMsg('宸蹭繚瀛樺埌鏈湴骞舵墦寮€鏂囦欢浣嶇疆')
                        return
                      }
                    }
                    setPreviewMsg('淇濆瓨澶辫触锛氬綋鍓嶇幆澧冧笉鏀寔')
                  }}
                  title="淇濆瓨锛堜笅杞藉埌鏈湴骞跺畾浣嶏級"
                >
                  淇濆瓨
                </button>

                <button
                  type="button"
                  className="ps-preview-btn"
                  onClick={async () => {
                    const url = String(previewUrl)
                    if (!window.aitntAPI?.copyImageToClipboard) {
                      setPreviewMsg('澶嶅埗澶辫触锛氬綋鍓嶇幆澧冧笉鏀寔')
                      return
                    }
                    const r = await window.aitntAPI.copyImageToClipboard({ url })
                    setPreviewMsg(r.success ? '宸插鍒跺浘鐗囧埌鍓创鏉' : `澶嶅埗澶辫触锛?{r.error || '鏈煡閿欒'}`)
                  }}
                  title="澶嶅埗鍥剧墖鍒板壀璐存澘"
                >
                  澶嶅埗
                </button>

                <button
                  type="button"
                  className="ps-preview-btn"
                  onClick={async () => {
                    const req = (previewDebug as any)?.request
                    if (!req || !req.url) {
                      setPreviewMsg('鏃犺姹備俊鎭紙鍙兘鏄棫缁撴灉鎴栨湭璁板綍锛')
                      return
                    }
                    const text = formatRequestDebugForCopy(req)
                    try {
                      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
                      await navigator.clipboard.writeText(text)
                      setPreviewMsg('宸插鍒惰姹備唬鐮侊紙宸茶劚鏁忥級')
                    } catch {
                      uiTextViewer(text, { title: '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗锛堝凡鑴辨晱锛', size: 'lg' })
                      setPreviewMsg('澶嶅埗澶辫触锛氬凡寮瑰嚭鎵嬪姩澶嶅埗妗')
                    }
                  }}
                  title="澶嶅埗鏈璋冪敤 API 鐨勮姹備唬鐮侊紙宸茶劚鏁忥級"
                >
                  澶嶅埗璇锋眰
                </button>

                <button
                  type="button"
                  className="ps-preview-btn primary"
                  onClick={async () => {
                    if (busy) return
                    setPreviewMsg('宸叉彁浜ら噸鏂板埗浣滀换鍔')
                    await runGenerate()
                  }}
                  title="鐢ㄥ綋鍓嶆彁绀鸿瘝/鍙傛暟閲嶆柊鍒朵綔 1 寮?
                >
                  閲嶆柊鍒朵綔
                </button>
              </div>

              <div className="ps-preview-info">
                <div className="ps-preview-info-title">淇℃伅</div>
                <div className="ps-preview-kv">
                  <div className="k">鏂囦欢</div>
                  <div className="v" title={previewAbsPath || previewUrl || ''}>{previewFileName || (previewAbsPath ? getFileNameFromPath(String(previewAbsPath)) : '-') || '-'}</div>

                  <div className="k">妯″瀷</div>
                  <div className="v">{String((previewMeta as any)?.model || effectiveGenModel || imageModel || '-')}</div>

                  <div className="k">鏈熸湜姣斾緥</div>
                  <div className="v">{String((previewMeta as any)?.ratio || (genRatio === 'Auto' ? '1:1' : genRatio) || '-')}</div>

                  <div className="k">鍒嗚鲸鐜?/div>
                  <div className="v">{String((previewMeta as any)?.res || genRes || '-')}</div>

                  <div className="k">鏈熸湜灏哄</div>
                  <div className="v">{String((previewMeta as any)?.targetSize || '-') || '-'}</div>

                  <div className="k">瀹為檯灏哄</div>
                  <div className="v">{String((previewMeta as any)?.actualSize || '-') || '-'}</div>
                </div>
              </div>

              <div className="ps-preview-debug" aria-label="鎺ュ彛杩斿洖璋冭瘯淇℃伅">
                <div className="ps-preview-debug-head">
                  <div className="t">鎺ュ彛杩斿洖</div>
                  <button
                    type="button"
                    className="ps-preview-debug-btn"
                    onClick={async () => {
                      const t = String((previewDebug as any)?.response?.dataPreview || '')
                      if (!t.trim()) {
                        setPreviewMsg('鏆傛棤鍙鍒剁殑杩斿洖鍐呭')
                        return
                      }
                      try {
                        if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
                        await navigator.clipboard.writeText(t)
                        setPreviewMsg('宸插鍒舵帴鍙ｈ繑鍥')
                      } catch {
                        uiTextViewer(t, { title: '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗', size: 'lg' })
                        setPreviewMsg('澶嶅埗澶辫触锛氬凡寮瑰嚭鎵嬪姩澶嶅埗妗')
                      }
                    }}
                    title="澶嶅埗鎺ュ彛杩斿洖鍐呭锛堝凡鑴辨晱锛?
                  >
                    澶嶅埗杩斿洖
                  </button>
                </div>
                <textarea
                  className="ps-preview-debug-box"
                  readOnly
                  value={String((previewDebug as any)?.response?.dataPreview || '')}
                />
              </div>

              {previewMsg ? (
                <div className="ps-preview-msg">{previewMsg}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

