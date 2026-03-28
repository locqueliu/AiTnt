import React from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '../../registry/types'
import { useWorkflowStore } from '../../store/workflowStore'

type CanvasNodeT = Node<CanvasNodeData, 'note'>

export default function NoteNode(props: NodeProps<CanvasNodeT>) {
  const { id, data } = props
  const setNodeParamLive = useWorkflowStore(s => s.setNodeParamLive)
  const commitNodeParam = useWorkflowStore(s => s.commitNodeParam)

  const note = typeof data.params?.note === 'string' ? (data.params.note as string) : ''
  const lastCommitted = React.useRef(note)

  React.useEffect(() => {
    lastCommitted.current = note
  }, [id])

  return (
    <div className="aitnt-note-node">
      <div className="aitnt-note-node-title">Note</div>
      <textarea
        className="aitnt-note-node-editor nodrag"
        value={note}
        onChange={(e) => setNodeParamLive(id, 'note', e.target.value)}
        onBlur={() => {
          const cur = typeof (props.data as any)?.params?.note === 'string' ? String((props.data as any).params.note) : ''
          if (cur !== lastCommitted.current) {
            commitNodeParam(id, 'note', cur)
            lastCommitted.current = cur
          }
        }}
        placeholder="鍐欑偣娉ㄩ噴..."
      />

      <Handle type="target" position={Position.Left} id="in:in" className="aitnt-note-handle" />
      <Handle type="source" position={Position.Right} id="out:text" className="aitnt-note-handle" />
    </div>
  )
}

