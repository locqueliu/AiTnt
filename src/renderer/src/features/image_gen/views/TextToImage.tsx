import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Image as ImageIcon, Settings2, Sparkles, Star, FolderOpen, RefreshCw, Library as LibraryIcon, ChevronRight, ChevronLeft, Minus, Zap, Cpu, SearchCode, History, Trash2, X, Maximize2, Check, Pencil } from 'lucide-react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { ImageGenMode } from '../ImageGen'
import CompactModelPicker from '../components/CompactModelPicker'
import OptimizeSystemPromptEditor from '../components/OptimizeSystemPromptEditor'
import PromptLinkPanel from '../components/PromptLinkPanel'
import ManualFolderGrid from '../components/ManualFolderGrid'
import { AutoDraggableTaskCard, AutoManualFolderCard } from '../components/AutoStackCards'
import ContextMenu from '../components/ContextMenu'
import { useSettingsStore } from '../../settings/store'
import { optimizePrompt } from '../../../core/api/chat'
import { resolveApiKey } from '../../settings/utils/apiKeys'
import { takePendingPromptLink } from '../../creative_library/promptLink'
import { makeGroupKey, shortText } from '../utils/stacking'
import { useImageGenStore, type ImageTask } from '../store'
import { formatRequestDebugForCopy } from '../utils/requestDebug'
import { uiConfirm, uiTextViewer } from '../../ui/dialogStore'
import { uiToast } from '../../ui/toastStore'
import { kvGetJsonMigrate, kvSetJson } from '../../../core/persist/kvClient'

// 瀹氫箟鍘嗗彶璁板綍鐨勬暟鎹粨鏋?interface PromptHistory {
  id: string
  original: string
  optimized?: string
  model: string
  time: number
}

function parseSizeStr(size?: string): { w: number, h: number } | null {
  if (!size) return null
  const m = /^\s*(\d{2,5})\s*x\s*(\d{2,5})\s*$/.exec(size)
  if (!m) return null
  const w = parseInt(m[1], 10)
  const h = parseInt(m[2], 10)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  return { w, h }
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x || 1
}

const KNOWN_RATIOS: Array<{ label: string, w: number, h: number }> = [
  { label: '1:1', w: 1, h: 1 },
  { label: '3:4', w: 3, h: 4 },
  { label: '4:3', w: 4, h: 3 },
  { label: '9:16', w: 9, h: 16 },
  { label: '16:9', w: 16, h: 9 },
  { label: '2:3', w: 2, h: 3 },
  { label: '3:2', w: 3, h: 2 },
  { label: '4:5', w: 4, h: 5 },
  { label: '5:4', w: 5, h: 4 },
  { label: '21:9', w: 21, h: 9 }
]

function formatNiceRatio(w: number, h: number): string {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '-'
  const r = w / h

  let best: { label: string, diff: number } | null = null
  for (const k of KNOWN_RATIOS) {
    const kr = k.w / k.h
    const diff = Math.abs(r - kr)
    if (!best || diff < best.diff) best = { label: k.label, diff }
  }
  // 瀹瑰樊锛氶伩鍏嶅洜涓虹缉鏀?鍙栨暣瀵艰嚧鏄剧ず鎴愬鎬垎鏁?  if (best && best.diff < 0.02) return best.label

  const g = gcd(w, h)
  const rw = Math.round(w / g)
  const rh = Math.round(h / g)
  if (rw > 0 && rh > 0 && rw <= 99 && rh <= 99) return `${rw}:${rh}`
  return `${r.toFixed(3)}:1`
}

function getFileNameFromPath(p: string): string {
  const s = p.replace(/\\/g, '/')
  const idx = s.lastIndexOf('/')
  return idx >= 0 ? s.slice(idx + 1) : s
}

function tryGetLocalFilePathFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'aitnt:') return null
    if (u.hostname === 'local') {
      return u.searchParams.get('path')
    }
    // 鍏煎鏃ф牸寮忥細aitnt:///C:/...
    const p = (u.pathname || '').replace(/^\/+/, '')
    return p ? decodeURIComponent(p) : null
  } catch {
    return null
  }
}

