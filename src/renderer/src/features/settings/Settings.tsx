import React, { useEffect, useMemo, useState } from 'react'
import ApiSettings from './views/ApiSettingsLite'
import CanvasSettings from './views/CanvasSettingsLite'
import VideoSettings from './views/VideoSettingsLite'
import AppsSettings from './views/AppsSettingsLite'
import { useSettingsStore } from './store'
import { useAppLanguage } from '../i18n'
import './styles/settings.css'
import Toggle from './components/Toggle'
import { uiToast } from '../ui/toastStore'
import { useDialogStore } from '../ui/dialogStore'

type TabId = 'api' | 'canvas' | 'video' | 'apps' | 'general' | 'about'

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<TabId>('api')
  const { isZh, language } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)
  const {
    outputDirectory,
    setOutputDirectory,
    autoSaveEnabled,
    setAutoSaveEnabled,
    theme,
    setTheme,
    updateChannel,
    setUpdateChannel,
    setLanguage
  } = useSettingsStore()

  const [appVersion, setAppVersion] = useState('1.0.0')
  const [persistCfg, setPersistCfg] = useState<any>(null)
  const [cacheStats, setCacheStats] = useState<{ fileCount: number; totalBytes: number; root?: string } | null>(null)
  const [cacheBusy, setCacheBusy] = useState(false)

  const tabs: Array<{ id: TabId; label: string }> = useMemo(
    () => [
      { id: 'api', label: 'API' },
      { id: 'canvas', label: t('画布', 'Canvas') },
      { id: 'video', label: t('视频', 'Video') },
      { id: 'apps', label: t('应用', 'Apps') },
      { id: 'general', label: t('通用', 'General') },
      { id: 'about', label: t('关于', 'About') }
    ],
    [isZh]
  )

  const formatBytes = (n: number) => {
    const value = Number(n || 0)
    if (!Number.isFinite(value) || value <= 0) return '0 B'
    const kb = 1024
    const mb = kb * 1024
    const gb = mb * 1024
    if (value >= gb) return `${(value / gb).toFixed(2)} GB`
    if (value >= mb) return `${(value / mb).toFixed(2)} MB`
    if (value >= kb) return `${(value / kb).toFixed(2)} KB`
    return `${Math.round(value)} B`
  }

  const refreshCacheStats = async () => {
    try {
      const api = (window as any).aitntAPI
      if (!api?.inputImageCacheStats) return
      const result = await api.inputImageCacheStats()
      if (result?.success) {
        setCacheStats({
          fileCount: Number(result.fileCount || 0),
          totalBytes: Number(result.totalBytes || 0),
          root: String(result.root || '') || undefined
        })
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        const api = (window as any).aitntAPI
        const [persistResult, versionResult] = await Promise.all([api?.getPersistConfig?.(), api?.getAppVersion?.()])

        if (!alive) return

        if (persistResult?.success) setPersistCfg(persistResult.config)
        if (versionResult?.success) setAppVersion(String(versionResult.version || '1.0.0'))
      } catch {
        // ignore
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'general') {
      void refreshCacheStats()
    }
  }, [activeTab])

  const renderGeneral = () => (
    <div className="st-form-container">
      <div className="st-header">
        <h1>{t('通用设置', 'General Settings')}</h1>
        <p>{t('管理本地存储、缓存、默认输出行为、界面主题与语言。', 'Control local storage, cache, default output behavior, visual theme, and language.')}</p>
      </div>

      <div className="st-group">
        <label className="st-label">{t('语言', 'Language')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">{t('界面语言', 'Interface language')}</div>
            <div className="st-inline-desc">
              {t('切换 AiTnt 的显示语言。默认语言为简体中文。', 'Switch the display language used by AiTnt. The default language is Simplified Chinese.')}
            </div>
          </div>
          <div className="st-seg">
            <button
              type="button"
              className={`st-seg-btn ${language === 'zh-CN' ? 'active' : ''}`}
              onClick={() => setLanguage('zh-CN')}
            >
              中文
            </button>
            <button
              type="button"
              className={`st-seg-btn ${language === 'en-US' ? 'active' : ''}`}
              onClick={() => setLanguage('en-US')}
            >
              English
            </button>
          </div>
        </div>
      </div>

      <div className="st-group">
        <label className="st-label">{t('本地数据', 'Local Data')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">{t('数据根目录', 'Data root')}</div>
            <div className="st-inline-desc">
              {t('这里保存应用状态、可复用资产和布局数据。', 'This location stores app state, reusable assets, and layout data.')}
            </div>
          </div>
          <button
            type="button"
            className="st-refresh-btn"
            onClick={async () => {
              try {
                const api = (window as any).aitntAPI
                const result = await api?.openDataRoot?.()
                if (!result?.ok) uiToast('error', t('打开数据目录失败。', 'Failed to open the data folder.'))
              } catch {
                uiToast('error', t('打开数据目录失败。', 'Failed to open the data folder.'))
              }
            }}
          >
            {t('打开文件夹', 'Open folder')}
          </button>
        </div>

        <div className="st-input-wrapper">
          <input
            type="text"
            className="st-input"
            value={String(persistCfg?.dataRoot || '')}
            readOnly
            placeholder={t('数据根目录路径', 'Data root path')}
          />
        </div>

        <div className="st-inline-row" style={{ marginTop: 10 }}>
          <div className="st-inline-left">
            <div className="st-inline-title">{t('重新执行初始化', 'Run setup again')}</div>
            <div className="st-inline-desc">
              {t('如果你想移动数据目录，可以再次打开初始化向导。', 'Use the onboarding flow again if you want to move the data root.')}
            </div>
          </div>
          <button
            type="button"
            className="st-refresh-btn"
            onClick={async () => {
              try {
                const api = (window as any).aitntAPI
                const result = await api?.setPersistConfig?.({ setupCompleted: false })
                if (!result?.success) {
                  uiToast('error', result?.error || t('重置初始化状态失败。', 'Failed to reset setup state.'))
                  return
                }
                setPersistCfg(result.config)
                uiToast('success', t('下次启动时将重新打开初始化向导。', 'Setup will reopen next time the app starts.'))
              } catch (error: any) {
                uiToast('error', error?.message || t('重置初始化状态失败。', 'Failed to reset setup state.'))
              }
            }}
          >
            {t('重置向导', 'Reset setup')}
          </button>
        </div>
      </div>

      <div className="st-group">
        <label className="st-label">{t('输入缓存', 'Input Cache')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">{t('参考图缓存', 'Reference image cache')}</div>
            <div className="st-inline-desc">
              {t('清理视频与快捷应用工作流使用的参考图缓存。', 'Clear cached input images used by video and app workflows.')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className={`st-refresh-btn ${cacheBusy ? 'loading' : ''}`}
              onClick={async () => {
                if (cacheBusy) return
                setCacheBusy(true)
                try {
                  await refreshCacheStats()
                } finally {
                  setCacheBusy(false)
                }
              }}
            >
              {t('刷新', 'Refresh')}
            </button>
            <button
              type="button"
              className={`st-refresh-btn ${cacheBusy ? 'loading' : ''}`}
              onClick={async () => {
                if (cacheBusy) return
                const confirmed = await useDialogStore.getState().openConfirm({
                  title: t('清理缓存', 'Clear cache'),
                  message: t('要从磁盘中删除缓存的输入图片吗？', 'Remove cached input images from disk?'),
                  okText: t('清理', 'Clear'),
                  cancelText: t('取消', 'Cancel')
                })
                if (!confirmed) return
                setCacheBusy(true)
                try {
                  const api = (window as any).aitntAPI
                  const result = await api?.clearInputImageCache?.()
                  if (!result?.success) {
                    uiToast('error', result?.error || t('清理缓存失败。', 'Failed to clear the cache.'))
                    return
                  }
                  uiToast('success', t('输入图片缓存已清理。', 'Input image cache cleared.'))
                  await refreshCacheStats()
                } catch (error: any) {
                  uiToast('error', error?.message || t('清理缓存失败。', 'Failed to clear the cache.'))
                } finally {
                  setCacheBusy(false)
                }
              }}
            >
              {t('清理', 'Clear')}
            </button>
          </div>
        </div>

        <div className="st-input-wrapper">
          <input
            type="text"
            className="st-input"
            value={cacheStats?.root ? String(cacheStats.root) : persistCfg?.dataRoot ? `${String(persistCfg.dataRoot)}\\cache\\input-images` : ''}
            readOnly
            placeholder={t('缓存目录', 'Cache directory')}
          />
        </div>
        <div style={{ fontSize: '0.8rem', color: '#8e94a8', marginTop: '4px' }}>
          {cacheStats
            ? `${cacheStats.fileCount} ${t('个文件', 'files')}，${formatBytes(cacheStats.totalBytes)}`
            : t('缓存统计尚未加载。', 'Cache stats are not loaded yet.')}
        </div>
      </div>

      <div className="st-group">
        <label className="st-label">{t('图像输出', 'Image Output')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">{t('自动保存生成图片', 'Auto-save generated images')}</div>
            <div className="st-inline-desc">
              {t('关闭后，图片会保留在远端，直到你手动保存。', 'When disabled, images stay remote until you save them manually.')}
            </div>
          </div>
          <Toggle checked={autoSaveEnabled} onChange={setAutoSaveEnabled} label={t('启用自动保存', 'Enable auto-save')} />
        </div>
        <div className="st-input-wrapper">
          <input
            type="text"
            className="st-input"
            value={outputDirectory}
            onChange={(event) => setOutputDirectory(event.target.value)}
            placeholder={t('例如: output 或 D:\\AiTnt\\output', 'Example: output or D:\\AiTnt\\output')}
            disabled={!autoSaveEnabled}
          />
        </div>
      </div>

      <div className="st-group" style={{ marginTop: 18 }}>
        <label className="st-label">{t('主题', 'Theme')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">{t('外观模式', 'Appearance mode')}</div>
            <div className="st-inline-desc">
              {t('在深色和浅色工作站主题之间切换。', 'Switch between the dark and light workstation themes.')}
            </div>
          </div>
          <div className="st-seg">
            <button type="button" className={`st-seg-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
              {t('深色', 'Dark')}
            </button>
            <button type="button" className={`st-seg-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
              {t('浅色', 'Light')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderAbout = () => (
    <div className="st-form-container">
      <div className="st-header">
        <h1>{t('关于 AiTnt', 'About AiTnt')}</h1>
        <p>{isZh ? `v${appVersion || '1.0.0'} - 本地 AI 创意工作站` : `v${appVersion || '1.0.0'} - local AI creative workstation`}</p>
      </div>

      <div className="st-group" style={{ marginTop: 12 }}>
        <label className="st-label">{t('更新', 'Updates')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">{t('更新通道', 'Channel')}</div>
            <div className="st-inline-desc">
              {t('在稳定版与测试版更新通道之间切换。', 'Choose between the stable and beta release channels.')}
            </div>
          </div>
          <div className="st-seg">
            <button
              type="button"
              className={`st-seg-btn ${updateChannel === 'stable' ? 'active' : ''}`}
              onClick={async () => {
                setUpdateChannel('stable')
                try {
                  await (window as any).aitntAPI?.updaterSetChannel?.('stable')
                  uiToast('success', t('已切换到稳定通道。', 'Switched to stable channel.'))
                } catch {
                  uiToast('error', t('更新通道切换失败。', 'Failed to update the channel.'))
                }
              }}
            >
              {t('稳定版', 'Stable')}
            </button>
            <button
              type="button"
              className={`st-seg-btn ${updateChannel === 'beta' ? 'active' : ''}`}
              onClick={async () => {
                setUpdateChannel('beta')
                try {
                  await (window as any).aitntAPI?.updaterSetChannel?.('beta')
                  uiToast('success', t('已切换到测试通道。', 'Switched to beta channel.'))
                } catch {
                  uiToast('error', t('更新通道切换失败。', 'Failed to update the channel.'))
                }
              }}
            >
              {t('测试版', 'Beta')}
            </button>
          </div>
        </div>

        <div className="st-inline-row" style={{ marginTop: 10 }}>
          <div className="st-inline-left">
            <div className="st-inline-title">{t('手动检查', 'Manual check')}</div>
            <div className="st-inline-desc">
              {t('按当前通道立即检查一次更新。', 'Trigger a manual update check for the current channel.')}
            </div>
          </div>
          <button
            type="button"
            className="st-refresh-btn"
            onClick={async () => {
              try {
                window.dispatchEvent(new Event('aitnt-updater-manual-check'))
                uiToast('info', t('正在检查更新...', 'Checking for updates...'))
                const api = (window as any).aitntAPI
                await api?.updaterSetChannel?.(updateChannel)
                const result = await api?.updaterCheck?.()
                if (result && result.success === false) {
                  const message =
                    result.error === 'not packaged'
                      ? t('开发模式下无法使用自动更新。请打包后再测试更新流程。', 'Auto update is unavailable in development mode. Build a packaged app to test updates.')
                      : result.error === 'update source not configured'
                        ? t('当前构建未配置更新仓库。', 'No update repository is configured for this build.')
                        : result.error || t('检查更新失败。', 'Update check failed.')
                  uiToast('error', message)
                }
              } catch (error: any) {
                uiToast('error', error?.message || t('检查更新失败。', 'Update check failed.'))
              }
            }}
          >
            {t('立即检查', 'Check now')}
          </button>
        </div>

        <div className="st-inline-row" style={{ marginTop: 10 }}>
          <div className="st-inline-left">
            <div className="st-inline-title">{t('发布源', 'Release source')}</div>
            <div className="st-inline-desc">
              {t('这个 AiTnt 重构版本保留了空仓库字段，因此没有配置发布页面。', 'This AiTnt rebuild keeps the repository field blank, so release pages are not configured.')}
            </div>
          </div>
          <button
            type="button"
            className="st-refresh-btn"
            onClick={async () => {
              const result = await (window as any).aitntAPI?.updaterOpenReleases?.()
              if (result?.success === false) {
                uiToast('info', result.error || t('当前构建没有配置发布页面。', 'No release page is configured for this build.'))
              }
            }}
          >
            {t('打开发布页', 'Open releases')}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="st-layout">
      <aside className="st-sidebar">
        <div className="st-sidebar-header">{t('设置', 'Settings')}</div>
        {tabs.map((tab) => (
          <div key={tab.id} className={`st-nav-item ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </div>
        ))}
      </aside>

      <section className="st-content">
        {activeTab === 'api' && <ApiSettings />}
        {activeTab === 'canvas' && <CanvasSettings />}
        {activeTab === 'video' && <VideoSettings />}
        {activeTab === 'apps' && <AppsSettings />}
        {activeTab === 'general' && renderGeneral()}
        {activeTab === 'about' && renderAbout()}
      </section>
    </div>
  )
}
