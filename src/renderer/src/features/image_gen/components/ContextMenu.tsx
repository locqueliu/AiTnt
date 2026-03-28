import React, { useEffect, useRef } from 'react'

// 轻量右键菜单（桌面风格）：用于画布“新建文件夹”等操作
// 说明：
// - 不依赖外部 UI 库，便于在 Electron/React 内稳定使用
// - 只负责渲染与关闭逻辑；具体菜单项由调用方传入

export type ContextMenuItem = {
  id: string
  kind?: 'item' | 'separator' | 'label'
  label?: string
  rightText?: string
  disabled?: boolean
  onClick?: () => void
}

export default function ContextMenu(props: {
  open: boolean
  x: number
  y: number
  items: ContextMenuItem[]
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

    // pointerdown 覆盖面更广（部分组件会阻止 mousedown 冒泡）
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
      {/* 透明遮罩：确保左键点空白一定能关闭菜单 */}
      <div
        className="ig-context-backdrop"
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
        className="ig-context-menu"
        style={{ left: x, top: y }}
        role="menu"
        onContextMenu={(e) => {
          // 避免在菜单上再次右键弹系统菜单
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {items.map(it => (
          it.kind === 'separator' ? (
            <div key={it.id} className="ig-context-sep" role="separator" />
          ) : it.kind === 'label' ? (
            <div key={it.id} className="ig-context-label">{it.label}</div>
          ) : (
            <button
              key={it.id}
              type="button"
              className="ig-context-item"
              role="menuitem"
              disabled={Boolean(it.disabled)}
              onClick={() => {
                if (it.disabled) return
                if (it.onClick) it.onClick()
                onClose()
              }}
            >
              <span className="ig-context-item-left">{it.label}</span>
              {it.rightText ? <span className="ig-context-item-right">{it.rightText}</span> : null}
            </button>
          )
        ))}
      </div>
    </>
  )
}
