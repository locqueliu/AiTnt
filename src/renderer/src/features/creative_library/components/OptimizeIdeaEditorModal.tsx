import React, { useMemo, useState } from 'react'
import type { CreativeOptimizeIdea, CreativeLibraryMode } from '../types'
import { creativeModeLabel } from '../types'
import CoverPicker from './CoverPicker'

// 新增优化偏好模板（写入“优化偏好-自定义偏好”）

export default function OptimizeIdeaEditorModal(props: {
  open: boolean
  mode: CreativeLibraryMode
  onClose: () => void
  onSubmit: (idea: Omit<CreativeOptimizeIdea, 'id' | 'createdAt' | 'updatedAt'>) => void
}) {
  const { open, mode, onClose, onSubmit } = props

  const [title, setTitle] = useState('')
  const [listTitle, setListTitle] = useState('')
  const [listSubtitle, setListSubtitle] = useState('')
  const [category, setCategory] = useState<'人物' | '场景' | '产品' | '艺术' | '工具' | '其他'>('其他')
  const [optimizeCustomText, setOptimizeCustomText] = useState('')
  const [tags, setTags] = useState('')
  const [coverKind, setCoverKind] = useState<'emoji' | 'image' | undefined>(undefined)
  const [coverValue, setCoverValue] = useState<string | undefined>(undefined)

  const canSubmit = useMemo(() => Boolean(title.trim() && optimizeCustomText.trim()), [title, optimizeCustomText])

  if (!open) return null

  return (
    <div className="cl-modal" onClick={onClose}>
      <div className="cl-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <div className="cl-modal-title">新增优化偏好模板（{creativeModeLabel(mode)}）</div>
          <button className="cl-btn cl-btn-ghost" onClick={onClose}>关闭</button>
        </div>

        <div className="cl-form">
          <div className="cl-field cl-field-span2">
            <div className="cl-label">封面（可选）</div>
            <CoverPicker
              coverKind={coverKind}
              coverValue={coverValue}
              onChange={(next) => {
                setCoverKind(next.coverKind)
                setCoverValue(next.coverValue)
              }}
            />
          </div>

          <div className="cl-field">
            <div className="cl-label">标题</div>
            <input className="cl-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：更电影感、更强对比" />
          </div>

          <div className="cl-field">
            <div className="cl-label">列表标题（可选）</div>
            <input className="cl-input" value={listTitle} onChange={(e) => setListTitle(e.target.value)} placeholder="用于快捷列表展示（不填则用标题）" />
          </div>

          <div className="cl-field">
            <div className="cl-label">分类</div>
            <select className="cl-input" value={category} onChange={(e) => setCategory(e.target.value as any)}>
              <option value="人物">人物</option>
              <option value="场景">场景</option>
              <option value="产品">产品</option>
              <option value="艺术">艺术</option>
              <option value="工具">工具</option>
              <option value="其他">其他</option>
            </select>
          </div>

          <div className="cl-field">
            <div className="cl-label">列表说明（可选）</div>
            <input className="cl-input" value={listSubtitle} onChange={(e) => setListSubtitle(e.target.value)} placeholder="例如：不加水印 · 细节清晰" />
          </div>

          <div className="cl-field cl-field-span2">
            <div className="cl-label">优化偏好（写入“自定义偏好”）</div>
            <textarea className="cl-textarea" value={optimizeCustomText} onChange={(e) => setOptimizeCustomText(e.target.value)} placeholder="例如：更梦幻、更强对比、强调质感、避免文字水印..." />
          </div>

          <div className="cl-field cl-field-span2">
            <div className="cl-label">标签（可选，用逗号分隔）</div>
            <input className="cl-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="电影感, 对比强, 质感" />
          </div>
        </div>

        <div className="cl-modal-actions">
          <button className="cl-btn cl-btn-ghost" onClick={onClose}>取消</button>
          <button
            className="cl-btn cl-btn-primary"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return
              onSubmit({
                mode,
                kind: 'optimize',
                title: title.trim(),
                category,
                listTitle: listTitle.trim() ? listTitle.trim() : undefined,
                listSubtitle: listSubtitle.trim() ? listSubtitle.trim() : undefined,
                coverKind,
                coverValue,
                optimizeCustomText: optimizeCustomText.trim(),
                tags: tags.split(',').map(s => s.trim()).filter(Boolean),
                favorite: false
              })
              onClose()
              setTitle('')
              setListTitle('')
              setListSubtitle('')
              setCategory('其他')
              setOptimizeCustomText('')
              setTags('')
              setCoverKind(undefined)
              setCoverValue(undefined)
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
