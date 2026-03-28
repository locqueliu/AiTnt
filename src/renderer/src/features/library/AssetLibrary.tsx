import React from 'react'
import { ArrowRight, FolderOpen, LayoutGrid, LibraryBig, Settings2, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../settings/store'
import { useAppLanguage } from '../i18n'
import { usePromptLibraryStore } from '../quick_apps/prompt_library/store'
import { useProductShotTaskStore } from '../quick_apps/product_shot_tasks/store'
import { liteQuickApps, getQuickAppCopy } from '../quick_apps/lite/catalog'
import '../workstation/workstation.css'

function normalizeDirectoryPath(value: string) {
  return value.replace(/[\\/]+$/, '')
}

function getDirectorySeparator(value: string) {
  return value.includes('\\') ? '\\' : '/'
}

function summarizeDirectoryPath(value: string) {
  const normalized = normalizeDirectoryPath(value)
  const separator = getDirectorySeparator(normalized)
  const parts = normalized.split(/[\\/]/).filter(Boolean)

  if (parts.length >= 2) {
    return parts.slice(-2).join(separator)
  }

  return normalized
}

function compactDirectoryPath(value: string, maxLength = 42) {
  const normalized = normalizeDirectoryPath(value)

  if (normalized.length <= maxLength) {
    return normalized
  }

  const separator = getDirectorySeparator(normalized)
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  const tail = parts.slice(-2).join(separator)
  const driveMatch = normalized.match(/^[A-Za-z]:/)

  if (driveMatch) {
    return `${driveMatch[0]}${separator}...${separator}${tail}`
  }

  if (normalized.startsWith('\\\\')) {
    return `...${separator}${tail}`
  }

  if (normalized.startsWith('/')) {
    return `${separator}...${separator}${tail}`
  }

  return `...${separator}${tail}`
}

export default function AssetLibrary() {
  const navigate = useNavigate()
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const outputDirectory = useSettingsStore((s) => s.outputDirectory)
  const videoOutputDirectory = useSettingsStore((s) => s.videoOutputDirectory)
  const providers = useSettingsStore((s) => s.providers)
  const promptSets = usePromptLibraryStore((s) => s.sets.filter((entry) => entry.appId === 'product_shot'))
  const activeSetId = usePromptLibraryStore((s) => s.activeSetIdByApp.product_shot)
  const tasks = useProductShotTaskStore((s) => s.tasks)

  const activePromptSet = promptSets.find((entry) => entry.id === activeSetId) || promptSets[0] || null
  const favoriteSets = promptSets.filter((entry) => Boolean(entry.favorite)).slice(0, 4)
  const queuedTasks = tasks.filter((task) => task.currentStep !== 'done').length

  return (
    <div className="ws-shell">
      <section className="ws-hero">
        <div className="ws-hero-copy">
          <div className="ws-kicker">
            <Sparkles size={14} />
            <span>{t('AiTnt 资产资源库', 'AiTnt Asset Library')}</span>
          </div>
          <h1 className="ws-title">
            {t(
              '把提示词集、应用预设和输出目录集中到一个可复用资源库中。',
              'Keep prompt sets, app presets, and output destinations within one reusable library.'
            )}
          </h1>
          <p className="ws-subtitle">
            {t(
              '这个重构后的资源库页面聚焦于仍可稳定编译的可复用内容：商品图提示词集、快捷应用入口、供应商清单和本地输出根目录。',
              'This rebuilt library page focuses on reusable prompt assets and workspace state that still compile cleanly: product-shot prompt sets, quick-app access, provider inventory, and local output roots.'
            )}
          </p>

          <div className="ws-chip-row">
            <div className="ws-chip">{t('提示词集', 'Prompt sets')}: {promptSets.length}</div>
            <div className="ws-chip">{t('供应商', 'Providers')}: {providers.length}</div>
            <div className="ws-chip">{t('排队任务', 'Queued tasks')}: {queuedTasks}</div>
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn" onClick={() => navigate('/apps/prompts')}>
              {t('打开提示词集', 'Open Prompt Sets')}
              <ArrowRight size={16} />
            </button>
            <button type="button" className="ws-btn secondary" onClick={() => navigate('/apps/tasks')}>
              {t('打开任务台', 'Open Task Desk')}
            </button>
          </div>
        </div>

        <div className="ws-stat-grid">
          <div className="ws-stat">
            <strong>{activePromptSet?.name || t('无', 'None')}</strong>
            <span>{t('当前商品图模板', 'Active product-shot template')}</span>
          </div>
          <div className="ws-stat">
            <strong title={outputDirectory || undefined}>
              {outputDirectory ? summarizeDirectoryPath(outputDirectory) : t('未设置', 'Unset')}
            </strong>
            {outputDirectory ? (
              <div className="ws-stat-path" title={outputDirectory}>
                {compactDirectoryPath(outputDirectory)}
              </div>
            ) : null}
            <span>{t('图像输出根目录', 'Image output root')}</span>
          </div>
          <div className="ws-stat">
            <strong title={videoOutputDirectory || undefined}>
              {videoOutputDirectory ? summarizeDirectoryPath(videoOutputDirectory) : t('未设置', 'Unset')}
            </strong>
            {videoOutputDirectory ? (
              <div className="ws-stat-path" title={videoOutputDirectory}>
                {compactDirectoryPath(videoOutputDirectory)}
              </div>
            ) : null}
            <span>{t('视频输出根目录', 'Video output root')}</span>
          </div>
        </div>
      </section>

      <section className="ws-grid">
        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('提示词集架', 'Prompt Set Shelf')}</div>
              <div className="ws-panel-note">
                {t(
                  '这些可复用提示词集支撑着 clean-room 重构后的商品图流水线。',
                  'These reusable prompt sets power the clean-room product-shot pipeline.'
                )}
              </div>
            </div>
            <Link to="/apps/prompts" className="ws-link-btn">
              <LibraryBig size={16} />
              {t('管理', 'Manage')}
            </Link>
          </div>

          {promptSets.length === 0 ? (
            <div className="ws-empty">
              <strong>{t('还没有提示词集', 'No prompt sets yet')}</strong>
              {t('先去提示词集管理器创建第一组可复用模板，再回来查看。', 'Create your first reusable set from the prompt-set manager to populate this library.')}
            </div>
          ) : (
            <div className="apps-card-grid">
              {(favoriteSets.length > 0 ? favoriteSets : promptSets.slice(0, 4)).map((set) => (
                <div key={set.id} className="apps-card">
                  <div className="apps-card-head">
                    <div>
                      <div className="apps-card-title">{set.name}</div>
                      <div className="apps-card-sub">{set.category || t('未分类', 'Uncategorized')}</div>
                    </div>
                    <div className={`apps-badge ${set.id === activeSetId ? 'accent' : ''}`}>
                      {set.id === activeSetId ? t('当前', 'Active') : set.favorite ? t('收藏', 'Favorite') : t('模板', 'Set')}
                    </div>
                  </div>

                  <p className="apps-card-copy">
                    {set.agent3Template.slice(0, 180)}
                    {set.agent3Template.length > 180 ? '...' : ''}
                  </p>

                  <div className="ws-chip-row">
                    {(set.tags || []).slice(0, 4).map((tag) => (
                      <div key={tag} className="ws-chip">
                        {tag}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('工作区捷径', 'Workspace Shortcuts')}</div>
              <div className="ws-panel-note">
                {t(
                  '无需离开当前资源上下文，就能快速跳到其他重构后的模块。',
                  'Jump into the other rebuilt areas without leaving the asset context.'
                )}
              </div>
            </div>
            <button type="button" className="ws-btn secondary" onClick={() => navigate('/settings')}>
              <Settings2 size={16} />
              {t('设置', 'Settings')}
            </button>
          </div>

          <div className="apps-shortcuts">
            <button type="button" className="apps-shortcut" onClick={() => navigate('/apps')}>
              <LayoutGrid size={18} />
              <span>{t('快捷应用', 'Quick Apps')}</span>
            </button>
            <button type="button" className="apps-shortcut" onClick={() => navigate('/canvas')}>
              <FolderOpen size={18} />
              <span>{t('画布工作台', 'Canvas Workbench')}</span>
            </button>
          </div>

          <div className="apps-card-grid">
            {liteQuickApps.map((app) => {
              const copy = getQuickAppCopy(app, isZh)
              return (
                <div key={app.id} className="apps-card compact">
                  <div className="apps-card-head">
                    <div>
                      <div className="apps-card-title">{copy.name}</div>
                      <div className="apps-card-sub">{copy.category}</div>
                    </div>
                    <div className="apps-badge">{copy.badge}</div>
                  </div>
                  <p className="apps-card-copy">{copy.desc}</p>
                  <button type="button" className="ws-mini-btn" onClick={() => navigate(`/apps/${app.id}`)}>
                    {t('打开应用', 'Open app')}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
