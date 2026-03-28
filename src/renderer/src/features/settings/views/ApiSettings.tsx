import React, { useState } from 'react'
import { Eye, EyeOff, X, Plus, RefreshCw, Loader2, Star } from 'lucide-react'
import '../styles/settings.css'
import { useSettingsStore } from '../store'
import { listApiKeys, makeKeyId, resolveApiKey } from '../utils/apiKeys'
import axios from 'axios'
import { uiConfirm } from '../../ui/dialogStore'

export default function ApiSettings() {
  const { 
    providers, 
    activeProviderId, 
    setActiveProvider, 
    addProvider, 
    removeProvider, 
    updateProvider,
    togglePinnedModel,
    imageProviderId,
    videoProviderId,
    canvasProviderId,
    setImageProvider,
    setVideoProvider,
    setCanvasProvider
  } = useSettingsStore()

  const [showKey, setShowKey] = useState(false)
  const [search, setSearch] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info', text: string, details?: string } | null>(null)

  const showToast = (kind: 'success' | 'error' | 'info', text: string, details?: string) => {
    setToast({ kind, text, details })
    window.setTimeout(() => {
      setToast(cur => (cur && cur.text === text ? null : cur))
    }, 5200)
  }

  const isComflyUrl = (baseUrl: string) => {
    const s = (baseUrl || '').toLowerCase()
    return s.includes('comfly.chat')
  }

  const joinUrl = (base: string, path: string) => {
    let b = (base || '').trim()
    if (!b.endsWith('/')) b += '/'
    const p = (path || '').replace(/^\//, '')
    return b + p
  }

  const stripTrailingPath = (baseUrl: string, suffix: string) => {
    const b = (baseUrl || '').trim().replace(/\/+$/, '')
    if (!suffix) return b
    const s = suffix.replace(/^\//, '')
    if (b.toLowerCase().endsWith('/' + s.toLowerCase())) {
      return b.slice(0, -(s.length + 1))
    }
    return b
  }

  const looksLikeHtml = (contentType: string, data: any) => {
    const ct = String(contentType || '').toLowerCase()
    if (ct.includes('text/html')) return true
    if (typeof data === 'string' && /<!doctype\s+html|<html/i.test(data)) return true
    return false
  }

  const extractModelsFromResponse = (data: any): string[] => {
    let modelsArray: any[] = []
    if (data && Array.isArray(data.data)) modelsArray = data.data
    else if (data && Array.isArray(data.models)) modelsArray = data.models
    else if (Array.isArray(data)) modelsArray = data

    const out = modelsArray
      .map((m: any) => m?.id || m?.name || m?.model || '')
      .map((s: any) => String(s || ''))
      .map((s: string) => (s.includes('/') ? s.split('/').pop() || s : s))
      .map((s: string) => s.trim())
      .filter(Boolean)

    // 去重（保持顺序）
    const uniq: string[] = []
    const set = new Set<string>()
    for (const m of out) {
      if (set.has(m)) continue
      set.add(m)
      uniq.push(m)
    }
    return uniq
  }

  const isErrorPayload = (data: any) => {
    if (!data || typeof data !== 'object') return false
    if ((data as any).error) return true
    if ((data as any).errors) return true
    return false
  }

  const safePreview = (data: any, max = 800) => {
    try {
      const s = typeof data === 'string' ? data : JSON.stringify(data)
      const t = String(s || '').trim()
      return t.length > max ? t.slice(0, max) + '...' : t
    } catch {
      return ''
    }
  }

  const probeModels = async (candidateUrls: string[], apiKey: string) => {
    const urls = Array.from(new Set(candidateUrls.map(u => String(u || '').trim()).filter(Boolean)))
    const tried: { url: string, status?: number }[] = []
    let lastPreview = ''

    const variants = (url: string, apiKey: string) => {
      const list: { url: string, headers: any }[] = []
      list.push({ url, headers: { 'Authorization': `Bearer ${apiKey}` } })
      list.push({ url: `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`, headers: {} })
      list.push({ url, headers: { 'x-goog-api-key': apiKey } })
      return list
    }

    for (const u of urls) {
      for (const v of variants(u, apiKey || '')) {
        try {
          const resp = await axios.get(v.url, {
            headers: v.headers,
            validateStatus: () => true
          })
          tried.push({ url: v.url, status: resp.status })

          if ([404, 405, 401, 403].includes(resp.status)) continue
          if (looksLikeHtml(resp.headers?.['content-type'], resp.data)) {
            lastPreview = safePreview(resp.data)
            continue
          }

          const models = extractModelsFromResponse(resp.data)
          if (models.length > 0) {
            return { ok: true as const, models, usedUrl: v.url, tried }
          }

          if (isErrorPayload(resp.data)) {
            lastPreview = safePreview(resp.data)
            continue
          }

          // 其他情况：继续尝试下一个
          lastPreview = safePreview(resp.data)
          continue
        } catch (e: any) {
          const status = e?.response?.status
          tried.push({ url: v.url, status })
          if (status === 404 || status === 405 || status === 401 || status === 403) continue
          lastPreview = safePreview(e?.response?.data || e?.message)
          continue
        }
      }
    }

    return { ok: false as const, tried, lastPreview }
  }

  // 状态：当前是否处于“添加新网站”模式
  const [isAddingMode, setIsAddingMode] = useState(false)
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderUrl, setNewProviderUrl] = useState('')

  // 获取当前选中的提供商数据
  const activeProvider = providers.find(p => p.id === activeProviderId)

  // 常用模型预设（每类最多 4 个）
  const pinnedImageModels = activeProvider?.pinnedImageModels || []
  const pinnedPromptModels = activeProvider?.pinnedPromptModels || []
  const pinnedVideoModels = activeProvider?.pinnedVideoModels || []
  const pinnedTranslateModels = (activeProvider as any)?.pinnedTranslateModels || []

  const handleTogglePinned = (type: 'image' | 'prompt' | 'video' | 'translate', model: string) => {
    if (!activeProviderId) return
    const list = type === 'image'
      ? pinnedImageModels
      : (type === 'video'
        ? pinnedVideoModels
        : (type === 'translate' ? pinnedTranslateModels : pinnedPromptModels))
    const exists = list.includes(model)
    if (!exists && list.length >= 4) {
      showToast('info', '每类最多固定 4 个常用模型')
      return
    }
    togglePinnedModel(activeProviderId, type, model)
  }

  // 处理输入框修改，实时同步到 Zustand Store
  const handleUpdate = (updates: any) => {
    if (activeProviderId) {
      updateProvider(activeProviderId, updates)
    }
  }

  // 确认添加自定义 API
  const handleConfirmAdd = () => {
    if (!newProviderName || !newProviderUrl) {
      showToast('error', '请填写名称和地址')
      return
    }
    addProvider(newProviderName, newProviderUrl)
    setIsAddingMode(false)
    setNewProviderName('')
    setNewProviderUrl('')
  }

  // 刷新当前 API 网站下的可用模型列表
  const handleRefreshModels = async () => {
    const modelsApiKey = resolveApiKey(activeProvider, 'models')
    if (!activeProvider || !activeProvider.baseUrl || !modelsApiKey) {
      showToast('error', '请先填写完整的 Base URL 和“模型列表 Key”')
      return
    }

    setIsRefreshing(true)
    try {
      const endpoint = activeProvider.baseUrl.trim().replace(/\/+$/, '')
      const root = stripTrailingPath(stripTrailingPath(endpoint, 'v1'), 'v2')

      // 先按 OpenAI 兼容接口路径探测
      const openaiCandidates = [
        joinUrl(endpoint, 'models'),
        joinUrl(root, 'v1/models'),
        joinUrl(root, 'v2/models'),
        joinUrl(root, 'models'),
        joinUrl(root, 'api/v1/models'),
        joinUrl(root, 'api/models')
      ]

      let r = await probeModels(openaiCandidates, modelsApiKey)

      // comfly：再补一轮 Gemini v1beta/models 探测（有些会走 key / x-goog-api-key）
      if (!r.ok && isComflyUrl(activeProvider.baseUrl)) {
        const geminiCandidates = [
          joinUrl(root, 'v1beta/models'),
          joinUrl(root, 'api/v1beta/models'),
          joinUrl(endpoint, 'v1beta/models'),
          joinUrl(endpoint, 'api/v1beta/models')
        ]
        r = await probeModels(geminiCandidates, modelsApiKey)
      }

      if (!r.ok) {
        const triedText = (r.tried || []).slice(0, 12).map(t => `${t.status || 'ERR'} ${t.url}`).join('\n')
        showToast('error', '无法获取模型列表', `${triedText}${r.lastPreview ? `\n\nlast: ${r.lastPreview}` : ''}`)
        return
      }

      updateProvider(activeProvider.id, { models: r.models })
      showToast('success', `已获取 ${r.models.length} 个模型`, r.usedUrl ? `used: ${r.usedUrl}` : undefined)
    } catch (error: any) {
      showToast(
        'error',
        `刷新失败：${error?.message || '未知错误'}`,
        '常见原因：\n1) API Key 不正确\n2) Base URL 缺少 /v1\n3) 该网站不支持 /models\n4) 网络无法访问该接口'
      )
    } finally {
      setIsRefreshing(false)
    }
  }

  // 状态：当前聚焦的是哪个模型输入框 (image / prompt / video)
  const [activeModelInput, setActiveModelInput] = useState<'image' | 'prompt' | 'video' | 'translate'>('image')

  // 计算过滤后的模型
  const filteredModels = (() => {
    if (!activeProvider) return []
    const all = [
      ...(activeProvider.models || []),
      ...(activeProvider.pinnedImageModels || []),
      ...(activeProvider.pinnedPromptModels || []),
      ...(activeProvider.pinnedVideoModels || []),
      activeProvider.selectedImageModel,
      activeProvider.selectedPromptModel,
      activeProvider.selectedVideoModel || ''
    ]
      .map(s => String(s || '').trim())
      .filter(Boolean)

    const uniq: string[] = []
    const seen = new Set<string>()
    for (const m of all) {
      if (seen.has(m)) continue
      seen.add(m)
      uniq.push(m)
    }

    const q = search.trim().toLowerCase()
    if (!q) return uniq
    return uniq.filter(m => m.toLowerCase().includes(q))
  })()

  return (
    <div className="st-form-container">
      {toast && (
        <div className={`st-toast ${toast.kind}`} onClick={() => setToast(null)} role="status" title="点击关闭">
          <div className="t">{toast.text}</div>
          {toast.details ? <pre className="d">{toast.details}</pre> : null}
        </div>
      )}
      {/* 头部标题区 */}
      <div className="st-header">
        <h1>OpenAI 格式 API</h1>
        <p>支持任何 OpenAI 兼容接口 (如 Google, DeepSeek, Comfly 等)</p>
      </div>

      {/* 第一部分：动态 API 预设标签组 (始终渲染，保证添加功能可用) */}
      <div className="st-group">
        <label className="st-label">选择 API 网站</label>
        <div className="st-presets">
          {providers.length === 0 && (
            <div style={{ color: '#8e94a8', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
              默认暂无网站，请点击右侧按钮添加。
            </div>
          )}

          {providers.map(p => (
            <div
              key={p.id}
              className={`st-preset-tag ${p.id === activeProviderId ? 'active' : ''}`}
              onClick={() => setActiveProvider(p.id)}
            >
              {p.name}
              
                <X 
                  size={12} 
                  className="close-btn" 
                  onClick={async (e) => {
                    e.stopPropagation(); // 阻止触发外层的选中事件
                    const ok = await uiConfirm(`确定要移除 "${p.name}" 吗？`, '移除网站')
                    if (!ok) return
                    removeProvider(p.id)
                  }} 
                />
            </div>
          ))}

          <div className="st-preset-tag" onClick={() => setIsAddingMode(!isAddingMode)}>
            <Plus size={14} /> 添加
          </div>
        </div>

        {/* 动态展开的添加模式 */}
        {isAddingMode && (
          <div
            className="st-add-row"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <input 
              autoFocus
              className="st-input" 
              placeholder="网站简称 (如: 我的接口)" 
              value={newProviderName}
              onChange={e => setNewProviderName(e.target.value)}
              style={{ flex: 1 }}
            />
            <input 
              className="st-input" 
              placeholder="Base URL (例如: https://ai.comfly.chat/v1)" 
              value={newProviderUrl}
              onChange={e => setNewProviderUrl(e.target.value)}
              style={{ flex: 2 }}
            />
            <button className="st-save-btn" style={{ marginTop: 0, padding: '0 20px', width: 'auto' }} onClick={handleConfirmAdd}>
              确认添加
            </button>
          </div>
        )}
      </div>

      {/* 功能网站分配：不同模块可使用不同网站（避免某些网站不支持图片/视频） */}
      <div className="st-group" style={{ marginTop: 16 }}>
        <label className="st-label">功能 API 网站分配</label>
        <div className="st-key-hint">
          说明：上方“选择 API 网站”用于编辑网站配置；这里决定【图像 / 视频 / 画布】各自实际调用哪个网站。
          留空表示“跟随当前选中网站”。
        </div>

        {(() => {
          const followLabel = activeProvider ? `跟随当前（${activeProvider.name}）` : '跟随当前（未选择）'
          const render = (label: string, value: string | null, onChange: (id: string | null) => void) => (
            <div className="st-key-usage-row" key={label}>
              <div className="st-key-usage-label">{label}</div>
              <select
                className="st-input"
                value={value || ''}
                onChange={(e) => onChange(e.target.value ? e.target.value : null)}
                disabled={providers.length === 0}
              >
                <option value="">{followLabel}</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )

          return (
            <div className="st-key-usage-grid">
              {render('图像', imageProviderId, setImageProvider)}
              {render('视频', videoProviderId, setVideoProvider)}
              {render('画布', canvasProviderId, setCanvasProvider)}
            </div>
          )
        })()}
      </div>

      {/* 如果没有选中的网站，提示用户先添加 */}
      {!activeProvider ? (
        <div style={{ color: '#8e94a8', textAlign: 'center', padding: '60px 0', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12, marginTop: 20 }}>
          <div style={{ marginBottom: 16 }}>还没有配置任何 API 网站</div>
          <button 
            className="st-save-btn" 
            style={{ width: 'auto', padding: '10px 24px', margin: '0 auto' }}
            onClick={() => setIsAddingMode(true)}
          >
            立即添加
          </button>
        </div>
      ) : (
        <>
          {/* 第二部分：API 地址与密钥配置 (绑定到当前选中的供应商) */}
          <div className="st-group">
            <label className="st-label">API 地址 (Base URL)</label>
            <div className="st-input-wrapper">
              <input 
                type="text" 
                className="st-input" 
                value={activeProvider.baseUrl}
                onChange={(e) => handleUpdate({ baseUrl: e.target.value })}
                placeholder="例如: https://api.openai.com/v1"
              />
            </div>
          </div>

          <div className="st-group">
            <label className="st-label">API Keys（支持多 Key / 分组）</label>

            <div className="st-key-hint">
              说明：部分中转站同一网站下有不同 Key 分组（便宜/优质）。可在这里维护多个 Key，并在下方把 Key 分配给“生图/优化/翻译/视频/模型列表”。
            </div>

            {(((activeProvider as any).apiKeys || []) as any[]).length === 0 ? (
              <div style={{ color: '#8e94a8', fontSize: '0.85rem' }}>
                当前没有 Key。请先添加一个。
              </div>
            ) : (
              <div className="st-key-list">
                {(((activeProvider as any).apiKeys || []) as any[]).map((k: any, idx: number) => (
                  <div key={k.id || idx} className="st-key-row">
                    <input
                      className="st-input st-key-name"
                      placeholder="Key 名称（如：便宜/优质）"
                      value={String(k.name || '')}
                      onChange={(e) => {
                        const list = [ ...(((activeProvider as any).apiKeys || []) as any[]) ]
                        list[idx] = { ...list[idx], name: e.target.value }
                        handleUpdate({ apiKeys: list, apiKey: String(list[0]?.apiKey || '') })
                      }}
                    />
                    <input
                      className="st-input st-key-group"
                      placeholder="分组（如：default / gemini优质）"
                      value={String(k.group || '')}
                      onChange={(e) => {
                        const list = [ ...(((activeProvider as any).apiKeys || []) as any[]) ]
                        list[idx] = { ...list[idx], group: e.target.value }
                        handleUpdate({ apiKeys: list, apiKey: String(list[0]?.apiKey || '') })
                      }}
                    />

                    <div className="st-input-wrapper st-key-input">
                      <input
                        type={showKey ? 'text' : 'password'}
                        className="st-input"
                        placeholder={`输入 ${activeProvider.name} Key`}
                        value={String(k.apiKey || '')}
                        onChange={(e) => {
                          const list = [ ...(((activeProvider as any).apiKeys || []) as any[]) ]
                          list[idx] = { ...list[idx], apiKey: e.target.value }
                          handleUpdate({ apiKeys: list, apiKey: String(list[0]?.apiKey || '') })
                        }}
                      />
                      <div className="st-eye-icon" onClick={() => setShowKey(!showKey)}>
                        {showKey ? <Eye size={18} /> : <EyeOff size={18} />}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="st-key-remove"
                      title="移除 Key"
                      onClick={() => {
                        const list = [ ...(((activeProvider as any).apiKeys || []) as any[]) ]
                        const removed = list.splice(idx, 1)
                        // 如果删到 0 个，至少保留 1 个空 key
                        if (list.length === 0) {
                          const id = makeKeyId()
                          list.push({ id, name: '默认', group: 'default', apiKey: '' })
                          handleUpdate({
                            apiKeys: list,
                            apiKey: '',
                            keyUsage: {
                              imageKeyId: id,
                              promptKeyId: id,
                              translateKeyId: id,
                              videoKeyId: id,
                              modelsKeyId: id
                            }
                          })
                          return
                        }

                        const removedId = String(removed?.[0]?.id || '')
                        const usage = { ...((activeProvider as any).keyUsage || {}) }
                        for (const key of ['imageKeyId', 'promptKeyId', 'translateKeyId', 'videoKeyId', 'modelsKeyId']) {
                          if (usage[key] && String(usage[key]) === removedId) usage[key] = String(list[0]?.id || '')
                        }

                        handleUpdate({ apiKeys: list, apiKey: String(list[0]?.apiKey || ''), keyUsage: usage })
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="st-save-btn"
              style={{ width: 'auto', padding: '10px 16px', marginTop: 10 }}
              onClick={() => {
                const list = [ ...((((activeProvider as any).apiKeys || []) as any[])) ]
                const id = makeKeyId()
                list.push({ id, name: `Key ${list.length + 1}`, group: '', apiKey: '' })
                const usage = { ...((activeProvider as any).keyUsage || {}) }
                if (!usage.imageKeyId) usage.imageKeyId = String(list[0]?.id || id)
                if (!usage.promptKeyId) usage.promptKeyId = String(list[0]?.id || id)
                if (!usage.translateKeyId) usage.translateKeyId = String(list[0]?.id || id)
                if (!usage.videoKeyId) usage.videoKeyId = String(list[0]?.id || id)
                if (!usage.modelsKeyId) usage.modelsKeyId = String(list[0]?.id || id)
                handleUpdate({ apiKeys: list, apiKey: String(list[0]?.apiKey || ''), keyUsage: usage })
              }}
            >
              <Plus size={14} /> 添加 Key
            </button>

            <div className="st-key-usage">
              <div className="st-key-usage-title">Key 用途分配</div>
              {(() => {
                const options = listApiKeys(activeProvider)
                const usage = (activeProvider as any).keyUsage || {}
                const renderSelect = (label: string, keyName: string) => (
                  <div className="st-key-usage-row" key={keyName}>
                    <div className="st-key-usage-label">{label}</div>
                    <select
                      className="st-input"
                      value={String(usage[keyName] || '')}
                      onChange={(e) => {
                        handleUpdate({ keyUsage: { ...usage, [keyName]: e.target.value } })
                      }}
                    >
                      {options.map(o => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )
                return (
                  <div className="st-key-usage-grid">
                    {renderSelect('生图', 'imageKeyId')}
                    {renderSelect('优化', 'promptKeyId')}
                    {renderSelect('翻译', 'translateKeyId')}
                    {renderSelect('视频', 'videoKeyId')}
                    {renderSelect('模型列表', 'modelsKeyId')}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* 第三部分：模型选择配置 */}
          <div className="st-group" style={{ marginTop: '16px' }}>
            <div className="st-models-header">
              <label className="st-label" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                可用模型
                <input 
                  type="text" 
                  className="st-search-input" 
                  placeholder="搜索模型..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button className={`st-refresh-btn ${isRefreshing ? 'loading' : ''}`} onClick={handleRefreshModels} disabled={isRefreshing}>
                {isRefreshing ? <Loader2 size={14} className="spin-icon" /> : <RefreshCw size={14} />} 
                {isRefreshing ? '请求中...' : '刷新列表'}
              </button>
            </div>

            {/* 常用模型预设：用于生图页快速切换，减少反复搜索 */}
            <div className="st-pinned-wrap">
              <div className="st-pinned-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Star size={16} /> 常用模型预设
                </div>
                  <div className="st-pinned-hint">生图/优化/翻译/视频各最多 4 个，点击右侧星标可加入/移除</div>
              </div>

              <div className="st-pinned-row">
                <div className="st-pinned-label">生图常用</div>
                <div className="st-pinned-chips">
                  {pinnedImageModels.length === 0 ? (
                    <div className="st-pinned-empty">未设置</div>
                  ) : (
                    pinnedImageModels.map(m => (
                      <div key={m} className="st-pinned-chip" title="点击切换为当前生图模型" onClick={() => handleUpdate({ selectedImageModel: m })}>
                        <Star size={14} className="st-pinned-chip-icon" />
                        <span className="st-pinned-chip-text">{m}</span>
                        <button
                          className="st-pinned-chip-remove"
                          title="移除"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTogglePinned('image', m)
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="st-pinned-row">
                <div className="st-pinned-label">优化常用</div>
                <div className="st-pinned-chips">
                  {pinnedPromptModels.length === 0 ? (
                    <div className="st-pinned-empty">未设置</div>
                  ) : (
                    pinnedPromptModels.map(m => (
                      <div key={m} className="st-pinned-chip" title="点击切换为当前优化模型" onClick={() => handleUpdate({ selectedPromptModel: m })}>
                        <Star size={14} className="st-pinned-chip-icon" />
                        <span className="st-pinned-chip-text">{m}</span>
                        <button
                          className="st-pinned-chip-remove"
                          title="移除"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTogglePinned('prompt', m)
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="st-pinned-row">
                <div className="st-pinned-label">翻译常用</div>
                <div className="st-pinned-chips">
                  {pinnedTranslateModels.length === 0 ? (
                    <div className="st-pinned-empty">未设置</div>
                  ) : (
                    pinnedTranslateModels.map((m: string) => (
                      <div key={m} className="st-pinned-chip" title="点击切换为当前翻译模型" onClick={() => handleUpdate({ selectedTranslateModel: m })}>
                        <Star size={14} className="st-pinned-chip-icon" />
                        <span className="st-pinned-chip-text">{m}</span>
                        <button
                          className="st-pinned-chip-remove"
                          title="移除"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTogglePinned('translate', m)
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="st-pinned-row">
                <div className="st-pinned-label">视频常用</div>
                <div className="st-pinned-chips">
                  {pinnedVideoModels.length === 0 ? (
                    <div className="st-pinned-empty">未设置</div>
                  ) : (
                    pinnedVideoModels.map(m => (
                      <div key={m} className="st-pinned-chip" title="点击切换为当前视频模型" onClick={() => handleUpdate({ selectedVideoModel: m })}>
                        <Star size={14} className="st-pinned-chip-icon" />
                        <span className="st-pinned-chip-text">{m}</span>
                        <button
                          className="st-pinned-chip-remove"
                          title="移除"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTogglePinned('video', m)
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="st-pinned-mode">
                当前星标操作：{activeModelInput === 'image'
                  ? '固定到生图常用'
                  : (activeModelInput === 'video'
                    ? '固定到视频常用'
                    : (activeModelInput === 'translate' ? '固定到翻译常用' : '固定到优化常用'))}（通过点击下方输入框切换）
              </div>
            </div>

            {/* 模型标签滚动容器 */}
            <div className="st-models-container">
              {filteredModels.length === 0 && (
                <div style={{ color: '#8e94a8', fontSize: '0.85rem', width: '100%', textAlign: 'center', padding: '20px 0' }}>
                  无模型数据。请填写 Key 后点击右侧“刷新列表”获取。
                </div>
              )}
              
                {filteredModels.map(m => {
                  // 判断当前标签是否属于其中一个选中的模型
                  const isActiveImage = m === activeProvider.selectedImageModel
                  const isActivePrompt = m === activeProvider.selectedPromptModel
                  const isActiveVideo = m === (activeProvider.selectedVideoModel || '')
                  const isActiveTranslate = m === ((activeProvider as any).selectedTranslateModel || '')

                  // 星标固定：跟随当前聚焦输入框（image/prompt）
                  const pinList = activeModelInput === 'image'
                    ? pinnedImageModels
                    : (activeModelInput === 'video'
                      ? pinnedVideoModels
                      : (activeModelInput === 'translate' ? pinnedTranslateModels : pinnedPromptModels))
                  const isPinned = pinList.includes(m)
                  
                  return (
                    <div 
                      key={m} 
                      className={`st-model-tag ${isActiveImage || isActivePrompt || isActiveVideo || isActiveTranslate ? 'active' : ''}`}
                      onClick={() => {
                       // 根据当前选中的输入框决定填入哪个值
                       if (activeModelInput === 'image') {
                         handleUpdate({ selectedImageModel: m })
                       } else if (activeModelInput === 'video') {
                         handleUpdate({ selectedVideoModel: m })
                        } else if (activeModelInput === 'translate') {
                          handleUpdate({ selectedTranslateModel: m })
                       } else {
                         handleUpdate({ selectedPromptModel: m })
                       }
                       }}
                      >
                      <span className="st-model-tag-text">{m}</span>
                      <button
                        className={`st-model-pin ${isPinned ? 'pinned' : ''}`}
                        title={isPinned ? '移除常用' : '加入常用'}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTogglePinned(activeModelInput, m)
                        }}
                      >
                        <Star size={14} />
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* 第四部分：当前选中的模型展示 */}
          <div className="st-current-models">
            <div className="st-current-group">
              <label className="st-label">当前生图模型 (点击选择)</label>
              <input 
                type="text" 
                className={`st-current-input ${activeModelInput === 'image' ? 'highlight' : ''}`}
                value={activeProvider.selectedImageModel}
                onChange={(e) => handleUpdate({ selectedImageModel: e.target.value })}
                onFocus={() => setActiveModelInput('image')}
                placeholder="例如: dall-e-3"
              />
            </div>

            <div className="st-current-group">
              <label className="st-label">当前视频模型 (点击选择)</label>
              <input
                type="text"
                className={`st-current-input ${activeModelInput === 'video' ? 'highlight' : ''}`}
                value={activeProvider.selectedVideoModel || ''}
                onChange={(e) => handleUpdate({ selectedVideoModel: e.target.value })}
                onFocus={() => setActiveModelInput('video')}
                placeholder="例如: veo3.1-fast"
              />
            </div>

            <div className="st-current-group">
              <label className="st-label">提示词优化模型 (点击选择)</label>
              <input 
                type="text" 
                className={`st-current-input ${activeModelInput === 'prompt' ? 'highlight' : ''}`}
                value={activeProvider.selectedPromptModel}
                onChange={(e) => handleUpdate({ selectedPromptModel: e.target.value })}
                onFocus={() => setActiveModelInput('prompt')}
                placeholder="例如: gpt-4"
              />
            </div>

            <div className="st-current-group">
              <label className="st-label">提示词翻译模型 (点击选择)</label>
              <input
                type="text"
                className={`st-current-input ${activeModelInput === 'translate' ? 'highlight' : ''}`}
                value={(activeProvider as any).selectedTranslateModel || ''}
                onChange={(e) => handleUpdate({ selectedTranslateModel: e.target.value })}
                onFocus={() => setActiveModelInput('translate')}
                placeholder="例如: gpt-4o-mini"
              />
            </div>
          </div>

          <div style={{ color: '#8e94a8', fontSize: '0.8rem', textAlign: 'center', marginTop: 10 }}>
            提示：您的配置在修改时会自动持久化保存，无需点击额外保存按钮。
          </div>
        </>
      )}
    </div>
  )
}
