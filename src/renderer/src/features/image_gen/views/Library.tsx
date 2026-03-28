import React from 'react'
import { useNavigate } from 'react-router-dom'
import CreativeLibraryView from '../../creative_library/CreativeLibraryView'
import type { CreativeLibraryMode } from '../../creative_library/types'

// 创意库入口：创意库代码放在 features/creative_library 内，避免 image_gen 单目录越来越臃肿
export default function LibraryView({ onSwitchMode }: { onSwitchMode: (mode: 't2i' | 'i2i' | 'library') => void }) {
  const navigate = useNavigate()
  return (
    <CreativeLibraryView
      onBack={() => onSwitchMode('t2i')}
      onSwitchMode={(mode: CreativeLibraryMode) => {
        // 兼容：创意库现在支持视频模式；在图片模块内应用视频模板时，直接跳转到视频页。
        if (mode === 't2i' || mode === 'i2i') {
          onSwitchMode(mode)
          return
        }
        navigate(`/video?mode=${mode}`)
      }}
    />
  )
}
