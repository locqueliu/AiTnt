import React from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import { readFileAsDataUrl } from '../utils/readFileAsDataUrl'

// 创意封面选择器：emoji / 上传图片

const EMOJIS = ['🍎', '🌿', '📦', '🎨', '🧰', '👤', '🏙️', '🌙', '✨', '📷', '🧪', '🧊']

export default function CoverPicker(props: {
  coverKind?: 'emoji' | 'image'
  coverValue?: string
  onChange: (next: { coverKind?: 'emoji' | 'image', coverValue?: string }) => void
}) {
  const { coverKind, coverValue, onChange } = props

  return (
    <div className="cl-cover">
      <div className="cl-cover-preview">
        {coverKind === 'image' && coverValue ? (
          <img src={coverValue} alt="cover" className="cl-cover-img" />
        ) : (
          <div className="cl-cover-emoji">{(coverKind === 'emoji' && coverValue) ? coverValue : '🧠'}</div>
        )}
        {(coverKind && coverValue) && (
          <button
            type="button"
            className="cl-cover-clear"
            title="清除封面"
            onClick={() => onChange({ coverKind: undefined, coverValue: undefined })}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="cl-cover-actions">
        <div className="cl-cover-emojis">
          {EMOJIS.map(e => (
            <button
              key={e}
              type="button"
              className={`cl-cover-emoji-btn ${coverKind === 'emoji' && coverValue === e ? 'active' : ''}`}
              onClick={() => onChange({ coverKind: 'emoji', coverValue: e })}
              title="使用 emoji 作为封面"
            >
              {e}
            </button>
          ))}
        </div>

        <label className="cl-cover-upload" title="上传一张小封面（会保存到本地）">
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const dataUrl = await readFileAsDataUrl(file)
              onChange({ coverKind: 'image', coverValue: dataUrl })
              // 允许重复选择同一个文件
              e.currentTarget.value = ''
            }}
          />
          <ImageIcon size={16} /> 上传封面
        </label>
      </div>
    </div>
  )
}
