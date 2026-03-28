export type ParamType = 'string' | 'number' | 'boolean' | 'enum' | 'json' | 'text'

export interface NodeParamDef {
  name: string
  type: ParamType
  required?: boolean
  label?: string
  description?: string
  default?: unknown
  enumValues?: string[]
}

export interface NodePortDef {
  name: string
  type: string
  required?: boolean
  multiple?: boolean
}

export interface NodeManifest {
  schema_version: '1.0'
  node_id: string
  version: string
  display_name: string
  description?: string
  category?: string
  tags?: string[]
  search_aliases?: string[]
  interface: {
    inputs: NodePortDef[]
    outputs: NodePortDef[]
    params?: NodeParamDef[]
  }
  runtime: {
    kind: string
    entry?: string
  }
  permissions?: string[]
}

export type CanvasNodeData = Record<string, unknown> & {
  nodeId: string
  nodeVersion?: string
  displayName: string
  params: Record<string, unknown>
}
