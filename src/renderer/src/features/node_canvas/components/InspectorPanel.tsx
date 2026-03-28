import React from 'react'
import type { Node } from '@xyflow/react'
import type { CanvasNodeData, NodeManifest, NodeParamDef } from '../registry/types'
import { getNodeManifest } from '../registry'
import { useWorkflowStore } from '../store/workflowStore'

function renderInput(def: NodeParamDef, value: unknown, onChange: (v: unknown) => void) {
  if (def.type === 'boolean') {
    return (
      <select value={value === true ? 'true' : 'false'} onChange={(e) => onChange(e.target.value === 'true')}>
        <option value="false">false</option>
        <option value="true">true</option>
      </select>
    )
  }

  if (def.type === 'enum') {
    return (
      <select value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
        {(def.enumValues || []).map(v => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    )
  }

  if (def.type === 'number') {
    return (
      <input
        type="number"
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    )
  }

  if (def.type === 'json') {
    return (
      <textarea
        value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="{}"
      />
    )
  }

  if (def.type === 'text') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  return (
    <input
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function getSelected(nodes: Array<Node<CanvasNodeData>>, selectedId: string | null) {
  if (!selectedId) return undefined
  return nodes.find(n => n.id === selectedId)
}

export default function InspectorPanel() {
  const nodes = useWorkflowStore(s => s.nodes)
  const selectedNodeId = useWorkflowStore(s => s.selectedNodeId)
  const updateNodeParam = useWorkflowStore(s => s.updateNodeParam)

  const sel = getSelected(nodes, selectedNodeId)
  const manifest: NodeManifest | undefined = sel?.data?.nodeId ? getNodeManifest(sel.data.nodeId) : undefined
  const params = manifest?.interface.params || []

  return (
    <div className="aitnt-canvas-panel">
      <div className="panel-header">
        <h3>妫€鏌ュ櫒</h3>
      </div>
      <div className="panel-content">
        {!sel && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>閫変腑涓€涓妭鐐逛互缂栬緫鍙傛暟銆?/div>}
        {sel && (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{sel.data.displayName}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{sel.data.nodeId}</div>
            </div>

            {params.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>璇ヨ妭鐐规病鏈夊彲缂栬緫鍙傛暟銆?/div>
            )}

            {params.map(p => {
              const v = sel.data.params?.[p.name]
              return (
                <div className="aitnt-inspector-kv" key={p.name}>
                  <label title={p.description || ''}>{p.label || p.name}</label>
                  {renderInput(p, v, (nv) => updateNodeParam(sel.id, p.name, nv))}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

