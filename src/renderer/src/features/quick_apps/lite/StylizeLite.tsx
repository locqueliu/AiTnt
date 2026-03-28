import React from 'react'
import { Copy, FolderOpen, ImagePlus, Wand2 } from 'lucide-react'
import { useSettingsStore } from '../../settings/store'
import { resolveApiKey } from '../../settings/utils/apiKeys'
import { generateImage, type RequestDebug, type ResponseDebug } from '../../../core/api/image'
import { fileToQuickAppInputImage } from '../utils/imageOptimize'
import { useAppLanguage } from '../../i18n'
import { uiTextViewer } from '../../ui/dialogStore'
import { uiToast } from '../../ui/toastStore'
import '../../workstation/workstation.css'

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

function safeFileName(value: string) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'aitnt-stylize'
}

function snapTo64(value: number) {
  return Math.max(64, Math.round(value / 64) * 64)
}

function mapAspectRatioToSize(aspectRatio: string, imageSize: string) {
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

export default function StylizeLite() {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const providers = useSettingsStore((s) => s.providers)
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const appsProviderId = useSettingsStore((s) => s.appsProviderId)
  const autoSaveEnabled = useSettingsStore((s) => s.autoSaveEnabled)
  const outputDirectory = useSettingsStore((s) => s.outputDirectory)

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

  const provider = React.useMemo(() => {
    const providerId = (appsProviderId || activeProviderId || '').trim()
    return providers.find((entry) => entry.id === providerId) || null
  }, [providers, appsProviderId, activeProviderId])

  const apiKey = provider ? resolveApiKey(provider, 'image') : ''
  const imageModel = String(provider?.selectedImageModel || '').trim()
  const workspaceReady = Boolean(provider?.baseUrl?.trim() && apiKey && imageModel)

  const pickFile = async (file?: File | null) => {
    if (!file) return
    try {
      const image = await fileToQuickAppInputImage(file)
      if (!image) {
        uiToast('error', t('无法读取该参考图。', 'Unable to read that reference image.'))
        return
      }
      setSourceImage(image)
    } catch (uploadError: any) {
      uiToast('error', uploadError?.message || t('无法读取该参考图。', 'Unable to read that reference image.'))
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
        saveDir: `${outputDirectory.replace(/[\\/]+$/g, '')}/quick-apps/stylize`,
        fileName: safeFileName(prompt.slice(0, 48))
      })
      if (!result?.success) {
        uiToast('error', result?.error || t('无法保存图片。', 'Unable to save the image.'))
        return
      }

      const localPath = parseLocalPath(result.localPath || '') || result.localPath
      if (localPath && window.aitntAPI?.showItemInFolder) {
        await window.aitntAPI.showItemInFolder({ filePath: localPath })
      }

      uiToast('success', t('图片已保存。', 'Image saved.'))
    } catch (saveError: any) {
      uiToast('error', saveError?.message || t('无法保存图片。', 'Unable to save the image.'))
    }
  }

  const copyResult = async (url: string) => {
    try {
      const result = await window.aitntAPI?.copyImageToClipboard?.({ url })
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
      uiToast('info', t('请先描述目标风格。', 'Describe the target style first.'))
      return
    }

    if (!sourceImage) {
      uiToast('info', t('运行风格重绘前请先添加参考图。', 'Add a source image before running Stylize Remix.'))
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
        image: [String(sourceImage.base64 || '')],
        saveDir: autoSaveEnabled ? `${outputDirectory.replace(/[\\/]+$/g, '')}/quick-apps/stylize` : undefined,
        onRequest: (debug) => setRequestDebug(debug),
        onResponse: (debug) => setResponseDebug(debug)
      })

      setResults(urls)
      uiToast('success', isZh ? `已收到 ${urls.length} 张风格化结果。` : `Received ${urls.length} stylized image result${urls.length === 1 ? '' : 's'}.`)
    } catch (generationError: any) {
      const message = generationError?.message || t('风格重绘失败。', 'Stylize Remix failed.')
      setError(message)
      uiToast('error', t('风格重绘失败。', 'Stylize Remix failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="apps-stack">
      <div className="apps-section-head">
        <div>
          <div className="apps-section-title">{t('风格重绘', 'Stylize Remix')}</div>
          <div className="apps-section-copy">
            {t(
              '把一张参考图重新塑造成新的视觉风格，同时尽量保持原有主体和构图。',
              'Restyle one reference image into a new look while preserving subject and composition.'
            )}
          </div>
        </div>
      </div>

      <div className="ws-grid">
        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('风格输入', 'Style Input')}</div>
              <div className="ws-panel-note">
                {t(
                  '选择目标风格，调整输出比例，然后把任务发送到共享图像供应商。',
                  'Choose the target look, adjust output framing, and send the job to the shared image provider.'
                )}
              </div>
            </div>
            <div className="ws-chip-row">
              <div className="ws-chip">{t('供应商', 'Provider')}: {provider?.name || t('未配置', 'Not configured')}</div>
              <div className="ws-chip">{t('模型', 'Model')}: {imageModel || t('未选择', 'Not selected')}</div>
            </div>
          </div>

          <div className="apps-two-col">
            <div className="ws-field">
              <label className="ws-label">{t('目标风格', 'Target style')}</label>
              <textarea
                className="ws-textarea"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t('描述想要的视觉变化，比如材质、光线、艺术指导、色彩故事和最终质感。', 'Describe the visual transformation: materials, lighting, art direction, color story, and finish.')}
              />
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('参考图片', 'Reference image')}</label>
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
                  <img src={String(sourceImage.dataUrl || '')} alt={String(sourceImage.name || 'reference')} />
                ) : (
                  <div className="ws-upload-cta">
                    <ImagePlus size={22} />
                    <strong>{t('添加参考图', 'Add a reference image')}</strong>
                    <span>{t('点击或拖入一张图片，用来保留原始场景结构。', 'Click or drop an image to keep the original scene structure intact.')}</span>
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
          </div>

          <div className="ws-row">
            <div className="ws-field">
              <label className="ws-label">{t('画幅比例', 'Aspect ratio')}</label>
              <select className="ws-select" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                {['1:1', '3:4', '4:3', '9:16', '16:9'].map((value) => (
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
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn" onClick={() => void handleGenerate()} disabled={busy}>
              <Wand2 size={16} />
              {busy ? t('生成中', 'Generating') : t('执行风格重绘', 'Run Stylize Remix')}
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
              {t('重置', 'Reset')}
            </button>
          </div>

          {!workspaceReady ? (
            <div className="ws-hint">
              <strong>{t('需要先完成供应商设置', 'Provider setup required')}</strong>
              {t('在使用这个应用之前，请先配置图像供应商、API Key 和图像模型。', 'Configure an image provider, API key, and image model before using this app.')}
            </div>
          ) : null}

          {error ? <div className="ws-error">{error}</div> : null}
        </div>

        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('输出结果', 'Outputs')}</div>
              <div className="ws-panel-note">
                {t(
                  '查看最新风格化结果，检查请求载荷，或者保存到本地。',
                  'Review the latest stylized images, inspect request payloads, or save them locally.'
                )}
              </div>
            </div>
            <div className="ws-actions">
              {requestDebug ? (
                <button
                  type="button"
                  className="ws-mini-btn"
                  onClick={() => void uiTextViewer(JSON.stringify(requestDebug, null, 2), { title: t('风格化请求', 'Stylize request'), size: 'lg' })}
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
                      title: t('风格化响应', 'Stylize response'),
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
              <strong>{t('还没有风格化结果', 'No stylized images yet')}</strong>
              {t('在左侧运行一次应用，生成结果就会显示在这里。', 'Run the app on the left and the generated results will appear here.')}
            </div>
          ) : (
            <div className="ws-results">
              {results.map((url, index) => (
                <div key={`${url}_${index}`} className="ws-result-card">
                  <div className="ws-thumb">
                    <img src={url} alt={`stylize_result_${index + 1}`} draggable={false} />
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
      </div>
    </div>
  )
}
