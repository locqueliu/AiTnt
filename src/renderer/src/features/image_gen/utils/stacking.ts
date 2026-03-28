// 自动叠放：把使用同一“优化偏好”的成功图片打包成一个虚拟文件夹
// 说明：这里只做 UI 分组，不会在磁盘上真的创建文件夹

export type StackGroup = {
  key: string
  preference: string
  count: number
  // 用于展示封面
  coverUrl?: string
  // 最近生成时间（用于排序）
  lastCreatedAt: number
}

// 简单稳定 hash（避免用长字符串当 key）
export function hashString(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // 转成无符号并用 16 进制
  return (h >>> 0).toString(16)
}

export function makeGroupKey(preference: string): string {
  const p = (preference || '').trim()
  return p ? `pref_${hashString(p)}` : 'pref_empty'
}

export function shortText(text: string, max = 32): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}...` : t
}
