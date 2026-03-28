import React, { useMemo, useState } from 'react'
import { Bot, Check, Copy, Sparkles, X } from 'lucide-react'
import type { QuickAppInputImage } from '../../types'
import type { PromptSet } from '../../prompt_library/store'
import { usePromptLibraryStore } from '../../prompt_library/store'
import { uiConfirm, uiPrompt, uiTextViewer } from '../../../ui/dialogStore'
import { uiToast } from '../../../ui/toastStore'
import { chatCompletionsText, type ChatMessage } from '../../../../core/api/chatCompletions'
import { ensureQuickAppImageData } from '../../utils/localImage'
import { buildGeniePolicyPreviewText, useGeniePolicy } from './geniePolicy'
import { useGenieHistory } from './genieHistory'

type GenieTemplateSource = 'editor' | 'set'

type GenieSendFlags = {
  model: boolean
  wear_ref: boolean
  pose: boolean
  outfit: boolean
  scene: boolean
  product: boolean
}

function safeJsonExtract(raw: string) {
  const s = String(raw || '').trim()
  if (!s) return ''
  try {
    JSON.parse(s)
    return s
  } catch {
    // try ```json
    const m = s.match(/```json\s*([\s\S]*?)```/i)
    if (m && m[1]) return m[1].trim()

    const a = s.indexOf('{')
    const b = s.lastIndexOf('}')
    if (a >= 0 && b > a) return s.slice(a, b + 1)
    return s
  }
}

function parseGenieResult(raw: string): { agent1Template: string, agent2Template: string, agent3Template: string, notes?: string[] } | null {
  const json = safeJsonExtract(raw)
  try {
    const obj = JSON.parse(json)
    const a1 = String(obj?.agent1Template || '')
    const a2 = String(obj?.agent2Template || '')
    const a3 = String(obj?.agent3Template || '')
    if (!a1.trim() || !a2.trim() || !a3.trim()) return null
    const notes = Array.isArray(obj?.notes)
      ? (obj.notes as any[]).map((x: any) => String(x)).map((s: string) => s.trim()).filter(Boolean).slice(0, 12)
      : undefined
    return { agent1Template: a1, agent2Template: a2, agent3Template: a3, notes }
  } catch {
    return null
  }
}

function buildSystemPrompt(policyText: string) {
  // Keep this stable; user preferences go to user message.
  return String.raw`你是“AiTnt 产品图工作流”的【提示词精灵】。
目标：根据用户目标与参考信息，为同一条商品图工作流生成 3 份【彼此配合、职责清晰、上下游接口稳定】的 system prompt（角色1/2/3）。

你必须先在内部建立一个“工作流总规范（Master Spec）”，确保 3 个角色：
- 不重复
- 不抢活
- 输出格式稳定
- 能适配现有合并方式：角色3模板 + 角色2输出（首图拍摄动作） + 角色1输出（产品详细信息提示词）

【强制约束：背景与文字策略必须写进角色模板】
${policyText}

【角色职责定义】
角色1：产品分析师
- 输入：产品角度图，以及可选的人台、佩戴参考或模特参考
- 输出：仅输出“产品详细信息提示词”内容，中文、结构稳定，专注描述形态、材质、工艺、细节
- 禁止：逐字转写或猜测文字；禁止输出场景和背景设计

角色2：拍摄导演
- 输入：产品角度图，以及可选的模特、服装、姿态、场景、佩戴参考
- 输出：仅输出一个区块，标题固定为“## 【首图拍摄动作】”，正文是中文、指令化的动作清单
- 禁止：重复角色1的产品细节；禁止锁定背景颜色与背景策略（交给角色3）

角色3：生图执行器
- 输入：最终会拼入角色2输出与角色1输出
- 输出：一段用于图像生成的 system prompt（中文），负责：
  - 产品复刻策略，确保主体关键细节不被篡改
  - 背景锁定策略，纯色优先，复杂场景降权
  - 文字和 Logo 安全策略，禁止新造可读字母或误生成品牌字样
  - 对服装、姿态、镜头距离、画面完成度的执行规范
- 禁止：输出负面提示词，除非用户明确要求

【输出格式】
你只能输出一个 JSON 对象，不要 markdown，不要解释，不要多余文字。
JSON schema:
{
  "agent1Template": string,
  "agent2Template": string,
  "agent3Template": string,
  "notes": string[]
}

notes 用于简短说明角色分工和关键策略，不超过 8 条。`
}

