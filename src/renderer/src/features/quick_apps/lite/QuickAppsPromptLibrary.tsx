import React from 'react'
import { Copy, Download, Import, Plus, Sparkles, Star, Trash2 } from 'lucide-react'
import { usePromptLibraryStore } from '../prompt_library/store'
import { useDialogStore } from '../../ui/dialogStore'
import { useAppLanguage } from '../../i18n'
import { uiToast } from '../../ui/toastStore'
import {
  downloadJson,
  exportPromptSet,
  exportPromptSetBundle,
  makeStarterPromptSet,
  makeUniquePromptSetName,
  parsePromptSetImports,
  readFileText,
  safeFileName
} from './promptSetHelpers'
import '../../workstation/workstation.css'

type DraftState = {
  name: string
  category: string
  tags: string
  agent1Template: string
  agent2Template: string
  agent3Template: string
  agent1Model: string
  agent2Model: string
  genModel: string
  genRatio: string
  genRes: string
}

function toDraft(set: any): DraftState {
  return {
    name: String(set?.name || ''),
    category: String(set?.category || ''),
    tags: Array.isArray(set?.tags) ? set.tags.join(', ') : '',
    agent1Template: String(set?.agent1Template || ''),
    agent2Template: String(set?.agent2Template || ''),
    agent3Template: String(set?.agent3Template || ''),
    agent1Model: String(set?.agent1Model || ''),
    agent2Model: String(set?.agent2Model || ''),
    genModel: String(set?.genModel || ''),
    genRatio: String(set?.genRatio || '1:1'),
    genRes: String(set?.genRes || '1K')
  }
}

function parseTags(value: string) {
  const tags = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 24)
  return tags.length > 0 ? tags : undefined
}

