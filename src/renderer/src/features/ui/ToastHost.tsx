import React from 'react'
import { useToastStore } from './toastStore'

export default function ToastHost() {
  const toasts = useToastStore(s => s.toasts)
  const remove = useToastStore(s => s.remove)

  if (!toasts || toasts.length === 0) return null

  return (
    <div className="nx-toast-host" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`nx-toast ${t.kind}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => remove(t.id)}>
          <div className="t">{t.text}</div>
          {t.details ? <pre className="d">{t.details}</pre> : null}
        </div>
      ))}
    </div>
  )
}
