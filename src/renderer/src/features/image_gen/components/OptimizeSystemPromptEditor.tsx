import React, { useEffect, useState } from 'react'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { kvGetJsonMigrate, kvSetJson } from '../../../core/persist/kvClient'

// 浼樺寲鍋忓ソ缂栬緫鍣細鐢ㄦ埛杈撳叆鈥滀紭鍖栧亸濂芥彁绀鸿瘝鈥?// 宸ヤ綔娴侊細鐢ㄦ埛杈撳叆 Prompt + 浼樺寲鍋忓ソ -> 鐐瑰嚮鈥滀紭鍖栤€?-> 璋冪敤浼樺寲妯″瀷鐢熸垚鈥滀紭鍖栧悗鐨?Prompt鈥?-> 鐐瑰嚮鈥滃紑濮嬧€濈敤浼樺寲鍚庣殑 Prompt 鐢熷浘
// 娉ㄦ剰锛氳閰嶇疆浼氭寜 providerId 鎸佷箙鍖栧埌 localStorage锛屾柟渚垮 API 缃戠珯鍒嗗埆缁存姢

type PersistedState = {
  customText: string
}

function storageKey(providerId: string) {
  return `aitnt-optimize-system:v1:${providerId}`
}

function lastKey(scopeKey: string) {
  return `aitnt-optimize-last:v1:${scopeKey}`
}

export default function OptimizeSystemPromptEditor(props: {
  providerId: string | null
  // 鐢ㄤ簬鍖哄垎 t2i / i2i锛氳鈥滀笂娆′娇鐢ㄧ殑浼樺寲鍋忓ソ鈥濆悇鑷蹇?  scopeKey: string
  // 灏嗏€滀紭鍖栧亸濂解€濆洖浼犵粰鐖剁粍浠讹紙鐢ㄤ簬璇锋眰鏃舵嫾鍏?user message锛?  onPreferenceChange: (preference: string) => void
  // 澶栭儴涓€娆℃€ф敞鍏ワ細鐢ㄤ簬浠庡垱鎰忓簱鍐欏叆鈥滀紭鍖栧亸濂解€?  injectCustomText?: string
  onInjectedCustomTextConsumed?: () => void
}) {
  const { providerId, scopeKey, onPreferenceChange, injectCustomText, onInjectedCustomTextConsumed } = props

  const [customText, setCustomText] = useState('')

  // 鎺ユ敹澶栭儴娉ㄥ叆鐨勨€滀紭鍖栧亸濂解€濇枃鏈紙涓€娆℃€э級
  useEffect(() => {
    const injected = (injectCustomText || '').trim()
    if (!injected) return
    setCustomText(injected)
    onInjectedCustomTextConsumed && onInjectedCustomTextConsumed()
  }, [injectCustomText, onInjectedCustomTextConsumed])

  // provider 鍒囨崲鏃惰鍙栨寔涔呭寲閰嶇疆
  useEffect(() => {
    let alive = true
    ;(async () => {
      // 鍏堝皾璇曟寜 providerId 璇诲彇锛涜嫢娌℃湁锛屽垯鍥為€€鍒扳€滀笂娆′娇鐢ㄢ€?      try {
        if (!providerId) {
          const lastParsed = await kvGetJsonMigrate<PersistedState | null>(lastKey(scopeKey), null)
          if (!alive) return
          if (lastParsed && typeof lastParsed.customText === 'string') setCustomText(lastParsed.customText)
          return
        }

        const parsed = await kvGetJsonMigrate<PersistedState | null>(storageKey(providerId), null)
        if (!alive) return
        if (parsed && typeof parsed.customText === 'string') {
          setCustomText(parsed.customText)
          return
        }

        const lastParsed = await kvGetJsonMigrate<PersistedState | null>(lastKey(scopeKey), null)
        if (!alive) return
        if (lastParsed && typeof lastParsed.customText === 'string') setCustomText(lastParsed.customText)
      } catch {
        // ignore
      }
    })()
    return () => {
      alive = false
    }
  }, [providerId, scopeKey])

  // 鎺ㄩ€佸埌鐖剁粍浠讹紙鐢ㄤ簬瀹為檯璇锋眰锛?  useEffect(() => {
    onPreferenceChange(customText)
  }, [customText, onPreferenceChange])

  // 鎸佷箙鍖?  useEffect(() => {
    const state: PersistedState = { customText }
    const t = window.setTimeout(() => {
      void kvSetJson(lastKey(scopeKey), state)
      if (providerId) {
        void kvSetJson(storageKey(providerId), state)
      }
    }, 320)
    return () => window.clearTimeout(t)
  }, [providerId, customText, scopeKey])

  const handleReset = () => {
    // 鈥滈粯璁?鎭㈠鈥濓細鎭㈠涓婃浣跨敤鐨勪紭鍖栧亸濂斤紙鏇寸鍚堟闈㈠績鏅猴細涓嶆剰澶栨竻绌猴級
    void (async () => {
      const parsed = await kvGetJsonMigrate<PersistedState | null>(lastKey(scopeKey), null)
      if (parsed && typeof parsed.customText === 'string') {
        setCustomText(parsed.customText)
        return
      }
      setCustomText('')
    })()
  }

  const disabled = !providerId

  return (
    <div className="ig-panel-block">
      <div className="ig-block-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SlidersHorizontal size={16} color="#00e5ff" />
          <span>浼樺寲鍋忓ソ</span>
        </div>
        <div className="ig-block-actions">
          <button
            type="button"
            className="ig-ghost-btn"
            onClick={() => setCustomText('')}
            disabled={disabled || !customText.trim()}
            title="娓呯┖"
          >
            娓呯┖
          </button>
          <button
            type="button"
            className="ig-ghost-btn"
            onClick={handleReset}
            disabled={disabled}
            title="鎭㈠涓婃浣跨敤"
          >
            <RotateCcw size={14} />
            涓婃
          </button>
        </div>
      </div>

      {/* 鍘婚櫎棰勮鎸夐挳缁勶細閬垮厤涓庡彸渚р€滃垱鎰忓簱妯℃澘鈥濆姛鑳介噸澶嶏紱淇濈暀鑷畾涔夊亸濂借緭鍏ユ */}

      <textarea
        className="ig-system-input"
        placeholder={disabled ? '璇峰厛鍦ㄨ缃腑閫夋嫨 API 缃戠珯' : '琛ュ厖浣犳兂瑕佺殑浼樺寲鍋忓ソ锛堜緥濡傦細鏇存ⅵ骞汇€佹洿寮哄姣斻€佸亸鐢靛奖鎰熴€佸己璋冪粏鑺傘€侀伩鍏嶆枃瀛楁按鍗?..锛'}
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}

