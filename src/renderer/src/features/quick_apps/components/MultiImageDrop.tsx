import React, { useMemo, useRef, useState } from 'react'
import { Image as ImageIcon, Plus, X } from 'lucide-react'
import type { QuickAppInputImage } from '../types'
import { uiToast } from '../../ui/toastStore'
import { fileToQuickAppInputImage } from '../utils/imageOptimize'

function likelyImageFile(f: File) {
  const t = String((f as any)?.type || '').toLowerCase()
  if (t.startsWith('image/')) return true
  const n = String(f?.name || '').toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].some(ext => n.endsWith(ext))
}

async function fileToInputImage(file: File): Promise<QuickAppInputImage | null> {
  return await fileToQuickAppInputImage(file)
}

export default function MultiImageDrop(props: {
  value: QuickAppInputImage[]
  onChange: (next: QuickAppInputImage[]) => void
  disabled?: boolean
  max?: number
  placeholder?: string
}) {
  const { value, onChange, disabled, max, placeholder } = props
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const title = useMemo(() => {
    if (!value || value.length === 0) return '点击上传或拖拽图片到此处'
    return `${value.length} 张图片`
  }, [value])

  const handleFiles = async (files: File[]) => {
    const only = files.filter(likelyImageFile)
    if (only.length === 0) {
      uiToast('info', '未识别到可用图片文件')
      return
    }

    const cap = typeof max === 'number' && max > 0 ? max : undefined
    const remain = cap ? Math.max(0, cap - (value?.length || 0)) : only.length
    if (cap && remain <= 0) {
      uiToast('info', `最多上传 ${cap} 张图片`)
      return
    }

    const take = cap ? only.slice(0, remain) : only
    const out: QuickAppInputImage[] = []
    for (const f of take) {
      try {
        const img = await fileToInputImage(f)
        if (img) out.push(img)
      } catch {
        // ignore
      }
    }

    if (out.length === 0) {
      uiToast('error', '读取图片失败')
      return
    }
    onChange([...(value || []), ...out])
  }

  return (
    <div className={`qa-mimg ${dragOver ? 'over' : ''} ${disabled ? 'disabled' : ''}`} title={title}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = ''
          await handleFiles(files)
        }}
      />

      <div
        className="qa-mimg-drop"
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
        <div className="qa-mimg-ic"><ImageIcon size={18} /></div>
        <div className="qa-mimg-text">
          <div className="t">{placeholder || '上传参考图'}</div>
          <div className="d">点击或拖拽多张图片</div>
        </div>
        <div className="qa-mimg-add"><Plus size={16} /></div>
      </div>

      {value && value.length > 0 ? (
        <div className="qa-mimg-list">
          {value.map((img, idx) => (
            <div key={`${img.name}_${idx}`} className="qa-mimg-item">
              <img src={img.dataUrl} alt={img.name} draggable={false} />
              <button
                type="button"
                className="qa-mimg-rm"
                title="移除"
                aria-label="移除"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  const next = (value || []).slice()
                  next.splice(idx, 1)
                  onChange(next)
                }}
              >
                <X size={14} />
              </button>
              <div className="qa-mimg-name">{img.name}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
