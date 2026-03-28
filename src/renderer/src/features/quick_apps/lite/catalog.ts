export type LiteQuickApp = {
  id: string
  name: string
  desc: string
  category: string
  badge: string
  keywords: string[]
  zhName?: string
  zhDesc?: string
  zhCategory?: string
  zhBadge?: string
  zhKeywords?: string[]
}

export const liteQuickApps: LiteQuickApp[] = [
  {
    id: 'product_shot',
    name: 'Product Shot Pipeline',
    desc: 'Queue multi-step product-image tasks with reusable prompt sets, reference slots, and a dedicated task desk.',
    category: 'Commerce',
    badge: 'Pipeline',
    keywords: ['product', 'commerce', 'studio', 'task', 'prompt set'],
    zhName: '商品图流水线',
    zhDesc: '使用可复用提示词集、参考位和独立任务台，排队执行多步骤商品图任务。',
    zhCategory: '电商',
    zhBadge: '流水线',
    zhKeywords: ['商品图', '电商', '工作室', '任务', '提示词集']
  },
  {
    id: 'stylize',
    name: 'Stylize Remix',
    desc: 'Restyle a reference image into a new look while keeping the original composition and subject intact.',
    category: 'Image',
    badge: 'Remix',
    keywords: ['stylize', 'remix', 'image', 'reference', 'style'],
    zhName: '风格重绘',
    zhDesc: '把参考图重塑成新的视觉风格，同时尽量保留原始构图和主体。',
    zhCategory: '图像',
    zhBadge: '重绘',
    zhKeywords: ['风格化', '重绘', '图像', '参考图', '风格']
  }
]

export const liteQuickAppMap = new Map(liteQuickApps.map((app) => [app.id, app]))

export function getQuickAppCopy(app: LiteQuickApp, isZh: boolean) {
  return {
    name: isZh ? app.zhName || app.name : app.name,
    desc: isZh ? app.zhDesc || app.desc : app.desc,
    category: isZh ? app.zhCategory || app.category : app.category,
    badge: isZh ? app.zhBadge || app.badge : app.badge,
    keywords: isZh ? app.zhKeywords || app.keywords : app.keywords
  }
}
