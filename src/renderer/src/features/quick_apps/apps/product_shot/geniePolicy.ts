import { useEffect, useMemo, useState } from 'react'
import { kvGetJsonMigrate, kvSetJson } from '../../../../core/persist/kvClient'

export type GenieSmallTextPolicy = 'keep_unreadable' | 'try_readable' | 'ignore'
export type GenieBackgroundPolicy = 'solid_lock' | 'allow_ref'

export type GeniePolicy = {
  smallText: GenieSmallTextPolicy
  background: GenieBackgroundPolicy
  solidColor: string
  allowLogoTranscribe: boolean
}

const STORAGE_KEY = 'aitnt-qa-product-shot-genie-policy:v1'

export const DEFAULT_GENIE_POLICY: GeniePolicy = {
  smallText: 'keep_unreadable',
  background: 'solid_lock',
  solidColor: '#ededed',
  allowLogoTranscribe: false
}

function sanitizeHexColor(s: any) {
  const raw = String(s || '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw
  return DEFAULT_GENIE_POLICY.solidColor
}

export function sanitizeGeniePolicy(p: any): GeniePolicy {
  const smallText = (String(p?.smallText || '') as GenieSmallTextPolicy)
  const background = (String(p?.background || '') as GenieBackgroundPolicy)

  return {
    smallText: (smallText === 'try_readable' || smallText === 'ignore' || smallText === 'keep_unreadable') ? smallText : DEFAULT_GENIE_POLICY.smallText,
    background: (background === 'allow_ref' || background === 'solid_lock') ? background : DEFAULT_GENIE_POLICY.background,
    solidColor: sanitizeHexColor(p?.solidColor),
    allowLogoTranscribe: Boolean(p?.allowLogoTranscribe)
  }
}

export function buildGeniePolicyPreviewText(policy: GeniePolicy) {
  const p = sanitizeGeniePolicy(policy)
  const bg = p.background === 'solid_lock'
    ? `鑳屾櫙绛栫暐锛氬綋鐢ㄦ埛瑕佹眰鈥滅函鑹茶儗鏅攣瀹氣€濇椂锛屽満鏅?鑳屾櫙鍙傝€冨浘浠呯敤浜庡厜褰?鏋勫浘姘涘洿锛岀姝㈢户鎵胯儗鏅厓绱狅紱榛樿绾壊寤鸿 ${p.solidColor}銆俙
    : `鑳屾櫙绛栫暐锛氬厑璁稿弬鑰冨浘鍐冲畾鑳屾櫙锛屼絾浠嶉渶閬垮厤鍑虹幇涓庝骇鍝佹棤鍏崇殑澶嶆潅閬撳叿/鏂囧瓧骞叉壈锛涢粯璁ょ函鑹插缓璁?${p.solidColor}銆俙

  const small = p.smallText === 'keep_unreadable'
    ? '灏忓悐鐗?鏋佸皬瀛楋細淇濈暀瀛樺湪浣嗕笉鍙锛涚姝㈢寽娴嬪瓧姣嶏紱绂佹鐢熸垚娓呮櫚鍙鐨勬爣鍑嗚嫳鏂囧崟璇嶃€?
    : p.smallText === 'try_readable'
      ? '灏忓悐鐗?鏋佸皬瀛楋細灏介噺璐磋繎鍙傝€冨浘澶嶅埢锛涜嫢鏃犳硶绮剧‘澶嶅埢锛屽畞鍙笉鍙涔熶笉瑕佺紪閫犳柊瀛楁瘝/鍗曡瘝銆?
      : '灏忓悐鐗?鏋佸皬瀛楋細鍏佽寮卞寲/蹇界暐锛涚姝㈢敓鎴愭竻鏅板彲璇荤殑鏍囧噯鑻辨枃鍗曡瘝鎴栫紪閫犲瓧姣嶅唴瀹广€?

  const logo = p.allowLogoTranscribe
    ? '涓籐ogo/澶у瓧锛氬湪鈥滃瓧姣嶉潪甯告竻鏅颁笖鐢ㄦ埛鏄庣‘瑕佹眰鍙鈥濇椂鍏佽杞啓锛屼絾蹇呴』涓庡弬鑰冨浘涓€鑷达紱鍚﹀垯涓嶈閫愬瓧杞啓銆?
    : '涓籐ogo/澶у瓧锛氬己璋冨鍒诲舰鎬?浣嶇疆/宸ヨ壓锛岄粯璁や笉閫愬瓧杞啓銆?

  return [bg, small, logo].join('\n')
}

export function useGeniePolicy() {
  const [hydrated, setHydrated] = useState(false)
  const [policy, setPolicy] = useState<GeniePolicy>(DEFAULT_GENIE_POLICY)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const parsed = await kvGetJsonMigrate<any>(STORAGE_KEY, null)
        if (!alive) return
        if (parsed && typeof parsed === 'object') {
          setPolicy(sanitizeGeniePolicy(parsed))
        }
      } catch {
        // ignore
      } finally {
        if (alive) setHydrated(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const t = window.setTimeout(() => {
      void kvSetJson(STORAGE_KEY, sanitizeGeniePolicy(policy))
    }, 320)
    return () => window.clearTimeout(t)
  }, [hydrated, policy])

  const previewText = useMemo(() => buildGeniePolicyPreviewText(policy), [policy])

  return {
    hydrated,
    policy,
    setPolicy,
    resetPolicy: () => setPolicy(DEFAULT_GENIE_POLICY),
    previewText
  }
}

