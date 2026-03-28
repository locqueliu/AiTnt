// sniffVideo: very small header sniffing for common video formats
// 璇存槑锛氱敤浜庣粰 aitnt://local 杩斿洖姝ｇ‘鐨?mimeType锛屼互鍙婁繚瀛?瀵煎嚭鏃堕€夋嫨鎵╁睍鍚?
export function sniffVideo(buffer: Buffer): { mime: string, ext: string } | null {
  if (!buffer || buffer.length < 16) return null

  // MP4/MOV: ISO Base Media, ftyp box usually at offset 4
  // [size:4][ftyp:4][brand:4]
  if (buffer.length >= 12) {
    const tag = buffer.toString('ascii', 4, 8)
    if (tag === 'ftyp') {
      const brand = buffer.toString('ascii', 8, 12)
      // quicktime brand is often 'qt  '
      if (brand === 'qt  ') {
        return { mime: 'video/quicktime', ext: '.mov' }
      }
      return { mime: 'video/mp4', ext: '.mp4' }
    }
  }

  // WebM: EBML header 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mime: 'video/webm', ext: '.webm' }
  }

  return null
}

