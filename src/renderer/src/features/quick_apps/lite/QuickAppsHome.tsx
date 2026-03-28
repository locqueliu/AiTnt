import React from 'react'
import { ArrowRight, Pin, PinOff, Power, PowerOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../../settings/store'
import { useAppLanguage } from '../../i18n'
import { usePromptLibraryStore } from '../prompt_library/store'
import { useProductShotTaskStore } from '../product_shot_tasks/store'
import { liteQuickApps, type LiteQuickApp, getQuickAppCopy } from './catalog'
import '../../workstation/workstation.css'

type Props = {
  mode: 'all' | 'pinned'
}

function sortApps(apps: LiteQuickApp[], order: string[]) {
  const orderMap = new Map((order || []).map((id, index) => [id, index]))
  return apps.slice().sort((a, b) => {
    const aIndex = orderMap.has(a.id) ? Number(orderMap.get(a.id)) : Number.MAX_SAFE_INTEGER
    const bIndex = orderMap.has(b.id) ? Number(orderMap.get(b.id)) : Number.MAX_SAFE_INTEGER
    if (aIndex !== bIndex) return aIndex - bIndex
    return a.name.localeCompare(b.name)
  })
}

export default function QuickAppsHome({ mode }: Props) {
  const navigate = useNavigate()
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const quickAppsPinned = useSettingsStore((s) => s.quickAppsPinned)
  const toggleQuickAppPinned = useSettingsStore((s) => s.toggleQuickAppPinned)
  const quickAppsEnabled = useSettingsStore((s) => s.quickAppsEnabled)
  const setQuickAppEnabled = useSettingsStore((s) => s.setQuickAppEnabled)
  const quickAppsOrder = useSettingsStore((s) => s.quickAppsOrder)

  const promptSets = usePromptLibraryStore((s) => s.sets.filter((entry) => entry.appId === 'product_shot'))
  const tasks = useProductShotTaskStore((s) => s.tasks)

  const orderedApps = React.useMemo(() => sortApps(liteQuickApps, quickAppsOrder), [quickAppsOrder])
  const visibleApps = orderedApps.filter((app) => (mode === 'pinned' ? quickAppsPinned.includes(app.id) : true))

  return (
    <div className="apps-stack">
      <div className="apps-section-head">
        <div>
          <div className="apps-section-title">{mode === 'pinned' ? t('置顶应用', 'Pinned Apps') : t('应用目录', 'App Catalog')}</div>
          <div className="apps-section-copy">
            {mode === 'pinned'
              ? t('直接进入你最常回访的工作流。', 'Jump straight into the workflows you revisit most often.')
              : t(
                  '下面每个应用都是重构后的工作流界面，保留核心行为，同时不再依赖受损的旧 UI。',
                  'Each app below is a rebuilt workflow surface that keeps the useful behavior without relying on the damaged legacy UI.'
                )}
          </div>
        </div>
      </div>

      <div className="apps-metric-grid">
        <div className="apps-metric">
          <strong>{visibleApps.length}</strong>
          <span>{mode === 'pinned' ? t('置顶工作流', 'Pinned workflows') : t('可用工作流', 'Available workflows')}</span>
        </div>
        <div className="apps-metric">
          <strong>{promptSets.length}</strong>
          <span>{t('商品图提示词集', 'Product-shot prompt sets')}</span>
        </div>
        <div className="apps-metric">
          <strong>{tasks.length}</strong>
          <span>{t('已保存商品图任务', 'Stored product-shot tasks')}</span>
        </div>
      </div>

      {visibleApps.length === 0 ? (
        <div className="ws-empty">
          <strong>{mode === 'pinned' ? t('还没有置顶应用', 'No pinned apps yet') : t('当前没有可用应用', 'No apps available')}</strong>
          {mode === 'pinned'
            ? t('先从应用目录里置顶一个工作流，它就会出现在这里。', 'Pin one of the workflows from the catalog so it appears here.')
            : t('当前应用目录为空。', 'The app catalog is currently empty.')}
        </div>
      ) : (
        <div className="apps-card-grid">
          {visibleApps.map((app) => {
            const copy = getQuickAppCopy(app, isZh)
            const pinned = quickAppsPinned.includes(app.id)
            const enabled = quickAppsEnabled[app.id] !== false
            return (
              <div key={app.id} className={`apps-card ${enabled ? '' : 'muted'}`}>
                <div className="apps-card-head">
                  <div>
                    <div className="apps-card-title">{copy.name}</div>
                    <div className="apps-card-sub">{copy.category}</div>
                  </div>
                  <div className={`apps-badge ${pinned ? 'accent' : ''}`}>{copy.badge}</div>
                </div>

                <p className="apps-card-copy">{copy.desc}</p>

                <div className="ws-chip-row">
                  {copy.keywords.map((keyword) => (
                    <div key={keyword} className="ws-chip">
                      {keyword}
                    </div>
                  ))}
                </div>

                <div className="apps-card-actions">
                  <button type="button" className="ws-btn" onClick={() => navigate(`/apps/${app.id}`)}>
                    {t('打开应用', 'Open app')}
                    <ArrowRight size={16} />
                  </button>
                  <button type="button" className="ws-btn secondary" onClick={() => toggleQuickAppPinned(app.id)}>
                    {pinned ? <PinOff size={16} /> : <Pin size={16} />}
                    {pinned ? t('取消置顶', 'Unpin') : t('置顶', 'Pin')}
                  </button>
                  <button type="button" className="ws-btn secondary" onClick={() => setQuickAppEnabled(app.id, !enabled)}>
                    {enabled ? <PowerOff size={16} /> : <Power size={16} />}
                    {enabled ? t('停用', 'Disable') : t('启用', 'Enable')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
