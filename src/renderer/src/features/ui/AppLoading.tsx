import React from 'react'
import { useAppLanguage } from '../i18n'

export default function AppLoading() {
  const { isZh } = useAppLanguage()

  return (
    <div className="nx-app-loading" role="status" aria-live="polite">
      <div className="nx-app-loading-card">
        <div className="nx-app-loading-logo">AiTnt</div>
        <div className="nx-app-loading-sub">{isZh ? '正在载入工作区...' : 'Loading workspace...'}</div>
        <div className="nx-app-loading-bar" aria-hidden="true">
          <div className="fill" />
        </div>
      </div>
    </div>
  )
}
