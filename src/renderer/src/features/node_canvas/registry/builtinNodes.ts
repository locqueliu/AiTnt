import type { NodeManifest } from './types'

export const builtinNodeManifests: NodeManifest[] = [
  {
    schema_version: '1.0',
    node_id: 'aitnt.core.prompt',
    version: '1.0.0',
    display_name: '鎻愮ず璇',
    description: '绾枃鏈彁绀鸿瘝鑺傜偣',
    category: '鏂囨湰',
    tags: ['text', 'prompt'],
    search_aliases: ['prompt', 'text', '鎻愮ず璇'],
    interface: {
      inputs: [],
      outputs: [{ name: 'text', type: 'string' }],
      params: [{ name: 'text', type: 'text', label: '鏂囨湰', default: '' }]
    },
    runtime: { kind: 'builtin', entry: 'prompt' },
    permissions: []
  },
  {
    schema_version: '1.0',
    node_id: 'aitnt.core.debug.log',
    version: '1.0.0',
    display_name: '鏃ュ織',
    description: '杈撳嚭浠绘剰鍊煎埌鏃ュ織锛屼究浜庤皟璇',
    category: '璋冭瘯',
    tags: ['debug'],
    search_aliases: ['log', 'print', '鏃ュ織'],
    interface: {
      inputs: [{ name: 'in', type: 'any', required: true }],
      outputs: [],
      params: [{ name: 'label', type: 'string', label: '鏍囩', default: 'log' }]
    },
    runtime: { kind: 'builtin', entry: 'log' },
    permissions: []
  },
  {
    schema_version: '1.0',
    node_id: 'aitnt.core.http.request',
    version: '1.0.0',
    display_name: 'HTTP 璇锋眰',
    description: '璇锋眰涓€涓?URL锛堝叿浣撶瓥鐣ョ敱 Runner 鍐冲畾锛',
    category: '杈撳叆杈撳嚭',
    tags: ['http', 'io'],
    search_aliases: ['http', 'fetch', 'request'],
    interface: {
      inputs: [{ name: 'body', type: 'any', required: false }],
      outputs: [{ name: 'response', type: 'any' }],
      params: [
        { name: 'method', type: 'enum', label: '鏂规硶', default: 'GET', enumValues: ['GET', 'POST', 'PUT', 'DELETE'] },
        { name: 'url', type: 'string', label: '鍦板潃', default: '' },
        { name: 'headers', type: 'json', label: '璇锋眰澶?JSON)', default: '{}' }
      ]
    },
    runtime: { kind: 'builtin', entry: 'http' },
    permissions: ['net']
  }
]

