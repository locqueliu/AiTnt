import axios from 'axios'
import type { RequestDebug, ResponseDebug } from './image'

export type VideoCreateOptions = {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  fps?: number
  seed?: number
  enhancePrompt?: boolean
  enableUpsample?: boolean
  image?: string[]
  onRequest?: (req: RequestDebug) => void
  onResponse?: (resp: ResponseDebug) => void
}

export type VideoCreateResult = {
  id: string
  status: string
  videoUrl?: string
}

export type VideoPollResult = {
  status: string
  progress?: number
  videoUrl?: string
  errorMessage?: string
}

type RequestCandidate = {
  url: string
  headers: Record<string, string>
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = String(base || '').trim().replace(/\/+$/g, '')
  const trimmedPath = String(path || '').trim().replace(/^\/+/g, '')
  return `${trimmedBase}/${trimmedPath}`
}

function stripTrailingPath(baseUrl: string, suffix: string): string {
  const trimmedBase = String(baseUrl || '').trim().replace(/\/+$/g, '')
  const trimmedSuffix = String(suffix || '').trim().replace(/^\/+/g, '')
  if (!trimmedSuffix) return trimmedBase
  return trimmedBase.toLowerCase().endsWith(`/${trimmedSuffix.toLowerCase()}`)
    ? trimmedBase.slice(0, -(trimmedSuffix.length + 1))
    : trimmedBase
}

function buildCreateUrls(baseUrl: string): string[] {
  const endpoint = String(baseUrl || '').trim().replace(/\/+$/g, '')
  const endsWithV1 = /\/v1$/i.test(endpoint)
  const endsWithV2 = /\/v2$/i.test(endpoint)
  const root = stripTrailingPath(stripTrailingPath(endpoint, 'v1'), 'v2')

  const urls = [
    endsWithV2 ? joinUrl(endpoint, 'videos/generations') : '',
    endsWithV2 ? joinUrl(endpoint, 'video/generations') : '',
    joinUrl(root, 'v2/videos/generations'),
    joinUrl(root, 'v2/video/generations'),
    joinUrl(root, 'videos/generations'),
    joinUrl(root, 'video/generations'),
    endsWithV1 ? joinUrl(endpoint, 'video/generations') : '',
    endsWithV1 ? joinUrl(endpoint, 'videos/generations') : '',
    joinUrl(root, 'v1/video/generations'),
    joinUrl(root, 'v1/videos/generations')
  ]

  return Array.from(new Set(urls.filter(Boolean)))
}

function buildPollUrls(baseUrl: string, id: string): string[] {
  const endpoint = String(baseUrl || '').trim().replace(/\/+$/g, '')
  const endsWithV1 = /\/v1$/i.test(endpoint)
  const endsWithV2 = /\/v2$/i.test(endpoint)
  const root = stripTrailingPath(stripTrailingPath(endpoint, 'v1'), 'v2')
  const safeId = encodeURIComponent(String(id || '').trim())

  const urls = [
    endsWithV2 ? joinUrl(endpoint, `videos/generations/${safeId}`) : '',
    endsWithV2 ? joinUrl(endpoint, `video/generations/${safeId}`) : '',
    joinUrl(root, `v2/videos/generations/${safeId}`),
    joinUrl(root, `v2/video/generations/${safeId}`),
    joinUrl(root, `videos/generations/${safeId}`),
    joinUrl(root, `video/generations/${safeId}`),
    endsWithV1 ? joinUrl(endpoint, `video/generations/${safeId}`) : '',
    endsWithV1 ? joinUrl(endpoint, `videos/generations/${safeId}`) : '',
    joinUrl(root, `v1/video/generations/${safeId}`),
    joinUrl(root, `v1/videos/generations/${safeId}`)
  ]

  return Array.from(new Set(urls.filter(Boolean)))
}

