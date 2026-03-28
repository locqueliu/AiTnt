import React, { useEffect, useRef } from 'react'

export type VideoContextMenuItem = {
  id: string
  kind?: 'item' | 'separator' | 'label'
  label?: string
  rightText?: string
  disabled?: boolean
  onClick?: () => void
}

export default function VideoContextMenu(props: {
  open: boolean
  x: number
  y: number
  items: VideoContextMenuItem[]
  onClose: () => void
}) {
  const { open, x, y, items, onClose } = props
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | PointerEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onBlur = () => onClose()
    const onScroll = () => onClose()

    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="vg-context-backdrop"
        onMouseDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
      />

      <div
        ref={ref}
        className="vg-context-menu"
        style={{ left: x, top: y }}
        role="menu"
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {items.map(it => (
          it.kind === 'separator' ? (
            <div key={it.id} className="vg-context-sep" role="separator" />
          ) : it.kind === 'label' ? (
            <div key={it.id} className="vg-context-label">{it.label}</div>
          ) : (
            <button
              key={it.id}
              type="button"
              className="vg-context-item"
              role="menuitem"
              disabled={Boolean(it.disabled)}
              onClick={() => {
                if (it.disabled) return
                if (it.onClick) it.onClick()
                onClose()
              }}
            >
              <span className="vg-context-item-left">{it.label}</span>
              {it.rightText ? <span className="vg-context-item-right">{it.rightText}</span> : null}
            </button>
          )
        ))}
      </div>
    </>
  )
}
