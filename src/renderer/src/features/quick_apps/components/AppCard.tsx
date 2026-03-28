import React from 'react'
import { Info, Star } from 'lucide-react'
import type { QuickAppWorkflow } from '../types'
import { uiTextViewer } from '../../ui/dialogStore'

export default function AppCard(props: {
  app: QuickAppWorkflow
  pinned?: boolean
  onPin?: () => void
  onOpen?: () => void
}) {
  const { app, pinned, onPin, onOpen } = props
  const id = String(app?.meta?.id || '')
  const coverBadge = id === 'product_shot' ? '主图' : id === 'stylize' ? '重绘' : String(app?.meta?.kind || 'App')
  const desc = String(app?.meta?.desc || '').trim()
  return (
    <div className="qa-card" role="button" tabIndex={0} onClick={onOpen}>
      <div className={`qa-card-cover cover-${id}`} aria-hidden="true">
        <div className="qa-card-cover-badge">{coverBadge}</div>
      </div>
      <div className="qa-card-head">
        <div className="qa-card-name">{app.meta.name}</div>
        <button
          type="button"
          className={`qa-card-pin ${pinned ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onPin?.()
          }}
          title={pinned ? '移出已收藏' : '加入已收藏'}
          aria-label={pinned ? '移出已收藏' : '加入已收藏'}
        >
          <Star size={16} />
        </button>
      </div>
      <div className="qa-card-desc" title={desc || ''}>{desc || '快捷工作流'}</div>
      <div className="qa-card-foot">
        <div className="qa-card-cat">{String(app.meta.category || '其他')}</div>

        {desc ? (
          <button
            type="button"
            className="qa-card-detail"
            title="查看详情"
            aria-label="查看详情"
            onClick={(e) => {
              e.stopPropagation()
              const text = [
                `名称：${String(app?.meta?.name || '')}`,
                `分类：${String(app?.meta?.category || '')}`,
                `描述：${desc}`,
                Array.isArray(app?.meta?.keywords) && app.meta.keywords.length
                  ? `关键词：${app.meta.keywords.join('、')}`
                  : ''
              ].filter(Boolean).join('\n')
              void uiTextViewer(text, { title: '应用详情', size: 'md' })
            }}
          >
            <Info size={14} /> 详情
          </button>
        ) : null}
      </div>
    </div>
  )
}
