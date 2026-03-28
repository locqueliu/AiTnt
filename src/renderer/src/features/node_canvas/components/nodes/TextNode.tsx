import React from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Image as ImageIcon, Music, PencilLine, Video, Wand2 } from 'lucide-react'
import type { CanvasNodeData } from '../../registry/types'
import { useWorkflowStore } from '../../store/workflowStore'

type CanvasNode = Node<CanvasNodeData, 'text'>

export default function TextNode(props: NodeProps<CanvasNode>) {
  const { id, data } = props
  const setNodeParamLive = useWorkflowStore(s => s.setNodeParamLive)
  const commitNodeParam = useWorkflowStore(s => s.commitNodeParam)

  const text = typeof data.params?.text === 'string' ? (data.params.text as string) : ''
  const lastCommitted = React.useRef(text)
  const [editing, setEditing] = React.useState(false)
  const taRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => {
    lastCommitted.current = text
  }, [id])

  React.useEffect(() => {
    if (!editing) return
    const t = window.setTimeout(() => taRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [editing])

  const commit = () => {
    const cur = typeof (props.data as any)?.params?.text === 'string' ? String((props.data as any).params.text) : ''
    if (cur !== lastCommitted.current) {
      commitNodeParam(id, 'text', cur)
      lastCommitted.current = cur
    }
  }

  return (
    <div className="aitnt-aix-text-node">
      <div className="aitnt-aix-text-node-title">Text</div>

      <div className="aitnt-aix-text-card">
        <div className="aitnt-aix-text-hint">灏濊瘯:</div>

        <button
          type="button"
          className="aitnt-aix-text-item active nodrag"
          onClick={() => setEditing(true)}
        >
          <span className="ic"><PencilLine size={16} /></span>
          <span className="lb">鑷繁缂栧啓鍐呭</span>
        </button>

        <button type="button" className="aitnt-aix-text-item disabled nodrag" disabled>
          <span className="ic"><Wand2 size={16} /></span>
          <span className="lb">鏂囩敓鍥?/span>
        </button>

        <button type="button" className="aitnt-aix-text-item disabled nodrag" disabled>
          <span className="ic"><Video size={16} /></span>
          <span className="lb">鏂囩敓瑙嗛</span>
        </button>

        <button type="button" className="aitnt-aix-text-item disabled nodrag" disabled>
          <span className="ic"><Music size={16} /></span>
          <span className="lb">鏂囩敓闊充箰</span>
        </button>

        <button type="button" className="aitnt-aix-text-item disabled nodrag" disabled>
          <span className="ic"><ImageIcon size={16} /></span>
          <span className="lb">鍥剧墖鍙嶆帹鎻愮ず璇?/span>
        </button>

        {editing && (
          <div className="aitnt-aix-text-editor-wrap nodrag">
            <textarea
              ref={taRef}
              className="aitnt-aix-text-editor"
              value={text}
              onChange={(e) => setNodeParamLive(id, 'text', e.target.value)}
              onBlur={() => {
                commit()
                setEditing(false)
              }}
              placeholder="杩欓噷杈撳叆鏂囧瓧"
            />
            <div className="aitnt-aix-text-editor-tip">鐐瑰嚮绌虹櫧澶勬垨澶辩劍鑷姩淇濆瓨</div>
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} id="in:in" className="aitnt-plus-handle" />
      <Handle type="source" position={Position.Right} id="out:text" className="aitnt-plus-handle" />
    </div>
  )
}

