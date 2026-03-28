import React, { useEffect, useRef } from 'react'
import { schedulerTick } from './runner'

export default function ProductShotTaskDaemon() {
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const tick = async () => {
      try {
        await schedulerTick()
      } catch {
        // ignore
      }
    }
    void tick()
    timer.current = window.setInterval(() => void tick(), 800)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
      timer.current = null
    }
  }, [])

  return null
}
