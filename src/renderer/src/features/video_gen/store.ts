import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fileJSONStorage } from '../../core/persist/fileStorage'
import type { RequestDebug, ResponseDebug } from '../../core/api/image'
import { createVideoGeneration, pollVideoGeneration } from '../../core/api/video'

export type VideoMode = 't2v' | 'i2v'
export type VideoTaskStatus = 'queued' | 'running' | 'success' | 'error' | 'canceled'

export type VideoTask = {
  id: string
  createdAt: number
  mode: VideoMode
  providerId?: string | null
  baseUrl: string
  model: string
  prompt: string
  durationSec: number
  aspectRatio: string
  resolution?: string
  fps?: number
  seed?: number
  enhancePrompt?: boolean
  enableUpsample?: boolean
  inputImageNames?: string[]
  inputImageCount?: number
  remoteId?: string
  status: VideoTaskStatus
  progress?: number
  url?: string
  errorMsg?: string
  request?: RequestDebug
  response?: ResponseDebug
  autoSaveDir?: string
}

export type EnqueueVideoArgs = {
  mode: VideoMode
  providerId?: string | null
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  durationSec: number
  aspectRatio: string
  resolution?: string
  fps?: number
  seed?: number
  batchCount: number
  inputImagesBase64?: string[]
  inputImageNames?: string[]
  autoSaveDir?: string
  enhancePrompt?: boolean
  enableUpsample?: boolean
}

type VideoGenState = {
  tasks: VideoTask[]
  responseFullById: Record<string, string>
  apiKeyById: Record<string, string>
  addTasks: (tasks: VideoTask[]) => void
  patchTask: (id: string, patch: Partial<VideoTask>) => void
  setResponseFull: (id: string, text: string) => void
  deleteTask: (id: string) => void
  deleteTasks: (ids: string[]) => void
  clearTasks: () => void
  clearTasksByMode: (mode: VideoMode) => void
  enqueueBatch: (args: EnqueueVideoArgs) => void
  cancelTask: (id: string) => void
  pollOnce: (id: string) => Promise<void>
}

const LS_KEY = 'aitnt-video-tasks-v1'

function formatErrorMessage(error: any): string {
  const base = String(error?.message || 'Video generation failed.')
  const status = error?.response?.status
  const data = error?.response?.data
  let extra = ''

  if (status) extra += ` (HTTP ${status})`
  if (data !== undefined) {
    try {
      const body = typeof data === 'string' ? data : JSON.stringify(data)
      if (body?.trim()) {
        extra += `\n${String(body).trim().slice(0, 1200)}`
      }
    } catch {
      // ignore stringify failures
    }
  }

  return `${base}${extra}`
}

function makeTask(now: number, index: number, args: EnqueueVideoArgs): VideoTask {
  return {
    id: `v_${now}_${index}`,
    createdAt: now,
    mode: args.mode,
    providerId: args.providerId,
    baseUrl: args.baseUrl,
    model: args.model,
    prompt: args.prompt,
    durationSec: args.durationSec,
    aspectRatio: args.aspectRatio,
    resolution: args.resolution,
    fps: args.fps,
    seed: args.seed,
    enhancePrompt: args.enhancePrompt,
    enableUpsample: args.enableUpsample,
    inputImageNames: args.inputImageNames,
    inputImageCount: Array.isArray(args.inputImageNames) ? args.inputImageNames.length : undefined,
    status: 'queued',
    autoSaveDir: args.autoSaveDir
  }
}

