import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Image as ImageIcon, Sparkles, FolderOpen, Library as LibraryIcon, ChevronRight, ChevronLeft, Minus, Cpu, SearchCode, X, Trash2, Pencil, LayoutGrid } from 'lucide-react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ImageGenMode } from '../ImageGen'
import CompactModelPicker from '../components/CompactModelPicker'
import { useSettingsStore } from '../../settings/store'
import { optimizePrompt } from '../../../core/api/chat'
import { resolveApiKey } from '../../settings/utils/apiKeys'
import OptimizeSystemPromptEditor from '../components/OptimizeSystemPromptEditor'
import PromptLinkPanel from '../components/PromptLinkPanel'
import { takePendingPromptLink } from '../../creative_library/promptLink'
import CreativeCollectionsPanel from '../components/CreativeCollectionsPanel'
import ManualFolderGrid from '../components/ManualFolderGrid'
import { AutoDraggableTaskCard, AutoManualFolderCard } from '../components/AutoStackCards'
import ContextMenu from '../components/ContextMenu'
import { makeGroupKey, shortText } from '../utils/stacking'
import { useImageGenStore } from '../store'
import { formatRequestDebugForCopy } from '../utils/requestDebug'
import { uiConfirm, uiTextViewer } from '../../ui/dialogStore'
import { uiToast } from '../../ui/toastStore'
import { kvGetJsonMigrate, kvSetJson } from '../../../core/persist/kvClient'

