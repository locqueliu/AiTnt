import type { QuickAppWorkflow } from '../../types'

const workflow: QuickAppWorkflow = {
  meta: {
    id: 'product_shot',
    name: '电商主图生成器',
    desc: '产品/模特/服装参考一键合成主图；模板组管理 + 任务列表追踪',
    category: '电商',
    keywords: ['产品图', '电商', '背景', '棚拍', '光影', '模板组', '任务'],
    kind: 'image',
    requiresImage: true,
    requiresPrompt: false
  },
  api: {
    keyUsage: 'image',
    modelField: 'selectedImageModel'
  },
  ui: {
    imageSlots: [
      { key: 'model_1', label: '参考模特（你的模特）', required: true },
      { key: 'model_2', label: '参考模特 2' },
      { key: 'model_3', label: '参考模特 3' },
      { key: 'model_4', label: '参考模特 4' }
    ]
  },
  imageOptions: {
    n: 1,
    size: '1024x1024'
  },
  buildPrompt: (input) => {
    return [
      '你将把用户上传的图片处理为“电商产品图”。',
      '要求：主体居中清晰，细节锐利，材质真实；背景干净或浅色渐变；光影自然高级；避免过度涂抹。',
    ].filter(Boolean).join('\n\n')
  }
}

export default workflow
