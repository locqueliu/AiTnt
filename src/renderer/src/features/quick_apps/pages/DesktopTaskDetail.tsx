import React, { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, X } from 'lucide-react'
import { useProductShotTaskStore } from '../product_shot_tasks/store'
import { uiTextViewer } from '../../ui/dialogStore'
import { useSettingsStore } from '../../settings/store'
import { formatRequestDebugForCopy } from '../../image_gen/utils/requestDebug'
import '../styles/quickApps.css'

function copyText(text: string) {
  const t = String(text || '').trim()
  if (!t) return
  if (!navigator.clipboard?.writeText) {
    void uiTextViewer(t, { title: '澶嶅埗鍐呭', size: 'lg' })
    return
  }
  void navigator.clipboard.writeText(t)
}

function safeFileName(s: string) {
  return String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').slice(0, 120) || 'image'
}

function tryGetLocalFilePathFromUrl(url: string): string | null {
  try {
    const u = new URL(String(url || ''))
    if (u.protocol !== 'aitnt:') return null
    if (u.hostname === 'local') return u.searchParams.get('path')
    const p = (u.pathname || '').replace(/^\/+/, '')
    return p ? decodeURIComponent(p) : null
  } catch {
    return null
  }
}

function pickFileNameFromUrl(url: string) {
  const local = tryGetLocalFilePathFromUrl(url)
  if (local) {
    const s = String(local || '').replace(/\\/g, '/')
    const idx = s.lastIndexOf('/')
    return idx >= 0 ? s.slice(idx + 1) : s
  }
  try {
    const u = new URL(String(url || ''))
    const s = String(u.pathname || '').replace(/\\/g, '/')
    const idx = s.lastIndexOf('/')
    return idx >= 0 ? s.slice(idx + 1) : (s || 'image')
  } catch {
    return 'image'
  }
}

function stringifySafe(v: any) {
  try {
    return JSON.stringify(v ?? null, null, 2)
  } catch {
    return String(v)
  }
}