export default function ImageToImage({ onSwitchMode }: { onSwitchMode: (mode: ImageGenMode) => void }) {
  const { providers, activeProviderId, imageProviderId, updateProvider, outputDirectory, autoSaveEnabled } = useSettingsStore()
  const providerId = imageProviderId || activeProviderId
  const activeProvider = providers.find(p => p.id === providerId)
  
  const availableModels = activeProvider?.models || []
  const currentImageModel = activeProvider?.selectedImageModel || ''
  const currentPromptModel = activeProvider?.selectedPromptModel || ''

  // 甯哥敤妯″瀷棰勮锛氱敤浜庡揩閫熷垏鎹紝鍑忓皯姣忔鎵撳紑涓嬫媺鍚庡啀鎼滅储
  const pinnedImageModels = activeProvider?.pinnedImageModels || []
  const pinnedPromptModels = activeProvider?.pinnedPromptModels || []

  // 鐢熸垚浠诲姟锛堟寜 mode 杩囨护锛岄伩鍏嶄笌鏂囧瓧鐢熷浘娣峰湪涓€璧凤級
  const allTasks = useImageGenStore(s => s.tasks)
  const hydrateTasks = useImageGenStore(s => s.hydrateFromStorage)
  const refreshTasks = useImageGenStore(s => s.refreshFromStorage)
  const patchTask = useImageGenStore(s => s.patchTask)
  const deleteTask = useImageGenStore(s => s.deleteTask)
  const clearTasksByMode = useImageGenStore(s => s.clearTasksByMode)
  const enqueueGenerateBatch = useImageGenStore(s => s.enqueueGenerateBatch)
  const enqueueGenerateOne = useImageGenStore(s => s.enqueueGenerateOne)

  const tasks = useMemo(() => (allTasks || []).filter(t => t.mode === 'i2i'), [allTasks])

  // 璁颁綇涓婃浣跨敤鐨勫弬鏁帮紙鍏抽棴/閲嶅惎鍚庝粛淇濈暀锛?  const UI_PARAMS_KEY = 'aitnt-image-ui-params-i2i-v1'
  const uiDefaults = useMemo(() => ({ ratio: '1:1', res: '2K', prompt: '', isRightPanelOpen: true, batchCount: 1 }), [])

  const [ratio, setRatio] = useState(uiDefaults.ratio)
  const [res, setRes] = useState(uiDefaults.res)
  const [prompt, setPrompt] = useState(uiDefaults.prompt)
  const [optimizePreference, setOptimizePreference] = useState<string>('')
  const [injectOptimizeCustomText, setInjectOptimizeCustomText] = useState<string>('')
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
  
  const [isOptimizing, setIsOptimizing] = useState(false)

  // 鍥剧敓鍥捐緭鍏ュ浘鐗?  const fileInputRef = useRef<HTMLInputElement>(null)
  const MAX_INPUT_IMAGES = 20
  const [inputImages, setInputImages] = useState<Array<{ id: string, dataUrl: string, base64: string, name: string }>>([])
  const [dragOver, setDragOver] = useState(false)
  const [isUploadGalleryOpen, setIsUploadGalleryOpen] = useState(false)

  const uploadDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const refIdSeed = useRef(0)
  const makeRefId = () => {
    refIdSeed.current += 1
    return `ref_${Date.now()}_${refIdSeed.current}_${Math.random().toString(16).slice(2, 8)}`
  }

  function SortableUploadThumb(props: {
    id: string
    dataUrl: string
    name: string
    onRemove: () => void
  }) {
    const { id, dataUrl, name, onRemove } = props
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({ id })

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.72 : 1,
      boxShadow: isDragging ? '0 14px 40px rgba(0,0,0,0.55)' : undefined,
      zIndex: isDragging ? 2 : 0
    }

    return (
      <div ref={setNodeRef} className="ig-upload-modal-thumb" style={style} title={name} {...attributes} {...listeners}>
        <img src={dataUrl} alt={name} draggable={false} />
        <button
          type="button"
          className="ig-upload-remove"
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="绉婚櫎"
        >
          <X size={14} />
        </button>
        <div className="ig-upload-modal-name">{name}</div>
      </div>
    )
  }

  // 棰勮妯℃€佹
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null)
  const [previewMsg, setPreviewMsg] = useState<string>('')

  const tasksMap = useMemo(() => {
    const m = new Map<string, any>()
    for (const t of tasks) m.set(t.id, t)
    return m
  }, [tasks])

  const previewTask = previewTaskId ? tasksMap.get(previewTaskId) : null

  const CANVAS_UI_KEY = 'aitnt-image-canvas-ui-i2i-v1'
  const AUTO_STACK_NAME_KEY = 'aitnt-image-auto-stack-names-i2i-v1'
  const MANUAL_LAYOUT_KEY = 'aitnt-image-manual-layout-i2i-v1'

  const [canvasHydrated, setCanvasHydrated] = useState(false)
  const [namesHydrated, setNamesHydrated] = useState(false)
  const [manualLayoutRaw, setManualLayoutRaw] = useState<any>(null)

  // 鐢诲竷宸ュ叿锛氳嚜鍔ㄥ彔鏀?/ 闅愯棌鍚嶇О / 涓€閿埛鏂帮紙i2i 鐙珛鎸佷箙鍖栵級
  const [autoStackEnabled, setAutoStackEnabled] = useState(() => {
    return false
  })
  const [hideNameEnabled, setHideNameEnabled] = useState(() => {
    return false
  })
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(() => {
    return null
  })

  const [manualRefreshToken, setManualRefreshToken] = useState(0)

  // hydrate: canvas tools / names / manual layout
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

  // 鑷姩鍙犳斁鏂囦欢澶瑰悕绉帮細鐢ㄦ埛鍙噸鍛藉悕锛涙湭鍛藉悕鏃舵樉绀轰紭鍖栧亸濂?  const [autoStackNameMap, setAutoStackNameMap] = useState<Record<string, string>>(() => {
    return {}
  })
  const [renamingAutoKey, setRenamingAutoKey] = useState<string | null>(null)
  const [renameAutoValue, setRenameAutoValue] = useState<string>('')

  // 鑷姩鍙犳斁寮€鍚椂锛氭墦寮€鈥滆嚜瀹氫箟鏂囦欢澶光€濈殑鏂囦欢澶硅鍥撅紙涓嶉€€鍑鸿嚜鍔ㄥ彔鏀撅級
  const [openManualFolderId, setOpenManualFolderId] = useState<string | null>(null)

  // 鑷姩鍙犳斁涓嬶細鎷栨嫿鎶娾€滄湭鍒嗙被鍥剧墖鈥濇斁鍏ヨ嚜瀹氫箟鏂囦欢澶?  const autoDnDSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )
  const [autoDragActiveId, setAutoDragActiveId] = useState<string | null>(null)

  // 鑷姩鍙犳斁涓嬬殑妗岄潰寮忛€夋嫨锛氭閫?澶氶€?  const [autoSelectedIds, setAutoSelectedIds] = useState<string[]>([])
  const autoSelectedSet = useMemo(() => new Set(autoSelectedIds), [autoSelectedIds])
  const autoSurfaceRef = useRef<HTMLDivElement>(null)
  const [autoLasso, setAutoLasso] = useState<{ left: number, top: number, width: number, height: number } | null>(null)
  const autoLassoStartRef = useRef<{ x: number, y: number } | null>(null)
  const autoLassoBaseRef = useRef<Set<string>>(new Set())
  const autoSuppressNextClearClickRef = useRef(false)

  const canvasContentRef = useRef<HTMLDivElement>(null)

  const handleRefreshGrid = () => {
    refreshTasks()
    setOpenGroupKey(null)
    setOpenManualFolderId(null)
    setPreviewTaskId(null)
    setManualRefreshToken(v => v + 1)
  }

  const handleClearTasks = async () => {
    if (!tasks.length) return
    const ok = await uiConfirm('纭畾瑕佹竻绌哄綋鍓嶇敾甯冧笂鐨勬墍鏈夊浘鐗囦换鍔″悧锛', '娓呯┖鐢诲竷')
    if (!ok) return
    clearTasksByMode('i2i')
    setOpenGroupKey(null)
    setOpenManualFolderId(null)
    setPreviewTaskId(null)
    setManualRefreshToken(v => v + 1)
  }

  const handleDeleteTask = (id: string) => {
    if (previewTaskId === id) setPreviewTaskId(null)
    deleteTask(id)
  }

  // 浠庡垱鎰忓簱杩斿洖鍚庯紝涓€娆℃€у啓鍏?Prompt / 浼樺寲鍋忓ソ
  useEffect(() => {
    hydrateTasks()
    const pending = takePendingPromptLink('i2i')
    if (!pending) return
    if (pending.target === 'prompt') {
      setPrompt(pending.text)
    } else {
      setInjectOptimizeCustomText(pending.text)
    }
  }, [])

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

      out.push({ id: fid, name: displayName, count: taskIds.length, coverUrl: (coverTask as any)?.url })
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

  // 鑷姩鍙犳斁锛氭寜浼樺寲鍋忓ソ鑱氬悎
  const stackGroups = useMemo(() => {
    const success = tasks.filter(t => t.status === 'success' && t.url && !manualTaskIdSetForAuto.has(t.id))
    const map = new Map<string, { key: string, pref: string, items: any[], last: number }>()

    for (const t of success) {
      const pref = (t.optimizePreference || '').trim()
      if (!pref) continue
      const key = makeGroupKey(pref)
      const ts = (t as any).createdAt || Date.now()
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
    if (!stackGroupKeySet.has(openGroupKey)) setOpenGroupKey(null)
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
        if (manualTaskIdSetForAuto.has(t.id)) return false
        const pref = (t.optimizePreference || '').trim()
        if (!pref) return true
        const key = makeGroupKey(pref)
        return !stackGroupKeySet.has(key)
      })
      .map(t => t.id)
  }, [autoStackEnabled, openGroupKey, tasks, stackGroupKeySet, manualTaskIdSetForAuto])

  // 鑷姩鍙犳斁鏍硅鍥句笅鐨勨€滄湭鍒嗙被鍥剧墖鈥濓細涓嶅睘浜庘€滄寜浼樺寲鍋忓ソ鍙犳斁鈥濓紝涔熶笉鍦ㄨ嚜瀹氫箟鏂囦欢澶?  const autoUnclassifiedTasks = useMemo(() => {
    if (!autoStackEnabled) return [] as any[]
    if (openGroupKey) return [] as any[]
    if (openManualFolderId) return [] as any[]

    return tasks.filter(t => {
      if (t.status !== 'success' || !t.url) return false
      if (manualTaskIdSetForAuto.has(t.id)) return false
      const pref = (t.optimizePreference || '').trim()
      if (pref) {
        const key = makeGroupKey(pref)
        if (stackGroupKeySet.has(key)) return false
      }
      return true
    })
  }, [autoStackEnabled, openGroupKey, openManualFolderId, tasks, manualTaskIdSetForAuto, stackGroupKeySet])

  // 鑷姩鍙犳斁鏍硅鍥撅細鐢熸垚涓换鍔′篃瑕佸睍绀?  const autoGeneratingTasks = useMemo(() => {
    if (!autoStackEnabled) return [] as any[]
    if (openGroupKey) return [] as any[]
    if (openManualFolderId) return [] as any[]
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
  const autoHandleSurfaceClickClear = () => {
    if (autoSuppressNextClearClickRef.current) {
      autoSuppressNextClearClickRef.current = false
      return
    }
    autoClearSelection()
  }

  // 宸﹂敭鐐瑰嚮鈥滅敾甯冪┖鐧藉鈥濇竻绌洪€夋嫨
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
          setOpenManualFolderId(null)
        }
      },
      {
        id: 'cm_hidename',
        label: '闅愯棌鍚嶇О',
        rightText: hideNameEnabled ? '寮€' : '鍏',
        onClick: () => setHideNameEnabled(v => !v)
      },
      { id: 'cm_sep1', kind: 'separator' },
      { id: 'cm_refresh', label: '涓€閿埛鏂', rightText: 'R', onClick: () => handleRefreshGrid() }
    ]
  }, [canvasMenu.open, autoStackEnabled, hideNameEnabled, handleRefreshGrid])

  const ratios = ['Auto', '1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '4:5', '5:4', '21:9']

  const getSizeFromRatioAndRes = (ratioStr: string, resStr: string): string => {
    let base = 1024
    if (resStr === '2K') base = 2048
    if (resStr === '4K') base = 4096
    if (ratioStr === 'Auto') return `${base}x${base}`
    const [wStr, hStr] = ratioStr.split(':')
    const w = parseInt(wStr, 10)
    const h = parseInt(hStr, 10)
    if (!w || !h) return `${base}x${base}`
    let width: number
    let height: number
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
    if (best && best.diff < 0.02) return best.label
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
      const p = (u.pathname || '').replace(/^\/+/, '')
      return p ? decodeURIComponent(p) : null
    } catch {
      return null
    }
  }

  const pickFile = () => {
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  const clearInputImages = async () => {
    if (inputImages.length === 0) return
    const ok = await uiConfirm('纭畾瑕佹竻绌哄凡涓婁紶鐨勫弬鑰冨浘鐗囧悧锛', '娓呯┖鍙傝€冨浘')
    if (!ok) return
    setInputImages([])
  }

  const readImageFile = async (file: File) => {
    const name = file.name || 'image'
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('read failed'))
      reader.readAsDataURL(file)
    })
    const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
    if (!m) throw new Error('涓嶆敮鎸佺殑鍥剧墖鏍煎紡')
    const base64 = m[2]
    return { id: makeRefId(), dataUrl, base64, name }
  }

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files || []).filter(Boolean)
    if (list.length === 0) return

    const remain = Math.max(0, MAX_INPUT_IMAGES - inputImages.length)
    if (remain <= 0) {
      uiToast('info', `鏈€澶氫笂浼?${MAX_INPUT_IMAGES} 寮犲浘鐗嘸)
      return
    }

    const toAdd = list.slice(0, remain)
    const next: Array<{ id: string, dataUrl: string, base64: string, name: string }> = []
    for (const f of toAdd) {
      try {
        next.push(await readImageFile(f))
      } catch (e: any) {
        // 鍗曞紶澶辫触涓嶅奖鍝嶅叾瀹?        console.warn('read file failed', e)
      }
    }

    if (next.length === 0) {
      uiToast('error', '璇诲彇鍥剧墖澶辫触')
      return
    }

    setInputImages(prev => [...prev, ...next].slice(0, MAX_INPUT_IMAGES))
  }

  const handleGenerateClick = () => {
    if (inputImages.length === 0) {
      uiToast('info', '璇峰厛涓婁紶鍙傝€冨浘鐗')
      return
    }
    if (!prompt.trim()) {
      uiToast('info', '璇峰厛杈撳叆鎻愮ず璇')
      return
    }
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

    const targetSize = getSizeFromRatioAndRes(ratio, res)
    enqueueGenerateBatch({
      mode: 'i2i',
      baseUrl: activeProvider.baseUrl,
      apiKey: imageApiKey,
      model: currentImageModel,
      prompt,
      ratio,
      targetSize,
      imageSize: res,
      optimizePreference,
      batchCount,
      inputImagesBase64: inputImages.map(x => x.base64),
      inputImageNames: inputImages.map(x => x.name),
      saveDir: autoSaveEnabled ? outputDirectory : undefined
    })
  }

  const handleGenerateOne = (args: { promptText: string, ratioValue: string, size?: string }) => {
    if (inputImages.length === 0) {
      uiToast('info', '璇峰厛涓婁紶鍙傝€冨浘鐗囷紙鐢ㄤ簬閲嶆柊鍒朵綔锛')
      return
    }
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
      mode: 'i2i',
      baseUrl: activeProvider.baseUrl,
      apiKey: imageApiKey,
      model: currentImageModel,
      prompt: args.promptText,
      ratio: args.ratioValue,
      targetSize: sizeToUse,
      imageSize: res,
      optimizePreference,
      inputImagesBase64: inputImages.map(x => x.base64),
      inputImageNames: inputImages.map(x => x.name),
      saveDir: autoSaveEnabled ? outputDirectory : undefined
    })
  }

  const handleBatchDecrease = () => setBatchCount(prev => Math.max(1, prev - 1))
  const handleBatchIncrease = () => setBatchCount(prev => Math.min(10, prev + 1))

  const handleUpdateModel = (type: 'image' | 'prompt', modelName: string) => {
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

  const handleOptimizePromptClick = async () => {
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
      setPrompt(optimizedText)
    } catch (error: any) {
      uiToast('error', `浼樺寲澶辫触: ${error.message || '鏈煡閿欒'}`)
    } finally {
      setIsOptimizing(false)
    }
  }

  return (
    <div className="ig-layout">
      {/* 1. 宸︿晶鎺у埗闈㈡澘 (鍖呭惈鍥剧墖涓婁紶鍖? */}
      <div className="ig-left">
        <div className="ig-panel-block">
          <div className="ig-block-header">
            <span>璧勬簮绱犳潗</span>

            <div className="ig-block-actions">
              <button
                type="button"
                className="ig-mini-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  clearInputImages()
                }}
                title="涓€閿竻绌哄凡涓婁紶鍥剧墖"
                disabled={inputImages.length === 0}
                style={{ opacity: inputImages.length === 0 ? 0.5 : 1, cursor: inputImages.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                <Trash2 size={14} />
                娓呯┖
              </button>

              <button
                type="button"
                className="ig-mini-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  if (inputImages.length === 0) {
                    pickFile()
                    return
                  }
                  setIsUploadGalleryOpen(true)
                }}
                title={inputImages.length === 0 ? '涓婁紶鍥剧墖' : '灞曞紑宸蹭笂浼犲浘鐗'}
              >
                <LayoutGrid size={14} />
                灞曞紑
              </button>
            </div>
          </div>
          {/* 杩欓噷鏄綘鎴浘涓姹傜殑涓婁紶鍥剧墖鍖哄煙 */}
          <div
            className="ig-upload-area"
            onClick={pickFile}
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(false)
            }}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(false)
              try {
                await addFiles(e.dataTransfer?.files || [])
              } catch (err: any) {
                uiToast('error', err?.message || '璇诲彇鍥剧墖澶辫触')
              }
            }}
            style={{
              borderColor: dragOver ? 'rgba(0, 229, 255, 0.55)' : undefined,
              color: dragOver ? '#00e5ff' : undefined
            }}
            title="鐐瑰嚮閫夋嫨鍥剧墖锛屾垨鎷栨嫿鍥剧墖鍒版鍖哄煙"
          >
            {inputImages.length > 0 ? (
              <div className="ig-upload-scroll" onClick={(e) => e.stopPropagation()}>
                {inputImages.length < MAX_INPUT_IMAGES && (
                  <button
                    type="button"
                    className="ig-upload-plus"
                    onClick={(e) => {
                      e.stopPropagation()
                      pickFile()
                    }}
                    title="缁х画娣诲姞鍥剧墖"
                  >
                    <Plus size={18} />
                    娣诲姞
                  </button>
                )}

                {inputImages.map((img, idx) => (
                  <div key={`${img.name}_${idx}`} className="ig-upload-thumb" title={img.name}>
                    <img src={img.dataUrl} alt={img.name} />
                    <button
                      type="button"
                      className="ig-upload-remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        setInputImages(prev => prev.filter((_, i) => i !== idx))
                      }}
                      title="绉婚櫎"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <Plus size={32} />
                <span style={{ marginTop: 8, fontSize: '0.9rem' }}>涓婁紶鍥剧墖</span>
                <span style={{ fontSize: '0.75rem', marginTop: 4 }}>鍙嫋鎷藉浘鐗囧埌姝ゅ尯鍩燂紙鏈€澶?20 寮狅級</span>
              </>
            )}

            {inputImages.length > 0 && (
              <div className="ig-upload-count">{inputImages.length}/{MAX_INPUT_IMAGES}</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={async (e) => {
                try {
                  await addFiles(e.target.files || [])
                } catch (err: any) {
                  uiToast('error', err?.message || '璇诲彇鍥剧墖澶辫触')
                }
              }}
            />
          </div>
        </div>

        <div className="ig-panel-block">
          <div className="ig-block-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ImageIcon size={18} color="#5b6df0" />
              <span>鍙傛暟閰嶇疆 (鍥剧敓鍥?</span>
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
              {['1K', '2K', '4K'].map(r => (
                <div key={r} className={`ig-pill ${res === r ? 'active' : ''}`} onClick={() => setRes(r)}>
                  {r}
                </div>
              ))}
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
            placeholder="璇风敤绠€鍗曠殑涓枃鎻忚堪浣犳兂鐢熸垚鐨勭敾闈?.."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
        </div>

        {/* 鏂板姛鑳斤細鎻愮ず璇嶄紭鍖栫郴缁熸彁绀鸿瘝棰勮 */}
        <OptimizeSystemPromptEditor
          providerId={providerId}
          scopeKey="i2i"
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
          <button className="ig-toolbar-btn" onClick={() => onSwitchMode('t2i')}>
            <ImageIcon size={16} /> 鏂囧瓧鐢熷浘
          </button>
          <button className="ig-toolbar-btn active">
            <FolderOpen size={16} /> 鍥惧儚鏀瑰浘
          </button>
          <button className="ig-toolbar-btn" onClick={() => onSwitchMode('library')}>
            <LibraryIcon size={16} /> 鍒涙剰搴?          </button>
        </div>

        {/* 鍙充笂瑙掔敾甯冨伐鍏?*/}
        <div className="ig-canvas-toptools" aria-label="鐢诲竷宸ュ叿">
          <button
            type="button"
            className={`ig-tool-btn ${autoStackEnabled ? 'active' : ''}`}
            onClick={() => {
              setAutoStackEnabled(v => !v)
              setOpenGroupKey(null)
              setOpenManualFolderId(null)
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
              storageKey={MANUAL_LAYOUT_KEY}
              onDeleteTask={handleDeleteTask}
              onOpenPreview={(id) => {
                setPreviewTaskId(id)
                setPreviewMsg('')
              }}
              onPatchTask={patchTask as any}
              onRemakeOne={(t) => {
                handleGenerateOne({ promptText: t.prompt, ratioValue: t.ratio || ratio, size: t.targetSize })
              }}
              canvasTools={{
                autoStackEnabled,
                hideNameEnabled,
                onToggleAutoStack: () => {
                  setAutoStackEnabled(v => !v)
                  setOpenGroupKey(null)
                  setOpenManualFolderId(null)
                },
                onToggleHideName: () => setHideNameEnabled(v => !v),
                onRefresh: () => handleRefreshGrid()
              }}
              initialOpenFolderId={openManualFolderId}
              lockToFolderId={openManualFolderId}
              onExitFolder={() => setOpenManualFolderId(null)}
              showRoot={false}
              folderHeaderPrefix="鏂囦欢澶?
            />
          )}

          {/* 鑷姩鍙犳斁鏍硅鍥撅細鑷畾涔夋枃浠跺す + 鎸夊亸濂藉彔鏀?+ 鏈垎绫?*/}
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
          {autoStackEnabled && !openManualFolderId && openGroupKey && (
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
          )}

          {/* 鎵嬪姩缃戞牸锛堣嚜鍔ㄥ彔鏀惧叧闂級 */}
          {!autoStackEnabled && (
            <ManualFolderGrid
              tasks={tasks}
              hideNameEnabled={hideNameEnabled}
              refreshToken={manualRefreshToken}
              storageKey={MANUAL_LAYOUT_KEY}
              onDeleteTask={handleDeleteTask}
              onOpenPreview={(id) => {
                setPreviewTaskId(id)
                setPreviewMsg('')
              }}
              onPatchTask={patchTask as any}
              onRemakeOne={(t) => {
                handleGenerateOne({ promptText: t.prompt, ratioValue: t.ratio || ratio, size: t.targetSize })
              }}
              canvasTools={{
                autoStackEnabled,
                hideNameEnabled,
                onToggleAutoStack: () => {
                  setAutoStackEnabled(v => !v)
                  setOpenGroupKey(null)
                  setOpenManualFolderId(null)
                },
                onToggleHideName: () => setHideNameEnabled(v => !v),
                onRefresh: () => handleRefreshGrid()
              }}
            />
          )}

          <ContextMenu
            open={canvasMenu.open}
            x={canvasMenu.x}
            y={canvasMenu.y}
            items={canvasMenuItems as any}
            onClose={() => setCanvasMenu(v => ({ ...v, open: false }))}
          />
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
            style={{
              opacity: (inputImages.length > 0 && prompt.trim()) ? 1 : 0.6,
              cursor: (inputImages.length > 0 && prompt.trim()) ? 'pointer' : 'not-allowed'
            }}
            title={inputImages.length === 0 ? '璇峰厛涓婁紶鍙傝€冨浘鐗? : (!prompt.trim() ? '璇峰厛杈撳叆鎻愮ず璇? : '')}
          >
            <Sparkles size={16} />
            寮€濮?          </button>

        </div>

        {/* 渚ц竟鏍忔姌鍙犳寜閽?(渚濋檮鍦ㄧ敾甯冨彸杈圭紭) */}
        <button className="ig-collapse-btn" onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}>
          {isRightPanelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

      </div>

      {/* 棰勮妯℃€佹 */}
      {previewTask && previewTask.url && (
        <div className={`ig-preview-modal ${previewTaskId ? 'show' : ''}`} onMouseDown={() => setPreviewTaskId(null)}>
          <div className="ig-preview-card" onMouseDown={(e) => e.stopPropagation()}>
            <button className="ig-preview-close" onClick={() => setPreviewTaskId(null)} title="鍏抽棴">
              <X size={20} />
            </button>

            <div className="ig-preview-media">
              <img
                src={previewTask.url}
                alt="Preview"
                className="ig-preview-img"
                onLoad={(e) => {
                  const img = e.currentTarget
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
                    handleGenerateOne({ promptText: previewTask.prompt, ratioValue: previewTask.ratio, size: previewTask.targetSize })
                    setPreviewMsg('宸叉彁浜ら噸鏂板埗浣滀换鍔★紙浣跨敤褰撳墠涓婁紶鐨勫弬鑰冨浘锛')
                  }}
                  title="鐢ㄧ浉鍚屾彁绀鸿瘝閲嶆柊鍒朵綔 1 寮狅紙闇€瑕佸綋鍓嶄粛涓婁紶鐫€鍙傝€冨浘锛?
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
                  <span className="v">{(() => {
                    const local = tryGetLocalFilePathFromUrl(previewTask.url!)
                    if (local) return getFileNameFromPath(local)
                    try {
                      const u = new URL(previewTask.url!)
                      return getFileNameFromPath(u.pathname || previewTask.url!)
                    } catch {
                      return '鏈煡'
                    }
                  })()}</span>
                </div>

                <div className="ig-preview-info-row">
                  <span className="k">鍙傝€冨浘</span>
                  <span className="v">{(() => {
                    const names = previewTask.inputImageNames || (previewTask.inputImageName ? [previewTask.inputImageName] : [])
                    if (names.length === 0) {
                      const current = inputImages.map(x => x.name)
                      if (current.length === 0) return '-'
                      return `${current.length} 寮燻
                    }
                    const shown = names.slice(0, 2).join(', ')
                    return names.length <= 2 ? `${names.length} 寮狅細${shown}` : `${names.length} 寮狅細${shown}...`
                  })()}</span>
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
        </div>
      )}

      {/* 宸蹭笂浼犲浘鐗囷細灞曞紑绐楀彛 */}
      {isUploadGalleryOpen && (
        <div className="ig-preview-modal show" onMouseDown={() => setIsUploadGalleryOpen(false)}>
          <div className="ig-upload-modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ig-upload-modal-head">
              <div className="t">宸蹭笂浼犲浘鐗?/div>
              <div className="sub">{inputImages.length}/{MAX_INPUT_IMAGES}</div>
              <div className="sub" style={{ marginLeft: 10 }}>鎷栨嫿鍙帓搴?/div>
              <div className="spacer" />

              <button
                type="button"
                className="ig-mini-btn"
                onClick={() => pickFile()}
                title="缁х画娣诲姞鍥剧墖"
                disabled={inputImages.length >= MAX_INPUT_IMAGES}
                style={{ opacity: inputImages.length >= MAX_INPUT_IMAGES ? 0.5 : 1, cursor: inputImages.length >= MAX_INPUT_IMAGES ? 'not-allowed' : 'pointer' }}
              >
                <Plus size={14} />
                娣诲姞
              </button>

              <button
                type="button"
                className="ig-mini-btn"
                onClick={() => clearInputImages()}
                title="涓€閿竻绌?
                disabled={inputImages.length === 0}
                style={{ opacity: inputImages.length === 0 ? 0.5 : 1, cursor: inputImages.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                <Trash2 size={14} />
                娓呯┖
              </button>

              <button
                type="button"
                className="ig-upload-modal-close"
                onClick={() => setIsUploadGalleryOpen(false)}
                title="鍏抽棴"
              >
                <X size={18} />
              </button>
            </div>

            {inputImages.length === 0 ? (
              <div className="ig-upload-modal-empty">
                <div className="t">杩樻病鏈変笂浼犲浘鐗?/div>
                <div className="d">鐐瑰嚮鈥滄坊鍔犫€濇垨鎶婂浘鐗囨嫋杩涙潵</div>
              </div>
            ) : (
              <DndContext
                sensors={uploadDndSensors}
                onDragEnd={(e: DragEndEvent) => {
                  const { active, over } = e
                  if (!over) return
                  if (active.id === over.id) return
                  setInputImages(prev => {
                    const oldIndex = prev.findIndex(x => x.id === active.id)
                    const newIndex = prev.findIndex(x => x.id === over.id)
                    if (oldIndex < 0 || newIndex < 0) return prev
                    return arrayMove(prev, oldIndex, newIndex)
                  })
                }}
              >
                <SortableContext items={inputImages.map(x => x.id)} strategy={rectSortingStrategy}>
                  <div
                    className="ig-upload-modal-grid"
                    onDragEnter={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDrop={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      try {
                        await addFiles(e.dataTransfer?.files || [])
                      } catch (err: any) {
                        uiToast('error', err?.message || '璇诲彇鍥剧墖澶辫触')
                      }
                    }}
                  >
                    {inputImages.map((img) => (
                      <SortableUploadThumb
                        key={img.id}
                        id={img.id}
                        dataUrl={img.dataUrl}
                        name={img.name}
                        onRemove={() => setInputImages(prev => prev.filter(x => x.id !== img.id))}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      )}

      {/* 3. 鍙充晶鍖哄煙锛氶摼鎺ユ彁绀鸿瘝 + 鏀惰棌鍗犱綅 */}
      <div className={`ig-right ${isRightPanelOpen ? '' : 'collapsed'}`}>
        <PromptLinkPanel
          mode="i2i"
          onOpenLibrary={() => onSwitchMode('library')}
          onApplyPrompt={(text) => setPrompt(text)}
          onApplyOptimizeCustom={(text) => setInjectOptimizeCustomText(text)}
        />

        <CreativeCollectionsPanel
          mode="i2i"
          onOpenLibrary={() => onSwitchMode('library')}
          onApplyPrompt={(text) => setPrompt(text)}
          onApplyOptimizeCustom={(text) => setInjectOptimizeCustomText(text)}
        />
      </div>
    </div>
  )
}

