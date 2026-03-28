import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import TextToImage from './views/TextToImage'
import ImageToImage from './views/ImageToImage'
import LibraryView from './views/Library'
import './styles/index.css'
import { kvGetStringMigrate, kvSetString } from '../../core/persist/kvClient'

export type ImageGenMode = 't2i' | 'i2i' | 'library'

const MODE_KEY = 'aitnt-image-active-mode:v1'

export default function ImageGenView() {
  const location = useLocation()
  // 鎺у埗褰撳墠鏄剧ず鐨勬ā寮? 't2i' = 鏂囧瓧鐢熷浘, 'i2i' = 鍥惧儚鏀瑰浘, 'library' = 鍒涙剰搴?  const [activeMode, setActiveMode] = useState<ImageGenMode>('t2i')

  const setMode = (m: ImageGenMode) => {
    setActiveMode(m)
    void kvSetString(MODE_KEY, m)
  }

  // hydrate last mode (kv -> localStorage migration handled inside kv client)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const raw = await kvGetStringMigrate(MODE_KEY)
      if (!alive) return
      const m = String(raw || '').trim()
      if (m === 't2i' || m === 'i2i' || m === 'library') {
        setActiveMode(m)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 鏀寔閫氳繃璺敱鍙傛暟鎵撳紑鎸囧畾瀛愭ā寮忥細/image?mode=i2i
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search || '')
      const m = sp.get('mode')
      if (m === 't2i' || m === 'i2i' || m === 'library') {
        setMode(m)
      }
    } catch {
      // ignore
    }
  }, [location.search])

  // 娓叉煋鍑芥暟锛氶€氳繃鏉′欢娓叉煋瀹炵幇鏃犵紳鍒囨崲锛屽悓鏃朵繚鎸佷笁涓枃浠剁殑浠ｇ爜缁濆鐗╃悊闅旂
  return (
    <div className="feature-container" style={{ margin: 0, padding: 0 }}>
      {activeMode === 't2i' && <TextToImage onSwitchMode={setMode} />}
      {activeMode === 'i2i' && <ImageToImage onSwitchMode={setMode} />}
      {activeMode === 'library' && <LibraryView onSwitchMode={setMode} />}
    </div>
  )
}

