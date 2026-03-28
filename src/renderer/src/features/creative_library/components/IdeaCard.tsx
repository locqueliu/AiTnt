import React from 'react'
import { Star, Copy, Wand2, Trash2 } from 'lucide-react'
import type { CreativeIdea, CreativeLibraryMode } from '../types'
import { creativeModeLabel } from '../types'

// 创意卡片：支持一键写入 Prompt / 写入优化偏好

export default function IdeaCard(props: {
  idea: CreativeIdea
  onApplyPrompt: (mode: CreativeLibraryMode, prompt: string) => void
  onApplyOptimizeCustom: (mode: CreativeLibraryMode, text: string) => void
  onToggleFavorite: (id: string) => void
  onDelete: (id: string) => void
  onRecordUsed?: (id: string) => void
}) {
  const { idea, onApplyPrompt, onApplyOptimizeCustom, onToggleFavorite, onDelete, onRecordUsed } = props

  const cover = (
    idea.coverKind === 'image' && idea.coverValue
      ? <img src={idea.coverValue} alt="cover" className="cl-card-cover-img" />
      : <div className="cl-card-cover-emoji">{(idea.coverKind === 'emoji' && idea.coverValue) ? idea.coverValue : '🧠'}</div>
  )

  return (
    <div className="cl-card">
      <div className="cl-card-cover">
        {cover}
      </div>

      <div className="cl-card-top">
        <div className="cl-card-title" title={idea.title}>{idea.title}</div>
        <button
          className={`cl-icon-btn ${idea.favorite ? 'active' : ''}`}
          title={idea.favorite ? '取消收藏' : '收藏'}
          onClick={() => onToggleFavorite(idea.id)}
        >
          <Star size={16} />
        </button>
      </div>

      <div className="cl-card-meta">
        <span className="cl-badge">{creativeModeLabel(idea.mode)}</span>
        <span className="cl-badge cl-badge-muted">{idea.category}</span>
        {Array.isArray(idea.tags) && idea.tags.slice(0, 2).map(t => (
          <span key={t} className="cl-badge cl-badge-muted">{t}</span>
        ))}
      </div>

      <div className="cl-card-body" title={idea.kind === 'prompt' ? idea.prompt : idea.optimizeCustomText}>
        {idea.kind === 'prompt' ? idea.prompt : idea.optimizeCustomText}
      </div>

      <div className="cl-card-actions">
        {idea.kind === 'prompt' ? (
          <button
            className="cl-btn cl-btn-ghost"
            onClick={() => {
              onRecordUsed && onRecordUsed(idea.id)
              onApplyPrompt(idea.mode, idea.prompt)
            }}
            title="写入提示词"
          >
            <Copy size={16} /> 写入提示词
          </button>
        ) : (
          <button
            className="cl-btn cl-btn-ghost"
            onClick={() => {
              onRecordUsed && onRecordUsed(idea.id)
              onApplyOptimizeCustom(idea.mode, idea.optimizeCustomText)
            }}
            title="写入优化偏好"
          >
            <Wand2 size={16} /> 写入优化偏好
          </button>
        )}

        <button className="cl-btn cl-btn-danger" onClick={() => onDelete(idea.id)} title="删除">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}