async function maybeAutoSave(task: VideoTask) {
  if (!task.autoSaveDir || !task.url || /^aitnt:\/\//i.test(task.url)) return task.url
  if (!window.aitntAPI?.downloadVideo) return task.url

  const fileName = `aitnt_video_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  const result = await window.aitntAPI.downloadVideo({
    url: task.url,
    saveDir: task.autoSaveDir,
    fileName
  })
  return result?.success && result.localPath ? String(result.localPath) : task.url
}

export const useVideoGenStore = create<VideoGenState>()(
  persist(
    (set, get) => ({
      tasks: [],
      responseFullById: {},
      apiKeyById: {},

      addTasks: (tasks) => set((state) => ({ tasks: [...tasks, ...state.tasks] })),

      patchTask: (id, patch) =>
        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task))
        })),

      setResponseFull: (id, text) =>
        set((state) => ({
          responseFullById: { ...(state.responseFullById || {}), [String(id)]: String(text || '') }
        })),

      deleteTask: (id) =>
        set((state) => {
          const nextResponse = { ...(state.responseFullById || {}) }
          const nextKeys = { ...(state.apiKeyById || {}) }
          delete nextResponse[String(id)]
          delete nextKeys[String(id)]
          return {
            tasks: state.tasks.filter((task) => task.id !== id),
            responseFullById: nextResponse,
            apiKeyById: nextKeys
          }
        }),

      deleteTasks: (ids) =>
        set((state) => {
          const list = (ids || []).map(String)
          const idSet = new Set(list)
          const nextResponse = { ...(state.responseFullById || {}) }
          const nextKeys = { ...(state.apiKeyById || {}) }
          for (const id of list) {
            delete nextResponse[id]
            delete nextKeys[id]
          }
          return {
            tasks: state.tasks.filter((task) => !idSet.has(task.id)),
            responseFullById: nextResponse,
            apiKeyById: nextKeys
          }
        }),

      clearTasks: () => set({ tasks: [], responseFullById: {}, apiKeyById: {} }),

      clearTasksByMode: (mode) =>
        set((state) => {
          const removedIds = state.tasks.filter((task) => task.mode === mode).map((task) => task.id)
          const nextResponse = { ...(state.responseFullById || {}) }
          const nextKeys = { ...(state.apiKeyById || {}) }
          for (const id of removedIds) {
            delete nextResponse[id]
            delete nextKeys[id]
          }
          return {
            tasks: state.tasks.filter((task) => task.mode !== mode),
            responseFullById: nextResponse,
            apiKeyById: nextKeys
          }
        }),

      cancelTask: (id) => {
        const task = get().tasks.find((entry) => entry.id === id)
        if (!task) return
        get().patchTask(id, { status: 'canceled', errorMsg: 'Canceled by user.' })
      },

      pollOnce: async (id) => {
        const task = get().tasks.find((entry) => entry.id === id)
        const apiKey = get().apiKeyById[id]
        if (!task || !task.remoteId || !apiKey) return
        if (task.status !== 'running' && task.status !== 'queued') return

        try {
          const result = await pollVideoGeneration(task.baseUrl, apiKey, task.remoteId, (response) => {
            const anyResponse = response as any
            const full = typeof anyResponse?.dataFull === 'string' ? String(anyResponse.dataFull) : ''
            const { dataFull, ...rest } = anyResponse || {}
            get().patchTask(id, { response: rest })
            if (full.trim()) get().setResponseFull(id, full)
          })

          if (result.progress !== undefined) {
            get().patchTask(id, { progress: Math.max(0, Math.min(100, Number(result.progress) || 0)) })
          }

          if (result.videoUrl) {
            get().patchTask(id, { url: result.videoUrl })
          }

          const normalized = String(result.status || '').toLowerCase()
          if (['succeeded', 'success', 'completed', 'done'].includes(normalized) && result.videoUrl) {
            get().patchTask(id, { status: 'success', progress: 100 })
            const latest = get().tasks.find((entry) => entry.id === id)
            if (latest?.url) {
              const localUrl = await maybeAutoSave(latest)
              if (localUrl && localUrl !== latest.url) {
                get().patchTask(id, { url: localUrl })
              }
            }
            return
          }

          if (['failed', 'failure', 'fail', 'error', 'canceled', 'cancelled'].includes(normalized)) {
            get().patchTask(id, { status: 'error', errorMsg: result.errorMessage || 'Video generation failed.' })
            return
          }

          get().patchTask(id, { status: 'running' })
        } catch (error: any) {
          get().patchTask(id, { status: 'error', errorMsg: formatErrorMessage(error) })
        }
      },

      enqueueBatch: (args) => {
        const now = Date.now()
        const count = Math.max(1, Math.min(6, Number(args.batchCount) || 1))
        const newTasks = Array.from({ length: count }, (_, index) => makeTask(now, index, args))

        set((state) => ({
          tasks: [...newTasks, ...state.tasks],
          apiKeyById: {
            ...(state.apiKeyById || {}),
            ...Object.fromEntries(newTasks.map((task) => [task.id, String(args.apiKey || '')]))
          }
        }))

        for (const task of newTasks) {
          ;(async () => {
            try {
              get().patchTask(task.id, { status: 'running', progress: 0 })

              const created = await createVideoGeneration({
                baseUrl: args.baseUrl,
                apiKey: args.apiKey,
                model: args.model,
                prompt: args.prompt,
                durationSec: args.durationSec,
                aspectRatio: args.aspectRatio,
                resolution: args.resolution,
                fps: args.fps,
                seed: args.seed,
                enhancePrompt: args.enhancePrompt,
                enableUpsample: args.enableUpsample,
                image:
                  args.mode === 'i2v' && Array.isArray(args.inputImagesBase64) && args.inputImagesBase64.length > 0
                    ? args.inputImagesBase64
                    : undefined,
                onRequest: (request) => {
                  get().patchTask(task.id, { request })
                },
                onResponse: (response) => {
                  const anyResponse = response as any
                  const full = typeof anyResponse?.dataFull === 'string' ? String(anyResponse.dataFull) : ''
                  const { dataFull, ...rest } = anyResponse || {}
                  get().patchTask(task.id, { response: rest })
                  if (full.trim()) get().setResponseFull(task.id, full)
                }
              })

              get().patchTask(task.id, { remoteId: created.id })

              if (created.videoUrl) {
                get().patchTask(task.id, { url: created.videoUrl, status: 'success', progress: 100 })
                const latest = get().tasks.find((entry) => entry.id === task.id)
                if (latest?.url) {
                  const localUrl = await maybeAutoSave(latest)
                  if (localUrl && localUrl !== latest.url) {
                    get().patchTask(task.id, { url: localUrl })
                  }
                }
                return
              }

              const startedAt = Date.now()
              const timeoutMs = 1000 * 60 * 12

              while (true) {
                const current = get().tasks.find((entry) => entry.id === task.id)
                if (!current || current.status === 'canceled') return
                if (current.status === 'success' || current.status === 'error') return

                if (Date.now() - startedAt > timeoutMs) {
                  get().patchTask(task.id, { status: 'error', errorMsg: 'Video generation timed out.' })
                  return
                }

                if (current.remoteId) {
                  await get().pollOnce(task.id)
                }

                const next = get().tasks.find((entry) => entry.id === task.id)
                if (!next || next.status === 'success' || next.status === 'error' || next.status === 'canceled') {
                  return
                }

                await new Promise((resolve) => window.setTimeout(resolve, 3500))
              }
            } catch (error: any) {
              get().patchTask(task.id, { status: 'error', errorMsg: formatErrorMessage(error) })
            }
          })()
        }
      }
    }),
    {
      name: LS_KEY,
      storage: fileJSONStorage,
      version: 1,
      partialize: (state) => ({ tasks: state.tasks })
    }
  )
)
