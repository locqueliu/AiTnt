import React from 'react'
import { Copy, FolderOpen, ImagePlus, Settings2, Sparkles, Wand2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { generateImage, type RequestDebug, type ResponseDebug } from '../../core/api/image'
import { useSettingsStore } from '../settings/store'
import { resolveApiKey } from '../settings/utils/apiKeys'
import { fileToQuickAppInputImage } from '../quick_apps/utils/imageOptimize'
import { useAppLanguage } from '../i18n'
import { uiTextViewer } from '../ui/dialogStore'
import { uiToast } from '../ui/toastStore'
import './workstation.css'

type Mode = 't2i' | 'i2i'

function parseLocalPath(url: string): string | null {
  try {
    const parsed = new URL(String(url || ''))
    if (parsed.protocol !== 'aitnt:') return null
    if (parsed.hostname === 'local') return parsed.searchParams.get('path')
    return null
  } catch {
    return null
  }
}

function safeFileName(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'aitnt-image'
}

function snapTo64(value: number): number {
  return Math.max(64, Math.round(value / 64) * 64)
}

function mapAspectRatioToSize(aspectRatio: string, imageSize: string): string {
  const base = imageSize === '4K' ? 2048 : imageSize === '2K' ? 1536 : 1024
  const [wRaw, hRaw] = String(aspectRatio || '1:1')
    .split(':')
    .map((value) => Number.parseFloat(value))

  const widthRatio = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1
  const heightRatio = Number.isFinite(hRaw) && hRaw > 0 ? hRaw : 1

  if (Math.abs(widthRatio - heightRatio) < 0.001) {
    return `${base}x${base}`
  }

  if (widthRatio > heightRatio) {
    return `${base}x${snapTo64((base * heightRatio) / widthRatio)}`
  }

  return `${snapTo64((base * widthRatio) / heightRatio)}x${base}`
}

export default function ImageStudio() {
  const location = useLocation()
  const navigate = useNavigate()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const providers = useSettingsStore((s) => s.providers)
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const imageProviderId = useSettingsStore((s) => s.imageProviderId)
  const setImageProvider = useSettingsStore((s) => s.setImageProvider)
  const autoSaveEnabled = useSettingsStore((s) => s.autoSaveEnabled)
  const outputDirectory = useSettingsStore((s) => s.outputDirectory)

  const [mode, setMode] = React.useState<Mode>('t2i')
  const [prompt, setPrompt] = React.useState('')
  const [aspectRatio, setAspectRatio] = React.useState('1:1')
  const [imageSize, setImageSize] = React.useState('1K')
  const [count, setCount] = React.useState(1)
  const [sourceImage, setSourceImage] = React.useState<any | null>(null)
  const [results, setResults] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [requestDebug, setRequestDebug] = React.useState<RequestDebug | null>(null)
  const [responseDebug, setResponseDebug] = React.useState<ResponseDebug | null>(null)

  React.useEffect(() => {
    try {
      const nextMode = new URLSearchParams(location.search || '').get('mode')
      setMode(nextMode === 'i2i' ? 'i2i' : 't2i')
    } catch {
      setMode('t2i')
    }
  }, [location.search])

  const provider = React.useMemo(() => {
    const providerId = (imageProviderId || activeProviderId || '').trim()
    return providers.find((entry) => entry.id === providerId) || null
  }, [providers, imageProviderId, activeProviderId])

  const apiKey = provider ? resolveApiKey(provider, 'image') : ''
  const imageModel = String(provider?.selectedImageModel || '').trim()
  const workspaceReady = Boolean(provider?.baseUrl?.trim() && apiKey && imageModel)

  const pickFile = async (file?: File | null) => {
    if (!file) return
    try {
      const image = await fileToQuickAppInputImage(file)
      if (!image) {
        uiToast('error', t('无法读取该图片文件。', 'Unable to read that image file.'))
        return
      }
      setSourceImage(image)
    } catch (uploadError: any) {
      uiToast('error', uploadError?.message || t('无法读取该图片文件。', 'Unable to read that image file.'))
    }
  }

  const openResult = async (url: string) => {
    const localPath = parseLocalPath(url)
    if (localPath && window.aitntAPI?.showItemInFolder) {
      await window.aitntAPI.showItemInFolder({ filePath: localPath })
      return
    }

    window.open(url, '_blank')
  }

  const saveResult = async (url: string) => {
    if (!outputDirectory.trim() || !window.aitntAPI?.downloadImage) {
      uiToast('error', t('请先设置图像输出目录，再保存结果。', 'Set an image output directory before saving results.'))
      return
    }

    try {
      const result = await window.aitntAPI.downloadImage({
        url,
        saveDir: outputDirectory,
        fileName: safeFileName(prompt.slice(0, 48))
      })
      if (!result?.success) {
        uiToast('error', result?.error || t('无法保存图片。', 'Unable to save the image.'))
        return
      }

      if (result.localPath && window.aitntAPI?.showItemInFolder) {
        const localPath = parseLocalPath(result.localPath) || result.localPath
        await window.aitntAPI.showItemInFolder({ filePath: localPath })
      }

      uiToast('success', t('图片已保存。', 'Image saved.'))
    } catch (saveError: any) {
      uiToast('error', saveError?.message || t('无法保存图片。', 'Unable to save the image.'))
    }
  }

  const copyResult = async (url: string) => {
    try {
      if (!window.aitntAPI?.copyImageToClipboard) {
        throw new Error(t('剪贴板桥接不可用。', 'Clipboard bridge unavailable.'))
      }
      const result = await window.aitntAPI.copyImageToClipboard({ url })
      if (!result?.success) {
        throw new Error(result?.error || t('复制失败。', 'Copy failed.'))
      }
      uiToast('success', t('图片已复制到剪贴板。', 'Image copied to the clipboard.'))
    } catch (copyError: any) {
      uiToast('error', copyError?.message || t('无法复制图片。', 'Unable to copy the image.'))
    }
  }

  const handleGenerate = async () => {
    if (!workspaceReady || !provider) {
      uiToast('error', t('请先在设置中配置图像供应商和模型。', 'Configure an image provider and model in Settings first.'))
      return
    }

    if (!prompt.trim()) {
      uiToast('info', t('请先输入提示词。', 'Enter a prompt first.'))
      return
    }

    if (mode === 'i2i' && !sourceImage) {
      uiToast('info', t('图生图模式需要先添加源图片。', 'Add a source image for image-to-image mode.'))
      return
    }

    setBusy(true)
    setError('')
    setResults([])

    try {
      const urls = await generateImage({
        baseUrl: provider.baseUrl,
        apiKey,
        model: imageModel,
        prompt: prompt.trim(),
        n: count,
        size: mapAspectRatioToSize(aspectRatio, imageSize),
        aspectRatio,
        imageSize,
        image: mode === 'i2i' && sourceImage ? [String(sourceImage.base64 || '')] : undefined,
        saveDir: autoSaveEnabled ? outputDirectory : undefined,
        onRequest: (debug) => setRequestDebug(debug),
        onResponse: (debug) => setResponseDebug(debug)
      })

      setResults(urls)
      uiToast('success', isZh ? `已收到 ${urls.length} 张图像结果。` : `Received ${urls.length} image result${urls.length === 1 ? '' : 's'}.`)
    } catch (generationError: any) {
      const message = generationError?.message || t('图像生成失败。', 'Image generation failed.')
      setError(message)
      uiToast('error', t('图像生成失败。', 'Image generation failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ws-shell">
      <section className="ws-hero">
        <div className="ws-hero-copy">
          <div className="ws-kicker">
            <Sparkles size={14} />
            <span>{t('AiTnt 图像工作站', 'AiTnt Image Studio')}</span>
          </div>
          <h1 className="ws-title">
            {t('从提示词或参考画面出发，稳定生成干净的图像结果。', 'Build clean image outputs from prompts or reference frames.')}
          </h1>
          <p className="ws-subtitle">
            {t(
              '新的图像工作区把文生图与图生图收纳到同一个聚焦界面中。供应商配置仍然来自统一设置中心，但生成流程已重构为更平静的工作站布局。',
              'The new image workspace keeps text-to-image and image-to-image in one focused surface. Provider configuration still comes from the shared settings center, but the generation flow is rebuilt around a calmer, workstation-style layout.'
            )}
          </p>

          <div className="ws-chip-row">
            <div className="ws-chip">{t('供应商', 'Provider')}: {provider?.name || t('未配置', 'Not configured')}</div>
            <div className="ws-chip">{t('模型', 'Model')}: {imageModel || t('未选择', 'Not selected')}</div>
            <div className="ws-chip">{t('自动保存', 'Auto-save')}: {autoSaveEnabled ? t('开启', 'On') : t('关闭', 'Off')}</div>
          </div>

          <div className="ws-seg">
            <button type="button" className={`ws-seg-btn ${mode === 't2i' ? 'active' : ''}`} onClick={() => setMode('t2i')}>
              {t('文生图', 'Text to image')}
            </button>
            <button type="button" className={`ws-seg-btn ${mode === 'i2i' ? 'active' : ''}`} onClick={() => setMode('i2i')}>
              {t('图生图', 'Image to image')}
            </button>
          </div>
        </div>

        <div className="ws-stat-grid">
          <div className="ws-stat">
            <strong>{workspaceReady ? t('就绪', 'Ready') : t('需要设置', 'Needs setup')}</strong>
            <span>{t('供应商与模型状态', 'Provider and model state')}</span>
          </div>
          <div className="ws-stat">
            <strong>{aspectRatio}</strong>
            <span>{t('当前构图比例', 'Current composition')}</span>
          </div>
          <div className="ws-stat">
            <strong>{imageSize}</strong>
            <span>{t('输出尺寸预设', 'Output scale preset')}</span>
          </div>
        </div>
      </section>

      <section className="ws-grid">
        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('生成设置', 'Generate')}</div>
              <div className="ws-panel-note">
                {t(
                  '在发起图像请求前，先调整提示词、供应商和输出几何参数。',
                  'Adjust the prompt, provider, and output geometry before you run the image request.'
                )}
              </div>
            </div>
            <button type="button" className="ws-btn secondary" onClick={() => navigate('/settings')}>
              <Settings2 size={16} />
              {t('设置', 'Settings')}
            </button>
          </div>

          <div className="ws-row">
            <div className="ws-field">
              <label className="ws-label">{t('供应商', 'Provider')}</label>
              <select
                className="ws-select"
                value={imageProviderId || ''}
                onChange={(event) => setImageProvider(event.target.value ? event.target.value : null)}
              >
                <option value="">{t('跟随当前供应商', 'Follow active provider')}</option>
                {providers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name || entry.baseUrl || entry.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('画幅比例', 'Aspect ratio')}</label>
              <select className="ws-select" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                {['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('尺寸级别', 'Scale')}</label>
              <select className="ws-select" value={imageSize} onChange={(event) => setImageSize(event.target.value)}>
                {['1K', '2K', '4K'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ws-field">
            <label className="ws-label">{t('提示词', 'Prompt')}</label>
            <textarea
              className="ws-textarea"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('描述光线、主体、镜头角度、构图、材质质感和最终氛围。', 'Describe lighting, subject, camera angle, composition, material feel, and the final mood.')}
            />
          </div>

          {mode === 'i2i' ? (
            <div className="ws-field">
              <label className="ws-label">{t('源图片', 'Source image')}</label>
              <div
                className={`ws-upload ${sourceImage ? 'has-image' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  void pickFile(event.dataTransfer.files?.[0] || null)
                }}
              >
                {sourceImage ? (
                  <img src={String(sourceImage.dataUrl || '')} alt={String(sourceImage.name || 'source')} />
                ) : (
                  <div className="ws-upload-cta">
                    <ImagePlus size={22} />
                    <strong>{t('添加参考画面', 'Add a reference frame')}</strong>
                    <span>{t('点击或拖入图片，用来控制构图和主体细节。', 'Click or drop an image to drive composition and subject detail.')}</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  void pickFile(file)
                }}
              />
            </div>
          ) : null}

          <div className="ws-row">
            <div className="ws-field">
              <label className="ws-label">{t('数量', 'Count')}</label>
              <select className="ws-select" value={count} onChange={(event) => setCount(Number(event.target.value) || 1)}>
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('输出路径', 'Output path')}</label>
              <input className="ws-input" value={outputDirectory} readOnly />
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('自动保存', 'Auto-save')}</label>
              <input className="ws-input" value={autoSaveEnabled ? t('已启用', 'Enabled') : t('已关闭', 'Disabled')} readOnly />
            </div>
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn" onClick={() => void handleGenerate()} disabled={busy}>
              <Wand2 size={16} />
              {busy ? t('生成中', 'Generating') : t('生成图像', 'Generate images')}
            </button>
            <button
              type="button"
              className="ws-btn secondary"
              onClick={() => {
                setPrompt('')
                setSourceImage(null)
                setResults([])
                setError('')
              }}
            >
              {t('重置工作区', 'Reset workspace')}
            </button>
          </div>

          {!workspaceReady ? (
            <div className="ws-hint">
              <strong>{t('需要先完成供应商设置', 'Provider setup required')}</strong>
              {t('请先在设置中选择图像供应商、API Key 和图像模型，再运行这个工作区。', 'Select an image provider, API key, and image model in Settings before you run the workspace.')}
            </div>
          ) : null}

          {error ? <div className="ws-error">{error}</div> : null}
        </div>

        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('结果', 'Results')}</div>
              <div className="ws-panel-note">
                {t(
                  '预览最新生成的图片，复制它们，或直接跳转到保存位置。',
                  'Preview the latest images, copy them, or jump to the saved file location.'
                )}
              </div>
            </div>
            <div className="ws-actions">
              {requestDebug ? (
                <button
                  type="button"
                  className="ws-mini-btn"
                  onClick={() => void uiTextViewer(JSON.stringify(requestDebug, null, 2), { title: t('图像请求', 'Image request'), size: 'lg' })}
                >
                  {t('请求', 'Request')}
                </button>
              ) : null}
              {responseDebug ? (
                <button
                  type="button"
                  className="ws-mini-btn"
                  onClick={() =>
                    void uiTextViewer(String(responseDebug.dataFull || responseDebug.dataPreview || ''), {
                      title: t('图像响应', 'Image response'),
                      size: 'lg'
                    })
                  }
                >
                  {t('响应', 'Response')}
                </button>
              ) : null}
            </div>
          </div>

          {results.length === 0 ? (
            <div className="ws-empty">
              <strong>{t('还没有图像结果', 'No images yet')}</strong>
              {t('在左侧运行一次提示词，最新结果就会显示在这里。', 'Run a prompt on the left and the latest images will appear here.')}
            </div>
          ) : (
            <div className="ws-results">
              {results.map((url, index) => (
                <div key={`${url}_${index}`} className="ws-result-card">
                  <div className="ws-thumb">
                    <img src={url} alt={`result_${index + 1}`} draggable={false} />
                  </div>
                  <div className="ws-result-body">
                    <div className="ws-panel-note">{parseLocalPath(url) ? t('已保存到本地', 'Saved locally') : t('远端结果', 'Remote result')}</div>
                    <div className="ws-result-actions">
                      <button type="button" className="ws-mini-btn" onClick={() => void openResult(url)}>
                        <FolderOpen size={14} />
                        {t('打开', 'Open')}
                      </button>
                      <button type="button" className="ws-mini-btn" onClick={() => void saveResult(url)}>
                        <ImagePlus size={14} />
                        {t('保存', 'Save')}
                      </button>
                      <button type="button" className="ws-mini-btn" onClick={() => void copyResult(url)}>
                        <Copy size={14} />
                        {t('复制', 'Copy')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