export default function DesktopTaskDetail() {
  const { taskId } = useParams()
  const loc = useLocation()
  const tasks = useProductShotTaskStore(s => s.tasks)
  const outputDirectory = useSettingsStore(s => s.outputDirectory)
  const task = useMemo(() => (tasks || []).find(t => t.id === String(taskId || '')) || null, [tasks, taskId])
  const [preview, setPreview] = useState<string | null>(null)
  const [previewMsg, setPreviewMsg] = useState<string>('')
  const [previewActualSize, setPreviewActualSize] = useState<string>('')

  const openPreview = (url: string) => {
    setPreviewMsg('')
    setPreviewActualSize('')
    setPreview(url)
  }

  const closePreview = () => {
    setPreview(null)
    setPreviewMsg('')
    setPreviewActualSize('')
  }

  if (!task) {
    return (
      <div className="qa-run">
        <div className="qa-run-head">
          <Link to={`/apps/tasks${loc.search || ''}`} className="qa-back"><ArrowLeft size={18} /> 杩斿洖浠诲姟鍒楄〃</Link>
          <div className="qa-run-title"><div className="n">浠诲姟涓嶅瓨鍦?/div></div>
        </div>
      </div>
    )
  }

  return (
    <div className="qa-run">
      <div className="qa-run-head">
        <Link to={`/apps/tasks${loc.search || ''}`} className="qa-back"><ArrowLeft size={18} /> 杩斿洖浠诲姟鍒楄〃</Link>
        <div className="qa-run-title">
          <div className="n">{task.title}</div>
          <div className="d">{task.promptSetLabel || '鏈垎缁'} 路 {task.id}</div>
        </div>
      </div>

      <div className="dt-body">
        <div className="dt-panel">
          <div className="dt-title">姝ラ鐘舵€?/div>
          <div className="dt-steps">
            {(['agent1', 'agent2', 'merge', 'gen'] as const).map(k => (
              <div key={k} className="dt-step">
                <div className="k">{k}</div>
                <div className="v">{task.steps?.[k]?.state || 'idle'}{task.steps?.[k]?.error ? ` 路 ${task.steps?.[k]?.error}` : ''}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="dt-panel">
          <div className="dt-title">杈撳嚭</div>
          <div className="dt-out">
            <div className="dt-out-head">
              <div className="t">瑙掕壊1杈撳嚭</div>
              <button className="ps-iconbtn" type="button" onClick={() => copyText(task.agent1Output)} title="澶嶅埗"><Copy size={16} /></button>
            </div>
            <textarea className="dt-text" readOnly value={task.agent1Output} />
          </div>
          <div className="dt-out">
            <div className="dt-out-head">
              <div className="t">瑙掕壊2杈撳嚭</div>
              <button className="ps-iconbtn" type="button" onClick={() => copyText(task.agent2Output)} title="澶嶅埗"><Copy size={16} /></button>
            </div>
            <textarea className="dt-text" readOnly value={task.agent2Output} />
          </div>
          <div className="dt-out">
            <div className="dt-out-head">
              <div className="t">鏈€缁堟彁绀鸿瘝</div>
              <button className="ps-iconbtn" type="button" onClick={() => copyText(task.finalPrompt)} title="澶嶅埗"><Copy size={16} /></button>
            </div>
            <textarea className="dt-text" readOnly value={task.finalPrompt} />
          </div>
        </div>

        <div className="dt-panel">
          <div className="dt-title">缁撴灉鍥剧墖</div>
          {task.outImages.length === 0 ? (
            <div className="qa-empty"><div className="t">鏆傛棤缁撴灉</div></div>
          ) : (
            <div className="ps-result-grid">
              {task.outImages.map((u, i) => (
                <div key={`${u}_${i}`} className="ps-result-item">
                  <img src={u} alt="result" onDoubleClick={() => openPreview(u)} draggable={false} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`ps-preview-modal ${preview ? 'show' : ''}`} onMouseDown={closePreview}>
        {preview ? (
          <div className="ps-preview-card" onMouseDown={(e) => e.stopPropagation()}>
            <button className="ps-preview-close" type="button" onClick={closePreview} aria-label="鍏抽棴">
              <X size={22} />
            </button>

            <div className="ps-preview-media">
              <img
                src={preview}
                className="ps-preview-img"
                alt="preview"
                onLoad={(e) => {
                  const img = e.currentTarget
                  setPreviewActualSize(`${img.naturalWidth}x${img.naturalHeight}`)
                }}
              />
            </div>

            <div className="ps-preview-side">
              <div className="ps-preview-title">鍥剧墖鎿嶄綔</div>
              <div className="ps-preview-actions">
                <button
                  className="ps-preview-btn"
                  type="button"
                  onClick={async () => {
                    const url = String(preview)
                    const localPath = tryGetLocalFilePathFromUrl(url)
                    if (localPath && window.aitntAPI?.showItemInFolder) {
                      const r = await window.aitntAPI.showItemInFolder({ filePath: localPath })
                      setPreviewMsg(r.success ? '宸插湪璧勬簮绠＄悊鍣ㄤ腑瀹氫綅鏂囦欢' : '瀹氫綅鏂囦欢澶辫触')
                      return
                    }
                    try {
                      window.open(url, '_blank')
                      setPreviewMsg('宸叉墦寮€')
                    } catch {
                      setPreviewMsg('鎵撳紑澶辫触')
                    }
                  }}
                  title="鎵撳紑鎴栧畾浣嶅師鏂囦欢"
                >
                  鎵撳紑
                </button>

                <button
                  className="ps-preview-btn"
                  type="button"
                  onClick={async () => {
                    const url = String(preview)
                    if (!window.aitntAPI?.exportImagesToDir || !window.aitntAPI?.showItemInFolder) {
                      setPreviewMsg('淇濆瓨澶辫触锛氬綋鍓嶇幆澧冧笉鏀寔')
                      return
                    }

                    const base = safeFileName(`${task.title}_${task.id.slice(-6)}`)
                    const r = await window.aitntAPI.exportImagesToDir({
                      saveDir: outputDirectory,
                      items: [{ url, fileName: `${base}_${Date.now()}` }]
                    })
                    if (!r.success) {
                      setPreviewMsg(`淇濆瓨澶辫触锛?{r.error || (r.failed && r.failed[0] && r.failed[0].error) || '鏈煡閿欒'}`)
                      return
                    }
                    const p = (r.saved && r.saved[0]) ? String(r.saved[0]) : ''
                    if (p) {
                      await window.aitntAPI.showItemInFolder({ filePath: p })
                      setPreviewMsg('宸蹭繚瀛樺埌鏈湴骞舵墦寮€鏂囦欢浣嶇疆')
                      return
                    }
                    setPreviewMsg('淇濆瓨澶辫触锛氭湭杩斿洖鏂囦欢璺緞')
                  }}
                  title="淇濆瓨鍒版湰鍦拌緭鍑虹洰褰曞苟瀹氫綅"
                >
                  淇濆瓨
                </button>

                <button
                  className="ps-preview-btn"
                  type="button"
                  onClick={async () => {
                    const url = String(preview)
                    if (!window.aitntAPI?.copyImageToClipboard) {
                      setPreviewMsg('澶嶅埗澶辫触锛氬綋鍓嶇幆澧冧笉鏀寔')
                      return
                    }
                    const r = await window.aitntAPI.copyImageToClipboard({ url })
                    setPreviewMsg(r.success ? '宸插鍒跺浘鐗囧埌鍓创鏉' : `澶嶅埗澶辫触锛?{r.error || '鏈煡閿欒'}`)
                  }}
                  title="澶嶅埗鍥剧墖鍒板壀璐存澘"
                >
                  澶嶅埗
                </button>

                <button
                  className="ps-preview-btn"
                  type="button"
                  onClick={async () => {
                    const req = (task as any)?.requestDebug
                    if (!req || !req.url) {
                      setPreviewMsg('鏃犺姹備俊鎭紙鍙兘鏄棫浠诲姟鎴栨湭璁板綍锛')
                      return
                    }
                    const text = formatRequestDebugForCopy(req)
                    try {
                      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
                      await navigator.clipboard.writeText(text)
                      setPreviewMsg('宸插鍒惰姹備唬鐮侊紙宸茶劚鏁忥級')
                    } catch {
                      uiTextViewer(text, { title: '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗锛堝凡鑴辨晱锛', size: 'lg' })
                      setPreviewMsg('澶嶅埗澶辫触锛氬凡寮瑰嚭鎵嬪姩澶嶅埗妗')
                    }
                  }}
                  title="澶嶅埗鏈璋冪敤 API 鐨勮姹備唬鐮侊紙宸茶劚鏁忥級"
                >
                  澶嶅埗璇锋眰
                </button>

                <button
                  className="ps-preview-btn"
                  type="button"
                  onClick={async () => {
                    const raw = (task as any)?.responseDebug
                    const t = String(raw?.dataPreview || '').trim() || stringifySafe(raw)
                    if (!t.trim()) {
                      setPreviewMsg('鏆傛棤鍙鍒剁殑杩斿洖鍐呭')
                      return
                    }
                    try {
                      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
                      await navigator.clipboard.writeText(t)
                      setPreviewMsg('宸插鍒舵帴鍙ｈ繑鍥')
                    } catch {
                      uiTextViewer(t, { title: '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗', size: 'lg' })
                      setPreviewMsg('澶嶅埗澶辫触锛氬凡寮瑰嚭鎵嬪姩澶嶅埗妗')
                    }
                  }}
                  title="澶嶅埗鎺ュ彛杩斿洖鍐呭"
                >
                  澶嶅埗杩斿洖
                </button>
              </div>

              <div className="ps-preview-info">
                <div className="ps-preview-info-title">淇℃伅</div>
                <div className="ps-preview-kv">
                  <div className="k">鏂囦欢</div>
                  <div className="v" title={pickFileNameFromUrl(String(preview))}>{pickFileNameFromUrl(String(preview))}</div>

                  <div className="k">鍍忕礌</div>
                  <div className="v">{previewActualSize || '-'}</div>
                </div>
              </div>

              {previewMsg ? (
                <div className="ps-preview-msg">{previewMsg}</div>
              ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
  )
}