export default function QuickAppsPromptLibrary() {
  const { isZh } = useAppLanguage()
  const t = (zh: string, en: string) => (isZh ? zh : en)

  const sets = usePromptLibraryStore((s) => s.sets.filter((entry) => entry.appId === 'product_shot'))
  const activeSetId = usePromptLibraryStore((s) => s.activeSetIdByApp.product_shot)
  const setActive = usePromptLibraryStore((s) => s.setActive)
  const addSet = usePromptLibraryStore((s) => s.addSet)
  const updateSet = usePromptLibraryStore((s) => s.updateSet)
  const removeSet = usePromptLibraryStore((s) => s.removeSet)
  const toggleFavorite = usePromptLibraryStore((s) => s.toggleFavorite)

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<DraftState>(() =>
    toDraft(makeStarterPromptSet(isZh ? '核心商品视觉' : 'Core Product Visuals'))
  )

  React.useEffect(() => {
    if (selectedId && sets.some((entry) => entry.id === selectedId)) return
    const fallback = activeSetId || sets[0]?.id || null
    setSelectedId(fallback)
  }, [selectedId, sets, activeSetId])

  const selectedSet = sets.find((entry) => entry.id === selectedId) || null

  React.useEffect(() => {
    if (selectedSet) {
      setDraft(toDraft(selectedSet))
      return
    }
    setDraft(toDraft(makeStarterPromptSet(isZh ? '核心商品视觉' : 'Core Product Visuals')))
  }, [selectedSet, isZh])

  const handleCreateStarter = () => {
    const created = addSet(
      makeStarterPromptSet(
        makeUniquePromptSetName(
          sets,
          isZh ? `核心商品视觉 ${sets.length + 1}` : `Core Product Visuals ${sets.length + 1}`,
          'Commerce'
        )
      )
    )
    setActive('product_shot', created.id)
    setSelectedId(created.id)
    uiToast('success', t('起步提示词集已创建。', 'Starter prompt set created.'))
  }

  const handleDuplicate = () => {
    if (!selectedSet) {
      handleCreateStarter()
      return
    }

    const nextName = makeUniquePromptSetName(
      sets,
      isZh ? `${selectedSet.name} 副本` : `${selectedSet.name} Copy`,
      selectedSet.category
    )
    const created = addSet({
      appId: 'product_shot',
      name: nextName,
      category: selectedSet.category,
      tags: selectedSet.tags,
      favorite: false,
      agent1Template: selectedSet.agent1Template,
      agent2Template: selectedSet.agent2Template,
      agent3Template: selectedSet.agent3Template,
      agent1Model: selectedSet.agent1Model,
      agent2Model: selectedSet.agent2Model,
      genModel: selectedSet.genModel,
      genRatio: selectedSet.genRatio,
      genRes: selectedSet.genRes
    })
    setSelectedId(created.id)
    uiToast('success', t('提示词集已复制。', 'Prompt set duplicated.'))
  }

  const handleSave = () => {
    if (!selectedSet) {
      handleCreateStarter()
      return
    }
    if (!draft.name.trim()) {
      uiToast('info', t('提示词集名称不能为空。', 'Prompt set name is required.'))
      return
    }
    if (!draft.agent1Template.trim() || !draft.agent2Template.trim() || !draft.agent3Template.trim()) {
      uiToast('info', t('三个模板内容都必须填写。', 'All three templates are required.'))
      return
    }

    updateSet(selectedSet.id, {
      name: draft.name.trim(),
      category: draft.category.trim() || undefined,
      tags: parseTags(draft.tags),
      agent1Template: draft.agent1Template,
      agent2Template: draft.agent2Template,
      agent3Template: draft.agent3Template,
      agent1Model: draft.agent1Model.trim() || undefined,
      agent2Model: draft.agent2Model.trim() || undefined,
      genModel: draft.genModel.trim() || undefined,
      genRatio: draft.genRatio.trim() || undefined,
      genRes: draft.genRes.trim() || undefined
    })
    uiToast('success', t('提示词集已保存。', 'Prompt set saved.'))
  }

  const handleDelete = async () => {
    if (!selectedSet) return
    const confirmed = await useDialogStore.getState().openConfirm({
      title: t('删除提示词集', 'Delete prompt set'),
      message: isZh
        ? `要把“${selectedSet.name}”从商品图库中移除吗？`
        : `Remove "${selectedSet.name}" from the product-shot library?`,
      okText: t('删除', 'Delete'),
      cancelText: t('取消', 'Cancel')
    })
    if (!confirmed) return

    removeSet(selectedSet.id)
    uiToast('success', t('提示词集已删除。', 'Prompt set deleted.'))
  }

  const handleImport = async (files: FileList | null) => {
    if (!files?.length) return

    let importedCount = 0
    for (const file of Array.from(files)) {
      try {
        const text = await readFileText(file)
        const imported = parsePromptSetImports(text)
        for (const entry of imported) {
          const uniqueName = makeUniquePromptSetName(sets, entry.name, entry.category)
          const created = addSet({
            appId: 'product_shot',
            name: uniqueName,
            category: entry.category,
            tags: entry.tags,
            favorite: false,
            agent1Template: entry.agent1Template,
            agent2Template: entry.agent2Template,
            agent3Template: entry.agent3Template,
            agent1Model: entry.agent1Model,
            agent2Model: entry.agent2Model,
            genModel: entry.genModel,
            genRatio: entry.genRatio,
            genRes: entry.genRes
          })
          importedCount += 1
          setSelectedId(created.id)
        }
      } catch {
        uiToast('error', isZh ? `无法导入 ${file.name}。` : `Unable to import ${file.name}.`)
      }
    }

    if (importedCount > 0) {
      uiToast('success', isZh ? `已导入 ${importedCount} 个提示词集。` : `Imported ${importedCount} prompt set${importedCount === 1 ? '' : 's'}.`)
    }
  }

  return (
    <div className="apps-stack">
      <div className="apps-section-head">
        <div>
          <div className="apps-section-title">{t('提示词集库', 'Prompt Set Library')}</div>
          <div className="apps-section-copy">
            {t(
              '维护驱动重构版商品图流水线的可复用模板集合。',
              'Maintain the reusable template sets that drive the rebuilt product-shot pipeline.'
            )}
          </div>
        </div>
        <div className="ws-chip-row">
          <div className="ws-chip">{t('集合数', 'Sets')}: {sets.length}</div>
          <div className="ws-chip">{t('当前', 'Active')}: {selectedSet?.name || t('无', 'None')}</div>
        </div>
      </div>

      <div className="ws-grid">
        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('模板架', 'Library Shelf')}</div>
              <div className="ws-panel-note">
                {t(
                  '在一个稳定管理器里创建、复制、收藏、导入和导出提示词集。',
                  'Create, duplicate, favorite, import, and export prompt sets from one stable manager.'
                )}
              </div>
            </div>
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn" onClick={handleCreateStarter}>
              <Plus size={16} />
              {t('新建起步集', 'New starter')}
            </button>
            <button type="button" className="ws-btn secondary" onClick={handleDuplicate}>
              <Copy size={16} />
              {t('复制', 'Duplicate')}
            </button>
            <label className="ws-btn secondary apps-file-btn">
              <Import size={16} />
              {t('导入', 'Import')}
              <input
                type="file"
                accept="application/json,.json"
                multiple
                style={{ display: 'none' }}
                onChange={(event) => {
                  void handleImport(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
          </div>

          <div className="apps-card-grid single">
            {sets.length === 0 ? (
              <div className="ws-empty">
                <strong>{t('还没有提示词集', 'No prompt sets yet')}</strong>
                {t('先创建一个起步集，开始搭建可复用商品图模板。', 'Create a starter set to begin building reusable product-shot templates.')}
              </div>
            ) : (
              sets.map((set) => (
                <button
                  key={set.id}
                  type="button"
                  className={`apps-list-card ${selectedId === set.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedId(set.id)
                    setActive('product_shot', set.id)
                  }}
                >
                  <div className="apps-list-head">
                    <div>
                      <div className="apps-card-title">{set.name}</div>
                      <div className="apps-card-sub">{set.category || t('未分类', 'Uncategorized')}</div>
                    </div>
                    <div className={`apps-badge ${set.id === activeSetId ? 'accent' : ''}`}>
                      {set.id === activeSetId ? t('当前', 'Active') : set.favorite ? t('收藏', 'Favorite') : t('模板', 'Set')}
                    </div>
                  </div>

                  <div className="ws-chip-row">
                    {(set.tags || []).slice(0, 4).map((tag) => (
                      <div key={tag} className="ws-chip">
                        {tag}
                      </div>
                    ))}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="ws-panel">
          <div className="ws-panel-head">
            <div>
              <div className="ws-panel-title">{t('集合编辑器', 'Set Editor')}</div>
              <div className="ws-panel-note">
                {t(
                  '编辑当前提示词集、指定默认模型，并把它导出为可移植 JSON。',
                  'Edit the current set, assign defaults, and export it as a portable JSON bundle.'
                )}
              </div>
            </div>
            {selectedSet ? (
              <div className="ws-actions">
                <button type="button" className="ws-mini-btn" onClick={() => toggleFavorite(selectedSet.id)}>
                  <Star size={14} />
                  {selectedSet.favorite ? t('取消收藏', 'Unfavorite') : t('收藏', 'Favorite')}
                </button>
                <button type="button" className="ws-mini-btn" onClick={() => setActive('product_shot', selectedSet.id)}>
                  <Sparkles size={14} />
                  {t('设为当前', 'Set active')}
                </button>
              </div>
            ) : null}
          </div>

          <div className="apps-form-grid">
            <div className="ws-field">
              <label className="ws-label">{t('名称', 'Name')}</label>
              <input className="ws-input" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('分类', 'Category')}</label>
              <input className="ws-input" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('标签', 'Tags')}</label>
              <input
                className="ws-input"
                value={draft.tags}
                onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
                placeholder={t('逗号分隔标签', 'comma, separated, tags')}
              />
            </div>
          </div>

          <div className="apps-form-grid">
            <div className="ws-field">
              <label className="ws-label">Agent 1 {t('模型', 'model')}</label>
              <input className="ws-input" value={draft.agent1Model} onChange={(event) => setDraft((current) => ({ ...current, agent1Model: event.target.value }))} />
            </div>

            <div className="ws-field">
              <label className="ws-label">Agent 2 {t('模型', 'model')}</label>
              <input className="ws-input" value={draft.agent2Model} onChange={(event) => setDraft((current) => ({ ...current, agent2Model: event.target.value }))} />
            </div>

            <div className="ws-field">
              <label className="ws-label">{t('生成模型', 'Generator model')}</label>
              <input className="ws-input" value={draft.genModel} onChange={(event) => setDraft((current) => ({ ...current, genModel: event.target.value }))} />
            </div>
          </div>

          <div className="apps-form-grid">
            <div className="ws-field">
              <label className="ws-label">{t('输出比例', 'Output ratio')}</label>
              <input className="ws-input" value={draft.genRatio} onChange={(event) => setDraft((current) => ({ ...current, genRatio: event.target.value }))} />
            </div>
            <div className="ws-field">
              <label className="ws-label">{t('输出尺寸', 'Output size')}</label>
              <input className="ws-input" value={draft.genRes} onChange={(event) => setDraft((current) => ({ ...current, genRes: event.target.value }))} />
            </div>
          </div>

          <div className="ws-field">
            <label className="ws-label">Agent 1 {t('模板', 'template')}</label>
            <textarea className="ws-textarea" value={draft.agent1Template} onChange={(event) => setDraft((current) => ({ ...current, agent1Template: event.target.value }))} />
          </div>

          <div className="ws-field">
            <label className="ws-label">Agent 2 {t('模板', 'template')}</label>
            <textarea className="ws-textarea" value={draft.agent2Template} onChange={(event) => setDraft((current) => ({ ...current, agent2Template: event.target.value }))} />
          </div>

          <div className="ws-field">
            <label className="ws-label">{t('合并模板', 'Merge template')}</label>
            <textarea className="ws-textarea" value={draft.agent3Template} onChange={(event) => setDraft((current) => ({ ...current, agent3Template: event.target.value }))} />
          </div>

          <div className="ws-actions">
            <button type="button" className="ws-btn" onClick={handleSave}>
              {t('保存修改', 'Save changes')}
            </button>
            {selectedSet ? (
              <>
                <button
                  type="button"
                  className="ws-btn secondary"
                  onClick={() => downloadJson(`${safeFileName(selectedSet.name)}.json`, exportPromptSet(selectedSet))}
                >
                  <Download size={16} />
                  {t('导出当前项', 'Export current')}
                </button>
                <button
                  type="button"
                  className="ws-btn secondary"
                  onClick={() => downloadJson('aitnt-prompt-set-bundle.json', exportPromptSetBundle(sets))}
                >
                  {t('导出全部', 'Export all')}
                </button>
                <button type="button" className="ws-btn secondary" onClick={() => void handleDelete()}>
                  <Trash2 size={16} />
                  {t('删除', 'Delete')}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
