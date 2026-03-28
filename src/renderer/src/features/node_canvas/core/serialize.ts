import type { Edge, Node, Viewport } from '@xyflow/react'
import type { WorkflowDocV1 } from '../model/types'
import type { CanvasNodeData } from '../registry/types'
import { useNodeRegistryStore } from '../registry/store'

function nowIso() {
  return new Date().toISOString()
}

function handleToPort(handleId: string | null | undefined, fallback: string) {
  if (!handleId) return fallback
  const i = handleId.indexOf(':')
  if (i >= 0) return handleId.slice(i + 1)
  return handleId
}

export function exportWorkflowDocV1(args: {
  meta: { id: string; name: string; created_at?: string }
  nodes: Array<Node<CanvasNodeData>>
  edges: Array<Edge>
  viewport?: Viewport
}): WorkflowDocV1 {
  const deps = new Map<string, { node_id: string; version?: string }>()

  for (const n of args.nodes) {
    const nodeId = n.data?.nodeId
    if (typeof nodeId === 'string' && nodeId) {
      const v = typeof n.data?.nodeVersion === 'string' && n.data.nodeVersion ? n.data.nodeVersion : undefined
      const k = `${nodeId}@${v || ''}`
      if (!deps.has(k)) deps.set(k, { node_id: nodeId, version: v })
    }
  }

  return {
    schema_version: '1.0',
    meta: {
      id: args.meta.id,
      name: args.meta.name,
      created_at: args.meta.created_at,
      updated_at: nowIso()
    },
    dependencies: { nodes: Array.from(deps.values()) },
    graph: {
      nodes: args.nodes.map(n => ({
        instance_id: n.id,
        node_id: n.data?.nodeId || 'unknown',
        node_version: n.data?.nodeVersion,
        position: { x: n.position.x, y: n.position.y },
        params: (n.data?.params || {}) as Record<string, unknown>,
        ui: { collapsed: Boolean((n.data as any)?.collapsed) }
      })),
      edges: args.edges.map(e => ({
        edge_id: e.id,
        from: { instance_id: String(e.source), port: handleToPort(e.sourceHandle, 'out') },
        to: { instance_id: String(e.target), port: handleToPort(e.targetHandle, 'in') }
      }))
    },
    ui: args.viewport ? { viewport: args.viewport } : undefined
  }
}

export function importWorkflowDocV1(doc: WorkflowDocV1): {
  meta: { id: string; name: string; created_at?: string }
  nodes: Array<Node<CanvasNodeData>>
  edges: Array<Edge>
  viewport?: Viewport
} {
  return {
    meta: { id: doc.meta.id, name: doc.meta.name, created_at: doc.meta.created_at },
    nodes: doc.graph.nodes.map(n => ({
      id: n.instance_id,
      type: (() => {
        const m = useNodeRegistryStore.getState().getManifest(n.node_id)
        const entry = (m as any)?.runtime?.entry
        if (entry === 'text' || n.node_id === 'aitnt.custom.text') return 'text'
        if (entry === 'note' || n.node_id === 'aitnt.custom.note') return 'note'
        return 'basic'
      })(),
      position: { x: n.position.x, y: n.position.y },
      data: {
        nodeId: n.node_id,
        nodeVersion: n.node_version,
        displayName: n.node_id,
        params: (n.params || {}) as Record<string, unknown>
      }
    })),
    edges: doc.graph.edges.map(e => ({
      id: e.edge_id,
      source: e.from.instance_id,
      target: e.to.instance_id,
      sourceHandle: `out:${e.from.port}`,
      targetHandle: `in:${e.to.port}`
    })),
    viewport: doc.ui?.viewport
  }
}

