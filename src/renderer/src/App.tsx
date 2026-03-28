import React, { Suspense } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { Home, Image, Video, Share2, Settings, LayoutGrid, LibraryBig } from 'lucide-react'
import { useSettingsStore } from './features/settings/store'
import { useAppLanguage } from './features/i18n'
import HomeView from './features/home/Home'
import DialogHost from './features/ui/DialogHost'
import ToastHost from './features/ui/ToastHost'
import UpdateCenter from './features/ui/UpdateCenter'
import FirstRunWizard from './features/ui/FirstRunWizard'
import AppLoading from './features/ui/AppLoading'

const SettingsView = React.lazy(() => import('./features/settings/Settings'))
const ImageGenView = React.lazy(() => import('./features/workstation/ImageStudio'))
const VideoGenView = React.lazy(() => import('./features/workstation/VideoStudio'))
const CanvasView = React.lazy(() => import('./features/canvas/CanvasWorkbench'))
const QuickAppsLayout = React.lazy(() => import('./features/quick_apps/lite/QuickAppsTabs'))
const QuickAppsList = React.lazy(() => import('./features/quick_apps/lite/QuickAppsHome'))
const PromptLibrary = React.lazy(() => import('./features/quick_apps/lite/QuickAppsPromptLibrary'))
const AppsDesktop = React.lazy(() => import('./features/quick_apps/lite/QuickAppsDesktop'))
const DesktopTaskDetail = React.lazy(() => import('./features/quick_apps/lite/QuickAppsTaskDetail'))
const QuickAppEntry = React.lazy(() => import('./features/quick_apps/lite/QuickAppEntryLite'))
const CreativeLibraryRoute = React.lazy(() => import('./features/library/AssetLibrary'))
const ProductShotTaskDaemon = React.lazy(() => import('./features/quick_apps/product_shot_tasks/Daemon'))

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const theme = useSettingsStore((s) => s.theme)
  const { isZh, language } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const navItems = React.useMemo(
    () =>
      [
        {
          path: '/',
          label: t('首页', 'Home'),
          shortLabel: t('总览', 'Overview'),
          hint: t('进入主要工作区', 'Jump into the main workspaces'),
          icon: Home
        },
        {
          path: '/image',
          label: t('图像', 'Image'),
          shortLabel: t('图像', 'Image'),
          hint: t('文生图与图生图', 'Text-to-image and image-to-image'),
          icon: Image
        },
        {
          path: '/video',
          label: t('视频', 'Video'),
          shortLabel: t('视频', 'Video'),
          hint: t('文生视频与图生视频', 'Text-to-video and image-to-video'),
          icon: Video
        },
        {
          path: '/library',
          label: t('资源库', 'Library'),
          shortLabel: t('资源库', 'Library'),
          hint: t('提示词、模板与可复用资产', 'Prompts, templates, and reusable assets'),
          icon: LibraryBig
        },
        {
          path: '/canvas',
          label: t('画布', 'Canvas'),
          shortLabel: t('画布', 'Canvas'),
          hint: t('可视化节点工作流与自定义节点', 'Visual node workflows and custom nodes'),
          icon: Share2
        },
        {
          path: '/apps',
          label: t('应用', 'Apps'),
          shortLabel: t('应用', 'Apps'),
          hint: t('场景应用与任务桌面', 'Scenario apps and task desktop'),
          icon: LayoutGrid
        }
      ] as const,
    [isZh]
  )

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = language
  }, [theme, language])

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const activeSection = navItems.find((item) => isActive(item.path)) || navItems[0]
  const openHome = React.useCallback(() => {
    navigate('/', { replace: location.pathname === '/' })
  }, [location.pathname, navigate])

  const openFooterHint = React.useCallback(() => {
    if (activeSection.path === '/') {
      navigate('/', {
        replace: location.pathname === '/',
        state: {
          focusSection: 'primary-workspaces',
          nonce: Date.now()
        }
      })
      return
    }

    navigate(activeSection.path, { replace: location.pathname === activeSection.path })
  }, [activeSection.path, location.pathname, navigate])

  return (
    <div className="aitnt-app-container">
      <header className="aitnt-topbar">
        <div className="brand-cluster">
          <div className="brand-mark" aria-hidden="true">
            AT
          </div>
          <div className="brand-copy">
            <div className="brand-logo">AiTnt</div>
            <div className="brand-caption">{t('AI 创意工作站', 'AI Creative Workstation')}</div>
          </div>
        </div>

        <nav className="top-nav" aria-label={t('主导航', 'Primary navigation')}>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.path} to={item.path} className={isActive(item.path) ? 'active' : ''}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="topbar-meta">
          <div className="meta-chip">{activeSection.shortLabel}</div>
          <div className="meta-copy">
            <div className="meta-title">{activeSection.label}</div>
            <div className="meta-subtitle">{activeSection.hint}</div>
          </div>
          <Link
            to="/settings"
            className={`settings-btn ${isActive('/settings') ? 'active' : ''}`}
            aria-label={t('打开设置', 'Open settings')}
            title={t('打开设置', 'Open settings')}
          >
            <Settings size={18} />
          </Link>
        </div>
      </header>

      <main className="aitnt-content">
        <div className="aitnt-content-inner">
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route path="/" element={<HomeView />} />
              <Route path="/image" element={<ImageGenView />} />
              <Route path="/video" element={<VideoGenView />} />
              <Route path="/library" element={<CreativeLibraryRoute />} />
              <Route path="/canvas" element={<CanvasView />} />
              <Route path="/apps" element={<QuickAppsLayout />}>
                <Route index element={<QuickAppsList mode="all" />} />
                <Route path="pinned" element={<QuickAppsList mode="pinned" />} />
                <Route path="prompts" element={<PromptLibrary />} />
                <Route path="tasks" element={<AppsDesktop />} />
                <Route path="tasks/:taskId" element={<DesktopTaskDetail />} />
                <Route path="desktop" element={<AppsDesktop />} />
                <Route path="desktop/tasks/:taskId" element={<DesktopTaskDetail />} />
                <Route path=":appId" element={<QuickAppEntry />} />
              </Route>
              <Route path="/settings" element={<SettingsView />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      <DialogHost />
      <ToastHost />
      <UpdateCenter />
      <FirstRunWizard />
      <Suspense fallback={null}>
        <ProductShotTaskDaemon />
      </Suspense>

      <footer className="aitnt-footer">
        <button
          type="button"
          className="footer-link footer-brand-link"
          onClick={openHome}
          title={t('返回 AiTnt 首页', 'Back to the AiTnt home')}
        >
          {t('AiTnt 工作区', 'AiTnt Workspace')}
        </button>
        <button
          type="button"
          className="footer-link footer-note footer-note-link"
          onClick={openFooterHint}
          title={activeSection.path === '/' ? t('进入主要工作区', 'Jump into the main workspaces') : activeSection.label}
        >
          {activeSection.hint}
        </button>
      </footer>
    </div>
  )
}

export default App
