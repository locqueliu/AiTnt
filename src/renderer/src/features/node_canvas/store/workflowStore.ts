import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fileJSONStorage } from '../../../core/persist/fileStorage'
import type { Connection, Edge, Node, NodeChange, EdgeChange, Viewport } from '@xyflow/react'
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import type { CanvasNodeData, NodeManifest } from '../registry/types'
import { getNodeManifest } from '../registry'
import { makeId } from '../core/id'

export interface WorkflowState {
  meta: { id: string; name: string; created_at?: string }
  nodes: Array<Node<CanvasNodeData>>
  edges: Array<Edge>
  viewport: Viewport
  selectedNodeId: string | null

  focusRequest: null | { type: 'node'; id: string } | { type: 'all' }

  past: Array<{ meta: WorkflowState['meta']; nodes: WorkflowState['nodes']; edges: WorkflowState['edges']; viewport: WorkflowState['viewport'] }>
  future: WorkflowState['past']

  setName: (name: string) => void
  newWorkflow: () => void
  setViewport: (viewport: Viewport) => void

  onNodesChange: (changes: NodeChange<Node<CanvasNodeData>>[]) => void
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void
  onConnect: (conn: Connection) => void

  addNodeFromManifest: (m: NodeManifest, position: { x: number; y: number }) => void
  addNodeFromManifestWithParams: (m: NodeManifest, position: { x: number; y: number }, overrides: Record<string, unknown>) => string
  deleteSelection: () => void
  selectAll: () => void

  updateNodeParam: (nodeId: string, key: string, value: unknown) => void
  setNodeParamLive: (nodeId: string, key: string, value: unknown) => void
  commitNodeParam: (nodeId: string, key: string, value: unknown) => void

  clearFocusRequest: () => void

  undo: () => void
  redo: () => void

  loadSnapshot: (snap: WorkflowState['past'][number]) => void
}

function nowIso() {
  return new Date().toISOString()
}

function snapshotOf(state: WorkflowState) {
  return {
    meta: state.meta,
    nodes: state.nodes,
    edges: state.edges,
    viewport: state.viewport
  }
}

function pushHistory(set: any, get: any) {
  const s = get() as WorkflowState
  const snap = snapshotOf(s)
  set({ past: [snap, ...s.past].slice(0, 80), future: [] })
}

function defaultViewport(): Viewport {
  return { x: 0, y: 0, zoom: 1 }
}

function newMeta() {
  return { id: makeId('wf'), name: '鏈懡鍚', created_at: nowIso() }
}

