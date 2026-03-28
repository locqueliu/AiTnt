import type { ApiProvider } from '../../settings/store'
import { resolveApiKey } from '../../settings/utils/apiKeys'
import type { QuickAppWorkflow, QuickAppContext } from '../types'

export function getAppApiContext(args: {
  workflow: QuickAppWorkflow
  providers: ApiProvider[]
  activeProviderId: string | null
  appsProviderId: string | null
  autoSaveEnabled: boolean
  outputDirectory: string
}): { ok: true, ctx: QuickAppContext } | { ok: false, error: string } {
  const { workflow, providers, activeProviderId, appsProviderId, autoSaveEnabled, outputDirectory } = args
  const providerId = (appsProviderId || activeProviderId || '').trim()
  if (!providerId) return { ok: false, error: '请先在设置中选择或配置 API 网站' }

  const provider = providers.find(p => p.id === providerId)
  if (!provider) return { ok: false, error: '找不到对应的 API 网站配置，请在设置中检查' }

  const apiKey = resolveApiKey(provider, workflow.api.keyUsage)
  if (!apiKey) {
    const map: Record<string, string> = { image: '图片 Key', prompt: '优化 Key', translate: '翻译 Key', video: '视频 Key', models: '模型列表 Key' }
    return { ok: false, error: `请先在设置中配置“${map[workflow.api.keyUsage] || 'API Key'}”` }
  }

  const model = String((provider as any)?.[workflow.api.modelField] || '').trim()
  if (!model) {
    const map: Record<string, string> = {
      selectedImageModel: '生图模型',
      selectedPromptModel: '提示词模型',
      selectedTranslateModel: '提示词翻译模型',
      selectedVideoModel: '生视频模型'
    }
    return { ok: false, error: `请先在设置中选择${map[workflow.api.modelField] || '模型'}` }
  }

  return {
    ok: true,
    ctx: {
      providerId,
      baseUrl: String(provider.baseUrl || '').trim(),
      apiKey,
      model,
      saveDir: autoSaveEnabled ? String(outputDirectory || '').trim() || undefined : undefined
    }
  }
}
