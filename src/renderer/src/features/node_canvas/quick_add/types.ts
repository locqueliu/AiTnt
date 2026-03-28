import type { NodeManifest } from '../registry/types'
import type { ComponentType } from 'react'

export type QuickAddKind = 'node' | 'action'

export type QuickAddGroup = 'common' | 'results' | 'resource'

export interface QuickAddEntryBase {
  key: string
  kind: QuickAddKind
  group: QuickAddGroup
  title: string
  subtitle?: string
  description?: string
  icon?: ComponentType<{ size?: number }>
  enabled: boolean
}

export interface QuickAddNodeEntry extends QuickAddEntryBase {
  kind: 'node'
  nodeId: string
  manifest?: NodeManifest
}

export interface QuickAddActionEntry extends QuickAddEntryBase {
  kind: 'action'
  actionId: 'upload_assets'
}

export type QuickAddEntry = QuickAddNodeEntry | QuickAddActionEntry

export interface QuickAddAnchor {
  client: { x: number; y: number }
  flow: { x: number; y: number }
}
