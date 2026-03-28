import { useSettingsStore } from '../settings/store'

export type AppLanguage = 'zh-CN' | 'en-US'

export function useAppLanguage() {
  const language = useSettingsStore((s) => s.language)
  return {
    language,
    isZh: language === 'zh-CN'
  }
}

export function byLanguage<T>(language: AppLanguage, zhValue: T, enValue: T): T {
  return language === 'zh-CN' ? zhValue : enValue
}
