import type { Diagnostic } from './diagnostic'
import { errorDiag } from './diagnostic'
import type { WorkflowDocV1 } from '../model/types'

export function validateWorkflowDocV1(doc: unknown): { ok: true; value: WorkflowDocV1 } | { ok: false; diagnostics: Diagnostic[] } {
  const diags: Diagnostic[] = []
  if (!doc || typeof doc !== 'object') {
    return { ok: false, diagnostics: [errorDiag('WF_INVALID', 'workflow root must be an object')] }
  }

  const d = doc as any
  if (d.schema_version !== '1.0') {
    diags.push(errorDiag('WF_SCHEMA_VERSION', 'unsupported schema_version', 'schema_version', 'expected "1.0"'))
  }
  if (!d.meta || typeof d.meta !== 'object') {
    diags.push(errorDiag('WF_META', 'missing meta object', 'meta'))
  } else {
    if (typeof d.meta.id !== 'string' || !d.meta.id) diags.push(errorDiag('WF_META_ID', 'meta.id must be a non-empty string', 'meta.id'))
    if (typeof d.meta.name !== 'string') diags.push(errorDiag('WF_META_NAME', 'meta.name must be a string', 'meta.name'))
  }

  if (!d.graph || typeof d.graph !== 'object') {
    diags.push(errorDiag('WF_GRAPH', 'missing graph object', 'graph'))
  } else {
    if (!Array.isArray(d.graph.nodes)) diags.push(errorDiag('WF_GRAPH_NODES', 'graph.nodes must be an array', 'graph.nodes'))
    if (!Array.isArray(d.graph.edges)) diags.push(errorDiag('WF_GRAPH_EDGES', 'graph.edges must be an array', 'graph.edges'))
  }

  if (diags.length > 0) return { ok: false, diagnostics: diags }
  return { ok: true, value: d as WorkflowDocV1 }
}