async function pickImageDataUrls(args: {
  productAngles: QuickAppInputImage[]
  slots: Record<string, QuickAppInputImage | null>
  flags: GenieSendFlags
  productAngleCount: number
}) {
  const { productAngles, slots, flags, productAngleCount } = args
  const items: Array<{ label: string, img: QuickAppInputImage }> = []

  if (flags.product) {
    const n = Math.max(0, Math.min(2, Math.floor(Number(productAngleCount) || 0)))
    for (let i = 0; i < Math.min(n, productAngles.length); i++) {
      const img = productAngles[i]
      if (img) items.push({ label: `浜у搧瑙掑害鍥?${i + 1}`, img })
    }
  }

  const pushSlot = (key: keyof GenieSendFlags, label: string) => {
    if (!flags[key]) return
    const img = slots?.[key as any] as any
    if (img) items.push({ label, img })
  }

  pushSlot('model', '鎴戜滑鐨勬ā鐗')
  pushSlot('wear_ref', '浣╂埓鍙傝€')
  pushSlot('pose', '鍙傝€冨Э鎬')
  pushSlot('outfit', '鏈嶈鍙傝€')
  pushSlot('scene', '鍦烘櫙/鍏夊奖鍙傝€')

  const ensured = await Promise.all(items.map(async (it) => {
    const x = await ensureQuickAppImageData(it.img)
    const url = String(x.sourceDataUrl || x.dataUrl || '').trim()
    return url ? { label: it.label, url } : null
  }))

  return ensured.filter(Boolean) as Array<{ label: string, url: string }>
}

