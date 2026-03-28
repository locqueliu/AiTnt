import React, { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, BookText, Check, FolderOpen, Download, Image as ImageIcon, ListChecks, Plus, Sparkles, Star, Trash2, X } from 'lucide-react'
import { uiConfirm, uiPrompt } from '../../../ui/dialogStore'
import { uiToast } from '../../../ui/toastStore'
import { usePromptLibraryStore } from '../../prompt_library/store'
import { downloadJson, exportPromptSetV1, makeUniqueFileName, makeUniqueImportedName, parsePromptSetImports, pickJsonFiles } from '../../prompt_library/transfer'
import ProductShotGeniePolicyModal from './ProductShotGeniePolicyModal'
import '../../styles/quickApps.css'
import { fileToQuickAppInputImage } from '../../utils/imageOptimize'

function norm(s: string) {
  return String(s || '').trim().toLowerCase()
}

function shortDate(ts: number) {
  const d = new Date(Number(ts || 0) || Date.now())
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${m}-${dd}`
}

export default function ProductShotHome() {
  const nav = useNavigate()
  const sets = usePromptLibraryStore(s => s.sets)
  const addSet = usePromptLibraryStore(s => s.addSet)
  const updateSet = usePromptLibraryStore(s => s.updateSet)
  const toggleFavorite = usePromptLibraryStore(s => s.toggleFavorite)
  const setActiveSet = usePromptLibraryStore(s => s.setActive)
  const removeSet = usePromptLibraryStore(s => s.removeSet)

  const [q, setQ] = React.useState('')
  const [policyOpen, setPolicyOpen] = React.useState(false)
  const [selecting, setSelecting] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  const isSelected = (id: string) => selectedIds.includes(id)
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [id, ...prev]))
  }

  const exitSelecting = () => {
    setSelecting(false)
    setSelectedIds([])
  }

  const pickCoverFile = async (): Promise<File | null> => {
    return await new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const f = (input.files && input.files[0]) ? input.files[0] : null
        resolve(f)
      }
      input.click()
    })
  }

  const cacheCoverToLocal = async (dataUrl: string, setId: string): Promise<string> => {
    const api = (window as any).aitntAPI
    const src = String(dataUrl || '')
    if (!api?.downloadImage || !/^data:/i.test(src)) return src
    try {
      const saved = await api.downloadImage({ url: src, saveDir: 'cache/covers/product_shot', fileName: `qa_ps_cover_${setId}_${Date.now()}` })
      const localPath = String(saved?.localPath || '')
      if (saved?.success && /^aitnt:\/\/local\?path=/i.test(localPath)) return localPath
    } catch {
      // ignore
    }
    return src
  }

  const setCoverForSet = async (setId: string) => {
    try {
      const f = await pickCoverFile()
      if (!f) return
      const img = await fileToQuickAppInputImage(f, { maxDim: 720, jpegQuality: 0.84 })
      if (!img?.dataUrl) {
        uiToast('error', '璇诲彇灏侀潰澶辫触')
        return
      }
      const coverUrl = await cacheCoverToLocal(img.dataUrl, setId)
      updateSet(setId, { coverUrl } as any)
      uiToast('success', '宸茶缃皝闈')
    } catch (e: any) {
      uiToast('error', e?.message || '璁剧疆灏侀潰澶辫触')
    }
  }

  const appSets = useMemo(() => {
    const list = (sets || []).filter(s => s.appId === 'product_shot')
    const nq = norm(q)
    return list
      .filter(s => {
        if (!nq) return true
        const hay = [s.name, s.category || '', ...(s.tags || [])].map(norm).join(' ')
        return hay.includes(nq)
      })
      .slice()
      .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.updatedAt - a.updatedAt)
  }, [sets, q])

  const openStudio = (setId?: string) => {
    if (setId) setActiveSet('product_shot', setId)
    const sp = new URLSearchParams()
    sp.set('view', 'studio')
    if (setId) sp.set('set', setId)
    nav(`/apps/product_shot?${sp.toString()}`)
  }

  const goPrompts = () => {
    const back = encodeURIComponent('/apps/product_shot')
    nav(`/apps/prompts?back=${back}`)
  }

  const goTasks = () => {
    const back = encodeURIComponent('/apps/product_shot')
    nav(`/apps/tasks?back=${back}`)
  }

  const createAndOpen = async () => {
    const name = await uiPrompt('妯℃澘缁勫悕绉', { title: '鏂板缓妯℃澘缁', placeholder: '渚嬪锛氬附瀛愶紙绾壊鑳屾櫙锛' })
    if (!name) return
    const category = await uiPrompt('鍒嗙被锛堝彲閫夛級', { title: '鏂板缓妯℃澘缁', placeholder: '渚嬪锛氬附瀛?/ 楗板搧 / 琚滃瓙' })
    const created = addSet({
      appId: 'product_shot',
      name,
      category: category || undefined,
      agent1Template: '',
      agent2Template: '',
      agent3Template: '',
      genRatio: '1:1',
      genRes: '1K'
    } as any)
    setActiveSet('product_shot', created.id)

    const wantCover = await uiConfirm('涓鸿繖涓ā鏉跨粍璁剧疆灏侀潰锛燂紙鍙烦杩囷級', '璁剧疆灏侀潰')
    if (wantCover) {
      await setCoverForSet(created.id)
    }

    uiToast('success', '宸插垱寤烘ā鏉跨粍')
    openStudio(created.id)
  }

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
      if (list.length === 0) {
        uiToast('error', '瀵煎叆澶辫触锛氭湭璇嗗埆鍒版湁鏁堟ā鏉跨粍 JSON')
        return
      }

      const existing = (sets || []).filter(s => s.appId === 'product_shot').slice()
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
        added += 1
      }
      uiToast('success', `宸插鍏?${added} 涓ā鏉跨粍`)
    } catch (e: any) {
      uiToast('error', e?.message || '瀵煎叆澶辫触')
    }
  }

  const exportSelected = async () => {
    const ids = selectedIds.slice().filter(Boolean)
    if (ids.length === 0) return
    const map: Record<string, any> = {}
    for (const s of (sets || []).filter(x => x.appId === 'product_shot')) map[s.id] = s
    const picked = ids.map(id => map[id]).filter(Boolean)
    if (picked.length === 0) return

    const used = new Set<string>()
    for (const s of picked) {
      const fileName = makeUniqueFileName(String(s.name || '妯℃澘缁'), used)
      downloadJson(fileName, exportPromptSetV1(s))
      // allow multiple downloads
      await new Promise(r => window.setTimeout(r, 120))
    }
    uiToast('success', `宸插鍑?${picked.length} 涓?JSON`)
  }

  const deleteSelected = async () => {
    const ids = selectedIds.slice().filter(Boolean)
    if (ids.length === 0) return
    const ok = await uiConfirm(`纭畾鍒犻櫎閫変腑鐨?${ids.length} 涓ā鏉跨粍锛熸鎿嶄綔涓嶅彲鎾ら攢銆俙, '鍒犻櫎')
    if (!ok) return
    for (const id of ids) removeSet(id)
    uiToast('success', `宸插垹闄?${ids.length} 涓ā鏉跨粍`)
    exitSelecting()
  }

  return (
    <div className="qa-run ps-run">
      <div className="qa-run-head">
        <Link to="/apps" className="qa-back"><ArrowLeft size={18} /> 杩斿洖搴旂敤</Link>
        <div className="qa-run-title">
          <div className="n">浜у搧鍥惧寮?/div>
          <div className="d">閫夋嫨涓€涓ā鏉跨粍寮€濮嬪伐浣滐紱涔熷彲浠ョ户缁笂娆＄殑缂栬緫鐘舵€併€?/div>
        </div>
      </div>

      <div className="ps-home">
        <div className="ps-home-toolbar">
          <div className="ps-home-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="鎼滅储妯℃澘缁?.." spellCheck={false} />
          </div>

          <div className="ps-home-actions">
            {selecting ? (
              <>
                <button className="ps-home-btn ghost" type="button" onClick={() => void importSets()} title="瀵煎叆妯℃澘缁?JSON">
                  <FolderOpen size={16} /> 瀵煎叆妯℃澘缁?                </button>
                <button className="ps-home-btn ghost" type="button" onClick={() => void exportSelected()} disabled={selectedIds.length === 0} title="瀵煎嚭閫変腑妯℃澘缁勪负 JSON">
                  <Download size={16} /> 瀵煎嚭JSON锛坽selectedIds.length}锛?                </button>
                <button className="ps-home-btn danger" type="button" onClick={() => void deleteSelected()} disabled={selectedIds.length === 0} title="鍒犻櫎閫変腑妯℃澘缁?>
                  <Trash2 size={16} /> 鍒犻櫎锛坽selectedIds.length}锛?                </button>
                <button className="ps-home-btn ghost" type="button" onClick={exitSelecting} title="閫€鍑洪€夋嫨妯″紡">
                  <X size={16} /> 鍙栨秷
                </button>
              </>
            ) : (
              <>
                <button className="ps-home-iconbtn" type="button" onClick={() => setPolicyOpen(true)} title="鎻愮ず璇嶇簿鐏靛叧閿瓥鐣?>
                  <Bot size={16} />
                </button>
                <button className="ps-home-btn" type="button" onClick={() => openStudio()} title="鎵撳紑宸ヤ綔鍙帮紙淇濇寔涓婃杈撳叆锛?>
                  <Sparkles size={16} /> 缁х画涓婃
                </button>
                <button className="ps-home-btn" type="button" onClick={() => void createAndOpen()}>
                  <Plus size={16} /> 鏂板缓妯℃澘缁?                </button>
                <button className="ps-home-btn ghost" type="button" onClick={() => { setSelecting(true); setSelectedIds([]) }} title="閫夋嫨澶氫釜妯℃澘缁勮繘琛屽鍑?鍒犻櫎">
                  <Check size={16} /> 閫夋嫨
                </button>
                <button className="ps-home-btn ghost" type="button" onClick={goPrompts}>
                  <BookText size={16} /> 鎻愮ず璇嶅簱
                </button>
                <button className="ps-home-btn ghost" type="button" onClick={goTasks}>
                  <ListChecks size={16} /> 浠诲姟鍒楄〃
                </button>
              </>
            )}
          </div>
        </div>

        <ProductShotGeniePolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} />

        <div className="ps-home-grid" role="list">
          {appSets.length === 0 ? (
            <div className="qa-empty ps-home-empty" role="listitem">
              <div className="t">杩樻病鏈夋ā鏉跨粍</div>
              <div className="d">鐐瑰嚮鍙充笂瑙掆€滄柊寤烘ā鏉跨粍鈥濓紝鎴栫敤鈥滈€夋嫨鈥濊繘鍏ュ悗瀵煎叆 JSON銆?/div>
            </div>
          ) : (
            appSets.map(s => {
              const category = String(s.category || '').trim()
              const name = String(s.name || '').trim() || '鏈懡鍚?
              const coverUrl = String((s as any)?.coverUrl || '').trim()
              const sub = `${category || '鏈垎绫'} 路 鏇存柊 ${shortDate(s.updatedAt)}`
              const selected = selecting && isSelected(s.id)
              return (
                <div
                  key={s.id}
                  className={`qa-card ps-set-card ${selected ? 'selected' : ''} ${selecting ? 'selecting' : ''}`}
                  role="button"
                  tabIndex={0}
                  title={category ? `${category}/${name}` : name}
                  onClick={() => {
                    if (selecting) toggleSelected(s.id)
                    else openStudio(s.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (selecting) toggleSelected(s.id)
                      else openStudio(s.id)
                    }
                  }}
                >
                  <div className={`qa-card-cover ps-set-cover ${coverUrl ? 'has-img' : ''}`} aria-hidden="true">
                    {coverUrl ? <img src={coverUrl} alt="" draggable={false} loading="lazy" /> : null}
                    <div className="qa-card-cover-badge">{category || '鏈垎绫'}</div>
                    {selecting ? (
                      <div className={`ps-set-check ${selected ? 'on' : ''}`} aria-hidden="true">
                        {selected ? <Check size={16} /> : null}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="ps-set-coverbtn"
                      title={coverUrl ? '鏇存崲灏侀潰' : '璁剧疆灏侀潰'}
                      aria-label={coverUrl ? '鏇存崲灏侀潰' : '璁剧疆灏侀潰'}
                      onClick={(e) => {
                        e.stopPropagation()
                        void setCoverForSet(s.id)
                      }}
                    >
                      <ImageIcon size={14} />
                    </button>
                  </div>

                  <div className="qa-card-head">
                    <div className="qa-card-name">{name}</div>
                    <button
                      type="button"
                      className={`qa-card-pin ${s.favorite ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(s.id)
                      }}
                      title={s.favorite ? '鍙栨秷鏀惰棌' : '鏀惰棌'}
                      aria-label={s.favorite ? '鍙栨秷鏀惰棌' : '鏀惰棌'}
                    >
                      <Star size={16} />
                    </button>
                  </div>

                  <div className="qa-card-desc" title={sub}>{sub}</div>

                  <div className="qa-card-foot">
                    <div className="qa-card-cat">妯℃澘缁?/div>
                    <div className="ps-set-meta">{shortDate(s.updatedAt)}</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

