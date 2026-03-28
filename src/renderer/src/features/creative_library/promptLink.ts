import type { CreativeLibraryMode } from './types'

// 鍒涙剰搴?-> 鐢熷浘椤?鐨勨€滈摼鎺ユ彁绀鸿瘝鈥濇ˉ鎺?// 璇存槑锛氱敱浜庣敓鍥?鍒涙剰搴撳湪涓嶅悓妯″紡椤甸潰涔嬮棿鍒囨崲锛岃繖閲岀敤 localStorage 鍋氫竴娆℃€ф秷鎭紶閫?
export type PendingPromptLink = {
  // 鐩爣椤甸潰锛堟枃瀛楃敓鍥?/ 鍥惧儚鏀瑰浘锛?  mode: CreativeLibraryMode
  // 鍐欏叆鍒板摢涓緭鍏ユ
  target: 'prompt' | 'optimize_custom'
  // 闇€瑕佸啓鍏ョ殑鏂囨湰
  text: string
}

const KEY = 'aitnt-prompt-link-pending:v1'

export function setPendingPromptLink(payload: PendingPromptLink) {
  localStorage.setItem(KEY, JSON.stringify(payload))
}

export function takePendingPromptLink(mode: CreativeLibraryMode): PendingPromptLink | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingPromptLink
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.mode !== mode) return null
    if (parsed.target !== 'prompt' && parsed.target !== 'optimize_custom') return null
    if (typeof parsed.text !== 'string' || !parsed.text.trim()) return null
    localStorage.removeItem(KEY)
    return parsed
  } catch {
    return null
  }
}

