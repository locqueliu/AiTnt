import { DND_NODE_ID } from './dragTypes'

export function setDraggedNodeId(dt: DataTransfer, nodeId: string) {
  try {
    dt.setData(DND_NODE_ID, nodeId)
  } catch {
    // ignore
  }
  // fallback
  try {
    dt.setData('text/plain', nodeId)
  } catch {
    // ignore
  }
}

export function getDraggedNodeId(dt: DataTransfer | null | undefined): string {
  if (!dt) return ''
  try {
    const v = dt.getData(DND_NODE_ID)
    if (typeof v === 'string' && v) return v
  } catch {
    // ignore
  }
  try {
    const v = dt.getData('text/plain')
    if (typeof v === 'string' && v) return v
  } catch {
    // ignore
  }
  return ''
}
