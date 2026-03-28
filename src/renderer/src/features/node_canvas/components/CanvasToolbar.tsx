import React from 'react'
import { Download, FilePlus2, FolderOpen, Redo2, Undo2 } from 'lucide-react'
import { useWorkflowStore } from '../store/workflowStore'
import { exportWorkflowDocV1, importWorkflowDocV1 } from '../core/serialize'
import { validateWorkflowDocV1 } from '../core/schema'
import type { WorkflowDocV1 } from '../model/types'
import { uiAlert } from '../../ui/dialogStore'

function downloadJson(fileName: string, obj: unknown) {
  const text = JSON.stringify(obj, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export default function CanvasToolbar() {
  const meta = useWorkflowStore(s => s.meta)
  const setName = useWorkflowStore(s => s.setName)
  const newWorkflow = useWorkflowStore(s => s.newWorkflow)
  const nodes = useWorkflowStore(s => s.nodes)
  const edges = useWorkflowStore(s => s.edges)
  const viewport = useWorkflowStore(s => s.viewport)
  const undo = useWorkflowStore(s => s.undo)
  const redo = useWorkflowStore(s => s.redo)
  const past = useWorkflowStore(s => s.past)
  const future = useWorkflowStore(s => s.future)
  const loadSnapshot = useWorkflowStore(s => s.loadSnapshot)

  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const doExport = () => {
    const doc = exportWorkflowDocV1({ meta, nodes, edges, viewport })
    const safe = (meta.name || '宸ヤ綔娴').replace(/[\\/:*?"<>|]+/g, '_')
    downloadJson(`${safe}.workflow.json`, doc)
  }

  const doImport = async (file: File) => {
    const text = await file.text()
    const parsed = JSON.parse(text) as unknown
    const v = validateWorkflowDocV1(parsed)
    if (!v.ok) {
      const msg = v.diagnostics.map(d => `${d.code}: ${d.message}${d.path ? ` (${d.path})` : ''}`).join('\n')
      uiAlert(`瀵煎叆澶辫触锛歕n${msg}`, '鐢诲竷')
      return
    }

    const { meta, nodes, edges, viewport } = importWorkflowDocV1(v.value as WorkflowDocV1)
    loadSnapshot({ meta, nodes, edges, viewport: viewport || { x: 0, y: 0, zoom: 1 } })
  }

  return (
    <div className="aitnt-canvas-toolbar">
      <div className="group" style={{ minWidth: 0 }}>
        <input
          className="workflow-name"
          value={meta.name}
          onChange={(e) => setName(e.target.value)}
          placeholder="宸ヤ綔娴佸悕绉?
        />
      </div>

      <div className="group">
        <button className="aitnt-canvas-btn" onClick={() => newWorkflow()} title="鏂板缓宸ヤ綔娴?>
          <FilePlus2 size={16} /> 鏂板缓
        </button>

        <button className="aitnt-canvas-btn" onClick={() => fileRef.current?.click()} title="瀵煎叆宸ヤ綔娴?JSON">
          <FolderOpen size={16} /> 瀵煎叆
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void doImport(f)
            e.currentTarget.value = ''
          }}
        />

        <button className="aitnt-canvas-btn" onClick={doExport} title="瀵煎嚭宸ヤ綔娴?JSON">
          <Download size={16} /> 瀵煎嚭
        </button>
      </div>

      <div className="group">
        <button className="aitnt-canvas-btn" onClick={undo} disabled={past.length === 0} title="鎾ら攢">
          <Undo2 size={16} />
        </button>
        <button className="aitnt-canvas-btn" onClick={redo} disabled={future.length === 0} title="閲嶅仛">
          <Redo2 size={16} />
        </button>
      </div>
    </div>
  )
}