function safeJsonPreview(value: unknown, maxLen: number): string {
  let text = ''

  try {
    const seen = new WeakSet<object>()
    text = JSON.stringify(
      value ?? null,
      (_key, entry) => {
        if (typeof entry === 'string') {
          return entry.length > 800 ? `${entry.slice(0, 240)}...<len=${entry.length}>` : entry
        }
        if (entry && typeof entry === 'object') {
          if (seen.has(entry)) return '[Circular]'
          seen.add(entry)
        }
        return entry
      },
      2
    )
  } catch {
    text = String(value || '')
  }

  const trimmed = String(text || '').trim()
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed
}

function maskSecret(apiKey: string, value: string): string {
  let masked = String(value || '')
  const key = String(apiKey || '')
  if (!key) return masked
  masked = masked.split(key).join('<API_KEY>')
  masked = masked.split(encodeURIComponent(key)).join('<API_KEY>')
  return masked
}

function sanitizeRequestForDebug(
  apiKey: string,
  request: { url: string; headers: Record<string, string>; body: unknown }
): RequestDebug {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(request.headers || {})) {
    headers[key] = maskSecret(apiKey, String(value || ''))
  }

  return {
    method: 'POST',
    url: maskSecret(apiKey, request.url),
    headers,
    body: request.body
  }
}

function sanitizeResponseForDebug(
  apiKey: string,
  response: { url: string; status?: number; data: unknown }
): ResponseDebug {
  return {
    status: response.status,
    url: maskSecret(apiKey, response.url),
    dataPreview: maskSecret(apiKey, safeJsonPreview(response.data, 1600)),
    dataFull: maskSecret(apiKey, safeJsonPreview(response.data, 48000))
  }
}

function buildAuthCandidates(url: string, apiKey: string): RequestCandidate[] {
  return [
    {
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    },
    {
      url: `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`,
      headers: {
        'Content-Type': 'application/json'
      }
    },
    {
      url,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      }
    }
  ]
}

function pickId(data: any): string {
  return String(
    data?.id ||
      data?.taskId ||
      data?.task_id ||
      data?.data?.id ||
      data?.data?.taskId ||
      data?.data?.task_id ||
      ''
  ).trim()
}

function pickStatus(data: any): string {
  return String(
    data?.status ||
      data?.state ||
      data?.task_status ||
      data?.taskStatus ||
      data?.generation_status ||
      data?.generationStatus ||
      data?.result?.status ||
      data?.task?.status ||
      data?.data?.status ||
      data?.data?.state ||
      data?.data?.task_status ||
      data?.data?.taskStatus ||
      data?.data?.result?.status ||
      data?.data?.task?.status ||
      ''
  ).trim()
}

function normalizeGatewayStatus(status: string): string {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) return 'unknown'

  if (
    [
      'queued',
      'pending',
      'submitted',
      'processing',
      'running',
      'in_progress',
      'in-progress',
      'working'
    ].includes(normalized)
  ) {
    return 'running'
  }

  if (
    ['succeeded', 'success', 'completed', 'done', 'finished', 'complete'].includes(normalized)
  ) {
    return 'succeeded'
  }

  if (['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(normalized)) {
    return 'failed'
  }

  return normalized
}

function pickProgress(data: any): number | undefined {
  const raw =
    data?.progress ||
    data?.percentage ||
    data?.progress_percent ||
    data?.progressPercentage ||
    data?.result?.progress ||
    data?.task?.progress ||
    data?.data?.progress

  const value = Number(raw)
  if (!Number.isFinite(value)) return undefined
  return value <= 1 ? Math.round(value * 100) : Math.round(value)
}

function normalizeVideoUrl(baseUrl: string, url: string): string | null {
  const value = String(url || '').trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value) || /^aitnt:\/\//i.test(value)) return value
  try {
    return new URL(value, String(baseUrl || '').trim()).toString()
  } catch {
    return null
  }
}

