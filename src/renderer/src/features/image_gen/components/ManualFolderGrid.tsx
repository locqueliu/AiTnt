import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Folder, Pencil, Sparkles, X } from 'lucide-react'
import { shortText } from '../utils/stacking'
import ContextMenu from './ContextMenu'
import { formatRequestDebugForCopy } from '../utils/requestDebug'
import type { RequestDebug } from '../../../core/api/image'
import { uiAlert, uiConfirm, uiTextViewer } from '../../ui/dialogStore'
import { uiToast } from '../../ui/toastStore'
import { kvGetJsonMigrate, kvGetStringMigrate, kvRemove, kvSetJson } from '../../../core/persist/kvClient'

const CLEAR_SELECTION_EVENT = 'aitnt-image-clear-selection-v1'
const PENDING_OPEN_FOLDER_KEY = 'aitnt-image-manual-open-folder-v1'

// 鎵嬪姩鏂囦欢澶癸細鎷栨嫿鎺掑簭 + 鏂囦欢澶圭鐞嗭紙UI 铏氭嫙鍒嗙粍锛屾湰鍦版寔涔呭寲锛?// 璇存槑锛?// - 鏍硅鍥炬樉绀衡€滃浘鐗囧崱鐗?+ 鏂囦欢澶瑰崱鐗団€濇贩鎺掞紝鏀寔鎷栨嫿鎹綅
// - 鎷栧埌鈥滄枃浠跺す鎶曟斁鍖衡€濆彲鎶婂浘鐗囨斁鍏ヨ鏂囦欢澶?// - 璇ラ€昏緫涓庘€滆嚜鍔ㄥ彔鏀撅紙鎸変紭鍖栧亸濂借仛鍚堬級鈥濅簰涓嶅奖鍝嶏細鍦ㄨ嚜鍔ㄥ彔鏀惧叧闂椂鎵嶄娇鐢?
export type ManualGridTask = {
  id: string
  status: 'loading' | 'success' | 'error'
  url?: string
  errorMsg?: string
  prompt: string
  ratio?: string
  createdAt?: number
  optimizePreference?: string
  targetSize?: string
  actualSize?: string

  // 璋冭瘯锛氱敤浜庡鍒垛€滆姹備唬鐮佲€濓紙鍐呴儴宸茶劚鏁?apiKey锛?  request?: RequestDebug
}

type RootNodeId = string // 'task:<id>' | 'folder:<id>'
type FolderId = string

type ManualFolder = {
  id: FolderId
  // 鐢ㄦ埛鑷畾涔夊悕绉帮紱涓虹┖鏃舵樉绀洪粯璁ゅ悕绉帮紙浼樺厛浼樺寲鍋忓ソ锛?  name?: string
  taskIds: string[]
  createdAt: number
}

type ManualLayout = {
  root: RootNodeId[]
  folders: Record<FolderId, ManualFolder>
}

const DEFAULT_STORAGE_KEY = 'aitnt-image-manual-layout-v1'

function nodeTaskId(taskId: string): RootNodeId {
  return `task:${taskId}`
}

function nodeFolderId(folderId: string): RootNodeId {
  return `folder:${folderId}`
}

function parseNodeId(id: RootNodeId): { type: 'task' | 'folder', id: string } | null {
  const m = /^(task|folder):(.+)$/.exec(String(id))
  if (!m) return null
  const type = m[1] as 'task' | 'folder'
  return { type, id: m[2] }
}

async function loadLayoutPersisted(storageKey: string): Promise<ManualLayout> {
  const loaded = await kvGetJsonMigrate<ManualLayout>(storageKey, { root: [], folders: {} })
  if (!loaded || typeof loaded !== 'object') return { root: [], folders: {} }
  const root = Array.isArray((loaded as any).root) ? (loaded as any).root : []
  const folders = ((loaded as any).folders && typeof (loaded as any).folders === 'object') ? (loaded as any).folders : {}
  return { root, folders }
}

function reconcileLayout(layout: ManualLayout, tasks: ManualGridTask[]): ManualLayout {
  // 鐩爣锛?  // 1) 鍒犻櫎涓嶅瓨鍦ㄧ殑 taskId
  // 2) 鍒犻櫎绌烘枃浠跺す锛涙枃浠跺す鍓?1 寮犳椂鑷姩瑙ｆ暎
  // 3) 鏈鏀跺綍鐨勪换鍔★紙鏂扮敓鎴愶級鑷姩鍔犲叆 root 椤堕儴

  const taskIdSet = new Set(tasks.map(t => t.id))

  // 鍏堟竻鐞嗘枃浠跺す锛堝厑璁哥┖鏂囦欢澶?鍗曞浘鏂囦欢澶癸細鐢ㄦ埛鍙厛鈥滄柊寤烘枃浠跺す鈥濆啀鎷栧叆锛?  const folders: Record<string, ManualFolder> = {}
  const tasksInFolders = new Set<string>()
  for (const [fid, f] of Object.entries(layout.folders || {})) {
    if (!f || typeof f !== 'object') continue
    const filtered = Array.isArray(f.taskIds) ? f.taskIds.filter(id => taskIdSet.has(id)) : []
    const keep: ManualFolder = {
      // 缁熶竴浣跨敤 map key 浣滀负 folderId锛岄伩鍏嶅巻鍙叉暟鎹噷 f.id 涓?key 涓嶄竴鑷村鑷粹€滄墦涓嶅紑/鏃犳硶鎿嶄綔鈥?      id: fid,
      name: (typeof (f as any).name === 'string') ? String((f as any).name) : '',
      taskIds: filtered,
      createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now()
    }
    folders[fid] = keep
    filtered.forEach(id => tasksInFolders.add(id))
  }

  // 娓呯悊 root锛氬幓鎺夊凡杩涙枃浠跺す鐨?task銆佸幓鎺変笉瀛樺湪鐨?node銆佸幓鎺変笉瀛樺湪鐨?folder
  const root: RootNodeId[] = []
  for (const n of (layout.root || [])) {
    const p = parseNodeId(n)
    if (!p) continue
    if (p.type === 'task') {
      if (!taskIdSet.has(p.id)) continue
      if (tasksInFolders.has(p.id)) continue
      root.push(nodeTaskId(p.id))
      continue
    }
    if (p.type === 'folder') {
      if (!folders[p.id]) continue
      root.push(nodeFolderId(p.id))
    }
  }

  // 鎶婃病鍑虹幇杩囩殑鏂颁换鍔″姞鍏?root 椤堕儴锛堜繚鎸?tasks 褰撳墠椤哄簭锛氶€氬父鏂颁换鍔″湪鏁扮粍鍓嶉潰锛?  const tasksInRoot = new Set(
    root
      .map(n => parseNodeId(n))
      .filter(p => !!p && (p as any).type === 'task')
      .map(p => (p as any).id)
  )
  const missing: RootNodeId[] = []
  for (const t of tasks) {
    if (tasksInFolders.has(t.id)) continue
    if (tasksInRoot.has(t.id)) continue
    missing.push(nodeTaskId(t.id))
  }

  const combined = [...missing, ...root]
  // 浣撻獙锛氬浐瀹氣€滄枃浠跺す鍖衡€濆湪鏈€鍓嶏紝閬垮厤鐢熸垚/绉诲姩鍥剧墖瀵艰嚧鏂囦欢澶瑰乏鍙虫姈鍔?  const folderNodes = combined.filter(n => {
    const p = parseNodeId(n)
    return !!p && p.type === 'folder'
  })
  const taskNodes = combined.filter(n => {
    const p = parseNodeId(n)
    return !!p && p.type === 'task'
  })

  return { root: [...folderNodes, ...taskNodes], folders }
}

