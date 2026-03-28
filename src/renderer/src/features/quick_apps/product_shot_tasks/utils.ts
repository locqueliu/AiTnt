export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

export async function srcToDataUrl(src: string): Promise<string> {
  const s = String(src || '').trim()
  if (!s) throw new Error('missing src')
  if (/^data:/i.test(s)) return s
  const resp = await fetch(s)
  if (!resp.ok) throw new Error(`读取图片失败：${resp.status}`)
  const blob = await resp.blob()
  return await blobToDataUrl(blob)
}
