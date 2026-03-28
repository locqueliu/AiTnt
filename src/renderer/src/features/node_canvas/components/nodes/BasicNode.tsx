import React from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '../../registry/types'
import { useNodeRegistryStore } from '../../registry/store'

function handleStyle() {
  return {
    width: 8,
    height: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--topbar-bg)'
  } as React.CSSProperties
}

type CanvasNode = Node<CanvasNodeData, 'basic'>

export default function BasicNode(props: NodeProps<CanvasNode>) {
  const { data } = props
  const manifest = useNodeRegistryStore(s => s.getManifest(data.nodeId))

  const inputs = manifest?.interface.inputs || []
  const outputs = manifest?.interface.outputs || []

  return (
    <div className="aitnt-basic-node">
      <div className="hdr">
        <div className="t">{data.displayName || manifest?.display_name || data.nodeId}</div>
        <div className="id">{manifest?.category || '鑺傜偣'}</div>
      </div>

      <div className="ports">
        <div className="port-col">
          {inputs.length === 0 && <div className="port" style={{ opacity: 0.6 }}>鏃犺緭鍏?/div>}
          {inputs.map(p => (
            <div className="port" key={`in_${p.name}`}>
              <Handle
                type="target"
                position={Position.Left}
                id={`in:${p.name}`}
                style={{ ...handleStyle(), left: -6 }}
              />
              <span className="nm">{p.name}</span>
              <span>{p.type}</span>
            </div>
          ))}
        </div>

        <div className="port-col">
          {outputs.length === 0 && <div className="port" style={{ opacity: 0.6, justifyContent: 'flex-end' }}>鏃犺緭鍑?/div>}
          {outputs.map(p => (
            <div className="port" key={`out_${p.name}`} style={{ justifyContent: 'flex-end' }}>
              <span>{p.type}</span>
              <span className="nm">{p.name}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={`out:${p.name}`}
                style={{ ...handleStyle(), right: -6 }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

