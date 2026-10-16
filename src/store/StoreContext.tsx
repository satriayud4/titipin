import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { imageUrl } from '../lib/image'

interface StoreInfo {
  name: string
  tagline: string
  logo: string
}
interface StoreCtx {
  name: string
  tagline: string
  logoUrl: string | null
  loaded: boolean
  isSet: boolean
  refresh: () => Promise<void>
}

const FALLBACK = 'Toko Saya'
const CACHE = 'store-info'

const Ctx = createContext<StoreCtx>({ name: FALLBACK, tagline: '', logoUrl: null, loaded: false, isSet: false, refresh: async () => {} })

function readCache(): StoreInfo {
  try {
    const raw = localStorage.getItem(CACHE)
    if (raw) {
      const v = JSON.parse(raw) as Partial<StoreInfo>
      return { name: v.name ?? '', tagline: v.tagline ?? '', logo: v.logo ?? '' }
    }
  } catch {
    /* abaikan */
  }
  return { name: '', tagline: '', logo: '' }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<StoreInfo>(readCache)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('store_settings').select('name, tagline, logo_path').eq('id', 1).maybeSingle()
    if (data) {
      const v = { name: String(data.name ?? ''), tagline: String(data.tagline ?? ''), logo: String(data.logo_path ?? '') }
      setInfo(v)
      try {
        localStorage.setItem(CACHE, JSON.stringify(v))
      } catch {
        /* abaikan */
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const name = info.name.trim() || FALLBACK
  useEffect(() => {
    document.title = name
  }, [name])

  return (
    <Ctx.Provider
      value={{
        name,
        tagline: info.tagline.trim(),
        logoUrl: info.logo ? imageUrl(info.logo, 'payment-images') : null,
        loaded,
        isSet: info.name.trim() !== '',
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useStore() {
  return useContext(Ctx)
}