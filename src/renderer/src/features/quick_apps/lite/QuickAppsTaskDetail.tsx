import React from 'react'
import { ArrowLeft, CopyPlus, Download, FolderOpen, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppLanguage } from '../../i18n'
import { useProductShotTaskStore } from '../product_shot_tasks/store'
import { uiTextViewer } from '../../ui/dialogStore'
import { uiToast } from '../../ui/toastStore'
import '../../workstation/workstation.css'

function parseLocalPath(url: string): string | null {
  try {
    const parsed = new URL(String(url || ''))
    if (parsed.protocol !== 'aitnt:') return null
    if (parsed.hostname === 'local') return parsed.searchParams.get('path')
    return null
  } catch {
    return null
  }
}

function safeFileName(value: string) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'aitnt-task'
}

function statusTone(state: string) {
  if (state === 'success') return 'ok'
  if (state === 'running') return 'run'
  if (state === 'error') return 'err'
  return 'idle'
}

function stateLabel(state: string, isZh: boolean) {
  if (state === 'success') return isZh ? '成功' : 'Success'
  if (state === 'running') return isZh ? '进行中' : 'Running'
  if (state === 'queued') return isZh ? '排队中' : 'Queued'
  if (state === 'error') return isZh ? '错误' : 'Error'
  if (state === 'cancelled' || state === 'canceled') return isZh ? '已取消' : 'Canceled'
  return isZh ? '空闲' : 'Idle'
}

