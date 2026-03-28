import type { NodeManifest } from './types'
import { useNodeRegistryStore } from './store'

export function listNodeManifests(): NodeManifest[] {
  const s = useNodeRegistryStore.getState()
  return [...(s.builtins || []), ...(s.customs || [])]
}

export function getNodeManifest(nodeId: string): NodeManifest | undefined {
  return useNodeRegistryStore.getState().getManifest(nodeId)
}
