import React from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Check, Sparkles, X } from 'lucide-react'
import { shortText } from '../utils/stacking'

// 自动叠放模式下的“卡片组件”
// 说明：
// - 必须放在独立文件（模块级组件），避免在父组件 render 时重新定义导致 React 认为组件类型变化，产生反复卸载/挂载 -> 图片闪烁

export function AutoManualFolderCard(props: {
  id: string
  name: string
  count: number
  coverUrl?: string
  hideNameEnabled: boolean
  onOpen: () => void
  dragging: boolean
}) {
  const { id, name, count, coverUrl, hideNameEnabled, onOpen, dragging } = props
  const { isOver, setNodeRef } = useDroppable({ id: `mf:${id}` })
  const displayName = name || '文件夹'

  return (
    <div className="ig-result-wrapper">
      <div
        ref={setNodeRef}
        className="ig-result-card ig-folder-card"
        onDoubleClick={onOpen}
        title={displayName}
      >
        <div className="ig-folder-badge">{count}</div>
        {dragging && (
          <div className={`ig-folder-drop show ${isOver ? 'over' : ''}`}>放入文件夹</div>
        )}
        {coverUrl ? (
          <img src={coverUrl} alt="folder" className="ig-result-img" />
        ) : (
          <div className="ig-folder-empty">
            <div className="t">{shortText(displayName, 18) || '文件夹'}</div>
          </div>
        )}
        <div className="ig-folder-overlay">
          <div className="ig-folder-title">{shortText(displayName, 18) || '文件夹'}</div>
        </div>
      </div>
      {!hideNameEnabled && (
        <div className="ig-result-prompt" title={displayName}>{shortText(displayName, 42)}</div>
      )}
    </div>
  )
}

export function AutoDraggableTaskCard(props: {
  task: {
    id: string
    status: 'loading' | 'success' | 'error'
    url?: string
    errorMsg?: string
    prompt: string
  }
  selected: boolean
  hideNameEnabled: boolean
  onDelete: () => void
  onOpenPreview: () => void
  onSelect: (e: React.MouseEvent) => void
  onPatch: (patch: { actualSize?: string, status?: 'error', errorMsg?: string }) => void
}) {
  const { task, selected, hideNameEnabled, onDelete, onOpenPreview, onSelect, onPatch } = props
  const canDrag = Boolean(task.status === 'success' && task.url)
  const dnd = useDraggable({ id: `task:${task.id}`, disabled: !canDrag })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(dnd.transform),
    transition: dnd.isDragging ? 'none' : 'transform 120ms ease',
    opacity: dnd.isDragging ? 0.65 : 1
  }

  return (
    <div
      ref={dnd.setNodeRef}
      style={style}
      className={dnd.isDragging ? 'ig-dnd-dragging' : ''}
      {...dnd.attributes}
      {...dnd.listeners}
    >
      <div
        className="ig-result-wrapper"
        data-select-task={task.status === 'success' && task.url ? task.id : undefined}
      >
        <div className={`ig-result-card ${selected ? 'ig-selected' : ''}`}>
          <div
            className="ig-result-card-delete"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            title="删除此任务"
          >
            <X size={14} />
          </div>

          {selected && task.status === 'success' && task.url && (
            <div className="ig-selected-check" aria-label="已选中">
              <Check size={14} />
            </div>
          )}

          {task.status === 'loading' && (
            <div className="ig-skeleton">
              <Sparkles size={24} className="spin-icon" />
              <span style={{ fontSize: '0.8rem' }}>生成中...</span>
            </div>
          )}
          {task.status === 'error' && (
            <div style={{ color: '#ff4d4f', padding: '16px', textAlign: 'center', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              生成失败<br /><br />{task.errorMsg}
            </div>
          )}
          {task.status === 'success' && task.url && (
            <img
              src={task.url}
              alt="Generated"
              className="ig-result-img"
              onClick={onSelect}
              onDoubleClick={onOpenPreview}
              onLoad={(e) => {
                const img = e.currentTarget
                const actual = `${img.naturalWidth}x${img.naturalHeight}`
                onPatch({ actualSize: actual })
              }}
              onError={() => {
                const src = task.url ? String(task.url) : ''
                const briefSrc = src.length > 80 ? `${src.slice(0, 40)}...${src.slice(-35)}` : src
                onPatch({ status: 'error', errorMsg: `图片加载失败（src=${briefSrc || '空'}）` })
              }}
            />
          )}
        </div>
        {!hideNameEnabled && (
          <div className="ig-result-prompt" title={task.prompt}>
            {task.prompt}
          </div>
        )}
      </div>
    </div>
  )
}
