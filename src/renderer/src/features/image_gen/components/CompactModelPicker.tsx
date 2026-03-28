import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Cpu } from 'lucide-react'

// 紧凑模型选择器：避免左侧出现两条“像搜索框”的大输入条
// 交互：常用模型用 chip 快速切换；需要更多时点“选择”打开列表

export default function CompactModelPicker(props: {
  label: string
  value: string
  placeholder: string
  icon?: React.ReactNode
  pinned: string[]
  models: string[]
  onSelect: (model: string) => void
}) {
  const { label, value, placeholder, icon = <Cpu size={14} />, pinned, models, onSelect } = props

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const list = useMemo(() => {
    // pinned 优先放前面，便于快速定位
    const set = new Set<string>()
    const out: string[] = []
    for (const m of pinned) {
      if (!m) continue
      if (set.has(m)) continue
      set.add(m)
      out.push(m)
    }
    for (const m of models) {
      if (!m) continue
      if (set.has(m)) continue
      set.add(m)
      out.push(m)
    }
    return out
  }, [pinned, models])

  return (
    <div className="ig-compact-model" ref={ref}>
      <div className="ig-compact-head">
        <div className="ig-model-label">{label}</div>
        <button
          type="button"
          className="ig-compact-select"
          onClick={() => setOpen(v => !v)}
          title={value || placeholder}
        >
          <span className="ig-model-select-icon">{icon}</span>
          <span className="ig-compact-select-text">{value || placeholder}</span>
          <ChevronDown size={14} style={{ opacity: 0.8 }} />
        </button>
      </div>

      {pinned.length > 0 && (
        <div className="ig-quick-models" aria-label={`${label}常用模型`}>
          {pinned.map(m => (
            <button
              key={m}
              type="button"
              className={`ig-quick-chip ${m === value ? 'active' : ''}`}
              title={m}
              onClick={() => onSelect(m)}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="ig-model-dropdown" style={{ position: 'relative', top: 0, marginTop: 8 }}>
          {list.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#8e94a8', fontSize: '0.85rem' }}>
              暂无模型列表。请先在设置中刷新模型。
            </div>
          ) : (
            list.map(m => (
              <div
                key={m}
                className={`ig-model-item ${m === value ? 'selected' : ''}`}
                onClick={() => {
                  onSelect(m)
                  setOpen(false)
                }}
              >
                {m}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
