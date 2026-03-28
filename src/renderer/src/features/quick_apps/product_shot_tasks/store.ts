import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fileJSONStorage } from '../../../core/persist/fileStorage'

export type TaskStep = 'agent1' | 'agent2' | 'merge' | 'gen'
export type StepState = 'idle' | 'queued' | 'running' | 'success' | 'error' | 'cancelled'

export type StepInfo = {
  state: StepState
  startedAt?: number
  finishedAt?: number
  error?: string
}

export type TaskInputImage = {
  id: string
  name: string
  localPath: string
  createdAt: number
}

export type ProductShotTask = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  promptSetId?: string
  promptSetLabel?: string
  providerId: string
  productAngles: TaskInputImage[]
  slots: Record<string, TaskInputImage | null>
  agent1Template: string
  agent2Template: string
  agent3Template: string
  agent1Model?: string
  agent2Model?: string
  genModel?: string
  genRatio: string
  genRes: string
  agent1Output: string
  agent2Output: string
  finalPrompt: string
  outImages: string[]
  requestDebug?: any
  responseDebug?: any
  steps: Record<TaskStep, StepInfo>
  currentStep: TaskStep | 'done'
}

type TaskState = {
  tasks: ProductShotTask[]
  concurrency: number
  setConcurrency: (n: number) => void
  addTask: (task: Omit<ProductShotTask, 'id' | 'createdAt' | 'updatedAt'>) => ProductShotTask
  updateTask: (id: string, patch: Partial<ProductShotTask>) => void
  removeTask: (id: string) => void
  clearAll: () => void
  markStep: (id: string, step: TaskStep, patch: Partial<StepInfo>) => void
  setCurrentStep: (id: string, step: ProductShotTask['currentStep']) => void
}

function makeId() {
  return `qa_task_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function clamp(n: number, min: number, max: number) {
  const value = Math.floor(Number(n))
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

const defaultSteps = (): Record<TaskStep, StepInfo> => ({
  agent1: { state: 'idle' },
  agent2: { state: 'idle' },
  merge: { state: 'idle' },
  gen: { state: 'idle' }
})

function normalizeSlots(value: unknown): Record<string, TaskInputImage | null> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, TaskInputImage | null>
}

function normalizeImages(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((image) => image as TaskInputImage).slice(0, 12)
}

export const useProductShotTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],
      concurrency: 2,

      setConcurrency: (n) => set({ concurrency: clamp(n, 1, 4) }),

      addTask: (taskInput) => {
        const now = Date.now()
        const created: ProductShotTask = {
          id: makeId(),
          title: String(taskInput.title || 'Untitled Task').trim() || 'Untitled Task',
          createdAt: now,
          updatedAt: now,
          promptSetId: String(taskInput.promptSetId || '').trim() || undefined,
          promptSetLabel: String(taskInput.promptSetLabel || '').trim() || undefined,
          providerId: String(taskInput.providerId || '').trim(),
          productAngles: normalizeImages(taskInput.productAngles),
          slots: normalizeSlots(taskInput.slots),
          agent1Template: String(taskInput.agent1Template || ''),
          agent2Template: String(taskInput.agent2Template || ''),
          agent3Template: String(taskInput.agent3Template || ''),
          agent1Model: String(taskInput.agent1Model || '').trim() || undefined,
          agent2Model: String(taskInput.agent2Model || '').trim() || undefined,
          genModel: String(taskInput.genModel || '').trim() || undefined,
          genRatio: String(taskInput.genRatio || '1:1'),
          genRes: String(taskInput.genRes || '1K'),
          agent1Output: String(taskInput.agent1Output || ''),
          agent2Output: String(taskInput.agent2Output || ''),
          finalPrompt: String(taskInput.finalPrompt || ''),
          outImages: Array.isArray(taskInput.outImages) ? taskInput.outImages.map(String).filter(Boolean).slice(0, 60) : [],
          requestDebug: taskInput.requestDebug,
          responseDebug: taskInput.responseDebug,
          steps: taskInput.steps ? taskInput.steps : defaultSteps(),
          currentStep: taskInput.currentStep || 'agent1'
        }

        created.steps.agent1 = created.agent1Output.trim() ? { state: 'success', finishedAt: now } : { state: 'queued' }
        created.steps.agent2 = created.agent2Output.trim() ? { state: 'success', finishedAt: now } : { state: 'queued' }
        created.steps.merge = created.finalPrompt.trim() ? { state: 'success', finishedAt: now } : { state: 'queued' }
        created.steps.gen = created.outImages.length > 0 ? { state: 'success', finishedAt: now } : { state: 'queued' }

        set((state) => ({
          tasks: [created, ...(state.tasks || [])]
        }))
        return created
      },

      updateTask: (id, patch) =>
        set((state) => ({
          tasks: (state.tasks || []).map((task) => (task.id !== id ? task : { ...task, ...patch, updatedAt: Date.now() }))
        })),

      removeTask: (id) =>
        set((state) => ({
          tasks: (state.tasks || []).filter((task) => task.id !== id)
        })),

      clearAll: () => set({ tasks: [] }),

      markStep: (id, step, patch) =>
        set((state) => ({
          tasks: (state.tasks || []).map((task) => {
            if (task.id !== id) return task
            const nextSteps = { ...(task.steps || defaultSteps()) }
            nextSteps[step] = { ...(nextSteps[step] || { state: 'idle' }), ...patch }
            return { ...task, steps: nextSteps, updatedAt: Date.now() }
          })
        })),

      setCurrentStep: (id, step) =>
        set((state) => ({
          tasks: (state.tasks || []).map((task) => (task.id !== id ? task : { ...task, currentStep: step, updatedAt: Date.now() }))
        }))
    }),
    {
      name: 'aitnt-qa-product-shot-tasks-v1',
      storage: fileJSONStorage,
      version: 1,
      migrate: (persisted: any) => {
        try {
          if (!persisted || typeof persisted !== 'object') return persisted
          if (!Array.isArray(persisted.tasks)) persisted.tasks = []
          if (typeof persisted.concurrency !== 'number') persisted.concurrency = 2
          return persisted
        } catch {
          return persisted
        }
      }
    }
  )
)

export function getTaskById(id: string): ProductShotTask | null {
  const tasks = useProductShotTaskStore.getState().tasks || []
  return tasks.find((task) => task.id === id) || null
}
