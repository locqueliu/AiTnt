import React from 'react'
import Toggle from '../components/Toggle'
import { useSettingsStore } from '../store'
import { useAppLanguage } from '../../i18n'

export default function VideoSettingsLite() {
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const videoAutoSaveEnabled = useSettingsStore((s) => s.videoAutoSaveEnabled)
  const setVideoAutoSaveEnabled = useSettingsStore((s) => s.setVideoAutoSaveEnabled)
  const videoOutputDirectory = useSettingsStore((s) => s.videoOutputDirectory)
  const setVideoOutputDirectory = useSettingsStore((s) => s.setVideoOutputDirectory)

  const [message, setMessage] = React.useState('')

  const pickDirectory = async () => {
    try {
      if (!window.aitntAPI?.selectDirectory) {
        setMessage(t('当前构建不支持选择目录。', 'Directory selection is not available in this build.'))
        return
      }

      const result = await window.aitntAPI.selectDirectory()
      if (!result.success) {
        setMessage(result.error || t('无法选择目录。', 'Unable to choose a directory.'))
        return
      }

      if (!result.dirPath) {
        setMessage(t('已取消选择。', 'Selection cancelled.'))
        return
      }

      setVideoOutputDirectory(result.dirPath)
      setMessage(t('视频输出目录已更新。', 'Video output directory updated.'))
    } catch (error: any) {
      setMessage(error?.message || t('无法选择目录。', 'Unable to choose a directory.'))
    }
  }

  return (
    <div className="st-form-container">
      <div className="st-header">
        <h1>{t('视频输出', 'Video Output')}</h1>
        <p>
          {t(
            '控制 AiTnt 如何保存生成视频，以及视频工作区手动导出的默认落盘位置。',
            'Control how AiTnt stores generated videos and where manual exports land by default.'
          )}
        </p>
      </div>

      <div className="st-group">
        <label className="st-label">{t('自动保存', 'Auto-save')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">{t('自动保存生成视频', 'Save generated videos automatically')}</div>
            <div className="st-inline-desc">
              {t(
                '关闭后，视频会保留在远端，直到你在视频工作区手动保存或导出。',
                'When disabled, videos stay remote until you save or export them manually from the video workspace.'
              )}
            </div>
          </div>
          <Toggle
            checked={videoAutoSaveEnabled}
            onChange={setVideoAutoSaveEnabled}
            label={t('启用视频自动保存', 'Enable video auto-save')}
          />
        </div>
      </div>

      <div className="st-group">
        <label className="st-label">{t('默认文件夹', 'Default folder')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">{t('视频输出目录', 'Video output directory')}</div>
            <div className="st-inline-desc">
              {t(
                '这个目录会用于自动保存，也会作为视频工作区导出的默认目标位置。',
                'This folder is used by auto-save and as the default destination for exports from the video workspace.'
              )}
            </div>
          </div>
          <button
            type="button"
            className="st-refresh-btn"
            onClick={() => void pickDirectory()}
            disabled={!videoAutoSaveEnabled}
          >
            {t('浏览', 'Browse')}
          </button>
        </div>

        <div className="st-input-wrapper">
          <input
            type="text"
            className="st-input"
            value={videoOutputDirectory}
            onChange={(event) => setVideoOutputDirectory(event.target.value)}
            placeholder={t('例如: output/videos 或 D:\\AiTnt\\videos', 'Example: output/videos or D:\\AiTnt\\videos')}
            disabled={!videoAutoSaveEnabled}
          />
        </div>

        <div style={{ fontSize: '0.8rem', color: '#8e94a8', marginTop: '6px' }}>
          {message || t('选择一个默认保存生成视频的本地文件夹。', 'Choose a local folder where generated videos should be stored by default.')}
        </div>
      </div>
    </div>
  )
}
