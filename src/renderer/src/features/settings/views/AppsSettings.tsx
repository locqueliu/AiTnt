import React from 'react'
import { Star } from 'lucide-react'
import Toggle from '../components/Toggle'
import { useSettingsStore } from '../store'
import { quickAppsCatalog } from '../../quick_apps/apps/loadApps'

export default function AppsSettings() {
  const providers = useSettingsStore(s => s.providers)
  const activeProviderId = useSettingsStore(s => s.activeProviderId)
  const appsProviderId = useSettingsStore(s => s.appsProviderId)
  const setAppsProvider = useSettingsStore(s => s.setAppsProvider)

  const pinned = useSettingsStore(s => s.quickAppsPinned)
  const togglePinned = useSettingsStore(s => s.toggleQuickAppPinned)
  const enabledMap = useSettingsStore(s => s.quickAppsEnabled)
  const setEnabled = useSettingsStore(s => s.setQuickAppEnabled)

  const effectiveProviderId = (appsProviderId || activeProviderId || '').trim()
  const effectiveProvider = providers.find(p => p.id === effectiveProviderId)

  return (
    <div className="st-form-container">
      <div className="st-header">
        <h1>应用设置</h1>
        <p>管理快捷应用（小工具/工作流）的默认 API 网站与显示状态</p>
      </div>

      <div className="st-group">
        <label className="st-label">默认 API 网站</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">快捷应用默认使用</div>
            <div className="st-inline-desc">为空则跟随当前选中的 API 网站；也可以单独固定为某个网站。</div>
          </div>
        </div>

        <div className="st-input-wrapper">
          <select
            className="st-input"
            value={appsProviderId || ''}
            onChange={(e) => setAppsProvider(e.target.value ? e.target.value : null)}
          >
            <option value="">跟随当前（active）</option>
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name || p.baseUrl || p.id}</option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#8e94a8', marginTop: '6px' }}>
          {effectiveProvider ? `当前生效：${effectiveProvider.name || effectiveProvider.baseUrl}` : '当前未配置任何 API 网站'}
        </div>
      </div>

      <div className="st-group" style={{ marginTop: 14 }}>
        <label className="st-label">应用管理</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {quickAppsCatalog.list.map(app => {
            const id = app.meta.id
            const enabled = enabledMap && typeof enabledMap === 'object' ? enabledMap[id] !== false : true
            const isPinned = Array.isArray(pinned) ? pinned.includes(id) : false
            return (
              <div key={id} className="st-inline-row" style={{ alignItems: 'center' }}>
                <div className="st-inline-left">
                  <div className="st-inline-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {app.meta.name}
                    <button
                      type="button"
                      className="st-refresh-btn"
                      style={{ height: 28, padding: '0 10px' }}
                      onClick={() => togglePinned(id)}
                      title={isPinned ? '移出已收藏' : '加入已收藏'}
                    >
                      <Star size={14} style={{ marginRight: 6, color: isPinned ? '#00e5ff' : '#8e94a8' }} />
                      {isPinned ? '已收藏' : '加入已收藏'}
                    </button>
                  </div>
                  <div className="st-inline-desc">{app.meta.desc || '快捷工作流'}</div>
                </div>
                <Toggle
                  checked={enabled}
                  onChange={(v) => setEnabled(id, v)}
                  label="启用"
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