export default function TextToImage({ onSwitchMode }: { onSwitchMode: (mode: ImageGenMode) => void }) {
  const { providers, activeProviderId, imageProviderId, updateProvider, outputDirectory, autoSaveEnabled } = useSettingsStore()
  const providerId = imageProviderId || activeProviderId
  const activeProvider = providers.find(p => p.id === providerId)

  // 鐢熷浘浠诲姟鍏ㄥ眬 store锛氫慨澶嶁€滅敓鎴愪腑鍒囨崲椤甸潰浠诲姟涓㈠け鈥?  const allTasks = useImageGenStore(s => s.tasks)
  const hydrateTasks = useImageGenStore(s => s.hydrateFromStorage)
  const refreshTasks = useImageGenStore(s => s.refreshFromStorage)
  const patchTask = useImageGenStore(s => s.patchTask)
  const deleteTask = useImageGenStore(s => s.deleteTask)
  const clearTasksByMode = useImageGenStore(s => s.clearTasksByMode)
  const enqueueGenerateBatch = useImageGenStore(s => s.enqueueGenerateBatch)
  const enqueueGenerateOne = useImageGenStore(s => s.enqueueGenerateOne)

  const tasks = useMemo(() => {
    return (allTasks || []).filter(t => t.mode === 't2i')
  }, [allTasks])
  
  // 瀹夊叏鎻愬彇褰撳墠鐨勬ā鍨嬪垪琛ㄥ拰閫変腑鐨勫€?  const availableModels = activeProvider?.models || []
  const currentImageModel = activeProvider?.selectedImageModel || ''
  const currentPromptModel = activeProvider?.selectedPromptModel || ''

  // 甯哥敤妯″瀷棰勮锛氱敤浜庡揩閫熷垏鎹紝鍑忓皯姣忔鎵撳紑涓嬫媺鍚庡啀鎼滅储
  const pinnedImageModels = activeProvider?.pinnedImageModels || []
  const pinnedPromptModels = activeProvider?.pinnedPromptModels || []

  // 璁颁綇涓婃浣跨敤鐨勫弬鏁帮紙鍏抽棴/閲嶅惎鍚庝粛淇濈暀锛?  const UI_PARAMS_KEY = 'aitnt-image-ui-params-t2i-v1'
  const uiDefaults = useMemo(() => ({ ratio: '1:1', res: '2K', prompt: '', isRightPanelOpen: true, batchCount: 1 }), [])

  const [ratio, setRatio] = useState(uiDefaults.ratio)
  const [res, setRes] = useState(uiDefaults.res)
  const [prompt, setPrompt] = useState(uiDefaults.prompt)
  // 鐢ㄦ埛杈撳叆鐨勨€滀紭鍖栧亸濂芥彁绀鸿瘝鈥?  const [optimizePreference, setOptimizePreference] = useState<string>('')
  // 浠庡垱鎰忓簱鍐欏叆鐨勨€滀紭鍖栧亸濂解€濅竴娆℃€ф敞鍏?  const [injectOptimizeCustomText, setInjectOptimizeCustomText] = useState<string>('')
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(Boolean(uiDefaults.isRightPanelOpen))
  const [batchCount, setBatchCount] = useState(() => Math.max(1, Math.min(10, Number(uiDefaults.batchCount) || 1)))

  const [uiHydrated, setUiHydrated] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const p = await kvGetJsonMigrate<any>(UI_PARAMS_KEY, uiDefaults as any)
      if (!alive) return
      if (p && typeof p === 'object') {
        setRatio(typeof p.ratio === 'string' ? p.ratio : uiDefaults.ratio)
        setRes(typeof p.res === 'string' ? p.res : uiDefaults.res)
        setPrompt(typeof p.prompt === 'string' ? p.prompt : uiDefaults.prompt)
        setIsRightPanelOpen(typeof p.isRightPanelOpen === 'boolean' ? p.isRightPanelOpen : uiDefaults.isRightPanelOpen)
        setBatchCount(Math.max(1, Math.min(10, Number(p.batchCount) || uiDefaults.batchCount)))
      }
      setUiHydrated(true)
    })()
    return () => {
      alive = false
    }
  }, [UI_PARAMS_KEY, uiDefaults])

  useEffect(() => {
    if (!uiHydrated) return
    const t = window.setTimeout(() => {
      void kvSetJson(UI_PARAMS_KEY, { ratio, res, prompt, isRightPanelOpen, batchCount })
    }, 360)
    return () => window.clearTimeout(t)
  }, [uiHydrated, ratio, res, prompt, isRightPanelOpen, batchCount, UI_PARAMS_KEY])

  // 鐢诲竷宸ュ叿锛堝弬鑰冨浘鍥涳級锛氳嚜鍔ㄥ彔鏀?/ 闅愯棌鍚嶇О / 涓€閿埛鏂帮紙鎸佷箙鍖栵紝閬垮厤鍒囨崲鐣岄潰鍚庘€滆В鏁ｂ€濓級
  const [autoStackEnabled, setAutoStackEnabled] = useState(() => {
    return false
  })
  const [hideNameEnabled, setHideNameEnabled] = useState(() => {
    return false
  })
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(() => {
    return null
  })
  // 鎵嬪姩鎷栨嫿甯冨眬鍒锋柊 token锛氱敤浜庘€滀竴閿埛鏂扳€濇椂璁╃綉鏍奸噸鏂板姞杞藉竷灞€骞跺叧闂枃浠跺す
  const [manualRefreshToken, setManualRefreshToken] = useState(0)

  const CANVAS_UI_KEY = 'aitnt-image-canvas-ui-v1'
  const AUTO_STACK_NAME_KEY = 'aitnt-image-auto-stack-names-v1'
  const PROMPT_HISTORY_KEY = 'aitnt-prompt-history'
  const MANUAL_LAYOUT_KEY = 'aitnt-image-manual-layout-v1'

  // 鑷姩鍙犳斁鏂囦欢澶瑰悕绉帮細鐢ㄦ埛鍙噸鍛藉悕锛涙湭鍛藉悕鏃舵樉绀轰紭鍖栧亸濂?  const [autoStackNameMap, setAutoStackNameMap] = useState<Record<string, string>>(() => {
    return {}
  })
  const [renamingAutoKey, setRenamingAutoKey] = useState<string | null>(null)
  const [renameAutoValue, setRenameAutoValue] = useState<string>('')

  // 鑷姩鍙犳斁妯″紡涓嬬殑妗岄潰寮忛€夋嫨锛氭閫?澶氶€?  const [autoSelectedIds, setAutoSelectedIds] = useState<string[]>([])
  const autoSelectedSet = useMemo(() => new Set(autoSelectedIds), [autoSelectedIds])
  const autoSurfaceRef = useRef<HTMLDivElement>(null)
  const [autoLasso, setAutoLasso] = useState<{ left: number, top: number, width: number, height: number } | null>(null)
  const autoLassoStartRef = useRef<{ x: number, y: number } | null>(null)
  const autoLassoBaseRef = useRef<Set<string>>(new Set())
  const autoSuppressNextClearClickRef = useRef(false)

  // 妗岄潰浣撻獙锛氱偣鍑诲埌鐢诲竷鍏朵粬鍖哄煙鏃跺彇娑堥€変腑锛堜笉瑕佹眰涓€瀹氱偣鍦ㄧ綉鏍煎唴閮級
  useEffect(() => {
    if (autoSelectedIds.length === 0) return
    const onDown = (e: MouseEvent) => {
      if (autoLassoStartRef.current) return
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('.ig-result-card')) return
      if (target.closest('.ig-preview-card')) return
      if (target.closest('.ig-context-menu')) return
      if (target.closest('.ig-rename-input')) return
      autoClearSelection()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [autoSelectedIds.length])
  const canvasContentRef = useRef<HTMLDivElement>(null)

  // 鏍规嵁褰撳墠鐢熷浘妯″瀷鍚嶆帹鏂彲鐢ㄧ殑鍒嗚鲸鐜囨。浣嶏紙閬垮厤閫変簡 4K 浣嗘ā鍨嬪疄闄呭彧鏀寔 2K锛屽鑷存帴鍙ｈ繑鍥?no images returned锛?  const getSupportedResOptions = (modelName: string): string[] => {
    const m = (modelName || '').toLowerCase()
    if (m.includes('4k')) return ['1K', '2K', '4K']
    if (m.includes('2k')) return ['1K', '2K']
    if (m.includes('1k')) return ['1K']
    return ['1K', '2K', '4K']
  }

  const supportedResOptions = getSupportedResOptions(currentImageModel)

  // 褰撳垏鎹㈡ā鍨?鍒嗚鲸鐜囧悗锛屽鏋滃綋鍓嶉€夋嫨鐨勫垎杈ㄧ巼瓒呭嚭妯″瀷鑳藉姏锛屽垯鑷姩鍥為€€鍒版渶澶ф敮鎸佹。浣?  useEffect(() => {
    if (!supportedResOptions.includes(res)) {
      setRes(supportedResOptions[supportedResOptions.length - 1])
    }
  }, [currentImageModel, res])
  
  // 鎻愮ず璇嶄紭鍖栫浉鍏崇殑鐘舵€?  const [isOptimizing, setIsOptimizing] = useState(false)

  // 鍘嗗彶璁板綍鐘舵€?(鍚庣画鍙互鏀惧叆 localStorage)
  const [historyList, setHistoryList] = useState<PromptHistory[]>(() => {
    return []
  })

  const [canvasHydrated, setCanvasHydrated] = useState(false)
  const [namesHydrated, setNamesHydrated] = useState(false)
  const [historyHydrated, setHistoryHydrated] = useState(false)

  const [manualLayoutRaw, setManualLayoutRaw] = useState<any>(null)

  // hydrate: canvas tools
  useEffect(() => {
    let alive = true
    ;(async () => {
      const p = await kvGetJsonMigrate<any>(CANVAS_UI_KEY, {})
      if (!alive) return
      setAutoStackEnabled(Boolean(p?.autoStackEnabled))
      setHideNameEnabled(Boolean(p?.hideNameEnabled))
      const v = p?.openGroupKey
      setOpenGroupKey(typeof v === 'string' && v.trim() ? v : null)
      setCanvasHydrated(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // hydrate: auto stack names
  useEffect(() => {
    let alive = true
    ;(async () => {
      const p = await kvGetJsonMigrate<any>(AUTO_STACK_NAME_KEY, {})
      if (!alive) return
      setAutoStackNameMap(p && typeof p === 'object' ? p : {})
      setNamesHydrated(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // hydrate: prompt history
  useEffect(() => {
    let alive = true
    ;(async () => {
      const p = await kvGetJsonMigrate<any>(PROMPT_HISTORY_KEY, [])
      if (!alive) return
      setHistoryList(Array.isArray(p) ? p : [])
      setHistoryHydrated(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // hydrate: manual layout (for auto-stack folder view)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const p = await kvGetJsonMigrate<any>(MANUAL_LAYOUT_KEY, null)
      if (!alive) return
      setManualLayoutRaw(p && typeof p === 'object' ? p : null)
    })()
    return () => {
      alive = false
    }
  }, [manualRefreshToken])
  
  // 棰勮妯℃€佹鐘舵€侊細鐢?taskId 鍏宠仈锛屾柟渚垮仛鈥滀繚瀛?澶嶅埗/閲嶆柊鍒朵綔/淇℃伅灞曠ず鈥?  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null)
  const previewTask = previewTaskId ? tasks.find(t => t.id === previewTaskId) : null
  const [previewMsg, setPreviewMsg] = useState<string>('')

  // 鑷姩鍙犳斁寮€鍚椂锛氭墦寮€鈥滆嚜瀹氫箟鏂囦欢澶光€濈殑鏂囦欢澶硅鍥撅紙涓嶉€€鍑鸿嚜鍔ㄥ彔鏀撅級
  const [openManualFolderId, setOpenManualFolderId] = useState<string | null>(null)

  // 鑷姩鍙犳斁涓嬶細鎷栨嫿鎶娾€滄湭鍒嗙被鍥剧墖鈥濇斁鍏ヨ嚜瀹氫箟鏂囦欢澶?  const autoDnDSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )
  const [autoDragActiveId, setAutoDragActiveId] = useState<string | null>(null)

  // 鎵嬪姩鏂囦欢澶癸紙鐢ㄦ埛鑷缓锛夊湪鑷姩鍙犳斁妯″紡涓嬩篃闇€瑕佹樉绀?  const manualLayoutInfoForAuto = useMemo(() => {
    const parsed = manualLayoutRaw
    if (!parsed || typeof parsed !== 'object') {
      return { folders: [] as { id: string, name: string, count: number, coverUrl?: string }[], taskIdSet: new Set<string>() }
    }
    const root: string[] = Array.isArray((parsed as any)?.root) ? (parsed as any).root : []
    const foldersObj = (parsed as any)?.folders && typeof (parsed as any).folders === 'object' ? (parsed as any).folders : {}

    const out: { id: string, name: string, count: number, coverUrl?: string }[] = []
    const allTaskIds = new Set<string>()
    for (const node of root) {
      const m = /^folder:(.+)$/.exec(String(node))
      if (!m) continue
      const fid = m[1]
      const f = (foldersObj as any)[fid]
      if (!f) continue
      const taskIds: string[] = Array.isArray((f as any).taskIds) ? (f as any).taskIds : []
      taskIds.forEach(id => allTaskIds.add(id))

      const customName = (typeof (f as any).name === 'string' ? (f as any).name : '').trim()
      let displayName = customName
      if (!displayName) {
        const prefs = taskIds
          .map(id => tasks.find(t => t.id === id))
          .map(t => (t?.optimizePreference || '').trim())
          .filter(Boolean) as string[]
        const uniq = Array.from(new Set(prefs))
        displayName = uniq.length === 1 ? uniq[0] : '鏂囦欢澶?
      }

      const coverTask = taskIds.map(id => tasks.find(t => t.id === id)).find(t => t?.status === 'success' && t?.url)
      out.push({ id: fid, name: displayName, count: taskIds.length, coverUrl: coverTask?.url })
    }

    return { folders: out, taskIdSet: allTaskIds }
  }, [tasks, manualLayoutRaw])

  const manualFoldersForAuto = manualLayoutInfoForAuto.folders
  const manualTaskIdSetForAuto = manualLayoutInfoForAuto.taskIdSet

  const openManualFolder = useMemo(() => {
    if (!openManualFolderId) return null
    return manualFoldersForAuto.find(f => f.id === openManualFolderId) || null
  }, [openManualFolderId, manualFoldersForAuto])

  useEffect(() => {
    if (!autoStackEnabled) {
      setOpenManualFolderId(null)
      return
    }
    if (openManualFolderId && !openManualFolder) {
      setOpenManualFolderId(null)
    }
  }, [autoStackEnabled, openManualFolderId, openManualFolder])

  const autoDraggingTask = useMemo(() => {
    if (!autoDragActiveId) return null
    const m = /^task:(.+)$/.exec(autoDragActiveId)
    if (!m) return null
    return tasks.find(t => t.id === m[1]) || null
  }, [autoDragActiveId, tasks])

  const moveTasksIntoManualFolder = async (folderId: string, taskIds: string[]) => {
    // 鍙Щ鍔ㄦ垚鍔熷浘鐗?    const ok = taskIds.filter(id => {
      const t = tasks.find(x => x.id === id)
      return Boolean(t && t.status === 'success' && t.url)
    })
    if (ok.length === 0) return

    const parsed = await kvGetJsonMigrate<any>(MANUAL_LAYOUT_KEY, null)
    if (!parsed || typeof parsed !== 'object') return
    const root: string[] = Array.isArray((parsed as any)?.root) ? (parsed as any).root : []
    const foldersObj = (parsed as any)?.folders && typeof (parsed as any).folders === 'object' ? (parsed as any).folders : {}
    const f = (foldersObj as any)[folderId]
    if (!f) return

    // 浠?root 绉婚櫎杩欎簺 task node锛堝鏋滃瓨鍦級
    const root2 = root.filter(n => {
      const m = /^task:(.+)$/.exec(String(n))
      if (!m) return true
      return !ok.includes(m[1])
    })

    // 浠庢墍鏈夋枃浠跺す閲屽厛鍘婚噸锛堥伩鍏嶉噸澶嶅嚭鐜帮級
    for (const fv of Object.values(foldersObj as any)) {
      if (!fv || typeof fv !== 'object') continue
      if (Array.isArray((fv as any).taskIds)) {
        ;(fv as any).taskIds = (fv as any).taskIds.filter((id: string) => !ok.includes(id))
      }
    }

    const existing = new Set(Array.isArray((f as any).taskIds) ? (f as any).taskIds : [])
    const appended = ok.filter(id => !existing.has(id))
    ;(f as any).taskIds = [...(Array.isArray((f as any).taskIds) ? (f as any).taskIds : []), ...appended]

    const updated = { ...parsed, root: root2, folders: foldersObj }
    await kvSetJson(MANUAL_LAYOUT_KEY, updated)
    setManualLayoutRaw(updated)
    setManualRefreshToken(v => v + 1)
  }

  // 浠庡垱鎰忓簱杩斿洖鍚庯紝涓€娆℃€у啓鍏?Prompt / 浼樺寲鍋忓ソ
  useEffect(() => {
    const pending = takePendingPromptLink('t2i')
    if (!pending) return
    if (pending.target === 'prompt') {
      setPrompt(pending.text)
    } else {
      setInjectOptimizeCustomText(pending.text)
    }
  }, [])

  // 褰撳巻鍙茶褰曟洿鏂版椂锛岃嚜鍔ㄥ瓨鍏ユ湰鍦?  useEffect(() => {
    if (!historyHydrated) return
    const t = window.setTimeout(() => {
      void kvSetJson(PROMPT_HISTORY_KEY, historyList)
    }, 420)
    return () => window.clearTimeout(t)
  }, [historyHydrated, historyList])

  // 鐢诲竷宸ュ叿鎸佷箙鍖?  useEffect(() => {
    if (!canvasHydrated) return
    const t = window.setTimeout(() => {
      void kvSetJson(CANVAS_UI_KEY, { autoStackEnabled, hideNameEnabled, openGroupKey })
    }, 320)
    return () => window.clearTimeout(t)
  }, [canvasHydrated, autoStackEnabled, hideNameEnabled, openGroupKey])

  useEffect(() => {
    if (!namesHydrated) return
    const t = window.setTimeout(() => {
      void kvSetJson(AUTO_STACK_NAME_KEY, autoStackNameMap)
    }, 360)
    return () => window.clearTimeout(t)
  }, [namesHydrated, autoStackNameMap])

  // 椤甸潰鎸傝浇鏃跺悓姝ヤ竴娆?localStorage锛堢敤鎴峰彲鑳藉湪鍒殑鐣岄潰鐐逛簡鈥滀竴閿埛鏂扳€?鎴栨湭鏉?i2i 鍏辩敤锛?  useEffect(() => {
    hydrateTasks()
  }, [])

  const handleBatchDecrease = () => setBatchCount(prev => Math.max(1, prev - 1))
  const handleBatchIncrease = () => setBatchCount(prev => Math.min(10, prev + 1))

  // 涓€閿埛鏂帮細閲嶆柊璇诲彇鏈湴缂撳瓨骞舵暣鐞嗗睍绀猴紙涓嶆敼鍔ㄧ湡瀹炲浘鐗囨枃浠讹級
  const handleRefreshGrid = () => {
    refreshTasks()
    setOpenGroupKey(null)
    setPreviewTaskId(null)
    setManualRefreshToken(v => v + 1)
  }

  // 鏍规嵁鎴浘瑕佹眰锛屾柊澧炲绉嶇敾闈㈡瘮渚?  const ratios = ['Auto', '1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '4:5', '5:4', '21:9']

  // 澶勭悊妯″瀷鏇存柊鍚屾鍒板叏灞€鐘舵€?  const handleUpdateModel = (type: 'image' | 'prompt', modelName: string) => {
    if (providerId) {
      if (type === 'image') {
        updateProvider(providerId, { selectedImageModel: modelName })
      } else {
        updateProvider(providerId, { selectedPromptModel: modelName })
      }
    } else {
      uiToast('info', '璇峰厛鍦ㄥ叏灞€璁剧疆涓坊鍔犲苟閫変腑涓€涓?API 缃戠珯')
    }
  }

  // 鏍稿績鍔熻兘锛氳皟鐢ㄥぇ璇█妯″瀷浼樺寲鎻愮ず璇?  const handleOptimizePromptClick = async () => {
    if (!prompt.trim()) {
      uiToast('info', '璇峰厛杈撳叆浣犺浼樺寲鐨勫師濮嬫彁绀鸿瘝')
      return
    }
    if (!activeProvider) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閫夋嫨鎴栭厤缃?API 缃戠珯')
      return
    }
    if (!currentPromptModel) {
      uiToast('info', '璇峰湪宸︿笅瑙掗€夋嫨鐢ㄤ簬鈥滀紭鍖栤€濈殑鎻愮ず璇嶆ā鍨')
      return
    }

    const promptApiKey = resolveApiKey(activeProvider, 'prompt')
    if (!promptApiKey) {
      uiToast('error', '璇峰厛鍦ㄨ缃腑閰嶇疆鈥滀紭鍖?Key鈥')
      return
    }

    setIsOptimizing(true)
    try {
      const optimizedText = await optimizePrompt(
        activeProvider.baseUrl,
        promptApiKey,
        currentPromptModel,
        prompt,
        optimizePreference
      )
      
      // 淇濆瓨鍒板巻鍙茶褰?      const newRecord: PromptHistory = {
        id: Date.now().toString(),
        original: prompt,
        optimized: optimizedText,
        model: currentPromptModel,
        time: Date.now()
      }
      setHistoryList(prev => [newRecord, ...prev])

      setPrompt(optimizedText)
    } catch (error: any) {
      uiToast('error', `浼樺寲澶辫触: ${error.message || '鏈煡閿欒'}`)
    } finally {
      setIsOptimizing(false)
    }
  }

  // 璁＄畻鍒嗚鲸鐜囧瓧绗︿覆 helper
  const getSizeFromRatioAndRes = (ratioStr: string, resStr: string): string => {
    let base = 1024
    if (resStr === '2K') base = 2048
    if (resStr === '4K') base = 4096

    // 濡傛灉鏄?Auto锛岄粯璁や娇鐢?base x base (1:1)
    if (ratioStr === 'Auto') return `${base}x${base}`

    const [wStr, hStr] = ratioStr.split(':')
    const w = parseInt(wStr)
    const h = parseInt(hStr)
    
    if (!w || !h) return `${base}x${base}`

    let width, height
    // 閫昏緫锛氫互闀胯竟涓哄熀鍑?(base)锛岀煭杈规牴鎹瘮渚嬬缉鏀?    // 杩欐牱 2K 灏辫兘淇濊瘉鑷冲皯鏈変竴杈硅揪鍒?2048 鍍忕礌
    if (w >= h) {
      width = base
      height = Math.round(base * h / w)
    } else {
      height = base
      width = Math.round(base * w / h)
    }
    
    // 纭繚鏄?8 鐨勫€嶆暟 (寰堝鐢熷浘妗嗘灦瑕佹眰 8 鎴?64 鐨勫€嶆暟)
    width = Math.round(width / 8) * 8
    height = Math.round(height / 8) * 8

    return `${width}x${height}`
  }

  // 鏍稿績鍔熻兘锛氳皟鐢ㄥぇ妯″瀷鐢熸垚鍥剧墖
  const handleGenerateClick = async () => {
    if (!prompt.trim()) {
      uiToast('info', '璇峰厛杈撳叆鎻愮ず璇')
      return
    }
    if (!activeProvider) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閫夋嫨鎴栭厤缃?API 缃戠珯')
      return
    }
    if (!currentImageModel) {
      uiToast('info', '璇峰湪宸︿笅瑙掗€夋嫨鈥滅敓鍥炬ā鍨嬧€')
      return
    }

    const imageApiKey = resolveApiKey(activeProvider, 'image')
    if (!imageApiKey) {
      uiToast('error', '璇峰厛鍦ㄨ缃腑閰嶇疆鈥滅敓鍥?Key鈥')
      return
    }

    // 璁＄畻瀹為檯鍙戦€佺粰 API 鐨勫垎杈ㄧ巼 (渚嬪 "1024x576")
    // 瀵?comfly 杩欑被缃戝叧锛氬疄闄呰皟鐢ㄧ敤 aspectRatio + imageSize锛屼笉寮轰緷璧栧儚绱狅紱杩欓噷浠嶄繚鐣?targetSize 浠呯敤浜庝俊鎭睍绀?    const targetSize = getSizeFromRatioAndRes(ratio, res)

    enqueueGenerateBatch({
      mode: 't2i',
      baseUrl: activeProvider.baseUrl,
      apiKey: imageApiKey,
      model: currentImageModel,
      prompt,
      ratio,
      targetSize,
      imageSize: res,
      optimizePreference,
      batchCount,
      // 鑷姩淇濆瓨寮€鍏筹細鍏抽棴鏃朵笉瑙﹀彂涓昏繘绋嬩笅杞斤紝鍙睍绀鸿繙绔?url
      saveDir: autoSaveEnabled ? outputDirectory : undefined
    })
  }

  // 浠庢煇涓彁绀鸿瘝鐩存帴鍐嶇敓鎴?1 寮狅紙鐢ㄤ簬鈥滈噸鏂板埗浣溾€濓級
  const handleGenerateOne = async (args: { promptText: string, ratioValue: string, size?: string }) => {
    if (!activeProvider) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閫夋嫨鎴栭厤缃?API 缃戠珯')
      return
    }
    if (!currentImageModel) {
      uiToast('info', '璇峰厛閫夋嫨鐢熷浘妯″瀷')
      return
    }

    const imageApiKey = resolveApiKey(activeProvider, 'image')
    if (!imageApiKey) {
      uiToast('error', '璇峰厛鍦ㄨ缃腑閰嶇疆鈥滅敓鍥?Key鈥')
      return
    }

    const sizeToUse = args.size || getSizeFromRatioAndRes(args.ratioValue, res)

    enqueueGenerateOne({
      mode: 't2i',
      baseUrl: activeProvider.baseUrl,
      apiKey: imageApiKey,
      model: currentImageModel,
      prompt: args.promptText,
      ratio: args.ratioValue,
      targetSize: sizeToUse,
      imageSize: res,
      optimizePreference: previewTask?.optimizePreference || optimizePreference,
      saveDir: autoSaveEnabled ? outputDirectory : undefined
    })
  }

  // 鍒犻櫎鍗＄墖浠诲姟
  const handleDeleteTask = (id: string) => {
    deleteTask(id)
  }

  // 娓呯┖鐢诲竷浠诲姟锛堥伩鍏嶉」鐩縼绉诲悗鏃ц矾寰勪换鍔′竴鐩存姤閿欙級
  const handleClearTasks = async () => {
    const ok = await uiConfirm('纭畾瑕佹竻绌哄綋鍓嶇敾甯冧笂鐨勬墍鏈夊浘鐗囦换鍔″悧锛', '娓呯┖鐢诲竷')
    if (!ok) return
    clearTasksByMode('t2i')
  }

  // 鍘嗗彶璁板綍鐩稿叧鎿嶄綔
  const handleClearHistory = async () => {
    const ok = await uiConfirm('纭畾瑕佹竻绌烘墍鏈夋彁绀鸿瘝浼樺寲璁板綍鍚楋紵', '娓呯┖璁板綍')
    if (!ok) return
    setHistoryList([])
  }

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation() // 闃叉鐐瑰嚮瑙﹀彂涓婂眰鍏冪礌
    setHistoryList(prev => prev.filter(item => item.id !== id))
  }

  // 鐐瑰嚮鍘嗗彶璁板綍鏃讹紝濉叆鎻愮ず璇嶆
  const handleApplyHistory = (text: string) => {
    setPrompt(text)
  }

  // 鑷姩鍙犳斁锛氭寜浼樺寲鍋忓ソ鍒嗙粍锛堝悓涓€鍋忓ソ >=2 寮犳垚鍔熷浘 鎵嶅舰鎴愭枃浠跺す锛?  // 璇存槑锛氱敤鎴峰凡鏁寸悊杩涒€滆嚜瀹氫箟鏂囦欢澶光€濈殑鍥剧墖涓嶅弬涓庤嚜鍔ㄥ彔鏀撅紝閬垮厤閲嶅鍑虹幇
  const stackGroups = useMemo(() => {
    const success = tasks.filter(t => t.status === 'success' && t.url && !manualTaskIdSetForAuto.has(t.id))
    const map = new Map<string, { key: string, pref: string, items: ImageTask[], last: number }>()

    for (const t of success) {
      const pref = (t.optimizePreference || '').trim()
      if (!pref) continue
      const key = makeGroupKey(pref)
      const ts = t.createdAt || Date.now()
      const cur = map.get(key)
      if (!cur) map.set(key, { key, pref, items: [t], last: ts })
      else {
        cur.items.push(t)
        cur.last = Math.max(cur.last, ts)
      }
    }

    return Array.from(map.values())
      .filter(g => g.items.length >= 2)
      .sort((a, b) => b.last - a.last)
  }, [tasks, manualTaskIdSetForAuto])

  const stackGroupKeySet = useMemo(() => new Set(stackGroups.map(g => g.key)), [stackGroups])
  const openGroup = useMemo(() => {
    if (!openGroupKey) return null
    return stackGroups.find(g => g.key === openGroupKey) || null
  }, [openGroupKey, stackGroups])

  // 濡傛灉璁颁綇鐨?openGroupKey 宸蹭笉瀛樺湪锛堜緥濡傚垹闄や簡鍥剧墖瀵艰嚧鍒嗙粍涓嶈冻 2 寮狅級锛岃嚜鍔ㄩ€€鍑烘枃浠跺す
  useEffect(() => {
    if (!openGroupKey) return
    if (!autoStackEnabled) return
    if (!stackGroupKeySet.has(openGroupKey)) {
      setOpenGroupKey(null)
    }
  }, [openGroupKey, autoStackEnabled, stackGroupKeySet])

  const autoVisibleSuccessIds = useMemo(() => {
    if (!autoStackEnabled) return [] as string[]
    if (openGroupKey) {
      return tasks
        .filter(t => t.status === 'success' && t.url && makeGroupKey((t.optimizePreference || '').trim()) === openGroupKey)
        .map(t => t.id)
    }

    // 鏍硅鍥撅細鍙厑璁搁€夋嫨褰撳墠鍙鐨勨€滄垚鍔熶笖鏈鑷姩鎵撳寘杩涙枃浠跺す鈥濈殑鍥剧墖
    return tasks
      .filter(t => {
        if (t.status !== 'success' || !t.url) return false
        // 宸茶繘鍏ヨ嚜瀹氫箟鏂囦欢澶圭殑涓嶅弬涓庘€滄牴瑙嗗浘閫夋嫨鈥?        if (manualTaskIdSetForAuto.has(t.id)) return false
        const pref = (t.optimizePreference || '').trim()
        if (!pref) return true
        const key = makeGroupKey(pref)
        return !stackGroupKeySet.has(key)
      })
      .map(t => t.id)
  }, [autoStackEnabled, openGroupKey, tasks, stackGroupKeySet, manualTaskIdSetForAuto])

  // 鑷姩鍙犳斁鏍硅鍥句笅鐨勨€滄湭鍒嗙被鍥剧墖鈥濓細涓嶅睘浜庘€滄寜浼樺寲鍋忓ソ鍙犳斁鈥濓紝涔熶笉鍦ㄨ嚜瀹氫箟鏂囦欢澶?  const autoUnclassifiedTasks = useMemo(() => {
    if (!autoStackEnabled) return [] as ImageTask[]
    if (openGroupKey) return [] as ImageTask[]
    if (openManualFolderId) return [] as ImageTask[]

    return tasks.filter(t => {
      // 鏈垎绫诲彧灞曠ず鈥滃浘鐗団€濓紙鎴愬姛锛?      if (t.status !== 'success' || !t.url) return false
      if (manualTaskIdSetForAuto.has(t.id)) return false

      const pref = (t.optimizePreference || '').trim()
      if (pref) {
        const key = makeGroupKey(pref)
        if (stackGroupKeySet.has(key)) return false
      }
      return true
    })
  }, [autoStackEnabled, openGroupKey, openManualFolderId, tasks, manualTaskIdSetForAuto, stackGroupKeySet])

  // 鑷姩鍙犳斁鏍硅鍥撅細鐢熸垚涓换鍔′篃瑕佸睍绀猴紙浣嗕笉鍙備笌鍒嗙粍/鎷栨嫿鍏ユ枃浠跺す锛?  const autoGeneratingTasks = useMemo(() => {
    if (!autoStackEnabled) return [] as ImageTask[]
    if (openGroupKey) return [] as ImageTask[]
    if (openManualFolderId) return [] as ImageTask[]
    return tasks.filter(t => t.status === 'loading')
  }, [autoStackEnabled, openGroupKey, openManualFolderId, tasks])

  // 鑷姩鍙犳斁瑙嗗浘鍒囨崲鏃讹紝娓呯悊妗嗛€夌姸鎬?  useEffect(() => {
    setAutoSelectedIds([])
    setAutoLasso(null)
    autoLassoStartRef.current = null
  }, [autoStackEnabled, openGroupKey])

  const getAutoFolderName = (key: string, pref: string): string => {
    const n = (autoStackNameMap[key] || '').trim()
    return n ? n : (pref || '')
  }

  const startRenameAutoFolder = (key: string, pref: string) => {
    setRenamingAutoKey(key)
    setRenameAutoValue(getAutoFolderName(key, pref))
  }

  const commitRenameAutoFolder = () => {
    if (!renamingAutoKey) return
    const v = (renameAutoValue || '').trim()
    setAutoStackNameMap(prev => ({ ...prev, [renamingAutoKey]: v }))
    setRenamingAutoKey(null)
    setRenameAutoValue('')
  }

  const autoClearSelection = () => setAutoSelectedIds([])

  const autoToggleSelect = (id: string) => {
    setAutoSelectedIds(prev => {
      const set = new Set(prev)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return Array.from(set)
    })
  }

  const autoSelectSingle = (id: string) => setAutoSelectedIds([id])

  const autoSelectRange = (id: string, visibleIds: string[]) => {
    if (autoSelectedIds.length === 0) {
      autoSelectSingle(id)
      return
    }
    const anchor = autoSelectedIds[autoSelectedIds.length - 1]
    const a = visibleIds.indexOf(anchor)
    const b = visibleIds.indexOf(id)
    if (a < 0 || b < 0) {
      autoSelectSingle(id)
      return
    }
    const [from, to] = a <= b ? [a, b] : [b, a]
    const slice = visibleIds.slice(from, to + 1)
    setAutoSelectedIds(Array.from(new Set([...autoSelectedIds, ...slice])))
  }

  const autoOnTaskClick = (e: React.MouseEvent, id: string, visibleIds: string[]) => {
    e.stopPropagation()
    if (e.shiftKey) {
      autoSelectRange(id, visibleIds)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      autoToggleSelect(id)
      return
    }
    autoSelectSingle(id)
  }

  const autoRectsIntersect = (a: DOMRect, b: DOMRect): boolean => {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
  }

  const autoBeginLasso = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('.ig-result-card') || target.closest('button') || target.closest('.ig-result-card-delete')) return
    autoLassoStartRef.current = { x: e.clientX, y: e.clientY }
    autoLassoBaseRef.current = (e.ctrlKey || e.metaKey) ? new Set(autoSelectedIds) : new Set()
    setAutoLasso({ left: e.clientX, top: e.clientY, width: 0, height: 0 })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const autoUpdateLasso = (e: React.PointerEvent, visibleIds: string[]) => {
    const start = autoLassoStartRef.current
    if (!start) return
    const x1 = start.x
    const y1 = start.y
    const x2 = e.clientX
    const y2 = e.clientY
    const left = Math.min(x1, x2)
    const top = Math.min(y1, y2)
    const right = Math.max(x1, x2)
    const bottom = Math.max(y1, y2)
    setAutoLasso({ left, top, width: right - left, height: bottom - top })

    const base = autoLassoBaseRef.current
    const next = new Set(base)
    const rect = new DOMRect(left, top, right - left, bottom - top)
    const surface = autoSurfaceRef.current
    if (!surface) return
    const nodes = surface.querySelectorAll<HTMLElement>('[data-select-task]')
    nodes.forEach(el => {
      const id = el.getAttribute('data-select-task')
      if (!id) return
      if (!visibleIds.includes(id)) return
      const r = el.getBoundingClientRect()
      if (autoRectsIntersect(rect, r)) next.add(id)
    })
    setAutoSelectedIds(Array.from(next))
  }

  const autoEndLasso = (e: React.PointerEvent) => {
    if (!autoLassoStartRef.current) return
    autoLassoStartRef.current = null
    
    // 鍙湪鐪熺殑鍙戠敓浜嗘閫夛紙榧犳爣绉诲姩杩囦竴瀹氳窛绂伙級鏃舵墠鎶戝埗涓嬩竴娆?click
    if (autoLasso && (autoLasso.width > 5 || autoLasso.height > 5)) {
      autoSuppressNextClearClickRef.current = true
    }
    setAutoLasso(null)
    
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // 蹇界暐
    }
  }

  const autoHandleSurfaceClickClear = (e: React.MouseEvent) => {
    if (autoSuppressNextClearClickRef.current) {
      autoSuppressNextClearClickRef.current = false
      return
    }
    const target = e.target as HTMLElement
    if (target.closest('.ig-result-card') || target.closest('button') || target.closest('input') || target.closest('textarea')) return
    autoClearSelection()
  }

  // 宸﹂敭鐐瑰嚮鈥滅敾甯冪┖鐧藉鈥濇竻绌洪€夋嫨锛堝寘鍚細閫変腑鍚?/ 鍙抽敭鑿滃崟鍏抽棴鍚庯級
  // 璇存槑锛?  // - 鑷姩鍙犳斁寮€鍚細娓呯┖ autoSelectedIds
  // - 鑷姩鍙犳斁鍏抽棴锛氬箍鎾粰 ManualFolderGrid 娓呯┖鍏跺唴閮ㄩ€夋嫨
  const handleCanvasBlankMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (
      target.closest('.ig-result-card') ||
      target.closest('.ig-context-menu') ||
      target.closest('.ig-canvas-toptools') ||
      target.closest('.ig-top-toolbar') ||
      target.closest('.ig-bottom-action-bar') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('button')
    ) {
      return
    }

    if (canvasContentRef.current && !canvasContentRef.current.contains(target)) return

    // 鍏堟竻绌烘墜鍔ㄦ枃浠跺す/鎵嬪姩缃戞牸鐨勯€夋嫨锛堟棤璁哄綋鍓嶆槸鍚﹁嚜鍔ㄥ彔鏀撅級
    window.dispatchEvent(new CustomEvent('aitnt-image-clear-selection-v1'))

    if (autoStackEnabled) {
      // 濡傛灉姝ｅ湪鏄剧ず鈥滆嚜瀹氫箟鏂囦欢澶光€濊鍥撅紝鍒欏彧闇€瑕佹竻绌烘墜鍔ㄩ€夋嫨
      if (openManualFolderId) return
      if (autoLassoStartRef.current) return
      setAutoSelectedIds([])
    }
  }

  // 鍙抽敭鑿滃崟锛氭妸鈥滆嚜鍔ㄥ彔鏀?闅愯棌鍚嶇О/涓€閿埛鏂扳€濇斁杩涜彍鍗?  const [canvasMenu, setCanvasMenu] = useState<{ open: boolean, x: number, y: number }>(
    { open: false, x: 0, y: 0 }
  )

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.closest('.ig-result-card') ||
      target.closest('.ig-context-menu') ||
      target.closest('.ig-top-toolbar') ||
      target.closest('.ig-bottom-action-bar') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('button')
    ) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    setCanvasMenu({ open: true, x: e.clientX, y: e.clientY })
  }

  const canvasMenuItems = useMemo(() => {
    if (!canvasMenu.open) return [] as any[]
    return [
      { id: 'cm_label', kind: 'label', label: '鐢诲竷宸ュ叿' },
      { id: 'cm_sep0', kind: 'separator' },
      {
        id: 'cm_autostack',
        label: '鑷姩鍙犳斁',
        rightText: autoStackEnabled ? '寮€' : '鍏',
        onClick: () => {
          setAutoStackEnabled(v => !v)
          setOpenGroupKey(null)
        }
      },
      {
        id: 'cm_hidename',
        label: '闅愯棌鍚嶇О',
        rightText: hideNameEnabled ? '寮€' : '鍏',
        onClick: () => setHideNameEnabled(v => !v)
      },
      { id: 'cm_sep1', kind: 'separator' },
      {
        id: 'cm_refresh',
        label: '涓€閿埛鏂',
        rightText: 'R',
        onClick: () => handleRefreshGrid()
      }
    ]
  }, [canvasMenu.open, autoStackEnabled, hideNameEnabled, handleRefreshGrid])


  return (
    <div className="ig-layout">
      {/* 1. 宸︿晶鎺у埗闈㈡澘 (鏃犲浘鐗囦笂浼犲尯) */}
      <div className="ig-left">
        <div className="ig-panel-block">
          <div className="ig-block-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ImageIcon size={18} color="#5b6df0" />
              <span>鍙傛暟閰嶇疆 (鏂囧瓧鐢熷浘)</span>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: '0.8rem', color: '#8e94a8', marginBottom: 8 }}>鐢婚潰姣斾緥</div>
            <div className="ig-pill-group">
              {ratios.map(r => (
                <div key={r} className={`ig-pill ${ratio === r ? 'active' : ''}`} onClick={() => setRatio(r)}>
                  {r}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: '0.8rem', color: '#8e94a8', marginBottom: 8 }}>鍒嗚鲸鐜?/div>
            <div className="ig-pill-group">
              {['1K', '2K', '4K'].map(r => {
                const disabled = !supportedResOptions.includes(r)
                return (
                <div
                  key={r}
                  className={`ig-pill ${res === r ? 'active' : ''}`}
                  onClick={() => !disabled && setRes(r)}
                  title={disabled ? '褰撳墠妯″瀷涓嶆敮鎸佽鍒嗚鲸鐜' : ''}
                  style={{
                    opacity: disabled ? 0.35 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer'
                  }}
                >
                  {r}
                </div>
              )})}
            </div>
          </div>
        </div>

        {/* 鎻愮ず璇嶈緭鍏ュ尯鍧椾笌浼樺寲鎸夐挳 */}
        <div className="ig-panel-block">
          <div className="ig-block-header">
            <span>鎻愮ず璇?/span>
            <div className="ig-block-actions">
              <button
                type="button"
                className="ig-mini-btn"
                onClick={() => setPrompt('')}
                disabled={!prompt.trim() || isOptimizing}
                title="娓呯┖鎻愮ず璇?
              >
                娓呯┖
              </button>
              <button
                className="ig-optimize-btn"
                onClick={handleOptimizePromptClick}
                disabled={isOptimizing || !prompt.trim()}
                style={{
                  opacity: (isOptimizing || !prompt.trim()) ? 0.5 : 1,
                  cursor: (isOptimizing || !prompt.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                {isOptimizing ? '浼樺寲涓?..' : '浼樺寲'}
              </button>
            </div>
          </div>
          <textarea 
            className="ig-prompt-input" 
            placeholder="鎻忚堪鎯崇敓鎴愮殑鐢婚潰..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
        </div>

        {/* 鏂板姛鑳斤細鎻愮ず璇嶄紭鍖栫郴缁熸彁绀鸿瘝棰勮锛堢嫭绔嬬粍浠讹紝閬垮厤鍗曟枃浠惰繃澶э級 */}
        <OptimizeSystemPromptEditor
          providerId={providerId}
          scopeKey="t2i"
          onPreferenceChange={(v) => setOptimizePreference(v)}
          injectCustomText={injectOptimizeCustomText}
          onInjectedCustomTextConsumed={() => setInjectOptimizeCustomText('')}
        />

        {/* 妯″瀷閫夋嫨鍖哄煙 */}
        <div className="ig-panel-block" style={{ marginTop: 'auto', marginBottom: '8px' }}>
          <CompactModelPicker
            label="鐢熷浘妯″瀷"
            value={currentImageModel}
            placeholder="閫夋嫨鐢熷浘妯″瀷..."
            icon={<Cpu size={14} />}
            pinned={pinnedImageModels}
            models={availableModels}
            onSelect={(m: string) => handleUpdateModel('image', m)}
          />

          <CompactModelPicker
            label="鎻愮ず璇嶄紭鍖栨ā鍨?
            value={currentPromptModel}
            placeholder="閫夋嫨浼樺寲妯″瀷..."
            icon={<SearchCode size={14} />}
            pinned={pinnedPromptModels}
            models={availableModels}
            onSelect={(m: string) => handleUpdateModel('prompt', m)}
          />
        </div>
      </div>

      {/* 2. 涓棿涓荤敾甯冨尯 */}
      <div className="ig-center">
        {/* 椤堕儴鍔熻兘鍒囨崲 */}
        <div className="ig-top-toolbar">
          <button className="ig-toolbar-btn active">
            <ImageIcon size={16} /> 鏂囧瓧鐢熷浘
          </button>
          <button className="ig-toolbar-btn" onClick={() => onSwitchMode('i2i')}>
            <FolderOpen size={16} /> 鍥惧儚鏀瑰浘
          </button>
          <button className="ig-toolbar-btn" onClick={() => onSwitchMode('library')}>
            <LibraryIcon size={16} /> 鍒涙剰搴?          </button>
        </div>

        {/* 鍙充笂瑙掔敾甯冨伐鍏凤細鍚屾椂淇濈暀鍙抽敭鑿滃崟鍏ュ彛 */}
        <div className="ig-canvas-toptools" aria-label="鐢诲竷宸ュ叿">
          <button
            type="button"
            className={`ig-tool-btn ${autoStackEnabled ? 'active' : ''}`}
            onClick={() => {
              setAutoStackEnabled(v => !v)
              setOpenGroupKey(null)
            }}
            title="鑷姩鍙犳斁锛氭妸鐩稿悓浼樺寲鍋忓ソ涓嬬殑鎴愬姛鍥剧墖鎵撳寘鎴愭枃浠跺す"
          >
            鑷姩鍙犳斁
          </button>
          <button
            type="button"
            className={`ig-tool-btn ${hideNameEnabled ? 'active' : ''}`}
            onClick={() => setHideNameEnabled(v => !v)}
            title="闅愯棌鍚嶇О锛氶殣钘忓浘鐗?鏂囦欢澶逛笅鏂圭殑鏂囧瓧"
          >
            闅愯棌鍚嶇О
          </button>
          <button
            type="button"
            className="ig-tool-btn"
            onClick={handleRefreshGrid}
            title="涓€閿埛鏂帮細閲嶆柊鍔犺浇骞舵暣鐞嗗浘鐗囧睍绀?
          >
            涓€閿埛鏂?          </button>
        </div>

        <div
          className="ig-canvas-content"
          ref={canvasContentRef}
          onMouseDown={handleCanvasBlankMouseDown}
          onContextMenu={handleCanvasContextMenu}
        >

          {/* 鑷姩鍙犳斁寮€鍚椂锛氳嚜瀹氫箟鏂囦欢澶瑰唴閮ㄨ鍥撅紙涓嶉€€鍑鸿嚜鍔ㄥ彔鏀撅級 */}
          {autoStackEnabled && openManualFolderId && (
            <ManualFolderGrid
              tasks={tasks}
              hideNameEnabled={hideNameEnabled}
              refreshToken={manualRefreshToken}
              onDeleteTask={handleDeleteTask}
              onRemakeOne={(t) => {
                handleGenerateOne({
                  promptText: t.prompt,
                  ratioValue: t.ratio || ratio,
                  size: t.targetSize
                })
              }}
              canvasTools={{
                autoStackEnabled,
                hideNameEnabled,
                onToggleAutoStack: () => {
                  setAutoStackEnabled(v => !v)
                  setOpenGroupKey(null)
                },
                onToggleHideName: () => setHideNameEnabled(v => !v),
                onRefresh: () => handleRefreshGrid()
              }}
              onOpenPreview={(id) => {
                setPreviewTaskId(id)
                setPreviewMsg('')
              }}
              onPatchTask={patchTask}
              initialOpenFolderId={openManualFolderId}
              lockToFolderId={openManualFolderId}
              onExitFolder={() => setOpenManualFolderId(null)}
              showRoot={false}
              folderHeaderPrefix="鏂囦欢澶?
            />
          )}

          {/* 鑷姩鍙犳斁鏍硅鍥撅細鑷畾涔夋枃浠跺す + 鎸夊亸濂藉彔鏀?+ 鏈垎绫伙紙鍙妸鏈垎绫绘嫋鍏ヨ嚜瀹氫箟鏂囦欢澶癸級 */}
          {autoStackEnabled && !openManualFolderId && !openGroupKey && (
            <DndContext
              sensors={autoDnDSensors}
              onDragStart={(e) => setAutoDragActiveId(String(e.active.id))}
              onDragCancel={() => setAutoDragActiveId(null)}
              onDragEnd={(e) => {
                setAutoDragActiveId(null)
                const activeId = String(e.active.id)
                const overId = e.over ? String(e.over.id) : ''
                const am = /^task:(.+)$/.exec(activeId)
                const om = /^mf:(.+)$/.exec(overId)
                if (!am || !om) return
                void moveTasksIntoManualFolder(om[1], [am[1]])
              }}
            >
              {autoGeneratingTasks.length > 0 && (
                <div style={{ width: '100%' }}>
                  <div className="ig-stack-title">鐢熸垚涓?/div>
                  <div className="ig-results-grid">
                    {autoGeneratingTasks.map(task => (
                      <AutoDraggableTaskCard
                        key={task.id}
                        task={task}
                        selected={false}
                        hideNameEnabled={hideNameEnabled}
                        onDelete={() => handleDeleteTask(task.id)}
                        onOpenPreview={() => {}}
                        onSelect={() => {}}
                        onPatch={(patch) => patchTask(task.id, patch as any)}
                      />
                    ))}
                  </div>
                  <div className="ig-stack-divider" />
                </div>
              )}

              {manualFoldersForAuto.length > 0 && (
                <div style={{ width: '100%' }}>
                  <div className="ig-stack-title">鑷畾涔夋枃浠跺す</div>
                  <div className="ig-results-grid">
                    {manualFoldersForAuto.map(f => (
                      <AutoManualFolderCard
                        key={f.id}
                        id={f.id}
                        name={f.name}
                        count={f.count}
                        coverUrl={f.coverUrl}
                        hideNameEnabled={hideNameEnabled}
                        onOpen={() => {
                          setOpenGroupKey(null)
                          setOpenManualFolderId(f.id)
                        }}
                        dragging={Boolean(autoDraggingTask && autoDraggingTask.status === 'success' && autoDraggingTask.url)}
                      />
                    ))}
                  </div>
                  <div className="ig-stack-divider" />
                </div>
              )}

              {stackGroups.length > 0 && (
                <div style={{ width: '100%' }}>
                  <div className="ig-stack-title">鎸変紭鍖栧亸濂藉彔鏀?/div>
                  <div className="ig-results-grid">
                    {stackGroups.map(g => (
                      <div key={g.key} className="ig-result-wrapper">
                        <div
                          className="ig-result-card ig-folder-card"
                          onDoubleClick={() => setOpenGroupKey(g.key)}
                          title={g.pref}
                        >
                          <div className="ig-folder-badge">{g.items.length}</div>
                          <button
                            type="button"
                            className="ig-folder-rename"
                            title="閲嶅懡鍚嶆枃浠跺す"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              startRenameAutoFolder(g.key, g.pref)
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          <img src={g.items[0].url!} alt="folder" className="ig-result-img" />
                          <div className="ig-folder-overlay">
                            <div className="ig-folder-title">{shortText(getAutoFolderName(g.key, g.pref), 18) || '浼樺寲鍋忓ソ'}</div>
                          </div>
                        </div>
                        {!hideNameEnabled && (
                          <div className="ig-result-prompt" title={getAutoFolderName(g.key, g.pref)}>{shortText(getAutoFolderName(g.key, g.pref), 42)}</div>
                        )}

                        {renamingAutoKey === g.key && (
                          <div className="ig-rename-row" onClick={(e) => e.stopPropagation()}>
                            <input
                              className="ig-rename-input"
                              value={renameAutoValue}
                              onChange={(e) => setRenameAutoValue(e.target.value)}
                              placeholder="杈撳叆鏂囦欢澶瑰悕绉帮紙鐣欑┖=浣跨敤浼樺寲鍋忓ソ鍚嶇О锛?
                              autoFocus
                              onPointerDown={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRenameAutoFolder()
                                if (e.key === 'Escape') {
                                  setRenamingAutoKey(null)
                                  setRenameAutoValue('')
                                }
                              }}
                              onBlur={() => commitRenameAutoFolder()}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="ig-stack-divider" />
                </div>
              )}

              <div style={{ width: '100%' }}>
                <div className="ig-stack-title">鏈垎绫?/div>
                <div
                  className="ig-select-fill"
                  ref={autoSurfaceRef}
                  onPointerDown={autoBeginLasso}
                  onPointerMove={(e) => autoUpdateLasso(e, autoVisibleSuccessIds)}
                  onPointerUp={autoEndLasso}
                  onPointerCancel={autoEndLasso}
                  onClick={autoHandleSurfaceClickClear}
                >
                  {autoLasso && (
                    <div
                      className="ig-lasso"
                      style={{ left: autoLasso.left, top: autoLasso.top, width: autoLasso.width, height: autoLasso.height }}
                    />
                  )}

                  <div className="ig-results-grid ig-select-surface">
                    {autoUnclassifiedTasks.map(task => (
                      <AutoDraggableTaskCard
                        key={task.id}
                        task={task}
                        selected={autoSelectedSet.has(task.id)}
                        hideNameEnabled={hideNameEnabled}
                        onDelete={() => handleDeleteTask(task.id)}
                        onOpenPreview={() => {
                          setPreviewTaskId(task.id)
                          setPreviewMsg('')
                        }}
                        onSelect={(e: React.MouseEvent) => autoOnTaskClick(e, task.id, autoVisibleSuccessIds)}
                        onPatch={(patch) => patchTask(task.id, patch as any)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <DragOverlay>
                {autoDraggingTask && autoDraggingTask.status === 'success' && autoDraggingTask.url ? (
                  <div className="ig-dnd-overlay">
                    <img src={autoDraggingTask.url} alt="drag" />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {autoStackEnabled && openGroupKey && (
            <div className="ig-stack-head">
              <button type="button" className="ig-tool-btn" onClick={() => setOpenGroupKey(null)}>杩斿洖</button>
              <div className="ig-stack-path">鏂囦欢澶癸細{shortText(getAutoFolderName(openGroupKey, openGroup?.pref || openGroupKey), 64)}</div>
            </div>
          )}

          {/* 鑷姩鍙犳斁鎵撳紑鏌愪釜鈥滄寜浼樺寲鍋忓ソ鍙犳斁鈥濇枃浠跺す鏃讹細鏄剧ず璇ョ粍鍥剧墖 */}
          {autoStackEnabled && !openManualFolderId && openGroupKey ? (
            <div
              className="ig-select-fill"
              ref={autoSurfaceRef}
              onPointerDown={autoBeginLasso}
              onPointerMove={(e) => autoUpdateLasso(e, autoVisibleSuccessIds)}
              onPointerUp={autoEndLasso}
              onPointerCancel={autoEndLasso}
              onClick={autoHandleSurfaceClickClear}
            >
              {autoLasso && (
                <div
                  className="ig-lasso"
                  style={{ left: autoLasso.left, top: autoLasso.top, width: autoLasso.width, height: autoLasso.height }}
                />
              )}

              <div className="ig-results-grid ig-select-surface">
              {tasks
                .filter(t => t.status === 'success' && t.url && !manualTaskIdSetForAuto.has(t.id) && makeGroupKey((t.optimizePreference || '').trim()) === openGroupKey)
                .map(task => (
                <div key={task.id} className="ig-result-wrapper" data-select-task={task.status === 'success' && task.url ? task.id : undefined}>
                  <div className={`ig-result-card ${autoSelectedSet.has(task.id) ? 'ig-selected' : ''}`}>
                    {/* 鍒犻櫎鎸夐挳 */}
                    <div
                      className="ig-result-card-delete"
                      onClick={() => handleDeleteTask(task.id)}
                      title="鍒犻櫎姝や换鍔?
                    >
                      <X size={14} />
                    </div>

                    {autoSelectedSet.has(task.id) && task.status === 'success' && task.url && (
                      <div className="ig-selected-check" aria-label="宸查€変腑">
                        <Check size={14} />
                      </div>
                    )}

                    {task.status === 'loading' && (
                      <div className="ig-skeleton">
                        <Sparkles size={24} className="spin-icon" />
                        <span style={{ fontSize: '0.8rem' }}>鐢熸垚涓?..</span>
                      </div>
                    )}
                    {task.status === 'error' && (
                      <div style={{ color: '#ff4d4f', padding: '16px', textAlign: 'center', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        鐢熸垚澶辫触<br /><br />{task.errorMsg}
                      </div>
                    )}
                    {task.status === 'success' && task.url && (
                      <img
                        src={task.url}
                        alt="Generated"
                        className="ig-result-img"
                        onClick={(e) => autoOnTaskClick(e, task.id, autoVisibleSuccessIds)}
                        onDoubleClick={() => {
                          setPreviewTaskId(task.id)
                          setPreviewMsg('')
                        }}
                        onLoad={(e) => {
                          // 璁板綍骞冲彴瀹為檯杩斿洖鐨勫浘鐗囧昂瀵革紝渚夸簬瀹氫綅鈥滀负浠€涔堥€変簡 2K 浣嗗疄闄呭彧鏈?1K鈥?                          const img = e.currentTarget
                          const actual = `${img.naturalWidth}x${img.naturalHeight}`
                          patchTask(task.id, { actualSize: actual })
                        }}
                        onError={() => {
                          // 鍙戠敓鏂浘鏃讹紝鐩存帴鎶婇敊璇俊鎭惤鍒颁换鍔′笂锛堢敤鎴峰彲瑙侊級锛屽苟閬垮厤闈欓粯澶辫触
                          const src = task.url ? String(task.url) : ''
                          const briefSrc = src.length > 80 ? `${src.slice(0, 40)}...${src.slice(-35)}` : src
                          patchTask(task.id, { status: 'error', errorMsg: `鍥剧墖鍔犺浇澶辫触锛坰rc=${briefSrc || '绌'}锛塦 })
                        }}
                      />
                    )}
                  </div>
                  {!hideNameEnabled && (
                    <div className="ig-result-prompt" title={task.prompt}>
                      {task.prompt}
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          ) : (
            // 鑷姩鍙犳斁鏍硅鍥剧敱涓婃柟鍒嗗尯娓叉煋锛涜繖閲屽彧鍦ㄥ叧闂嚜鍔ㄥ彔鏀炬椂灞曠ず鎵嬪姩缃戞牸
            (autoStackEnabled ? null : (
              <ManualFolderGrid
                tasks={tasks}
                hideNameEnabled={hideNameEnabled}
                refreshToken={manualRefreshToken}
                onDeleteTask={handleDeleteTask}
                onRemakeOne={(t) => {
                  handleGenerateOne({
                    promptText: t.prompt,
                    ratioValue: t.ratio || ratio,
                    size: t.targetSize
                  })
                }}
                canvasTools={{
                  autoStackEnabled,
                  hideNameEnabled,
                  onToggleAutoStack: () => {
                    setAutoStackEnabled(v => !v)
                    setOpenGroupKey(null)
                  },
                  onToggleHideName: () => setHideNameEnabled(v => !v),
                  onRefresh: () => handleRefreshGrid()
                }}
                onOpenPreview={(id) => {
                  setPreviewTaskId(id)
                  setPreviewMsg('')
                }}
                onPatchTask={patchTask}
              />
            ))
          )}
        </div>

        {/* 搴曢儴鎮诞鐢熸垚鎿嶄綔缁?*/}
        <div className="ig-bottom-action-bar">
          
          {/* 骞跺彂鏁伴噺閫夋嫨鍣?*/}
          <div className="ig-batch-control">
            <button className="ig-batch-btn" onClick={handleBatchDecrease}>
              <Minus size={14} />
            </button>
            <span className="ig-batch-value">{batchCount}</span>
            <button className="ig-batch-btn" onClick={handleBatchIncrease}>
              <Plus size={14} />
            </button>
          </div>

          {/* 娓呯┖鐢诲竷鎸夐挳 */}
          <button
            className="ig-bottom-btn"
            onClick={handleClearTasks}
            title="娓呯┖鐢诲竷"
            style={{ opacity: tasks.length ? 1 : 0.45 }}
            disabled={!tasks.length}
          >
            <Trash2 size={16} /> 娓呯┖
          </button>

          {/* 甯︿腑鏂囩殑寮€濮嬬敓鎴愭寜閽?*/}
          <button 
            className="ig-start-btn" 
            onClick={handleGenerateClick}
          >
            <Sparkles size={16} /> 寮€濮?          </button>

        </div>

        {/* 渚ц竟鏍忔姌鍙犳寜閽?(渚濋檮鍦ㄧ敾甯冨彸杈圭紭) */}
        <button className="ig-collapse-btn" onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}>
          {isRightPanelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* 鍏ㄥ睆棰勮妯℃€佹 */}
        <div 
          className={`ig-preview-modal ${previewTask ? 'show' : ''}`}
          onClick={() => setPreviewTaskId(null)}
        >
          {previewTask && previewTask.url && (
            <div className="ig-preview-card" onClick={(e) => e.stopPropagation()}>
              <button className="ig-preview-close" onClick={() => setPreviewTaskId(null)}>
                <X size={24} />
              </button>

              <div className="ig-preview-media">
                <img 
                  src={previewTask.url}
                  alt="Preview" 
                  className="ig-preview-img" 
                   onLoad={(e) => {
                     // 棰勮鏃朵篃璁板綍涓€娆″昂瀵革紙濡傛灉缃戞牸鏈Е鍙?onLoad锛?                     const img = e.currentTarget
                     const actual = `${img.naturalWidth}x${img.naturalHeight}`
                     patchTask(previewTask.id, { actualSize: actual })
                   }}
                 />
              </div>

                <div className="ig-preview-side">
                  <div className="ig-preview-side-title">鍥剧墖鎿嶄綔</div>

                <div className="ig-preview-actions">
                  <button
                    type="button"
                    className="ig-preview-btn"
                    onClick={async () => {
                      const url = previewTask.url!
                      const localPath = tryGetLocalFilePathFromUrl(url)

                      // 1) 宸叉槸鏈湴锛氱洿鎺ュ湪璧勬簮绠＄悊鍣ㄤ腑瀹氫綅
                      if (localPath && window.aitntAPI?.showItemInFolder) {
                        const r = await window.aitntAPI.showItemInFolder({ filePath: localPath })
                        setPreviewMsg(r.success ? '宸插湪璧勬簮绠＄悊鍣ㄤ腑瀹氫綅鏂囦欢' : '瀹氫綅鏂囦欢澶辫触')
                        return
                      }

                      // 2) 杩滅锛氬厛涓嬭浇鍒?output锛屽啀瀹氫綅
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
                    className="ig-preview-btn"
                    onClick={async () => {
                      const url = previewTask.url!
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
                    className="ig-preview-btn"
                    onClick={async () => {
                      const req = previewTask.request
                      if (!req || !req.url) {
                        setPreviewMsg('鏃犺姹備俊鎭紙鍙兘鏄棫浠诲姟鎴栨湭璁板綍锛')
                        return
                      }

                      const text = formatRequestDebugForCopy(req)
                      try {
                        if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
                        await navigator.clipboard.writeText(text)
                        setPreviewMsg('宸插鍒惰姹備唬鐮侊紙宸茶劚鏁忥級')
                      } catch {
                        uiTextViewer(text, { title: '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗锛堝凡鑴辨晱锛' })
                        setPreviewMsg('澶嶅埗澶辫触锛氬凡寮瑰嚭鎵嬪姩澶嶅埗妗')
                      }
                    }}
                    title="澶嶅埗鏈璋冪敤 API 鐨勮姹備唬鐮侊紙宸茶劚鏁忥級"
                  >
                    澶嶅埗璇锋眰
                  </button>

                  <button
                    type="button"
                    className="ig-preview-btn primary"
                    onClick={() => {
                      // 鐢ㄨ浠诲姟鐨勬彁绀鸿瘝閲嶆柊鐢熸垚 1 寮?                      handleGenerateOne({
                        promptText: previewTask.prompt,
                        ratioValue: previewTask.ratio,
                        size: previewTask.targetSize
                      })
                      setPreviewMsg('宸叉彁浜ら噸鏂板埗浣滀换鍔')
                    }}
                    title="鐢ㄧ浉鍚屾彁绀鸿瘝閲嶆柊鍒朵綔 1 寮?
                  >
                    閲嶆柊鍒朵綔
                  </button>
                </div>

                <div className="ig-preview-debug" aria-label="鎺ュ彛杩斿洖璋冭瘯淇℃伅">
                  <div className="ig-preview-debug-head">
                    <div className="t">鎺ュ彛杩斿洖</div>
                    <button
                      type="button"
                      className="ig-preview-debug-btn"
                      onClick={async () => {
                        const t = previewTask.response?.dataPreview || previewTask.errorMsg || ''
                        if (!t.trim()) {
                          setPreviewMsg('鏆傛棤鍙鍒剁殑杩斿洖鍐呭')
                          return
                        }
                        try {
                          if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
                          await navigator.clipboard.writeText(t)
                          setPreviewMsg('宸插鍒舵帴鍙ｈ繑鍥炲唴瀹')
                        } catch {
                          uiTextViewer(t, { title: '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗' })
                          setPreviewMsg('澶嶅埗澶辫触锛氬凡寮瑰嚭鎵嬪姩澶嶅埗妗')
                        }
                      }}
                      title="澶嶅埗鎺ュ彛杩斿洖鍐呭"
                    >
                      澶嶅埗杩斿洖
                    </button>
                  </div>
                  <div className="ig-preview-debug-body">
                    {previewTask.status === 'error'
                      ? (previewTask.errorMsg || '鐢熸垚澶辫触锛堟棤閿欒淇℃伅锛')
                      : (previewTask.response?.dataPreview || '鏆傛棤锛堝彲鑳芥槸鏃т换鍔℃垨鏈褰曪級')}
                  </div>
                </div>

                <div className="ig-preview-info">
                  <div className="ig-preview-info-row">
                    <span className="k">鏂囦欢</span>
                    <span className="v">
                      {(() => {
                        const local = tryGetLocalFilePathFromUrl(previewTask.url!)
                        if (local) return getFileNameFromPath(local)
                        try {
                          const u = new URL(previewTask.url!)
                          return getFileNameFromPath(u.pathname || previewTask.url!)
                        } catch {
                          return '鏈煡'
                        }
                      })()}
                    </span>
                  </div>

                  <div className="ig-preview-info-row">
                    <span className="k">鏈熸湜姣斾緥</span>
                    <span className="v">{previewTask.ratio || '-'}</span>
                  </div>

                  <div className="ig-preview-info-row">
                    <span className="k">瀹為檯姣斾緥</span>
                    <span className="v">{(() => {
                      const s = parseSizeStr(previewTask.actualSize)
                      if (!s) return '-'
                      return formatNiceRatio(s.w, s.h)
                    })()}</span>
                  </div>

                  <div className="ig-preview-info-row">
                    <span className="k">鍍忕礌</span>
                    <span className="v">{previewTask.actualSize || '-'}</span>
                  </div>

                  {previewMsg && (
                    <div className="ig-preview-tip">{previewMsg}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <ContextMenu
          open={canvasMenu.open}
          x={canvasMenu.x}
          y={canvasMenu.y}
          onClose={() => setCanvasMenu(m => ({ ...m, open: false }))}
          items={canvasMenuItems}
        />
      </div>

      {/* 3. 鍙充晶鍘嗗彶/鏀惰棌鍖?*/}
      <div className={`ig-right ${isRightPanelOpen ? '' : 'collapsed'}`}>
        {/* 鍒涙剰搴擄細灞曠ず宸叉湁妯℃澘锛屽苟鏀寔涓€閿啓鍏?*/}
        <PromptLinkPanel
          mode="t2i"
          onOpenLibrary={() => onSwitchMode('library')}
          onApplyPrompt={(text) => setPrompt(text)}
          onApplyOptimizeCustom={(text) => setInjectOptimizeCustomText(text)}
        />

        <div className="ig-right-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} color="#3b82f6" /> 浼樺寲璁板綍
          </div>
          {historyList.length > 0 && (
            <button className="ig-clear-btn" onClick={handleClearHistory} title="娓呯┖璁板綍">
              <Trash2 size={14} /> 娓呯┖
            </button>
          )}
        </div>
        
        {historyList.length === 0 ? (
          <div className="ig-empty-collection">
            <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#181b21', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <History size={32} color="#8e94a8" />
            </div>
            <p>杩樻病鏈変紭鍖栬褰?br/><span style={{ fontSize: '0.8rem' }}>浣跨敤宸︿晶鐨勨€滀紭鍖栤€濇寜閽紑濮?/span></p>
          </div>
        ) : (
          <div className="ig-history-list">
            {historyList.map(item => (
              <div 
                key={item.id} 
                className="ig-history-item"
                onClick={() => handleApplyHistory(item.optimized || item.original)}
              >
                <div className="ig-history-thumb">
                  <Zap size={20} />
                </div>
                <div className="ig-history-info">
                  <span className="title">{item.original}</span>
                  <span className="desc">
                    {new Date(item.time).toLocaleTimeString()} 路 {item.model}
                  </span>
                </div>
                <X 
                  size={14} 
                  className="ig-history-item-delete" 
                  onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

