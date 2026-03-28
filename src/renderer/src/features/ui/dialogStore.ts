import { create } from 'zustand'

export type DialogKind = 'alert' | 'confirm' | 'prompt' | 'text' | 'textEdit'

export type DialogModel = {
  id: string
  kind: DialogKind
  title: string
  message?: string
  okText?: string
  cancelText?: string
  size?: 'md' | 'lg'
  placeholder?: string
  initialValue?: string
  text?: string
  _resolve: (value: any) => void
}

type DialogState = {
  dialog: DialogModel | null
  openAlert: (opts: { title?: string; message: string; okText?: string }) => Promise<void>
  openConfirm: (opts: { title?: string; message: string; okText?: string; cancelText?: string }) => Promise<boolean>
  openPrompt: (opts: {
    title?: string
    message: string
    placeholder?: string
    initialValue?: string
    okText?: string
    cancelText?: string
  }) => Promise<string | null>
  openText: (opts: { title?: string; message?: string; text: string; okText?: string; size?: 'md' | 'lg' }) => Promise<void>
  openTextEdit: (opts: {
    title?: string
    message?: string
    text: string
    okText?: string
    cancelText?: string
    size?: 'md' | 'lg'
  }) => Promise<string | null>
  closeWith: (value: any) => void
}

function resolveExistingDialog(dialog: DialogModel) {
  try {
    if (dialog.kind === 'confirm') dialog._resolve(false)
    else if (dialog.kind === 'prompt' || dialog.kind === 'textEdit') dialog._resolve(null)
    else dialog._resolve(undefined)
  } catch {
    // ignore
  }
}

function makeId() {
  return `dlg_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export const useDialogStore = create<DialogState>((set, get) => ({
  dialog: null,

  openAlert: (opts) => {
    const title = (opts.title || 'AiTnt').trim() || 'AiTnt'
    const message = String(opts.message || '')
    const okText = typeof opts.okText === 'string' ? String(opts.okText) : undefined

    return new Promise<void>((resolve) => {
      const current = get().dialog
      if (current) resolveExistingDialog(current)

      set({
        dialog: {
          id: makeId(),
          kind: 'alert',
          title,
          message,
          okText,
          _resolve: resolve
        }
      })
    })
  },

  openConfirm: (opts) => {
    const title = (opts.title || 'AiTnt').trim() || 'AiTnt'
    const message = String(opts.message || '')
    const okText = typeof opts.okText === 'string' ? String(opts.okText) : undefined
    const cancelText = typeof opts.cancelText === 'string' ? String(opts.cancelText) : undefined

    return new Promise<boolean>((resolve) => {
      const current = get().dialog
      if (current) resolveExistingDialog(current)

      set({
        dialog: {
          id: makeId(),
          kind: 'confirm',
          title,
          message,
          okText,
          cancelText,
          _resolve: resolve
        }
      })
    })
  },

  openPrompt: (opts) => {
    const title = (opts.title || 'AiTnt').trim() || 'AiTnt'
    const message = String(opts.message || '')
    const okText = typeof opts.okText === 'string' ? String(opts.okText) : undefined
    const cancelText = typeof opts.cancelText === 'string' ? String(opts.cancelText) : undefined
    const placeholder = String(opts.placeholder || '')
    const initialValue = String(opts.initialValue || '')

    return new Promise<string | null>((resolve) => {
      const current = get().dialog
      if (current) resolveExistingDialog(current)

      set({
        dialog: {
          id: makeId(),
          kind: 'prompt',
          title,
          message,
          okText,
          cancelText,
          placeholder,
          initialValue,
          _resolve: resolve
        }
      })
    })
  },

  openText: (opts) => {
    const title = (opts.title || 'AiTnt').trim() || 'AiTnt'
    const message = opts.message ? String(opts.message) : ''
    const okText = typeof opts.okText === 'string' ? String(opts.okText) : undefined
    const text = String(opts.text || '')
    const size = opts.size === 'lg' ? 'lg' : 'md'

    return new Promise<void>((resolve) => {
      const current = get().dialog
      if (current) resolveExistingDialog(current)

      set({
        dialog: {
          id: makeId(),
          kind: 'text',
          title,
          message,
          okText,
          text,
          size,
          _resolve: resolve
        }
      })
    })
  },

  openTextEdit: (opts) => {
    const title = (opts.title || 'AiTnt').trim() || 'AiTnt'
    const message = opts.message ? String(opts.message) : ''
    const okText = typeof opts.okText === 'string' ? String(opts.okText) : undefined
    const cancelText = typeof opts.cancelText === 'string' ? String(opts.cancelText) : undefined
    const text = String(opts.text || '')
    const size = opts.size === 'lg' ? 'lg' : 'md'

    return new Promise<string | null>((resolve) => {
      const current = get().dialog
      if (current) resolveExistingDialog(current)

      set({
        dialog: {
          id: makeId(),
          kind: 'textEdit',
          title,
          message,
          okText,
          cancelText,
          text,
          size,
          _resolve: resolve
        }
      })
    })
  },

  closeWith: (value) => {
    const dialog = get().dialog
    if (!dialog) return

    try {
      dialog._resolve(value)
    } finally {
      set({ dialog: null })
    }
  }
}))

export function uiAlert(message: string, title?: string) {
  return useDialogStore.getState().openAlert({ title, message })
}

export function uiConfirm(message: string, title?: string) {
  return useDialogStore.getState().openConfirm({ title, message })
}

export function uiPrompt(message: string, opts?: { title?: string; placeholder?: string; initialValue?: string }) {
  return useDialogStore.getState().openPrompt({
    title: opts?.title,
    message,
    placeholder: opts?.placeholder,
    initialValue: opts?.initialValue
  })
}

export function uiTextViewer(text: string, opts?: { title?: string; message?: string; size?: 'md' | 'lg' }) {
  return useDialogStore.getState().openText({
    title: opts?.title,
    message: opts?.message,
    text,
    size: opts?.size
  })
}

export function uiTextEditor(
  text: string,
  opts?: { title?: string; message?: string; okText?: string; cancelText?: string; size?: 'md' | 'lg' }
) {
  return useDialogStore.getState().openTextEdit({
    title: opts?.title,
    message: opts?.message,
    okText: opts?.okText,
    cancelText: opts?.cancelText,
    text,
    size: opts?.size
  })
}
