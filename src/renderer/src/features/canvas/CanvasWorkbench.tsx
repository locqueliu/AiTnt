import React from 'react'
import { Code2, FolderOpen, RefreshCw, Save, Settings2, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../settings/store'
import { useAppLanguage } from '../i18n'
import { uiTextViewer } from '../ui/dialogStore'
import { uiToast } from '../ui/toastStore'
import '../workstation/workstation.css'

type CanvasDiagnostic = {
  code: string
  message: string
}

type ListedNode = {
  manifest?: Record<string, unknown>
  manifestPath?: string
}

const DRAFT_KEY = 'aitnt-canvas-draft-v1'

function buildStarterWorkflow(isZh: boolean) {
  const t = (zh: string, en: string) => (isZh ? zh : en)
  return {
    schema_version: '1.0',
    meta: {
      id: 'aitnt_starter_flow',
      name: t('AiTnt 起步流程', 'AiTnt Starter Flow'),
      description: t('重构后画布工作台的起始工作流草稿。', 'Starter workflow draft for the rebuilt canvas desk.')
    },
    graph: {
      nodes: [
        {
          id: 'prompt_input',
          type: 'input.prompt',
          position: { x: 80, y: 120 },
          data: { label: t('提示词输入', 'Prompt Input'), value: '' }
        },
        {
          id: 'image_generate',
          type: 'image.generate',
          position: { x: 340, y: 120 },
          data: { label: t('图像生成', 'Image Generate'), ratio: '1:1' }
        }
      ],
      edges: [
        {
          id: 'edge_prompt_to_gen',
          source: 'prompt_input',
          target: 'image_generate'
        }
      ]
    }
  }
}

function stringifyWorkflow(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsText(file)
  })
}

function validateWorkflowDraft(value: unknown, isZh: boolean): CanvasDiagnostic[] {
  const t = (zh: string, en: string) => (isZh ? zh : en)
  const diagnostics: CanvasDiagnostic[] = []
  if (!value || typeof value !== 'object') {
    return [{ code: 'WF_INVALID', message: t('工作流根节点必须是对象。', 'Workflow root must be an object.') }]
  }

  const draft = value as any
  if (draft.schema_version !== '1.0') {
    diagnostics.push({ code: 'WF_SCHEMA_VERSION', message: t('schema_version 必须等于 "1.0"。', 'schema_version must equal "1.0".') })
  }
  if (!draft.meta || typeof draft.meta !== 'object') {
    diagnostics.push({ code: 'WF_META', message: t('必须提供 meta。', 'meta must be present.') })
  } else {
    if (!String(draft.meta.id || '').trim()) diagnostics.push({ code: 'WF_META_ID', message: t('meta.id 为必填项。', 'meta.id is required.') })
    if (!String(draft.meta.name || '').trim()) diagnostics.push({ code: 'WF_META_NAME', message: t('meta.name 为必填项。', 'meta.name is required.') })
  }
  if (!draft.graph || typeof draft.graph !== 'object') {
    diagnostics.push({ code: 'WF_GRAPH', message: t('必须提供 graph。', 'graph must be present.') })
  } else {
    if (!Array.isArray(draft.graph.nodes)) diagnostics.push({ code: 'WF_GRAPH_NODES', message: t('graph.nodes 必须是数组。', 'graph.nodes must be an array.') })
    if (!Array.isArray(draft.graph.edges)) diagnostics.push({ code: 'WF_GRAPH_EDGES', message: t('graph.edges 必须是数组。', 'graph.edges must be an array.') })
  }

  return diagnostics
}

