import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Image, LayoutGrid, LibraryBig, Share2, Sparkles, Video } from 'lucide-react'
import { useAppLanguage } from '../i18n'

export default function HomeView() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)
  const primaryWorkspacesRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    const state = location.state as { focusSection?: string; nonce?: number } | null
    if (state?.focusSection !== 'primary-workspaces') return

    const frame = window.requestAnimationFrame(() => {
      primaryWorkspacesRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [location.key, location.state])

  const overviewStats = [
    {
      value: '5',
      label: t('核心工作区', 'Core workspaces')
    },
    {
      value: t('本地', 'Local'),
      label: t('持久化数据', 'Persistent data')
    },
    {
      value: 'JSON',
      label: t('节点流程导入导出', 'Canvas workflow I/O')
    },
    {
      value: t('统一', 'Shared'),
      label: t('供应商配置', 'Provider settings')
    }
  ]

  const quickAccess = [
    {
      label: t('图像工作站', 'Image Studio'),
      route: '/image'
    },
    {
      label: t('节点画布', 'Node Canvas'),
      route: '/canvas'
    },
    {
      label: t('提示词库', 'Prompt Library'),
      route: '/library'
    }
  ]

  const workspaceCards = [
    {
      title: t('图像工作站', 'Image Studio'),
      eyebrow: t('图像生成', 'Image generation'),
      description: t(
        '集中处理文生图、图生图、提示词优化和本地输出管理。',
        'Run text-to-image, image-to-image, prompt optimization, and local output management.'
      ),
      tags: [
        t('文生图', 'Text to image'),
        t('图生图', 'Image to image'),
        t('输出管理', 'Output management')
      ],
      route: '/image',
      accent: 'card-cyan',
      layout: 'home-span-7 home-card-tall',
      icon: Image
    },
    {
      title: t('视频工作站', 'Video Studio'),
      eyebrow: t('视频生成', 'Video generation'),
      description: t(
        '处理异步视频任务、参考输入、预览、轮询和导出。',
        'Handle async video tasks, reference inputs, preview, polling, and export.'
      ),
      tags: [
        t('异步任务', 'Async tasks'),
        t('参考输入', 'Reference input'),
        t('导出', 'Export')
      ],
      route: '/video',
      accent: 'card-pink',
      layout: 'home-span-5 home-card-tall',
      icon: Video
    },
    {
      title: t('节点画布', 'Node Canvas'),
      eyebrow: t('流程编排', 'Workflow canvas'),
      description: t(
        '构建节点流、导入导出工作流，并扩展自定义节点。',
        'Build node flows, import and export workflows, and extend the canvas with custom nodes.'
      ),
      tags: [
        t('节点流', 'Node flow'),
        t('导入导出', 'Import and export')
      ],
      route: '/canvas',
      accent: 'card-green',
      layout: 'home-span-4',
      icon: Share2
    },
    {
      title: t('快捷应用', 'Quick Apps'),
      eyebrow: t('高频流程', 'Fast workflows'),
      description: t(
        '启动商品图和风格化工作流，并在统一桌面追踪任务。',
        'Launch product-shot and stylize workflows, then track tasks from one desktop surface.'
      ),
      tags: [
        t('商品图', 'Product shots'),
        t('风格化', 'Stylize')
      ],
      route: '/apps',
      accent: 'card-cyan',
      layout: 'home-span-4',
      icon: LayoutGrid
    },
    {
      title: t('提示词库', 'Prompt Library'),
      eyebrow: t('内容资产', 'Content assets'),
      description: t(
        '保存可复用提示词组、优化预设、收藏与创意参考。',
        'Store reusable prompt sets, optimization presets, favorites, and creative references.'
      ),
      tags: [
        t('提示词组', 'Prompt sets'),
        t('预设', 'Presets'),
        t('收藏', 'Favorites')
      ],
      route: '/library',
      accent: 'card-amber',
      layout: 'home-span-4',
      icon: LibraryBig
    }
  ]

  const workflowLanes = [
    {
      label: t('生成', 'Generate'),
      title: t('处理图像与视频输出', 'Handle image and video output'),
      detail: t(
        '文生图、图生图、异步视频任务与结果导出都从这里开始。',
        'Text-to-image, image-to-image, async video tasks, and export all start here.'
      ),
      actions: [
        { label: t('图像工作站', 'Image Studio'), route: '/image' },
        { label: t('视频工作站', 'Video Studio'), route: '/video' }
      ]
    },
    {
      label: t('编排', 'Compose'),
      title: t('把常用流程固定下来', 'Turn frequent steps into repeatable flows'),
      detail: t(
        '用节点画布组合步骤，用快捷应用承载高频任务。',
        'Use the canvas to combine steps and quick apps to package repeatable tasks.'
      ),
      actions: [
        { label: t('节点画布', 'Node Canvas'), route: '/canvas' },
        { label: t('快捷应用', 'Quick Apps'), route: '/apps' }
      ]
    },
    {
      label: t('资源', 'Library'),
      title: t('沉淀提示词与参考资产', 'Save prompts and reusable references'),
      detail: t(
        '把提示词组、预设和创意参考集中到一个可长期复用的位置。',
        'Keep prompt sets, presets, and creative references in one reusable place.'
      ),
      actions: [{ label: t('提示词库', 'Prompt Library'), route: '/library' }]
    }
  ]

  return (
    <div className="home-shell">
      <section className="home-overview">
        <div className="home-overview-copy">
          <div className="home-kicker">
            <Sparkles size={14} />
            <span>{t('AiTnt 工作台', 'AiTnt Workstation')}</span>
          </div>
          <h1 className="home-title">
            {t('选择一个工作区，继续当前创作任务。', 'Choose a workspace and continue the task at hand.')}
          </h1>
          <p className="home-subtitle">
            {t(
              '图像、视频、节点流程、快捷应用和提示词资源都集中在同一桌面工作台中。',
              'Image, video, canvas flows, quick apps, and prompt assets live in one desktop workspace.'
            )}
          </p>

          <div className="home-actions">
            <button type="button" className="home-primary-action" onClick={() => navigate('/image')}>
              {t('打开图像工作站', 'Open Image Studio')}
              <ArrowRight size={16} />
            </button>
            <button type="button" className="home-secondary-action" onClick={() => navigate('/apps')}>
              {t('打开快捷应用', 'Open Quick Apps')}
            </button>
          </div>
        </div>

        <aside className="home-overview-board">
          <div className="home-board-header">
            <div className="home-board-label">{t('工作台概览', 'Workspace overview')}</div>
            <div className="home-board-title">{t('常用入口与运行方式', 'Core surfaces and workflow')}</div>
          </div>

          <div className="home-stat-grid">
            {overviewStats.map((item) => (
              <div key={item.label} className="home-stat">
                <span className="home-stat-value">{item.value}</span>
                <span className="home-stat-label">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="home-quick-access">
            <div className="home-quick-access-title">{t('快速进入', 'Quick access')}</div>
            <div className="home-quick-access-list">
              {quickAccess.map((item) => (
                <button
                  key={item.route}
                  type="button"
                  className="home-quick-access-item"
                  onClick={() => navigate(item.route)}
                >
                  <span>{item.label}</span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section
        ref={primaryWorkspacesRef}
        id="primary-workspaces"
        className="home-launch-section"
        aria-label={t('主工作区', 'Primary workspaces')}
      >
        <div className="home-section-head">
          <div className="home-section-label">{t('主工作区', 'Primary workspaces')}</div>
          <h2 className="home-section-title">{t('从下面的入口开始处理素材、流程或资源。', 'Start from the workspace that matches the task.')}</h2>
        </div>

        <div className="home-launch-grid">
          {workspaceCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.title}
                type="button"
                className={`home-launch-card ${card.accent} ${card.layout}`}
                onClick={() => navigate(card.route)}
              >
                <div className="home-launch-top">
                  <span className="home-launch-eyebrow">{card.eyebrow}</span>
                  <Icon size={20} className="home-launch-icon" />
                </div>
                <div className="home-launch-title">{card.title}</div>
                <p className="home-launch-description">{card.description}</p>
                <div className="home-launch-tags">
                  {card.tags.map((tag) => (
                    <span key={tag} className="home-launch-tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="home-launch-action">
                  {t('进入工作区', 'Open workspace')}
                  <ArrowRight size={14} />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="home-lane-section" aria-label={t('工作路径', 'Workflow lanes')}>
        <div className="home-section-head">
          <div className="home-section-label">{t('工作路径', 'Workflow lanes')}</div>
          <h2 className="home-section-title">{t('按任务类型进入对应的生成、编排和资源区域。', 'Jump into the right generation, composition, and library areas by task type.')}</h2>
        </div>

        <div className="home-lane-grid">
          {workflowLanes.map((lane) => (
            <article key={lane.title} className="home-lane">
              <div className="home-lane-label">{lane.label}</div>
              <h3 className="home-lane-title">{lane.title}</h3>
              <p className="home-lane-detail">{lane.detail}</p>
              <div className="home-lane-links">
                {lane.actions.map((action) => (
                  <button
                    key={action.route}
                    type="button"
                    className="home-lane-link"
                    onClick={() => navigate(action.route)}
                  >
                    <span>{action.label}</span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