function isSuccessTask(t: ManualGridTask | undefined | null): boolean {
  return !!(t && t.status === 'success' && t.url)
}

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

function shouldIgnoreKeydown(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = (el.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((el as any).isContentEditable) return true
  return false
}

function makeFolderId(): string {
  return `mf_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function FolderDropZone(props: { id: string, active: boolean }) {
  const { id, active } = props
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`ig-folder-drop ${active ? 'show' : ''} ${isOver ? 'over' : ''}`}
      aria-hidden={!active}
    >
      鏀惧叆鏂囦欢澶?    </div>
  )
}

function SortableNode(props: {
  nodeId: RootNodeId
  disabled?: boolean
  children: React.ReactNode
}) {
  const { nodeId, disabled, children } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: nodeId, disabled: Boolean(disabled) })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={isDragging ? 'ig-dnd-dragging' : ''}>
      {children}
    </div>
  )
}

export default function ManualFolderGrid(props: {
  tasks: ManualGridTask[]
  hideNameEnabled: boolean
  refreshToken: number
  onDeleteTask: (id: string) => void
  onOpenPreview: (id: string) => void
  onPatchTask: (id: string, patch: Partial<ManualGridTask>) => void
  onRemakeOne?: (task: ManualGridTask) => void
  canvasTools?: {
    autoStackEnabled: boolean
    hideNameEnabled: boolean
    onToggleAutoStack: () => void
    onToggleHideName: () => void
    onRefresh: () => void
  }

  // 鐢ㄤ簬鍒嗙 t2i/i2i 鐨勬墜鍔ㄥ竷灞€锛岄伩鍏嶄簰鐩稿奖鍝?  storageKey?: string
  // 鍙€夛細浠呭睍绀烘煇涓枃浠跺す锛堢敤浜庤嚜鍔ㄥ彔鏀炬ā寮忎笅鎵撳紑鈥滆嚜瀹氫箟鏂囦欢澶光€濊€屼笉閫€鍑鸿嚜鍔ㄥ彔鏀撅級
  initialOpenFolderId?: string | null
  lockToFolderId?: string | null
  onExitFolder?: () => void
  showRoot?: boolean
  folderHeaderPrefix?: string
}) {
  const {
    tasks,
    hideNameEnabled,
    refreshToken,
    onDeleteTask,
    onOpenPreview,
    onPatchTask,
    initialOpenFolderId = null,
    lockToFolderId = null,
    onExitFolder,
    showRoot = true,
    folderHeaderPrefix = '鏂囦欢澶',
    onRemakeOne,
    canvasTools,
    storageKey: storageKeyProp
  } = props

  const storageKey = storageKeyProp || DEFAULT_STORAGE_KEY
  const pendingOpenFolderKey = `${PENDING_OPEN_FOLDER_KEY}:${storageKey}`

  const copyText = async (text: string, okMsg: string) => {
    const t = String(text || '')
    if (!t.trim()) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(t)
      uiToast('success', okMsg)
    } catch {
      // 鍏滃簳锛欵lectron/鏉冮檺闄愬埗鏃讹紝寮瑰嚭鈥滄枃鏈煡鐪嬪櫒鈥濊鐢ㄦ埛鎵嬪姩澶嶅埗
      uiTextViewer(t, { title: okMsg, message: '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗锛' })
    }
  }

  const tasksMap = useMemo(() => {
    const m = new Map<string, ManualGridTask>()
    for (const t of tasks) m.set(t.id, t)
    return m
  }, [tasks])

  // refresh effect 涓嶅簲鍥犱负 tasks 棰戠箒鏇存柊鑰屸€滈棯閫€鏂囦欢澶光€濓紱鐢?ref 鍙栨渶鏂?tasks
  const tasksRef = useRef(tasks)
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  const [layout, setLayout] = useState<ManualLayout>(() => reconcileLayout({ root: [], folders: {} }, tasks))
  const [openFolderId, setOpenFolderId] = useState<string | null>(initialOpenFolderId || lockToFolderId || null)

  // 妗岄潰寮忛€夋嫨锛氭閫?澶氶€?  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // 妗嗛€夌姸鎬?  const surfaceRef = useRef<HTMLDivElement>(null)
  const [lasso, setLasso] = useState<{ left: number, top: number, width: number, height: number } | null>(null)
  const lassoStartRef = useRef<{ x: number, y: number } | null>(null)
  const lassoBaseSelectionRef = useRef<Set<string>>(new Set())

  // 鍏煎锛歞nd-kit 鍦ㄩ儴鍒嗙幆澧冧笅浼氬奖鍝?React 鐨?onDoubleClick锛涜繖閲岀敤 pointerdown 鑷繁璇嗗埆鍙屽嚮鎵撳紑鏂囦欢澶?  const folderDblRef = useRef<{ id: string, t: number, x: number, y: number } | null>(null)

  // 鏂囦欢澶归噸鍛藉悕
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // 鍙抽敭鑿滃崟锛氬彧鍋氣€滄柊寤烘枃浠跺す鈥?  const [menu, setMenu] = useState<{ open: boolean, x: number, y: number, type: 'blank' | 'folder' | 'image', folderId?: string }>(
    { open: false, x: 0, y: 0, type: 'blank' }
  )

  // 閫夋嫨缁撴潫鍚庝細瑙﹀彂 click锛氶渶瑕佹姂鍒朵竴娆★紝鍚﹀垯浼氭妸 selection 娓呯┖瀵艰嚧瀵瑰彿娑堝け
  const suppressNextClearClickRef = useRef(false)

  // 妗岄潰浣撻獙锛氱偣鍑诲埌鐢诲竷鍏朵粬鍖哄煙鏃跺彇娑堥€変腑锛堜笉瑕佹眰涓€瀹氱偣鍦ㄧ綉鏍煎唴閮級
  useEffect(() => {
    if (selectedIds.length === 0) return
    const onDown = (e: MouseEvent) => {
      // 妗嗛€?鎷栨嫿杩囩▼涓笉鎵撴柇
      if (lassoStartRef.current) return
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('.ig-result-card')) return
      if (target.closest('.ig-context-menu')) return
      if (target.closest('.ig-rename-input')) return
      clearSelection()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [selectedIds.length])

  // refresh锛氶噸鏂板姞杞藉竷灞€锛堝苟鍏抽棴鏂囦欢澶癸級锛屽悓鏃跺仛 reconcile
  useEffect(() => {
    let alive = true
    setSelectedIds([])
    setRenamingFolderId(null)

    ;(async () => {
      const loaded = await loadLayoutPersisted(storageKey)
      if (!alive) return

      const nextLayout = reconcileLayout(loaded, tasksRef.current)
      setLayout(nextLayout)

      // 澶栭儴閿佸畾鎵撳紑鐨勬枃浠跺す浼樺厛绾ф渶楂?      const forced = lockToFolderId || initialOpenFolderId
      if (forced && nextLayout.folders && nextLayout.folders[forced]) {
        setOpenFolderId(forced)
      } else {
        setOpenFolderId(null)
      }

      // 鏀寔澶栭儴璇锋眰鈥滄墦寮€鏌愪釜鎵嬪姩鏂囦欢澶光€?      const fid = (await kvGetStringMigrate(pendingOpenFolderKey)) || ''
      const trimmed = String(fid || '').trim()
      if (trimmed && nextLayout.folders && nextLayout.folders[trimmed]) {
        setOpenFolderId(trimmed)
      }
      if (trimmed) {
        await kvRemove(pendingOpenFolderKey)
      }
    })()

    return () => {
      alive = false
    }
  }, [refreshToken, lockToFolderId, initialOpenFolderId, storageKey, pendingOpenFolderKey])

  // 褰撳閮ㄤ紶鍏ョ殑閿佸畾鏂囦欢澶瑰彉鍖栨椂鍚屾
  useEffect(() => {
    const forced = lockToFolderId || initialOpenFolderId
    if (!forced) return
    if (layout.folders && layout.folders[forced]) {
      setOpenFolderId(forced)
    }
  }, [lockToFolderId, initialOpenFolderId, layout])

  // 澶栭儴锛堢敾甯冪┖鐧藉尯鍩燂級瑙﹀彂娓呯┖閫夋嫨
  useEffect(() => {
    const onClear = () => {
      setSelectedIds([])
    }
    window.addEventListener(CLEAR_SELECTION_EVENT as any, onClear as any)
    return () => window.removeEventListener(CLEAR_SELECTION_EVENT as any, onClear as any)
  }, [])

  // tasks 鍙樺寲鏃惰嚜鍔?reconcile锛堟柊浠诲姟杩?root 椤堕儴 / 鍒犻櫎澶辨晥鑺傜偣锛?  useEffect(() => {
    setLayout(prev => reconcileLayout(prev, tasks))
  }, [tasks])

  // 閿洏蹇嵎閿細Esc 娓呯┖锛汥elete 鍒犻櫎锛汣trl+A 鍏ㄩ€夛紱F2 閲嶅懡鍚嶏紙浠呭綋鎵撳紑鏂囦欢澶逛笖鍗曢€夋枃浠跺す? 杩欓噷鍏堝仛 folder card 鐐瑰嚮閾呯瑪锛?  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKeydown(e)) return
      if (e.key === 'Escape') {
        setSelectedIds([])
        return
      }

      // Ctrl/Cmd + A锛氬叏閫夊綋鍓嶈鍥剧殑鈥滄垚鍔熷浘鐗団€?      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        const ids = openFolder
          ? openFolder.taskIds.filter(id => isSuccessTask(tasksMap.get(id)))
          : rootItems
              .map(n => parseNodeId(n))
              .filter(p => !!p && (p as any).type === 'task')
              .map(p => (p as any).id)
              .filter((id: string) => isSuccessTask(tasksMap.get(id)))
        setSelectedIds(ids)
        return
      }

      // Delete/Backspace锛氬垹闄ら€変腑
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        const ids = [...selectedIds]
        uiConfirm(`纭畾鍒犻櫎閫変腑鐨?${ids.length} 寮犲浘鐗囧悧锛焋, '鍒犻櫎鍥剧墖').then(ok => {
          if (!ok) return
          ids.forEach(id => onDeleteTask(id))
          setSelectedIds([])
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, openFolderId, layout, tasks])

  const getDefaultFolderName = (folder: ManualFolder): string => {
    // 榛樿锛氳嫢鏂囦欢澶瑰唴鎵€鏈夊浘鐗囩殑浼樺寲鍋忓ソ鐩稿悓涓旈潪绌猴紝鍒欑敤璇ヤ紭鍖栧亸濂斤紱鍚﹀垯 fallback
    const prefs: string[] = []
    for (const tid of folder.taskIds) {
      const t = tasksMap.get(tid)
      const p = (t?.optimizePreference || '').trim()
      if (p) prefs.push(p)
    }
    const uniq = Array.from(new Set(prefs))
    if (uniq.length === 1) return uniq[0]
    if (uniq.length > 1) return '鏂囦欢澶?
    return '鏂囦欢澶?
  }

  const folderDisplayName = (folder: ManualFolder): string => {
    const n = (folder.name || '').trim()
    return n ? n : getDefaultFolderName(folder)
  }

  const setFolderName = (folderId: string, name: string) => {
    setLayout(prev => {
      const next = reconcileLayout(prev, tasks)
      const f = next.folders[folderId]
      if (!f) return next
      return { ...next, folders: { ...next.folders, [folderId]: { ...f, name } } }
    })
  }

  const startRenameFolder = (folderId: string) => {
    const f = layout.folders[folderId]
    if (!f) return
    setRenamingFolderId(folderId)
    setRenameValue((f.name || '').trim() || folderDisplayName(f))
  }

  const commitRenameFolder = () => {
    if (!renamingFolderId) return
    const v = (renameValue || '').trim()
    // 鍏佽鐢ㄦ埛娓呯┖锛氭竻绌哄悗鍥炲埌鈥滄湭鍛藉悕鈥濓紝鏄剧ず榛樿浼樺寲鍋忓ソ鍚嶇О
    setFolderName(renamingFolderId, v)
    setRenamingFolderId(null)
    setRenameValue('')
  }

  const createEmptyFolder = (opts?: { autoRename?: boolean, insertAtFront?: boolean }): string => {
    const fid = makeFolderId()
    const autoRename = opts?.autoRename !== false
    const insertAtFront = opts?.insertAtFront !== false

    setLayout(prev => {
      const next = reconcileLayout(prev, tasks)
      const folder: ManualFolder = { id: fid, name: '', taskIds: [], createdAt: Date.now() }
      const root = insertAtFront ? [nodeFolderId(fid), ...next.root] : [...next.root, nodeFolderId(fid)]
      return {
        root,
        folders: { ...next.folders, [fid]: folder }
      }
    })

    // 妗岄潰浣撻獙锛氭柊寤哄悗鐩存帴杩涘叆閲嶅懡鍚?    if (autoRename) {
      setRenamingFolderId(fid)
      setRenameValue('鏂板缓鏂囦欢澶')
    }
    return fid
  }

  const dissolveFolder = (folderId: string) => {
    setLayout(prev => {
      const next = reconcileLayout(prev, tasks)
      const f = next.folders[folderId]
      if (!f) return next

      const idx = next.root.indexOf(nodeFolderId(folderId))
      const rootWithout = next.root.filter(n => n !== nodeFolderId(folderId))

      // 鎶婃枃浠跺す鍐呯殑鍥剧墖鎸夐『搴忔斁鍥?root锛堟彃鍏ュ埌鏂囦欢澶瑰師浣嶇疆锛?      const taskNodes = (f.taskIds || [])
        .filter(id => Boolean(tasksMap.get(id)))
        .map(id => nodeTaskId(id))

      if (idx >= 0) {
        rootWithout.splice(idx, 0, ...taskNodes)
      } else {
        rootWithout.unshift(...taskNodes)
      }

      const folders = { ...next.folders }
      delete folders[folderId]
      return { root: rootWithout, folders }
    })
  }

  const safeFileBase = (name: string) => {
    const raw = (name || '').trim() || 'aitnt_export'
    // windows 鏂囦欢鍚嶉潪娉曞瓧绗﹁繃婊?    const cleaned = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
    return cleaned.slice(0, 48) || 'aitnt_export'
  }

  const exportFolderToLocal = async (folderId: string) => {
    const f = layout.folders[folderId]
    if (!f) return
    const items = (f.taskIds || [])
      .map(id => tasksMap.get(id))
      .filter(t => !!t && t.status === 'success' && t.url)
      .map((t, i) => ({
        url: (t as any).url as string,
        fileName: `${safeFileBase(folderDisplayName(f))}_${String(i + 1).padStart(2, '0')}`
      }))

    if (!window.aitntAPI?.selectDirectory || !window.aitntAPI?.exportImagesToDir) {
      uiAlert('褰撳墠鐜涓嶆敮鎸侀€夋嫨鐩綍/瀵煎嚭')
      return
    }
    if (items.length === 0) {
      uiAlert('璇ユ枃浠跺す娌℃湁鍙繚瀛樼殑鍥剧墖')
      return
    }

    const picked = await window.aitntAPI.selectDirectory()
    if (!picked.success) {
      uiAlert(`閫夋嫨鐩綍澶辫触锛?{picked.error || '鏈煡閿欒'}`)
      return
    }
    if (!picked.dirPath) return

    const r = await window.aitntAPI.exportImagesToDir({ items, saveDir: picked.dirPath })
    if (!r.success) {
      uiAlert(`淇濆瓨澶辫触锛?{r.error || '鏈煡閿欒'}`)
      return
    }
    const ok = r.saved?.length || 0
    const bad = r.failed?.length || 0
    uiToast('success', `宸蹭繚瀛?${ok} 寮?{bad ? `锛屽け璐?${bad} 寮燻 : ''}`)
  }

  const clearSelection = () => setSelectedIds([])

  const selectSingle = (id: string) => setSelectedIds([id])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const set = new Set(prev)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return Array.from(set)
    })
  }

  const selectRange = (id: string) => {
    // shift 閫夋嫨锛氭寜褰撳墠瑙嗗浘椤哄簭鎵╁睍
    const list = openFolder
      ? openFolder.taskIds
      : rootItems
          .map(n => parseNodeId(n))
          .filter(p => !!p && (p as any).type === 'task')
          .map(p => (p as any).id)

    if (selectedIds.length === 0) {
      selectSingle(id)
      return
    }
    const anchor = selectedIds[selectedIds.length - 1]
    const a = list.indexOf(anchor)
    const b = list.indexOf(id)
    if (a < 0 || b < 0) {
      selectSingle(id)
      return
    }
    const [from, to] = a <= b ? [a, b] : [b, a]
    const slice = list.slice(from, to + 1)
    setSelectedIds(Array.from(new Set([...selectedIds, ...slice])))
  }

  const onTaskClick = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    const isMeta = (e.ctrlKey || e.metaKey)
    const isShift = e.shiftKey
    if (isShift) {
      selectRange(taskId)
      return
    }
    if (isMeta) {
      toggleSelect(taskId)
      return
    }
    selectSingle(taskId)
  }

  const beginLasso = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // 浠呭湪绌虹櫧鍖哄煙鍚姩妗嗛€夛紙閬垮厤涓庢嫋鎷?鍙屽嚮棰勮鍐茬獊锛?    if (target.closest('.ig-result-card') || target.closest('button') || target.closest('.ig-result-card-delete')) return
    if (!surfaceRef.current) return
    const startX = e.clientX
    const startY = e.clientY
    lassoStartRef.current = { x: startX, y: startY }
    // 妗岄潰閫昏緫锛氫笉鎸?Ctrl/Cmd 鏃剁敤妗嗛€夋浛鎹紱鎸変綇 Ctrl/Cmd 鏃惰拷鍔?    lassoBaseSelectionRef.current = (e.ctrlKey || e.metaKey) ? new Set(selectedIds) : new Set()
    setLasso({ left: startX, top: startY, width: 0, height: 0 })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const updateLasso = (e: React.PointerEvent) => {
    const start = lassoStartRef.current
    if (!start) return
    const x1 = start.x
    const y1 = start.y
    const x2 = e.clientX
    const y2 = e.clientY
    const left = Math.min(x1, x2)
    const top = Math.min(y1, y2)
    const right = Math.max(x1, x2)
    const bottom = Math.max(y1, y2)
    setLasso({ left, top, width: right - left, height: bottom - top })

    // 璁＄畻鐩镐氦鐨勫浘鐗?    const base = lassoBaseSelectionRef.current
    const next = new Set(base)
    const rect = new DOMRect(left, top, right - left, bottom - top)
    const surface = surfaceRef.current
    if (!surface) return
    const nodes = surface.querySelectorAll<HTMLElement>('[data-select-task]')
    nodes.forEach(el => {
      const id = el.getAttribute('data-select-task')
      if (!id) return
      // 鍙€夋嫨鎴愬姛鍥剧墖锛堜笌妗岄潰涓€鑷达細鍙墿灞曪紝浣嗚繖閲屽厛鍋氭渶甯哥敤锛?      if (!isSuccessTask(tasksMap.get(id))) return
      const r = el.getBoundingClientRect()
      if (rectsIntersect(rect, r)) next.add(id)
    })
    setSelectedIds(Array.from(next))
  }

  const endLasso = (e: React.PointerEvent) => {
    if (!lassoStartRef.current) return
    lassoStartRef.current = null
    setLasso(null)
    // 鍙湪鐪熺殑鍙戠敓浜嗘閫夛紙榧犳爣绉诲姩杩囦竴瀹氳窛绂伙級鏃舵墠鎶戝埗涓嬩竴娆?click
    if (lasso && (lasso.width > 5 || lasso.height > 5)) {
      suppressNextClearClickRef.current = true
    }
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // 蹇界暐
    }
  }

  const handleSurfaceClickClear = (e: React.MouseEvent) => {
    if (suppressNextClearClickRef.current) {
      suppressNextClearClickRef.current = false
      return
    }
    const target = e.target as HTMLElement
    if (target.closest('.ig-result-card') || target.closest('button') || target.closest('input') || target.closest('textarea')) return
    clearSelection()
  }

  const handleSurfaceContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // 鍙湪绌虹櫧澶勫脊鍑猴紙閬垮厤涓庢湭鏉ョ殑鈥滄枃浠?鏂囦欢澶瑰彸閿€濆啿绐侊級
    if (target.closest('.ig-result-card') || target.closest('button') || target.closest('input') || target.closest('textarea')) return
    e.preventDefault()
    e.stopPropagation()
    setMenu({ open: true, x: e.clientX, y: e.clientY, type: 'blank' })
  }

  const handleFolderContextMenu = (e: React.MouseEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ open: true, x: e.clientX, y: e.clientY, type: 'folder', folderId })
  }

  const handleImageContextMenu = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // 鍙抽敭鍦ㄦ湭閫変腑鍥剧墖涓婏細鍏堝崟閫夎鍥剧墖锛屽啀鎵撳紑鑿滃崟
    if (!selectedSet.has(taskId)) {
      setSelectedIds([taskId])
    }
    setMenu({ open: true, x: e.clientX, y: e.clientY, type: 'image' })
  }

  // 鎸佷箙鍖?  useEffect(() => {
    const t = window.setTimeout(() => {
      void kvSetJson(storageKey, layout)
    }, 420)
    return () => window.clearTimeout(t)
  }, [layout, storageKey])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  )

  const [activeNode, setActiveNode] = useState<RootNodeId | null>(null)
  const activeTaskId = useMemo(() => {
    if (!activeNode) return null
    const p = parseNodeId(activeNode)
    if (!p || p.type !== 'task') return null
    return p.id
  }, [activeNode])

  const draggingTask = activeTaskId ? tasksMap.get(activeTaskId) : null
  // 鍙湁鈥滄垚鍔熷浘鐗団€濇墠鍏佽鎶曟斁杩涙枃浠跺す锛堥伩鍏?loading/error 閫犳垚璇锛?  const showOrganizeTargets = !!activeTaskId && isSuccessTask(draggingTask)

  const rootItems = layout.root
  const openFolder = openFolderId ? layout.folders[openFolderId] : null
  const folderTaskNodeIds = useMemo(() => {
    if (!openFolder) return []
    return openFolder.taskIds.map(id => nodeTaskId(id))
  }, [openFolder])

  const dropIdForFolder = (folderId: string) => `drop:folder:${folderId}`

  const moveTaskIdsIntoFolder = (folderId: string, taskIds: string[]) => {
    const ids = (taskIds || []).filter(Boolean)
    if (ids.length === 0) return

    // 鍙Щ鍔ㄢ€滄垚鍔熷浘鐗団€?    const okIds = ids.filter(id => isSuccessTask(tasksMap.get(id)))
    if (okIds.length === 0) return

    setLayout(prev => {
      const next = reconcileLayout(prev, tasks)
      const f = next.folders[folderId]
      if (!f) return next

      const root = next.root.filter(n => {
        const p = parseNodeId(n)
        if (!p || p.type !== 'task') return true
        return !okIds.includes(p.id)
      })

      const existing = new Set(f.taskIds || [])
      const appended = okIds.filter(id => !existing.has(id))
      const folders = { ...next.folders, [folderId]: { ...f, taskIds: [...(f.taskIds || []), ...appended] } }
      return { root, folders }
    })
  }

  const handleDragEndRoot = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveNode(null)
    if (!over) return

    const activeParsed = parseNodeId(String(active.id))
    if (!activeParsed) return

    const overId = String(over.id)

    // 1) 鏀惧叆鏂囦欢澶癸細鎷栧埌鏂囦欢澶规姇鏀惧尯
    if (overId.startsWith('drop:folder:') && activeParsed.type === 'task') {
      const fid = overId.replace('drop:folder:', '')
      const srcTaskId = activeParsed.id
      moveTaskIdsIntoFolder(fid, [srcTaskId])
      return
    }

    // 鍏煎锛歰ver.id 钀藉湪 folder 鑺傜偣锛堣€岄潪 drop zone锛?    if (activeParsed.type === 'task') {
      const overParsed = parseNodeId(overId)
      if (overParsed && overParsed.type === 'folder') {
        moveTaskIdsIntoFolder(overParsed.id, [activeParsed.id])
        return
      }
    }

    // 2) 榛樿锛歳oot 鍐呮帓搴?    const overNodeParsed = parseNodeId(overId)
    if (!overNodeParsed) return
    if (active.id === over.id) return

    setLayout(prev => {
      const next = reconcileLayout(prev, tasks)
      const oldIndex = next.root.indexOf(String(active.id))
      const newIndex = next.root.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0) return next
      return { ...next, root: arrayMove(next.root, oldIndex, newIndex) }
    })
  }

  const moveSelectedIntoFolder = (folderId: string) => {
    // 鎸?root 鐨勫彲瑙侀『搴忕Щ鍔紝閬垮厤鈥滈殢鏈洪『搴忊€?    const rootTaskOrder = rootItems
      .map(n => parseNodeId(n))
      .filter(p => !!p && (p as any).type === 'task')
      .map(p => (p as any).id as string)

    const ordered = rootTaskOrder.filter(id => selectedSet.has(id))
    if (ordered.length === 0) return
    moveTaskIdsIntoFolder(folderId, ordered)
    setSelectedIds([])
  }

  const createFolderAndMoveSelected = () => {
    const rootTaskOrder = rootItems
      .map(n => parseNodeId(n))
      .filter(p => !!p && (p as any).type === 'task')
      .map(p => (p as any).id as string)
    const ordered = rootTaskOrder.filter(id => selectedSet.has(id))
    if (ordered.length === 0) return

    const fid = createEmptyFolder({ autoRename: true, insertAtFront: true })
    moveTaskIdsIntoFolder(fid, ordered)
    setSelectedIds([])
  }

  const deleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    const ok = await uiConfirm(`纭畾鍒犻櫎閫変腑鐨?${ids.length} 寮犲浘鐗囧悧锛焋, '鍒犻櫎鍥剧墖')
    if (!ok) return
    ids.forEach(id => onDeleteTask(id))
    setSelectedIds([])
  }

  const menuItems = useMemo(() => {
    if (!menu.open) return [] as any[]

    const toolItems = canvasTools ? [
      { id: 't_label', kind: 'label', label: '鐢诲竷宸ュ叿' },
      { id: 't_sep0', kind: 'separator' },
      { id: 't_autostack', label: '鑷姩鍙犳斁', rightText: canvasTools.autoStackEnabled ? '寮€' : '鍏', onClick: () => canvasTools.onToggleAutoStack() },
      { id: 't_hidename', label: '闅愯棌鍚嶇О', rightText: canvasTools.hideNameEnabled ? '寮€' : '鍏', onClick: () => canvasTools.onToggleHideName() },
      { id: 't_refresh', label: '涓€閿埛鏂', onClick: () => canvasTools.onRefresh() },
      { id: 't_sep1', kind: 'separator' }
    ] : []

    const folders = Object.values(layout.folders || {})
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

    const selectedSuccess = selectedIds.filter(id => isSuccessTask(tasksMap.get(id)))

    if (menu.type === 'folder' && menu.folderId) {
      const f = layout.folders[menu.folderId]
      const name = f ? folderDisplayName(f) : '鏂囦欢澶?
      return [
        { id: 'f_label', kind: 'label', label: name },
        { id: 'f_sep1', kind: 'separator' },
        { id: 'f_dissolve', label: '瑙ｆ暎鏂囦欢澶', onClick: () => dissolveFolder(menu.folderId!) },
        { id: 'f_save', label: '淇濆瓨鍒版湰鍦?..', onClick: () => exportFolderToLocal(menu.folderId!) }
      ]
    }

    if (menu.type === 'image') {
      const count = selectedIds.length
      const inFolderView = Boolean(openFolder)
      const single = count === 1 ? tasksMap.get(selectedIds[0]) : null
      const canCopyPrompt = Boolean(single && String(single.prompt || '').trim())
      const canCopyReq = Boolean(single && single.request && String(single.request.url || '').trim())
      const canRemake = Boolean(single && String(single.prompt || '').trim() && onRemakeOne)

      const singleActions = (count === 1 && single) ? [
        { id: 'i_copy_prompt', label: '澶嶅埗鎻愮ず璇', disabled: !canCopyPrompt, onClick: () => copyText(single.prompt || '', '宸插鍒舵彁绀鸿瘝') },
        { id: 'i_copy_req', label: '澶嶅埗璇锋眰浠ｇ爜', disabled: !canCopyReq, onClick: () => copyText(formatRequestDebugForCopy(single.request as RequestDebug), '宸插鍒惰姹備唬鐮') },
        ...(canRemake ? [{ id: 'i_remake', label: '閲嶆柊鐢熸垚 1 寮', disabled: !canRemake, onClick: () => onRemakeOne && onRemakeOne(single) }] : []),
        { id: 'i_sep0', kind: 'separator' }
      ] : []

      if (inFolderView) {
        return [
          { id: 'i_label', kind: 'label', label: `宸查€夋嫨 ${count} 寮燻 },
          ...singleActions,
          { id: 'i_del', label: '鍒犻櫎', rightText: 'Del', disabled: count === 0, onClick: () => deleteSelected() }
        ]
      }

      // 鏍硅鍥撅細鍒犻櫎 / 鏀惧叆鏂囦欢澶?/ 鏂板缓鏂囦欢澶瑰苟鏀惧叆
      const canMove = selectedSuccess.length > 0
      return [
        { id: 'i_label', kind: 'label', label: `宸查€夋嫨 ${count} 寮燻 },
        ...singleActions,
        { id: 'i_del', label: '鍒犻櫎', rightText: 'Del', disabled: count === 0, onClick: () => deleteSelected() },
        { id: 'i_sep1', kind: 'separator' },
        { id: 'i_newf', label: '鏂板缓鏂囦欢澶瑰苟鏀惧叆', disabled: !canMove, onClick: () => createFolderAndMoveSelected() },
        { id: 'i_sep2', kind: 'separator' },
        { id: 'i_label2', kind: 'label', label: '鏀惧叆鏂囦欢澶' },
        ...(folders.length === 0
          ? [{ id: 'i_none', label: '鏆傛棤鏂囦欢澶', disabled: true }]
          : folders.map(f => ({
              id: `i_mv_${f.id}`,
              label: folderDisplayName(f),
              disabled: !canMove,
              onClick: () => moveSelectedIntoFolder(f.id)
            })))
      ]
    }

    // blank
    if (openFolder) {
      return [
        ...toolItems,
        { id: 'b_new_disabled', label: '鏂板缓鏂囦欢澶癸紙杩斿洖鏍圭洰褰曚娇鐢級', disabled: true }
      ]
    }
    return [
      ...toolItems,
      { id: 'b_new', label: '鏂板缓鏂囦欢澶', onClick: () => createEmptyFolder() }
    ]
  }, [menu, layout, selectedIds, openFolderId, tasks, canvasTools])

  const handleDragEndFolder = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveNode(null)
    if (!over || !openFolder) return
    if (active.id === over.id) return

    const activeParsed = parseNodeId(String(active.id))
    const overParsed = parseNodeId(String(over.id))
    if (!activeParsed || !overParsed) return
    if (activeParsed.type !== 'task' || overParsed.type !== 'task') return

    setLayout(prev => {
      const next = reconcileLayout(prev, tasks)
      const f = openFolderId ? next.folders[openFolderId] : null
      if (!f) return next
      const oldIndex = f.taskIds.indexOf(activeParsed.id)
      const newIndex = f.taskIds.indexOf(overParsed.id)
      if (oldIndex < 0 || newIndex < 0) return next
      const newTaskIds = arrayMove(f.taskIds, oldIndex, newIndex)
      const fid = openFolderId || f.id
      return { ...next, folders: { ...next.folders, [fid]: { ...f, id: fid, taskIds: newTaskIds } } }
    })
  }

  // 鎵撳紑鏂囦欢澶癸細浣跨敤鍙屽嚮
  const handleOpenFolder = (folderId: string) => {
    setOpenFolderId(folderId)
  }

  const handleFolderPointerDownMaybeOpen = (e: React.PointerEvent, folderId: string) => {
    if (e.button !== 0) return
    const now = Date.now()
    const x = e.clientX
    const y = e.clientY
    const prev = folderDblRef.current

    // 鍙屽嚮闃堝€?+ 浣嶇Щ闃堝€硷細閬垮厤鎷栨嫿瀵艰嚧璇垽
    if (
      prev &&
      prev.id === folderId &&
      (now - prev.t) < 360 &&
      Math.abs(x - prev.x) < 6 &&
      Math.abs(y - prev.y) < 6
    ) {
      folderDblRef.current = null
      e.preventDefault()
      e.stopPropagation()
      handleOpenFolder(folderId)
      return
    }

    folderDblRef.current = { id: folderId, t: now, x, y }
  }

  const dragging = !!activeNode

  if (openFolder) {
    return (
      <div style={{ width: '100%' }}>
        <div className="ig-stack-head">
          <button
            type="button"
            className="ig-tool-btn"
            onClick={() => {
              if ((lockToFolderId || !showRoot) && onExitFolder) {
                onExitFolder()
                return
              }
              setOpenFolderId(null)
            }}
          >
            杩斿洖
          </button>
          <div className="ig-stack-path">{folderHeaderPrefix}锛歿shortText(folderDisplayName(openFolder), 64)}</div>
          <button
            type="button"
            className="ig-icon-btn"
            title="閲嶅懡鍚嶆枃浠跺す"
            onClick={() => openFolderId && startRenameFolder(openFolderId)}
            style={{ marginLeft: 'auto' }}
          >
            <Pencil size={16} />
          </button>
        </div>

        {renamingFolderId === openFolderId && (
          <div className="ig-rename-row" onClick={(e) => e.stopPropagation()}>
            <input
              className="ig-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="杈撳叆鏂囦欢澶瑰悕绉帮紙鐣欑┖=浣跨敤浼樺寲鍋忓ソ鍚嶇О锛?
              autoFocus
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRenameFolder()
                if (e.key === 'Escape') {
                  setRenamingFolderId(null)
                  setRenameValue('')
                }
              }}
              onBlur={() => commitRenameFolder()}
            />
          </div>
        )}

        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveNode(String(e.active.id) as RootNodeId)}
          onDragCancel={() => setActiveNode(null)}
          onDragEnd={handleDragEndFolder}
        >
          <SortableContext items={folderTaskNodeIds} strategy={rectSortingStrategy}>
            <div
              className="ig-select-fill"
              ref={surfaceRef}
              onPointerDown={beginLasso}
              onPointerMove={updateLasso}
              onPointerUp={endLasso}
              onPointerCancel={endLasso}
              onClick={handleSurfaceClickClear}
              onContextMenu={handleSurfaceContextMenu}
            >
              {lasso && (
                <div
                  className="ig-lasso"
                  style={{ left: lasso.left, top: lasso.top, width: lasso.width, height: lasso.height }}
                />
              )}
              <div className="ig-results-grid ig-select-surface">
                {openFolder.taskIds.map(tid => {
                  const task = tasksMap.get(tid)
                  if (!task) return null
                  const nodeId = nodeTaskId(task.id)
                  const selected = selectedSet.has(task.id)
                  return (
                    <SortableNode key={nodeId} nodeId={nodeId}>
                      <div className="ig-result-wrapper">
                        <div className={`ig-result-card ${selected ? 'ig-selected' : ''}`} data-select-task={task.id}>
                        {selected && (
                          <div className="ig-selected-check" aria-label="宸查€変腑">
                            <Check size={14} />
                          </div>
                        )}
                        <div
                          className="ig-result-card-delete"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onDeleteTask(task.id)}
                          title="鍒犻櫎姝や换鍔?
                        >
                          <X size={14} />
                        </div>

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
                            onClick={(e) => onTaskClick(e, task.id)}
                            onDoubleClick={() => onOpenPreview(task.id)}
                            onContextMenu={(e) => handleImageContextMenu(e, task.id)}
                            onLoad={(e) => {
                              const img = e.currentTarget
                              const actual = `${img.naturalWidth}x${img.naturalHeight}`
                              onPatchTask(task.id, { actualSize: actual })
                            }}
                            onError={() => {
                              const src = task.url ? String(task.url) : ''
                              const briefSrc = src.length > 80 ? `${src.slice(0, 40)}...${src.slice(-35)}` : src
                              onPatchTask(task.id, { status: 'error', errorMsg: `鍥剧墖鍔犺浇澶辫触锛坰rc=${briefSrc || '绌'}锛塦 })
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
                  </SortableNode>
                  )
                })}
              </div>
            </div>
          </SortableContext>

          <DragOverlay>
            {draggingTask && (
              <div className="ig-dnd-overlay">
                {draggingTask.status === 'success' && draggingTask.url ? (
                  <img src={draggingTask.url} alt="drag" />
                ) : (
                  <div className="ig-dnd-overlay-fallback">鎷栨嫿涓?/div>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <ContextMenu
          open={menu.open}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(m => ({ ...m, open: false }))}
          items={menuItems}
        />
      </div>
    )
  }

  if (!showRoot) {
    return (
      <div style={{ width: '100%' }}>
        <div className="ig-stack-head">
          <button type="button" className="ig-tool-btn" onClick={() => onExitFolder && onExitFolder()}>杩斿洖</button>
          <div className="ig-stack-path">{folderHeaderPrefix}锛氫笉瀛樺湪鎴栧凡琚垹闄?/div>
        </div>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveNode(String(e.active.id) as RootNodeId)}
      onDragCancel={() => setActiveNode(null)}
      onDragEnd={handleDragEndRoot}
    >
      <SortableContext items={rootItems} strategy={rectSortingStrategy}>
        <div
          className="ig-select-fill"
          ref={surfaceRef}
          onPointerDown={beginLasso}
          onPointerMove={updateLasso}
          onPointerUp={endLasso}
          onPointerCancel={endLasso}
          onClick={handleSurfaceClickClear}
          onContextMenu={handleSurfaceContextMenu}
        >
          {lasso && (
            <div
              className="ig-lasso"
              style={{ left: lasso.left, top: lasso.top, width: lasso.width, height: lasso.height }}
            />
          )}
          <div className="ig-results-grid ig-select-surface">
            {rootItems.map(nid => {
              const p = parseNodeId(nid)
              if (!p) return null

              if (p.type === 'folder') {
                const folderId = p.id
                const folder = layout.folders[folderId]
                if (!folder) return null
                const coverTask = tasksMap.get(folder.taskIds[0])
                const dropId = dropIdForFolder(folderId)
                const displayName = folderDisplayName(folder)

              return (
                <SortableNode key={nid} nodeId={nid} disabled>
                  <div className="ig-result-wrapper">
                    <div
                      className="ig-result-card ig-folder-card"
                      onDoubleClick={() => handleOpenFolder(folderId)}
                      onContextMenu={(e) => handleFolderContextMenu(e, folderId)}
                      title={displayName}
                    >
                      <FolderDropZone id={dropId} active={dragging && showOrganizeTargets} />
                      <div className="ig-folder-badge">{folder.taskIds.length}</div>
                      <button
                        type="button"
                        className="ig-folder-rename"
                        title="閲嶅懡鍚嶆枃浠跺す"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          startRenameFolder(folderId)
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      {coverTask?.url ? (
                        <img src={coverTask.url} alt="folder" className="ig-result-img" />
                      ) : (
                        <div className="ig-folder-empty">
                          <Folder size={28} />
                          <div className="t">{displayName || '鏂板缓鏂囦欢澶'}</div>
                        </div>
                      )}
                      <div className="ig-folder-overlay">
                        <div className="ig-folder-title">{shortText(displayName, 18) || '鏂囦欢澶'}</div>
                        <div className="ig-folder-sub">鍙屽嚮鎵撳紑</div>
                      </div>
                    </div>
                    {!hideNameEnabled && (
                      <div className="ig-result-prompt" title={displayName}>{shortText(displayName, 42)}</div>
                    )}

                    {renamingFolderId === folderId && (
                      <div className="ig-rename-row" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="ig-rename-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          placeholder="杈撳叆鏂囦欢澶瑰悕绉帮紙鐣欑┖=浣跨敤浼樺寲鍋忓ソ鍚嶇О锛?
                          autoFocus
                          onPointerDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRenameFolder()
                            if (e.key === 'Escape') {
                              setRenamingFolderId(null)
                              setRenameValue('')
                            }
                          }}
                          onBlur={() => commitRenameFolder()}
                        />
                      </div>
                    )}
                  </div>
                </SortableNode>
              )
            }

            // task
            const task = tasksMap.get(p.id)
            if (!task) return null
            const selected = selectedSet.has(task.id)

            return (
              <SortableNode key={nid} nodeId={nid}>
                <div className="ig-result-wrapper" data-select-task={task.id} onContextMenu={(e) => handleImageContextMenu(e, task.id)}>
                  <div className={`ig-result-card ${selected ? 'ig-selected' : ''}`}>
                    {selected && (
                      <div className="ig-selected-check" aria-label="宸查€変腑">
                        <Check size={14} />
                      </div>
                    )}

                    <div
                      className="ig-result-card-delete"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onDeleteTask(task.id)}
                      title="鍒犻櫎姝や换鍔?
                    >
                      <X size={14} />
                    </div>

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
                        onClick={(e) => onTaskClick(e, task.id)}
                        onDoubleClick={() => onOpenPreview(task.id)}
                        onContextMenu={(e) => handleImageContextMenu(e, task.id)}
                        onLoad={(e) => {
                          const img = e.currentTarget
                          const actual = `${img.naturalWidth}x${img.naturalHeight}`
                          onPatchTask(task.id, { actualSize: actual })
                        }}
                        onError={() => {
                          const src = task.url ? String(task.url) : ''
                          const briefSrc = src.length > 80 ? `${src.slice(0, 40)}...${src.slice(-35)}` : src
                          onPatchTask(task.id, { status: 'error', errorMsg: `鍥剧墖鍔犺浇澶辫触锛坰rc=${briefSrc || '绌'}锛塦 })
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
              </SortableNode>
            )
            })}
          </div>
        </div>
      </SortableContext>

      <DragOverlay>
        {draggingTask && (
          <div className="ig-dnd-overlay">
            {draggingTask.status === 'success' && draggingTask.url ? (
              <img src={draggingTask.url} alt="drag" />
            ) : (
              <div className="ig-dnd-overlay-fallback">鎷栨嫿涓?/div>
            )}
          </div>
        )}
      </DragOverlay>

      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        onClose={() => setMenu(m => ({ ...m, open: false }))}
        items={menuItems}
      />
    </DndContext>
  )
}

