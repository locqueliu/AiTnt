import React, { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { CreativeLibraryMode } from './types'
import CreativeLibraryView from './CreativeLibraryView'
import { useCreativeLibraryStore } from './store'

function isMode(v: any): v is CreativeLibraryMode {
  return v === 't2i' || v === 'i2i' || v === 't2v' || v === 'i2v'
}

function modeToPath(mode: CreativeLibraryMode): string {
  if (mode === 't2v' || mode === 'i2v') return `/video?mode=${mode}`
  return `/image?mode=${mode}`
}

export default function CreativeLibraryRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const setActiveMode = useCreativeLibraryStore(s => s.setActiveMode)
  const activeMode = useCreativeLibraryStore(s => s.activeMode)

  // /library?mode=t2v 用于从视频页打开时预选
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search || '')
      const m = sp.get('mode')
      if (isMode(m)) setActiveMode(m)
    } catch {
      // ignore
    }
  }, [location.search, setActiveMode])

  const from = (location.state as any)?.from as string | undefined

  return (
    <CreativeLibraryView
      onBack={() => {
        if (from) {
          navigate(from)
          return
        }
        navigate(modeToPath(activeMode))
      }}
      onSwitchMode={(mode) => {
        navigate(modeToPath(mode))
      }}
    />
  )
}
