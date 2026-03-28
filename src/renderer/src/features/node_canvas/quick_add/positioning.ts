export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function computePopoverPosition(args: {
  anchorClient: { x: number; y: number }
  containerRect: DOMRect
  popoverSize: { w: number; h: number }
  margin?: number
}): { left: number; top: number } {
  const m = typeof args.margin === 'number' ? args.margin : 12
  const { anchorClient, containerRect, popoverSize } = args

  const relX = anchorClient.x - containerRect.left
  const relY = anchorClient.y - containerRect.top

  // open a bit offset from cursor
  let left = relX + 10
  let top = relY + 10

  left = clamp(left, m, containerRect.width - popoverSize.w - m)
  top = clamp(top, m, containerRect.height - popoverSize.h - m)

  return { left, top }
}
