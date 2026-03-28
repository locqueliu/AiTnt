import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Film, Plus, Minus, Sparkles, Trash2, Library as LibraryIcon, Image as ImageIcon } from 'lucide-react'
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
import { loadVideoUiPersisted, saveVideoUiPersisted } from '../utils/persistUi'
import PromptLinkPanel from '../../image_gen/components/PromptLinkPanel'
import CreativeCollectionsPanel from '../../image_gen/components/CreativeCollectionsPanel'
import { takePendingPromptLink } from '../../creative_library/promptLink'
import { useCreativeLibraryStore } from '../../creative_library/store'
import { uiToast } from '../../ui/toastStore'
import { useVideoPromptOpsStore } from '../promptOpsStore'
import { uiTextEditor } from '../../ui/dialogStore'

export default function TextToVideo(props: { onSwitchMode: (mode: VideoGenMode) => void }) {
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

  const t2vTasks = useMemo(() => tasks.filter(t => t.mode === 't2v'), [tasks])

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
  const busyOp = useVideoPromptOpsStore(s => s.byMode.t2v.busy)
  const lastResult = useVideoPromptOpsStore(s => s.byMode.t2v.lastResult)
  const startOptimize = useVideoPromptOpsStore(s => s.optimize)
  const startTranslate = useVideoPromptOpsStore(s => s.translate)
  const hydrateHistory = useVideoPromptOpsStore(s => s.hydrateHistory)
  const lastAppliedAtRef = useRef(0)

  useEffect(() => {
    hydrateHistory('t2v')
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
        const s = await loadVideoUiPersisted('t2v', defaults)
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

  // persist UI (t2v)
  useEffect(() => {
    if (!uiHydrated) return
    const t = window.setTimeout(() => {
      void saveVideoUiPersisted('t2v', { prompt, durationSec, aspectRatio, batchCount, enhancePrompt, enableUpsample })
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

  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null)
  const previewTask = useMemo(() => t2vTasks.find(t => t.id === previewTaskId) || null, [t2vTasks, previewTaskId])

  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  // 从创意库返回后，一次性写入 Prompt / 优化偏好
  useEffect(() => {
    const pending = takePendingPromptLink('t2v')
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
      uiToast('info', '请先在设置中选择或配置 API 网站')
      return
    }
    const promptApiKey = resolveApiKey(activeProvider, 'prompt')
    if (!promptApiKey) {
      uiToast('error', '请先在设置中配置“优化 Key”')
      return
    }
    if (!currentPromptModel) {
      uiToast('info', '请先选择用于“优化”的提示词模型')
      return
    }

    startOptimize({
      mode: 't2v',
      baseUrl: activeProvider.baseUrl,
      apiKey: promptApiKey,
      model: currentPromptModel,
      prompt,
      preference: optimizePreference,
      fallbackUi: defaults
    })
  }

  const handleTranslate = () => {
    if (!prompt.trim()) return
    if (!activeProvider) {
      uiToast('info', '请先在设置中选择或配置 API 网站')
      return
    }
    const translateApiKey = resolveApiKey(activeProvider, 'translate')
    if (!translateApiKey) {
      uiToast('error', '请先在设置中配置“翻译 Key”')
      return
    }
    if (!currentTranslateModel) {
      uiToast('info', '请先在设置中选择“提示词翻译模型”')
      return
    }

    startTranslate({
      mode: 't2v',
      baseUrl: activeProvider.baseUrl,
      apiKey: translateApiKey,
      model: currentTranslateModel,
      prompt,
      preference: optimizePreference,
      fallbackUi: defaults
    })
  }

  const handleGenerate = () => {
    if (!prompt.trim()) {
      uiToast('info', '请先输入提示词')
      return
    }
    if (!activeProvider || !providerId) {
      uiToast('info', '请先在设置中选择或配置 API 网站')
      return
    }
    if (!currentVideoModel) {
      uiToast('info', '请先选择生视频模型')
      return
    }

    const videoApiKey = resolveApiKey(activeProvider, 'video')
    if (!videoApiKey) {
      uiToast('error', '请先在设置中配置“视频 Key”')
      return
    }

    if (isVeoModel && hasCjk && !enhancePrompt) {
      uiToast('info', '当前 Veo 模型通常只支持英文提示词。请先把提示词翻译为英文，或开启“增强提示词（英文）”。')
      return
    }

      enqueueBatch({
        mode: 't2v',
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
        autoSaveDir: videoAutoSaveEnabled ? videoOutputDirectory : undefined
      })
    }

  return (
    <div className="vg-layout">
      <div className="vg-left">
        <div className="vg-panel">
          <div className="vg-block-head">
            <div className="vg-block-title"><Film size={16} /> 参数配置（视频）</div>
          </div>

          <div className="vg-field">
            <div className="vg-label">时长</div>
            <div className="vg-pill-row">
              {[3, 5, 8, 10].map(s => (
                <button key={s} className={`vg-pill ${durationSec === s ? 'active' : ''}`} onClick={() => setDurationSec(s)} type="button">{s}s</button>
              ))}
            </div>
          </div>

          <div className="vg-field">
            <div className="vg-label">画幅</div>
            <div className="vg-pill-row">
              {(['16:9', '9:16'] as const).map(r => (
                <button key={r} className={`vg-pill ${aspectRatio === r ? 'active' : ''}`} onClick={() => setAspectRatio(r)} type="button">{r}</button>
              ))}
            </div>
          </div>

          {/* 清晰度不在这里设置：由模型决定（如 *-4k） */}
        </div>

        <div className="vg-panel">
          <div className="vg-block-head">
            <div className="vg-block-title">提示词</div>
            <div className="vg-block-actions">
              <button
                type="button"
                className="vg-mini-btn"
                onClick={async () => {
                  const next = await uiTextEditor(String(prompt || ''), {
                    title: '编辑提示词',
                    message: '支持多行；应用后会覆盖当前提示词',
                    size: 'lg',
                    okText: '应用',
                    cancelText: '取消'
                  })
                  if (next == null) return
                  setPrompt(next)
                }}
                disabled={busyOp !== null}
                title="展开编辑"
              >
                展开
              </button>
              <button
                type="button"
                className="vg-mini-btn"
                onClick={() => setPrompt('')}
                disabled={busyOp !== null || !prompt.trim()}
                title="清空提示词"
              >
                清空
              </button>
              <button
                type="button"
                className="vg-mini-btn"
                onClick={handleOptimize}
                disabled={busyOp !== null || !prompt.trim()}
                title="用提示词模型优化"
              >
                {busyOp === 'optimize' ? '优化中...' : '优化'}
              </button>
              {isVeoModel && (
                <button
                  type="button"
                  className="vg-mini-btn"
                  onClick={handleTranslate}
                  disabled={busyOp !== null || !prompt.trim()}
                  title="翻译/改写为英文（Veo 常用）"
                >
                  {busyOp === 'translate' ? '翻译中...' : '英文'}
                </button>
              )}
            </div>
          </div>
          <textarea className="vg-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="描述你想生成的视频画面..." />
          {isVeoModel && hasCjk && (
            <div className="vg-muted" style={{ marginTop: 8 }}>
              提示：Veo 通常只支持英文 prompt。可点右上“英文”一键翻译，或开启下方“增强提示词（英文）”。
            </div>
          )}
        </div>

        {isVeoModel && (
          <div className="vg-panel">
            <div className="vg-block-head">
              <div className="vg-block-title">Veo 选项</div>
              <button
                type="button"
                className="vg-mini-btn"
                onClick={() => setVeoOptionsOpen(v => !v)}
                aria-expanded={veoOptionsOpen}
              >
                {veoOptionsOpen ? '收起' : '展开'}
              </button>
            </div>

            {veoOptionsOpen ? (
              <>
                <div className="vg-field">
                  <div className="vg-label">增强提示词（英文）</div>
                  <div className="vg-pill-row">
                    <button type="button" className={`vg-pill ${enhancePrompt ? 'active' : ''}`} onClick={() => setEnhancePrompt(v => !v)}>
                      {enhancePrompt ? '开启' : '关闭'}
                    </button>
                  </div>
                  <div className="vg-muted" style={{ marginTop: 6 }}>
                    部分中转网关会在开启后把中文自动转成英文并增强描述。
                  </div>
                </div>
                <div className="vg-field">
                  <div className="vg-label">启用上采样</div>
                  <div className="vg-pill-row">
                    <button type="button" className={`vg-pill ${enableUpsample ? 'active' : ''}`} onClick={() => setEnableUpsample(v => !v)}>
                      {enableUpsample ? '开启' : '关闭'}
                    </button>
                  </div>
                  <div className="vg-muted" style={{ marginTop: 6 }}>
                    返回更高分辨率（如 1080p）。某些模型/接口可能不支持。
                  </div>
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
            label="生视频模型"
            value={currentVideoModel}
            placeholder="选择视频模型..."
            icon={<Film size={14} />}
            pinned={pinnedVideoModels}
            models={availableModels}
            onSelect={(m: string) => {
              if (!providerId) return
              updateProvider(providerId, { selectedVideoModel: m })
            }}
          />

          <CompactModelPicker
            label="提示词优化模型"
            value={currentPromptModel}
            placeholder="选择优化模型..."
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
          <button className="vg-tab active" type="button"><Film size={16} /> 文字生视频</button>
          <button className="vg-tab" type="button" onClick={() => onSwitchMode('i2v')}><ImageIcon size={16} /> 图生视频</button>
        </div>

        <VideoDesktopGrid
          mode="t2v"
          tasks={t2vTasks}
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
              if (!t2vTasks.length) return
              setConfirmClearOpen(true)
            }}
            disabled={!t2vTasks.length}
            title="清空视频任务"
          >
            <Trash2 size={16} /> 清空
          </button>

          <button type="button" className="vg-primary" onClick={handleGenerate}>
            <Sparkles size={16} /> 开始
          </button>
        </div>
      </div>

      <div className="vg-right">
        <PromptLinkPanel
          mode="t2v"
          onOpenLibrary={() => {
            setLibraryMode('t2v')
            navigate('/library?mode=t2v', { state: { from: '/video?mode=t2v' } })
          }}
          onApplyPrompt={(text) => setPrompt(text)}
          onApplyOptimizeCustom={(text) => setInjectOptimizeCustomText(text)}
        />

        <CreativeCollectionsPanel
          mode="t2v"
          onOpenLibrary={() => {
            setLibraryMode('t2v')
            navigate('/library?mode=t2v', { state: { from: '/video?mode=t2v' } })
          }}
          onApplyPrompt={(text) => setPrompt(text)}
          onApplyOptimizeCustom={(text) => setInjectOptimizeCustomText(text)}
        />
      </div>

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
        title="清空任务"
        message="确定要清空所有视频任务吗？此操作会删除当前模式下的任务列表。"
        confirmText="清空"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          clearTasksByMode('t2v')
          setConfirmClearOpen(false)
        }}
      />
    </div>
  )
}