export default function CanvasWorkbench() {
  const navigate = useNavigate()
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const providers = useSettingsStore((s) => s.providers)
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const canvasProviderId = useSettingsStore((s) => s.canvasProviderId)
  const setCanvasProvider = useSettingsStore((s) => s.setCanvasProvider)

  const [draft, setDraft] = React.useState(() => stringifyWorkflow(buildStarterWorkflow(isZh)))
  const [diagnostics, setDiagnostics] = React.useState<CanvasDiagnostic[]>([])
  const [customNodes, setCustomNodes] = React.useState<ListedNode[]>([])
  const [customNodesRoot, setCustomNodesRoot] = React.useState('')
  const [loadingNodes, setLoadingNodes] = React.useState(false)

  const provider = React.useMemo(() => {
    const providerId = (canvasProviderId || activeProviderId || '').trim()
    return providers.find((entry) => entry.id === providerId) || null
  }, [providers, canvasProviderId, activeProviderId])

  const loadDraft = React.useCallback(async () => {
    try {
      const result = await window.aitntAPI?.persistGetItem?.(DRAFT_KEY)
      const value = String(result?.value || '').trim()
      if (value) {
        setDraft(value)
        return
      }
      setDraft(stringifyWorkflow(buildStarterWorkflow(isZh)))
    } catch {
      setDraft(stringifyWorkflow(buildStarterWorkflow(isZh)))
    }
  }, [isZh])

  const refreshCustomNodes = React.useCallback(async () => {
    setLoadingNodes(true)
    try {
      const result = await window.aitntAPI?.listCustomNodes?.()
      if (!result?.success) {
        uiToast('error', result?.error || t('无法加载自定义节点。', 'Unable to load custom nodes.'))
        return
      }
      setCustomNodes(Array.isArray(result.nodes) ? result.nodes : [])
      setCustomNodesRoot(String(result.root || ''))
    } catch (error: any) {
      uiToast('error', error?.message || t('无法加载自定义节点。', 'Unable to load custom nodes.'))
    } finally {
      setLoadingNodes(false)
    }
  }, [isZh])

  React.useEffect(() => {
    void loadDraft()
    void refreshCustomNodes()
  }, [loadDraft, refreshCustomNodes])

  const handleValidate = React.useCallback(() => {
    try {
      const parsed = JSON.parse(draft)
      const nextDiagnostics = validateWorkflowDraft(parsed, isZh)
      setDiagnostics(nextDiagnostics)
      if (nextDiagnostics.length === 0) {
        uiToast('success', t('工作流草稿结构有效。', 'Workflow draft looks valid.'))
      }
    } catch (error: any) {
      const nextDiagnostics = [{ code: 'WF_JSON', message: error?.message || t('JSON 无效。', 'Invalid JSON.') }]
      setDiagnostics(nextDiagnostics)
      uiToast('error', t('工作流草稿包含无效 JSON。', 'Workflow draft contains invalid JSON.'))
    }
  }, [draft, isZh])

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(draft)
      setDraft(stringifyWorkflow(parsed))
      uiToast('success', t('工作流草稿已格式化。', 'Workflow draft formatted.'))
    } catch (error: any) {
      uiToast('error', error?.message || t('无法格式化工作流草稿。', 'Unable to format the workflow draft.'))
    }
  }

  const handleSave = async () => {
    try {
      await window.aitntAPI?.persistSetItem?.(DRAFT_KEY, draft)
      uiToast('success', t('画布草稿已保存到本地。', 'Canvas draft saved locally.'))
    } catch (error: any) {
      uiToast('error', error?.message || t('无法保存草稿。', 'Unable to save the draft.'))
    }
  }

  const handleImport = async (file?: File | null) => {
    if (!file) return
    try {
      const text = await readTextFile(file)
      setDraft(text)
      uiToast('success', t('工作流文件已载入草稿编辑器。', 'Workflow file loaded into the draft editor.'))
    } catch {
      uiToast('error', t('无法载入该工作流文件。', 'Unable to load that workflow file.'))
    }
  }

  const handleExport = () => {
    try {
      const parsed = JSON.parse(draft)
      const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'aitnt-canvas-workflow.json'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 200)
      uiToast('success', t('工作流草稿已导出。', 'Workflow draft exported.'))
    } catch (error: any) {
      uiToast('error', error?.message || t('无法导出草稿。', 'Unable to export the draft.'))
    }
  }

  return (
    <div className="ws-shell">
      <section className="ws-hero">
        <div className="ws-hero-copy">
          <div className="ws-kicker">
            <Sparkles size={14} />
            <span>{t('AiTnt 画布工作台', 'AiTnt Canvas Workbench')}</span>
          </div>
          <h1 className="ws-title">
            {t('编排工作流 JSON、校验结构，并管理自定义节点包。', 'Stage workflow JSON, validate structure, and manage custom node packs.')}
          </h1>
          <p className="ws-subtitle">
            {t(
              '这次 clean-room 画布重构聚焦于工作流文档暂存和自定义节点清单管理，让功能在旧图形编辑器损坏的情况下依然可用。',
              'The clean-room canvas rebuild focuses on workflow document staging and custom-node inventory so the feature remains usable without depending on the damaged legacy graph editor.'
            )}
          </p>

          <div className="ws-chip-row">
            <div className="ws-chip">{t('供应商', 'Provider')}: {provider?.name || t('未配置', 'Not configured')}</div>
            <div className="ws-chip">{t('自定义节点', 'Custom nodes')}: {customNodes.length}</div>
            <div className="ws-chip">Draft key: {DRAFT_KEY}</div>
          </div>
        </div>

        <div className="ws-stat-grid">
          <div className="ws-stat">
            <strong>{provider?.selectedImageModel || t('未分配', 'Unassigned')}</strong>
            <span>{t('画布图像模型', 'Canvas image model')}</span>
          </div>
          <div className="ws-stat">
            <strong>{customNodes.length}</strong>
            <span>{t('检测到的节点清单', 'Detected custom node manifests')}</span>
          </div>
          <div className="ws-stat">
            <strong>{diagnostics.length === 0 ? t('干净', 'Clean') : diagnostics.length}</strong>
            <span>{t('最近一次校验结果', 'Latest validation result')}</span>
          </div>
        </div>
      </section>

      <section className="ws-grid">
        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('工作流草稿', 'Workflow Draft')}</div>
              <div className="ws-panel-note">
                {t(
                  '维护一个可移植的 JSON 工作流草稿，在本地校验它，并在需要时导出。',
                  'Keep a portable JSON workflow draft, validate it locally, and export it when needed.'
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
                value={canvasProviderId || ''}
                onChange={(event) => setCanvasProvider(event.target.value ? event.target.value : null)}
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
              <label className="ws-label">{t('提示词模型', 'Prompt model')}</label>
              <input className="ws-input" value={String(provider?.selectedPromptModel || t('未配置', 'Not configured'))} readOnly />
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('视频模型', 'Video model')}</label>
              <input className="ws-input" value={String(provider?.selectedVideoModel || t('未配置', 'Not configured'))} readOnly />
            </div>
          </div>

          <div className="ws-field">
            <label className="ws-label">Draft JSON</label>
            <textarea className="ws-codearea" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} />
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn" onClick={handleValidate}>
              <Code2 size={16} />
              {t('校验', 'Validate')}
            </button>
            <button type="button" className="ws-btn secondary" onClick={handleFormat}>
              {t('格式化', 'Format')}
            </button>
            <button type="button" className="ws-btn secondary" onClick={() => setDraft(stringifyWorkflow(buildStarterWorkflow(isZh)))}>
              {t('载入起步稿', 'Load starter')}
            </button>
            <button type="button" className="ws-btn secondary" onClick={() => void loadDraft()}>
              {t('重新载入已保存版本', 'Reload saved')}
            </button>
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn secondary" onClick={() => void handleSave()}>
              <Save size={16} />
              {t('保存草稿', 'Save draft')}
            </button>
            <button type="button" className="ws-btn secondary" onClick={handleExport}>
              {t('导出 JSON', 'Export JSON')}
            </button>
            <label className="ws-btn secondary apps-file-btn">
              {t('导入 JSON', 'Import JSON')}
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  void handleImport(file)
                }}
              />
            </label>
          </div>

          {diagnostics.length > 0 ? (
            <div className="apps-checklist">
              {diagnostics.map((item) => (
                <div key={`${item.code}_${item.message}`} className="apps-check-item apps-check-item-error">
                  <strong>{item.code}</strong>
                  <span>{item.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="ws-hint">
              <strong>{t('校验目标', 'Validation target')}</strong>
              {t('该草稿需要包含 schema_version、meta 与 graph，其中 graph 需要有 nodes 和 edges。', 'This draft expects `schema_version`, `meta`, and `graph` with `nodes` plus `edges`.')}
            </div>
          )}
        </div>

        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('自定义节点注册表', 'Custom Node Registry')}</div>
              <div className="ws-panel-note">
                {t(
                  '检查在本地 custom_nodes 文件夹里发现的 node.json 清单。',
                  'Inspect `node.json` manifests discovered in the local `custom_nodes` folder.'
                )}
              </div>
            </div>
            <div className="ws-actions">
              <button type="button" className="ws-mini-btn" onClick={() => void refreshCustomNodes()}>
                <RefreshCw size={14} />
                {loadingNodes ? t('加载中', 'Loading') : t('刷新', 'Refresh')}
              </button>
              <button
                type="button"
                className="ws-mini-btn"
                onClick={async () => {
                  const result = await window.aitntAPI?.openCustomNodesFolder?.()
                  if (!result?.success) {
                    uiToast('error', result?.error || t('无法打开自定义节点文件夹。', 'Unable to open the custom nodes folder.'))
                    return
                  }
                  uiToast('success', t('自定义节点文件夹已打开。', 'Custom nodes folder opened.'))
                }}
              >
                <FolderOpen size={14} />
                {t('打开文件夹', 'Open folder')}
              </button>
            </div>
          </div>

          <div className="ws-field">
            <label className="ws-label">{t('根目录', 'Root')}</label>
            <input className="ws-input" value={customNodesRoot} readOnly />
          </div>

          {customNodes.length === 0 ? (
            <div className="ws-empty">
              <strong>{t('未检测到自定义节点清单', 'No custom node manifests detected')}</strong>
              {t('在 custom_nodes 下添加包含 node.json 的目录后，再刷新这个注册表。', 'Add folders containing `node.json` files under `custom_nodes` and refresh this registry.')}
            </div>
          ) : (
            <div className="ws-mini-list">
              {customNodes.map((entry, index) => {
                const manifest = entry.manifest || {}
                const nodeName = String(manifest.name || manifest.id || (isZh ? `自定义节点 ${index + 1}` : `Custom Node ${index + 1}`))
                return (
                  <div key={`${entry.manifestPath}_${index}`} className="ws-mini-item">
                    <div className="ws-mini-top">
                      <div>
                        <div className="ws-mini-title">{nodeName}</div>
                        <div className="ws-mini-sub">{String(entry.manifestPath || '')}</div>
                      </div>
                      <div className="ws-status ok">{String(manifest.version || t('清单', 'manifest'))}</div>
                    </div>

                    <div className="ws-chip-row">
                      {Array.isArray(manifest.tags)
                        ? manifest.tags.slice(0, 6).map((tag) => (
                            <div key={String(tag)} className="ws-chip">
                              {String(tag)}
                            </div>
                          ))
                        : null}
                    </div>

                    <div className="ws-video-actions">
                      <button
                        type="button"
                        className="ws-mini-btn"
                        onClick={() => void uiTextViewer(JSON.stringify(manifest, null, 2), { title: nodeName, size: 'lg' })}
                      >
                        {t('查看清单', 'View manifest')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
