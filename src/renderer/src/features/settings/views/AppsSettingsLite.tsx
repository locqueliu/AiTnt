import React from 'react'
import { Star } from 'lucide-react'
import Toggle from '../components/Toggle'
import { useSettingsStore } from '../store'
import { liteQuickApps, getQuickAppCopy } from '../../quick_apps/lite/catalog'
import { useAppLanguage } from '../../i18n'

export default function AppsSettingsLite() {
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const providers = useSettingsStore((s) => s.providers)
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const appsProviderId = useSettingsStore((s) => s.appsProviderId)
  const setAppsProvider = useSettingsStore((s) => s.setAppsProvider)
  const pinned = useSettingsStore((s) => s.quickAppsPinned)
  const togglePinned = useSettingsStore((s) => s.toggleQuickAppPinned)
  const enabledMap = useSettingsStore((s) => s.quickAppsEnabled)
  const setEnabled = useSettingsStore((s) => s.setQuickAppEnabled)

  const effectiveProviderId = (appsProviderId || activeProviderId || '').trim()
  const effectiveProvider = providers.find((provider) => provider.id === effectiveProviderId)

  return (
    <div className="st-form-container">
      <div className="st-header">
        <h1>{t('快捷应用', 'Quick Apps')}</h1>
        <p>
          {t(
            '选择快捷应用默认使用的供应商，并决定哪些应用保留在首页网格中。',
            'Choose the default provider for quick apps and decide which apps stay visible on the home grid.'
          )}
        </p>
      </div>

      <div className="st-group">
        <label className="st-label">{t('默认供应商', 'Default provider')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">{t('快捷应用供应商', 'Quick apps provider')}</div>
            <div className="st-inline-desc">
              {t(
                '留空时将跟随当前供应商，也可以把快捷应用固定到专用供应商配置。',
                'Leave this empty to follow the active provider, or pin quick apps to a dedicated provider configuration.'
              )}
            </div>
          </div>
        </div>

        <div className="st-input-wrapper">
          <select
            className="st-input"
            value={appsProviderId || ''}
            onChange={(event) => setAppsProvider(event.target.value ? event.target.value : null)}
          >
            <option value="">{t('跟随当前供应商', 'Follow active provider')}</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name || provider.baseUrl || provider.id}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#8e94a8', marginTop: '6px' }}>
          {effectiveProvider
            ? isZh
              ? `当前快捷应用供应商: ${effectiveProvider.name || effectiveProvider.baseUrl || effectiveProvider.id}`
              : `Current quick-app provider: ${effectiveProvider.name || effectiveProvider.baseUrl || effectiveProvider.id}`
            : t('还没有配置供应商。', 'No provider is configured yet.')}
        </div>
      </div>

      <div className="st-group" style={{ marginTop: 14 }}>
        <label className="st-label">{t('应用可见性', 'App visibility')}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {liteQuickApps.map((app) => {
            const copy = getQuickAppCopy(app, isZh)
            const enabled =
              enabledMap && typeof enabledMap === 'object' ? enabledMap[app.id] !== false : true
            const isPinned = Array.isArray(pinned) ? pinned.includes(app.id) : false

            return (
              <div key={app.id} className="st-inline-row" style={{ alignItems: 'center' }}>
                <div className="st-inline-left">
                  <div className="st-inline-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {copy.name}
                    <button
                      type="button"
                      className="st-refresh-btn"
                      style={{ height: 28, padding: '0 10px' }}
                      onClick={() => togglePinned(app.id)}
                      title={isPinned ? t('从置顶应用中移除', 'Remove from pinned apps') : t('添加到置顶应用', 'Add to pinned apps')}
                    >
                      <Star size={14} style={{ marginRight: 6, color: isPinned ? '#ff7a18' : '#8e94a8' }} />
                      {isPinned ? t('已置顶', 'Pinned') : t('置顶', 'Pin')}
                    </button>
                  </div>
                  <div className="st-inline-desc">{copy.desc}</div>
                </div>
                <Toggle checked={enabled} onChange={(value) => setEnabled(app.id, value)} label={t('启用', 'Enabled')} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
