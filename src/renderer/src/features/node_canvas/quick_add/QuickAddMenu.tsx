import React from 'react'
import type { NodeManifest } from '../registry/types'
import { useNodeRegistryStore } from '../registry/store'
import { score } from '../search/fuzzy'
import type { QuickAddAnchor, QuickAddEntry } from './types'
import { buildDefaultCommonEntries } from './defaultItems'
import { computePopoverPosition } from './positioning'

function buildSearchEntries(manifests: NodeManifest[], query: string): QuickAddEntry[] {
  const q = query.trim()
  if (!q) return []

  return manifests
    .map(m => {
      const hay = [m.display_name, m.node_id, m.category || '', ...(m.tags || []), ...(m.search_aliases || [])].join(' ')
      return { m, s: score(hay, q) }
    })
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 24)
    .map(x => ({
      key: `result:${x.m.node_id}`,
      kind: 'node' as const,
      group: 'results' as const,
      nodeId: x.m.node_id,
      manifest: x.m,
      title: x.m.display_name,
      subtitle: `${x.m.category || '鏈垎绫'} 路 ${x.m.node_id}`,
      enabled: true
    }))
}

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as any).isContentEditable
}

export default function QuickAddMenu(props: {
  open: boolean
  anchor: QuickAddAnchor
  containerRef: React.RefObject<HTMLElement>
  query: string
  setQuery: (q: string) => void
  onClose: () => void
  onPickNode: (m: NodeManifest, keepOpen: boolean, anchorFlow: { x: number; y: number }) => void
  onAction: (actionId: 'upload_assets', keepOpen: boolean, anchorFlow: { x: number; y: number }) => void
}) {
  const { open, anchor, containerRef, query, setQuery, onClose, onPickNode, onAction } = props
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const popRef = React.useRef<HTMLDivElement | null>(null)

  const builtins = useNodeRegistryStore(s => s.builtins)
  const customs = useNodeRegistryStore(s => s.customs)
  const getManifest = useNodeRegistryStore(s => s.getManifest)

  const manifests = React.useMemo(() => [...builtins, ...customs], [builtins, customs])

  const common = React.useMemo(() => {
    return buildDefaultCommonEntries({
      resolveNode: (nodeId) => {
        const m = getManifest(nodeId)
        return { enabled: Boolean(m), subtitle: m ? `${m.category || '鏈垎绫?} 路 ${m.version}` : '鏈畨瑁? }
      }
    })
  }, [getManifest])

  const commonNodes = React.useMemo(() => common.filter(e => e.group === 'common'), [common])
  const resourceActions = React.useMemo(() => common.filter(e => e.group === 'resource'), [common])

  const results = React.useMemo(() => buildSearchEntries(manifests, query), [manifests, query])

  const viewEntries = React.useMemo(() => {
    // For navigation: prefer search results when query exists; otherwise use common.
    const base = [...commonNodes, ...resourceActions]
    if (query.trim()) return [...base, ...results]
    return base
  }, [commonNodes, resourceActions, results, query])

  const selectable = React.useMemo(() => viewEntries.filter(e => e.enabled), [viewEntries])
  const [activeKey, setActiveKey] = React.useState<string>('')

  React.useEffect(() => {
    if (!open) return
    const first = selectable[0]
    setActiveKey(first ? first.key : '')
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open, selectable])

  const activeIndex = React.useMemo(() => selectable.findIndex(e => e.key === activeKey), [selectable, activeKey])

  const pick = React.useCallback((entry: QuickAddEntry, keepOpen: boolean) => {
    if (!entry.enabled) return

    if (entry.kind === 'action') {
      onAction(entry.actionId, keepOpen, anchor.flow)
    } else {
      const m = entry.manifest || getManifest(entry.nodeId)
      if (!m) return
      onPickNode(m, keepOpen, anchor.flow)
    }

    if (keepOpen) {
      setQuery('')
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [anchor.flow, getManifest, onAction, onPickNode, setQuery])

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (selectable.length === 0) return
        const next = selectable[Math.min(selectable.length - 1, (activeIndex < 0 ? 0 : activeIndex + 1))]
        if (next) setActiveKey(next.key)
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (selectable.length === 0) return
        const next = selectable[Math.max(0, (activeIndex < 0 ? 0 : activeIndex - 1))]
        if (next) setActiveKey(next.key)
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (selectable.length === 0) return
        const cur = selectable[Math.max(0, activeIndex)]
        if (cur) pick(cur, Boolean((e as any).shiftKey))
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, selectable, activeIndex, onClose, pick])

  const [pos, setPos] = React.useState<{ left: number; top: number }>({ left: 16, top: 16 })

  React.useLayoutEffect(() => {
    if (!open) return
    const el = popRef.current
    const c = containerRef.current
    if (!el || !c) return

    const cr = c.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setPos(computePopoverPosition({
      anchorClient: anchor.client,
      containerRect: cr,
      popoverSize: { w: r.width, h: r.height },
      margin: 12
    }))
  }, [open, anchor.client.x, anchor.client.y, containerRef])

  if (!open) return null

  const showResults = Boolean(query.trim())

  const renderGroup = (title: string, entries: QuickAddEntry[]) => {
    if (entries.length === 0) return null
    return (
      <div className="aitnt-quickmenu-group">
        <div className="aitnt-quickmenu-group-title">{title}</div>
        <div className="aitnt-quickmenu-list">
          {entries.map(e => {
            const active = e.enabled && e.key === activeKey
            const Icon = (e as any).icon
            return (
              <div
                key={e.key}
                className={`aitnt-quickmenu-item ${active ? 'active' : ''} ${e.enabled ? '' : 'disabled'}`}
                onMouseEnter={() => { if (e.enabled) setActiveKey(e.key) }}
                onMouseDown={(ev) => {
                  // prevent blur before click
                  ev.preventDefault()
                }}
                onClick={() => pick(e, false)}
                title={e.description || ''}
              >
                <div className="i">
                  {Icon ? <Icon size={16} /> : null}
                </div>
                <div className="t">
                  <div className="tt">{e.title}</div>
                  <div className="st">{e.subtitle || ''}</div>
                </div>
                <div className="h">鍥炶溅</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      className="aitnt-quickmenu-overlay"
      onMouseDown={(e) => {
        if (isTypingTarget(e.target)) return
        onClose()
      }}
    >
      <div
        ref={popRef}
        className="aitnt-quickmenu"
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="aitnt-quickmenu-top">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="鎼滅储鑺傜偣...锛圗sc 鍏抽棴锛屽洖杞︽坊鍔狅級"
          />
        </div>

        <div className="aitnt-quickmenu-body">
          {renderGroup('甯哥敤鑺傜偣', commonNodes)}
          {renderGroup('璧勬簮', resourceActions)}
          {showResults && (
            results.length > 0
              ? renderGroup('鎼滅储缁撴灉', results)
              : <div className="aitnt-quickmenu-empty">鏃犲尮閰嶇粨鏋?/div>
          )}
        </div>

        <div className="aitnt-quickmenu-footer">
          <div className="hint">Shift+Enter 杩炵画鏀剧疆</div>
        </div>
      </div>
    </div>
  )
}

