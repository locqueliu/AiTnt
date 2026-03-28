import React, { useMemo, useRef, useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import type { QuickAppInputImage } from '../types'
import { uiToast } from '../../ui/toastStore'
import { fileToQuickAppInputImage } from '../utils/imageOptimize'

function likelyImageFile(f: File) {
  const t = String((f as any)?.type || '').toLowerCase()
  if (t.startsWith('image/')) return true
  const n = String(f?.name || '').toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].some(ext => n.endsWith(ext))
}

export default function ImageDrop(props: {
  value: QuickAppInputImage | null
  onChange: (next: QuickAppInputImage | null) => void
  disabled?: boolean
}) {
  const { value, onChange, disabled } = props
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const title = useMemo(() => {
    if (!value) return '点击上传或拖拽图片到此处'
    return value.name
  }, [value])

  const handleFiles = async (files: File[]) => {
    const f = files.find(likelyImageFile)
    if (!f) {
      uiToast('info', '未识别到可用图片文件')
      return
    }
    try {
      const img = await fileToQuickAppInputImage(f)
      if (!img) {
        uiToast('error', '读取图片失败')
        return
      }
      onChange(img)
    } catch (e: any) {
      uiToast('error', `读取图片失败：${e?.message || '未知错误'}`)
    }
  }

  return (
    <div className={`qa-imgdrop ${dragOver ? 'over' : ''} ${disabled ? 'disabled' : ''}`}
      title={title}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (disabled) return
        fileInputRef.current?.click()
      }}
      onDragOver={(e) => {
        if (disabled) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={async (e) => {
        if (disabled) return
        e.preventDefault()
        setDragOver(false)
        await handleFiles(Array.from(e.dataTransfer.files || []))
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = ''
          await handleFiles(files)
        }}
      />

      {!value ? (
        <div className="qa-imgdrop-empty">
          <div className="ic"><ImageIcon size={22} /></div>
          <div className="t">上传参考图</div>
          <div className="d">点击或拖拽一张图片</div>
        </div>
      ) : (
        <div className="qa-imgdrop-full">
          <img className="qa-imgdrop-preview" src={value.dataUrl} alt={value.name} draggable={false} />
          <button
            type="button"
            className="qa-imgdrop-rm"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            title="移除"
            aria-label="移除"
            disabled={disabled}
          >
            <X size={14} />
          </button>
          <div className="qa-imgdrop-name">{value.name}</div>
        </div>
      )}
    </div>
  )
}
