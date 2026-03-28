import React from 'react'

// 通用开关组件（保持设置页的科技风统一）
export default function Toggle(props: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}) {
  const { checked, onChange, disabled, label } = props

  return (
    <button
      type="button"
      className={`st-toggle ${checked ? 'on' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={label || 'toggle'}
      title={label}
    >
      <span className="st-toggle-knob" />
    </button>
  )
}