export default function ProductShotPromptGenie(props: {
  open: boolean
  onClose: () => void
  disabled?: boolean

  providerId: string | null
  baseUrl: string
  apiKey: string
  model: string

  templateSource: GenieTemplateSource
  onTemplateSourceChange: (v: GenieTemplateSource) => void

  // which prompt set to use when templateSource === 'set'
  // 'follow-active' means using activeSet
  baseSetId: string
  onBaseSetIdChange: (v: string) => void

  useImages: boolean
  onUseImagesChange: (v: boolean) => void
  flags: GenieSendFlags
  onFlagsChange: (patch: Partial<GenieSendFlags>) => void
  productAngleCount: number
  onProductAngleCountChange: (v: number) => void

  userIdea: string
  onUserIdeaChange: (v: string) => void

  // templates to use as the "base" (from editor)
  editorTemplates: { agent1Template: string, agent2Template: string, agent3Template: string }
  // currently selected set in library
  activeSet: PromptSet | null

  productAngles: QuickAppInputImage[]
  slots: Record<string, QuickAppInputImage | null>

  onApplyAll: (t: { agent1Template: string, agent2Template: string, agent3Template: string }) => void
}) {
  const {
    open,
    onClose,
    disabled,
    providerId,
    baseUrl,
    apiKey,
    model,
    templateSource,
    onTemplateSourceChange,
    baseSetId,
    onBaseSetIdChange,
    useImages,
    onUseImagesChange,
    flags,
    onFlagsChange,
    productAngleCount,
    onProductAngleCountChange,
    userIdea,
    onUserIdeaChange,
    editorTemplates,
    activeSet,
    productAngles,
    slots,
    onApplyAll
  } = props

  const promptSets = usePromptLibraryStore(s => s.sets)
  const addSet = usePromptLibraryStore(s => s.addSet)
  const updateSet = usePromptLibraryStore(s => s.updateSet)
  const setActive = usePromptLibraryStore(s => s.setActive)

  const [busy, setBusy] = useState(false)
  const [raw, setRaw] = useState('')
  const parsed = useMemo(() => parseGenieResult(raw), [raw])

  const history = useGenieHistory()

  const { policy } = useGeniePolicy()
  const policyText = useMemo(() => buildGeniePolicyPreviewText(policy), [policy])

  const setsForProductShot = useMemo(() => {
    const list = (promptSets || []).filter(s => s.appId === 'product_shot')
    return list
      .slice()
      .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.updatedAt - a.updatedAt)
  }, [promptSets])

  const labelOfSet = (s: PromptSet) => {
    const c = String(s.category || '').trim()
    const n = String(s.name || '').trim() || '鏈懡鍚?
    return c ? `${c}/${n}` : n
  }

  const baseTemplates = useMemo(() => {
    if (templateSource === 'set') {
      const resolved = (() => {
        const id = String(baseSetId || '').trim()
        if (id && id !== 'follow-active') {
          const found = setsForProductShot.find(s => s.id === id) || null
          if (found) return found
        }
        return activeSet
      })()

      if (resolved) {
        return {
          agent1Template: String(resolved.agent1Template || ''),
          agent2Template: String(resolved.agent2Template || ''),
          agent3Template: String(resolved.agent3Template || '')
        }
      }
    }
    return {
      agent1Template: String(editorTemplates.agent1Template || ''),
      agent2Template: String(editorTemplates.agent2Template || ''),
      agent3Template: String(editorTemplates.agent3Template || '')
    }
  }, [templateSource, baseSetId, setsForProductShot, activeSet, editorTemplates])

  const imageSendCount = useMemo(() => {
    let n = 0
    if (useImages) {
      if (flags.product) n += Math.min(Math.max(0, productAngleCount), 2, productAngles.length)
      if (flags.model && slots?.model) n += 1
      if (flags.wear_ref && slots?.wear_ref) n += 1
      if (flags.pose && slots?.pose) n += 1
      if (flags.outfit && slots?.outfit) n += 1
      if (flags.scene && slots?.scene) n += 1
    }
    return n
  }, [useImages, flags, productAngleCount, productAngles.length, slots])

  const canRun = Boolean(providerId && baseUrl && apiKey && model)

  const run = async () => {
    if (!canRun) {
      uiToast('info', '璇峰厛鍦ㄨ缃腑閰嶇疆鎻愮ず璇嶆ā鍨?Key')
      return
    }
    const idea = String(userIdea || '').trim()
    if (!idea) {
      uiToast('info', '璇峰厛杈撳叆浣犵殑鎯虫硶锛堜綘甯屾湜杩欏瑙掕壊鎬庝箞鏇村ソ鐢級')
      return
    }

    setBusy(true)
    try {
      const imgs = useImages
        ? await pickImageDataUrls({ productAngles, slots, flags, productAngleCount })
        : []

      const userText = [
        `鐢ㄦ埛鎯虫硶锛歕n${idea}`,
        `\n妯℃澘鏉ユ簮锛?{templateSource === 'set' ? '鎻愮ず璇嶅簱妯℃澘缁' : '褰撳墠缂栬緫鍐呭'}`,
        `\n褰撳墠妯℃澘锛堜緵浣犲湪姝ゅ熀纭€涓婁紭鍖栭噸鍐欙紝淇濇寔鎺ュ彛涓€鑷达級锛歕n[瑙掕壊1妯℃澘]\n${baseTemplates.agent1Template}\n\n[瑙掕壊2妯℃澘]\n${baseTemplates.agent2Template}\n\n[瑙掕壊3妯℃澘]\n${baseTemplates.agent3Template}`,
        imgs.length ? `\n\n鍙傝€冨浘锛氳鍚庣画鍥剧墖锛堝叡 ${imgs.length} 寮狅級銆傛敞鎰忥細鍥剧墖鍙敤浜庡府鍔╀綘鐞嗚В鈥滃垎宸ヤ笌绾︽潫鈥濓紝浣犵敓鎴愮殑鏄?system prompt锛屼笉鏄渶缁堢敓鍥俱€俙 : ''
      ].join('\n')

      const makeMessages = (withImages: boolean) => {
        const userContent: any = (withImages && imgs.length)
          ? [{ type: 'text', text: userText }, ...imgs.flatMap(it => ([
            { type: 'text', text: `銆?{it.label}銆慲 },
            { type: 'image_url', image_url: { url: it.url } }
          ]))]
          : userText

        const messages: ChatMessage[] = [
          { role: 'system', content: buildSystemPrompt(policyText) },
          { role: 'user', content: userContent }
        ]
        return messages
      }

      const post = async (withImages: boolean) => {
        return await chatCompletionsText({
          baseUrl,
          apiKey,
          model,
          messages: makeMessages(withImages),
          temperature: 0.35,
          maxTokens: 2600
        })
      }

      let text = ''
      try {
        text = await post(Boolean(imgs.length))
      } catch (e: any) {
        const emsg = String(e?.message || '')
        if (imgs.length && /image|vision|multimodal|content\s*must\s*be\s*a\s*string/i.test(emsg)) {
          uiToast('info', '褰撳墠妯″瀷涓嶆敮鎸佸浘鐗囪緭鍏ワ細宸茶嚜鍔ㄩ檷绾т负绾枃鏈敓鎴')
          text = await post(false)
        } else {
          throw e
        }
      }

      setRaw(String(text || '').trim())
      const ok = parseGenieResult(text)
      if (!ok) uiToast('info', '宸茬敓鎴愶紝浣嗚В鏋愬け璐ワ細浣犲彲浠ュ湪涓嬫柟鏌ョ湅鍘熸枃骞舵墜鍔ㄥ鍒')

      // auto-save history
      try {
        history.add({
          providerId: providerId || undefined,
          model: String(model || '').trim() || undefined,
          templateSource,
          baseSetId: templateSource === 'set' ? (String(baseSetId || '').trim() || 'follow-active') : 'editor',
          idea: String(idea || ''),
          useImages: Boolean(useImages),
          imageSendCount,
          raw: String(text || ''),
          parsed: ok || undefined
        })
      } catch {
        // ignore
      }
    } catch (e: any) {
      uiToast('error', e?.message || '鐢熸垚澶辫触')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveHistory = () => {
    const t = String(raw || '').trim()
    if (!t) {
      uiToast('info', '娌℃湁鍙繚瀛樼殑鍐呭')
      return
    }
    history.add({
      providerId: providerId || undefined,
      model: String(model || '').trim() || undefined,
      templateSource,
      baseSetId: templateSource === 'set' ? (String(baseSetId || '').trim() || 'follow-active') : 'editor',
      idea: String(userIdea || ''),
      useImages: Boolean(useImages),
      imageSendCount,
      raw: t,
      parsed: parsed || undefined
    })
    uiToast('success', '宸蹭繚瀛樺埌鍘嗗彶')
  }

  const handleApply = () => {
    if (!parsed) return
    onApplyAll(parsed)
    uiToast('success', '宸插啓鍏ヤ笁涓鑹叉ā鏉')
  }

  const handleSaveNew = async () => {
    if (!parsed) return
    const name = await uiPrompt('妯℃澘缁勫悕绉?, { title: '淇濆瓨涓烘柊妯℃澘缁?, placeholder: '渚嬪锛氬附瀛?鎴愮啛姘旇川/绾壊鑳屾櫙' })
    if (!name) return
    const category = await uiPrompt('鍒嗙被锛堝彲閫夛級', { title: '淇濆瓨涓烘柊妯℃澘缁', placeholder: '渚嬪锛氬附瀛?/ 楗板搧 / 琚滃瓙' })
    const created = addSet({
      appId: 'product_shot',
      name,
      category: category || undefined,
      agent1Template: parsed.agent1Template,
      agent2Template: parsed.agent2Template,
      agent3Template: parsed.agent3Template
    } as any)
    setActive('product_shot', created.id)
    uiToast('success', '宸蹭繚瀛樹负鏂版ā鏉跨粍')
  }

  const handleOverwrite = async () => {
    if (!parsed) return
    if (!activeSet?.id) {
      uiToast('info', '璇峰厛閫夋嫨涓€涓ā鏉跨粍鍐嶈鐩')
      return
    }
    const ok = await uiConfirm(`瑕嗙洊淇濆瓨妯℃澘缁勩€?{String(activeSet.name || '').trim() || '鏈懡鍚'}銆嶏紵`, '瑕嗙洊淇濆瓨')
    if (!ok) return
    updateSet(activeSet.id, {
      agent1Template: parsed.agent1Template,
      agent2Template: parsed.agent2Template,
      agent3Template: parsed.agent3Template
    } as any)
    uiToast('success', '宸茶鐩栦繚瀛')
  }

  if (!open) return null

  return (
    <div className="ps-genie-modal" onMouseDown={onClose}>
      <div className="ps-genie-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ps-genie-head">
          <div className="ps-genie-title">
            <Bot size={16} /> 鎻愮ず璇嶇簿鐏?          </div>
          <button className="ps-genie-close" type="button" onClick={onClose} aria-label="鍏抽棴">
            <X size={18} />
          </button>
        </div>

        <div className="ps-genie-body">
          <div className="ps-genie-row">
            <div className="k">妯℃澘鏉ユ簮</div>
            <div className="v">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <select
                  className="ps-select"
                  value={templateSource}
                  onChange={(e) => onTemplateSourceChange(String(e.target.value) as any)}
                  disabled={Boolean(disabled) || busy}
                  title={templateSource === 'set' && !activeSet ? '褰撳墠鏈€夋嫨妯℃澘缁勶紝灏嗗洖閫€鍒板綋鍓嶇紪杈戝唴瀹' : ''}
                >
                  <option value="editor">褰撳墠缂栬緫鍐呭</option>
                  <option value="set">妯℃澘缁?/option>
                </select>

                <select
                  className="ps-select"
                  value={String(baseSetId || 'follow-active')}
                  onChange={(e) => onBaseSetIdChange(String(e.target.value))}
                  disabled={Boolean(disabled) || busy || templateSource !== 'set'}
                  title={templateSource !== 'set' ? '浠呭湪鈥滄ā鏉挎潵婧?妯℃澘缁勨€濇椂鍙€' : '閫夋嫨绮剧伒浣跨敤鍝竴濂楁ā鏉跨粍浣滀负鍩虹'}
                  style={{ minWidth: 220 }}
                >
                  <option value="follow-active">璺熼殢褰撳墠閫変腑妯℃澘缁?/option>
                  {setsForProductShot.map(s => (
                    <option key={s.id} value={s.id}>{labelOfSet(s)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="ps-genie-row" style={{ marginTop: 10 }}>
            <div className="k">鍙傝€冨浘</div>
            <div className="v" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label className="ps-genie-check">
                <input
                  type="checkbox"
                  checked={useImages}
                  onChange={(e) => onUseImagesChange(Boolean(e.target.checked))}
                  disabled={Boolean(disabled) || busy}
                />
                鍙戦€佸弬鑰冨浘锛堟洿鍑?鏇磋垂锛?              </label>
              <div className="ps-genie-hint">灏嗗彂閫?{imageSendCount} 寮?/div>
            </div>
          </div>

          {useImages ? (
            <div className="ps-genie-grid">
              <label className="ps-genie-check"><input type="checkbox" checked={flags.model} onChange={(e) => onFlagsChange({ model: Boolean(e.target.checked) })} disabled={busy} />鎴戜滑鐨勬ā鐗?/label>
              <label className="ps-genie-check"><input type="checkbox" checked={flags.wear_ref} onChange={(e) => onFlagsChange({ wear_ref: Boolean(e.target.checked) })} disabled={busy} />浣╂埓鍙傝€?/label>
              <label className="ps-genie-check"><input type="checkbox" checked={flags.pose} onChange={(e) => onFlagsChange({ pose: Boolean(e.target.checked) })} disabled={busy} />濮挎€?/label>
              <label className="ps-genie-check"><input type="checkbox" checked={flags.outfit} onChange={(e) => onFlagsChange({ outfit: Boolean(e.target.checked) })} disabled={busy} />鏈嶈</label>
              <label className="ps-genie-check"><input type="checkbox" checked={flags.scene} onChange={(e) => onFlagsChange({ scene: Boolean(e.target.checked) })} disabled={busy} />鍦烘櫙/鍏夊奖</label>

              <div className="ps-genie-inline">
                <label className="ps-genie-check" style={{ marginRight: 8 }}>
                  <input type="checkbox" checked={flags.product} onChange={(e) => onFlagsChange({ product: Boolean(e.target.checked) })} disabled={busy} />浜у搧瑙掑害
                </label>
                <select
                  className="ps-select"
                  value={String(productAngleCount)}
                  onChange={(e) => onProductAngleCountChange(Number(e.target.value) || 0)}
                  disabled={busy || !flags.product}
                  style={{ height: 34 }}
                >
                  <option value="0">0 寮?/option>
                  <option value="1">1 寮?/option>
                  <option value="2">2 寮?/option>
                </select>
              </div>
            </div>
          ) : null}

          <div className="ps-genie-idea">
            <div className="t">浣犲笇鏈涜繖濂楄鑹叉€庝箞鏇村ソ鐢紵</div>
            <textarea
              className="ps-genie-text"
              value={userIdea}
              onChange={(e) => onUserIdeaChange(e.target.value)}
              placeholder="渚嬪锛氫汉鐗╂洿鎴愮啛銆佸姩浣滄洿鍏嬪埗锛涜儗鏅繀椤荤函鑹?#ededed锛涘皬鍚婄墝瀛楁瘝淇濈暀浣嗕笉鍙锛涙洿寮鸿皟楂橀椤?鏄捐劯灏忥紱涓嶈澶稿紶濮挎€?.."
              disabled={Boolean(disabled) || busy}
              spellCheck={false}
            />
          </div>

          <div className="ps-genie-actions">
            <button className="ps-runbtn" type="button" onClick={() => void run()} disabled={Boolean(disabled) || busy}>
              <Sparkles size={16} /> {busy ? '鐢熸垚涓?..' : '鐢熸垚涓夎鑹叉ā鏉'}
            </button>
            <button className="ps-runbtn ghost" type="button" onClick={handleApply} disabled={!parsed || busy}>
              <Check size={16} /> 涓€閿啓鍏?            </button>
            <button className="ps-runbtn ghost" type="button" onClick={() => uiTextViewer(String(raw || ''), { title: '鍘熷杈撳嚭', size: 'lg' })} disabled={!raw.trim() || busy}>
              <Copy size={16} /> 鏌ョ湅鍘熸枃
            </button>
          </div>

          {parsed?.notes?.length ? (
            <div className="ps-genie-notes">
              {parsed.notes.map((n, i) => (
                <div key={`${i}_${n}`} className="ps-genie-note">- {n}</div>
              ))}
            </div>
          ) : null}

          <div className="ps-genie-out">
            <div className="ps-genie-out-head">
              <div className="t">鐢熸垚缁撴灉锛堝彲缂栬緫鍚庡啀鍐欏叆锛?/div>
              <div className="a">
                <button className="ps-mini" type="button" onClick={() => {
                  if (!parsed) return
                  const text = JSON.stringify(parsed, null, 2)
                  navigator.clipboard?.writeText
                    ? navigator.clipboard.writeText(text).then(() => uiToast('success', '宸插鍒')).catch(() => uiToast('error', '澶嶅埗澶辫触'))
                    : uiTextViewer(text, { title: '澶嶅埗鍐呭', size: 'lg' })
                }} disabled={!parsed || busy}>
                  澶嶅埗JSON
                </button>
                <button className="ps-mini" type="button" onClick={() => void handleSaveNew()} disabled={!parsed || busy}>
                  淇濆瓨涓烘柊妯℃澘缁?                </button>
                <button className="ps-mini" type="button" onClick={() => void handleOverwrite()} disabled={!parsed || busy}>
                  瑕嗙洊褰撳墠妯℃澘缁?                </button>
                <button className="ps-mini" type="button" onClick={handleSaveHistory} disabled={!raw.trim() || busy}>
                  淇濆瓨鍒板巻鍙?                </button>
              </div>
            </div>

            <textarea
              className="ps-genie-raw"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="鐢熸垚缁撴灉浼氭樉绀哄湪杩欓噷锛圝SON锛?
              spellCheck={false}
            />
          </div>

          <div className="ps-genie-history">
            <div className="ps-genie-history-head">
              <div className="t">鍘嗗彶鐢熸垚</div>
              <div className="a">
                <button
                  className="ps-mini"
                  type="button"
                  onClick={async () => {
                    const ok = await uiConfirm('娓呯┖鎵€鏈夌簿鐏靛巻鍙茶褰曪紵', '娓呯┖鍘嗗彶')
                    if (!ok) return
                    history.clear()
                    uiToast('success', '宸叉竻绌哄巻鍙')
                  }}
                  disabled={busy || (history.items || []).length === 0}
                >
                  娓呯┖
                </button>
              </div>
            </div>

            {(history.items || []).length === 0 ? (
              <div className="ps-genie-history-empty">鏆傛棤鍘嗗彶銆傛瘡娆＄敓鎴愪細鑷姩璁板綍銆?/div>
            ) : (
              <div className="ps-genie-history-list">
                {(history.items || []).map(it => (
                  <div key={it.id} className="ps-genie-history-item">
                    <button
                      type="button"
                      className="ps-genie-history-main"
                      onClick={() => {
                        setRaw(String(it.raw || ''))
                        uiToast('success', '宸茶浇鍏ヨ鏉″巻鍙插埌缂栬緫妗')
                      }}
                      title="鐐瑰嚮杞藉叆鍒颁笂鏂圭紪杈戞"
                    >
                      <div className="h1">
                        <span className="time">{new Date(it.createdAt).toLocaleString()}</span>
                        <span className="meta">{it.templateSource === 'set' ? '妯℃澘缁? : '缂栬緫鍐呭'} 路 {it.useImages ? `鍙傝€冨浘 ${it.imageSendCount} 寮燻 : '绾枃鏈?}</span>
                      </div>
                      <div className="h2">{String(it.idea || '').trim() || '锛堟棤鎯虫硶锛'}</div>
                    </button>

                    <div className="ps-genie-history-actions">
                      <button
                        className="ps-mini"
                        type="button"
                        onClick={() => {
                          setRaw(String(it.raw || ''))
                          uiToast('success', '宸茶浇鍏')
                        }}
                        disabled={busy}
                      >
                        杞藉叆
                      </button>
                      <button
                        className="ps-mini"
                        type="button"
                        onClick={() => {
                          const txt = String(it.raw || '')
                          navigator.clipboard?.writeText
                            ? navigator.clipboard.writeText(txt).then(() => uiToast('success', '宸插鍒')).catch(() => uiToast('error', '澶嶅埗澶辫触'))
                            : uiTextViewer(txt, { title: '澶嶅埗鍐呭', size: 'lg' })
                        }}
                        disabled={busy || !String(it.raw || '').trim()}
                      >
                        澶嶅埗
                      </button>
                      <button
                        className="ps-mini"
                        type="button"
                        onClick={() => {
                          history.remove(it.id)
                          uiToast('success', '宸插垹闄')
                        }}
                        disabled={busy}
                      >
                        鍒犻櫎
                      </button>
                    </div>
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



