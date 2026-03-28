import React from 'react'

export default function CanvasSettings() {
  const [root, setRoot] = React.useState<string>('')
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const api = (window as any).aitntAPI
        if (!api?.listCustomNodes) {
          if (!alive) return
          setErr('褰撳墠鐜涓嶆敮鎸佽鍙?custom_nodes锛坣exaAPI 缂哄け锛')
          return
        }
        const r = await api.listCustomNodes()
        if (!alive) return
        if (r?.success) {
          setRoot(String(r.root || ''))
          if (r.warning) setErr(String(r.warning))
        } else {
          setErr('璇诲彇 custom_nodes 澶辫触')
        }
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message || '璇诲彇澶辫触')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const openFolder = async () => {
    try {
      const api = (window as any).aitntAPI
      if (!api?.openCustomNodesFolder) {
        setErr('褰撳墠鐜涓嶆敮鎸佹墦寮€鏂囦欢澶癸紙aitntAPI 缂哄け锛')
        return
      }
      const r = await api.openCustomNodesFolder()
      if (!r?.success) setErr(r?.error || '鎵撳紑澶辫触')
      if (r?.root) setRoot(String(r.root))
    } catch (e: any) {
      setErr(e?.message || '鎵撳紑澶辫触')
    }
  }

  return (
    <div className="st-form-container">
      <div className="st-header">
        <h1>鐢诲竷璁剧疆</h1>
        <p>鑺傜偣搴撱€佸伐浣滄祦涓庤繍琛岀浉鍏崇殑璁剧疆浼氶€愭娌夋穩鍦ㄨ繖閲?/p>
      </div>

      <div className="st-group">
        <label className="st-label">鑷畾涔夎妭鐐瑰簱</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">custom_nodes 鏂囦欢澶?/div>
            <div className="st-inline-desc">鎶婁綘鐨勮妭鐐规斁鍒拌繖涓枃浠跺す锛堥€掑綊鎵弿 node.json锛夛紝鐢诲竷鑺傜偣搴撲細鑷姩鍑虹幇銆?/div>
          </div>
          <button type="button" className="st-refresh-btn" onClick={openFolder}>
            鍦ㄨ祫婧愮鐞嗗櫒涓墦寮€
          </button>
        </div>
        <div className="st-input-wrapper">
          <input className="st-input" value={root} readOnly placeholder="custom_nodes 璺緞" />
        </div>
        {err && (
          <div style={{ fontSize: '0.8rem', color: '#8e94a8' }}>
            {err}
          </div>
        )}
      </div>
    </div>
  )
}