function looksLikeVideoUrl(value: string): boolean {
  const lower = String(value || '').trim().toLowerCase()
  if (!lower) return false
  if (/^aitnt:\/\//i.test(lower)) return true
  if (!/^https?:\/\//i.test(lower) && !lower.startsWith('/')) return false
  if (/\.(mp4|mov|webm|m3u8)(\?|$)/i.test(lower)) return true
  return (
    lower.includes('/video') ||
    lower.includes('/videos') ||
    lower.includes('/media') ||
    lower.includes('download')
  )
}

function pickVideoUrl(data: any, baseUrl: string): string | undefined {
  const directCandidates = [
    data?.video_url,
    data?.videoUrl,
    data?.url,
    data?.output_url,
    data?.outputUrl,
    data?.download_url,
    data?.downloadUrl,
    data?.result?.video_url,
    data?.result?.videoUrl,
    data?.result?.url,
    data?.result?.output_url,
    data?.result?.outputUrl,
    data?.task?.video_url,
    data?.task?.videoUrl,
    data?.task?.url,
    data?.data?.video_url,
    data?.data?.videoUrl,
    data?.data?.url,
    data?.data?.output_url,
    data?.data?.outputUrl
  ]

  for (const candidate of directCandidates) {
    const normalized = normalizeVideoUrl(baseUrl, String(candidate || ''))
    if (normalized && looksLikeVideoUrl(normalized)) return normalized
  }

  const seen = new WeakSet<object>()
  let walked = 0

  const walk = (node: unknown): string | undefined => {
    if (node == null || walked++ > 2000) return undefined

    if (typeof node === 'string') {
      const normalized = normalizeVideoUrl(baseUrl, node)
      return normalized && looksLikeVideoUrl(normalized) ? normalized : undefined
    }

    if (typeof node !== 'object') return undefined
    if (seen.has(node)) return undefined
    seen.add(node)

    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item)
        if (hit) return hit
      }
      return undefined
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
      const hit = walk(value)
      if (hit) return hit
    }

    return undefined
  }

  return walk(data)
}

function pickErrorMessage(data: any): string | undefined {
  const value =
    data?.error?.message ||
    data?.message ||
    data?.fail_reason ||
    data?.data?.fail_reason ||
    data?.error
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function submitVideoRequest(
  apiKey: string,
  candidates: RequestCandidate[],
  body: unknown,
  onRequest?: (req: RequestDebug) => void,
  onResponse?: (resp: ResponseDebug) => void
) {
  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      onRequest?.(
        sanitizeRequestForDebug(apiKey, {
          url: candidate.url,
          headers: candidate.headers,
          body
        })
      )

      const response = await axios.post(candidate.url, body, { headers: candidate.headers })
      onResponse?.(
        sanitizeResponseForDebug(apiKey, {
          url: candidate.url,
          status: response.status,
          data: response.data
        })
      )
      return response
    } catch (error: any) {
      lastError = error
      const status = Number(error?.response?.status || 0)
      const message = String(
        error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || ''
      ).toLowerCase()

      if ([404, 405, 401, 403].includes(status)) continue

      if (
        status >= 500 &&
        (message.includes('multipart') ||
          message.includes('invalid url') ||
          message.includes('unsupported content type') ||
          message.includes('build_request_failed'))
      ) {
        continue
      }

      throw error
    }
  }

  throw lastError || new Error('Video request failed.')
}

