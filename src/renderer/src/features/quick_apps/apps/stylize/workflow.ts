import type { QuickAppWorkflow } from '../../types'

const workflow: QuickAppWorkflow = {
  meta: {
    id: 'stylize',
    name: '风格化重绘',
    desc: '把参考图重绘为指定风格（插画/电影感/赛博等）',
    category: '图像',
    keywords: ['风格', '重绘', '插画', '电影感', '赛博'],
    kind: 'image',
    requiresImage: true,
    requiresPrompt: true
  },
  api: {
    keyUsage: 'image',
    modelField: 'selectedImageModel'
  },
  imageOptions: {
    n: 1,
    size: '1024x1024'
  },
  buildPrompt: (input) => {
    const p = String(input.prompt || '').trim()
    return [
      '你将对用户上传的图片进行“风格化重绘”。',
      '要求：保持主体构图与关键细节一致，提升质感与清晰度，输出高质量成片。',
      p ? `目标风格/要求：\n${p}` : ''
    ].filter(Boolean).join('\n\n')
  }
}

export default workflow
