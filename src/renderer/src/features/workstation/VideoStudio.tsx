import React from 'react'
import {
  Clapperboard,
  Download,
  FolderOpen,
  ImagePlus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
  XCircle
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../settings/store'
import { resolveApiKey } from '../settings/utils/apiKeys'
import { fileToQuickAppInputImage } from '../quick_apps/utils/imageOptimize'
import { useVideoGenStore, type VideoTask } from '../video_gen/store'
import { useAppLanguage } from '../i18n'
import { uiTextViewer } from '../ui/dialogStore'
import { uiToast } from '../ui/toastStore'
import './workstation.css'

type Mode = 't2v' | 'i2v'

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
    .slice(0, 80) || 'aitnt-video'
}

function statusTone(status: VideoTask['status']) {
  if (status === 'success') return 'ok'
  if (status === 'running' || status === 'queued') return 'run'
  if (status === 'error') return 'err'
  return 'idle'
}

function statusLabel(status: VideoTask['status'], isZh: boolean) {
  if (status === 'queued') return isZh ? '排队中' : 'Queued'
  if (status === 'running') return isZh ? '进行中' : 'Running'
  if (status === 'success') return isZh ? '已完成' : 'Ready'
  if (status === 'error') return isZh ? '错误' : 'Error'
  if (status === 'canceled') return isZh ? '已取消' : 'Canceled'
  return isZh ? '空闲' : 'Idle'
}

