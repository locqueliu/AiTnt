import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

function norm(s: string) {
  return String(s || '').trim().toLowerCase()
}

export default function ModelPicker(props: {
  value: string
  placeholder?: string
  commonModels?: string[]
  allModels?: string[]
  onChange: (model: string) => void
  disabled?: boolean
}) {
  const { value, placeholder, commonModels, allModels, onChange, disabled } = props
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target && el.contains(e.target as any)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => window.clearTimeout(t)
  }, [open])

  const common = useMemo(() => {
    const list = (commonModels || []).map(s => String(s || '').trim()).filter(Boolean)
    const uniq = Array.from(new Set(list))
    return uniq.slice(0, 6)
  }, [commonModels])

  const all = useMemo(() => {
    const list = (allModels || []).map(s => String(s || '').trim()).filter(Boolean)
    const uniq = Array.from(new Set(list))
    return uniq
  }, [allModels])

  const filtered = useMemo(() => {
    const nq = norm(q)
    if (!nq) return all
    return all.filter(m => norm(m).includes(nq))
  }, [all, q])

  return (
    <div className="ps-modelpick" ref={rootRef}>
      <button
        type="button"
        className="ps-modelpick-btn"
        onClick={() => {
          if (disabled) return
          setOpen(v => !v)
          if (!open) setQ('')
        }}
        disabled={disabled}
        title={value || placeholder || '选择模型'}
      >
        <span className="ps-modelpick-val">{value || placeholder || '选择模型'}</span>
        <ChevronDown size={16} />
      </button>

      {open ? (
        <div className="ps-modelpick-pop" role="dialog" aria-modal="false">
          <div className="ps-modelpick-search">
            <Search size={16} />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索模型..."
              spellCheck={false}
            />
          </div>

          {common.length > 0 ? (
            <div className="ps-modelpick-common">
              <div className="ps-modelpick-sub">常用</div>
              <div className="ps-modelpick-chips">
                {common.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`ps-chip ${m === value ? 'active' : ''}`}
                    onClick={() => {
                      onChange(m)
                      setOpen(false)
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="ps-modelpick-list">
            {filtered.length === 0 ? (
              <div className="ps-modelpick-empty">没有匹配的模型</div>
            ) : (
              filtered.slice(0, 200).map(m => (
                <button
                  key={m}
                  type="button"
                  className={`ps-modelpick-item ${m === value ? 'active' : ''}`}
                  onClick={() => {
                    onChange(m)
                    setOpen(false)
                  }}
                  title={m}
                >
                  {m}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
