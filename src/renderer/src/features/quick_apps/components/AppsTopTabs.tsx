import React, { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutGrid, Star } from 'lucide-react'

type TabKey = 'all' | 'pinned'

function pickActive(pathname: string): TabKey {
  const p = String(pathname || '')
  if (p.startsWith('/apps/pinned')) return 'pinned'
  return 'all'
}

export default function AppsTopTabs() {
  const nav = useNavigate()
  const loc = useLocation()

  const active = useMemo(() => pickActive(loc.pathname), [loc.pathname])

  return (
    <div className="qa-tabs" role="tablist" aria-label="Apps Tabs">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'all'}
        className={`qa-tab ${active === 'all' ? 'active' : ''}`}
        onClick={() => nav('/apps')}
      >
        <LayoutGrid size={16} /> 全部
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={active === 'pinned'}
        className={`qa-tab ${active === 'pinned' ? 'active' : ''}`}
        onClick={() => nav('/apps/pinned')}
      >
        <Star size={16} /> 已收藏应用
      </button>
    </div>
  )
}
