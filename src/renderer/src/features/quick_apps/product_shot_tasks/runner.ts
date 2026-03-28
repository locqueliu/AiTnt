import { chatCompletionsText, type ChatMessage } from '../../../core/api/chatCompletions'
import { generateImage } from '../../../core/api/image'
import { useSettingsStore } from '../../settings/store'
import { resolveApiKey } from '../../settings/utils/apiKeys'
import { srcToDataUrl } from './utils'
import { useProductShotTaskStore, type ProductShotTask, type TaskInputImage, type TaskStep } from './store'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function joinNonEmpty(parts: Array<string | null | undefined>, sep = '\n\n') {
  return parts
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(sep)
}

function assembleFinalPrompt(agent3Template: string, agent2Output: string, agent1Output: string): string {
  const a3 = String(agent3Template || '').trim()
  const a2 = String(agent2Output || '').trim()
  const a1 = String(agent1Output || '').trim()

  return joinNonEmpty([
    a3,
    a2 ? `### Scene Direction\n\n${a2}` : '',
    a1 ? `Product Detail Brief:\n\n${a1}` : ''
  ])
}

async function ensureImageDataUrl(img: TaskInputImage): Promise<string> {
  const src = String(img?.localPath || '').trim()
  if (!src) throw new Error('missing localPath')
  return srcToDataUrl(src)
}

async function ensureImageBase64(img: TaskInputImage): Promise<string> {
  const dataUrl = await ensureImageDataUrl(img)
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : ''
  if (!base64) throw new Error('missing base64')
  return base64
}

function taskDeskSaveDir(task: ProductShotTask): string {
  const label = String(task.promptSetLabel || 'Uncategorized').trim() || 'Uncategorized'
  const safe = label
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return `desk/product-shot/${safe}/${task.id}`
}

function buildAgent1Parts(task: ProductShotTask, dataUrls: Record<string, string>): any[] {
  const parts: any[] = []
  parts.push({
    type: 'text',
    text: 'Below are the input images. Each image is preceded by a short label describing its role. Follow the system instructions carefully.'
  })

  const push = (label: string, key: string) => {
    const url = dataUrls[key]
    if (!url) return
    parts.push({ type: 'text', text: `[${label}]` })
    parts.push({ type: 'image_url', image_url: { url } })
  }

  task.productAngles.slice(0, 6).forEach((img, index) => push(`Product angle ${index + 1}`, `angle:${img.id}`))
  if (task.slots?.wear_ref) push('Wear detail reference (optional)', `slot:wear_ref:${task.slots.wear_ref.id}`)
  if (task.slots?.model) push('Model reference (optional)', `slot:model:${task.slots.model.id}`)
  return parts
}

function buildAgent2Parts(task: ProductShotTask, dataUrls: Record<string, string>): any[] {
  const parts: any[] = []
  parts.push({
    type: 'text',
    text: 'Below are the input images. Each image is preceded by a short label describing its role. Follow the system instructions carefully.'
  })

  const push = (label: string, key: string) => {
    const url = dataUrls[key]
    if (!url) return
    parts.push({ type: 'text', text: `[${label}]` })
    parts.push({ type: 'image_url', image_url: { url } })
  }

  task.productAngles.slice(0, 6).forEach((img, index) => push(`Product angle ${index + 1}`, `angle:${img.id}`))
  const order: Array<[string, string]> = [
    ['model', 'Model reference (optional)'],
    ['outfit', 'Outfit reference (optional)'],
    ['scene', 'Scene reference (optional)'],
    ['pose', 'Pose reference (optional)'],
    ['wear_ref', 'Wear detail reference (optional)']
  ]
  for (const [key, label] of order) {
    const img = (task.slots as any)?.[key] as TaskInputImage | null
    if (img) push(label, `slot:${key}:${img.id}`)
  }
  return parts
}

async function runStep(taskId: string, step: TaskStep, fn: () => Promise<void>) {
  const store = useProductShotTaskStore.getState()
  store.markStep(taskId, step, { state: 'running', startedAt: Date.now(), error: undefined })
  store.setCurrentStep(taskId, step)
  try {
    await fn()
    useProductShotTaskStore.getState().markStep(taskId, step, {
      state: 'success',
      finishedAt: Date.now()
    })
  } catch (error: any) {
    useProductShotTaskStore.getState().markStep(taskId, step, {
      state: 'error',
      finishedAt: Date.now(),
      error: String(error?.message || error)
    })
    throw error
  }
}

