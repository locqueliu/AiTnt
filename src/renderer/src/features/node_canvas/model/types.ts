export type CanvasSchemaVersion = '1.0'

export interface WorkflowDocV1 {
  schema_version: CanvasSchemaVersion
  meta: {
    id: string
    name: string
    created_at?: string
    updated_at?: string
  }
  dependencies?: {
    nodes?: Array<{ node_id: string; version?: string }>
  }
  graph: {
    nodes: Array<{
      instance_id: string
      node_id: string
      node_version?: string
      position: { x: number; y: number }
      params: Record<string, unknown>
      ui?: Record<string, unknown>
    }>
    edges: Array<{
      edge_id: string
      from: { instance_id: string; port: string }
      to: { instance_id: string; port: string }
    }>
    groups?: Array<Record<string, unknown>>
  }
  ui?: {
    viewport?: { x: number; y: number; zoom: number }
  }
}
