import React from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useSettingsStore, type ApiProvider } from '../store'
import { makeKeyId, resolveApiKey } from '../utils/apiKeys'
import { uiToast } from '../../ui/toastStore'
import { useAppLanguage } from '../../i18n'

function stripTrailingPath(baseUrl: string, suffix: string): string {
  const trimmedBase = String(baseUrl || '').trim().replace(/\/+$/g, '')
  const trimmedSuffix = String(suffix || '').trim().replace(/^\/+/g, '')
  if (!trimmedSuffix) return trimmedBase
  return trimmedBase.toLowerCase().endsWith(`/${trimmedSuffix.toLowerCase()}`)
    ? trimmedBase.slice(0, -(trimmedSuffix.length + 1))
    : trimmedBase
}

function buildModelUrls(baseUrl: string): string[] {
  const endpoint = String(baseUrl || '').trim().replace(/\/+$/g, '')
  const root = stripTrailingPath(stripTrailingPath(endpoint, 'v1'), 'v2')
  return Array.from(new Set([`${endpoint}/models`, `${root}/v1/models`, `${root}/v2/models`, `${root}/models`]))
}

function extractModels(data: any): string[] {
  const values = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data)
        ? data
        : []

  return Array.from(
    new Set(
      values
        .map((value: any) => value?.id || value?.name || value?.model || '')
        .map((value: string) => String(value || '').trim())
        .filter(Boolean)
    )
  )
}

function syncSharedKey(provider: ApiProvider, apiKey: string): Partial<ApiProvider> {
  const keyId = String(provider.apiKeys?.[0]?.id || makeKeyId())
  const currentKey = provider.apiKeys?.[0]

  return {
    apiKey,
    apiKeys: [
      {
        id: keyId,
        name: currentKey?.name || 'Primary',
        group: currentKey?.group || 'default',
        apiKey
      }
    ],
    keyUsage: {
      imageKeyId: keyId,
      promptKeyId: keyId,
      translateKeyId: keyId,
      videoKeyId: keyId,
      modelsKeyId: keyId
    }
  }
}

