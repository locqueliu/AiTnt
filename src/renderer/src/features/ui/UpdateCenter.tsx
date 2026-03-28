import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSettingsStore } from '../settings/store'
import { useAppLanguage } from '../i18n'
import { uiTextViewer } from './dialogStore'
import { uiToast } from './toastStore'

type UpdaterEvt =
  | { type: 'checking' }
  | { type: 'update-available'; version: string; releaseNotes: string }
  | { type: 'update-not-available'; version: string }
  | { type: 'download-progress'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'update-downloaded'; version: string }
  | { type: 'error'; message: string }

function fmtBytes(n: number) {
  const v = Number(n || 0)
  if (!Number.isFinite(v) || v <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let x = v
  let i = 0
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024
    i += 1
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export default function UpdateCenter() {
  const updateChannel = useSettingsStore((s) => s.updateChannel)
  const { isZh } = useAppLanguage()
  const api = (window as any).aitntAPI
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<'idle' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [newVersion, setNewVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [progress, setProgress] = useState({ percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 })
  const [errMsg, setErrMsg] = useState('')

  const lastCheckRef = useRef(0)
  const silentNotAvailableRef = useRef(true)

  const notesPreview = useMemo(() => {
    const text = String(notes || '').trim()
    if (!text) return ''
    return text.split(/\r?\n/).slice(0, 10).join('\n')
  }, [notes])

  const doCheck = async () => {
    const now = Date.now()
    if (now - lastCheckRef.current < 3000) return
    lastCheckRef.current = now
    try {
      await api?.updaterSetChannel?.(updateChannel)
      await api?.updaterCheck?.()
    } catch {
      // event-based errors are handled below
    }
  }

  useEffect(() => {
    const onManual = () => {
      silentNotAvailableRef.current = false
    }
    window.addEventListener('aitnt-updater-manual-check', onManual as any)
    return () => window.removeEventListener('aitnt-updater-manual-check', onManual as any)
  }, [])

  useEffect(() => {
    try {
      void api?.updaterSetChannel?.(updateChannel)
    } catch {
      // ignore
    }
  }, [api, updateChannel])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void doCheck()
    }, 4500)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!api?.onUpdaterEvent) return

    api.onUpdaterEvent((evt: UpdaterEvt) => {
      if (!evt || typeof evt !== 'object') return

      if (evt.type === 'checking') return

      if (evt.type === 'update-not-available') {
        if (!silentNotAvailableRef.current) {
          uiToast('info', t('当前已经是最新版本。', 'You are already on the latest version.'))
        }
        silentNotAvailableRef.current = false
        return
      }

      if (evt.type === 'update-available') {
        setNewVersion(String(evt.version || ''))
        setNotes(String(evt.releaseNotes || ''))
        setStage('available')
        setOpen(true)
        return
      }

      if (evt.type === 'download-progress') {
        setStage('downloading')
        setProgress({
          percent: Number(evt.percent || 0),
          bytesPerSecond: Number(evt.bytesPerSecond || 0),
          transferred: Number(evt.transferred || 0),
          total: Number(evt.total || 0)
        })
        setOpen(true)
        return
      }

      if (evt.type === 'update-downloaded') {
        setStage('downloaded')
        setOpen(true)
        uiToast('success', t('更新包已下载完成。', 'Update package downloaded.'))
        return
      }

      if (evt.type === 'error') {
        setErrMsg(String(evt.message || t('更新失败。', 'Update failed.')))
        setStage('error')
        setOpen(true)
        uiToast('error', t('更新失败。', 'Update failed.'))
      }
    })
  }, [api, isZh])

  if (!open) return null

  return (
    <div className="nx-update-wrap" role="presentation">
      <div className="nx-update-backdrop" onMouseDown={() => setOpen(false)} />
      <div className="nx-update" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="nx-update-head">
          <div className="nx-update-title">{t('软件更新', 'Software Update')}</div>
          <button type="button" className="nx-update-x" onClick={() => setOpen(false)} aria-label={t('关闭', 'Close')}>
            x
          </button>
        </div>

        <div className="nx-update-body">
          {stage === 'available' ? (
            <>
              <div className="nx-update-kv">
                <div className="k">{t('新版本', 'New version')}</div>
                <div className="v">{newVersion || '-'}</div>
              </div>

              <div className="nx-update-notes">
                <div className="t">{t('发行说明', 'Release notes')}</div>
                <pre className="p">{notesPreview || t('未提供发行说明。', 'No release notes provided.')}</pre>
                {notes.trim() ? (
                  <button
                    type="button"
                    className="nx-update-link"
                    onClick={() =>
                      uiTextViewer(notes, {
                        title: isZh ? `发行说明 ${newVersion || ''}` : `Release notes ${newVersion || ''}`
                      })
                    }
                  >
                    {t('查看完整说明', 'View full notes')}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {stage === 'downloading' ? (
            <>
              <div className="nx-update-kv">
                <div className="k">{t('下载中', 'Downloading')}</div>
                <div className="v">{`${Math.max(0, Math.min(100, progress.percent)).toFixed(0)}%`}</div>
              </div>
              <div className="nx-update-bar">
                <div className="fill" style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
              </div>
              <div className="nx-update-meta">
                <div>{`${fmtBytes(progress.transferred)} / ${fmtBytes(progress.total)}`}</div>
                <div>{`${fmtBytes(progress.bytesPerSecond)}/s`}</div>
              </div>
            </>
          ) : null}

          {stage === 'downloaded' ? (
            <>
              <div className="nx-update-kv">
                <div className="k">{t('可安装', 'Ready to install')}</div>
                <div className="v">{t('重启应用即可应用更新。', 'Restart the app to apply the update.')}</div>
              </div>
              {notesPreview ? (
                <div className="nx-update-notes">
                  <div className="t">{t('发行说明', 'Release notes')}</div>
                  <pre className="p">{notesPreview}</pre>
                </div>
              ) : null}
            </>
          ) : null}

          {stage === 'error' ? (
            <>
              <div className="nx-update-kv">
                <div className="k">{t('更新错误', 'Update error')}</div>
                <div className="v">
                  {t('更新检查或下载过程中发生错误。', 'An error occurred while checking or downloading updates.')}
                </div>
              </div>
              <pre className="nx-update-err">{errMsg || t('未知更新错误', 'Unknown update error')}</pre>
            </>
          ) : null}
        </div>

        <div className="nx-update-actions">
          {stage === 'available' ? (
            <>
              <button type="button" className="nx-btn ghost" onClick={() => setOpen(false)}>
                {t('稍后', 'Later')}
              </button>
              <button
                type="button"
                className="nx-btn"
                onClick={async () => {
                  try {
                    setStage('downloading')
                    await api?.updaterDownload?.()
                  } catch (e: any) {
                    setStage('error')
                    setErrMsg(String(e?.message || t('下载失败。', 'Download failed.')))
                  }
                }}
              >
                {t('下载', 'Download')}
              </button>
            </>
          ) : null}

          {stage === 'downloading' ? (
            <button type="button" className="nx-btn ghost" onClick={() => setOpen(false)}>
              {t('隐藏', 'Hide')}
            </button>
          ) : null}

          {stage === 'downloaded' ? (
            <>
              <button type="button" className="nx-btn ghost" onClick={() => setOpen(false)}>
                {t('稍后', 'Later')}
              </button>
              <button
                type="button"
                className="nx-btn"
                onClick={async () => {
                  try {
                    await api?.updaterQuitAndInstall?.()
                  } catch {
                    // ignore
                  }
                }}
              >
                {t('立即重启', 'Restart now')}
              </button>
            </>
          ) : null}

          {stage === 'error' ? (
            <button type="button" className="nx-btn ghost" onClick={() => setOpen(false)}>
              {t('关闭', 'Close')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