export async function runProductShotTask(taskId: string) {
  const store = useProductShotTaskStore.getState()
  const task = store.tasks.find((entry) => entry.id === taskId)
  if (!task) return

  const settings = useSettingsStore.getState() as any
  const providers = settings.providers || []
  const provider = providers.find((entry: any) => entry.id === task.providerId) || null
  if (!provider) throw new Error('provider not found')

  const baseUrl = String(provider.baseUrl || '').trim()
  const promptApiKey = resolveApiKey(provider as any, 'prompt')
  const imageApiKey = resolveApiKey(provider as any, 'image')
  const promptModel = String(provider.selectedPromptModel || '').trim()
  const imageModel = String(provider.selectedImageModel || '').trim()

  if (!baseUrl) throw new Error('missing baseUrl')

  const dataUrls: Record<string, string> = {}
  const fillDataUrl = async (key: string, img: TaskInputImage) => {
    dataUrls[key] = await ensureImageDataUrl(img)
  }
  for (const img of task.productAngles.slice(0, 6)) await fillDataUrl(`angle:${img.id}`, img)
  for (const [key, value] of Object.entries(task.slots || {})) {
    if (!value) continue
    await fillDataUrl(`slot:${key}:${value.id}`, value)
  }

  if (!task.agent1Output.trim()) {
    await runStep(taskId, 'agent1', async () => {
      if (!promptApiKey || !(task.agent1Model || promptModel)) {
        throw new Error('Prompt model or key is not configured.')
      }
      const messages: ChatMessage[] = [
        { role: 'system', content: String(task.agent1Template || '') },
        { role: 'user', content: buildAgent1Parts(task, dataUrls) }
      ]
      const text = await chatCompletionsText({
        baseUrl,
        apiKey: promptApiKey,
        model: String(task.agent1Model || promptModel),
        messages,
        temperature: 0.4,
        maxTokens: 2000
      })
      useProductShotTaskStore.getState().updateTask(taskId, { agent1Output: String(text || '').trim() })
    })
  } else {
    store.markStep(taskId, 'agent1', { state: 'success', finishedAt: Date.now() })
  }

  let currentTask = useProductShotTaskStore.getState().tasks.find((entry) => entry.id === taskId)!

  if (!currentTask.agent2Output.trim()) {
    await runStep(taskId, 'agent2', async () => {
      if (!promptApiKey || !(currentTask.agent2Model || promptModel)) {
        throw new Error('Prompt model or key is not configured.')
      }
      const messages: ChatMessage[] = [
        { role: 'system', content: String(currentTask.agent2Template || '') },
        { role: 'user', content: buildAgent2Parts(currentTask, dataUrls) }
      ]
      const text = await chatCompletionsText({
        baseUrl,
        apiKey: promptApiKey,
        model: String(currentTask.agent2Model || promptModel),
        messages,
        temperature: 0.5,
        maxTokens: 2000
      })
      useProductShotTaskStore.getState().updateTask(taskId, { agent2Output: String(text || '').trim() })
    })
  } else {
    store.markStep(taskId, 'agent2', { state: 'success', finishedAt: Date.now() })
  }

  currentTask = useProductShotTaskStore.getState().tasks.find((entry) => entry.id === taskId)!
  if (!currentTask.finalPrompt.trim()) {
    await runStep(taskId, 'merge', async () => {
      const merged = assembleFinalPrompt(currentTask.agent3Template, currentTask.agent2Output, currentTask.agent1Output)
      useProductShotTaskStore.getState().updateTask(taskId, { finalPrompt: String(merged || '').trim() })
    })
  } else {
    store.markStep(taskId, 'merge', { state: 'success', finishedAt: Date.now() })
  }

  currentTask = useProductShotTaskStore.getState().tasks.find((entry) => entry.id === taskId)!
  await runStep(taskId, 'gen', async () => {
    if (!imageApiKey || !(currentTask.genModel || imageModel)) {
      throw new Error('Image model or key is not configured.')
    }
    const prompt = String(currentTask.finalPrompt || '').trim()
    if (!prompt) throw new Error('final prompt empty')

    const base64s: string[] = []
    for (const img of currentTask.productAngles.slice(0, 8)) {
      base64s.push(await ensureImageBase64(img))
    }
    for (const value of Object.values(currentTask.slots || {})) {
      if (!value) continue
      base64s.push(await ensureImageBase64(value))
    }

    let requestDebug: any = null
    let responseDebug: any = null
    const urls = await generateImage({
      baseUrl,
      apiKey: imageApiKey,
      model: String(currentTask.genModel || imageModel),
      prompt,
      n: 1,
      aspectRatio: String(currentTask.genRatio || '1:1'),
      imageSize: String(currentTask.genRes || '1K'),
      size: undefined,
      image: base64s,
      saveDir: taskDeskSaveDir(currentTask),
      onRequest: (value: any) => {
        requestDebug = value
      },
      onResponse: (value: any) => {
        responseDebug = value
      }
    })
    useProductShotTaskStore.getState().updateTask(taskId, {
      outImages: (urls || []).map(String).filter(Boolean).slice(0, 60),
      requestDebug: requestDebug || undefined,
      responseDebug: responseDebug || undefined
    })
  })

  useProductShotTaskStore.getState().setCurrentStep(taskId, 'done')
}

const running = new Set<string>()

export async function schedulerTick() {
  const state = useProductShotTaskStore.getState()
  const max = Math.max(1, Math.min(4, Number(state.concurrency) || 1))
  if (running.size >= max) return

  const candidates = (state.tasks || [])
    .filter((task) => task.currentStep !== 'done')
    .filter((task) => {
      const gen = task.steps?.gen?.state
      return gen === 'queued' || gen === 'idle'
    })
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)

  for (const task of candidates) {
    if (running.size >= max) break
    if (running.has(task.id)) continue
    running.add(task.id)
    ;(async () => {
      try {
        await runProductShotTask(task.id)
      } catch {
        // errors are already recorded per step
      } finally {
        running.delete(task.id)
      }
    })()
    await sleep(60)
  }
}

export function getRunningTaskIds() {
  return Array.from(running)
}
