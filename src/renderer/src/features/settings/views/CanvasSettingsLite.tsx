import React from 'react'
import { useAppLanguage } from '../../i18n'

export default function CanvasSettingsLite() {
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const [root, setRoot] = React.useState('')
  const [nodeCount, setNodeCount] = React.useState(0)
  const [message, setMessage] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const api = (window as any).aitntAPI
      if (!api?.listCustomNodes) {
        setMessage(t('当前构建不支持扫描自定义节点。', 'Custom-node scanning is not available in this build.'))
        return
      }

      const result = await api.listCustomNodes()
      if (result?.success) {
        setRoot(String(result.root || ''))
        setNodeCount(Array.isArray(result.nodes) ? result.nodes.length : 0)
        setMessage(result.warning ? String(result.warning) : null)
        return
      }

      setMessage(result?.error || t('无法扫描 custom_nodes 文件夹。', 'Unable to scan the custom_nodes folder.'))
    } catch (error: any) {
      setMessage(error?.message || t('无法扫描 custom_nodes 文件夹。', 'Unable to scan the custom_nodes folder.'))
    }
  }, [isZh])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const openFolder = async () => {
    try {
      const api = (window as any).aitntAPI
      if (!api?.openCustomNodesFolder) {
        setMessage(t('当前构建不支持打开 custom_nodes 文件夹。', 'Opening the custom_nodes folder is not available in this build.'))
        return
      }

      const result = await api.openCustomNodesFolder()
      if (!result?.success) {
        setMessage(result?.error || t('无法打开 custom_nodes 文件夹。', 'Unable to open the custom_nodes folder.'))
        return
      }

      setRoot(String(result.root || root))
      setMessage(t('已打开 custom_nodes 文件夹。', 'Opened the custom_nodes folder.'))
    } catch (error: any) {
      setMessage(error?.message || t('无法打开 custom_nodes 文件夹。', 'Unable to open the custom_nodes folder.'))
    }
  }

  return (
    <div className="st-form-container">
      <div className="st-header">
        <h1>{t('画布扩展', 'Canvas Extensions')}</h1>
        <p>{t('管理 AiTnt 节点画布使用的本地自定义节点目录。', 'Manage the local custom node folder used by the AiTnt node canvas.')}</p>
      </div>

      <div className="st-group">
        <label className="st-label">{t('自定义节点', 'Custom nodes')}</label>
        <div className="st-inline-row">
          <div className="st-inline-left">
            <div className="st-inline-title">custom_nodes {t('工作区', 'workspace')}</div>
            <div className="st-inline-desc">
              {t(
                'AiTnt 会扫描这个目录中的节点清单，并将兼容扩展加入画布。',
                'AiTnt scans this folder for node manifests and makes compatible extensions available in the canvas.'
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="st-refresh-btn" onClick={() => void refresh()}>
              {t('刷新', 'Refresh')}
            </button>
            <button type="button" className="st-refresh-btn" onClick={() => void openFolder()}>
              {t('打开文件夹', 'Open folder')}
            </button>
          </div>
        </div>

        <div className="st-input-wrapper">
          <input className="st-input" value={root} readOnly placeholder={t('custom_nodes 文件夹路径', 'custom_nodes folder path')} />
        </div>

        <div style={{ fontSize: '0.8rem', color: '#8e94a8', marginTop: '6px' }}>
          {message || (isZh ? `检测到 ${nodeCount} 个节点清单。` : `${nodeCount} node manifest${nodeCount === 1 ? '' : 's'} detected.`)}
        </div>
      </div>
    </div>
  )
}
