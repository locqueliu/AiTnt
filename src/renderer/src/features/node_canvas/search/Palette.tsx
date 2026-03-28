import React from 'react'
import type { NodeManifest } from '../registry/types'
import { score } from './fuzzy'
import { useNodeRegistryStore } from '../registry/store'

export default function Palette(props: {
  open: boolean
  query: string
  setQuery: (q: string) => void
  onClose: () => void
  onPick: (m: NodeManifest, keepOpen: boolean) => void
}) {
  const { open, query, setQuery, onClose, onPick } = props
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const builtins = useNodeRegistryStore(s => s.builtins)
  const customs = useNodeRegistryStore(s => s.customs)
  const manifests = React.useMemo(() => [...builtins, ...customs], [builtins, customs])
  const items = React.useMemo(() => {
    const q = query.trim()
    const scored = manifests
      .map(m => {
        const hay = [m.display_name, m.node_id, m.category || '', ...(m.tags || []), ...(m.search_aliases || [])].join(' ')
        return { m, s: score(hay, q) }
      })
      .filter(x => (q ? x.s > 0 : true))
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
    return scored.map(x => x.m)
  }, [manifests, query])

  const [active, setActive] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setActive(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

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
        setActive(i => Math.min(items.length - 1, i + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(i => Math.max(0, i - 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const picked = items[active]
        if (picked) {
          onPick(picked, Boolean((e as any).shiftKey))
          if ((e as any).shiftKey) {
            setQuery('')
            window.setTimeout(() => inputRef.current?.focus(), 0)
          }
        }
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, items, active, onClose, onPick])

  if (!open) return null

  return (
    <div className="aitnt-palette-overlay" onMouseDown={onClose}>
      <div className="aitnt-palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="top">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="鎼滅储鑺傜偣...锛圗sc 鍏抽棴锛屽洖杞︽坊鍔狅級"
          />
        </div>
        <div className="list">
          {items.map((m, idx) => (
            <div
              key={m.node_id}
              className={`item ${idx === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(idx)}
              onClick={() => onPick(m, false)}
            >
              <div className="left">
                <div className="title">{m.display_name}</div>
                <div className="subtitle">{m.category || '鏈垎绫'} 路 {m.node_id}</div>
              </div>
              <div className="hint">鍥炶溅</div>
            </div>
          ))}
          {items.length === 0 && (
            <div style={{ color: 'var(--text-muted)', padding: '8px 2px' }}>鏃犲尮閰嶇粨鏋?/div>
          )}
        </div>
      </div>
    </div>
  )
}

