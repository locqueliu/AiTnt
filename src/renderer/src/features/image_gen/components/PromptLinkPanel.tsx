import React, { useMemo, useState } from 'react'
import { Library, ArrowRight, Wand2, Type } from 'lucide-react'
import type { CreativeLibraryMode } from '../../creative_library/types'
import { useCreativeLibraryStore } from '../../creative_library/store'

// 右侧“创意库”面板：展示已有创意，并提供两种一键写入
// - 写入生图提示词（Prompt）
// - 写入优化偏好（用于优化提示词模型）
// 说明：这里不承载编辑能力；编辑/新增在创意库页面完成

export default function PromptLinkPanel(props: {
  mode: CreativeLibraryMode
  onOpenLibrary: () => void
  onApplyPrompt: (text: string) => void
  onApplyOptimizeCustom: (text: string) => void
}) {
  const { mode, onOpenLibrary, onApplyPrompt, onApplyOptimizeCustom } = props

  // UI：在“提示词模板 / 优化偏好模板”之间切换，避免把两类信息混在一起让用户困惑
  const [tab, setTab] = useState<'prompt' | 'optimize'>('prompt')

  const { promptIdeas, optimizeIdeas } = useCreativeLibraryStore()
  const recordUsed = useCreativeLibraryStore(s => s.recordUsed)

  const topIdeas = useMemo(() => {
    const base = (tab === 'prompt' ? promptIdeas : optimizeIdeas)
      .filter(i => i.mode === mode)
      .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.updatedAt - a.updatedAt)
    return base.slice(0, 6)
  }, [promptIdeas, optimizeIdeas, mode, tab])

  return (
    <div className="ig-creative-section">
      <div className="ig-right-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Library size={18} color="#00e5ff" /> 创意库
        </div>
        <button type="button" className="ig-action-btn" onClick={onOpenLibrary} title="打开创意库">
          打开 <ArrowRight size={14} />
        </button>
      </div>

      <div className="ig-creative-tabs" role="tablist" aria-label="创意库模板类型">
        <button
          type="button"
          className={`ig-creative-tab ${tab === 'prompt' ? 'active' : ''}`}
          onClick={() => setTab('prompt')}
          role="tab"
          aria-selected={tab === 'prompt'}
        >
          提示词
        </button>
        <button
          type="button"
          className={`ig-creative-tab ${tab === 'optimize' ? 'active' : ''}`}
          onClick={() => setTab('optimize')}
          role="tab"
          aria-selected={tab === 'optimize'}
        >
          优化偏好
        </button>
      </div>

      {topIdeas.length === 0 ? (
        <div className="ig-creative-empty">
          {tab === 'prompt'
            ? '还没有提示词模板。去创意库点“新增”创建一个吧。'
            : '还没有优化偏好模板。去创意库点“新增偏好”创建一个吧。'}
        </div>
      ) : (
        <div className="ig-creative-list">
          {topIdeas.map(i => (
            <div key={i.id} className="ig-history-item" title={i.kind === 'prompt' ? i.prompt : i.optimizeCustomText}>
              <div className="ig-history-thumb">
                {i.coverKind === 'image' && i.coverValue ? (
                  <img src={i.coverValue} alt="cover" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 18 }}>{(i.coverKind === 'emoji' && i.coverValue) ? i.coverValue : '🧠'}</span>
                )}
              </div>

                <div className="ig-history-info">
                  <span className="title">{i.listTitle || i.title}</span>
                  {tab === 'prompt' ? (
                    <span className="desc">{i.listSubtitle ? i.listSubtitle : `提示词模板 · ${i.category}`}</span>
                  ) : (
                    <span className="desc">{i.listSubtitle ? i.listSubtitle : `优化偏好 · ${i.category}`}</span>
                  )}
                </div>

              <div className="ig-creative-actions">
                {tab === 'prompt' ? (
                  <button
                    type="button"
                    className="ig-icon-btn"
                    title="写入提示词（Prompt）"
                    onClick={() => {
                      recordUsed(i.id)
                      if (i.kind !== 'prompt') return
                      onApplyPrompt(i.prompt)
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
                      recordUsed(i.id)
                      if (i.kind !== 'optimize') return
                      onApplyOptimizeCustom(i.optimizeCustomText)
                    }}
                  >
                    <Wand2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
