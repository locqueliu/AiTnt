import React, { useMemo, useState } from 'react'
import { ArrowLeft, Download, Upload, Plus, Sparkles } from 'lucide-react'
import type { CreativeCategory, CreativeLibraryMode } from './types'
import { useCreativeLibraryStore } from './store'
import { setPendingPromptLink } from './promptLink'
import IdeaCard from './components/IdeaCard'
import PromptIdeaEditorModal from './components/PromptIdeaEditorModal'
import OptimizeIdeaEditorModal from './components/OptimizeIdeaEditorModal'
import './styles/creativeLibrary.css'
import { uiConfirm, uiPrompt } from '../ui/dialogStore'
import { uiToast } from '../ui/toastStore'

// 创意库主页面
// 目标：用户可以沉淀提示词模板；并且能“一键写入”回到文字生图/图像改图/视频

const CATEGORIES: { key: CreativeCategory, label: string }[] = [
  { key: 'all', label: '全部' },
  { key: '人物', label: '人物' },
  { key: '场景', label: '场景' },
  { key: '产品', label: '产品' },
  { key: '艺术', label: '艺术' },
  { key: '工具', label: '工具' },
  { key: '其他', label: '其他' }
]

export default function CreativeLibraryView(props: {
  onBack: () => void
  onSwitchMode: (mode: CreativeLibraryMode) => void
}) {
  const { onBack, onSwitchMode } = props

  const {
    promptIdeas,
    optimizeIdeas,
    activeMode,
    setActiveMode,
    activeCategory,
    setActiveCategory,
    search,
    setSearch,
    addPromptIdea,
    addOptimizeIdea,
    removeIdea,
    toggleFavorite,
    recordUsed,
    exportJson,
    importJson
  } = useCreativeLibraryStore()

  const [tab, setTab] = useState<'prompt' | 'optimize'>('prompt')
  const [isAddPromptOpen, setIsAddPromptOpen] = useState(false)
  const [isAddOptimizeOpen, setIsAddOptimizeOpen] = useState(false)

  const categoryCounts = useMemo(() => {
    const base = new Map<string, number>()
    for (const c of CATEGORIES) base.set(c.key, 0)
    const list = tab === 'prompt' ? promptIdeas : optimizeIdeas
    for (const i of list) {
      if (i.mode !== activeMode) continue
      base.set('all', (base.get('all') || 0) + 1)
      base.set(i.category, (base.get(i.category) || 0) + 1)
    }
    return base
  }, [promptIdeas, optimizeIdeas, activeMode, tab])

  const filtered = useMemo(() => {
    const list = tab === 'prompt' ? promptIdeas : optimizeIdeas
    const q = search.trim().toLowerCase()
    return list
      .filter(i => i.mode === activeMode)
      .filter(i => activeCategory === 'all' ? true : i.category === activeCategory)
      .filter(i => {
        if (!q) return true
        const titleHit = (i.title || '').toLowerCase().includes(q)
        const listTitleHit = (i.listTitle || '').toLowerCase().includes(q)
        const text = (i.kind === 'prompt' ? i.prompt : i.optimizeCustomText) || ''
        return titleHit || listTitleHit || text.toLowerCase().includes(q)
      })
      .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.updatedAt - a.updatedAt)
  }, [promptIdeas, optimizeIdeas, activeMode, activeCategory, search, tab])

  const handleApplyPrompt = (mode: CreativeLibraryMode, prompt: string) => {
    setPendingPromptLink({ mode, target: 'prompt', text: prompt })
    // 记录最近使用：用标题+prompt 的组合无法稳定定位，这里由调用方在卡片层面传 id（后续如果需要更精确可扩展）
    onSwitchMode(mode)
  }

  const handleApplyOptimizeCustom = (mode: CreativeLibraryMode, text: string) => {
    setPendingPromptLink({ mode, target: 'optimize_custom', text })
    onSwitchMode(mode)
  }

  return (
    <div className="cl-layout">
      <div className="cl-top">
          <div className="cl-title">
            <div className="cl-title-main">创意库</div>
            <div className="cl-title-sub">管理和复用你的提示词模板与优化偏好模板</div>
          </div>

        <div className="cl-actions">
          <button
            className="cl-btn cl-btn-ghost"
            onClick={async () => {
              const json = exportJson()
              try {
                if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
                await navigator.clipboard.writeText(json)
                uiToast('success', '已复制到剪贴板（JSON）')
              } catch {
                uiToast('error', '复制失败')
              }
            }}
            title="导出为 JSON（复制到剪贴板）"
          >
            <Download size={16} /> 导出
          </button>

          <button
            className="cl-btn cl-btn-ghost"
            onClick={async () => {
              const json = await uiPrompt('请粘贴要导入的 JSON（将覆盖当前创意库）', { title: '导入 JSON' })
              if (!json) return
              const r = importJson(json)
              if (!r.ok) uiToast('error', `导入失败：${r.error || '未知错误'}`)
              else uiToast('success', '导入成功')
            }}
            title="导入 JSON（覆盖当前库）"
          >
            <Upload size={16} /> 导入
          </button>

          <button
            className="cl-btn cl-btn-ghost"
            onClick={() => uiToast('info', '智能导入：后续支持从文本/文件自动拆分生成创意（开发中）')}
            title="智能导入（开发中）"
          >
            <Sparkles size={16} /> 智能导入
          </button>

          <button
            className={`cl-btn cl-btn-ghost ${tab === 'prompt' ? 'active' : ''}`}
            onClick={() => setTab('prompt')}
            title="查看提示词模板"
          >
            提示词
          </button>

          <button
            className={`cl-btn cl-btn-ghost ${tab === 'optimize' ? 'active' : ''}`}
            onClick={() => setTab('optimize')}
            title="查看优化偏好模板"
          >
            优化偏好
          </button>

          <button className="cl-btn cl-btn-primary" onClick={() => setIsAddPromptOpen(true)}>
            <Plus size={16} /> 新增提示词
          </button>

          <button className="cl-btn cl-btn-primary" onClick={() => setIsAddOptimizeOpen(true)}>
            <Plus size={16} /> 新增偏好
          </button>

          <button className="cl-btn cl-btn-ghost" onClick={onBack}>
            <ArrowLeft size={16} /> 返回
          </button>
        </div>
      </div>

      <div className="cl-body">
        <div className="cl-sidebar">
          <div className="cl-search">
            <input
              className="cl-input"
              placeholder="搜索标题..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="cl-mode">
            <button className={`cl-mode-btn ${activeMode === 't2i' ? 'active' : ''}`} onClick={() => setActiveMode('t2i')}>文字生图</button>
            <button className={`cl-mode-btn ${activeMode === 'i2i' ? 'active' : ''}`} onClick={() => setActiveMode('i2i')}>图像改图</button>
            <button className={`cl-mode-btn ${activeMode === 't2v' ? 'active' : ''}`} onClick={() => setActiveMode('t2v')}>文字生视频</button>
            <button className={`cl-mode-btn ${activeMode === 'i2v' ? 'active' : ''}`} onClick={() => setActiveMode('i2v')}>图生视频</button>
          </div>

          <div className="cl-cats">
            {CATEGORIES.map(c => (
              <div
                key={c.key}
                className={`cl-cat ${activeCategory === c.key ? 'active' : ''}`}
                onClick={() => setActiveCategory(c.key)}
              >
                <span>{c.label}</span>
                <span className="cl-count">{categoryCounts.get(c.key) || 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cl-grid-wrap">
          <div className="cl-grid">
            {filtered.length === 0 ? (
              <div className="cl-empty">
                <div className="cl-empty-title">暂无创意</div>
                <div className="cl-empty-sub">点击右上角“新增提示词 / 新增偏好”添加你的第一个模板</div>
              </div>
            ) : (
              filtered.map(idea => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  onApplyPrompt={handleApplyPrompt}
                  onApplyOptimizeCustom={handleApplyOptimizeCustom}
                  onToggleFavorite={toggleFavorite}
                  onRecordUsed={recordUsed}
                  onDelete={(id) => {
                    uiConfirm('确定要删除该创意吗？', '删除创意').then(ok => {
                      if (!ok) return
                      removeIdea(id)
                    })
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <PromptIdeaEditorModal
        open={isAddPromptOpen}
        mode={activeMode}
        onClose={() => setIsAddPromptOpen(false)}
        onSubmit={(idea) => addPromptIdea(idea)}
      />

      <OptimizeIdeaEditorModal
        open={isAddOptimizeOpen}
        mode={activeMode}
        onClose={() => setIsAddOptimizeOpen(false)}
        onSubmit={(idea) => addOptimizeIdea(idea)}
      />
    </div>
  )
}
