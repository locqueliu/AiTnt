import React from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { BriefcaseBusiness, Layers3, Pin, Settings2, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../../settings/store'
import { useAppLanguage } from '../../i18n'
import { usePromptLibraryStore } from '../prompt_library/store'
import { useProductShotTaskStore } from '../product_shot_tasks/store'
import { liteQuickApps } from './catalog'
import '../../workstation/workstation.css'

function isActivePath(pathname: string, path: string) {
  if (path === '/apps') {
    return pathname === '/apps'
  }
  return pathname === path || pathname.startsWith(`${path}/`)
}

export default function QuickAppsTabs() {
  const location = useLocation()
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const providers = useSettingsStore((s) => s.providers)
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const appsProviderId = useSettingsStore((s) => s.appsProviderId)
  const setAppsProvider = useSettingsStore((s) => s.setAppsProvider)
  const quickAppsPinned = useSettingsStore((s) => s.quickAppsPinned)

  const promptSets = usePromptLibraryStore((s) => s.sets.filter((entry) => entry.appId === 'product_shot'))
  const tasks = useProductShotTaskStore((s) => s.tasks)

  const navItems = [
    { path: '/apps', label: t('全部应用', 'All Apps') },
    { path: '/apps/pinned', label: t('已置顶', 'Pinned') },
    { path: '/apps/prompts', label: t('提示词集', 'Prompt Sets') },
    { path: '/apps/tasks', label: t('任务台', 'Task Desk') }
  ]

  const providerValue = appsProviderId || ''
  const effectiveProviderId = (appsProviderId || activeProviderId || '').trim()
  const provider = providers.find((entry) => entry.id === effectiveProviderId) || null
  const runningTasks = tasks.filter((task) => task.currentStep !== 'done').length

  return (
    <div className="apps-shell">
      <section className="apps-hero">
        <div className="apps-hero-copy">
          <div className="ws-kicker">
            <Sparkles size={14} />
            <span>{t('AiTnt 快捷应用', 'AiTnt Quick Apps')}</span>
          </div>
          <h1 className="apps-title">
            {t('把成套工作流收纳进一个干净的任务界面中。', 'Operate packaged workflows from one clean task surface.')}
          </h1>
          <p className="apps-copy">
            {t(
              '快捷应用沿用统一的供应商设置，但每个工作流现在都运行在为 AiTnt 重构的独立界面里。',
              'Quick apps reuse the shared provider settings, but each workflow now lives inside a clean-room interface built for `AiTnt`.'
            )}
          </p>

          <div className="apps-chip-row">
            <div className="ws-chip">{t('应用数', 'Apps')}: {liteQuickApps.length}</div>
            <div className="ws-chip">{t('置顶数', 'Pinned')}: {quickAppsPinned.length}</div>
            <div className="ws-chip">{t('提示词集', 'Prompt sets')}: {promptSets.length}</div>
            <div className="ws-chip">{t('运行中任务', 'Running tasks')}: {runningTasks}</div>
          </div>
        </div>

        <div className="apps-hero-panel">
          <div className="apps-panel-headline">{t('共享应用供应商', 'Shared App Provider')}</div>
          <div className="apps-panel-title">{provider?.name || t('跟随当前供应商', 'Follow active provider')}</div>
          <div className="apps-panel-copy">
            {t(
              '商品图和风格化工作流默认都使用这个供应商；如果留空，则回退到全局当前供应商。',
              'Product-shot and stylize workflows both use this provider unless you leave the field empty to follow the active global provider.'
            )}
          </div>

          <div className="ws-field">
            <label className="ws-label">{t('供应商', 'Provider')}</label>
            <select
              className="ws-select"
              value={providerValue}
              onChange={(event) => setAppsProvider(event.target.value ? event.target.value : null)}
            >
              <option value="">{t('跟随当前供应商', 'Follow active provider')}</option>
              {providers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name || entry.baseUrl || entry.id}
                </option>
              ))}
            </select>
          </div>

          <Link to="/settings" className="ws-link-btn">
            <Settings2 size={16} />
            {t('供应商设置', 'Provider settings')}
          </Link>
        </div>
      </section>

      <nav className="apps-subnav" aria-label={t('快捷应用分区', 'Quick app sections')}>
        {navItems.map((item) => (
          <Link key={item.path} to={item.path} className={isActivePath(location.pathname, item.path) ? 'active' : ''}>
            {item.path === '/apps' ? (
              <Layers3 size={15} />
            ) : item.path === '/apps/pinned' ? (
              <Pin size={15} />
            ) : item.path === '/apps/tasks' ? (
              <BriefcaseBusiness size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <section className="apps-page">
        <Outlet />
      </section>
    </div>
  )
}
