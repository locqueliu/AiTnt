import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Image as ImageIcon, Film, Plus, Minus, Sparkles, Trash2, Library as LibraryIcon, X } from 'lucide-react'
import type { VideoGenMode } from '../VideoGen'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../../settings/store'
import { resolveApiKey } from '../../settings/utils/apiKeys'
import CompactModelPicker from '../../image_gen/components/CompactModelPicker'
import OptimizeSystemPromptEditor from '../../image_gen/components/OptimizeSystemPromptEditor'
import VideoDesktopGrid from '../components/desktop/VideoDesktopGrid'
import VideoPreviewModal from '../components/VideoPreviewModal'
import ConfirmModal from '../components/ConfirmModal'
import { useVideoGenStore } from '../store'
import { ReferenceImagesModal, type RefImage } from '../components/ReferenceImages'
import PromptLinkPanel from '../../image_gen/components/PromptLinkPanel'
import CreativeCollectionsPanel from '../../image_gen/components/CreativeCollectionsPanel'
import { takePendingPromptLink } from '../../creative_library/promptLink'
import { useCreativeLibraryStore } from '../../creative_library/store'
import { loadVideoUiPersisted, saveVideoUiPersisted } from '../utils/persistUi'
import { uiToast } from '../../ui/toastStore'
import { kvGetJsonMigrate, kvSetJson } from '../../../core/persist/kvClient'
import { useVideoPromptOpsStore } from '../promptOpsStore'
import { uiTextEditor } from '../../ui/dialogStore'

const MAX_INPUT_IMAGES = 20
const I2V_INPUT_MANIFEST_KEY = 'aitnt-video-i2v-input-manifest:v1'

type InputManifestItem = { id: string, name: string, localPath: string, createdAt: number }

function makeRefId() {
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
    out.push({ id: makeRefId(), dataUrl, base64, sourceDataUrl: dataUrl, name: f.name || 'image', createdAt: Date.now() })
  }
  return out
}

