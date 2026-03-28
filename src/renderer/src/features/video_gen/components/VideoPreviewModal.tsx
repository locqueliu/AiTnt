import React, { useEffect, useMemo, useState } from 'react'
import { useVideoGenStore, type VideoTask } from '../store'
import { X, Download, Trash2, Copy, FolderOpen } from 'lucide-react'
import { formatRequestDebugForCopy } from '../../image_gen/utils/requestDebug'
import { useSettingsStore } from '../../settings/store'
import { uiTextViewer } from '../../ui/dialogStore'

function extractAllowedModels(text: string): string[] {
  const s = String(text || '')
  const m = /not\s+in\s*\[([^\]]+)\]/i.exec(s)
  if (!m) return []
  const raw = m[1]
  const parts = raw
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => x.replace(/^['"\s]+|['"\s]+$/g, ''))
    .filter(Boolean)
  // 鍘婚噸锛堜繚鎸侀『搴忥級
  const out: string[] = []
  const set = new Set<string>()
  for (const p of parts) {
    if (set.has(p)) continue
    set.add(p)
    out.push(p)
    if (out.length >= 50) break
  }
  return out
}

export default function VideoPreviewModal(props: {
  open: boolean
  task: VideoTask | null
  outputDirectory: string
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const { open, task, outputDirectory, onClose, onDelete } = props
  const [msg, setMsg] = useState('')

  const canShow = Boolean(open && task)
  const url = task?.url || ''
  const respPreview = task?.response?.dataPreview || ''
  const taskId = task?.id || ''
  const respFull = useVideoGenStore(s => (taskId ? (s.responseFullById?.[taskId] || '') : ''))
  const [showFullResp, setShowFullResp] = useState(false)

  useEffect(() => {
    setShowFullResp(false)
  }, [taskId])

  // 涓€鏃︽嬁鍒版洿瀹屾暣鐨勮繑鍥烇紝榛樿鍒囧埌鈥滃畬鏁粹€濊鍥撅紙閬垮厤鐢ㄦ埛璇互涓鸿鎴柇锛?  useEffect(() => {
    if (showFullResp) return
    if (respFull.trim()) setShowFullResp(true)
  }, [respFull, showFullResp])

  const respText = (showFullResp && respFull.trim()) ? respFull : respPreview

  const isPortrait = useMemo(() => {
    const raw = String(task?.aspectRatio || '').trim().replace(/锛?g, ':')
    const m = /^(\d+)\s*:\s*(\d+)$/.exec(raw)
    if (!m) return false
    const a = Number(m[1])
    const b = Number(m[2])
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false
    return b > a
  }, [task?.aspectRatio])

  const { providers, activeProviderId, videoProviderId, updateProvider } = useSettingsStore()
  const providerId = task?.providerId || videoProviderId || activeProviderId
  const provider = providers.find(p => p.id === providerId)

  const allowedModels = useMemo(() => {
    const combined = `${task?.errorMsg || ''}\n${respPreview || ''}`
    return extractAllowedModels(combined)
  }, [task?.errorMsg, respPreview])

  const fileName = useMemo(() => {
    if (!url) return 'video'
    try {
      const u = new URL(url)
      const p = (u.pathname || '').split('/').filter(Boolean)
      return p.length ? p[p.length - 1] : 'video'
    } catch {
      return 'video'
    }
  }, [url])

  if (!canShow) return null

  return (
    <div className="vg-modal" onMouseDown={onClose}>
      <div className="vg-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <button className="vg-modal-close" onClick={onClose} title="鍏抽棴"><X size={18} /></button>

        <div className={`vg-modal-media ${isPortrait ? 'portrait' : 'landscape'}`}>
          {url ? (
            isPortrait ? (
              <div className="vg-modal-portrait-wrap">
                <video
                  src={url}
                  controls
                  autoPlay
                  playsInline
                  className="vg-modal-video portrait"
                />
              </div>
            ) : (
              <video
                src={url}
                controls
                autoPlay
                playsInline
                className="vg-modal-video landscape"
              />
            )
          ) : (
            <div className="vg-modal-ph">鏆傛棤瑙嗛</div>
          )}
        </div>

        <div className="vg-modal-side">
          <div className="vg-modal-title">瑙嗛鎿嶄綔</div>

          <div className="vg-modal-actions">
            <button
              type="button"
              className="vg-mini-btn"
              onClick={async () => {
                if (!task?.url) return
                if (!window.aitntAPI?.downloadVideo) {
                  setMsg('淇濆瓨澶辫触锛氬綋鍓嶇幆澧冧笉鏀寔')
                  return
                }
                const dl = await window.aitntAPI.downloadVideo({
                  url: task.url,
                  saveDir: outputDirectory,
                  fileName: `aitnt_video_${Date.now()}`
                })
                setMsg(dl.success ? '宸蹭繚瀛樺埌鏈湴' : `淇濆瓨澶辫触锛?{dl.error || '鏈煡閿欒'}`)
              }}
              title="淇濆瓨鍒版湰鍦帮紙榛樿杈撳嚭鐩綍锛?
            >
              <Download size={14} /> 淇濆瓨
            </button>

            <button
              type="button"
              className="vg-mini-btn"
              onClick={async () => {
                if (!task?.url) return
                if (!window.aitntAPI?.selectDirectory || !window.aitntAPI?.exportVideosToDir) {
                  setMsg('瀵煎嚭澶辫触锛氬綋鍓嶇幆澧冧笉鏀寔')
                  return
                }
                const picked = await window.aitntAPI.selectDirectory()
                if (!picked.success) {
                  setMsg(`瀵煎嚭澶辫触锛?{picked.error || '閫夋嫨鐩綍澶辫触'}`)
                  return
                }
                if (!picked.dirPath) {
                  setMsg('宸插彇娑堝鍑')
                  return
                }
                const r = await window.aitntAPI.exportVideosToDir({
                  saveDir: picked.dirPath,
                  items: [{ url: task.url, fileName: `aitnt_video_${task.createdAt || Date.now()}` }]
                })
                if (!r.success) {
                  setMsg(`瀵煎嚭澶辫触锛?{r.error || '鏈煡閿欒'}`)
                  return
                }
                const failedCount = Array.isArray(r.failed) ? r.failed.length : 0
                setMsg(failedCount ? `瀵煎嚭瀹屾垚锛堝け璐?${failedCount} 涓級` : '瀵煎嚭瀹屾垚')
              }}
              title="瀵煎嚭鍒版寚瀹氱洰褰?
            >
              <FolderOpen size={14} /> 瀵煎嚭
            </button>

            <button
              type="button"
              className="vg-mini-btn"
              onClick={async () => {
                const req = task?.request
                if (!req) {
                  setMsg('鏃犺姹備俊鎭')
                  return
                }
                const text = formatRequestDebugForCopy(req)
                try {
                  if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
                  await navigator.clipboard.writeText(text)
                  setMsg('宸插鍒惰姹備唬鐮侊紙宸茶劚鏁忥級')
                } catch {
                  uiTextViewer(text, { title: '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗锛堝凡鑴辨晱锛' })
                  setMsg('澶嶅埗澶辫触锛氬凡寮瑰嚭鎵嬪姩澶嶅埗妗')
                }
              }}
              title="澶嶅埗璇锋眰浠ｇ爜锛堝凡鑴辨晱锛?
            >
              <Copy size={14} /> 澶嶅埗璇锋眰
            </button>

            <button
              type="button"
              className="vg-mini-btn"
              onClick={async () => {
                if (!respText.trim()) {
                  setMsg('鏃犳帴鍙ｈ繑鍥炰俊鎭')
                  return
                }
                const text = `// Response (masked)\n${respText}`
                try {
                  if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
                  await navigator.clipboard.writeText(text)
                  setMsg(showFullResp && respFull.trim() ? '宸插鍒舵帴鍙ｈ繑鍥烇紙瀹屾暣锛? : '宸插鍒舵帴鍙ｈ繑鍥?)
                } catch {
                  uiTextViewer(text, { title: '澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗' })
                  setMsg('澶嶅埗澶辫触锛氬凡寮瑰嚭鎵嬪姩澶嶅埗妗')
                }
              }}
              title={showFullResp && respFull.trim() ? '澶嶅埗鎺ュ彛杩斿洖锛堝畬鏁达級' : '澶嶅埗鎺ュ彛杩斿洖'}
            >
              <Copy size={14} /> 澶嶅埗杩斿洖
            </button>

            <button
              type="button"
              className="vg-mini-btn danger"
              onClick={() => task && onDelete(task.id)}
              title="鍒犻櫎浠诲姟"
            >
              <Trash2 size={14} /> 鍒犻櫎
            </button>
          </div>

          {task?.status === 'error' && task?.errorMsg ? (
            <div className="vg-modal-error">
              <div className="k">閿欒</div>
              <div className="v">{task.errorMsg}</div>
            </div>
          ) : null}

          {allowedModels.length > 0 ? (
            <div className="vg-modal-allowed">
              <div className="k">璇ユ帴鍙ｅ彲鐢ㄦā鍨嬶紙鏉ヨ嚜閿欒鎻愮ず锛?/div>
              <div className="vg-allowed-actions">
                <button
                  type="button"
                  className="vg-mini-btn"
                  disabled={!providerId || !provider}
                  title={!providerId || !provider ? '鎵句笉鍒板搴旂殑 API 缃戠珯閰嶇疆' : '鍒囨崲涓虹涓€涓彲鐢ㄦā鍨'}
                  onClick={() => {
                    if (!providerId || !provider) return
                    const first = allowedModels[0]
                    updateProvider(providerId, { selectedVideoModel: first })
                    setMsg(`宸插垏鎹㈡ā鍨嬶細${first}`)
                  }}
                >
                  搴旂敤绗竴涓?                </button>

                <button
                  type="button"
                  className="vg-mini-btn"
                  disabled={!providerId || !provider}
                  title={!providerId || !provider ? '鎵句笉鍒板搴旂殑 API 缃戠珯閰嶇疆' : '鍐欏叆鍒拌棰戝父鐢紙鏈€澶?4 涓級'}
                  onClick={() => {
                    if (!providerId || !provider) return
                    const nextPinned = allowedModels.slice(0, 4)
                    updateProvider(providerId, { pinnedVideoModels: nextPinned })
                    setMsg(`宸插啓鍏ヨ棰戝父鐢細${nextPinned.join(', ')}`)
                  }}
                >
                  鍐欏叆甯哥敤(4)
                </button>
              </div>

              <div className="vg-allowed-grid">
                {allowedModels.slice(0, 16).map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`vg-allowed-chip ${provider?.selectedVideoModel === m ? 'active' : ''}`}
                    title={m}
                    onClick={() => {
                      if (!providerId || !provider) {
                        setMsg('鏃犳硶搴旂敤锛氭壘涓嶅埌瀵瑰簲鐨?API 缃戠珯閰嶇疆')
                        return
                      }
                      updateProvider(providerId, { selectedVideoModel: m })
                      setMsg(`宸插垏鎹㈡ā鍨嬶細${m}`)
                    }}
                  >
                    {m}
                  </button>
                ))}
                {allowedModels.length > 16 ? (
                  <div className="vg-allowed-more">+{allowedModels.length - 16}</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {respText.trim() ? (
            <div className="vg-modal-debug">
              <div className="k" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span>鎺ュ彛杩斿洖锛堣劚鏁忥級</span>
                {respFull.trim() ? (
                  <button
                    type="button"
                    className="vg-mini-btn"
                    onClick={() => setShowFullResp(v => !v)}
                    title={showFullResp ? '鍒囨崲涓洪瑙? : '鍒囨崲涓哄畬鏁?}
                  >
                    {showFullResp ? '棰勮' : '瀹屾暣'}
                  </button>
                ) : null}
              </div>
              <pre className="v">{respText}</pre>
            </div>
          ) : null}

          {msg && <div className="vg-tip">{msg}</div>}

          <div className="vg-modal-info">
            <div className="r"><span className="k">鏂囦欢</span><span className="v">{fileName}</span></div>
            <div className="r"><span className="k">鐘舵€?/span><span className="v">{task?.status}</span></div>
            <div className="r"><span className="k">鏃堕暱</span><span className="v">{task?.durationSec}s</span></div>
            <div className="r"><span className="k">鐢诲箙</span><span className="v">{task?.aspectRatio}</span></div>
            {/* 娓呮櫚搴﹂€氬父鐢辨ā鍨嬪喅瀹氾紱涓嶅啀灞曠ず/璇锋眰 */}
            <div className="r"><span className="k">妯″瀷</span><span className="v">{task?.model}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

