import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fileJSONStorage } from '../../core/persist/fileStorage'

export interface ApiProvider {
  id: string
  name: string
  baseUrl: string
  // 鍏煎鏃х増鏈細淇濈暀鍗?key 瀛楁
  apiKey: string

  // Multi-key support for grouped or routed providers.
  apiKeys?: Array<{
    id: string
    name: string
    group?: string
    apiKey: string
  }>

  // Per-feature key selection with fallback to the first key.
  keyUsage?: {
    imageKeyId?: string
    promptKeyId?: string
    translateKeyId?: string
    videoKeyId?: string
    modelsKeyId?: string
  }
  models: string[] // 鑾峰彇鍒扮殑鍙敤妯″瀷鍒楄〃
  selectedImageModel: string
  selectedPromptModel: string

  // Dedicated translation model used by prompt translation flows.
  selectedTranslateModel?: string

  // Dedicated video model stored separately from image and prompt models.
  selectedVideoModel?: string

   // 甯哥敤妯″瀷棰勮锛堟瘡绫绘渶澶?4 涓級
   pinnedVideoModels?: string[]

    // 缈昏瘧甯哥敤妯″瀷棰勮锛堟渶澶?4 涓級
    pinnedTranslateModels?: string[]

  // 甯哥敤妯″瀷棰勮锛堟瘡绫绘渶澶?4 涓紝鐢ㄤ簬鍦ㄧ敓鍥鹃〉蹇€熷垏鎹紝閬垮厤姣忔閮芥悳绱級
  pinnedImageModels?: string[]
  pinnedPromptModels?: string[]
}

interface SettingsState {
  language: 'zh-CN' | 'en-US'
  setLanguage: (language: 'zh-CN' | 'en-US') => void

  theme: 'dark' | 'light'
  setTheme: (theme: 'dark' | 'light') => void

  // 鏄惁鑷姩淇濆瓨鐢熸垚鐨勫浘鐗囧埌鏈湴
  // true锛氱敓鎴愬畬鎴愬悗鑷姩涓嬭浇鍒?outputDirectory
  // false锛氫粎灞曠ず杩滅 url锛堢敤鎴蜂粛鍙湪棰勮閲屾墜鍔ㄢ€滀繚瀛樷€濓級
  autoSaveEnabled: boolean
  setAutoSaveEnabled: (enabled: boolean) => void
  
  // 鍥剧墖淇濆瓨鐩綍 (榛樿鎸囧悜椤圭洰鏍圭洰褰曚笅鐨?output 鏂囦欢澶?
  outputDirectory: string
  setOutputDirectory: (dir: string) => void

  // 鏄惁鑷姩淇濆瓨鐢熸垚鐨勮棰戝埌鏈湴
  videoAutoSaveEnabled: boolean
  setVideoAutoSaveEnabled: (enabled: boolean) => void

  // Separate output directory for generated videos.
  videoOutputDirectory: string
  setVideoOutputDirectory: (dir: string) => void

  // Provider registry.
  providers: ApiProvider[]
  activeProviderId: string | null

  // 鑷姩鏇存柊閫氶亾
  updateChannel: 'stable' | 'beta'
  setUpdateChannel: (channel: 'stable' | 'beta') => void

  // 鍚勪富瑕佸姛鑳戒娇鐢ㄥ摢涓?API 缃戠珯锛堟湁鐨勭綉绔欎笉鏀寔鍥剧墖/瑙嗛锛?  // 涓虹┖鏃跺洖閫€鍒?activeProviderId
  imageProviderId: string | null
  videoProviderId: string | null
  canvasProviderId: string | null

  // 蹇嵎搴旂敤锛堝皬搴旂敤/宸ヤ綔娴侊級榛樿浣跨敤鍝釜 API 缃戠珯
  // 涓虹┖鏃跺洖閫€鍒?activeProviderId
  appsProviderId: string | null
  setAppsProvider: (id: string | null) => void

