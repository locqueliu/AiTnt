import { kvGetJsonMigrate, kvSetJson } from '../../../core/persist/kvClient'

export type VideoUiState = {
  prompt: string
  durationSec: number
  aspectRatio: '16:9' | '9:16'
  batchCount: number
  enhancePrompt: boolean
  enableUpsample: boolean
}

function keyFor(mode: 't2v' | 'i2v') {
  return `aitnt-video-ui:v1:${mode}`
}

function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n)
  if (!Number.isFinite(x)) return fallback
  const v = Math.trunc(x)
  return Math.max(min, Math.min(max, v))
}

export function loadVideoUi(mode: 't2v' | 'i2v', fallback: VideoUiState): VideoUiState {
  return fallback
}

export async function loadVideoUiPersisted(mode: 't2v' | 'i2v', fallback: VideoUiState): Promise<VideoUiState> {
  const p = await kvGetJsonMigrate<any>(keyFor(mode), fallback as any)
  if (!p || typeof p !== 'object') return fallback
  const aspect = p.aspectRatio === '16:9' || p.aspectRatio === '9:16' ? p.aspectRatio : fallback.aspectRatio
  return {
    prompt: typeof p.prompt === 'string' ? p.prompt : fallback.prompt,
    durationSec: clampInt(p.durationSec, 1, 60, fallback.durationSec),
    aspectRatio: aspect,
    batchCount: clampInt(p.batchCount, 1, 6, fallback.batchCount),
    enhancePrompt: typeof p.enhancePrompt === 'boolean' ? p.enhancePrompt : fallback.enhancePrompt,
    enableUpsample: typeof p.enableUpsample === 'boolean' ? p.enableUpsample : fallback.enableUpsample
  }
}

export async function saveVideoUiPersisted(mode: 't2v' | 'i2v', state: VideoUiState): Promise<void> {
  await kvSetJson(keyFor(mode), state)
}

