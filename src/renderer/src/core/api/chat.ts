import axios from 'axios'

/**
 * 通用的聊天补全接口 (用于调用大语言模型)
 * 我们目前用它来实现“提示词优化”功能
 */
export async function optimizePrompt(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  optimizePreference?: string,
  refImageDataUrls?: string[]
): Promise<string> {
  // 规范化 URL
  let endpoint = baseUrl.trim()
  if (!endpoint.endsWith('/')) {
    endpoint += '/'
  }

  const pref = String(optimizePreference || '').trim()
  const imgs = Array.isArray(refImageDataUrls) ? refImageDataUrls.map(s => String(s || '').trim()).filter(Boolean) : []

  const userText = `${pref ? `优化偏好：\n${pref}\n\n` : ''}原始提示词：\n${String(userPrompt || '')}${imgs.length ? `\n\n参考图：见后续图片（共 ${imgs.length} 张）。请结合参考图内容优化提示词，但不要编造不存在的主体或细节。` : ''}`

  const makeBody = (withImages: boolean) => {
    const userContent: any = withImages && imgs.length
      ? [{ type: 'text', text: userText }, ...imgs.map(url => ({ type: 'image_url', image_url: { url } }))]
      : userText

    return {
      model: model,
      messages: [
        {
          role: 'system',
          // 固定 system 规则：保证输出稳定、只返回中文提示词
          content: `你是一个顶级的 AI 绘画提示词（Prompt）专家。
你的任务：将用户提供的简单提示词，扩写并优化成一段高质量、细节丰富、结构专业的提示词。

硬性要求：
1. 必须包含主体描述、环境背景、光影细节、镜头视角、艺术风格。
2. 必须使用纯中文输出，不要使用英文。
3. 直接返回优化后的中文提示词文本，不要包含任何多余的对话、问候或解释说明。`
        },
        {
          role: 'user',
          // 将“优化偏好”与原始提示词放到同一个 user message，避免模型忽略偏好
          content: userContent
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    }
  }

  const post = async (withImages: boolean) => {
    const response = await axios.post(
      `${endpoint}chat/completions`,
      makeBody(withImages),
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const msg = response?.data?.choices?.[0]?.message?.content
    if (typeof msg === 'string' && msg.trim()) return msg.trim()
    throw new Error('未获取到有效的生成结果')
  }

  try {
    return await post(Boolean(imgs.length))
  } catch (error: any) {
    // 某些模型/网关不支持图片输入：自动降级为纯文本优化
    const emsg = String(error?.response?.data?.error?.message || error?.message || '')
    if (imgs.length && /image|vision|multimodal|content\s*must\s*be\s*a\s*string/i.test(emsg)) {
      return await post(false)
    }

    if (error?.response?.data?.error?.message) {
      throw new Error(error.response.data.error.message || '模型接口请求失败')
    }
    throw error
  }
}

/**
 * 将中文提示词翻译/改写为英文（用于 Veo 等仅支持英文 prompt 的视频模型）。
 * 只返回英文 prompt 文本，不要多余解释。
 */
export async function translatePromptToEnglish(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  preference?: string
): Promise<string> {
  let endpoint = baseUrl.trim()
  if (!endpoint.endsWith('/')) endpoint += '/'

  try {
    const response = await axios.post(
      `${endpoint}chat/completions`,
      {
        model,
        messages: [
          {
            role: 'system',
            content: `You are a professional translator.
Your task: translate the user's text into natural English as faithfully as possible.

Hard requirements:
1) Output ENGLISH ONLY.
2) Return ONLY the translation text. No explanations, no markdown.
3) Do NOT add new details (no extra subject/scene/lighting/camera/style). Do NOT invent.
4) Keep the meaning, tone, and length close to the original.
5) If the input is already English, return it unchanged.
6) Keep line breaks if present.`
          },
          {
            role: 'user',
            // Note: preference is intentionally NOT injected here.
            // Translating should preserve meaning; injecting style prefs can cause hallucinated additions.
            content: String(userPrompt || '')
          }
        ],
        temperature: 0.2,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content.trim()
    }
    throw new Error('未获取到有效的生成结果')
  } catch (error: any) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error.message || '模型接口请求失败')
    }
    throw error
  }
}
