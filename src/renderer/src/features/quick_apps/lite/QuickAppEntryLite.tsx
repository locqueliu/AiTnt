import React from 'react'
import { useParams } from 'react-router-dom'
import { useAppLanguage } from '../../i18n'
import { liteQuickAppMap } from './catalog'
import ProductShotStudioLite from './ProductShotStudioLite'
import StylizeLite from './StylizeLite'
import '../../workstation/workstation.css'

export default function QuickAppEntryLite() {
  const params = useParams()
  const appId = String(params.appId || '')
  const app = liteQuickAppMap.get(appId)
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  if (!app) {
    return (
      <div className="ws-empty">
        <strong>{t('找不到快捷应用', 'Quick app not found')}</strong>
        {t('请求的应用不在当前重构后的 AiTnt 目录中。', 'The requested app does not exist in the rebuilt `AiTnt` catalog.')}
      </div>
    )
  }

  if (app.id === 'product_shot') return <ProductShotStudioLite />
  if (app.id === 'stylize') return <StylizeLite />

  return (
    <div className="ws-empty">
      <strong>{t('应用暂不可用', 'App unavailable')}</strong>
      {t('这个快捷应用还没有接入当前 clean-room 重构版本。', 'This quick app is not wired into the current clean-room rebuild.')}
    </div>
  )
}
