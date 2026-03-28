import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, ChevronLeft, Folder, FolderOpen, Film } from 'lucide-react'
import type { VideoMode, VideoTask } from '../../store'
import VideoContextMenu, { type VideoContextMenuItem } from './VideoContextMenu'
import { makeFolderId, nodeFolderId, nodeTaskId, parseNodeId, reconcileLayout, type VideoManualLayout, type VideoRootNodeId } from './layout'
import ConfirmModal from '../ConfirmModal'
import { kvGetJsonMigrate, kvGetStringMigrate, kvSetJson, kvSetString } from '../../../../core/persist/kvClient'

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

function FolderDropZone(props: { id: string, active: boolean }) {
  const { id, active } = props
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`vg-folder-drop ${active ? 'show' : ''} ${isOver ? 'over' : ''}`} aria-hidden={!active}>
      鏀惧叆鏂囦欢澶?    </div>
  )
}

function SortableRootNode(props: {
  nodeId: VideoRootNodeId
  disabled?: boolean
  children: React.ReactNode
}) {
  const { nodeId, disabled, children } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: nodeId, disabled: Boolean(disabled) })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={isDragging ? 'vg-dnd-dragging' : ''}>
      {children}
    </div>
  )
}

function SortableFolderTask(props: { id: string, children: React.ReactNode }) {
  const { id, children } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={isDragging ? 'vg-dnd-dragging' : ''}>
      {children}
    </div>
  )
}

function shortText(s: string, max = 38): string {
  const t = String(s || '').trim()
  if (t.length <= max) return t
  return t.slice(0, max) + '...'
}