export default function QuickAppsTaskDetail() {
  const navigate = useNavigate()
  const params = useParams()
  const taskId = String(params.taskId || '')
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const tasks = useProductShotTaskStore((s) => s.tasks)
  const removeTask = useProductShotTaskStore((s) => s.removeTask)
  const addTask = useProductShotTaskStore((s) => s.addTask)

  const task = tasks.find((entry) => entry.id === taskId) || null

  if (!task) {
    return (
      <div className="ws-empty">
        <strong>{t('任务不存在', 'Task not found')}</strong>
        {t('这个任务可能已经从本地任务台中移除。', 'This task may have been removed from the local task desk.')} <Link to="/apps/tasks">{t('返回任务列表。', 'Return to the task list.')}</Link>
      </div>
    )
  }

  const stepEntries = [
    { key: 'agent1', label: t('Agent 1 简报', 'Agent 1 brief'), text: task.agent1Output },
    { key: 'agent2', label: t('Agent 2 方向', 'Agent 2 direction'), text: task.agent2Output },
    { key: 'merge', label: t('合并提示词', 'Merged prompt'), text: task.finalPrompt },
    { key: 'gen', label: t('生成输出', 'Generation output'), text: task.outImages.join('\n') }
  ] as const

  const duplicateTask = () => {
    const cloned = addTask({
      title: isZh ? `${task.title} 副本` : `${task.title} Copy`,
      promptSetId: task.promptSetId,
      promptSetLabel: task.promptSetLabel,
      providerId: task.providerId,
      productAngles: task.productAngles,
      slots: task.slots,
      agent1Template: task.agent1Template,
      agent2Template: task.agent2Template,
      agent3Template: task.agent3Template,
      agent1Model: task.agent1Model,
      agent2Model: task.agent2Model,
      genModel: task.genModel,
      genRatio: task.genRatio,
      genRes: task.genRes,
      agent1Output: '',
      agent2Output: '',
      finalPrompt: '',
      outImages: []
    })
    uiToast('success', t('任务已复制并重新排队。', 'Task duplicated and re-queued.'))
    navigate(`/apps/tasks/${cloned.id}`)
  }

  const exportResults = async () => {
    if (!task.outImages.length) {
      uiToast('info', t('当前还没有可导出的输出图。', 'No output images are available yet.'))
      return
    }

    try {
      const dirResult = await window.aitntAPI?.selectDirectory?.()
      if (!dirResult?.success || !dirResult.dirPath) return

      const exportResult = await window.aitntAPI?.exportImagesToDir?.({
        saveDir: dirResult.dirPath,
        items: task.outImages.map((url, index) => ({
          url,
          fileName: `${safeFileName(task.title)}_${index + 1}`
        }))
      })
      if (!exportResult?.success) {
        uiToast('error', exportResult?.error || t('无法导出任务结果。', 'Unable to export task results.'))
        return
      }
      uiToast('success', t('任务结果已导出。', 'Task results exported.'))
    } catch (error: any) {
      uiToast('error', error?.message || t('无法导出任务结果。', 'Unable to export task results.'))
    }
  }

  return (
    <div className="apps-stack">
      <div className="apps-section-head">
        <div>
          <div className="apps-section-title">{task.title}</div>
          <div className="apps-section-copy">{task.promptSetLabel || t('未分类', 'Uncategorized')} / {task.id}</div>
        </div>
        <div className="ws-actions">
          <button type="button" className="ws-mini-btn" onClick={() => navigate('/apps/tasks')}>
            <ArrowLeft size={14} />
            {t('返回', 'Back')}
          </button>
          <button type="button" className="ws-mini-btn" onClick={duplicateTask}>
            <CopyPlus size={14} />
            {t('重新排队', 'Requeue')}
          </button>
          <button type="button" className="ws-mini-btn" onClick={exportResults}>
            <Download size={14} />
            {t('导出图片', 'Export images')}
          </button>
          <button
            type="button"
            className="ws-mini-btn"
            onClick={() => {
              removeTask(task.id)
              navigate('/apps/tasks')
            }}
          >
            <Trash2 size={14} />
            {t('移除', 'Remove')}
          </button>
        </div>
      </div>

      <div className="ws-grid">
        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('步骤状态', 'Step Status')}</div>
              <div className="ws-panel-note">
                {t(
                  '每个阶段都会记录当前状态，并保留最新文本输出供你检查。',
                  'Each stage records its current state and keeps the latest text output for inspection.'
                )}
              </div>
            </div>
          </div>

          <div className="apps-checklist">
            {stepEntries.map((entry) => {
              const stepState = task.steps?.[entry.key]?.state || 'idle'
              const stepError = task.steps?.[entry.key]?.error
              return (
                <div key={entry.key} className="apps-check-item">
                  <strong>{entry.label}</strong>
                  <span>
                    <span className={`ws-status ${statusTone(stepState)}`}>{stateLabel(stepState, isZh)}</span>
                    {stepError ? ` ${stepError}` : ''}
                  </span>
                  {entry.text ? (
                    <button
                      type="button"
                      className="ws-mini-btn"
                      onClick={() => void uiTextViewer(entry.text, { title: entry.label, size: 'lg' })}
                    >
                      {t('查看', 'View')}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="ws-field">
            <label className="ws-label">{t('商品多角度图片', 'Product angles')}</label>
            <div className="apps-media-grid">
              {task.productAngles.map((image) => (
                <div key={image.id} className="apps-media-card compact">
                  <img src={image.localPath} alt={image.name} />
                  <div className="apps-media-foot">
                    <span>{image.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ws-field">
            <label className="ws-label">{t('参考位', 'Reference slots')}</label>
            <div className="apps-slot-grid">
              {Object.entries(task.slots || {}).map(([key, image]) => (
                <div key={key} className="apps-slot-card">
                  <div className="apps-slot-head">
                    <strong>{key}</strong>
                  </div>
                  {image ? <img src={image.localPath} alt={image.name} /> : <div className="apps-slot-empty">{t('暂无图片', 'No image')}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('输出图像', 'Output Images')}</div>
              <div className="ws-panel-note">
                {t(
                  '查看本地或远端结果图，检查请求载荷，并把它们导出到其他位置。',
                  'Review local or remote result images, inspect request payloads, and export them elsewhere.'
                )}
              </div>
            </div>
            <div className="ws-actions">
              {task.requestDebug ? (
                <button
                  type="button"
                  className="ws-mini-btn"
                  onClick={() => void uiTextViewer(JSON.stringify(task.requestDebug, null, 2), { title: t('生成请求', 'Generation request'), size: 'lg' })}
                >
                  {t('请求', 'Request')}
                </button>
              ) : null}
              {task.responseDebug ? (
                <button
                  type="button"
                  className="ws-mini-btn"
                  onClick={() => void uiTextViewer(JSON.stringify(task.responseDebug, null, 2), { title: t('生成响应', 'Generation response'), size: 'lg' })}
                >
                  {t('响应', 'Response')}
                </button>
              ) : null}
            </div>
          </div>

          {task.outImages.length === 0 ? (
            <div className="ws-empty">
              <strong>{t('还没有输出图像', 'No output images yet')}</strong>
              {t('生成步骤完成后，结果图会出现在这里。', 'The queue will place completed results here once the generation step succeeds.')}
            </div>
          ) : (
            <div className="ws-results">
              {task.outImages.map((url, index) => (
                <div key={`${url}_${index}`} className="ws-result-card">
                  <div className="ws-thumb">
                    <img src={url} alt={`task_output_${index + 1}`} draggable={false} />
                  </div>
                  <div className="ws-result-body">
                    <div className="ws-panel-note">{parseLocalPath(url) ? t('已保存到本地', 'Saved locally') : t('远端结果', 'Remote result')}</div>
                    <div className="ws-result-actions">
                      <button
                        type="button"
                        className="ws-mini-btn"
                        onClick={async () => {
                          const localPath = parseLocalPath(url)
                          if (localPath && window.aitntAPI?.showItemInFolder) {
                            await window.aitntAPI.showItemInFolder({ filePath: localPath })
                            return
                          }
                          window.open(url, '_blank')
                        }}
                      >
                        <FolderOpen size={14} />
                        {t('打开', 'Open')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
