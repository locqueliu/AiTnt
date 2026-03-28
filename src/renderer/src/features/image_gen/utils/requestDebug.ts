import type { RequestDebug } from '../../../core/api/image'

function toPrettyJson(v: any): string {
  try {
    return JSON.stringify(v ?? null, null, 2)
  } catch {
    return String(v)
  }
}

function escapeCurlHeaderValue(v: string): string {
  // 用双引号包裹 header，这里只需要转义内部双引号
  return String(v).replace(/"/g, '\\"')
}

export function formatRequestDebugForCopy(req: RequestDebug): string {
  const method = String(req?.method || 'POST').toUpperCase()
  const url = String(req?.url || '')
  const headers = (req?.headers && typeof req.headers === 'object') ? req.headers : {}
  const bodyJson = toPrettyJson(req?.body)

  const headerLines = Object.entries(headers)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n')

  const curlLines: string[] = []
  curlLines.push(`curl -X ${method} "${url}" \\`)
  for (const [k, v] of Object.entries(headers)) {
    curlLines.push(`  -H "${k}: ${escapeCurlHeaderValue(String(v))}" \\`)
  }
  curlLines.push(`  -d '${bodyJson.replace(/'/g, "'\\''")}'`)
  const curl = curlLines.join('\n')

  const fetch = `const url = ${JSON.stringify(url)}
const headers = ${toPrettyJson(headers)}
const body = ${bodyJson}

const res = await fetch(url, {
  method: ${JSON.stringify(method)},
  headers,
  body: JSON.stringify(body)
})

const json = await res.json().catch(() => null)
console.log(res.status, json)`

  return [
    `# Request\n${method} ${url}`,
    headerLines ? `\n# Headers\n${headerLines}` : '',
    `\n# Body\n${bodyJson}`,
    `\n\n# curl\n${curl}`,
    `\n\n# fetch\n${fetch}`
  ].filter(Boolean).join('\n')
}