export async function createVideoGeneration(options: VideoCreateOptions): Promise<VideoCreateResult> {
  const baseUrl = String(options.baseUrl || '').trim()
  const apiKey = String(options.apiKey || '').trim()
  const model = String(options.model || '').trim()
  const prompt = String(options.prompt || '').trim()

  if (!baseUrl) throw new Error('Missing video API base URL.')
  if (!apiKey) throw new Error('Missing video API key.')
  if (!model) throw new Error('Missing video model.')
  if (!prompt) throw new Error('Prompt cannot be empty.')

  const isComponentsModel = model.toLowerCase().includes('components')

  const buildBody = (imageField: 'image' | 'images' | null) => {
    const body: Record<string, unknown> = {
      model,
      prompt
    }

    if (typeof options.durationSec === 'number') body.duration = options.durationSec
    if (options.aspectRatio && !isComponentsModel) body.aspect_ratio = options.aspectRatio
    if (options.resolution) body.resolution = options.resolution
    if (typeof options.fps === 'number') body.fps = options.fps
    if (typeof options.seed === 'number') body.seed = options.seed
    if (options.enhancePrompt === true) body.enhance_prompt = true
    if (options.enableUpsample === true && !isComponentsModel) body.enable_upsample = true

    if (imageField && Array.isArray(options.image) && options.image.length > 0) {
      body[imageField] = [...options.image]
    }

    return body
  }

  const createUrls = buildCreateUrls(baseUrl)
  const candidates = createUrls.flatMap((url) => buildAuthCandidates(url, apiKey))

  let response
  try {
    response = await submitVideoRequest(
      apiKey,
      candidates,
      buildBody(Array.isArray(options.image) && options.image.length > 0 ? 'image' : null),
      options.onRequest,
      options.onResponse
    )
  } catch (error: any) {
    const status = Number(error?.response?.status || 0)
    const message = String(
      error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || ''
    )
    const shouldRetry =
      Array.isArray(options.image) &&
      options.image.length > 0 &&
      status >= 400 &&
      status < 500 &&
      /images|image/i.test(message)

    if (!shouldRetry) throw error

    response = await submitVideoRequest(
      apiKey,
      candidates,
      buildBody('images'),
      options.onRequest,
      options.onResponse
    )
  }

  const id = pickId(response.data)
  const status = normalizeGatewayStatus(pickStatus(response.data))
  const videoUrl = pickVideoUrl(response.data, baseUrl)

  if (!id && videoUrl) {
    return {
      id: `inline_${Date.now()}`,
      status: status || 'succeeded',
      videoUrl
    }
  }

  if (!id) {
    throw new Error(`The video API did not return a task id.\n\n${safeJsonPreview(response.data, 1200)}`)
  }

  return {
    id,
    status: status || 'running',
    videoUrl
  }
}

export async function pollVideoGeneration(
  baseUrl: string,
  apiKey: string,
  id: string,
  onResponse?: (resp: ResponseDebug) => void
): Promise<VideoPollResult> {
  const urls = buildPollUrls(baseUrl, id)
  let best: { score: number; result: VideoPollResult } | null = null
  let lastError: unknown = null

  for (const url of urls) {
    for (const candidate of buildAuthCandidates(url, apiKey)) {
      try {
        const response = await axios.get(candidate.url, {
          headers: candidate.headers,
          validateStatus: () => true
        })

        onResponse?.(
          sanitizeResponseForDebug(apiKey, {
            url: candidate.url,
            status: response.status,
            data: response.data
          })
        )

        if ([404, 405, 401, 403].includes(response.status)) continue
        if (response.status >= 500) {
          lastError = new Error(`Poll failed with HTTP ${response.status}.`)
          continue
        }
        if (response.status >= 400) {
          throw new Error(
            String(
              response.data?.error?.message || response.data?.message || `Poll failed with HTTP ${response.status}.`
            )
          )
        }

        let status = normalizeGatewayStatus(pickStatus(response.data))
        const videoUrl = pickVideoUrl(response.data, baseUrl)
        if (videoUrl && (!status || status === 'unknown')) status = 'succeeded'

        const result: VideoPollResult = {
          status: status || 'unknown',
          progress: pickProgress(response.data),
          videoUrl,
          errorMessage: pickErrorMessage(response.data)
        }

        if (result.status === 'succeeded' && result.videoUrl) return result
        if (result.status === 'failed') return result

        let score = 0
        if (result.videoUrl) score += 1000
        if (result.status && result.status !== 'unknown') score += 80
        if (result.progress !== undefined) score += 20
        if (result.errorMessage) score += 40

        if (!best || score > best.score) {
          best = { score, result }
        }
      } catch (error) {
        lastError = error
      }
    }
  }

  if (best) return best.result
  throw lastError || new Error('Unable to poll the video generation task.')
}
