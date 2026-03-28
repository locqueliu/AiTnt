import React from 'react'

export default function ConfirmModal(props: {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const {
    open,
    title = '确认操作',
    message,
    confirmText = '确认',
    cancelText = '取消',
    danger = true,
    onConfirm,
    onCancel
  } = props

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  return (
    <div
      className="vg-modal"
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }}
    >
      <div className="vg-confirm-card" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="vg-confirm-title">{title}</div>
        <div className="vg-confirm-msg">{message}</div>
        <div className="vg-confirm-actions">
          <button type="button" className="vg-mini-btn" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={danger ? 'vg-mini-btn danger' : 'vg-mini-btn'}
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
