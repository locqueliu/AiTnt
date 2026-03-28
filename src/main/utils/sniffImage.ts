// 用魔数（文件头）判断图片真实格式
// 目的：有些平台返回的是 jpeg/webp，但历史版本保存时强制用了 .png 扩展名
// 如果仅靠扩展名设置 content-type，渲染进程会把 jpeg 当 png 解码，从而导致图片在软件里断图

export type SniffedImage = {
  mime: string
  ext: string
}

export function sniffImage(buffer: Uint8Array): SniffedImage | null {
  if (!buffer || buffer.length < 16) return null

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' }
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: '.png' }
  }

  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { mime: 'image/gif', ext: '.gif' }
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: '.webp' }
  }

  return null
}
