import axios from 'axios'

export interface GenerateImageOptions {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  n?: number
  size?: string
  saveDir?: string
  aspectRatio?: string
  imageSize?: string
  image?: string[]
  onRequest?: (req: RequestDebug) => void
  onResponse?: (resp: ResponseDebug) => void
}

export type RequestDebug = {
  method: 'POST'
  url: string
  headers: Record<string, string>
  body: unknown
}

export type ResponseDebug = {
  status?: number
  url: string
  dataPreview: string
  dataFull?: string
}

type RequestCandidate = {
  url: string
  headers: Record<string, string>
}

function parseSize(size: string): { width: number; height: number } | null {
  const match = /^\s*(\d{2,5})\s*x\s*(\d{2,5})\s*$/i.exec(String(size || ''))
  if (!match) return null

  const width = Number.parseInt(match[1], 10)
  const height = Number.parseInt(match[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return { width, height }
}

function normalizeSizeForModel(model: string, requestedSize: string): string {
  const parsed = parseSize(requestedSize)
  if (!parsed) return requestedSize

  const normalizedModel = String(model || '').trim().toLowerCase()
  if (normalizedModel.includes('dall-e-3') || normalizedModel === 'dall-e-3') {
    if (Math.abs(parsed.width - parsed.height) < 64) return '1024x1024'
    return parsed.width > parsed.height ? '1792x1024' : '1024x1792'
  }

  if (normalizedModel.includes('dall-e-2') || normalizedModel === 'dall-e-2') {
    return '1024x1024'
  }

  return requestedSize
}

function isDalleModel(model: string): boolean {
  const normalized = String(model || '').trim().toLowerCase()
  return (
    normalized.includes('dall-e-3') ||
    normalized === 'dall-e-3' ||
    normalized.includes('dall-e-2') ||
    normalized === 'dall-e-2'
  )
}

function isComflyBaseUrl(baseUrl: string): boolean {
  const normalized = String(baseUrl || '').trim().toLowerCase()
  return normalized.includes('ai.comfly.chat') || normalized.includes('comfly.chat')
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

function buildImageGenerationUrls(baseUrl: string): string[] {
  const endpoint = String(baseUrl || '').trim().replace(/\/+$/g, '')
  const endsWithV1 = /\/v1$/i.test(endpoint)
  const endsWithV2 = /\/v2$/i.test(endpoint)
  const root = stripTrailingPath(stripTrailingPath(endpoint, 'v1'), 'v2')

  const urls = [
    endsWithV1 || endsWithV2 ? joinUrl(endpoint, 'images/generations') : '',
    joinUrl(root, 'v1/images/generations'),
    joinUrl(root, 'v2/images/generations'),
    joinUrl(root, 'images/generations')
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

        if (Array.isArray(entry) && entry.length > 16) {
          return [...entry.slice(0, 16), `...<len=${entry.length}>`]
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

  let body: unknown = request.body
  try {
    const seen = new WeakSet<object>()
    body = JSON.parse(
      JSON.stringify(request.body ?? null, (_key, entry) => {
        if (typeof entry === 'string') {
          return entry.length > 600 ? `${entry.slice(0, 160)}...<len=${entry.length}>` : entry
        }

        if (Array.isArray(entry) && entry.length > 12) {
          return [...entry.slice(0, 12), `...<len=${entry.length}>`]
        }

        if (entry && typeof entry === 'object') {
          if (seen.has(entry)) return '[Circular]'
          seen.add(entry)
        }

        return entry
      })
    )
  } catch {
    body = request.body
  }

  return {
    method: 'POST',
    url: maskSecret(apiKey, request.url),
    headers,
    body
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

function maybePushUrl(urls: string[], candidate: unknown) {
  if (typeof candidate !== 'string') return
  const value = candidate.trim()
  if (!value) return
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image/')) {
    urls.push(value)
  }
}

function extractImageLikeOutputs(data: unknown): { dataUrls: string[]; urls: string[] } {
  const dataUrls: string[] = []
  const urls: string[] = []
  const seen = new Set<unknown>()
  let walked = 0

  const pushDataUrl = (mimeType: string | undefined, base64: string) => {
    const value = String(base64 || '').trim()
    if (!value) return
    const mime = String(mimeType || '').trim() || 'image/png'
    dataUrls.push(`data:${mime};base64,${value}`)
  }

  const maybePushUrlsFromText = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return

    const markdownImage = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi
    let match: RegExpExecArray | null
    while ((match = markdownImage.exec(text))) maybePushUrl(urls, match[1])

    const markdownLink = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi
    while ((match = markdownLink.exec(text))) maybePushUrl(urls, match[1])

    const plainUrl = /(https?:\/\/[^\s)\]}>"']+)/gi
    while ((match = plainUrl.exec(text))) maybePushUrl(urls, match[1])
  }

  const walk = (node: unknown, depth: number) => {
    if (node == null || depth > 20 || walked++ > 20000) return

    if (typeof node === 'string') {
      maybePushUrl(urls, node)
      maybePushUrlsFromText(node)
      return
    }

    if (typeof node !== 'object') return
    if (seen.has(node)) return
    seen.add(node)

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }

    const record = node as Record<string, unknown>
    const inlineData = (record.inlineData || record.inline_data) as Record<string, unknown> | undefined
    if (inlineData) {
      const base64 = inlineData.data
      const mimeType = inlineData.mimeType || inlineData.mime_type
      if (typeof base64 === 'string') {
        pushDataUrl(typeof mimeType === 'string' ? mimeType : undefined, base64)
      }
    }

    if (typeof record.b64_json === 'string') {
      pushDataUrl('image/png', record.b64_json)
    }

    maybePushUrl(urls, record.url)

    for (const value of Object.values(record)) {
      walk(value, depth + 1)
    }
  }

  walk(data, 0)

  return {
    dataUrls: Array.from(new Set(dataUrls)),
    urls: Array.from(new Set(urls))
  }
}

function extractTextLikeOutputs(data: unknown): string[] {
  const texts: string[] = []
  const seen = new Set<unknown>()
  let walked = 0

  const walk = (node: unknown, depth: number) => {
    if (node == null || depth > 20 || walked++ > 20000) return

    if (typeof node === 'string') {
      const value = node.trim()
      if (value && !value.startsWith('data:image/') && value.length > 8) {
        texts.push(value)
      }
      return
    }

    if (typeof node !== 'object') return
    if (seen.has(node)) return
    seen.add(node)

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }

    const record = node as Record<string, unknown>
    if (typeof record.text === 'string' && record.text.trim()) {
      texts.push(record.text.trim())
    }

    for (const value of Object.values(record)) {
      walk(value, depth + 1)
    }
  }

  walk(data, 0)
  return Array.from(new Set(texts)).slice(0, 6)
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

async function submitImageRequest(
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
      if ([404, 405, 401, 403].includes(status)) continue
      throw error
    }
  }

  throw lastError || new Error('Image request failed.')
}

async function maybePersistImages(images: string[], saveDir?: string): Promise<string[]> {
  if (!saveDir || !window.aitntAPI?.downloadImage) return images

  const localUrls = await Promise.all(
    images.map(async (url, index) => {
      try {
        const result = await window.aitntAPI.downloadImage({
          url,
          saveDir,
          fileName: `aitnt_image_${Date.now()}_${index}`
        })
        return result.success && result.localPath ? String(result.localPath) : url
      } catch {
        return url
      }
    })
  )

  return localUrls
}

export async function generateImage(options: GenerateImageOptions): Promise<string[]> {
  const baseUrl = String(options.baseUrl || '').trim()
  const apiKey = String(options.apiKey || '').trim()
  const model = String(options.model || '').trim()
  const prompt = String(options.prompt || '').trim()

  if (!baseUrl) throw new Error('Missing image API base URL.')
  if (!apiKey) throw new Error('Missing image API key.')
  if (!model) throw new Error('Missing image model.')
  if (!prompt) throw new Error('Prompt cannot be empty.')

  const urls = buildImageGenerationUrls(baseUrl)
  if (urls.length === 0) throw new Error('Unable to build an image generation endpoint.')

  if (isComflyBaseUrl(baseUrl) && (options.aspectRatio || options.imageSize)) {
    const aspectRatio = String(options.aspectRatio || '').trim()
    const imageSize = String(options.imageSize || '').trim()
    if (!aspectRatio || !imageSize) {
      throw new Error('Comfly image generation requires both aspect ratio and image size.')
    }

    const body: Record<string, unknown> = {
      model,
      prompt,
      n: options.n || 1,
      response_format: 'url',
      aspect_ratio: aspectRatio,
      image_size: imageSize
    }

    if (Array.isArray(options.image) && options.image.length > 0) {
      body.image = options.image
    }

    const candidates = urls.flatMap((url) => buildAuthCandidates(url, apiKey))
    const response = await submitImageRequest(
      apiKey,
      candidates,
      body,
      options.onRequest,
      options.onResponse
    )

    const extracted = extractImageLikeOutputs(response.data)
    const images = extracted.dataUrls.length > 0 ? extracted.dataUrls : extracted.urls
    if (images.length > 0) return await maybePersistImages(images, options.saveDir)

    const textPreview = extractTextLikeOutputs(response.data).join('\n\n')
    throw new Error(
      textPreview
        ? `The image API returned text instead of image output.\n\n${textPreview}`
        : 'The image API did not return any usable image data.'
    )
  }

  const requestedSize = normalizeSizeForModel(model, options.size || '1024x1024')
  const parsed = parseSize(requestedSize) || { width: 1024, height: 1024 }
  const preferExactDimensions = !isDalleModel(model)

  const baseBody: Record<string, unknown> = {
    model,
    prompt,
    n: options.n || 1
  }

  if (Array.isArray(options.image) && options.image.length > 0) {
    baseBody.image = options.image
  }

  const bodyWithDimensions = {
    ...baseBody,
    width: parsed.width,
    height: parsed.height
  }

  const bodyWithSize = {
    ...bodyWithDimensions,
    size: requestedSize
  }

  const candidates = urls.flatMap((url) => buildAuthCandidates(url, apiKey))
  const maxRetries = 2

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const primaryBody = preferExactDimensions ? bodyWithDimensions : bodyWithSize

      let response = await submitImageRequest(
        apiKey,
        candidates,
        primaryBody,
        options.onRequest,
        options.onResponse
      )

      if (preferExactDimensions && !response?.data) {
        response = await submitImageRequest(
          apiKey,
          candidates,
          bodyWithSize,
          options.onRequest,
          options.onResponse
        )
      }

      const extracted = extractImageLikeOutputs(response.data)
      const images = extracted.dataUrls.length > 0 ? extracted.dataUrls : extracted.urls
      if (images.length > 0) {
        return await maybePersistImages(images, options.saveDir)
      }

      const textPreview = extractTextLikeOutputs(response.data).join('\n\n')
      throw new Error(
        textPreview
          ? `The image API returned text instead of images.\n\n${textPreview}`
          : 'The image API did not return any usable image data.'
      )
    } catch (error: any) {
      const status = Number(error?.response?.status || 0)
      const message = String(error?.response?.data?.error?.message || error?.message || '')
      const looksLikeSizeError = status === 400 && /\bsize\b/i.test(message)

      if (preferExactDimensions && looksLikeSizeError) {
        const response = await submitImageRequest(
          apiKey,
          candidates,
          bodyWithSize,
          options.onRequest,
          options.onResponse
        )
        const extracted = extractImageLikeOutputs(response.data)
        const images = extracted.dataUrls.length > 0 ? extracted.dataUrls : extracted.urls
        if (images.length > 0) {
          return await maybePersistImages(images, options.saveDir)
        }
      }

      const retryable = status === 408 || status === 429 || (status >= 500 && status < 600)
      if (attempt < maxRetries && retryable) {
        await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)))
        continue
      }

      if (error?.response?.data?.error?.message) {
        throw new Error(String(error.response.data.error.message))
      }

      throw error
    }
  }

  throw new Error('Image generation failed after multiple attempts.')
}
