import type { QuickAppInputImage } from '../types'

function makeId() {
  return `qa_img_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function likelyImageFile(f: File) {
  const t = String((f as any)?.type || '').toLowerCase()
  if (t.startsWith('image/')) return true
  const n = String(f?.name || '').toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].some(ext => n.endsWith(ext))
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

function scaleToMaxDim(width: number, height: number, maxDim: number) {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))
  const m = Math.max(w, h)
  if (!maxDim || maxDim <= 0 || m <= maxDim) return { width: w, height: h }
  const ratio = maxDim / m
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio))
  }
}

function drawToCanvas(source: CanvasImageSource, targetW: number, targetH: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('canvas unsupported')
  ctx.drawImage(source, 0, 0, targetW, targetH)
  return canvas
}

async function decodeToCanvas(file: File, targetW: number, targetH: number): Promise<HTMLCanvasElement> {
  // Prefer createImageBitmap for EXIF orientation handling
  if (typeof (window as any).createImageBitmap === 'function') {
    let bmp: any = null
    try {
      bmp = await (window as any).createImageBitmap(file, { imageOrientation: 'from-image' } as any)
      return drawToCanvas(bmp, targetW, targetH)
    } finally {
      try { bmp?.close?.() } catch { /* ignore */ }
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    ;(img as any).decoding = 'async'
    img.src = url
    if ((img as any).decode) {
      await (img as any).decode()
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('image decode failed'))
      })
    }
    return drawToCanvas(img, targetW, targetH)
  } finally {
    try { URL.revokeObjectURL(url) } catch { /* ignore */ }
  }
}

function likelyHasAlphaByExtOrType(file: File) {
  const t = String((file as any)?.type || '').toLowerCase()
  const n = String(file?.name || '').toLowerCase()
  return t.includes('png') || t.includes('webp') || n.endsWith('.png') || n.endsWith('.webp')
}

function canvasLooksLikeHasAlpha(canvas: HTMLCanvasElement): boolean {
  // Sample on a tiny canvas to keep it cheap
  const w = Math.min(48, canvas.width)
  const h = Math.min(48, canvas.height)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { alpha: true })
  if (!ctx) return false
  ctx.drawImage(canvas, 0, 0, w, h)
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    return false
  }
  const arr = data.data
  for (let i = 3; i < arr.length; i += 4) {
    if (arr[i] < 250) return true
  }
  return false
}

export async function fileToQuickAppInputImage(
  file: File,
  opts?: { maxDim?: number, jpegQuality?: number }
): Promise<QuickAppInputImage | null> {
  if (!likelyImageFile(file)) return null
  const maxDim = typeof opts?.maxDim === 'number' ? opts!.maxDim! : 1440
  const jpegQuality = typeof opts?.jpegQuality === 'number' ? opts!.jpegQuality! : 0.86

  const srcW = Number((file as any)?.width) || 0
  const srcH = Number((file as any)?.height) || 0

  // Decode once; use it for both dimensions + drawing
  let scaled = { width: 1, height: 1 }
  let canvas: HTMLCanvasElement
  if (typeof (window as any).createImageBitmap === 'function') {
    let bmp: any = null
    try {
      bmp = await (window as any).createImageBitmap(file, { imageOrientation: 'from-image' } as any)
      const inW = Number(bmp?.width) || srcW || 1
      const inH = Number(bmp?.height) || srcH || 1
      scaled = scaleToMaxDim(inW, inH, maxDim)
      canvas = drawToCanvas(bmp, scaled.width, scaled.height)
    } finally {
      try { bmp?.close?.() } catch { /* ignore */ }
    }
  } else {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      ;(img as any).decoding = 'async'
      img.src = url
      if ((img as any).decode) await (img as any).decode()
      else {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('image decode failed'))
        })
      }
      const inW = Number(img.naturalWidth) || srcW || 1
      const inH = Number(img.naturalHeight) || srcH || 1
      scaled = scaleToMaxDim(inW, inH, maxDim)
      canvas = drawToCanvas(img, scaled.width, scaled.height)
    } finally {
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
    }
  }

  let outMime: 'image/jpeg' | 'image/png' = 'image/jpeg'
  if (likelyHasAlphaByExtOrType(file)) {
    // keep png only if it actually has transparency
    outMime = canvasLooksLikeHasAlpha(canvas) ? 'image/png' : 'image/jpeg'
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    const q = outMime === 'image/jpeg' ? jpegQuality : undefined
    canvas.toBlob((b) => {
      if (!b) reject(new Error('toBlob failed'))
      else resolve(b)
    }, outMime, q as any)
  })

  const dataUrl = await blobToDataUrl(blob)
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : ''
  if (!base64) return null

  return {
    id: makeId(),
    dataUrl,
    base64,
    name: file.name || 'image',
    createdAt: Date.now(),
    mimeType: outMime,
    width: scaled.width,
    height: scaled.height,
    bytes: blob.size
  }
}
