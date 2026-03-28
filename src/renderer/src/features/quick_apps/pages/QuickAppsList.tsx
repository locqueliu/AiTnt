import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import AppCard from '../components/AppCard'
import { quickAppsCatalog } from '../apps/loadApps'
import { useSettingsStore } from '../../settings/store'
import AppsTopTabs from '../components/AppsTopTabs'
import '../styles/quickApps.css'

type Mode = 'all' | 'pinned'

function norm(s: string) {
  return String(s || '').trim().toLowerCase()
}

export default function QuickAppsList(props: { mode?: Mode }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const mode: Mode = props.mode === 'pinned' ? 'pinned' : 'all'

  const pinned = useSettingsStore(s => s.quickAppsPinned)
  const togglePinned = useSettingsStore(s => s.toggleQuickAppPinned)
  const enabledMap = useSettingsStore(s => s.quickAppsEnabled)

  const apps = useMemo(() => {
    return quickAppsCatalog.list.filter(w => {
      const id = w.meta.id
      const enabled = (enabledMap && typeof enabledMap === 'object') ? enabledMap[id] : undefined
      return enabled === false ? false : true
    })
  }, [enabledMap])

  const filtered = useMemo(() => {
    const nq = norm(q)
    const pinSet = new Set(pinned || [])
    return apps.filter(a => {
      const id = a.meta.id
      const inPinned = pinSet.has(id)
      if (mode === 'pinned' && !inPinned) return false
      if (!nq) return true
      const hay = [a.meta.name, a.meta.desc || '', ...(a.meta.keywords || [])]
        .map(norm)
        .join(' ')
      return hay.includes(nq)
    })
  }, [apps, q, mode, pinned])

  return (
    <div className="qa-layout">
      <section className="qa-main qa-main-full">
        <div className="qa-main-head">
          <AppsTopTabs />

          {mode === 'all' ? (
            <div className="qa-search">
              <Search size={18} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索快捷应用..."
                spellCheck={false}
              />
            </div>
          ) : null}
        </div>

        <div className="qa-grid">
          {filtered.length === 0 ? (
              <div className="qa-empty">
              <div className="t">{mode === 'pinned' ? '还没有已收藏的应用' : '没有找到匹配的应用'}</div>
              <div className="d">{mode === 'pinned' ? '在应用卡片右上角点击星标即可加入已收藏。' : '可以尝试换个关键词，或在设置里开启更多应用。'}</div>
            </div>
          ) : (
            filtered.map(app => (
              <AppCard
                key={app.meta.id}
                app={app}
                pinned={(pinned || []).includes(app.meta.id)}
                onPin={() => togglePinned(app.meta.id)}
                onOpen={() => navigate(`/apps/${app.meta.id}`)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
