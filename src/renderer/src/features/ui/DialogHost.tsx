import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDialogStore } from './dialogStore'
import { useAppLanguage } from '../i18n'
import { uiToast } from './toastStore'

export default function DialogHost() {
  const dialog = useDialogStore((s) => s.dialog)
  const closeWith = useDialogStore((s) => s.closeWith)
  const { isZh } = useAppLanguage()

  const [promptValue, setPromptValue] = useState('')
  const [textEditValue, setTextEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  const t = (zh: string, en: string) => (isZh ? zh : en)

  useEffect(() => {
    if (!dialog) return

    if (dialog.kind === 'prompt') {
      setPromptValue(String(dialog.initialValue || ''))
      setTextEditValue('')
      window.setTimeout(() => inputRef.current?.focus(), 0)
      return
    }

    if (dialog.kind === 'textEdit') {
      setTextEditValue(String(dialog.text || ''))
      setPromptValue('')
      window.setTimeout(() => inputRef.current?.focus(), 0)
      return
    }

    setPromptValue('')
    setTextEditValue('')
  }, [dialog?.id, dialog?.initialValue, dialog?.kind, dialog?.text])

  const canCopyText = useMemo(() => {
    if (!dialog) return false
    if (dialog.kind === 'text') return Boolean(String(dialog.text || '').trim())
    if (dialog.kind === 'textEdit') return Boolean(String(textEditValue || '').trim())
    return false
  }, [dialog, textEditValue])

  if (!dialog) return null

  const onOk = () => {
    if (dialog.kind === 'confirm') {
      closeWith(true)
      return
    }
    if (dialog.kind === 'prompt') {
      closeWith(promptValue)
      return
    }
    if (dialog.kind === 'textEdit') {
      closeWith(String(textEditValue || ''))
      return
    }
    closeWith(undefined)
  }

  const onCancel = () => {
    if (dialog.kind === 'confirm') {
      closeWith(false)
      return
    }
    if (dialog.kind === 'prompt' || dialog.kind === 'textEdit') {
      closeWith(null)
      return
    }
    closeWith(undefined)
  }

  const onBackdrop = () => {
    onCancel()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
      return
    }

    if (event.key === 'Enter' && dialog.kind !== 'textEdit') {
      event.preventDefault()
      event.stopPropagation()
      onOk()
    }
  }

  const title = dialog.title || 'AiTnt'
  const okText =
    dialog.okText ||
    (dialog.kind === 'text'
      ? t('关闭', 'Close')
      : dialog.kind === 'textEdit'
        ? t('应用', 'Apply')
        : t('确认', 'Confirm'))
  const cancelText = dialog.cancelText || t('取消', 'Cancel')

  return (
    <div className="nx-dialog-wrap" role="presentation">
      <div className="nx-dialog-backdrop" onMouseDown={onBackdrop} />
      <div
        className={`nx-dialog ${dialog.size === 'lg' ? 'lg' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKeyDown}
      >
        <div className="nx-dialog-head">
          <div className="nx-dialog-title">{title}</div>
          <button
            type="button"
            className="nx-dialog-x"
            onClick={onCancel}
            aria-label={t('关闭对话框', 'Close dialog')}
          >
            x
          </button>
        </div>

        <div className="nx-dialog-body">
          {dialog.message ? <div className="nx-dialog-message">{dialog.message}</div> : null}

          {dialog.kind === 'prompt' ? (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              className="nx-dialog-input"
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              placeholder={dialog.placeholder || ''}
            />
          ) : null}

          {dialog.kind === 'text' ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              className="nx-dialog-text"
              readOnly
              value={String(dialog.text || '')}
              onFocus={(event) => {
                try {
                  event.currentTarget.select()
                } catch {
                  // ignore
                }
              }}
            />
          ) : null}

          {dialog.kind === 'textEdit' ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              className="nx-dialog-text"
              value={textEditValue}
              onChange={(event) => setTextEditValue(event.target.value)}
              spellCheck={false}
            />
          ) : null}
        </div>

        <div className="nx-dialog-actions">
          {dialog.kind === 'confirm' || dialog.kind === 'prompt' || dialog.kind === 'textEdit' ? (
            <button type="button" className="nx-btn ghost" onClick={onCancel}>
              {cancelText}
            </button>
          ) : null}

          {canCopyText ? (
            <button
              type="button"
              className="nx-btn ghost"
              onClick={async () => {
                const text =
                  dialog.kind === 'textEdit' ? String(textEditValue || '') : String(dialog.text || '')
                try {
                  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
                  await navigator.clipboard.writeText(text)
                  uiToast('success', t('已复制到剪贴板。', 'Copied to clipboard.'))
                } catch {
                  uiToast('error', t('无法复制文本。', 'Unable to copy the text.'))
                }
              }}
            >
              {t('复制', 'Copy')}
            </button>
          ) : null}

          <button type="button" className="nx-btn" onClick={onOk}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  )
}
