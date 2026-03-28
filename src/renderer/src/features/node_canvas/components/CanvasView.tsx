import React from 'react'
import { ReactFlow, Background, Controls, MiniMap, BackgroundVariant, type ReactFlowInstance, type Viewport, type Node, type Edge, ConnectionLineType } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes'
import { useWorkflowStore } from '../store/workflowStore'
import type { CanvasNodeData } from '../registry/types'
import { useNodeRegistryStore } from '../registry/store'
import { getDraggedNodeId } from '../dnd/dragData'

export default function CanvasView(props: {
  onRequestPaletteAt: (anchor: { client: { x: number; y: number }; flow: { x: number; y: number } }) => void
  onPointerAt?: (anchor: { client: { x: number; y: number }; flow: { x: number; y: number } }) => void
}) {
  const nodes = useWorkflowStore(s => s.nodes)
  const edges = useWorkflowStore(s => s.edges)
  const viewport = useWorkflowStore(s => s.viewport)
  const focusRequest = useWorkflowStore(s => s.focusRequest)
  const clearFocusRequest = useWorkflowStore(s => s.clearFocusRequest)
  const onNodesChange = useWorkflowStore(s => s.onNodesChange)
  const onEdgesChange = useWorkflowStore(s => s.onEdgesChange)
  const onConnect = useWorkflowStore(s => s.onConnect)
  const setViewport = useWorkflowStore(s => s.setViewport)
  const addNodeFromManifest = useWorkflowStore(s => s.addNodeFromManifest)
  const getManifest = useNodeRegistryStore(s => s.getManifest)

  const rf = React.useRef<ReactFlowInstance<Node<CanvasNodeData>, Edge> | null>(null)
  const [rfReady, setRfReady] = React.useState(false)
  const didInitialFit = React.useRef(false)

  const panRef = React.useRef<{
    active: boolean
    lastClient: { x: number; y: number }
    startViewport: Viewport
  }>({
    active: false,
    lastClient: { x: 0, y: 0 },
    startViewport: { x: 0, y: 0, zoom: 1 }
  })

  const shouldIgnoreDbl = React.useCallback((target: EventTarget | null) => {
    const t = target as HTMLElement | null
    if (!t) return false
    if (t.closest('.react-flow__node')) return true
    if (t.closest('.react-flow__controls')) return true
    if (t.closest('.react-flow__minimap')) return true
    if (t.closest('input, textarea, [contenteditable="true"]')) return true
    return false
  }, [])

  const openMenuAtEvent = React.useCallback((e: any) => {
    if (!rf.current) return
    const client = { x: Number(e?.clientX || 0), y: Number(e?.clientY || 0) }
    const flow = rf.current.screenToFlowPosition(client)
    const anchor = { client, flow }
    props.onPointerAt?.(anchor)
    props.onRequestPaletteAt(anchor)
  }, [props])

  const startCtrlRightPan = React.useCallback((e: React.PointerEvent) => {
    const inst = rf.current
    if (!inst) return
    if (e.button !== 2) return
    if (!e.ctrlKey) return

    // start custom pan session
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as any).setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }

    const vp = inst.getViewport()
    panRef.current = {
      active: true,
      lastClient: { x: e.clientX, y: e.clientY },
      startViewport: vp
    }
  }, [])

  const onDragOverCanvas = React.useCallback((e: React.DragEvent) => {
    const nodeId = getDraggedNodeId(e.dataTransfer)
    if (!nodeId) return
    e.preventDefault()
    try {
      e.dataTransfer.dropEffect = 'copy'
    } catch {
      // ignore
    }
  }, [])

  const onDropCanvas = React.useCallback((e: React.DragEvent) => {
    const nodeId = getDraggedNodeId(e.dataTransfer)
    if (!nodeId) return
    const inst = rf.current
    if (!inst) return

    e.preventDefault()
    e.stopPropagation()

    const m = getManifest(nodeId)
    if (!m) return

    const client = { x: e.clientX, y: e.clientY }
    const flow = inst.screenToFlowPosition(client)
    props.onPointerAt?.({ client, flow })
    addNodeFromManifest(m, flow)
  }, [addNodeFromManifest, getManifest, props])

  const moveCtrlRightPan = React.useCallback((e: React.PointerEvent) => {
    const inst = rf.current
    if (!inst) return
    if (!panRef.current.active) return

    e.preventDefault()
    e.stopPropagation()

    const dx = e.clientX - panRef.current.lastClient.x
    const dy = e.clientY - panRef.current.lastClient.y
    panRef.current.lastClient = { x: e.clientX, y: e.clientY }

    const cur = inst.getViewport()
    // drag to move canvas (same direction)
    inst.setViewport({ x: cur.x + dx, y: cur.y + dy, zoom: cur.zoom }, { duration: 0 } as any)
    try {
      setViewport(inst.getViewport())
    } catch {
      // ignore
    }
  }, [setViewport])

  const endCtrlRightPan = React.useCallback((e: React.PointerEvent) => {
    if (!panRef.current.active) return
    e.preventDefault()
    e.stopPropagation()
    panRef.current.active = false
    try {
      ;(e.currentTarget as any).releasePointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  // NOTE: do not force setViewport from persisted state on init.
  // It can override React Flow's internal fit/view init and make nodes appear "missing".

  React.useEffect(() => {
    const inst = rf.current
    if (!inst || !rfReady) return
    if (didInitialFit.current) return
    if (nodes.length === 0) return

    // Heuristic: only auto-fit when viewport looks like a default/invalid/"lost" state.
    const v = viewport
    const looksInvalid = !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.zoom)
    const looksDefault = Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && Math.abs(v.zoom - 1) < 0.0001
    const looksLost = Math.abs(v.x) > 20000 || Math.abs(v.y) > 20000 || v.zoom < 0.05 || v.zoom > 4
    if (!looksInvalid && !looksDefault && !looksLost) {
      didInitialFit.current = true
      return
    }

    didInitialFit.current = true
    void inst.fitView({ padding: 0.18, duration: 180, maxZoom: 1.2 }).finally(() => {
      try {
        setViewport(inst.getViewport())
      } catch {
        // ignore
      }
    })
  }, [rfReady, nodes.length, viewport.x, viewport.y, viewport.zoom, setViewport])

  React.useEffect(() => {
    const inst = rf.current
    if (!inst || !rfReady || !focusRequest) return

    let cancelled = false
    const run = async () => {
      // wait for viewport init
      for (let i = 0; i < 10 && !cancelled; i++) {
        if (inst.viewportInitialized) break
        await new Promise(r => setTimeout(r, 30))
      }
      if (cancelled) return

      try {
        if (focusRequest.type === 'all') {
          await inst.fitView({ padding: 0.18, duration: 260, maxZoom: 1.1 })
        } else {
          const id = focusRequest.id
          const exists = nodes.some(n => n.id === id)
          if (exists) {
            await inst.fitView({ nodes: [{ id }], padding: 0.28, duration: 260, maxZoom: 1.2 })
          }
        }
      } catch {
        // ignore
      } finally {
        try {
          setViewport(inst.getViewport())
        } catch {
          // ignore
        }
        clearFocusRequest()
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [focusRequest, nodes, rfReady, clearFocusRequest, setViewport])

  return (
    <div
      className="aitnt-flow-wrap"
      onDragOver={onDragOverCanvas}
      onDrop={onDropCanvas}
      onContextMenu={(e) => {
        // avoid browser menu during ctrl+right pan
        if (e.ctrlKey) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onPointerDownCapture={startCtrlRightPan}
      onPointerMoveCapture={moveCtrlRightPan}
      onPointerUpCapture={endCtrlRightPan}
      onPointerCancelCapture={endCtrlRightPan}
      onDoubleClickCapture={(e) => {
        if (shouldIgnoreDbl(e.target)) return
        e.preventDefault()
        e.stopPropagation()
        openMenuAtEvent(e)
      }}
      onDoubleClick={(e) => {
        // Fallback for environments where capture doesn't fire reliably.
        if (shouldIgnoreDbl(e.target)) return
        e.preventDefault()
        e.stopPropagation()
        openMenuAtEvent(e)
      }}
    >
      <ReactFlow<Node<CanvasNodeData>, Edge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes as any}
        connectionLineType={ConnectionLineType.Bezier}
        defaultEdgeOptions={{ type: 'bezier', className: 'aitnt-edge' }}
        defaultViewport={viewport}
        // We use double click to open the quick-add menu.
        zoomOnDoubleClick={false}
        // Avoid React Flow using Space for pan (we use Space to open menu).
        panActivationKeyCode={null}
        // Middle mouse button drag to pan (wheel click)
        panOnDrag={[1]}
        selectionOnDrag
        panOnScroll
        onInit={(instance: ReactFlowInstance<Node<CanvasNodeData>, Edge>) => {
          rf.current = instance
          setRfReady(true)

          // If nodes already exist (from persistence/import), try a safe fit.
          if (nodes.length > 0) {
            void instance.fitView({ padding: 0.18, duration: 0, maxZoom: 1.2 }).finally(() => {
              try {
                setViewport(instance.getViewport())
              } catch {
                // ignore
              }
            })
          }
        }}
        onMoveEnd={(_e: unknown, vp: Viewport) => setViewport(vp)}
        onPaneMouseMove={(e: any) => {
          if (!rf.current) return
          const client = { x: e.clientX, y: e.clientY }
          const flow = rf.current.screenToFlowPosition(client)
          props.onPointerAt?.({ client, flow })
        }}
        onPaneClick={(e: any) => {
          if (!rf.current) return
          const client = { x: e.clientX, y: e.clientY }
          const flow = rf.current.screenToFlowPosition(client)
          props.onPointerAt?.({ client, flow })

          // React Flow v12 has no onPaneDoubleClick. Use click detail as a backup.
          if (e?.detail === 2 && !shouldIgnoreDbl(e.target)) {
            e.preventDefault?.()
            e.stopPropagation?.()
            props.onRequestPaletteAt({ client, flow })
          }
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgba(255,255,255,0.10)" />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  )
}

