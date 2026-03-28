import React, { useEffect, useMemo } from 'react'
import { Star, History, Type, Wand2, ArrowRight } from 'lucide-react'
import type { CreativeLibraryMode } from '../../creative_library/types'
import { useCreativeLibraryStore } from '../../creative_library/store'
import { useVideoPromptOpsStore, type VideoPromptHistoryItem } from '../../video_gen/promptOpsStore'

// 右侧“收藏/最近使用”面板（用于图像改图页）
// 说明：之前这里是占位模拟数据，浅色模式下看起来像 bug；现在改为真正展示创意库里的数据

function renderCover(idea: any) {
  if (idea.coverKind === 'image' && idea.coverValue) {
    return <img src={idea.coverValue} alt="cover" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
  }
  if (idea.coverKind === 'emoji' && idea.coverValue) {
    return <span style={{ fontSize: 18 }}>{idea.coverValue}</span>
  }
  return <span style={{ fontSize: 18 }}>🧠</span>
}

function formatTime(ts: number) {
  const t = Number(ts || 0)
  if (!Number.isFinite(t) || t <= 0) return ''
  try {
    const d = new Date(t)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch {
    return ''
  }
}

function firstLine(text: string) {
  const t = String(text || '').trim()
  if (!t) return ''
  return t.split(/\r?\n/)[0].trim()
}

export default function CreativeCollectionsPanel(props: {
  mode: CreativeLibraryMode
  onOpenLibrary: () => void
  onApplyPrompt: (text: string) => void
  onApplyOptimizeCustom: (text: string) => void
}) {
  const { mode, onOpenLibrary, onApplyPrompt, onApplyOptimizeCustom } = props

  const { promptIdeas, optimizeIdeas, recentUsedIds, recordUsed } = useCreativeLibraryStore()

  const ideas = useMemo(() => {
    return [...promptIdeas, ...optimizeIdeas]
  }, [promptIdeas, optimizeIdeas])

  const favorites = useMemo(() => {
    return ideas
      .filter(i => i.mode === mode && i.favorite)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
  }, [ideas, mode])

  const recents = useMemo(() => {
    const map = new Map(ideas.map(i => [i.id, i]))
    const list = recentUsedIds
      .map(id => map.get(id))
      .filter(Boolean)
      .filter(i => (i as any).mode === mode) as any[]
    return list.slice(0, 8)
  }, [ideas, recentUsedIds, mode])

  const isVideoMode = mode === 't2v' || mode === 'i2v'
  const hydrateHistory = useVideoPromptOpsStore(s => s.hydrateHistory)
  const videoPromptHistory = useVideoPromptOpsStore(s => {
    if (mode === 't2v') return s.byMode.t2v.history
    if (mode === 'i2v') return s.byMode.i2v.history
    return [] as VideoPromptHistoryItem[]
  })

  useEffect(() => {
    if (!isVideoMode) return
    hydrateHistory(mode)
  }, [isVideoMode, mode, hydrateHistory])

  const Item = (idea: any) => (
    <div key={idea.id} className="ig-history-item" title={idea.kind === 'prompt' ? idea.prompt : idea.optimizeCustomText}>
      <div className="ig-history-thumb">
        {renderCover(idea)}
      </div>
      <div className="ig-history-info">
        <span className="title">{idea.listTitle || idea.title}</span>
        <span className="desc">{idea.listSubtitle || idea.category}</span>
      </div>
      <div className="ig-creative-actions">
        {idea.kind === 'prompt' ? (
          <button
            type="button"
            className="ig-icon-btn"
            title="写入提示词（Prompt）"
            onClick={() => {
              recordUsed(idea.id)
              onApplyPrompt(idea.prompt)
            }}
          >
            <Type size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="ig-icon-btn"
            title="写入优化偏好"
            onClick={() => {
              recordUsed(idea.id)
              onApplyOptimizeCustom(idea.optimizeCustomText)
            }}
          >
            <Wand2 size={16} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="ig-creative-section">
      <div className="ig-right-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Star size={18} color="#3b82f6" /> 收藏创意
        </div>
        <button type="button" className="ig-action-btn" onClick={onOpenLibrary} title="去创意库管理">
          管理 <ArrowRight size={14} />
        </button>
      </div>

      {favorites.length === 0 ? (
        <div className="ig-creative-empty">暂无收藏。你可以在创意库中点星标收藏常用模板。</div>
      ) : (
        <div className="ig-creative-list">
          {favorites.map(Item)}
        </div>
      )}

      <div className="ig-right-header" style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={18} color="#00e5ff" /> {isVideoMode ? '最近提示词' : '最近使用'}
        </div>
      </div>

      {isVideoMode ? (
        videoPromptHistory.length === 0 ? (
          <div className="ig-creative-empty">暂无历史记录。点击左侧“优化/英文/展开”后会出现在这里。</div>
        ) : (
          <div className="ig-creative-list">
            {videoPromptHistory.map(h => (
              <div key={h.id} className="ig-history-item" title={h.text}>
                <div className="ig-history-thumb">
                  <span style={{ fontSize: 18 }}>{h.op === 'translate' ? 'EN' : '✨'}</span>
                </div>
                <div className="ig-history-info">
                  <span className="title">{firstLine(h.text) || (h.op === 'translate' ? '英文提示词' : '优化结果')}</span>
                  <span className="desc">{`${h.op === 'translate' ? '英文' : '优化'}${formatTime(h.at) ? ` · ${formatTime(h.at)}` : ''}`}</span>
                </div>
                <div className="ig-creative-actions">
                  <button
                    type="button"
                    className="ig-icon-btn"
                    title="写入提示词（Prompt）"
                    onClick={() => onApplyPrompt(String(h.text || ''))}
                  >
                    <Type size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : recents.length === 0 ? (
        <div className="ig-creative-empty">暂无最近使用记录。点右侧按钮写入一次就会出现在这里。</div>
      ) : (
        <div className="ig-creative-list">
          {recents.map(Item)}
        </div>
      )}

      {isVideoMode && recents.length > 0 ? (
        <>
          <div className="ig-right-header" style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={18} color="#00e5ff" /> 创意库最近使用
            </div>
          </div>
          <div className="ig-creative-list">
            {recents.map(Item)}
          </div>
        </>
      ) : null}
    </div>
  )
}
