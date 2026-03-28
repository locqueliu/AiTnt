import React, { useMemo, useRef, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Image as ImageIcon, X, Trash2, FolderOpen } from 'lucide-react'
import ConfirmModal from './ConfirmModal'
import { uiToast } from '../../ui/toastStore'

export type RefImage = {
  id: string
  dataUrl: string
  base64?: string
  // Original data url (data:image/...;base64,...) used for multimodal optimize.
  // Not persisted; can be rehydrated from local cache file when needed.
  sourceDataUrl?: string
  name: string
  // Local cache url (aitnt://local?path=...).
  localPath?: string
  createdAt?: number
}

function makeId() {
  return `vref_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function likelyImageFile(f: File) {
  const t = String((f as any)?.type || '').toLowerCase()
  if (t.startsWith('image/')) return true
  const n = String(f?.name || '').toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].some(ext => n.endsWith(ext))
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

async function filesToRefImages(files: File[]): Promise<RefImage[]> {
  const out: RefImage[] = []
  for (const f of files) {
    if (!likelyImageFile(f)) continue
    const dataUrl = await readAsDataUrl(f)
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : ''
    if (!base64) continue
    out.push({ id: makeId(), dataUrl, base64, name: f.name || 'image' })
  }
  return out
}

function SortableThumb(props: { img: RefImage, onRemove: () => void }) {
  const { img, onRemove } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : 1,
    boxShadow: isDragging ? '0 14px 40px rgba(0,0,0,0.55)' : undefined,
    zIndex: isDragging ? 2 : 0
  }

  return (
    <div ref={setNodeRef} className="vg-up-thumb" style={style} title={img.name} {...attributes} {...listeners}>
      <img src={img.dataUrl} alt={img.name} draggable={false} />
      <button
        type="button"
        className="vg-up-rm"
        title="绉婚櫎"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <X size={14} />
      </button>
      <div className="vg-up-name">{img.name}</div>
    </div>
  )
}

export function ReferenceImagesPanel(props: {
  value: RefImage[]
  onChange: (next: RefImage[]) => void
  max?: number
  onOpen: () => void
}) {
  const { value, onChange, max = 20, onOpen } = props
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const mini = useMemo(() => value.slice(0, 4), [value])

  const handleAddFiles = async (files: File[]) => {
    if (!files.length) return
    const remain = Math.max(0, max - value.length)
    if (remain <= 0) {
      uiToast('info', `鏈€澶氫笂浼?${max} 寮犲弬鑰冨浘`)
      return
    }

    const picked = files.filter(likelyImageFile).slice(0, remain)
    if (!picked.length) {
      uiToast('info', '鏈瘑鍒埌鍙敤鍥剧墖鏂囦欢')
      return
    }

    try {
      const refs = await filesToRefImages(picked)
      if (!refs.length) {
        uiToast('error', '璇诲彇鍥剧墖澶辫触')
        return
      }
      onChange([...value, ...refs].slice(0, max))
    } catch (e: any) {
      uiToast('error', `璇诲彇鍥剧墖澶辫触锛?{e?.message || '鏈煡閿欒'}`)
    }
  }

  return (
      <div className="vg-panel">
        <div className="vg-block-head">
          <div className="vg-block-title"><ImageIcon size={16} /> 鍙傝€冨浘</div>
          <button type="button" className="vg-mini-btn" onClick={onOpen} disabled={!value.length} title={value.length ? '灞曞紑绠＄悊' : '璇峰厛涓婁紶鍥剧墖'}>
          <FolderOpen size={14} /> 灞曞紑
          </button>
        </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = ''
          await handleAddFiles(files)
        }}
      />

      <div
        className={`vg-up-drop ${dragOver ? 'over' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setDragOver(false)
          const files = Array.from(e.dataTransfer.files || [])
          await handleAddFiles(files)
        }}
        role="button"
        tabIndex={0}
        title="鐐瑰嚮涓婁紶鎴栨嫋鎷藉浘鐗?
      >
        <div className="t">鐐瑰嚮涓婁紶鎴栨嫋鎷藉浘鐗囧埌姝ゅ</div>
        <div className="d">鏈€澶?{max} 寮狅紱椤哄簭浼氬奖鍝嶄紶缁欐ā鍨嬬殑鍙傝€冨浘鏁扮粍</div>
      </div>

      <div className="vg-up-mini">
        <div className="vg-up-count">宸蹭笂浼狅細{value.length}/{max}</div>
        {value.length > 0 && (
          <div className="vg-up-mini-grid">
            {mini.map(img => (
              <div key={img.id} className="vg-up-mini-item" title={img.name}>
                <img src={img.dataUrl} alt={img.name} draggable={false} />
              </div>
            ))}
            {value.length > mini.length && (
              <div className="vg-up-mini-more">+{value.length - mini.length}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ReferenceImagesModal(props: {
  open: boolean
  value: RefImage[]
  onChange: (next: RefImage[]) => void
  onClose: () => void
  max?: number
}) {
  const { open, value, onChange, onClose, max = 20 } = props
  const [activeId, setActiveId] = useState<string | null>(null)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const activeImg = useMemo(() => value.find(x => x.id === activeId) || null, [value, activeId])
  if (!open) return null

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return
    if (active.id === over.id) return
    const oldIndex = value.findIndex(x => x.id === active.id)
    const newIndex = value.findIndex(x => x.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onChange(arrayMove(value, oldIndex, newIndex))
  }

  return (
    <div className="vg-up-modal" onMouseDown={onClose}>
      <div className="vg-up-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="vg-up-modal-head">
          <div className="vg-up-modal-title">鍙傝€冨浘绠＄悊</div>
          <div className="vg-up-modal-actions">
            <button
              type="button"
              className="vg-mini-btn"
              onClick={() => {
                if (!value.length) return
                setConfirmClearOpen(true)
              }}
              disabled={!value.length}
              title="娓呯┖"
            >
              <Trash2 size={14} /> 娓呯┖
            </button>
            <button type="button" className="vg-mini-btn" onClick={onClose} title="鍏抽棴">
              <X size={14} /> 鍏抽棴
            </button>
          </div>
        </div>

        <div className="vg-up-modal-tip">鎷栨嫿缂╃暐鍥捐皟鏁撮『搴忥紙椤哄簭浼氬奖鍝嶅弬鑰冨浘鏁扮粍锛夈€傛渶澶?{max} 寮犮€?/div>

        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={value.map(x => x.id)} strategy={rectSortingStrategy}>
            <div className="vg-up-grid">
              {value.map(img => (
                <SortableThumb
                  key={img.id}
                  img={img}
                  onRemove={() => onChange(value.filter(x => x.id !== img.id))}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeImg ? (
              <div className="vg-up-thumb overlay">
                <img src={activeImg.dataUrl} alt={activeImg.name} draggable={false} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {!value.length && (
          <div className="vg-up-empty">
            <ImageIcon size={40} style={{ opacity: 0.55 }} />
            <div className="t">杩樻病鏈変笂浼犲弬鑰冨浘</div>
            <div className="d">鍏堜笂浼犲浘鐗囧悗鍐嶅睍寮€绠＄悊銆?/div>
          </div>
        )}

        <ConfirmModal
          open={confirmClearOpen}
          title="娓呯┖鍙傝€冨浘"
          message={`纭畾瑕佹竻绌哄凡涓婁紶鐨?${value.length} 寮犲弬鑰冨浘鐗囧悧锛焋}
          confirmText="娓呯┖"
          onCancel={() => setConfirmClearOpen(false)}
          onConfirm={() => {
            onChange([])
            setConfirmClearOpen(false)
          }}
        />
      </div>
    </div>
  )
}

