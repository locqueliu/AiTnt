// 创意库：基础类型定义
// 说明：创意库用于沉淀可复用的提示词模板与“优化偏好”模板

export type CreativeLibraryMode = 't2i' | 'i2i' | 't2v' | 'i2v'

export function creativeModeLabel(mode: CreativeLibraryMode): string {
  if (mode === 't2i') return '文字生图'
  if (mode === 'i2i') return '图像改图'
  if (mode === 't2v') return '文字生视频'
  return '图生视频'
}

export type CreativeCategory =
  | 'all'
  | '人物'
  | '场景'
  | '产品'
  | '艺术'
  | '工具'
  | '其他'

export type CreativeIdeaKind = 'prompt' | 'optimize'

export type CreativeIdeaBase = {
  id: string
  mode: CreativeLibraryMode
  kind: CreativeIdeaKind
  title: string
  category: Exclude<CreativeCategory, 'all'>

  // 列表展示用的自定义标题/说明（可选）
  // 说明：很多模板开头很像，用户用自定义标题更方便分类与检索
  listTitle?: string
  listSubtitle?: string

  // 列表封面（可选）：支持 emoji 或小图片（dataUrl）
  coverKind?: 'emoji' | 'image'
  coverValue?: string

  tags?: string[]
  favorite?: boolean
  createdAt: number
  updatedAt: number
}

export type CreativePromptIdea = CreativeIdeaBase & {
  kind: 'prompt'
  // 生成提示词（应用到左侧“提示词 Prompt”）
  prompt: string
}

export type CreativeOptimizeIdea = CreativeIdeaBase & {
  kind: 'optimize'
  // 优化偏好（应用到“优化偏好-自定义偏好”输入框）
  optimizeCustomText: string
}

export type CreativeIdea = CreativePromptIdea | CreativeOptimizeIdea
