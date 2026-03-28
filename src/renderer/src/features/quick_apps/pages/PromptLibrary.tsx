import React, { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Download, FolderOpen, Plus, Search, Star, Trash2, X } from 'lucide-react'
import { usePromptLibraryStore, type PromptSet } from '../prompt_library/store'
import { uiConfirm, uiPrompt, uiTextEditor } from '../../ui/dialogStore'
import AppsTopTabs from '../components/AppsTopTabs'
import { downloadJson, exportPromptSetV1, makeUniqueFileName, makeUniqueImportedName, parsePromptSetImports, pickJsonFiles } from '../prompt_library/transfer'
import '../styles/quickApps.css'

function norm(s: string) {
  return String(s || '').trim().toLowerCase()
}

function shortDate(ts: number) {
  const d = new Date(Number(ts || 0) || Date.now())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default function PromptLibrary() {
  const loc = useLocation()
  const sets = usePromptLibraryStore(s => s.sets)
  const addSet = usePromptLibraryStore(s => s.addSet)
  const updateSet = usePromptLibraryStore(s => s.updateSet)
  const removeSet = usePromptLibraryStore(s => s.removeSet)
  const toggleFavorite = usePromptLibraryStore(s => s.toggleFavorite)

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'fav' | string>('all')
  const [activeId, setActiveId] = useState<string | null>(null)

  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const isSelected = (id: string) => selectedIds.includes(id)
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [id, ...prev]))
  }
  const exitSelecting = () => {
    setSelecting(false)
    setSelectedIds([])
  }

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

  const appSets = useMemo(() => {
    const list = (sets || []).filter(s => s.appId === 'product_shot')
    return list
      .slice()
      .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.updatedAt - a.updatedAt)
  }, [sets])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const s of appSets) {
      const c = String(s.category || '').trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [appSets])

  const filtered = useMemo(() => {
    const nq = norm(q)
    return appSets.filter(s => {
      if (filter === 'fav' && !s.favorite) return false
      if (filter !== 'all' && filter !== 'fav') {
        if (String(s.category || '').trim() !== filter) return false
      }
      if (!nq) return true
      const hay = [s.name, s.category || '', ...(s.tags || [])].map(norm).join(' ')
      return hay.includes(nq)
    })
  }, [appSets, q, filter])

  const active = useMemo(() => {
    if (selecting) return null
    const id = activeId || (filtered[0]?.id || null)
    return id ? (filtered.find(s => s.id === id) || null) : null
  }, [selecting, activeId, filtered])

  const setActive = (id: string) => setActiveId(id)

  const importSets = async () => {
    try {
      const files = await pickJsonFiles(true)
      if (files.length === 0) return
      let imported: any[] = []
      for (const f of files) {
        try {
          const text = await f.text()
          imported = imported.concat(parsePromptSetImports(text))
        } catch {
          // ignore invalid file
        }
      }
      const list = imported.filter(Boolean)
      if (list.length === 0) return

      const existing = (sets || []).filter(s => s.appId === 'product_shot').slice()
      let lastId: string | null = null
      let added = 0
      for (const it of list) {
        const cat = String(it.category || '').trim() || undefined
        const name = makeUniqueImportedName(existing, String(it.name || ''), cat)
        const created = addSet({
          appId: 'product_shot',
          name,
          category: cat,
          tags: Array.isArray(it.tags) ? it.tags : undefined,
          agent1Template: String(it.agent1Template || ''),
          agent2Template: String(it.agent2Template || ''),
          agent3Template: String(it.agent3Template || ''),
          agent1Model: String(it.agent1Model || ''),
          agent2Model: String(it.agent2Model || ''),
          genModel: String(it.genModel || ''),
          genRatio: String(it.genRatio || ''),
          genRes: String(it.genRes || '')
        } as any)
        existing.unshift(created as any)
        lastId = created.id
        added += 1
      }
      if (!selecting && lastId) setActiveId(lastId)
    } catch {
      // ignore
    }
  }

  const exportSelected = async () => {
    const ids = selectedIds.slice().filter(Boolean)
    if (ids.length === 0) return
    const map: Record<string, PromptSet> = {}
    for (const s of appSets) map[s.id] = s
    const picked = ids.map(id => map[id]).filter(Boolean)
    if (picked.length === 0) return

    const used = new Set<string>()
    for (const s of picked) {
      const fileName = makeUniqueFileName(String(s.name || '模板组'), used)
      downloadJson(fileName, exportPromptSetV1(s))
      await new Promise(r => window.setTimeout(r, 120))
    }
  }

  const deleteSelected = async () => {
    const ids = selectedIds.slice().filter(Boolean)
    if (ids.length === 0) return
    const ok = await uiConfirm(`确定删除选中的 ${ids.length} 个模板组？此操作不可撤销。`, '删除')
    if (!ok) return
    for (const id of ids) removeSet(id)
    exitSelecting()
  }

  const createNew = async () => {
    const name = await uiPrompt('模板组名称', { title: '新建提示词模板组', placeholder: '例如：帽子（ededed背景）' })
    if (!name) return
    const category = await uiPrompt('分类（可选）', { title: '新建提示词模板组', placeholder: '例如：帽子 / 饰品 / 袜子' })

    const created = addSet({
      appId: 'product_shot',
      name,
      category: category || undefined,
      agent1Template: '',
      agent2Template: '',
      agent3Template: '',
      genRatio: '1:1',
      genRes: '1K'
    })
    setActiveId(created.id)
  }

  const duplicateActive = async () => {
    if (!active) return
    const name = await uiPrompt('模板组名称', { title: '复制模板组', initialValue: `${active.name} - 副本` })
    if (!name) return
    const created = addSet({
      appId: 'product_shot',
      name,
      category: active.category,
      tags: active.tags,
      favorite: false,
      agent1Template: active.agent1Template,
      agent2Template: active.agent2Template,
      agent3Template: active.agent3Template,
      agent1Model: active.agent1Model,
      agent2Model: active.agent2Model,
      genModel: active.genModel,
      genRatio: active.genRatio,
      genRes: active.genRes
    })
    setActiveId(created.id)
  }

  const deleteActive = async () => {
    if (!active) return
    const ok = await uiConfirm(`确定删除模板组「${active.name}」？`, '删除')
    if (!ok) return
    removeSet(active.id)
    setActiveId(null)
  }

  const editBig = async (title: string, text: string, apply: (t: string) => void) => {
    const next = await uiTextEditor(String(text || ''), { title, size: 'lg' })
    if (next === null) return
    apply(String(next))
  }

  const patchActive = (patch: Partial<PromptSet>) => {
    if (!active) return
    updateSet(active.id, patch as any)
  }

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
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索提示词模板组..." spellCheck={false} />
            </div>

            <div className="pl-actions">
              {selecting ? (
                <>
                  <button className="pl-btn" type="button" onClick={() => void importSets()}><FolderOpen size={16} /> 导入</button>
                  <button className="pl-btn" type="button" onClick={() => void exportSelected()} disabled={selectedIds.length === 0}><Download size={16} /> 导出JSON（{selectedIds.length}）</button>
                  <button className="pl-btn danger" type="button" onClick={() => void deleteSelected()} disabled={selectedIds.length === 0}><Trash2 size={16} /> 删除（{selectedIds.length}）</button>
                  <button className="pl-btn" type="button" onClick={exitSelecting}><X size={16} /> 取消</button>
                </>
              ) : (
                <>
                  <button className="pl-btn" type="button" onClick={() => void importSets()}><FolderOpen size={16} /> 导入</button>
                  <button className="pl-btn" type="button" onClick={() => void createNew()}><Plus size={16} /> 新建</button>
                  <button className="pl-btn" type="button" onClick={() => void duplicateActive()} disabled={!active}><Copy size={16} /> 复制</button>
                  <button className="pl-btn danger" type="button" onClick={() => void deleteActive()} disabled={!active}><Trash2 size={16} /> 删除</button>
                  <button className="pl-btn" type="button" onClick={() => { setSelecting(true); setSelectedIds([]) }}><Check size={16} /> 选择</button>
                </>
              )}
            </div>
          </div>

          <div className="qa-main-head-row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            <button type="button" className={`pl-btn pl-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              全部
            </button>
            <button type="button" className={`pl-btn pl-filter ${filter === 'fav' ? 'active' : ''}`} onClick={() => setFilter('fav')}>
              已收藏
            </button>
            <select
              className="ps-select"
              value={(filter !== 'all' && filter !== 'fav') ? filter : ''}
              onChange={(e) => setFilter(e.target.value ? e.target.value : 'all')}
              disabled={categories.length === 0}
              style={{ height: 36 }}
              title={categories.length === 0 ? '暂无分类' : '按分类筛选'}
            >
              <option value="">全部分类</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="pl-body">
          <div className="pl-list">
            {filtered.length === 0 ? (
              <div className="qa-empty">
                <div className="t">没有匹配的模板组</div>
                <div className="d">点击右上角“新建”添加。</div>
              </div>
            ) : (
              filtered.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`pl-item ${(!selecting && active?.id === s.id) ? 'active' : ''} ${(selecting && isSelected(s.id)) ? 'selected' : ''} ${selecting ? 'selecting' : ''}`}
                  onClick={() => {
                    if (selecting) toggleSelected(s.id)
                    else setActive(s.id)
                  }}
                >
                  {selecting ? (
                    <div className={`pl-item-check ${isSelected(s.id) ? 'on' : ''}`} aria-hidden="true">
                      {isSelected(s.id) ? <Check size={14} /> : null}
                    </div>
                  ) : null}
                  <div className="pl-item-top">
                    <div className="pl-item-name" title={s.name}>{s.name}</div>
                    <button
                      type="button"
                      className={`pl-star ${s.favorite ? 'on' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id) }}
                      title={s.favorite ? '取消收藏' : '收藏'}
                    >
                      <Star size={16} />
                    </button>
                  </div>
                  <div className="pl-item-sub">
                    <span>{s.category ? s.category : '未分类'}</span>
                    <span>{shortDate(s.updatedAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="pl-editor">
            {selecting ? (
              <div className="qa-empty">
                <div className="t">选择模式</div>
                <div className="d">已选 {selectedIds.length} 个模板组；右上角可导出/删除。</div>
              </div>
            ) : !active ? (
              <div className="qa-empty">
                <div className="t">未选择模板组</div>
                <div className="d">从左侧列表选择一个条目。</div>
              </div>
            ) : (
              <div className="pl-form">
                <div className="pl-row">
                  <div className="pl-k">名称</div>
                  <input className="pl-input" value={active.name} onChange={(e) => patchActive({ name: e.target.value })} />
                </div>
                <div className="pl-row">
                  <div className="pl-k">分类</div>
                  <input className="pl-input" value={active.category || ''} onChange={(e) => patchActive({ category: e.target.value })} placeholder="例如：帽子 / 饰品 / 袜子" />
                </div>

                <div className="pl-split">
                  <div className="pl-box">
                    <div className="pl-box-head">
                      <div className="t">角色1模板</div>
                      <button className="pl-mini" type="button" onClick={() => void editBig('角色1模板', active.agent1Template, (t) => patchActive({ agent1Template: t }))}>展开编辑</button>
                    </div>
                    <textarea className="pl-text" value={active.agent1Template} onChange={(e) => patchActive({ agent1Template: e.target.value })} spellCheck={false} />
                  </div>
                  <div className="pl-box">
                    <div className="pl-box-head">
                      <div className="t">角色2模板</div>
                      <button className="pl-mini" type="button" onClick={() => void editBig('角色2模板', active.agent2Template, (t) => patchActive({ agent2Template: t }))}>展开编辑</button>
                    </div>
                    <textarea className="pl-text" value={active.agent2Template} onChange={(e) => patchActive({ agent2Template: e.target.value })} spellCheck={false} />
                  </div>
                  <div className="pl-box">
                    <div className="pl-box-head">
                      <div className="t">角色3模板</div>
                      <button className="pl-mini" type="button" onClick={() => void editBig('角色3模板', active.agent3Template, (t) => patchActive({ agent3Template: t }))}>展开编辑</button>
                    </div>
                    <textarea className="pl-text" value={active.agent3Template} onChange={(e) => patchActive({ agent3Template: e.target.value })} spellCheck={false} />
                  </div>
                </div>

                <div className="pl-row" style={{ marginTop: 10 }}>
                  <div className="pl-k">生图参数</div>
                  <div className="pl-inline">
                    <select className="ps-select" value={active.genRatio || '1:1'} onChange={(e) => patchActive({ genRatio: e.target.value })}>
                      <option value="1:1">1:1</option>
                      <option value="3:4">3:4</option>
                      <option value="4:3">4:3</option>
                      <option value="9:16">9:16</option>
                      <option value="16:9">16:9</option>
                      <option value="2:3">2:3</option>
                      <option value="3:2">3:2</option>
                      <option value="21:9">21:9</option>
                    </select>
                    <select className="ps-select" value={active.genRes || '1K'} onChange={(e) => patchActive({ genRes: e.target.value })}>
                      <option value="1K">1K</option>
                      <option value="2K">2K</option>
                      <option value="4K">4K</option>
                    </select>
                  </div>
                </div>

                <div className="pl-hint">
                  这套提示词库目前先服务“产品图增强”；后续可以扩展到更多应用。
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