export default function VideoDesktopGrid(props: {
  mode: VideoMode
  tasks: VideoTask[]
  outputDirectory: string
  onOpen: (taskId: string) => void
  onDeleteTasks: (ids: string[]) => void
}) {
  const { mode, tasks, outputDirectory, onOpen, onDeleteTasks } = props

  const storageKey = mode === 't2v' ? 'aitnt-video-manual-layout-t2v-v1' : 'aitnt-video-manual-layout-i2v-v1'
  const openFolderKey = mode === 't2v' ? 'aitnt-video-open-folder-t2v-v1' : 'aitnt-video-open-folder-i2v-v1'

  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks])
  const taskMap = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks])

  const [layout, setLayout] = useState<VideoManualLayout>(() => ({ root: [], folders: {} }))
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    // mode 鍒囨崲鏃堕噸鏂板姞杞藉竷灞€
    let alive = true
    setSelectedIds([])
    setHydrated(false)

    ;(async () => {
      const loaded = await kvGetJsonMigrate<VideoManualLayout>(storageKey, { root: [], folders: {} } as any)
      if (!alive) return
      setLayout(reconcileLayout(loaded as any, taskIds))

      const v = await kvGetStringMigrate(openFolderKey)
      if (!alive) return
      setOpenFolderId(v && String(v).trim() ? String(v).trim() : null)
      setHydrated(true)
    })()

    return () => {
      alive = false
    }
  }, [storageKey])

  // tasks 鍙樺寲鏃讹細鑷姩瀵归綈甯冨眬
  useEffect(() => {
    setLayout(prev => reconcileLayout(prev, taskIds))
  }, [taskIds.join('|')])

  // 鎸佷箙鍖栧竷灞€ + 鎵撳紑鏂囦欢澶?  useEffect(() => {
    if (!hydrated) return
    const t = window.setTimeout(() => {
      void kvSetJson(storageKey, layout)
    }, 420)
    return () => window.clearTimeout(t)
  }, [hydrated, storageKey, layout])

  useEffect(() => {
    if (!hydrated) return
    const t = window.setTimeout(() => {
      void kvSetString(openFolderKey, openFolderId || '')
    }, 320)
    return () => window.clearTimeout(t)
  }, [hydrated, openFolderId, openFolderKey])

  const currentFolder = openFolderId ? layout.folders[openFolderId] : null
  const isInFolder = Boolean(openFolderId && currentFolder)

  const visibleRootNodes = useMemo(() => layout.root || [], [layout.root])
  const visibleTaskIds = useMemo(() => {
    if (isInFolder && currentFolder) return currentFolder.taskIds
    const ids: string[] = []
    for (const n of visibleRootNodes) {
      const p = parseNodeId(n)
      if (p?.type === 'task') ids.push(p.id)
    }
    return ids
  }, [isInFolder, currentFolder?.taskIds?.join('|'), visibleRootNodes.join('|')])

  // lasso
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [lasso, setLasso] = useState<{ left: number, top: number, width: number, height: number } | null>(null)
  const lassoStartRef = useRef<{ x: number, y: number } | null>(null)
  const lassoBaseSelectionRef = useRef<Set<string>>(new Set())
  const suppressNextClearClickRef = useRef(false)

  const beginLasso = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement | null)?.closest('.vg-desk-card')) return
    lassoStartRef.current = { x: e.clientX, y: e.clientY }
    lassoBaseSelectionRef.current = (e.ctrlKey || e.metaKey) ? new Set(selectedIds) : new Set()
    setLasso({ left: e.clientX, top: e.clientY, width: 0, height: 0 })
  }

  const updateLasso = (e: React.PointerEvent) => {
    const start = lassoStartRef.current
    if (!start) return
    const left = Math.min(start.x, e.clientX)
    const right = Math.max(start.x, e.clientX)
    const top = Math.min(start.y, e.clientY)
    const bottom = Math.max(start.y, e.clientY)
    const nextRect = { left, top, width: right - left, height: bottom - top }
    setLasso(nextRect)

    const surface = surfaceRef.current
    if (!surface) return
    const sel = new Set<string>(lassoBaseSelectionRef.current)
    const lassoRect = new DOMRect(nextRect.left, nextRect.top, nextRect.width, nextRect.height)
    const nodes = Array.from(surface.querySelectorAll('[data-vtask-id]')) as HTMLElement[]
    for (const el of nodes) {
      const id = el.getAttribute('data-vtask-id') || ''
      if (!id) continue
      if (!visibleTaskIds.includes(id)) continue
      const r = el.getBoundingClientRect()
      if (rectsIntersect(r, lassoRect)) sel.add(id)
    }
    setSelectedIds(Array.from(sel))
  }

  const endLasso = () => {
    if (!lassoStartRef.current) return
    lassoStartRef.current = null
    if (lasso && (lasso.width > 5 || lasso.height > 5)) suppressNextClearClickRef.current = true
    setLasso(null)
  }

  const clearSelection = () => setSelectedIds([])

  const selectAllVisible = () => {
    if (!visibleTaskIds.length) return
    setSelectedIds([...visibleTaskIds])
  }

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreKeydown(e)) return

      // 妗嗛€夎繃绋嬩腑涓嶆墦鏂?      if (lassoStartRef.current) return

      if (e.key === 'Escape') {
        clearSelection()
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedIds.length) return
        const ids = [...selectedIds]
        askConfirm({
          title: '鍒犻櫎浠诲姟',
          message: `纭畾瑕佸垹闄ら€変腑鐨?${ids.length} 涓换鍔″悧锛焋,
          confirmText: '鍒犻櫎',
          danger: true,
          onConfirm: () => {
            onDeleteTasks(ids)
            clearSelection()
          }
        })
        return
      }

      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'a') {
        e.preventDefault()
        selectAllVisible()
        return
      }

      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') {
        e.preventDefault()
        if (!selectedIds.length) return
        saveSelectedToOutput()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && String(e.key).toLowerCase() === 'n') {
        e.preventDefault()
        if (isInFolder) {
          setOpenFolderId(null)
        }
        const id = makeFolderId()
        setLayout(prev => {
          const next: VideoManualLayout = {
            root: [nodeFolderId(id), ...(prev.root || [])],
            folders: {
              ...(prev.folders || {}),
              [id]: { id, name: '鏂板缓鏂囦欢澶', taskIds: [], createdAt: Date.now() }
            }
          }
          return reconcileLayout(next, taskIds)
        })
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds.join('|'), visibleTaskIds.join('|'), onDeleteTasks, isInFolder, taskIds.join('|')])

  // context menu
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [menuTarget, setMenuTarget] = useState<{ kind: 'blank' | 'task' | 'folder', id?: string }>({ kind: 'blank' })
  const [tip, setTip] = useState('')

  const [confirmState, setConfirmState] = useState<null | {
    title?: string
    message: string
    confirmText?: string
    danger?: boolean
    onConfirm: () => void
  }>(null)

  const askConfirm = (args: {
    title?: string
    message: string
    confirmText?: string
    danger?: boolean
    onConfirm: () => void
  }) => setConfirmState(args)

  // rename folder
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const showTip = (text: string) => {
    setTip(text)
    window.setTimeout(() => setTip(''), 2400)
  }

  const dissolveFolder = (folderId: string) => {
    setLayout(prev => {
      const f = prev.folders?.[folderId]
      const moved = f?.taskIds || []
      const nextFolders = { ...(prev.folders || {}) }
      delete nextFolders[folderId]
      const withoutFolderNode = (prev.root || []).filter(n => n !== nodeFolderId(folderId))
      const movedNodes = moved.map(nodeTaskId)
      const next: VideoManualLayout = {
        root: [...movedNodes, ...withoutFolderNode],
        folders: nextFolders
      }
      return reconcileLayout(next, taskIds)
    })
    if (openFolderId === folderId) setOpenFolderId(null)
  }

  const moveTasksToFolder = (folderId: string, ids: string[]) => {
    if (!ids.length) return
    setLayout(prev => {
      const root = (prev.root || []).filter(n => {
        const p = parseNodeId(n)
        return !(p?.type === 'task' && ids.includes(p.id))
      })
      const f = prev.folders?.[folderId]
      if (!f) return prev
      const existing = new Set((f.taskIds || []).map(String))
      const nextIds = [...ids.filter(id => !existing.has(id)), ...(f.taskIds || [])]
      const next: VideoManualLayout = {
        root,
        folders: {
          ...(prev.folders || {}),
          [folderId]: { ...f, taskIds: nextIds }
        }
      }
      return reconcileLayout(next, taskIds)
    })
    clearSelection()
  }

  const moveTasksToRoot = (ids: string[]) => {
    if (!ids.length) return
    if (!currentFolder) return
    setLayout(prev => {
      const f = prev.folders?.[currentFolder.id]
      if (!f) return prev
      const nextFolderIds = (f.taskIds || []).filter(id => !ids.includes(id))
      const next: VideoManualLayout = {
        root: [...ids.map(nodeTaskId), ...(prev.root || [])],
        folders: {
          ...(prev.folders || {}),
          [currentFolder.id]: { ...f, taskIds: nextFolderIds }
        }
      }
      return reconcileLayout(next, taskIds)
    })
    clearSelection()
  }

  const saveSelectedToOutput = async () => {
    const list = selectedIds
      .map(id => taskMap.get(id))
      .filter(Boolean) as VideoTask[]
    const okList = list.filter(t => Boolean(t.url))
    if (!okList.length) {
      showTip('娌℃湁鍙繚瀛樼殑瑙嗛锛堥渶瑕?url锛')
      return
    }
    if (!window.aitntAPI?.downloadVideo) {
      showTip('淇濆瓨澶辫触锛氬綋鍓嶇幆澧冧笉鏀寔')
      return
    }

    let saved = 0
    for (const t of okList) {
      try {
        const r = await window.aitntAPI.downloadVideo({
          url: String(t.url),
          saveDir: outputDirectory,
          fileName: `aitnt_video_${t.createdAt || Date.now()}_${Math.floor(Math.random() * 1000)}`
        })
        if (r.success) saved += 1
      } catch {
        // ignore
      }
    }
    showTip(saved ? `宸蹭繚瀛?${saved} 涓埌杈撳嚭鐩綍` : '淇濆瓨澶辫触')
  }

  const exportSelectedToDir = async () => {
    const list = selectedIds
      .map(id => taskMap.get(id))
      .filter(Boolean) as VideoTask[]
    const okList = list.filter(t => Boolean(t.url))
    if (!okList.length) {
      showTip('娌℃湁鍙鍑虹殑瑙嗛锛堥渶瑕?url锛')
      return
    }
    if (!window.aitntAPI?.selectDirectory || !window.aitntAPI?.exportVideosToDir) {
      showTip('瀵煎嚭澶辫触锛氬綋鍓嶇幆澧冧笉鏀寔')
      return
    }
    const picked = await window.aitntAPI.selectDirectory()
    if (!picked.success) {
      showTip(`瀵煎嚭澶辫触锛?{picked.error || '閫夋嫨鐩綍澶辫触'}`)
      return
    }
    if (!picked.dirPath) {
      showTip('宸插彇娑堝鍑')
      return
    }
    const r = await window.aitntAPI.exportVideosToDir({
      saveDir: picked.dirPath,
      items: okList.map((t, idx) => ({
        url: String(t.url),
        fileName: `aitnt_video_${t.createdAt || Date.now()}_${idx + 1}`
      }))
    })
    if (!r.success) {
      showTip(`瀵煎嚭澶辫触锛?{r.error || '鏈煡閿欒'}`)
      return
    }
    const failed = Array.isArray(r.failed) ? r.failed.length : 0
    showTip(failed ? `瀵煎嚭瀹屾垚锛堝け璐?${failed} 涓級` : '瀵煎嚭瀹屾垚')
  }

  const menuItems: VideoContextMenuItem[] = useMemo(() => {
    const items: VideoContextMenuItem[] = []
    const hasSelection = selectedIds.length > 0

    if (menuTarget.kind === 'task') {
      const t = menuTarget.id ? taskMap.get(menuTarget.id) : undefined
      items.push({ id: 'label_task', kind: 'label', label: '瑙嗛浠诲姟' })
      items.push({
        id: 'open',
        label: t?.url ? '鎵撳紑棰勮' : '鏌ョ湅璇︽儏',
        disabled: !t,
        onClick: () => t && onOpen(String(t.id))
      })
      items.push({ id: 'sep1', kind: 'separator' })
    }

    if (menuTarget.kind === 'folder') {
      const f = menuTarget.id ? layout.folders[menuTarget.id] : null
      items.push({ id: 'label_folder', kind: 'label', label: '鏂囦欢澶' })
      items.push({
        id: 'open_folder',
        label: '鎵撳紑',
        onClick: () => {
          if (!menuTarget.id) return
          setOpenFolderId(menuTarget.id)
        }
      })
      items.push({
        id: 'rename_folder',
        label: '閲嶅懡鍚',
        disabled: !menuTarget.id,
        onClick: () => {
          if (!menuTarget.id) return
          setRenamingFolderId(menuTarget.id)
          setRenameValue(String(f?.name || ''))
        }
      })
      items.push({
        id: 'dissolve_folder',
        label: '瑙ｆ暎鏂囦欢澶癸紙绉诲埌鏍圭洰褰曪級',
        disabled: !menuTarget.id,
        onClick: () => {
          if (!menuTarget.id) return
          const folderId = menuTarget.id
          askConfirm({
            title: '瑙ｆ暎鏂囦欢澶',
            message: '纭畾瑕佽В鏁ｈ鏂囦欢澶瑰悧锛熸枃浠跺す鍐呯殑瑙嗛浼氬洖鍒版牴鐩綍銆',
            confirmText: '瑙ｆ暎',
            danger: true,
            onConfirm: () => dissolveFolder(folderId)
          })
        }
      })
      items.push({
        id: 'delete_folder',
        label: '鍒犻櫎鏂囦欢澶',
        disabled: !menuTarget.id,
        onClick: () => {
          if (!menuTarget.id) return
          const count = f?.taskIds?.length || 0
          const folderId = menuTarget.id
          askConfirm({
            title: '鍒犻櫎鏂囦欢澶',
            message: count > 0
              ? `璇ユ枃浠跺す鍐呰繕鏈?${count} 涓棰戙€傚垹闄ゆ枃浠跺す灏嗗厛瑙ｆ暎鏂囦欢澶瑰苟淇濈暀瑙嗛鍒版牴鐩綍銆傜户缁紵`
              : '纭畾瑕佸垹闄よ鏂囦欢澶瑰悧锛',
            confirmText: '鍒犻櫎',
            danger: true,
            onConfirm: () => dissolveFolder(folderId)
          })
        }
      })
      items.push({ id: 'sep_f', kind: 'separator' })
    }

    if (!isInFolder) {
      items.push({
        id: 'new_folder',
        label: '鏂板缓鏂囦欢澶',
        rightText: 'Ctrl+Shift+N',
        onClick: () => {
          const id = makeFolderId()
          setLayout(prev => {
            const next: VideoManualLayout = {
              root: [nodeFolderId(id), ...(prev.root || [])],
              folders: {
                ...(prev.folders || {}),
                [id]: { id, name: '鏂板缓鏂囦欢澶', taskIds: [], createdAt: Date.now() }
              }
            }
            return reconcileLayout(next, taskIds)
          })
          setRenamingFolderId(id)
          setRenameValue('鏂板缓鏂囦欢澶')
        }
      })
      items.push({ id: 'sep2', kind: 'separator' })
    }

    if (isInFolder && currentFolder && hasSelection) {
      items.push({
        id: 'move_root',
        label: '绉诲埌鏍圭洰褰',
        onClick: () => moveTasksToRoot(selectedIds)
      })
      items.push({ id: 'sep_move', kind: 'separator' })
    }

    items.push({
      id: 'save_out',
      label: '淇濆瓨鍒拌緭鍑虹洰褰',
      disabled: !hasSelection,
      onClick: () => saveSelectedToOutput()
    })

    items.push({
      id: 'export',
      label: '瀵煎嚭閫変腑...',
      disabled: !hasSelection,
      onClick: () => exportSelectedToDir()
    })

    items.push({ id: 'sep3', kind: 'separator' })

    items.push({
      id: 'select_all',
      label: '鍏ㄩ€',
      rightText: 'Ctrl+A',
      disabled: !visibleTaskIds.length,
      onClick: () => selectAllVisible()
    })
    items.push({
      id: 'clear_sel',
      label: '鍙栨秷閫夋嫨',
      rightText: 'Esc',
      disabled: !hasSelection,
      onClick: () => clearSelection()
    })

    items.push({ id: 'sep4', kind: 'separator' })

    items.push({
      id: 'delete',
      label: hasSelection ? `鍒犻櫎閫変腑锛?{selectedIds.length}锛塦 : '鍒犻櫎',
      rightText: 'Del',
      disabled: !hasSelection,
      onClick: () => {
        if (!hasSelection) return
        const ids = [...selectedIds]
        askConfirm({
          title: '鍒犻櫎浠诲姟',
          message: `纭畾瑕佸垹闄ら€変腑鐨?${ids.length} 涓换鍔″悧锛焋,
          confirmText: '鍒犻櫎',
          danger: true,
          onConfirm: () => {
            onDeleteTasks(ids)
            clearSelection()
          }
        })
      }
    })

    return items
  }, [menuTarget.kind, menuTarget.id, selectedIds.join('|'), visibleTaskIds.join('|'), isInFolder, currentFolder?.id, layout.folders])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [dragActiveId, setDragActiveId] = useState<string | null>(null)

  const onRootDragStart = (e: DragStartEvent) => {
    setDragActiveId(String(e.active.id))
  }

  const onRootDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    setDragActiveId(null)
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // drop into folder
    if (overId.startsWith('drop:')) {
      const folderId = overId.slice('drop:'.length)
      const p = parseNodeId(activeId)
      if (p?.type === 'task') {
        moveTasksToFolder(folderId, [p.id])
      }
      return
    }

    // reorder in root
    if (activeId === overId) return
    setLayout(prev => {
      const oldIndex = (prev.root || []).indexOf(activeId)
      const newIndex = (prev.root || []).indexOf(overId)
      if (oldIndex < 0 || newIndex < 0) return prev
      const nextRoot = arrayMove(prev.root || [], oldIndex, newIndex)
      return { ...prev, root: nextRoot }
    })
  }

  // folder reorder
  const onFolderDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over) return
    const a = String(active.id)
    const o = String(over.id)
    if (a === o) return
    if (!currentFolder) return
    const ids = currentFolder.taskIds || []
    const oldIndex = ids.indexOf(a)
    const newIndex = ids.indexOf(o)
    if (oldIndex < 0 || newIndex < 0) return
    const nextIds = arrayMove(ids, oldIndex, newIndex)
    setLayout(prev => {
      const f = prev.folders?.[currentFolder.id]
      if (!f) return prev
      return {
        ...prev,
        folders: { ...(prev.folders || {}), [currentFolder.id]: { ...f, taskIds: nextIds } }
      }
    })
  }

  const renderTaskCard = (t: VideoTask) => {
    const isRunning = t.status === 'running' || t.status === 'queued'
    const isError = t.status === 'error'
    const isOk = t.status === 'success'
    const canOpen = Boolean(t.url)
    const selected = selectedSet.has(t.id)

    return (
      <div
        key={t.id}
        className={`vg-desk-card vg-desk-task ${canOpen ? 'clickable' : ''} ${selected ? 'selected' : ''}`}
        data-vtask-id={t.id}
        onDoubleClick={() => onOpen(t.id)}
        onPointerDown={(e) => {
          // selection
          if (e.button !== 0) return
          if (lassoStartRef.current) return
          e.stopPropagation()
          if (e.ctrlKey || e.metaKey) {
            const next = new Set(selectedSet)
            if (next.has(t.id)) next.delete(t.id)
            else next.add(t.id)
            setSelectedIds(Array.from(next))
          } else {
            setSelectedIds([t.id])
          }
        }}
        title={t.prompt}
      >
        <div className="vg-card-media">
          {t.url ? (
            <video src={t.url} muted playsInline preload="metadata" />
          ) : (
            <div className="vg-card-ph">
              <Film size={26} style={{ opacity: 0.65 }} />
            </div>
          )}

          <div className="vg-card-badge">
            <span>{isRunning ? 'running' : isOk ? 'success' : isError ? 'error' : t.status}</span>
          </div>

          {isRunning && (
            <div className="vg-card-progress">
              <div className="bar" style={{ width: `${Math.max(0, Math.min(100, t.progress || 0))}%` }} />
            </div>
          )}

          {selected && (
            <div className="vg-desk-check" title="宸查€夋嫨">
              <Check size={14} />
            </div>
          )}
        </div>

        <div className="vg-card-meta">
          <div className="p">{shortText(t.prompt, 38)}</div>
          <div className="m">{t.durationSec}s 路 {t.aspectRatio}</div>
          {t.status === 'error' && t.errorMsg ? (
            <div className="vg-desk-err" title={t.errorMsg}>{shortText(t.errorMsg, 48)}</div>
          ) : null}
        </div>
      </div>
    )
  }

  const renderFolderCard = (folderId: string) => {
    const f = layout.folders[folderId]
    if (!f) return null
    const count = f.taskIds?.length || 0
    const coverTask = count ? taskMap.get(f.taskIds[0]) : undefined
    const isRenaming = renamingFolderId === folderId
    const dropId = `drop:${folderId}`
    const canDrop = Boolean(dragActiveId && String(dragActiveId).startsWith('task:'))

    return (
      <div
        className="vg-desk-card vg-desk-folder"
        data-vfolder-id={folderId}
        onDoubleClick={() => setOpenFolderId(folderId)}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          // click folder doesn't alter task selection by default
        }}
        title={f.name || '鏂囦欢澶'}
      >
        <FolderDropZone id={dropId} active={canDrop} />
        <div className="vg-folder-media">
          {coverTask?.url ? (
            <video src={coverTask.url} muted playsInline preload="metadata" />
          ) : (
            <div className="vg-folder-ph"><Folder size={26} style={{ opacity: 0.7 }} /></div>
          )}
        </div>

        <div className="vg-folder-meta">
          {isRenaming ? (
            <div className="vg-folder-rename">
              <input
                className="vg-folder-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = renameValue.trim()
                    setLayout(prev => {
                      const cur = prev.folders?.[folderId]
                      if (!cur) return prev
                      return { ...prev, folders: { ...(prev.folders || {}), [folderId]: { ...cur, name: v } } }
                    })
                    setRenamingFolderId(null)
                  }
                  if (e.key === 'Escape') setRenamingFolderId(null)
                }}
                autoFocus
              />
              <button
                type="button"
                className="vg-folder-icon"
                title="淇濆瓨"
                onClick={() => {
                  const v = renameValue.trim()
                  setLayout(prev => {
                    const cur = prev.folders?.[folderId]
                    if (!cur) return prev
                    return { ...prev, folders: { ...(prev.folders || {}), [folderId]: { ...cur, name: v } } }
                  })
                  setRenamingFolderId(null)
                }}
              >
                <Check size={14} />
              </button>
              <button type="button" className="vg-folder-icon" title="鍙栨秷" onClick={() => setRenamingFolderId(null)}>
                脳
              </button>
            </div>
          ) : (
            <>
              <div className="t">{f.name || '鏂囦欢澶'}</div>
              <div className="d">{count} 涓棰?/div>
            </>
          )}
        </div>
      </div>
    )
  }

  const onSurfaceClick = () => {
    if (suppressNextClearClickRef.current) {
      suppressNextClearClickRef.current = false
      return
    }
    if (lassoStartRef.current) return
    clearSelection()
  }

  const onSurfaceContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const target = e.target as HTMLElement | null
    const taskEl = target?.closest('[data-vtask-id]') as HTMLElement | null
    const folderEl = target?.closest('[data-vfolder-id]') as HTMLElement | null

    if (taskEl) {
      const id = taskEl.getAttribute('data-vtask-id') || ''
      if (id && !selectedSet.has(id)) setSelectedIds([id])
      setMenuTarget({ kind: 'task', id })
    } else if (folderEl && !isInFolder) {
      const id = folderEl.getAttribute('data-vfolder-id') || ''
      setMenuTarget({ kind: 'folder', id })
    } else {
      setMenuTarget({ kind: 'blank' })
    }

    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
  }

  if (!tasks.length && !Object.keys(layout.folders || {}).length) {
    return (
      <div className="vg-canvas">
        <div className="vg-empty">
          <FolderOpen size={44} style={{ opacity: 0.6 }} />
          <div className="t">杩樻病鏈夎棰戜换鍔?/div>
          <div className="d">杈撳叆鎻愮ず璇嶅苟鐐瑰嚮鈥滃紑濮嬧€濈敓鎴愯棰?/div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={surfaceRef}
      className="vg-canvas vg-desk"
      onClick={onSurfaceClick}
      onContextMenu={onSurfaceContextMenu}
      onPointerDown={beginLasso}
      onPointerMove={updateLasso}
      onPointerUp={endLasso}
      onPointerCancel={endLasso}
    >
      <div className="vg-desk-head">
        {isInFolder && currentFolder ? (
          <>
            <button type="button" className="vg-desk-back" onClick={() => setOpenFolderId(null)} title="杩斿洖鏍圭洰褰?>
              <ChevronLeft size={16} /> 杩斿洖
            </button>
            <div className="vg-desk-path">{currentFolder.name || '鏂囦欢澶'} <span className="muted">({currentFolder.taskIds.length})</span></div>
          </>
        ) : (
          <div className="vg-desk-path">鏍圭洰褰?<span className="muted">({visibleTaskIds.length})</span></div>
        )}
      </div>

      {!isInFolder ? (
        <DndContext
          sensors={sensors}
          onDragStart={onRootDragStart}
          onDragEnd={onRootDragEnd}
          onDragCancel={() => setDragActiveId(null)}
        >
          <SortableContext items={visibleRootNodes} strategy={rectSortingStrategy}>
            <div className="vg-grid vg-desk-grid">
              {visibleRootNodes.map(n => {
                const p = parseNodeId(n)
                if (!p) return null
                if (p.type === 'folder') {
                  return (
                    <SortableRootNode key={n} nodeId={n}>
                      {renderFolderCard(p.id)}
                    </SortableRootNode>
                  )
                }
                const t = taskMap.get(p.id)
                if (!t) return null
                return (
                  <SortableRootNode key={n} nodeId={n}>
                    {renderTaskCard(t)}
                  </SortableRootNode>
                )
              })}
            </div>
          </SortableContext>

          <DragOverlay>
            {dragActiveId ? (
              <div className="vg-drag-overlay">鎷栨嫿涓?/div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <DndContext
          sensors={sensors}
          onDragEnd={onFolderDragEnd}
        >
          <SortableContext items={currentFolder?.taskIds || []} strategy={rectSortingStrategy}>
            <div className="vg-grid vg-desk-grid">
              {(currentFolder?.taskIds || []).map(id => {
                const t = taskMap.get(id)
                if (!t) return null
                return (
                  <SortableFolderTask key={id} id={id}>
                    {renderTaskCard(t)}
                  </SortableFolderTask>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {lasso && (
        <div className="vg-lasso" style={{ left: lasso.left, top: lasso.top, width: lasso.width, height: lasso.height }} />
      )}

      {tip ? <div className="vg-desk-tip">{tip}</div> : null}

      <VideoContextMenu
        open={menuOpen}
        x={menuPos.x}
        y={menuPos.y}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText}
        danger={confirmState?.danger}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const fn = confirmState?.onConfirm
          setConfirmState(null)
          if (fn) fn()
        }}
      />
    </div>
  )
}