export default function VideoStudio() {
  const location = useLocation()
  const navigate = useNavigate()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const providers = useSettingsStore((s) => s.providers)
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const videoProviderId = useSettingsStore((s) => s.videoProviderId)
  const setVideoProvider = useSettingsStore((s) => s.setVideoProvider)
  const videoAutoSaveEnabled = useSettingsStore((s) => s.videoAutoSaveEnabled)
  const videoOutputDirectory = useSettingsStore((s) => s.videoOutputDirectory)

  const tasks = useVideoGenStore((s) => s.tasks)
  const responseFullById = useVideoGenStore((s) => s.responseFullById)
  const enqueueBatch = useVideoGenStore((s) => s.enqueueBatch)
  const pollOnce = useVideoGenStore((s) => s.pollOnce)
  const cancelTask = useVideoGenStore((s) => s.cancelTask)
  const deleteTask = useVideoGenStore((s) => s.deleteTask)
  const clearTasks = useVideoGenStore((s) => s.clearTasks)

  const [mode, setMode] = React.useState<Mode>('t2v')
  const [prompt, setPrompt] = React.useState('')
  const [durationSec, setDurationSec] = React.useState(5)
  const [aspectRatio, setAspectRatio] = React.useState('16:9')
  const [resolution, setResolution] = React.useState('720p')
  const [fps, setFps] = React.useState(24)
  const [count, setCount] = React.useState(1)
  const [enhancePrompt, setEnhancePrompt] = React.useState(true)
  const [enableUpsample, setEnableUpsample] = React.useState(false)
  const [sourceImage, setSourceImage] = React.useState<any | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    try {
      const nextMode = new URLSearchParams(location.search || '').get('mode')
      setMode(nextMode === 'i2v' ? 'i2v' : 't2v')
    } catch {
      setMode('t2v')
    }
  }, [location.search])

  const provider = React.useMemo(() => {
    const providerId = (videoProviderId || activeProviderId || '').trim()
    return providers.find((entry) => entry.id === providerId) || null
  }, [providers, videoProviderId, activeProviderId])

  const apiKey = provider ? resolveApiKey(provider, 'video') : ''
  const videoModel = String(provider?.selectedVideoModel || '').trim()
  const workspaceReady = Boolean(provider?.baseUrl?.trim() && apiKey && videoModel)

  const visibleTasks = React.useMemo(
    () => tasks.slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)),
    [tasks]
  )

  const pickFile = async (file?: File | null) => {
    if (!file) return
    try {
      const image = await fileToQuickAppInputImage(file)
      if (!image) {
        uiToast('error', t('无法读取该参考图。', 'Unable to read that reference image.'))
        return
      }
      setSourceImage(image)
    } catch (error: any) {
      uiToast('error', error?.message || t('无法读取该参考图。', 'Unable to read that reference image.'))
    }
  }

  const openVideo = async (url: string) => {
    const localPath = parseLocalPath(url)
    if (localPath && window.aitntAPI?.showItemInFolder) {
      await window.aitntAPI.showItemInFolder({ filePath: localPath })
      return
    }

    window.open(url, '_blank')
  }

  const saveVideo = async (url: string) => {
    if (!videoOutputDirectory.trim() || !window.aitntAPI?.downloadVideo) {
      uiToast('error', t('请先设置视频输出目录，再执行保存。', 'Set a video output directory before saving.'))
      return
    }

    try {
      const result = await window.aitntAPI.downloadVideo({
        url,
        saveDir: videoOutputDirectory,
        fileName: safeFileName(prompt.slice(0, 48))
      })
      if (!result?.success) {
        uiToast('error', result?.error || t('无法保存视频。', 'Unable to save the video.'))
        return
      }

      const localPath = parseLocalPath(result.localPath || '') || result.localPath
      if (localPath && window.aitntAPI?.showItemInFolder) {
        await window.aitntAPI.showItemInFolder({ filePath: localPath })
      }

      uiToast('success', t('视频已保存。', 'Video saved.'))
    } catch (error: any) {
      uiToast('error', error?.message || t('无法保存视频。', 'Unable to save the video.'))
    }
  }

  const handleGenerate = async () => {
    if (!workspaceReady || !provider) {
      uiToast('error', t('请先在设置中配置视频供应商和模型。', 'Configure a video provider and model in Settings first.'))
      return
    }

    if (!prompt.trim()) {
      uiToast('info', t('请先输入提示词。', 'Enter a prompt first.'))
      return
    }

    if (mode === 'i2v' && !sourceImage) {
      uiToast('info', t('图生视频模式需要先添加源图片。', 'Add a source image for image-to-video mode.'))
      return
    }

    setBusy(true)
    try {
      enqueueBatch({
        mode,
        providerId: provider.id,
        baseUrl: provider.baseUrl,
        apiKey,
        model: videoModel,
        prompt: prompt.trim(),
        durationSec,
        aspectRatio,
        resolution,
        fps,
        batchCount: count,
        inputImagesBase64: mode === 'i2v' && sourceImage ? [String(sourceImage.base64 || '')] : undefined,
        inputImageNames: mode === 'i2v' && sourceImage ? [String(sourceImage.name || 'reference')] : undefined,
        autoSaveDir: videoAutoSaveEnabled ? videoOutputDirectory : undefined,
        enhancePrompt,
        enableUpsample
      })
      uiToast('success', isZh ? `已加入 ${count} 个视频任务。` : `Queued ${count} video task${count === 1 ? '' : 's'}.`)
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
            <span>{t('AiTnt 视频工作站', 'AiTnt Video Studio')}</span>
          </div>
          <h1 className="ws-title">
            {t('在一个聚焦任务台中排队生成更具电影感的视频结果。', 'Queue cinematic video generations with one focused task desk.')}
          </h1>
          <p className="ws-subtitle">
            {t(
              '重构后的视频工作区保留了异步轮询、提示控制、参考图支持和本地导出能力，但整体流程更干净、更像工作站。',
              'The rebuilt video workspace keeps async task polling, prompt controls, reference-image support, and local export, but presents them in a cleaner workstation flow.'
            )}
          </p>

          <div className="ws-chip-row">
            <div className="ws-chip">{t('供应商', 'Provider')}: {provider?.name || t('未配置', 'Not configured')}</div>
            <div className="ws-chip">{t('模型', 'Model')}: {videoModel || t('未选择', 'Not selected')}</div>
            <div className="ws-chip">{t('自动保存', 'Auto-save')}: {videoAutoSaveEnabled ? t('开启', 'On') : t('关闭', 'Off')}</div>
          </div>

          <div className="ws-seg">
            <button type="button" className={`ws-seg-btn ${mode === 't2v' ? 'active' : ''}`} onClick={() => setMode('t2v')}>
              {t('文生视频', 'Text to video')}
            </button>
            <button type="button" className={`ws-seg-btn ${mode === 'i2v' ? 'active' : ''}`} onClick={() => setMode('i2v')}>
              {t('图生视频', 'Image to video')}
            </button>
          </div>
        </div>

        <div className="ws-stat-grid">
          <div className="ws-stat">
            <strong>{workspaceReady ? t('就绪', 'Ready') : t('需要设置', 'Needs setup')}</strong>
            <span>{t('供应商与视频模型状态', 'Provider and video model state')}</span>
          </div>
          <div className="ws-stat">
            <strong>{visibleTasks.length}</strong>
            <span>{t('已保存视频任务', 'Stored video tasks')}</span>
          </div>
          <div className="ws-stat">
            <strong>{durationSec}s</strong>
            <span>{t('当前时长预设', 'Current duration preset')}</span>
          </div>
        </div>
      </section>

      <section className="ws-grid">
        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('任务队列', 'Queue Tasks')}</div>
              <div className="ws-panel-note">
                {t(
                  '在提交批量任务前，先配置供应商、提示词、时长和可选参考图。',
                  'Configure provider, prompt, timing, and optional reference input before dispatching the batch.'
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
                value={videoProviderId || ''}
                onChange={(event) => setVideoProvider(event.target.value ? event.target.value : null)}
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
                {['16:9', '9:16', '1:1', '4:3', '3:4'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('分辨率', 'Resolution')}</label>
              <select className="ws-select" value={resolution} onChange={(event) => setResolution(event.target.value)}>
                {['480p', '720p', '1080p'].map((value) => (
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
              placeholder={t('描述运动、镜头、节奏、氛围、主体行为以及你想要的成片质感。', 'Describe motion, framing, pacing, atmosphere, subject behavior, and the finish you want in the clip.')}
            />
          </div>

          {mode === 'i2v' ? (
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
                    <strong>{t('添加源画面', 'Add a source frame')}</strong>
                    <span>{t('点击或拖入图片，用来固定构图和主体连贯性。', 'Click or drop an image to anchor composition and subject continuity.')}</span>
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
              <label className="ws-label">{t('时长', 'Duration')}</label>
              <select className="ws-select" value={durationSec} onChange={(event) => setDurationSec(Number(event.target.value) || 5)}>
                {[4, 5, 6, 8, 10].map((value) => (
                  <option key={value} value={value}>
                    {value}s
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-field">
              <label className="ws-label">FPS</label>
              <select className="ws-select" value={fps} onChange={(event) => setFps(Number(event.target.value) || 24)}>
                {[16, 24, 30].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('批次数量', 'Batch count')}</label>
              <select className="ws-select" value={count} onChange={(event) => setCount(Number(event.target.value) || 1)}>
                {[1, 2, 3].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ws-row">
            <div className="ws-field">
              <label className="ws-label">{t('提示增强', 'Prompt assist')}</label>
              <input className="ws-input" value={enhancePrompt ? t('已启用', 'Enabled') : t('已关闭', 'Disabled')} readOnly />
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('超分增强', 'Upsample')}</label>
              <input className="ws-input" value={enableUpsample ? t('已启用', 'Enabled') : t('已关闭', 'Disabled')} readOnly />
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('保存路径', 'Save path')}</label>
              <input className="ws-input" value={videoOutputDirectory} readOnly />
            </div>
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn secondary" onClick={() => setEnhancePrompt((value) => !value)}>
              {enhancePrompt ? t('关闭提示增强', 'Disable prompt assist') : t('开启提示增强', 'Enable prompt assist')}
            </button>
            <button type="button" className="ws-btn secondary" onClick={() => setEnableUpsample((value) => !value)}>
              {enableUpsample ? t('关闭超分增强', 'Disable upsample') : t('开启超分增强', 'Enable upsample')}
            </button>
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn" onClick={() => void handleGenerate()} disabled={busy}>
              <Wand2 size={16} />
              {busy ? t('排队中', 'Queueing') : t('加入视频任务', 'Queue video tasks')}
            </button>
            <button
              type="button"
              className="ws-btn secondary"
              onClick={() => {
                setPrompt('')
                setSourceImage(null)
              }}
            >
              {t('重置表单', 'Reset form')}
            </button>
          </div>

          {!workspaceReady ? (
            <div className="ws-hint">
              <strong>{t('需要先完成供应商设置', 'Provider setup required')}</strong>
              {t('请先在设置中选择视频供应商、API Key 和视频模型，再分发任务。', 'Select a video provider, API key, and video model in Settings before dispatching tasks.')}
            </div>
          ) : null}
        </div>

        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('任务台', 'Task Desk')}</div>
              <div className="ws-panel-note">
                {t(
                  '监控排队中的生成任务，检查调试载荷，并导出已完成的视频。',
                  'Monitor queued generations, inspect debug payloads, and export completed clips.'
                )}
              </div>
            </div>
            <div className="ws-actions">
              <button type="button" className="ws-mini-btn" onClick={() => clearTasks()}>
                <Trash2 size={14} />
                {t('清空', 'Clear')}
              </button>
            </div>
          </div>

          {visibleTasks.length === 0 ? (
            <div className="ws-empty">
              <strong>{t('还没有视频任务', 'No video tasks yet')}</strong>
              {t('在左侧排队一次提示词，生成中的视频就会显示在这里。', 'Queue a prompt on the left and the generated clips will show up here.')}
            </div>
          ) : (
            <div className="ws-mini-list">
              {visibleTasks.map((task) => (
                <div key={task.id} className="ws-video-card">
                  {task.url ? (
                    <div className="ws-video">
                      <video src={task.url} controls preload="metadata" />
                    </div>
                  ) : (
                    <div className="ws-video ws-video-placeholder">
                      <div className="ws-upload-cta">
                        <Clapperboard size={24} />
                        <strong>{statusLabel(task.status, isZh)}</strong>
                        <span>{task.prompt}</span>
                      </div>
                    </div>
                  )}

                  <div className="ws-video-body">
                    <div className="ws-mini-top">
                      <div>
                        <div className="ws-mini-title">{task.prompt}</div>
                        <div className="ws-mini-sub">
                          {task.mode === 'i2v' ? t('图生视频', 'Image to video') : t('文生视频', 'Text to video')} / {task.aspectRatio} / {task.durationSec}s
                        </div>
                      </div>
                      <div className={`ws-status ${statusTone(task.status)}`}>{statusLabel(task.status, isZh)}</div>
                    </div>

                    <div className="ws-progress">
                      <div className="ws-progress-bar" style={{ width: `${Math.max(5, Math.min(100, Number(task.progress || 0)))}%` }} />
                    </div>

                    {task.errorMsg ? <div className="ws-error">{task.errorMsg}</div> : null}

                    <div className="ws-video-actions">
                      {task.url ? (
                        <>
                          <button type="button" className="ws-mini-btn" onClick={() => void openVideo(task.url!)}>
                            <FolderOpen size={14} />
                            {t('打开', 'Open')}
                          </button>
                          {!parseLocalPath(task.url) ? (
                            <button type="button" className="ws-mini-btn" onClick={() => void saveVideo(task.url!)}>
                              <Download size={14} />
                              {t('保存', 'Save')}
                            </button>
                          ) : null}
                        </>
                      ) : null}

                      {(task.status === 'queued' || task.status === 'running') && task.remoteId ? (
                        <button type="button" className="ws-mini-btn" onClick={() => void pollOnce(task.id)}>
                          <RefreshCw size={14} />
                          {t('轮询', 'Poll')}
                        </button>
                      ) : null}

                      {task.status === 'queued' || task.status === 'running' ? (
                        <button type="button" className="ws-mini-btn" onClick={() => cancelTask(task.id)}>
                          <XCircle size={14} />
                          {t('取消', 'Cancel')}
                        </button>
                      ) : null}

                      {task.request ? (
                        <button
                          type="button"
                          className="ws-mini-btn"
                          onClick={() => void uiTextViewer(JSON.stringify(task.request, null, 2), { title: t('视频请求', 'Video request'), size: 'lg' })}
                        >
                          {t('请求', 'Request')}
                        </button>
                      ) : null}

                      {(responseFullById[task.id] || task.response?.dataPreview) ? (
                        <button
                          type="button"
                          className="ws-mini-btn"
                          onClick={() =>
                            void uiTextViewer(String(responseFullById[task.id] || task.response?.dataPreview || ''), {
                              title: t('视频响应', 'Video response'),
                              size: 'lg'
                            })
                          }
                        >
                          {t('响应', 'Response')}
                        </button>
                      ) : null}

                      <button type="button" className="ws-mini-btn" onClick={() => deleteTask(task.id)}>
                        <Trash2 size={14} />
                        {t('移除', 'Remove')}
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
