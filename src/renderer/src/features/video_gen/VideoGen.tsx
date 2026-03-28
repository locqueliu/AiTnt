import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import TextToVideo from './views/TextToVideo'
import ImageToVideo from './views/ImageToVideo'
import './styles/index.css'
import '../image_gen/styles/index.css'
import { kvGetStringMigrate, kvSetString } from '../../core/persist/kvClient'

export type VideoGenMode = 't2v' | 'i2v'

const MODE_KEY = 'aitnt-video-active-mode:v1'

export default function VideoGenView() {
  const location = useLocation()
  const [mode, setModeState] = useState<VideoGenMode>('t2v')

  const setMode = (m: VideoGenMode) => {
    setModeState(m)
    void kvSetString(MODE_KEY, m)
  }

  // hydrate last mode
  useEffect(() => {
    let alive = true
    ;(async () => {
      const raw = await kvGetStringMigrate(MODE_KEY)
      if (!alive) return
      const v = String(raw || '').trim()
      if (v === 't2v' || v === 'i2v') setModeState(v)
    })()
    return () => {
      alive = false
    }
  }, [])

  // 鏀寔閫氳繃璺敱鍙傛暟鎵撳紑鎸囧畾瀛愭ā寮忥細/video?mode=i2v
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search || '')
      const m = sp.get('mode')
      if (m === 't2v' || m === 'i2v') setMode(m)
    } catch {
      // ignore
    }
  }, [location.search])

  return (
    <div className="vg-root">
      {mode === 't2v' && <TextToVideo onSwitchMode={setMode} />}
      {mode === 'i2v' && <ImageToVideo onSwitchMode={setMode} />}
    </div>
  )
}

