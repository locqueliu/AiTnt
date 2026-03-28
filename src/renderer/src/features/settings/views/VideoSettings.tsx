import React from 'react'
import { useSettingsStore } from '../store'
import Toggle from '../components/Toggle'

export default function VideoSettings() {
  const {
    videoAutoSaveEnabled,
    setVideoAutoSaveEnabled,
    videoOutputDirectory,
    setVideoOutputDirectory
  } = useSettingsStore()

  const [msg, setMsg] = React.useState<string>('')

  const pickDir = async () => {
    try {
      if (!window.aitntAPI?.selectDirectory) {
        setMsg('褰撳墠鐜涓嶆敮鎸侀€夋嫨鐩綍')
        return
      }
      const r = await window.aitntAPI.selectDirectory()
      if (!r.success) {
        setMsg(r.error || '閫夋嫨鐩綍澶辫触')
        return
      }
      if (!r.dirPath) {
        setMsg('宸插彇娑')
        return
      }
      setVideoOutputDirectory(r.dirPath)
      setMsg('宸叉洿鏂扮洰褰')
    } catch (e: any) {
      setMsg(e?.message || '閫夋嫨鐩綍澶辫触')
    }
  }

  return (
    <div className="st-form-container">
      <div className="st-header">
        <h1>瑙嗛璁剧疆</h1>
        <p>瑙嗛鐢熸垚瀹屾垚鍚庤嚜鍔ㄥ鍑哄埌鏈湴锛屼紭鍏堢敤鏈湴鏂囦欢棰勮涓庝繚瀛?/p>
      </div>

      <div className="st-group">
        <label className="st-label">瑙嗛鑷姩瀵煎嚭</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">鑷姩淇濆瓨鐢熸垚瑙嗛</div>
            <div className="st-inline-desc">瑙ｅ喅閮ㄥ垎涓浆绔欒繙绔棰戞棤娉曢瑙?鏃犳硶淇濆瓨鐨勯棶棰橈紱瀵煎嚭鍚庤嚜鍔ㄥ垏鍒版湰鍦版挱鏀俱€?/div>
          </div>
          <Toggle
            checked={videoAutoSaveEnabled}
            onChange={setVideoAutoSaveEnabled}
            label="鑷姩淇濆瓨鐢熸垚瑙嗛"
          />
        </div>

        <div className="st-inline-row" style={{ marginTop: 10 }}>
          <div className="st-inline-left">
            <div className="st-inline-title">鑷姩瀵煎嚭鐩綍</div>
            <div className="st-inline-desc">鏀寔鐩稿璺緞锛堜緥濡?output/videos锛夋垨缁濆璺緞锛堜緥濡?D:\\AiTnt\\videos锛夈€?/div>
          </div>
          <button type="button" className="st-refresh-btn" onClick={pickDir} disabled={!videoAutoSaveEnabled}>
            閫夋嫨鐩綍
          </button>
        </div>

        <div className="st-input-wrapper">
          <input
            type="text"
            className="st-input"
            value={videoOutputDirectory}
            onChange={(e) => setVideoOutputDirectory(e.target.value)}
            placeholder="渚嬪: output/videos 鎴?D:\\AiTnt\\videos"
            disabled={!videoAutoSaveEnabled}
          />
        </div>

        {msg ? (
          <div style={{ fontSize: '0.8rem', color: '#8e94a8', marginTop: '6px' }}>
            {msg}
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#8e94a8', marginTop: '6px' }}>
            鐢熸垚鎴愬姛鐨勮棰戝皢鑷姩涓嬭浇骞朵繚瀛樺埌姝ゆ湰鍦版枃浠跺す涓€?          </div>
        )}
      </div>
    </div>
  )
}

