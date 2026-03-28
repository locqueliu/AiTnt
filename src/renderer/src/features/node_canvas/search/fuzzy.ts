export function normalize(s: string) {
  return (s || '').toLowerCase().trim()
}

// Tiny scorer: prefix > substring > scattered.
export function score(haystackRaw: string, needleRaw: string): number {
  const h = normalize(haystackRaw)
  const n = normalize(needleRaw)
  if (!n) return 1
  if (h === n) return 100
  if (h.startsWith(n)) return 80
  const idx = h.indexOf(n)
  if (idx >= 0) return 60 - Math.min(20, idx)

  // scattered match
  let hi = 0
  let hit = 0
  for (let ni = 0; ni < n.length; ni++) {
    const c = n[ni]
    const found = h.indexOf(c, hi)
    if (found < 0) return 0
    hit += 1
    hi = found + 1
  }
  return 20 + hit
}
