export type VideoRootNodeId = string // 'task:<id>' | 'folder:<id>'
export type VideoFolderId = string

export type VideoManualFolder = {
  id: VideoFolderId
  name?: string
  taskIds: string[]
  createdAt: number
}

export type VideoManualLayout = {
  root: VideoRootNodeId[]
  folders: Record<VideoFolderId, VideoManualFolder>
}

export function nodeTaskId(taskId: string): VideoRootNodeId {
  return `task:${taskId}`
}

export function nodeFolderId(folderId: string): VideoRootNodeId {
  return `folder:${folderId}`
}

export function parseNodeId(id: VideoRootNodeId): { type: 'task' | 'folder', id: string } | null {
  const m = /^(task|folder):(.+)$/.exec(String(id))
  if (!m) return null
  const type = m[1] as 'task' | 'folder'
  return { type, id: m[2] }
}

export function loadLayout(storageKey: string): VideoManualLayout {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { root: [], folders: {} }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { root: [], folders: {} }
    return {
      root: Array.isArray((parsed as any).root) ? (parsed as any).root : [],
      folders: (parsed as any).folders && typeof (parsed as any).folders === 'object' ? (parsed as any).folders : {}
    }
  } catch {
    return { root: [], folders: {} }
  }
}

export function saveLayout(storageKey: string, layout: VideoManualLayout) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout))
  } catch {
    // ignore
  }
}

export function makeFolderId(): string {
  return `vf_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

export function reconcileLayout(layout: VideoManualLayout, taskIds: string[]): VideoManualLayout {
  // 目标：
  // 1) 清理不存在的 taskId
  // 2) 清理 root 里重复/无效 node
  // 3) 未被收录的新任务自动加入 root 顶部
  const taskSet = new Set(taskIds)

  const folders: Record<string, VideoManualFolder> = {}
  const tasksInFolders = new Set<string>()
  for (const [fid, f] of Object.entries(layout.folders || {})) {
    if (!f || typeof f !== 'object') continue
    const filtered = Array.isArray((f as any).taskIds) ? (f as any).taskIds.map(String).filter((id: string) => taskSet.has(id)) : []
    const keep: VideoManualFolder = {
      id: fid,
      name: typeof (f as any).name === 'string' ? String((f as any).name) : '',
      taskIds: filtered,
      createdAt: typeof (f as any).createdAt === 'number' ? (f as any).createdAt : Date.now()
    }
    folders[fid] = keep
    filtered.forEach((id: string) => tasksInFolders.add(id))
  }

  const root: VideoRootNodeId[] = []
  const seen = new Set<string>()
  for (const n of (layout.root || [])) {
    const p = parseNodeId(n)
    if (!p) continue
    const key = `${p.type}:${p.id}`
    if (seen.has(key)) continue
    seen.add(key)

    if (p.type === 'task') {
      if (!taskSet.has(p.id)) continue
      if (tasksInFolders.has(p.id)) continue
      root.push(nodeTaskId(p.id))
      continue
    }
    if (p.type === 'folder') {
      if (!folders[p.id]) continue
      root.push(nodeFolderId(p.id))
    }
  }

  const tasksInRoot = new Set(
    root
      .map(parseNodeId)
      .filter(x => x && x.type === 'task')
      .map(x => (x as any).id)
  )

  const missing: VideoRootNodeId[] = []
  for (const id of taskIds) {
    if (tasksInFolders.has(id)) continue
    if (tasksInRoot.has(id)) continue
    missing.push(nodeTaskId(id))
  }

  const combined = [...missing, ...root]
  // 体验：文件夹固定在最前，避免生成/移动导致左右抖动
  const folderNodes = combined.filter(n => parseNodeId(n)?.type === 'folder')
  const taskNodes = combined.filter(n => parseNodeId(n)?.type === 'task')
  return { root: [...folderNodes, ...taskNodes], folders }
}