export default function ApiSettingsLite() {
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const providers = useSettingsStore((s) => s.providers)
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const addProvider = useSettingsStore((s) => s.addProvider)
  const removeProvider = useSettingsStore((s) => s.removeProvider)
  const updateProvider = useSettingsStore((s) => s.updateProvider)
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider)
  const imageProviderId = useSettingsStore((s) => s.imageProviderId)
  const videoProviderId = useSettingsStore((s) => s.videoProviderId)
  const canvasProviderId = useSettingsStore((s) => s.canvasProviderId)
  const appsProviderId = useSettingsStore((s) => s.appsProviderId)
  const setImageProvider = useSettingsStore((s) => s.setImageProvider)
  const setVideoProvider = useSettingsStore((s) => s.setVideoProvider)
  const setCanvasProvider = useSettingsStore((s) => s.setCanvasProvider)
  const setAppsProvider = useSettingsStore((s) => s.setAppsProvider)

  const [newProviderName, setNewProviderName] = React.useState('')
  const [newProviderUrl, setNewProviderUrl] = React.useState('')
  const [fetchingModels, setFetchingModels] = React.useState(false)

  const activeProvider = React.useMemo(() => {
    return providers.find((provider) => provider.id === activeProviderId) || providers[0] || null
  }, [providers, activeProviderId])

  React.useEffect(() => {
    if (!activeProvider && providers[0]) {
      setActiveProvider(providers[0].id)
    }
  }, [activeProvider, providers, setActiveProvider])

  const sharedKey = activeProvider
    ? resolveApiKey(activeProvider, 'models') || String(activeProvider.apiKey || '')
    : ''

  const availableModels = React.useMemo(() => {
    return Array.from(
      new Set(
        (activeProvider?.models || [])
          .map((model) => String(model || '').trim())
          .filter(Boolean)
      )
    )
  }, [activeProvider?.models])

  const workspaceMappings = [
    { label: t('图像工作区', 'Image workspace'), value: imageProviderId || '', setValue: setImageProvider },
    { label: t('视频工作区', 'Video workspace'), value: videoProviderId || '', setValue: setVideoProvider },
    { label: t('画布工作区', 'Canvas workspace'), value: canvasProviderId || '', setValue: setCanvasProvider },
    { label: t('快捷应用', 'Quick apps'), value: appsProviderId || '', setValue: setAppsProvider }
  ]

  const modelDefaults = activeProvider
    ? [
        {
          label: t('默认图像模型', 'Default image model'),
          value: activeProvider.selectedImageModel || '',
          setValue: (value: string) => updateProvider(activeProvider.id, { selectedImageModel: value })
        },
        {
          label: t('默认提示词模型', 'Default prompt model'),
          value: activeProvider.selectedPromptModel || '',
          setValue: (value: string) => updateProvider(activeProvider.id, { selectedPromptModel: value })
        },
        {
          label: t('默认视频模型', 'Default video model'),
          value: activeProvider.selectedVideoModel || '',
          setValue: (value: string) => updateProvider(activeProvider.id, { selectedVideoModel: value })
        },
        {
          label: t('默认翻译模型', 'Default translation model'),
          value: activeProvider.selectedTranslateModel || '',
          setValue: (value: string) => updateProvider(activeProvider.id, { selectedTranslateModel: value })
        }
      ]
    : []

  const getModelOptions = (currentValue: string) => {
    const current = String(currentValue || '').trim()
    if (!current) return availableModels
    return availableModels.includes(current) ? availableModels : [current, ...availableModels]
  }

  const refreshModels = async () => {
    if (!activeProvider) return

    const apiKey = resolveApiKey(activeProvider, 'models') || sharedKey
    if (!activeProvider.baseUrl.trim() || !apiKey.trim()) {
      uiToast('error', t('请先填写基础 URL 和 API Key，再获取模型列表。', 'Set a base URL and API key before fetching models.'))
      return
    }

    setFetchingModels(true)
    try {
      let lastError = t('无法获取模型列表。', 'Unable to fetch models.')

      for (const url of buildModelUrls(activeProvider.baseUrl)) {
        const variants = [
          { url, headers: { Authorization: `Bearer ${apiKey}` } },
          { url: `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`, headers: {} },
          { url, headers: { 'x-goog-api-key': apiKey } }
        ]

        for (const variant of variants) {
          try {
            const response = await fetch(variant.url, { headers: variant.headers })
            if ([401, 403, 404, 405].includes(response.status)) {
              lastError = isZh ? `模型接口返回 ${response.status}。` : `Model endpoint returned ${response.status}.`
              continue
            }

            if (!response.ok) {
              lastError = isZh ? `模型接口返回 ${response.status}。` : `Model endpoint returned ${response.status}.`
              continue
            }

            const contentType = String(response.headers.get('content-type') || '').toLowerCase()
            const payload = contentType.includes('application/json') ? await response.json() : await response.text()
            const models = extractModels(payload)

            if (models.length === 0) {
              lastError = t('接口响应中没有找到模型。', 'No models were found in the endpoint response.')
              continue
            }

            updateProvider(activeProvider.id, {
              models,
              selectedImageModel: activeProvider.selectedImageModel || models[0] || '',
              selectedPromptModel: activeProvider.selectedPromptModel || models[0] || '',
              selectedVideoModel: activeProvider.selectedVideoModel || models[0] || '',
              selectedTranslateModel: activeProvider.selectedTranslateModel || models[0] || ''
            })
            uiToast('success', isZh ? `已加载 ${models.length} 个模型。` : `Loaded ${models.length} model${models.length === 1 ? '' : 's'}.`)
            return
          } catch (error: any) {
            lastError = error?.message || t('无法获取模型列表。', 'Unable to fetch models.')
          }
        }
      }

      uiToast('error', lastError)
    } finally {
      setFetchingModels(false)
    }
  }

  return (
    <div className="st-form-container">
      <div className="st-header">
        <h1>{t('供应商', 'Providers')}</h1>
        <p>
          {t(
            '配置兼容 OpenAI 的接口、共享 API Key、模型名称以及各工作区默认供应商。',
            'Configure OpenAI-compatible endpoints, shared API keys, model names, and workspace-specific defaults.'
          )}
        </p>
      </div>

      <div className="st-group">
        <label className="st-label">{t('供应商列表', 'Provider list')}</label>
        <div className="st-presets">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={`st-preset-tag ${provider.id === activeProvider?.id ? 'active' : ''}`}
              onClick={() => setActiveProvider(provider.id)}
            >
              {provider.name || provider.baseUrl || provider.id}
            </div>
          ))}
        </div>

        <div className="st-inline-row" style={{ marginTop: 12 }}>
          <div className="st-inline-left">
            <div className="st-inline-title">{t('添加供应商', 'Add provider')}</div>
            <div className="st-inline-desc">
              {t(
                '创建新的接口配置，供图像、提示词、视频、画布和快捷应用共用。',
                'Create a new endpoint entry for images, prompts, video, canvas, and quick apps.'
              )}
            </div>
          </div>
        </div>

        <div className="st-fields-grid">
          <div className="st-input-wrapper">
            <input
              className="st-input"
              value={newProviderName}
              onChange={(event) => setNewProviderName(event.target.value)}
              placeholder={t('供应商名称', 'Provider name')}
            />
          </div>
          <div className="st-input-wrapper">
            <input
              className="st-input"
              value={newProviderUrl}
              onChange={(event) => setNewProviderUrl(event.target.value)}
              placeholder={t('基础 URL，例如 https://api.example.com/v1', 'Base URL, for example https://api.example.com/v1')}
            />
          </div>
        </div>

        <div className="st-action-row end">
          <button
            type="button"
            className="st-refresh-btn"
            onClick={() => {
              if (!newProviderName.trim() || !newProviderUrl.trim()) {
                uiToast('info', t('请先填写供应商名称和基础 URL。', 'Enter a provider name and base URL first.'))
                return
              }
              addProvider(newProviderName.trim(), newProviderUrl.trim())
              setNewProviderName('')
              setNewProviderUrl('')
              uiToast('success', t('供应商已添加。', 'Provider added.'))
            }}
          >
            <Plus size={14} style={{ marginRight: 6 }} />
            {t('添加供应商', 'Add provider')}
          </button>
        </div>
      </div>

      {activeProvider ? (
        <>
          <div className="st-group">
            <label className="st-label">{t('当前供应商', 'Active provider')}</label>

            <div className="st-fields-grid">
              <div className="st-input-wrapper">
                <input
                  className="st-input"
                  value={activeProvider.name}
                  onChange={(event) => updateProvider(activeProvider.id, { name: event.target.value })}
                  placeholder={t('供应商名称', 'Provider name')}
                />
              </div>
              <div className="st-input-wrapper">
                <input
                  className="st-input"
                  value={activeProvider.baseUrl}
                  onChange={(event) => updateProvider(activeProvider.id, { baseUrl: event.target.value })}
                  placeholder={t('基础 URL', 'Base URL')}
                />
              </div>
              <div className="st-input-wrapper span-2">
                <input
                  className="st-input"
                  value={sharedKey}
                  onChange={(event) => updateProvider(activeProvider.id, syncSharedKey(activeProvider, event.target.value))}
                  placeholder={t('共享 API Key', 'Shared API key')}
                />
              </div>
            </div>

            <div className="st-action-row">
              <button
                type="button"
                className={`st-refresh-btn ${fetchingModels ? 'loading' : ''}`}
                onClick={() => void refreshModels()}
                disabled={fetchingModels}
              >
                <RefreshCw size={14} style={{ marginRight: 6 }} />
                {fetchingModels ? t('加载模型中', 'Loading models') : t('获取模型', 'Fetch models')}
              </button>

              <button
                type="button"
                className="st-refresh-btn"
                onClick={() => {
                  removeProvider(activeProvider.id)
                  uiToast('success', t('供应商已移除。', 'Provider removed.'))
                }}
              >
                <Trash2 size={14} style={{ marginRight: 6 }} />
                {t('移除供应商', 'Remove provider')}
              </button>
            </div>
          </div>

          <div className="st-group">
            <label className="st-label">{t('工作区默认值', 'Workspace defaults')}</label>
            <div className="st-inline-row">
              <div className="st-inline-left">
                <div className="st-inline-title">{t('功能与供应商映射', 'Feature-to-provider mapping')}</div>
                <div className="st-inline-desc">
                  {t(
                    '每个工作区都可以跟随当前供应商，或者绑定到专用供应商配置。',
                    'Each workspace can follow the active provider or target a dedicated provider entry.'
                  )}
                </div>
              </div>
            </div>

            <div className="st-fields-grid">
              {workspaceMappings.map((item) => (
                <div key={item.label} className="st-field-stack">
                  <div className="st-field-caption">{item.label}</div>
                  <div className="st-input-wrapper">
                    <select
                      className="st-input"
                      value={item.value}
                      onChange={(event) => item.setValue(event.target.value ? event.target.value : null)}
                    >
                      <option value="">{t('跟随当前供应商', 'Follow active provider')}</option>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name || provider.baseUrl || provider.id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="st-group">
            <label className="st-label">{t('模型', 'Models')}</label>

            <div className="st-inline-row">
              <div className="st-inline-left">
                <div className="st-inline-title">{t('已获取模型', 'Fetched models')}</div>
                <div className="st-inline-desc">
                  {t(
                    '获取模型后，下面的默认模型会直接从列表中选择；如果当前值不在列表里，也会保留为可选项。',
                    'Fetched models are added directly to the default-model dropdowns, and any existing custom value is preserved as an option.'
                  )}
                </div>
              </div>
              <div className="st-field-caption">
                {availableModels.length} {t('个模型', 'models')}
              </div>
            </div>

            {availableModels.length > 0 ? (
              <div className="st-models-container">
                {availableModels.map((model) => (
                  <div key={model} className="st-model-tag" title={model}>
                    <span className="st-model-tag-text">{model}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="st-inline-row">
                <div className="st-inline-left">
                  <div className="st-inline-title">{t('还没有模型列表', 'No models loaded yet')}</div>
                  <div className="st-inline-desc">
                    {t(
                      '请先点击“获取模型”，或直接在下方默认模型输入框中手动填写。',
                      'Fetch models first, or type a model name directly into the default-model fields below.'
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="st-fields-grid">
              {modelDefaults.map((item) => (
                <div key={item.label} className="st-field-stack">
                  <div className="st-field-caption">{item.label}</div>
                  <div className="st-input-wrapper">
                    {availableModels.length > 0 ? (
                      <select
                        className="st-input"
                        value={item.value}
                        onChange={(event) => item.setValue(event.target.value)}
                      >
                        <option value="">{t('请选择模型', 'Select a model')}</option>
                        {getModelOptions(item.value).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="st-input"
                        value={item.value}
                        onChange={(event) => item.setValue(event.target.value)}
                        placeholder={item.label}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="st-group">
          <label className="st-label">{t('还没有供应商', 'No providers yet')}</label>
          <div style={{ fontSize: '0.9rem', color: '#8e94a8' }}>
            {t(
              '至少添加一个供应商后，才能使用图像生成、视频生成、快捷应用和提示词任务。',
              'Add at least one provider to unlock image generation, video generation, quick apps, and prompt tasks.'
            )}
          </div>
        </div>
      )}
    </div>
  )
}
