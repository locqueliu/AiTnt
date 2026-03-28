import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, Folder, Play, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'
import { useProductShotTaskStore, type ProductShotTask } from '../product_shot_tasks/store'
import { usePromptLibraryStore } from '../prompt_library/store'
import AppsTopTabs from '../components/AppsTopTabs'
import '../styles/quickApps.css'

function norm(s: string) {
  return String(s || '').trim().toLowerCase()
}

function stepBadge(t: ProductShotTask) {
  const gen = t.steps?.gen?.state
  if (gen === 'running') return { text: '生成中', cls: 'run' }
  if (gen === 'success') return { text: '完成', cls: 'ok' }
  if (gen === 'error') return { text: '失败', cls: 'err' }
  const cur = String(t.currentStep || '')
  return { text: cur === 'done' ? '完成' : '排队中', cls: 'q' }
}

function pad2(n: number) {
  return String(Math.floor(Number(n) || 0)).padStart(2, '0')
}

function fmtDateTime(ts: number) {
  const d = new Date(Number(ts || 0) || 0)
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mm = pad2(d.getMinutes())
  return `${y}-${m}-${dd} ${hh}:${mm}`
}

function fmtDuration(ms: number) {
  const x = Math.max(0, Math.floor(Number(ms) || 0))
  const s = Math.floor(x / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}小时${pad2(m)}分`
  if (m > 0) return `${m}分${pad2(ss)}秒`
  return `${ss}秒`
}

function getEndAt(t: ProductShotTask, now: number) {
  const gen = t.steps?.gen
  if (gen && (gen.state === 'success' || gen.state === 'error') && gen.finishedAt) return gen.finishedAt
  const order: Array<keyof ProductShotTask['steps']> = ['agent1', 'agent2', 'merge', 'gen']
  for (const k of order) {
    const st = (t.steps as any)?.[k]
    if (st?.state === 'error') return st.finishedAt || now
  }
  if (t.currentStep === 'done') return gen?.finishedAt || t.updatedAt || now
  return null
}

export default function Desktop() {
  const navigate = useNavigate()
  const loc = useLocation()
  const tasks = useProductShotTaskStore(s => s.tasks)
  const promptSets = usePromptLibraryStore(s => s.sets)
  const [q, setQ] = useState('')
  const [folder, setFolder] = useState<string>('all')
  const [tick, setTick] = useState(0)

  const backTarget = useMemo(() => {
    try {
      const sp = new URLSearchParams(String(loc.search || ''))
      const raw = sp.get('back')
      const decoded = raw ? decodeURIComponent(raw) : ''
      if (decoded && decoded.startsWith('/')) return decoded
      return ''
    } catch {
      return ''
    }
  }, [loc.search])

  const backLabel = backTarget.startsWith('/apps/product_shot') ? '返回产品图增强' : '返回'

  const nowTs = useMemo(() => Date.now(), [tick])

  useEffect(() => {
    const t = window.setInterval(() => setTick(x => (x + 1) % 1000000), 1000)
    return () => window.clearInterval(t)
  }, [])

  const labelBySetId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of (promptSets || []).filter(x => x.appId === 'product_shot')) {
      const c = String(s.category || '').trim()
      const n = String(s.name || '').trim()
      map[s.id] = c ? `${c}/${n}` : n
    }
    return map
  }, [promptSets])

  const folders = useMemo(() => {
    const set = new Map<string, { id: string, label: string, count: number }>()
    for (const t of (tasks || []).filter(x => x.providerId)) {
      const id = String(t.promptSetId || 'ungrouped')
      const label = (t.promptSetId && labelBySetId[t.promptSetId])
        ? labelBySetId[t.promptSetId]
        : (String(t.promptSetLabel || '').trim() || '未分组')
      const cur = set.get(id)
      if (cur) cur.count += 1
      else set.set(id, { id, label, count: 1 })
    }
    const list = Array.from(set.values())
    list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    return list
  }, [tasks, labelBySetId])

  const filtered = useMemo(() => {
    const nq = norm(q)
    return (tasks || [])
      .filter(t => {
        const fid = String(t.promptSetId || 'ungrouped')
        if (folder !== 'all' && fid !== folder) return false
        if (!nq) return true
        const hay = [t.title, t.promptSetLabel || '', labelBySetId[String(t.promptSetId || '')] || '']
          .map(norm)
          .join(' ')
        return hay.includes(nq)
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [tasks, q, folder, labelBySetId])

  return (
    <div className="qa-layout">
      <section className="qa-main qa-main-full">
        <div className="qa-main-head">
          <div className="qa-main-head-row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {backTarget ? (
                <Link to={backTarget} className="qa-back" title={backLabel}>
                  <ArrowLeft size={18} /> {backLabel}
                </Link>
              ) : null}
              <AppsTopTabs />
            </div>
          </div>
          <div className="qa-main-head-row" style={{ flexWrap: 'wrap' }}>
            <div className="qa-search" style={{ flex: 1, minWidth: 260 }}>
              <Search size={18} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索任务/提示词文件夹..." spellCheck={false} />
            </div>

            <select
              className="ps-select"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              style={{ height: 44 }}
              title="按提示词文件夹筛选"
            >
              <option value="all">全部文件夹</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>{f.label} ({f.count})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="desk-list">
          {filtered.length === 0 ? (
            <div className="qa-empty">
              <div className="t">没有任务</div>
              <div className="d">在“产品图增强”里点击“开始任务”创建。</div>
            </div>
          ) : (
            filtered.map(t => {
              const b = stepBadge(t)
              const cover = (t.outImages && t.outImages[0]) ? t.outImages[0] : ''
              const label = (t.promptSetId && labelBySetId[t.promptSetId]) ? labelBySetId[t.promptSetId] : (t.promptSetLabel || '未分组')
              const endAt = getEndAt(t, nowTs)
              const durationMs = (endAt || nowTs) - t.createdAt
              const hasError = (['agent1', 'agent2', 'merge', 'gen'] as const).some(k => t.steps?.[k]?.state === 'error')
              const durationLabel = (t.currentStep === 'done' || hasError) ? '总时长' : '已用'

              const a1 = String(t.agent1Model || '').trim() || '默认'
              const a2 = String(t.agent2Model || '').trim() || '默认'
              const g = String(t.genModel || '').trim() || '默认'
              const ratio = String(t.genRatio || '1:1')
              const res = String(t.genRes || '1K')

              return (
                <button key={t.id} type="button" className="desk-row" onClick={() => navigate(`/apps/tasks/${t.id}${loc.search || ''}`)}>
                  <div className="desk-row-left">
                    <div className="desk-card-top">
                      <div className="desk-card-title" title={t.title}>{t.title}</div>
                      <div className={`desk-badge ${b.cls}`}>{b.text}</div>
                    </div>
                    <div className="desk-card-sub" title={label}>{label}</div>
                    <div className="desk-thumb">
                      {cover ? <img src={cover} alt="result" draggable={false} /> : <div className="desk-thumb-empty"><Folder size={18} /> 无结果</div>}
                    </div>
                    <div className="desk-steps">
                      {(['agent1', 'agent2', 'merge', 'gen'] as const).map(k => {
                        const st = t.steps?.[k]?.state
                        const cls = st === 'success' ? 'ok' : st === 'running' ? 'run' : st === 'error' ? 'err' : 'q'
                        const Icon = st === 'success' ? CheckCircle2 : st === 'error' ? AlertTriangle : Play
                        const text = k === 'agent1' ? '分析' : k === 'agent2' ? '动作' : k === 'merge' ? '合并' : '生图'
                        return (
                          <div key={k} className={`desk-step ${cls}`} title={st || ''}>
                            <Icon size={14} /> {text}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="desk-row-right">
                    <div className="desk-meta">
                      <div className="desk-meta-item">
                        <div className="k">创建时间</div>
                        <div className="v">{fmtDateTime(t.createdAt)}</div>
                      </div>
                      <div className="desk-meta-item">
                        <div className="k">模型</div>
                        <div className="v" title={`角色1 ${a1} · 角色2 ${a2} · 生图 ${g}`}>角色1 {a1} · 角色2 {a2} · 生图 {g}</div>
                      </div>
                      <div className="desk-meta-item">
                        <div className="k">比例/分辨率</div>
                        <div className="v">{ratio} · {res}</div>
                      </div>
                      <div className="desk-meta-item">
                        <div className="k">{durationLabel}</div>
                        <div className="v">{fmtDuration(durationMs)}</div>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
