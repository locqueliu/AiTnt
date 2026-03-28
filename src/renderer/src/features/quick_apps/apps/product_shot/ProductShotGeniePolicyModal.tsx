import React, { useMemo, useState } from 'react'
import { Bot, RotateCcw, X } from 'lucide-react'
import { useGeniePolicy } from './geniePolicy'
import { uiTextViewer } from '../../../ui/dialogStore'

export default function ProductShotGeniePolicyModal(props: {
  open: boolean
  onClose: () => void
}) {
  const { open, onClose } = props
  const { policy, setPolicy, resetPolicy, previewText } = useGeniePolicy()
  const [showPreview, setShowPreview] = useState(false)

  const smallTextLabel = useMemo(() => {
    return policy.smallText === 'keep_unreadable'
      ? '保留但不可读（推荐）'
      : policy.smallText === 'try_readable'
        ? '尽量复刻可读（可能错）'
        : '忽略小字（更干净）'
  }, [policy.smallText])

  if (!open) return null

  return (
    <div className="ps-policy-modal" onMouseDown={onClose}>
      <div className="ps-policy-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ps-policy-head">
          <div className="ps-policy-title"><Bot size={16} /> 精灵策略</div>
          <button className="ps-policy-close" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="ps-policy-body">
          <div className="ps-policy-tip">
            仅影响“提示词精灵生成三角色模板”。不会自动修改已保存模板组，也不会影响已创建任务。
          </div>

          <div className="ps-policy-row">
            <div className="k">小字/吊牌</div>
            <div className="v">
              <select
                className="ps-select"
                value={policy.smallText}
                onChange={(e) => setPolicy(p => ({ ...p, smallText: String(e.target.value) as any }))}
                title={smallTextLabel}
              >
                <option value="keep_unreadable">保留但不可读（推荐）</option>
                <option value="try_readable">尽量复刻可读（可能错）</option>
                <option value="ignore">忽略小字（更干净）</option>
              </select>
            </div>
          </div>

          <div className="ps-policy-row" style={{ marginTop: 10 }}>
            <div className="k">背景策略</div>
            <div className="v">
              <select
                className="ps-select"
                value={policy.background}
                onChange={(e) => setPolicy(p => ({ ...p, background: String(e.target.value) as any }))}
              >
                <option value="solid_lock">纯色锁定优先（推荐）</option>
                <option value="allow_ref">允许背景参考决定背景</option>
              </select>
            </div>
          </div>

          <div className="ps-policy-row" style={{ marginTop: 10 }}>
            <div className="k">默认纯色</div>
            <div className="v" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                className="ps-policy-input"
                value={policy.solidColor}
                onChange={(e) => setPolicy(p => ({ ...p, solidColor: String(e.target.value || '') }))}
                placeholder="#ededed"
                spellCheck={false}
              />
              <div className="ps-policy-swatch" style={{ background: policy.solidColor }} title={policy.solidColor} />
            </div>
          </div>

          <div className="ps-policy-row" style={{ marginTop: 10 }}>
            <div className="k">大Logo转写</div>
            <div className="v">
              <label className="ps-policy-check">
                <input
                  type="checkbox"
                  checked={Boolean(policy.allowLogoTranscribe)}
                  onChange={(e) => setPolicy(p => ({ ...p, allowLogoTranscribe: Boolean(e.target.checked) }))}
                />
                允许在字母非常清晰且用户明确要求可读时转写
              </label>
            </div>
          </div>

          <div className="ps-policy-actions">
            <button className="ps-mini" type="button" onClick={() => setShowPreview(v => !v)}>
              {showPreview ? '隐藏策略文本' : '查看策略文本'}
            </button>
            <button className="ps-mini" type="button" onClick={() => void uiTextViewer(previewText, { title: '策略文本（用于写入精灵 system prompt）', size: 'lg' })}>
              打开大窗口
            </button>
            <button className="ps-mini" type="button" onClick={resetPolicy}>
              <RotateCcw size={14} /> 恢复默认
            </button>
          </div>

          {showPreview ? (
            <pre className="ps-policy-preview">{previewText}</pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}
