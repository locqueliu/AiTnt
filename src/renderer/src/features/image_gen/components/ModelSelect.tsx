import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Cpu } from 'lucide-react'

interface ModelSelectProps {
  label: string
  value: string
  placeholder: string
  icon?: React.ReactNode
  models: string[]          // 从 settings 传入的可用模型列表
  onSelect: (model: string) => void // 用户选中后的回调
}

// 独立的模型选择器组件
export default function ModelSelect({ label, value, placeholder, icon = <Cpu size={14} />, models, onSelect }: ModelSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击组件外部自动关闭下拉菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [containerRef])

  // 去除“搜索模型”功能：模型选择只做列表展示；用户主要通过“常用模型预设”快速切换
  const listModels = models

  return (
    <div className="ig-model-group" ref={containerRef} style={{ position: 'relative' }}>
      <div className="ig-model-label">
        {label}
      </div>
      <div 
        className="ig-model-select-box" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderColor: isOpen ? '#00e5ff' : '' }}
      >
        <div className="ig-model-select-value" title={value || placeholder}>
          <span className="ig-model-select-icon">{icon}</span>
          <span style={{ color: value ? '#fff' : '#8e94a8', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value || placeholder}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8e94a8' }}>
          <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {isOpen && (
        <div className="ig-model-dropdown">
          {listModels.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#8e94a8', fontSize: '0.8rem' }}>
              暂无模型列表。<br/>请先在设置中刷新模型，然后固定常用模型。
            </div>
          ) : (
            listModels.map(m => (
              <div 
                key={m} 
                className={`ig-model-item ${m === value ? 'selected' : ''}`}
                onClick={() => {
                  onSelect(m)
                  setIsOpen(false)
                }}
              >
                {m}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