function guessNodeType(m: NodeManifest) {
  const entry = (m as any)?.runtime?.entry
  if (entry === 'text' || m.node_id === 'aitnt.custom.text') return 'text'
  if (entry === 'note' || m.node_id === 'aitnt.custom.note') return 'note'
  return 'basic'
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      meta: newMeta(),
      nodes: [],
      edges: [],
      viewport: defaultViewport(),
      selectedNodeId: null,
      focusRequest: null,
      past: [],
      future: [],

      setName: (name) => set(s => ({ meta: { ...s.meta, name } })),

      newWorkflow: () => {
        set({ meta: newMeta(), nodes: [], edges: [], viewport: defaultViewport(), selectedNodeId: null, past: [], future: [] })
      },

      setViewport: (viewport) => set({ viewport }),

      onNodesChange: (changes) => {
        // Ignore pure selection moves for history.
        set((state) => {
          const nextNodes = applyNodeChanges<Node<CanvasNodeData>>(changes, state.nodes)
          let selectedNodeId: string | null = state.selectedNodeId
          for (const c of changes) {
            if (c.type === 'select') {
              if ((c as any).selected) selectedNodeId = c.id
              else if (selectedNodeId === c.id) selectedNodeId = null
            }
          }
          return { nodes: nextNodes, selectedNodeId }
        })
      },

      onEdgesChange: (changes) => {
        set((state) => ({ edges: applyEdgeChanges<Edge>(changes, state.edges) }))
      },

      onConnect: (conn) => {
        pushHistory(set, get)
        set((state) => ({
          edges: addEdge({
            ...conn,
            id: makeId('e'),
            type: 'bezier',
            className: 'aitnt-edge',
            animated: false
          }, state.edges)
        }))
      },

      addNodeFromManifest: (m, position) => {
        ;(get() as WorkflowState).addNodeFromManifestWithParams(m, position, {})
      },

      addNodeFromManifestWithParams: (m, position, overrides) => {
        pushHistory(set, get)
        const id = makeId('n')

        const params: Record<string, unknown> = {}
        for (const p of m.interface.params || []) {
          params[p.name] = p.default
        }
        for (const k of Object.keys(overrides || {})) {
          params[k] = (overrides as any)[k]
        }

        const nodeType = guessNodeType(m)

        set((state) => ({
          nodes: [
            ...state.nodes,
            {
              id,
              type: nodeType,
              position,
              data: {
                nodeId: m.node_id,
                nodeVersion: m.version,
                displayName: m.display_name,
                params
              }
            }
          ],
          selectedNodeId: id,
          focusRequest: { type: 'node', id }
        }))

        return id
      },

      deleteSelection: () => {
        const s = get()
        const selectedIds = new Set(s.nodes.filter(n => n.selected).map(n => n.id))
        if (selectedIds.size === 0) return
        pushHistory(set, get)
        set((state) => ({
          nodes: state.nodes.filter(n => !selectedIds.has(n.id)),
          edges: state.edges.filter(e => !selectedIds.has(String(e.source)) && !selectedIds.has(String(e.target))),
          selectedNodeId: null
        }))
      },

      selectAll: () => {
        set((state) => ({ nodes: state.nodes.map(n => ({ ...n, selected: true })) }))
      },

      updateNodeParam: (nodeId, key, value) => {
        pushHistory(set, get)
        set((state) => ({
          nodes: state.nodes.map(n => {
            if (n.id !== nodeId) return n
            const data = n.data || ({ nodeId: 'unknown', displayName: 'Node', params: {} } as CanvasNodeData)
            return {
              ...n,
              data: {
                ...data,
                params: { ...(data.params || {}), [key]: value }
              }
            }
          })
        }))
      },

      setNodeParamLive: (nodeId, key, value) => {
        set((state) => ({
          nodes: state.nodes.map(n => {
            if (n.id !== nodeId) return n
            const data = n.data || ({ nodeId: 'unknown', displayName: 'Node', params: {} } as CanvasNodeData)
            return {
              ...n,
              data: {
                ...data,
                params: { ...(data.params || {}), [key]: value }
              }
            }
          })
        }))
      },

      commitNodeParam: (nodeId, key, value) => {
        pushHistory(set, get)
        set((state) => ({
          nodes: state.nodes.map(n => {
            if (n.id !== nodeId) return n
            const data = n.data || ({ nodeId: 'unknown', displayName: 'Node', params: {} } as CanvasNodeData)
            return {
              ...n,
              data: {
                ...data,
                params: { ...(data.params || {}), [key]: value }
              }
            }
          })
        }))
      },

      undo: () => {
        const s = get()
        const prev = s.past[0]
        if (!prev) return
        const cur = snapshotOf(s)
        set({
          meta: prev.meta,
          nodes: prev.nodes,
          edges: prev.edges,
          viewport: prev.viewport,
          past: s.past.slice(1),
          future: [cur, ...s.future]
        })
      },

      redo: () => {
        const s = get()
        const next = s.future[0]
        if (!next) return
        const cur = snapshotOf(s)
        set({
          meta: next.meta,
          nodes: next.nodes,
          edges: next.edges,
          viewport: next.viewport,
          past: [cur, ...s.past],
          future: s.future.slice(1)
        })
      },

      loadSnapshot: (snap) => {
        set({ meta: snap.meta, nodes: snap.nodes, edges: snap.edges, viewport: snap.viewport, selectedNodeId: null, focusRequest: { type: 'all' }, past: [], future: [] })
      },

      clearFocusRequest: () => set({ focusRequest: null })
    }),
    {
      name: 'aitnt-node-canvas-workflow-v1',
      storage: fileJSONStorage,
      version: 1,
      partialize: (s) => ({
        meta: s.meta,
        nodes: s.nodes,
        edges: s.edges,
        viewport: s.viewport
      })
    }
  )
)

export function getSelectedNodeManifest(selectedNodeId: string | null, nodes: Array<Node<CanvasNodeData>>) {
  if (!selectedNodeId) return undefined
  const n = nodes.find(x => x.id === selectedNodeId)
  const nodeId = n?.data?.nodeId
  if (!nodeId) return undefined
  return getNodeManifest(nodeId)
}

