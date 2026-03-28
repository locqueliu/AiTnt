import React from 'react'
import type { VideoTask } from '../store'
import { Film, XCircle, Loader2, CheckCircle2 } from 'lucide-react'

export default function VideoTaskGrid(props: {
  tasks: VideoTask[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { tasks, onOpen } = props

  if (!tasks.length) {
    return (
      <div className="vg-canvas">
        <div className="vg-empty">
          <Film size={44} style={{ opacity: 0.6 }} />
          <div className="t">还没有视频任务</div>
          <div className="d">输入提示词并点击“开始”生成视频</div>
        </div>
      </div>
    )
  }

  return (
    <div className="vg-canvas">
      <div className="vg-grid">
        {tasks.map(t => {
          const isRunning = t.status === 'running' || t.status === 'queued'
          const isError = t.status === 'error'
          const isOk = t.status === 'success'
          const canOpen = Boolean(t.url)
          return (
            <div
              key={t.id}
              className={`vg-card ${canOpen ? 'clickable' : ''}`}
              onDoubleClick={() => canOpen && onOpen(t.id)}
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
                  {isRunning ? <Loader2 size={14} className="spin" /> : isOk ? <CheckCircle2 size={14} /> : isError ? <XCircle size={14} /> : null}
                  <span>{t.status}</span>
                </div>

                {isRunning && (
                  <div className="vg-card-progress">
                    <div className="bar" style={{ width: `${Math.max(0, Math.min(100, t.progress || 0))}%` }} />
                  </div>
                )}
              </div>

              <div className="vg-card-meta">
                <div className="p">{t.prompt.slice(0, 38)}{t.prompt.length > 38 ? '...' : ''}</div>
                <div className="m">{t.durationSec}s · {t.aspectRatio}</div>
              </div>

            </div>
          )
        })}
      </div>
    </div>
  )
}
