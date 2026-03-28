import { FileUp, Globe, Image as ImageIcon, Music, StickyNote, Terminal, Type, Video } from 'lucide-react'
import type { QuickAddEntry } from './types'

export function buildDefaultCommonEntries(args: {
  resolveNode: (nodeId: string) => { enabled: boolean; subtitle?: string }
}): QuickAddEntry[] {
  const { resolveNode } = args

  const node = (nodeId: string, title: string, icon: any, desc?: string): QuickAddEntry => {
    const r = resolveNode(nodeId)
    return {
      key: `node:${nodeId}`,
      kind: 'node',
      group: 'common',
      nodeId,
      title,
      subtitle: r.subtitle,
      description: desc,
      icon,
      enabled: r.enabled
    }
  }

  const action = (actionId: 'upload_assets', title: string, icon: any, desc?: string): QuickAddEntry => {
    return {
      key: `action:${actionId}`,
      kind: 'action',
      group: 'resource',
      actionId,
      title,
      subtitle: '閫夋嫨鏂囦欢',
      description: desc,
      icon,
      enabled: true
    }
  }

  return [
    node('aitnt.custom.text', '鏂囨湰', Type, '杈撳叆涓€娈垫枃瀛楀苟杈撳嚭'),
    node('aitnt.custom.asset.image', '鍥剧墖', ImageIcon, '鍥剧墖璧勬簮鑺傜偣'),
    node('aitnt.custom.asset.video', '瑙嗛', Video, '瑙嗛璧勬簮鑺傜偣'),
    node('aitnt.custom.asset.audio', '闊抽', Music, '闊抽璧勬簮鑺傜偣'),
    action('upload_assets', '涓婁紶璧勬簮', FileUp, '涓婁紶鍥剧墖/瑙嗛/闊抽/鏂囦欢'),
    node('aitnt.core.debug.log', '鏃ュ織', Terminal, '杈撳嚭浠绘剰鍊煎埌鏃ュ織'),
    node('aitnt.core.http.request', 'HTTP 璇锋眰', Globe, '璇锋眰涓€涓?URL'),
    node('aitnt.custom.note', '娉ㄩ噴', StickyNote, '渚跨/娉ㄩ噴鑺傜偣')
  ]
}

