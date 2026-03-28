import type { CreativeOptimizeIdea, CreativePromptIdea } from '../types'

// 创意库默认示例数据（用户后续可在 UI 里新增/删除）
export const DEFAULT_PROMPT_IDEAS: CreativePromptIdea[] = [
  {
    id: 'idea_t2i_monkey_forest',
    mode: 't2i',
    kind: 'prompt',
    title: '阳光森林里的小猴子',
    category: '场景',
    listTitle: '小猴子 · 童话森林',
    listSubtitle: '清新插画 · 暖色光斑',
    coverKind: 'emoji',
    coverValue: '🌿',
    prompt: '在一片阳光明媚的森林中，一个活泼的小猴子正兴奋地追逐蝴蝶，画面色彩明亮、温暖，背景有树叶光斑与柔和薄雾，镜头轻微广角，童话插画风。',
    tags: ['插画', '童话', '动物'],
    favorite: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'idea_t2i_product_shot',
    mode: 't2i',
    kind: 'prompt',
    title: '产品白底柔光棚拍',
    category: '产品',
    listTitle: '产品主图 · 白底棚拍',
    listSubtitle: '干净背景 · 质感细节',
    coverKind: 'emoji',
    coverValue: '📦',
    prompt: '单一产品居中，纯白背景，柔光箱主光 + 轮廓光，细节锐利，材质真实，轻微阴影，电商主图风格，高级干净。',
    tags: ['电商', '棚拍'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'idea_i2i_style_transfer',
    mode: 'i2i',
    kind: 'prompt',
    title: '图改图：插画风格化',
    category: '艺术',
    listTitle: '风格化 · 日系插画',
    listSubtitle: '结构不变 · 只改风格',
    coverKind: 'emoji',
    coverValue: '🎨',
    prompt: '保留原图主体结构与构图，将整体风格转为日系插画，线条干净，色块清晰，光影柔和，质感细腻。',
    tags: ['风格化', '插画'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]

export const DEFAULT_OPTIMIZE_IDEAS: CreativeOptimizeIdea[] = [
  {
    id: 'idea_t2i_monkey_forest_opt',
    mode: 't2i',
    kind: 'optimize',
    title: '童话绘本风（优化偏好）',
    category: '场景',
    listTitle: '童话绘本风',
    listSubtitle: '优化偏好模板',
    coverKind: 'emoji',
    coverValue: '🌿',
    optimizeCustomText: '偏童话绘本风，画面干净通透，色彩饱和但不过曝，避免出现文字水印。',
    tags: ['插画', '童话'],
    favorite: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'idea_t2i_product_shot_opt',
    mode: 't2i',
    kind: 'optimize',
    title: '电商棚拍（优化偏好）',
    category: '产品',
    listTitle: '电商棚拍',
    listSubtitle: '优化偏好模板',
    coverKind: 'emoji',
    coverValue: '📦',
    optimizeCustomText: '强调产品细节与材质，背景纯净，不要杂物；构图居中，留白充足。',
    tags: ['电商', '棚拍'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'idea_i2i_style_transfer_opt',
    mode: 'i2i',
    kind: 'optimize',
    title: '结构不变（优化偏好）',
    category: '艺术',
    listTitle: '结构不变',
    listSubtitle: '优化偏好模板',
    coverKind: 'emoji',
    coverValue: '🎨',
    optimizeCustomText: '尽量保持人物比例与结构不变，只改变风格与氛围；避免面部崩坏。',
    tags: ['风格化'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]