  // 蹇嵎搴旂敤锛氭敹钘?鍚敤/鎺掑簭
  quickAppsPinned: string[]
  toggleQuickAppPinned: (appId: string) => void

  quickAppsEnabled: Record<string, boolean>
  setQuickAppEnabled: (appId: string, enabled: boolean) => void

  quickAppsOrder: string[]
  setQuickAppsOrder: (order: string[]) => void
  
  // Actions
  addProvider: (name: string, baseUrl: string) => void
  removeProvider: (id: string) => void
  updateProvider: (id: string, updates: Partial<ApiProvider>) => void
  setActiveProvider: (id: string) => void

  setImageProvider: (id: string | null) => void
  setVideoProvider: (id: string | null) => void
  setCanvasProvider: (id: string | null) => void

  // 甯哥敤妯″瀷鎿嶄綔
  togglePinnedModel: (providerId: string, type: 'image' | 'prompt' | 'video' | 'translate', model: string) => void
}

// 榛樿棰勮閰嶇疆锛屾牴鎹姹備繚鎸佷负绌猴紝璁╃敤鎴疯嚜宸卞姞
const defaultProviders: ApiProvider[] = []

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'zh-CN',
      setLanguage: (language) => set({ language }),

      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      autoSaveEnabled: true,
      setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),

      // 榛樿杈撳嚭鐩綍锛氫娇鐢ㄧ浉瀵硅矾寰?output锛堥」鐩Щ鍔ㄥ埌鍏跺畠鐩樼涔熶笉浼氬け鏁堬級
      // The main process resolves this relative path inside the current workspace.
      outputDirectory: 'output',
      setOutputDirectory: (dir) => set({ outputDirectory: dir }),

      videoAutoSaveEnabled: true,
      setVideoAutoSaveEnabled: (enabled) => set({ videoAutoSaveEnabled: enabled }),

      videoOutputDirectory: 'output/videos',
      setVideoOutputDirectory: (dir) => set({ videoOutputDirectory: dir }),

      providers: defaultProviders,
      activeProviderId: null, // 榛樿娌℃湁浠讳綍閫変腑

      updateChannel: 'stable',
      setUpdateChannel: (channel) => set({ updateChannel: channel }),

      imageProviderId: null,
      videoProviderId: null,
      canvasProviderId: null,

      appsProviderId: null,
      setAppsProvider: (id) => set({ appsProviderId: id || null }),

      quickAppsPinned: [],
      toggleQuickAppPinned: (appId) => set((state) => {
        const id = String(appId || '').trim()
        if (!id) return state as any
        const cur = Array.isArray(state.quickAppsPinned) ? state.quickAppsPinned : []
        const exists = cur.includes(id)
        return { quickAppsPinned: exists ? cur.filter(x => x !== id) : [id, ...cur] }
      }),

      quickAppsEnabled: {},
      setQuickAppEnabled: (appId, enabled) => set((state) => {
        const id = String(appId || '').trim()
        if (!id) return state as any
        const cur = (state.quickAppsEnabled && typeof state.quickAppsEnabled === 'object') ? state.quickAppsEnabled : {}
        return { quickAppsEnabled: { ...cur, [id]: Boolean(enabled) } }
      }),

      quickAppsOrder: [],
      setQuickAppsOrder: (order) => set({ quickAppsOrder: Array.isArray(order) ? order.map(x => String(x || '')).filter(Boolean) : [] }),

      addProvider: (name, baseUrl) => set((state) => {
        const defaultKeyId = `key_${Date.now()}_default`
        const newProvider: ApiProvider = {
          id: `provider_${Date.now()}`, // 鐢熸垚鍞竴ID
          name,
          baseUrl,
          apiKey: '',
          apiKeys: [{ id: defaultKeyId, name: '榛樿', group: 'default', apiKey: '' }],
          keyUsage: {
            imageKeyId: defaultKeyId,
            promptKeyId: defaultKeyId,
            translateKeyId: defaultKeyId,
            videoKeyId: defaultKeyId,
            modelsKeyId: defaultKeyId
          },
          models: [],
          selectedImageModel: '',
          selectedPromptModel: '',
          selectedTranslateModel: '',
          selectedVideoModel: '',
          pinnedImageModels: [],
          pinnedPromptModels: [],
          pinnedVideoModels: [],
          pinnedTranslateModels: []
        }
        return { 
          providers: [...state.providers, newProvider],
          activeProviderId: newProvider.id, // 娣诲姞鍚庨粯璁ら€変腑杩欎釜鏂扮殑
          // 鑻ュ皻鏈厤缃敤閫旂綉绔欙紝鍒欓粯璁よ窡闅忔柊寤虹殑
          imageProviderId: state.imageProviderId || newProvider.id,
          videoProviderId: state.videoProviderId || newProvider.id,
          canvasProviderId: state.canvasProviderId || newProvider.id
        }
      }),

      removeProvider: (id) => set((state) => {
        const newProviders = state.providers.filter(p => p.id !== id)
        const fallbackId = newProviders.length > 0 ? newProviders[0].id : null
        return {
          providers: newProviders,
          // 濡傛灉鍒犻櫎鐨勬槸褰撳墠閫変腑鐨勶紝灏辨妸閫変腑鐘舵€佸垏缁欏墿涓嬬殑绗竴涓紝濡傛灉娌℃湁鍒欎负 null
          activeProviderId: state.activeProviderId === id ? fallbackId : state.activeProviderId,
          imageProviderId: state.imageProviderId === id ? fallbackId : state.imageProviderId,
          videoProviderId: state.videoProviderId === id ? fallbackId : state.videoProviderId,
          canvasProviderId: state.canvasProviderId === id ? fallbackId : state.canvasProviderId
        }
      }),

      updateProvider: (id, updates) => set((state) => ({
        providers: state.providers.map(p => 
          p.id === id ? { ...p, ...updates } : p
        )
      })),

      setActiveProvider: (id) => set({ activeProviderId: id }),

      setImageProvider: (id) => set({ imageProviderId: id }),
      setVideoProvider: (id) => set({ videoProviderId: id }),
      setCanvasProvider: (id) => set({ canvasProviderId: id }),

      togglePinnedModel: (providerId, type, model) => set((state) => {
        const maxPinned = 4
        const key = type === 'image'
          ? 'pinnedImageModels'
          : (type === 'video'
            ? 'pinnedVideoModels'
            : (type === 'translate'
              ? 'pinnedTranslateModels'
              : 'pinnedPromptModels'))

        return {
          providers: state.providers.map(p => {
            if (p.id !== providerId) return p

            const current = Array.isArray((p as any)[key]) ? ([...(p as any)[key]] as string[]) : ([] as string[])
            const exists = current.includes(model)
            if (exists) {
              return { ...p, [key]: current.filter(m => m !== model) }
            }

            // Do not add more items once the pin limit is reached.
            if (current.length >= maxPinned) {
              return p
            }

            return { ...p, [key]: [model, ...current] }
          })
        }
      })
    }),
    {
      name: 'aitnt-settings-v2',
      storage: fileJSONStorage,
       version: 9,
      migrate: (persistedState: any) => {
        // 杩佺Щ锛氭棭鏈熺増鏈妸 outputDirectory 鍐欐鍦?C 鐩樼敤鎴风洰褰曢噷锛岄」鐩浆绉诲埌鍏跺畠鐩樼鍚庝細瀵艰嚧淇濆瓨/棰勮寮傚父
        // Only redirect paths that look like the old default output directory.
        if (persistedState && typeof persistedState === 'object') {
          const out = persistedState.outputDirectory
          if (typeof out === 'string') {
            const normalized = out.toLowerCase().replace(/\//g, '\\')
            const looksLikeOldDefault = normalized.includes('\\users\\') && normalized.endsWith('\\aitnt\\output')
            if (looksLikeOldDefault) {
              persistedState.outputDirectory = 'output'
            }
          }

          // 杩佺Щ锛氫负鏃?provider 琛ラ綈 pinned 瀛楁
           if (Array.isArray(persistedState.providers)) {
             persistedState.providers = persistedState.providers.map((p: any) => {
               if (!p || typeof p !== 'object') return p

               // 澶?key 杩佺Щ锛氭妸鏃?apiKey 鏀惧埌 apiKeys[0]
               if (!Array.isArray(p.apiKeys) || p.apiKeys.length === 0) {
                 const defaultKeyId = `key_${Date.now()}_default`
                 p.apiKeys = [{ id: defaultKeyId, name: '榛樿', group: 'default', apiKey: String(p.apiKey || '') }]
               }
               if (!p.keyUsage || typeof p.keyUsage !== 'object') {
                 const firstId = String(p.apiKeys?.[0]?.id || '')
                 p.keyUsage = {
                   imageKeyId: firstId,
                   promptKeyId: firstId,
                   translateKeyId: firstId,
                   videoKeyId: firstId,
                   modelsKeyId: firstId
                 }
               }

               if (!Array.isArray(p.pinnedImageModels)) p.pinnedImageModels = []
               if (!Array.isArray(p.pinnedPromptModels)) p.pinnedPromptModels = []
               if (!Array.isArray(p.pinnedVideoModels)) p.pinnedVideoModels = []
               if (!Array.isArray(p.pinnedTranslateModels)) p.pinnedTranslateModels = []
               if (typeof p.selectedVideoModel !== 'string') p.selectedVideoModel = ''
               if (typeof p.selectedTranslateModel !== 'string') p.selectedTranslateModel = ''
               return p
             })
           }

           // Fill the missing auto-save flag during migration.
           if (typeof persistedState.autoSaveEnabled !== 'boolean') {
             persistedState.autoSaveEnabled = true
           }

           // 杩佺Щ锛氳ˉ榻愯棰戣嚜鍔ㄤ繚瀛樹笌鐩綍
           if (typeof persistedState.videoAutoSaveEnabled !== 'boolean') {
             // Reuse the legacy image auto-save preference when backfilling video auto-save.
             persistedState.videoAutoSaveEnabled = typeof persistedState.autoSaveEnabled === 'boolean'
               ? persistedState.autoSaveEnabled
               : true
           }
            if (typeof persistedState.videoOutputDirectory !== 'string' || !persistedState.videoOutputDirectory.trim()) {
             const base = typeof persistedState.outputDirectory === 'string' && persistedState.outputDirectory.trim()
               ? String(persistedState.outputDirectory).replace(/[\\/]+$/g, '')
               : 'output'
              persistedState.videoOutputDirectory = `${base}/videos`
            }

            // Backfill per-feature provider selections with the current active provider.
            const activeId = typeof persistedState.activeProviderId === 'string' ? persistedState.activeProviderId : null
             if (typeof persistedState.imageProviderId !== 'string') persistedState.imageProviderId = activeId
             if (typeof persistedState.videoProviderId !== 'string') persistedState.videoProviderId = activeId
             if (typeof persistedState.canvasProviderId !== 'string') persistedState.canvasProviderId = activeId

             // Keep quick apps following the active provider unless explicitly set.
             if (typeof persistedState.appsProviderId !== 'string') persistedState.appsProviderId = null

             // Ensure quick app state containers always exist.
             if (!Array.isArray(persistedState.quickAppsPinned)) persistedState.quickAppsPinned = []
             if (!persistedState.quickAppsEnabled || typeof persistedState.quickAppsEnabled !== 'object') persistedState.quickAppsEnabled = {}
             if (!Array.isArray(persistedState.quickAppsOrder)) persistedState.quickAppsOrder = []

           if (persistedState.updateChannel !== 'stable' && persistedState.updateChannel !== 'beta') {
               persistedState.updateChannel = 'stable'
             }

             if (persistedState.language !== 'zh-CN' && persistedState.language !== 'en-US') {
               persistedState.language = 'zh-CN'
             }
           }
           return persistedState
         }
     }
  )
)

