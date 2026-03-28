import React, { useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '../settings/store'
import { useAppLanguage } from '../i18n'
import { uiToast } from './toastStore'

type PersistConfig = {
  setupCompleted: boolean
  dataRoot: string
  imageOutputDirectory: string
  videoOutputDirectory: string
}

export default function FirstRunWizard() {
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const setOutputDirectory = useSettingsStore((s) => s.setOutputDirectory)
  const setVideoOutputDirectory = useSettingsStore((s) => s.setVideoOutputDirectory)
  const setAutoSaveEnabled = useSettingsStore((s) => s.setAutoSaveEnabled)
  const setVideoAutoSaveEnabled = useSettingsStore((s) => s.setVideoAutoSaveEnabled)

  const [open, setOpen] = useState(false)
  const [dataRoot, setDataRoot] = useState('')
  const [imgDir, setImgDir] = useState('')
  const [vidDir, setVidDir] = useState('')
  const [busy, setBusy] = useState(false)

  const api = (window as any).aitntAPI

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        if (!api?.getPersistConfig) return
        const result = await api.getPersistConfig()
        if (!alive) return

        const config = result?.config as PersistConfig | undefined
        if (!config) return

        setDataRoot(String(config.dataRoot || ''))
        setImgDir(String(config.imageOutputDirectory || ''))
        setVidDir(String(config.videoOutputDirectory || ''))

        if (result?.warning) {
          uiToast('info', String(result.warning))
        }

        if (!config.setupCompleted) setOpen(true)
      } catch {
        // ignore
      }
    })()

    return () => {
      alive = false
    }
  }, [api])

  const canSave = useMemo(() => Boolean(dataRoot.trim() && imgDir.trim() && vidDir.trim()), [dataRoot, imgDir, vidDir])

  if (!open) return null

  const pickDir = async (setter: (value: string) => void) => {
    try {
      if (!api?.selectDirectory) {
        uiToast('error', t('当前构建不支持选择目录。', 'Directory selection is not available in this build.'))
        return
      }

      const result = await api.selectDirectory()
      if (!result?.success) {
        uiToast('error', result?.error || t('无法选择目录。', 'Unable to choose a directory.'))
        return
      }

      if (!result.dirPath) return
      setter(String(result.dirPath))
    } catch (error: any) {
      uiToast('error', error?.message || t('无法选择目录。', 'Unable to choose a directory.'))
    }
  }

  return (
    <div className="nx-onboard-wrap" role="presentation">
      <div className="nx-onboard-backdrop" />
      <div className="nx-onboard" role="dialog" aria-modal="true">
        <div className="nx-onboard-head">
          <div className="nx-onboard-title">{t('设置你的 AiTnt 工作区', 'Set up your AiTnt workspace')}</div>
          <div className="nx-onboard-sub">
            {t(
              '选择 AiTnt 保存应用状态、生成图片和生成视频的位置。你之后也可以在设置里修改这些目录。',
              'Choose where AiTnt stores app state, generated images, and generated videos. You can update these locations later from Settings.'
            )}
          </div>
        </div>

        <div className="nx-onboard-body">
          <div className="nx-onboard-row">
            <div className="k">{t('数据根目录', 'Data root')}</div>
            <div className="v">
              <input
                className="nx-onboard-input"
                value={dataRoot}
                onChange={(event) => setDataRoot(event.target.value)}
                placeholder={t('例如: D:\\AiTnt', 'Example: D:\\AiTnt')}
              />
              <button type="button" className="nx-btn ghost" onClick={() => void pickDir(setDataRoot)}>
                {t('浏览', 'Browse')}
              </button>
            </div>
          </div>

          <div className="nx-onboard-row">
            <div className="k">{t('图像输出', 'Image output')}</div>
            <div className="v">
              <input
                className="nx-onboard-input"
                value={imgDir}
                onChange={(event) => setImgDir(event.target.value)}
                placeholder={t('例如: D:\\AiTnt\\output\\images', 'Example: D:\\AiTnt\\output\\images')}
              />
              <button type="button" className="nx-btn ghost" onClick={() => void pickDir(setImgDir)}>
                {t('浏览', 'Browse')}
              </button>
            </div>
          </div>

          <div className="nx-onboard-row">
            <div className="k">{t('视频输出', 'Video output')}</div>
            <div className="v">
              <input
                className="nx-onboard-input"
                value={vidDir}
                onChange={(event) => setVidDir(event.target.value)}
                placeholder={t('例如: D:\\AiTnt\\output\\videos', 'Example: D:\\AiTnt\\output\\videos')}
              />
              <button type="button" className="nx-btn ghost" onClick={() => void pickDir(setVidDir)}>
                {t('浏览', 'Browse')}
              </button>
            </div>
          </div>

          <div className="nx-onboard-hint">
            {t(
              '本地工作区可以把项目数据、缓存输入和生成结果统一收纳在一个位置。建议使用速度较快的本地磁盘。',
              'A local workspace keeps project data, cached inputs, and generated outputs organized in one place. A fast local drive is recommended.'
            )}
          </div>
        </div>

        <div className="nx-onboard-actions">
          <button
            type="button"
            className="nx-btn"
            disabled={!canSave || busy}
            onClick={async () => {
              if (!canSave) return
              setBusy(true)

              try {
                if (api?.setPersistConfig) {
                  const result = await api.setPersistConfig({
                    setupCompleted: true,
                    dataRoot: dataRoot.trim(),
                    imageOutputDirectory: imgDir.trim(),
                    videoOutputDirectory: vidDir.trim()
                  })

                  if (!result?.success) {
                    throw new Error(result?.error || t('无法保存工作区配置。', 'Unable to save the workspace configuration.'))
                  }
                }

                setAutoSaveEnabled(true)
                setVideoAutoSaveEnabled(true)
                setOutputDirectory(imgDir.trim())
                setVideoOutputDirectory(vidDir.trim())
                uiToast('success', t('工作区设置已保存。', 'Workspace setup saved.'))
                setOpen(false)
              } catch (error: any) {
                uiToast('error', error?.message || t('无法保存工作区配置。', 'Unable to save the workspace configuration.'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('保存工作区', 'Save workspace')}
          </button>
        </div>
      </div>
    </div>
  )
}
