export function makeId(prefix: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = crypto
    if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID()}`
  } catch {
    // ignore
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}