function isDataUrl(s: string) {
  return /^data:/i.test(String(s || ''))
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

async function srcToDataUrl(src: string): Promise<string> {
  const s = String(src || '').trim()
  if (!s) throw new Error('missing src')
  if (isDataUrl(s)) return s
  const resp = await fetch(s)
  if (!resp.ok) throw new Error(`璇诲彇缂撳瓨鍥剧墖澶辫触锛?{resp.status}`)
  const blob = await resp.blob()
  return await blobToDataUrl(blob)
}

export default function ImageToVideo(props: { onSwitchMode: (mode: VideoGenMode) => void }) {
  const { onSwitchMode } = props

  const navigate = useNavigate()
  const setLibraryMode = useCreativeLibraryStore(s => s.setActiveMode)

  const { providers, activeProviderId, videoProviderId, updateProvider, videoOutputDirectory, videoAutoSaveEnabled } = useSettingsStore()
  const providerId = videoProviderId || activeProviderId
  const activeProvider = providers.find(p => p.id === providerId)

  const tasks = useVideoGenStore(s => s.tasks)
  const clearTasksByMode = useVideoGenStore(s => s.clearTasksByMode)
  const deleteTask = useVideoGenStore(s => s.deleteTask)
  const deleteTasks = useVideoGenStore(s => s.deleteTasks)
  const enqueueBatch = useVideoGenStore(s => s.enqueueBatch)

  const i2vTasks = useMemo(() => tasks.filter(t => t.mode === 'i2v'), [tasks])

  const availableModels = activeProvider?.models || []
  const currentVideoModel = activeProvider?.selectedVideoModel || ''
  const currentPromptModel = activeProvider?.selectedPromptModel || ''
  const currentTranslateModel = (activeProvider as any)?.selectedTranslateModel || currentPromptModel
  const pinnedVideoModels = activeProvider?.pinnedVideoModels || []
  const pinnedPromptModels = activeProvider?.pinnedPromptModels || []

  const defaults = useMemo(() => ({
    prompt: '',
    durationSec: 5,
    aspectRatio: '16:9' as const,
    batchCount: 1,
    enhancePrompt: false,
    enableUpsample: false
  }), [])

  const [prompt, setPrompt] = useState(defaults.prompt)
  const [durationSec, setDurationSec] = useState(defaults.durationSec)
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>(defaults.aspectRatio)
  const [batchCount, setBatchCount] = useState(defaults.batchCount)

  const [optimizePreference, setOptimizePreference] = useState('')
  const [injectOptimizeCustomText, setInjectOptimizeCustomText] = useState('')
  const busyOp = useVideoPromptOpsStore(s => s.byMode.i2v.busy)
  const lastResult = useVideoPromptOpsStore(s => s.byMode.i2v.lastResult)
  const startOptimize = useVideoPromptOpsStore(s => s.optimize)
  const startTranslate = useVideoPromptOpsStore(s => s.translate)
  const hydrateHistory = useVideoPromptOpsStore(s => s.hydrateHistory)
  const lastAppliedAtRef = useRef(0)

  useEffect(() => {
    hydrateHistory('i2v')
  }, [hydrateHistory])

  const isVeoModel = useMemo(() => /^\s*veo/i.test(currentVideoModel), [currentVideoModel])
  const hasCjk = useMemo(() => /[\u4e00-\u9fff]/.test(prompt), [prompt])
  const [enhancePrompt, setEnhancePrompt] = useState(defaults.enhancePrompt)
  const [enableUpsample, setEnableUpsample] = useState(defaults.enableUpsample)

  const [veoOptionsOpen, setVeoOptionsOpen] = useState(false)

  const [uiHydrated, setUiHydrated] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await loadVideoUiPersisted('i2v', defaults)
        if (!alive) return
        setPrompt(s.prompt)
        setDurationSec(s.durationSec)
        setAspectRatio(s.aspectRatio)
        setBatchCount(s.batchCount)
        setEnhancePrompt(s.enhancePrompt)
        setEnableUpsample(s.enableUpsample)
      } finally {
        if (alive) setUiHydrated(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [defaults])

  // persist UI (i2v) - excludes reference images
  useEffect(() => {
    if (!uiHydrated) return
    const t = window.setTimeout(() => {
      void saveVideoUiPersisted('i2v', { prompt, durationSec, aspectRatio, batchCount, enhancePrompt, enableUpsample })
    }, 360)
    return () => window.clearTimeout(t)
  }, [uiHydrated, prompt, durationSec, aspectRatio, batchCount, enhancePrompt, enableUpsample])

  // Apply prompt updates from background ops (survive navigation)
  useEffect(() => {
    if (!lastResult) return
    const at = Number(lastResult.at || 0)
    if (!Number.isFinite(at) || at <= 0) return
    if (at <= lastAppliedAtRef.current) return
    lastAppliedAtRef.current = at
    setPrompt(String(lastResult.text || ''))
  }, [lastResult])

  const [inputImages, setInputImages] = useState<RefImage[]>([])
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [inputHydrated, setInputHydrated] = useState(false)

  // hydrate cached input images (persisted manifest)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const items = await kvGetJsonMigrate<InputManifestItem[]>(I2V_INPUT_MANIFEST_KEY, [])
        if (!alive) return
        const next: RefImage[] = (items || [])
          .filter(x => x && x.id && x.localPath)
          .slice(0, MAX_INPUT_IMAGES)
          .map(x => ({
            id: String(x.id),
            name: String(x.name || 'image'),
            dataUrl: String(x.localPath),
            localPath: String(x.localPath),
            createdAt: Number(x.createdAt || Date.now())
          }))
        setInputImages(next)
      } catch {
        // ignore
      } finally {
        if (alive) setInputHydrated(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // persist manifest (only local cached items)
  useEffect(() => {
    if (!inputHydrated) return
    const items: InputManifestItem[] = inputImages
      .map(x => ({
        id: String(x.id || ''),
        name: String(x.name || 'image'),
        localPath: String(x.localPath || x.dataUrl || ''),
        createdAt: Number(x.createdAt || Date.now())
      }))
      .filter(x => x.id && x.localPath && /^aitnt:\/\//i.test(x.localPath))
      .slice(0, MAX_INPUT_IMAGES)
    void kvSetJson(I2V_INPUT_MANIFEST_KEY, items)
  }, [inputHydrated, inputImages])

  const pickFile = () => {
    fileInputRef.current?.click()
  }

  const ensureImageData = async (img: RefImage): Promise<RefImage> => {
    if (img.base64 && img.sourceDataUrl && isDataUrl(img.sourceDataUrl)) return img

    const previewSrc = String(img.localPath || img.dataUrl || '')
    const dataUrl = img.sourceDataUrl && isDataUrl(img.sourceDataUrl)
      ? img.sourceDataUrl
      : await srcToDataUrl(previewSrc)
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : ''
    return {
      ...img,
      sourceDataUrl: dataUrl,
      base64: base64 || img.base64
    }
  }

  const removeCachedFile = async (img: RefImage) => {
    const api = (window as any).aitntAPI
    const localPath = String(img.localPath || '')
    if (!api?.removeInputImageCacheFile || !localPath) return
    try {
      await api.removeInputImageCacheFile({ localPath })
    } catch {
      // ignore
    }
  }

  const clearAllInputImages = async () => {
    const list = [...inputImages]
    setInputImages([])
    // best-effort delete cached files
    await Promise.all(list.map(removeCachedFile))
    try {
      await kvSetJson(I2V_INPUT_MANIFEST_KEY, [])
    } catch {
      // ignore
    }
  }

  const addFiles = async (fileList: FileList | File[] | null | undefined) => {
    const files = Array.from(fileList || [])
    if (!files.length) return

    const remain = Math.max(0, MAX_INPUT_IMAGES - inputImages.length)
    if (remain <= 0) {
      uiToast('info', `鏈€澶氫笂浼?${MAX_INPUT_IMAGES} 寮犲弬鑰冨浘`)
      return
    }

    const picked = files.filter(likelyImageFile).slice(0, remain)
    if (!picked.length) {
      uiToast('info', '鏈瘑鍒埌鍙敤鍥剧墖鏂囦欢')
      return
    }

    try {
      const api = (window as any).aitntAPI
      const refs = await filesToRefImages(picked)
      if (!refs.length) {
        uiToast('error', '璇诲彇鍥剧墖澶辫触')
        return
      }

      const out: RefImage[] = []
      for (const r of refs) {
        const src = String(r.sourceDataUrl || r.dataUrl || '')
        if (api?.downloadImage && isDataUrl(src)) {
          try {
            const saved = await api.downloadImage({ url: src, saveDir: 'cache/input-images/i2v', fileName: `i2v_ref_${r.id}` })
            const localPath = String(saved?.localPath || '')
            if (saved?.success && localPath) {
              out.push({ ...r, dataUrl: localPath, localPath })
              continue
            }
          } catch {
            // ignore
          }
        }

        // Fallback: keep in-memory only (not persisted)
        out.push(r)
      }

      setInputImages(prev => [...prev, ...out].slice(0, MAX_INPUT_IMAGES))
    } catch (err: any) {
      uiToast('error', err?.message || '璇诲彇鍥剧墖澶辫触')
    }
  }

  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null)
  const previewTask = useMemo(() => i2vTasks.find(t => t.id === previewTaskId) || null, [i2vTasks, previewTaskId])

  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  // 浠庡垱鎰忓簱杩斿洖鍚庯紝涓€娆℃€у啓鍏?Prompt / 浼樺寲鍋忓ソ
  useEffect(() => {
    const pending = takePendingPromptLink('i2v')
    if (!pending) return
    if (pending.target === 'prompt') {
      setPrompt(pending.text)
    } else {
      setInjectOptimizeCustomText(pending.text)
    }
  }, [])

  const handleOptimize = () => {
    if (!prompt.trim()) return
    if (!activeProvider) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閫夋嫨鎴栭厤缃?API 缃戠珯')
      return
    }
    const promptApiKey = resolveApiKey(activeProvider, 'prompt')
    if (!promptApiKey) {
      uiToast('error', '璇峰厛鍦ㄨ缃腑閰嶇疆鈥滀紭鍖?Key鈥')
      return
    }
    if (!currentPromptModel) {
      uiToast('info', '璇峰厛閫夋嫨鐢ㄤ簬鈥滀紭鍖栤€濈殑鎻愮ず璇嶆ā鍨')
      return
    }

    startOptimize({
      mode: 'i2v',
      baseUrl: activeProvider.baseUrl,
      apiKey: promptApiKey,
      model: currentPromptModel,
      prompt,
      preference: optimizePreference,
      refImages: inputImages,
      fallbackUi: defaults
    })
  }

  const handleTranslate = () => {
    if (!prompt.trim()) return
    if (!activeProvider) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閫夋嫨鎴栭厤缃?API 缃戠珯')
      return
    }
    const translateApiKey = resolveApiKey(activeProvider, 'translate')
    if (!translateApiKey) {
      uiToast('error', '璇峰厛鍦ㄨ缃腑閰嶇疆鈥滅炕璇?Key鈥')
      return
    }
    if (!currentTranslateModel) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閫夋嫨鈥滄彁绀鸿瘝缈昏瘧妯″瀷鈥')
      return
    }

    startTranslate({
      mode: 'i2v',
      baseUrl: activeProvider.baseUrl,
      apiKey: translateApiKey,
      model: currentTranslateModel,
      prompt,
      preference: optimizePreference,
      fallbackUi: defaults
    })
  }

  const handleGenerate = async () => {
    if (!inputImages.length) {
      uiToast('info', '璇峰厛涓婁紶鍙傝€冨浘鐗')
      return
    }
    if (!prompt.trim()) {
      uiToast('info', '璇峰厛杈撳叆鎻愮ず璇')
      return
    }
    if (!activeProvider || !providerId) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閫夋嫨鎴栭厤缃?API 缃戠珯')
      return
    }
    if (!currentVideoModel) {
      uiToast('info', '璇峰厛閫夋嫨鐢熻棰戞ā鍨')
      return
    }

    const videoApiKey = resolveApiKey(activeProvider, 'video')
    if (!videoApiKey) {
      uiToast('error', '璇峰厛鍦ㄨ缃腑閰嶇疆鈥滆棰?Key鈥')
      return
    }

    if (isVeoModel && hasCjk && !enhancePrompt) {
      uiToast('info', '褰撳墠 Veo 妯″瀷閫氬父鍙敮鎸佽嫳鏂囨彁绀鸿瘝銆傝鍏堟妸鎻愮ず璇嶇炕璇戜负鑻辨枃锛屾垨寮€鍚€滃寮烘彁绀鸿瘝锛堣嫳鏂囷級鈥濄€')
      return
    }

    const ensured = await Promise.all(inputImages.map(ensureImageData))
    setInputImages(ensured)
    if (ensured.some(x => !String(x.base64 || '').trim())) {
      uiToast('error', '鍙傝€冨浘璇诲彇澶辫触锛岃閲嶆柊涓婁紶')
      return
    }

    enqueueBatch({
      mode: 'i2v',
      providerId,
      baseUrl: activeProvider.baseUrl,
      apiKey: videoApiKey,
      model: currentVideoModel,
      prompt,
      durationSec,
      aspectRatio,
      batchCount,
      enhancePrompt,
      enableUpsample,
      inputImagesBase64: ensured.map(x => String(x.base64 || '')),
      inputImageNames: ensured.map(x => String(x.name || 'image')),
      autoSaveDir: videoAutoSaveEnabled ? videoOutputDirectory : undefined
    })
  }

  return (
    <div className="vg-layout">
      <div className="vg-left">
        <div className="vg-panel">
          <div className="vg-block-head">
            <div className="vg-block-title"><ImageIcon size={16} /> 鍙傝€冨浘</div>
            <div className="vg-block-actions">
              <button
                type="button"
                className="vg-mini-btn"
                onClick={() => void clearAllInputImages()}
                disabled={inputImages.length === 0}
                title="娓呯┖"
              >
                娓呯┖
              </button>
              <button
                type="button"
                className="vg-mini-btn"
                onClick={() => {
                  if (inputImages.length === 0) {
                    pickFile()
                    return
                  }
                  setIsGalleryOpen(true)
                }}
                title={inputImages.length === 0 ? '涓婁紶鍥剧墖' : '灞曞紑绠＄悊'}
              >
                灞曞紑
              </button>
            </div>
          </div>

          <div
            className="ig-upload-area"
            onClick={pickFile}
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(false)
            }}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              setDragOver(false)
              await addFiles(e.dataTransfer?.files || [])
            }}
            style={{
              borderColor: dragOver ? 'rgba(0, 229, 255, 0.55)' : undefined,
              color: dragOver ? '#00e5ff' : undefined
            }}
            title={`鐐瑰嚮閫夋嫨鍥剧墖锛屾垨鎷栨嫿鍥剧墖鍒版鍖哄煙锛堟渶澶?${MAX_INPUT_IMAGES} 寮狅級`}
          >
            {inputImages.length > 0 ? (
              <div className="ig-upload-scroll" onClick={(e) => e.stopPropagation()}>
                {inputImages.length < MAX_INPUT_IMAGES && (
                  <button
                    type="button"
                    className="ig-upload-plus"
                    onClick={(e) => {
                      e.stopPropagation()
                      pickFile()
                    }}
                    title="缁х画娣诲姞鍥剧墖"
                  >
                    <Plus size={18} />
                    娣诲姞
                  </button>
                )}

                {inputImages.map((img, idx) => (
                  <div key={img.id || `${img.name}_${idx}`} className="ig-upload-thumb" title={img.name}>
                    <img src={img.dataUrl} alt={img.name} />
                    <button
                      type="button"
                      className="ig-upload-remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        void removeCachedFile(img)
                        setInputImages(prev => prev.filter((_, i) => i !== idx))
                      }}
                      title="绉婚櫎"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <Plus size={32} />
                <span style={{ marginTop: 8, fontSize: '0.9rem' }}>涓婁紶鍥剧墖</span>
                <span style={{ fontSize: '0.75rem', marginTop: 4 }}>鍙嫋鎷藉浘鐗囧埌姝ゅ尯鍩燂紙鏈€澶?{MAX_INPUT_IMAGES} 寮狅級</span>
              </>
            )}

            {inputImages.length > 0 && (
              <div className="ig-upload-count">{inputImages.length}/{MAX_INPUT_IMAGES}</div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={async (e) => {
                try {
                  await addFiles(e.target.files || [])
                } finally {
                  e.target.value = ''
                }
              }}
            />
          </div>
        </div>

        <div className="vg-panel">
          <div className="vg-block-head">
            <div className="vg-block-title"><Film size={16} /> 鍙傛暟閰嶇疆锛堣棰戯級</div>
          </div>

          <div className="vg-field">
            <div className="vg-label">鏃堕暱</div>
            <div className="vg-pill-row">
              {[3, 5, 8, 10].map(s => (
                <button key={s} className={`vg-pill ${durationSec === s ? 'active' : ''}`} onClick={() => setDurationSec(s)} type="button">{s}s</button>
              ))}
            </div>
          </div>

          <div className="vg-field">
            <div className="vg-label">鐢诲箙</div>
            <div className="vg-pill-row">
              {(['16:9', '9:16'] as const).map(r => (
                <button key={r} className={`vg-pill ${aspectRatio === r ? 'active' : ''}`} onClick={() => setAspectRatio(r)} type="button">{r}</button>
              ))}
            </div>
          </div>

          {/* 娓呮櫚搴︿笉鍦ㄨ繖閲岃缃細鐢辨ā鍨嬪喅瀹氾紙濡?*-4k锛?*/}
        </div>

        <div className="vg-panel">
          <div className="vg-block-head">
            <div className="vg-block-title">鎻愮ず璇?/div>
            <div className="vg-block-actions">
              <button
                type="button"
                className="vg-mini-btn"
                onClick={async () => {
                  const next = await uiTextEditor(String(prompt || ''), {
                    title: '缂栬緫鎻愮ず璇',
                    message: '鏀寔澶氳锛涘簲鐢ㄥ悗浼氳鐩栧綋鍓嶆彁绀鸿瘝',
                    size: 'lg',
                    okText: '搴旂敤',
                    cancelText: '鍙栨秷'
                  })
                  if (next == null) return
                  setPrompt(next)
                }}
                disabled={busyOp !== null}
                title="灞曞紑缂栬緫"
              >
                灞曞紑
              </button>
              <button
                type="button"
                className="vg-mini-btn"
                onClick={() => setPrompt('')}
                disabled={busyOp !== null || !prompt.trim()}
                title="娓呯┖鎻愮ず璇?
              >
                娓呯┖
              </button>
              <button
                type="button"
                className="vg-mini-btn"
                onClick={handleOptimize}
                disabled={busyOp !== null || !prompt.trim()}
                title="鐢ㄦ彁绀鸿瘝妯″瀷浼樺寲"
              >
                {busyOp === 'optimize' ? '浼樺寲涓?..' : '浼樺寲'}
              </button>
              {isVeoModel && (
                <button
                  type="button"
                  className="vg-mini-btn"
                  onClick={handleTranslate}
                  disabled={busyOp !== null || !prompt.trim()}
                  title="缈昏瘧/鏀瑰啓涓鸿嫳鏂囷紙Veo 甯哥敤锛?
                >
                  {busyOp === 'translate' ? '缈昏瘧涓?..' : '鑻辨枃'}
                </button>
              )}
            </div>
          </div>
          <textarea className="vg-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="鎻忚堪浣犳兂浠庡弬鑰冨浘婕斿寲鍑虹殑瑙嗛..." />
          {isVeoModel && hasCjk && (
            <div className="vg-muted" style={{ marginTop: 8 }}>
              鎻愮ず锛歏eo 閫氬父鍙敮鎸佽嫳鏂?prompt銆傚彲鐐瑰彸涓娾€滆嫳鏂団€濅竴閿炕璇戯紝鎴栧紑鍚笅鏂光€滃寮烘彁绀鸿瘝锛堣嫳鏂囷級鈥濄€?            </div>
          )}
        </div>

        {isVeoModel && (
          <div className="vg-panel">
            <div className="vg-block-head">
              <div className="vg-block-title">Veo 閫夐」</div>
              <button
                type="button"
                className="vg-mini-btn"
                onClick={() => setVeoOptionsOpen(v => !v)}
                aria-expanded={veoOptionsOpen}
              >
                {veoOptionsOpen ? '鏀惰捣' : '灞曞紑'}
              </button>
            </div>

            {veoOptionsOpen ? (
              <>
                <div className="vg-field">
                  <div className="vg-label">澧炲己鎻愮ず璇嶏紙鑻辨枃锛?/div>
                  <div className="vg-pill-row">
                    <button type="button" className={`vg-pill ${enhancePrompt ? 'active' : ''}`} onClick={() => setEnhancePrompt(v => !v)}>
                      {enhancePrompt ? '寮€鍚' : '鍏抽棴'}
                    </button>
                  </div>
                  <div className="vg-muted" style={{ marginTop: 6 }}>
                    閮ㄥ垎涓浆缃戝叧浼氬湪寮€鍚悗鎶婁腑鏂囪嚜鍔ㄨ浆鎴愯嫳鏂囧苟澧炲己鎻忚堪銆?                  </div>
                </div>
                <div className="vg-field">
                  <div className="vg-label">鍚敤涓婇噰鏍?/div>
                  <div className="vg-pill-row">
                    <button type="button" className={`vg-pill ${enableUpsample ? 'active' : ''}`} onClick={() => setEnableUpsample(v => !v)}>
                      {enableUpsample ? '寮€鍚' : '鍏抽棴'}
                    </button>
                  </div>
                  <div className="vg-muted" style={{ marginTop: 6 }}>
                    杩斿洖鏇撮珮鍒嗚鲸鐜囷紙濡?1080p锛夈€傛煇浜涙ā鍨?鎺ュ彛鍙兘涓嶆敮鎸併€?                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        <OptimizeSystemPromptEditor
          providerId={providerId}
          scopeKey="video"
          onPreferenceChange={(v) => setOptimizePreference(v)}
          injectCustomText={injectOptimizeCustomText}
          onInjectedCustomTextConsumed={() => setInjectOptimizeCustomText('')}
        />

        <div className="vg-panel" style={{ marginTop: 'auto' }}>
          <CompactModelPicker
            label="鐢熻棰戞ā鍨?
            value={currentVideoModel}
            placeholder="閫夋嫨瑙嗛妯″瀷..."
            icon={<Film size={14} />}
            pinned={pinnedVideoModels}
            models={availableModels}
            onSelect={(m: string) => {
              if (!providerId) return
              updateProvider(providerId, { selectedVideoModel: m })
            }}
          />

          <CompactModelPicker
            label="鎻愮ず璇嶄紭鍖栨ā鍨?
            value={currentPromptModel}
            placeholder="閫夋嫨浼樺寲妯″瀷..."
            icon={<LibraryIcon size={14} />}
            pinned={pinnedPromptModels}
            models={availableModels}
            onSelect={(m: string) => {
              if (!providerId) return
              updateProvider(providerId, { selectedPromptModel: m })
            }}
          />
        </div>
      </div>

      <div className="vg-center">
        <div className="vg-top-tabs" role="tablist">
          <button className="vg-tab" type="button" onClick={() => onSwitchMode('t2v')}><Film size={16} /> 鏂囧瓧鐢熻棰?/button>
          <button className="vg-tab active" type="button"><ImageIcon size={16} /> 鍥剧敓瑙嗛</button>
        </div>

        <VideoDesktopGrid
          mode="i2v"
          tasks={i2vTasks}
          outputDirectory={videoOutputDirectory}
          onOpen={(id) => setPreviewTaskId(id)}
          onDeleteTasks={(ids) => deleteTasks(ids)}
        />

        <div className="vg-bottom-bar">
          <div className="vg-batch">
            <button type="button" className="vg-batch-btn" onClick={() => setBatchCount(v => Math.max(1, v - 1))}><Minus size={14} /></button>
            <div className="vg-batch-val">{batchCount}</div>
            <button type="button" className="vg-batch-btn" onClick={() => setBatchCount(v => Math.min(6, v + 1))}><Plus size={14} /></button>
          </div>

          <button
            type="button"
            className="vg-ghost"
            onClick={() => {
              if (!i2vTasks.length) return
              setConfirmClearOpen(true)
            }}
            disabled={!i2vTasks.length}
            title="娓呯┖瑙嗛浠诲姟"
          >
            <Trash2 size={16} /> 娓呯┖
          </button>

          <button type="button" className="vg-primary" onClick={() => void handleGenerate()} title={inputImages.length === 0 ? '璇峰厛涓婁紶鍙傝€冨浘鐗? : (!prompt.trim() ? '璇峰厛杈撳叆鎻愮ず璇? : '')}>
            <Sparkles size={16} /> 寮€濮?          </button>
        </div>
      </div>

      <div className="vg-right">
        <PromptLinkPanel
          mode="i2v"
          onOpenLibrary={() => {
            setLibraryMode('i2v')
            navigate('/library?mode=i2v', { state: { from: '/video?mode=i2v' } })
          }}
          onApplyPrompt={(text) => setPrompt(text)}
          onApplyOptimizeCustom={(text) => setInjectOptimizeCustomText(text)}
        />

        <CreativeCollectionsPanel
          mode="i2v"
          onOpenLibrary={() => {
            setLibraryMode('i2v')
            navigate('/library?mode=i2v', { state: { from: '/video?mode=i2v' } })
          }}
          onApplyPrompt={(text) => setPrompt(text)}
          onApplyOptimizeCustom={(text) => setInjectOptimizeCustomText(text)}
        />
      </div>

      <ReferenceImagesModal
        open={isGalleryOpen}
        value={inputImages}
        onChange={setInputImages}
        onClose={() => setIsGalleryOpen(false)}
        max={MAX_INPUT_IMAGES}
      />

      <VideoPreviewModal
        open={Boolean(previewTask)}
        task={previewTask}
        outputDirectory={videoOutputDirectory}
        onClose={() => setPreviewTaskId(null)}
        onDelete={(id) => {
          deleteTask(id)
          setPreviewTaskId(null)
        }}
      />

      <ConfirmModal
        open={confirmClearOpen}
        title="娓呯┖浠诲姟"
        message="纭畾瑕佹竻绌烘墍鏈夎棰戜换鍔″悧锛熸鎿嶄綔浼氬垹闄ゅ綋鍓嶆ā寮忎笅鐨勪换鍔″垪琛ㄣ€?
        confirmText="娓呯┖"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          clearTasksByMode('i2v')
          setConfirmClearOpen(false)
        }}
      />
    </div>
  )
}

