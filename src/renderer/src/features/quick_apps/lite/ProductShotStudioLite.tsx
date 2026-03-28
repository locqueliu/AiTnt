import React from 'react'
import { ArrowRight, ImagePlus, Layers3, LibraryBig } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../../settings/store'
import { resolveApiKey } from '../../settings/utils/apiKeys'
import { fileToQuickAppInputImage } from '../utils/imageOptimize'
import { useAppLanguage } from '../../i18n'
import { usePromptLibraryStore } from '../prompt_library/store'
import { useProductShotTaskStore, type TaskInputImage } from '../product_shot_tasks/store'
import { makeStarterPromptSet } from './promptSetHelpers'
import { uiToast } from '../../ui/toastStore'
import '../../workstation/workstation.css'

type QuickImage = {
  id?: string
  dataUrl: string
  name: string
  createdAt?: number
}

const slotKeys = ['model', 'outfit', 'scene', 'pose', 'wear_ref'] as const

function toTaskInputImage(image: QuickImage): TaskInputImage {
  return {
    id: String(image.id || `task_input_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
    name: String(image.name || 'reference'),
    localPath: String(image.dataUrl || ''),
    createdAt: Number(image.createdAt || Date.now())
  }
}

export default function ProductShotStudioLite() {
  const navigate = useNavigate()
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const providers = useSettingsStore((s) => s.providers)
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const appsProviderId = useSettingsStore((s) => s.appsProviderId)

  const promptSets = usePromptLibraryStore((s) => s.sets.filter((entry) => entry.appId === 'product_shot'))
  const activePromptSetId = usePromptLibraryStore((s) => s.activeSetIdByApp.product_shot)
  const setActivePromptSet = usePromptLibraryStore((s) => s.setActive)
  const addPromptSet = usePromptLibraryStore((s) => s.addSet)

  const addTask = useProductShotTaskStore((s) => s.addTask)
  const tasks = useProductShotTaskStore((s) => s.tasks)

  const [title, setTitle] = React.useState('')
  const [selectedSetId, setSelectedSetId] = React.useState<string | null>(null)
  const [productAngles, setProductAngles] = React.useState<QuickImage[]>([])
  const [slots, setSlots] = React.useState<Record<string, QuickImage | null>>({})
  const [genRatio, setGenRatio] = React.useState('1:1')
  const [genRes, setGenRes] = React.useState('1K')

  const slotDefs = React.useMemo(
    () => [
      { key: 'model', label: t('模特参考', 'Model reference') },
      { key: 'outfit', label: t('服装参考', 'Outfit reference') },
      { key: 'scene', label: t('场景参考', 'Scene reference') },
      { key: 'pose', label: t('姿态参考', 'Pose reference') },
      { key: 'wear_ref', label: t('穿戴细节参考', 'Wear detail reference') }
    ],
    [isZh]
  )

  const provider = React.useMemo(() => {
    const providerId = (appsProviderId || activeProviderId || '').trim()
    return providers.find((entry) => entry.id === providerId) || null
  }, [providers, appsProviderId, activeProviderId])

  const promptApiKey = provider ? resolveApiKey(provider, 'prompt') : ''
  const imageApiKey = provider ? resolveApiKey(provider, 'image') : ''
  const promptModel = String(provider?.selectedPromptModel || '').trim()
  const imageModel = String(provider?.selectedImageModel || '').trim()

  React.useEffect(() => {
    if (selectedSetId && promptSets.some((entry) => entry.id === selectedSetId)) return
    const fallback = activePromptSetId || promptSets[0]?.id || null
    setSelectedSetId(fallback)
  }, [selectedSetId, promptSets, activePromptSetId])

  const selectedSet = promptSets.find((entry) => entry.id === selectedSetId) || null

  React.useEffect(() => {
    if (!selectedSet) return
    setGenRatio(String(selectedSet.genRatio || '1:1'))
    setGenRes(String(selectedSet.genRes || '1K'))
  }, [selectedSet])

  const workspaceReady = Boolean(
    provider?.baseUrl?.trim() &&
      promptApiKey &&
      imageApiKey &&
      (selectedSet?.agent1Model || promptModel) &&
      (selectedSet?.agent2Model || promptModel) &&
      (selectedSet?.genModel || imageModel)
  )

  const queueSummary = isZh
    ? `${tasks.filter((task) => task.currentStep !== 'done').length} 运行中 / ${tasks.length} 总计`
    : `${tasks.filter((task) => task.currentStep !== 'done').length} running / ${tasks.length} total`

  const ensureStarterPromptSet = () => {
    if (promptSets.length > 0) return promptSets[0]
    const created = addPromptSet(makeStarterPromptSet(isZh ? '核心商品视觉' : 'Core Product Visuals'))
    setActivePromptSet('product_shot', created.id)
    setSelectedSetId(created.id)
    return created
  }

  const handleAddAngles = async (files: FileList | null) => {
    if (!files?.length) return
    const nextImages = await Promise.all(Array.from(files).map((file) => fileToQuickAppInputImage(file)))
    const validImages = nextImages.filter(Boolean) as QuickImage[]
    if (validImages.length === 0) {
      uiToast('error', t('无法读取这些商品图。', 'Unable to read those product images.'))
      return
    }
    setProductAngles((current) => [...current, ...validImages].slice(0, 12))
  }

  const handleSlotPick = async (key: string, file?: File | null) => {
    if (!file) return
    try {
      const image = await fileToQuickAppInputImage(file)
      if (!image) {
        uiToast('error', t('无法读取该参考图。', 'Unable to read that reference image.'))
        return
      }
      setSlots((current) => ({ ...current, [key]: image }))
    } catch (error: any) {
      uiToast('error', error?.message || t('无法读取该参考图。', 'Unable to read that reference image.'))
    }
  }

  const handleCreateStarterSet = () => {
    const created = addPromptSet(
      makeStarterPromptSet(isZh ? `核心商品视觉 ${promptSets.length + 1}` : `Core Product Visuals ${promptSets.length + 1}`)
    )
    setActivePromptSet('product_shot', created.id)
    setSelectedSetId(created.id)
    uiToast('success', t('起步提示词集已创建。', 'Starter prompt set created.'))
  }

  const handleQueueTask = () => {
    const promptSet = selectedSet || ensureStarterPromptSet()
    if (!provider) {
      uiToast('error', t('请先在快捷应用顶部选择应用供应商。', 'Choose an app provider in the Quick Apps header first.'))
      return
    }
    if (!workspaceReady) {
      uiToast('error', t('排队任务前请先补齐供应商密钥与模型配置。', 'Complete provider keys and model selections before queueing a task.'))
      return
    }
    if (productAngles.length === 0) {
      uiToast('info', t('排队前至少添加一张商品图片。', 'Add at least one product image before queueing.'))
      return
    }

    const label = [promptSet.category, promptSet.name].filter(Boolean).join(' / ') || promptSet.name
    const created = addTask({
      title: title.trim() || (isZh ? `${promptSet.name} 任务` : `${promptSet.name} Task`),
      promptSetId: promptSet.id,
      promptSetLabel: label,
      providerId: provider.id,
      productAngles: productAngles.map(toTaskInputImage),
      slots: Object.fromEntries(
        slotKeys.map((slot) => [slot, slots[slot] ? toTaskInputImage(slots[slot] as QuickImage) : null])
      ),
      agent1Template: promptSet.agent1Template,
      agent2Template: promptSet.agent2Template,
      agent3Template: promptSet.agent3Template,
      agent1Model: promptSet.agent1Model,
      agent2Model: promptSet.agent2Model,
      genModel: promptSet.genModel,
      genRatio,
      genRes,
      agent1Output: '',
      agent2Output: '',
      finalPrompt: '',
      outImages: []
    })

    setActivePromptSet('product_shot', promptSet.id)
    uiToast('success', t('商品图任务已加入队列。', 'Product-shot task queued.'))
    navigate(`/apps/tasks/${created.id}`)
  }

  return (
    <div className="apps-stack">
      <div className="apps-section-head">
        <div>
          <div className="apps-section-title">{t('商品图流水线', 'Product Shot Pipeline')}</div>
          <div className="apps-section-copy">
            {t(
              '通过可复用提示词集、商品多角度图片和补充参考图，排队执行多步骤商品图任务。',
              'Queue multi-step product-image tasks using reusable prompt sets, product angles, and supporting references.'
            )}
          </div>
        </div>
        <div className="ws-chip-row">
          <div className="ws-chip">{t('供应商', 'Provider')}: {provider?.name || t('未配置', 'Not configured')}</div>
          <div className="ws-chip">{t('队列', 'Queue')}: {queueSummary}</div>
        </div>
      </div>

      <div className="ws-grid">
        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('任务构建器', 'Task Builder')}</div>
              <div className="ws-panel-note">
                {t(
                  '选择提示词集，载入商品图组，补充可选参考，然后把任务送入队列。',
                  'Pick the prompt set, load the product image pack, add optional references, and send the task to the queue.'
                )}
              </div>
            </div>
            <div className="ws-actions">
              <button type="button" className="ws-mini-btn" onClick={() => navigate('/apps/prompts')}>
                <LibraryBig size={14} />
                {t('提示词集', 'Prompt sets')}
              </button>
              <button type="button" className="ws-mini-btn" onClick={() => navigate('/apps/tasks')}>
                <Layers3 size={14} />
                {t('任务台', 'Task desk')}
              </button>
            </div>
          </div>

          <div className="ws-row">
            <div className="ws-field">
              <label className="ws-label">{t('任务标题', 'Task title')}</label>
              <input
                className="ws-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('例如: 春季上新静物组图', 'Example: Spring launch still life')}
              />
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('提示词集', 'Prompt set')}</label>
              <select
                className="ws-select"
                value={selectedSetId || ''}
                onChange={(event) => {
                  setSelectedSetId(event.target.value || null)
                  if (event.target.value) setActivePromptSet('product_shot', event.target.value)
                }}
              >
                <option value="">{t('选择提示词集', 'Select a prompt set')}</option>
                {promptSets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.category ? `${entry.category} / ${entry.name}` : entry.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('工作区', 'Workspace')}</label>
              <input className="ws-input" value={provider?.name || t('跟随快捷应用供应商', 'Follow Quick Apps provider')} readOnly />
            </div>
          </div>

          <div className="ws-row">
            <div className="ws-field">
              <label className="ws-label">{t('输出比例', 'Output ratio')}</label>
              <select className="ws-select" value={genRatio} onChange={(event) => setGenRatio(event.target.value)}>
                {['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('输出尺寸', 'Output size')}</label>
              <select className="ws-select" value={genRes} onChange={(event) => setGenRes(event.target.value)}>
                {['1K', '2K', '4K'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('集合摘要', 'Set summary')}</label>
              <input className="ws-input" value={selectedSet?.name || t('尚未选择提示词集', 'No prompt set selected')} readOnly />
            </div>
          </div>

          <div className="ws-field">
            <label className="ws-label">{t('商品多角度图片', 'Product angles')}</label>
            <label className="apps-file-drop">
              <ImagePlus size={18} />
              <span>{t('添加一张或多张商品图', 'Add one or more product photos')}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(event) => {
                  void handleAddAngles(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
            <div className="apps-media-grid">
              {productAngles.map((image, index) => (
                <div key={`${image.id}_${index}`} className="apps-media-card">
                  <img src={image.dataUrl} alt={image.name} />
                  <div className="apps-media-foot">
                    <span>{image.name}</span>
                    <button
                      type="button"
                      className="ws-mini-btn"
                      onClick={() => setProductAngles((current) => current.filter((entry) => entry !== image))}
                    >
                      {t('移除', 'Remove')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ws-field">
            <label className="ws-label">{t('可选参考图', 'Optional references')}</label>
            <div className="apps-slot-grid">
              {slotDefs.map((slot) => (
                <div key={slot.key} className="apps-slot-card">
                  <div className="apps-slot-head">
                    <strong>{slot.label}</strong>
                    {slots[slot.key] ? (
                      <button type="button" className="ws-mini-btn" onClick={() => setSlots((current) => ({ ...current, [slot.key]: null }))}>
                        {t('清除', 'Clear')}
                      </button>
                    ) : null}
                  </div>

                  {slots[slot.key] ? (
                    <img src={String(slots[slot.key]?.dataUrl || '')} alt={slot.label} />
                  ) : (
                    <div className="apps-slot-empty">{t('暂无图片', 'No image')}</div>
                  )}

                  <label className="ws-mini-btn apps-file-btn">
                    {t('选择图片', 'Choose image')}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        void handleSlotPick(slot.key, file)
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn" onClick={handleQueueTask}>
              {t('加入任务队列', 'Queue task')}
              <ArrowRight size={16} />
            </button>
            <button type="button" className="ws-btn secondary" onClick={handleCreateStarterSet}>
              {t('创建起步集', 'Create starter set')}
            </button>
          </div>

          {!workspaceReady ? (
            <div className="ws-hint">
              <strong>{t('需要先完成供应商设置', 'Provider setup required')}</strong>
              {t(
                '在排队流水线之前，请确保所选供应商已经配置提示词与图像 Key，以及所需模型。',
                'Ensure the selected provider has prompt and image keys plus the required models before you queue the pipeline.'
              )}
            </div>
          ) : null}
        </div>

        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('当前提示词集', 'Current Prompt Set')}</div>
              <div className="ws-panel-note">
                {t(
                  '任务队列会使用当前提示词集模板，并套用当前的图像比例与尺寸覆盖。',
                  'The task queue uses the active prompt-set templates plus the current image ratio and size overrides.'
                )}
              </div>
            </div>
          </div>

          {selectedSet ? (
            <>
              <div className="apps-checklist">
                <div className="apps-check-item">
                  <strong>Agent 1</strong>
                  <span>{selectedSet.agent1Template.slice(0, 220)}{selectedSet.agent1Template.length > 220 ? '...' : ''}</span>
                </div>
                <div className="apps-check-item">
                  <strong>Agent 2</strong>
                  <span>{selectedSet.agent2Template.slice(0, 220)}{selectedSet.agent2Template.length > 220 ? '...' : ''}</span>
                </div>
                <div className="apps-check-item">
                  <strong>{t('合并提示词', 'Merge prompt')}</strong>
                  <span>{selectedSet.agent3Template.slice(0, 220)}{selectedSet.agent3Template.length > 220 ? '...' : ''}</span>
                </div>
              </div>

              <div className="ws-chip-row">
                {(selectedSet.tags || []).map((tag) => (
                  <div key={tag} className="ws-chip">
                    {tag}
                  </div>
                ))}
              </div>

              <div className="apps-checklist">
                <div className="apps-check-item">
                  <strong>{t('提示词模型', 'Prompt model')}</strong>
                  <span>{selectedSet.agent1Model || promptModel || t('跟随供应商默认值', 'Follow provider default')}</span>
                </div>
                <div className="apps-check-item">
                  <strong>{t('生成模型', 'Generator model')}</strong>
                  <span>{selectedSet.genModel || imageModel || t('跟随供应商默认值', 'Follow provider default')}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="ws-empty">
              <strong>{t('尚未选择提示词集', 'No prompt set selected')}</strong>
              {t('创建或选择一个提示词集，来驱动这条流水线。', 'Create or choose a prompt set to drive the pipeline templates.')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
