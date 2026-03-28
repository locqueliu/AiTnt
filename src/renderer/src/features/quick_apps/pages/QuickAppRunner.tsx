import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Play } from 'lucide-react'
import { quickAppsCatalog } from '../apps/loadApps'
import ImageDrop from '../components/ImageDrop'
import { useSettingsStore } from '../../settings/store'
import { uiToast } from '../../ui/toastStore'
import { generateImage } from '../../../core/api/image'
import type { QuickAppInputImage } from '../types'
import { getAppApiContext } from '../utils/getAppApiContext'
import '../styles/quickApps.css'

export default function QuickAppRunner() {
  const { appId } = useParams()
  const workflow = useMemo(() => (appId ? quickAppsCatalog.byId.get(String(appId)) : null), [appId])

  const providers = useSettingsStore(s => s.providers)
  const activeProviderId = useSettingsStore(s => s.activeProviderId)
  const appsProviderId = useSettingsStore(s => s.appsProviderId)
  const autoSaveEnabled = useSettingsStore(s => s.autoSaveEnabled)
  const outputDirectory = useSettingsStore(s => s.outputDirectory)

  const imageSlots = useMemo(() => {
    const slots = workflow?.ui?.imageSlots
    if (Array.isArray(slots) && slots.length > 0) return slots
    return [{ key: 'ref', label: '参考图', required: true }]
  }, [workflow])

  const [images, setImages] = useState<Record<string, QuickAppInputImage | null>>({})
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [outImages, setOutImages] = useState<string[]>([])
  const [err, setErr] = useState<string>('')

  // Ensure state has keys for all slots
  useEffect(() => {
    setImages(prev => {
      const next: Record<string, QuickAppInputImage | null> = { ...prev }
      for (const s of imageSlots) {
        const k = String(s.key || '').trim()
        if (!k) continue
        if (!(k in next)) next[k] = null
      }
      // remove stale keys when switching apps
      const keep = new Set(imageSlots.map(s => String(s.key || '').trim()).filter(Boolean))
      for (const k of Object.keys(next)) {
        if (!keep.has(k)) delete next[k]
      }
      return next
    })
  }, [imageSlots])

  const ctxResult = useMemo(() => {
    if (!workflow) return { ok: false as const, error: '找不到该应用' }
    return getAppApiContext({
      workflow,
      providers,
      activeProviderId,
      appsProviderId,
      autoSaveEnabled,
      outputDirectory
    })
  }, [workflow, providers, activeProviderId, appsProviderId, autoSaveEnabled, outputDirectory])

  const handleRun = async () => {
    if (!workflow) return
    setErr('')
    setOutImages([])

    if (workflow.meta.requiresImage !== false) {
      const missingRequired = imageSlots.some(s => {
        const k = String(s.key || '').trim()
        if (!k) return false
        const required = s.required !== false
        return required && !images[k]
      })
      if (missingRequired) {
        uiToast('info', '请先上传参考图片')
        return
      }
    }
    if (workflow.meta.requiresPrompt !== false && !String(prompt || '').trim()) {
      uiToast('info', '请先输入提示词')
      return
    }
    if (!ctxResult.ok) {
      uiToast('info', ctxResult.error)
      return
    }

    const ctx = ctxResult.ctx
    const imgs = imageSlots
      .map(s => images[String(s.key || '').trim()])
      .filter(Boolean) as QuickAppInputImage[]
    const input = { prompt: String(prompt || ''), images: imgs }

    setBusy(true)
    try {
      if (workflow.run) {
        const out = await workflow.run(input, ctx)
        if (out.images && out.images.length > 0) setOutImages(out.images)
        else if (out.text) uiToast('success', '已生成结果')
        return
      }

      const builtPrompt = workflow.buildPrompt(input as any, ctx)
      const imgs = await generateImage({
        baseUrl: ctx.baseUrl,
        apiKey: ctx.apiKey,
        model: ctx.model,
        prompt: builtPrompt,
        n: workflow.imageOptions?.n || 1,
        size: workflow.imageOptions?.size,
        aspectRatio: workflow.imageOptions?.aspectRatio,
        imageSize: workflow.imageOptions?.imageSize,
        image: input.images.length > 0 ? input.images.map(i => i.base64) : undefined,
        saveDir: ctx.saveDir
      })
      setOutImages(imgs)
    } catch (e: any) {
      const msg = String(e?.message || '生成失败')
      setErr(msg)
      uiToast('error', '生成失败')
    } finally {
      setBusy(false)
    }
  }

  if (!workflow) {
    return (
      <div className="qa-run">
        <div className="qa-run-head">
          <Link to="/apps" className="qa-back"><ArrowLeft size={18} /> 返回</Link>
          <div className="qa-run-title">找不到该应用</div>
        </div>
      </div>
    )
  }

  return (
    <div className="qa-run">
      <div className="qa-run-head">
        <Link to="/apps" className="qa-back"><ArrowLeft size={18} /> 返回</Link>
        <div className="qa-run-title">
          <div className="n">{workflow.meta.name}</div>
          <div className="d">{String(workflow.meta.desc || '')}</div>
        </div>
        <div className="qa-run-meta">
          {ctxResult.ok ? (
            <div className="pill">{ctxResult.ctx.model}</div>
          ) : (
            <div className="pill warn">未配置 API</div>
          )}
        </div>
      </div>

      <div className="qa-run-body">
        <div className="qa-run-left">
          <div className="qa-panel">
            <div className="qa-panel-title">输入</div>
            {imageSlots.map(s => {
              const k = String(s.key || '').trim()
              if (!k) return null
              return (
                <div key={k} className="qa-field">
                  <div className="qa-label">{s.label || '参考图'}</div>
                  <ImageDrop
                    value={images[k] || null}
                    onChange={(next) => setImages(prev => ({ ...prev, [k]: next }))}
                    disabled={busy}
                  />
                </div>
              )
            })}

            {workflow.meta.requiresPrompt !== false ? (
              <div className="qa-field">
                <div className="qa-label">{workflow.ui?.promptLabel || '提示词'}</div>
                <textarea
                  className="qa-textarea"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={workflow.ui?.promptPlaceholder || '输入你想要的效果描述...'}
                  disabled={busy}
                />
              </div>
            ) : null}
            <button type="button" className="qa-primary" onClick={handleRun} disabled={busy}>
              <Play size={16} /> {busy ? '运行中...' : '运行'}
            </button>
            {!ctxResult.ok ? (
              <div className="qa-hint">
                {ctxResult.error}（可在 <Link to="/settings">设置</Link> {'>'} <span style={{ color: 'var(--cyan-main)' }}>应用</span> 里选择默认 API 网站）
              </div>
            ) : null}
            {err ? <pre className="qa-err">{err}</pre> : null}
          </div>
        </div>

        <div className="qa-run-right">
          <div className="qa-panel">
            <div className="qa-panel-title">结果</div>
            {outImages.length === 0 ? (
              <div className="qa-empty">
                <div className="t">还没有结果</div>
                <div className="d">上传参考图并运行后，结果会显示在这里。</div>
              </div>
            ) : (
              <div className="qa-result-grid">
                {outImages.map((u, i) => (
                  <div key={`${u}_${i}`} className="qa-result-item">
                    <img src={u} alt={`result_${i}`} draggable={false} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
