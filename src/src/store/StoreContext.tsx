import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { imageUrl } from '../lib/image'
import { useAuth } from '../auth/AuthContext'
import { APP_BRAND } from '../brand'

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
const EMPTY: StoreInfo = { name: '', tagline: '', logo: '' }

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
  return EMPTY
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const userId = session?.user.id
  const [info, setInfo] = useState<StoreInfo>(readCache)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!userId) return
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
  }, [userId])

  useEffect(() => {
    if (loading) return
    if (userId) {
      void refresh()
    } else {
      setInfo(EMPTY)
      setLoaded(false)
      try {
        localStorage.removeItem(CACHE)
      } catch {
        /* abaikan */
      }
    }
  }, [loading, userId, refresh])

  const name = info.name.trim() || FALLBACK
  useEffect(() => {
    document.title = userId ? name : APP_BRAND
  }, [userId, name])

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