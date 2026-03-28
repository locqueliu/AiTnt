import axios from 'axios'

export type ChatRole = 'system' | 'user' | 'assistant'

export type ChatTextPart = { type: 'text', text: string }
export type ChatImagePart = { type: 'image_url', image_url: { url: string } }
export type ChatContent = string | Array<ChatTextPart | ChatImagePart>

export type ChatMessage = {
  role: ChatRole
  content: ChatContent
}

export async function chatCompletionsText(args: {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  const baseUrl = String(args.baseUrl || '').trim()
  const apiKey = String(args.apiKey || '').trim()
  const model = String(args.model || '').trim()
  if (!baseUrl) throw new Error('missing baseUrl')
  if (!apiKey) throw new Error('missing apiKey')
  if (!model) throw new Error('missing model')

  let endpoint = baseUrl
  if (!endpoint.endsWith('/')) endpoint += '/'

  try {
    const resp = await axios.post(
      `${endpoint}chat/completions`,
      {
        model,
        messages: args.messages,
        temperature: typeof args.temperature === 'number' ? args.temperature : 0.6,
        max_tokens: typeof args.maxTokens === 'number' ? args.maxTokens : 2000
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const choices = resp?.data?.choices
    const text = choices?.[0]?.message?.content
    if (typeof text === 'string' && text.trim()) return text.trim()
    throw new Error('未获取到有效的生成结果')
  } catch (error: any) {
    const msg = error?.response?.data?.error?.message
    if (msg) throw new Error(msg)
    throw error
  }
}
