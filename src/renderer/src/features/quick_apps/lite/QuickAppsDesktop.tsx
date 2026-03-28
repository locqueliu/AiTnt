import React from 'react'
import { ArrowRight, Sparkles, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppLanguage } from '../../i18n'
import { useProductShotTaskStore, type ProductShotTask } from '../product_shot_tasks/store'
import '../../workstation/workstation.css'

function getTaskTone(task: ProductShotTask) {
  const stepStates = Object.values(task.steps || {}).map((step) => step.state)
  if (stepStates.includes('error')) return 'err'
  if (task.currentStep === 'done' && task.steps.gen?.state === 'success') return 'ok'
  if (stepStates.includes('running')) return 'run'
  if (stepStates.includes('queued')) return 'idle'
  return 'idle'
}

function getTaskLabel(task: ProductShotTask, isZh: boolean) {
  const stepStates = Object.values(task.steps || {}).map((step) => step.state)
  if (stepStates.includes('error')) return isZh ? '错误' : 'Error'
  if (task.currentStep === 'done' && task.steps.gen?.state === 'success') return isZh ? '已完成' : 'Complete'
  if (stepStates.includes('running')) return isZh ? '进行中' : 'Running'
  if (stepStates.includes('queued')) return isZh ? '排队中' : 'Queued'
  return isZh ? '空闲' : 'Idle'
}

function getTaskProgress(task: ProductShotTask) {
  const steps = ['agent1', 'agent2', 'merge', 'gen'] as const
  const successCount = steps.filter((step) => task.steps?.[step]?.state === 'success').length
  return Math.round((successCount / steps.length) * 100)
}

export default function QuickAppsDesktop() {
  const navigate = useNavigate()
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const tasks = useProductShotTaskStore((s) => s.tasks)
  const removeTask = useProductShotTaskStore((s) => s.removeTask)
  const clearAll = useProductShotTaskStore((s) => s.clearAll)
  const [search, setSearch] = React.useState('')

  const visibleTasks = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return tasks
      .slice()
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .filter((task) => {
        if (!query) return true
        return [task.title, task.promptSetLabel || '', task.finalPrompt || '']
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
  }, [tasks, search])

  return (
    <div className="apps-stack">
      <div className="apps-section-head">
        <div>
          <div className="apps-section-title">{t('任务台', 'Task Desk')}</div>
          <div className="apps-section-copy">
            {t(
              '追踪商品图队列任务，查看详情，并清理已经完成的历史记录。',
              'Track queued product-shot jobs, jump into details, and prune completed task history.'
            )}
          </div>
        </div>
        <div className="ws-chip-row">
          <div className="ws-chip">{t('任务数', 'Tasks')}: {tasks.length}</div>
          <div className="ws-chip">{t('运行中', 'Running')}: {tasks.filter((task) => task.currentStep !== 'done').length}</div>
        </div>
      </div>

      <div className="ws-panel">
        <div className="ws-panel-head">
          <div>
            <div className="ws-panel-title">{t('队列概览', 'Queue Overview')}</div>
            <div className="ws-panel-note">
              {t(
                '搜索任务、查看状态，并打开详情页检查提示词、调试信息与输出结果。',
                'Search tasks, inspect status, and open the task detail view for prompts, debug payloads, and outputs.'
              )}
            </div>
          </div>
          <div className="ws-actions">
            <input
              className="ws-input apps-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('搜索任务', 'Search tasks')}
            />
            <button type="button" className="ws-mini-btn" onClick={() => clearAll()}>
              <Trash2 size={14} />
              {t('清空全部', 'Clear all')}
            </button>
          </div>
        </div>

        {visibleTasks.length === 0 ? (
          <div className="ws-empty">
            <strong>{t('未找到商品图任务', 'No product-shot tasks found')}</strong>
            {t('从商品图流水线排队一个任务，它就会出现在这里。', 'Queue a task from Product Shot Pipeline and it will appear here.')}
          </div>
        ) : (
          <div className="ws-mini-list">
            {visibleTasks.map((task) => (
              <div key={task.id} className="ws-mini-item">
                <div className="ws-mini-top">
                  <div>
                    <div className="ws-mini-title">{task.title}</div>
                    <div className="ws-mini-sub">
                      {task.promptSetLabel || t('未分类', 'Uncategorized')} / {task.outImages.length} {t('张输出图', 'output image')}{isZh ? '' : task.outImages.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className={`ws-status ${getTaskTone(task)}`}>{getTaskLabel(task, isZh)}</div>
                </div>

                <div className="ws-progress">
                  <div className="ws-progress-bar" style={{ width: `${Math.max(8, getTaskProgress(task))}%` }} />
                </div>

                <div className="apps-checklist compact">
                  <div className="apps-check-item">
                    <strong>{t('当前步骤', 'Current step')}</strong>
                    <span>{task.currentStep}</span>
                  </div>
                  <div className="apps-check-item">
                    <strong>{t('图片', 'Images')}</strong>
                    <span>
                      {isZh
                        ? `${task.productAngles.length} 张商品图，${Object.values(task.slots || {}).filter(Boolean).length} 张参考图`
                        : `${task.productAngles.length} product angles, ${Object.values(task.slots || {}).filter(Boolean).length} references`}
                    </span>
                  </div>
                </div>

                <div className="ws-video-actions">
                  <button type="button" className="ws-mini-btn" onClick={() => navigate(`/apps/tasks/${task.id}`)}>
                    <Sparkles size={14} />
                    {t('打开详情', 'Open detail')}
                  </button>
                  <button type="button" className="ws-mini-btn" onClick={() => removeTask(task.id)}>
                    <Trash2 size={14} />
                    {t('移除', 'Remove')}
                  </button>
                  <button type="button" className="ws-mini-btn" onClick={() => navigate(`/apps/${'product_shot'}`)}>
                    {t('继续排队', 'Queue more')}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
