import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Role = 'admin' | 'kasir'

export interface Profile {
  id: string
  full_name: string
  username: string | null
  role: Role
  is_active: boolean
  is_superadmin: boolean
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const MIN_LOADING_MS = 1000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(
    undefined,
  )
  const [profile, setProfile] = useState<Profile | null | undefined>(
    undefined,
  )
  const [displayLoading, setDisplayLoading] = useState(true)

  const loadingStartedAt = useRef(Date.now())

  const refreshProfile = useCallback(async () => {
    setProfile(undefined)

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()

      if (sessionError) throw sessionError

      const currentSession = sessionData.session

      if (!currentSession) {
        setProfile(null)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, role, is_active, is_superadmin')
        .eq('id', currentSession.user.id)
        .single()

      if (error) throw error

      setProfile(data as Profile)
    } catch (error) {
      setProfile(null)
      throw error
    }
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return

      if (error) {
        console.error('Gagal memeriksa sesi:', error.message)
        setSession(null)
        setProfile(null)
        return
      }

      setSession(data.session)
    }).catch((error: unknown) => {
      if (!active) return

      console.error('Gagal memeriksa sesi:', error)
      setSession(null)
      setProfile(null)
    })
  
    const { data } = supabase.auth.onAuthStateChange(
  (_event, nextSession) => {
    setSession(nextSession)
  },
)

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      if (session === undefined) return

      if (!session) {
        setProfile(null)
        return
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, username, role, is_active, is_superadmin')
          .eq('id', session.user.id)
          .single()

        if (cancelled) return

        if (error) throw error

        setProfile(data as Profile)
      } catch (error) {
        if (cancelled) return

        console.error('Gagal memuat profil:', error)
        setProfile(null)
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [session?.user.id, session === undefined])

  const loading =
    session === undefined ||
    (session !== null && profile === undefined)

  useEffect(() => {
    if (loading) {
      loadingStartedAt.current = Date.now()
      setDisplayLoading(true)
      return
    }

    const elapsed = Date.now() - loadingStartedAt.current
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed)

    if (remaining === 0) {
      setDisplayLoading(false)
      return
    }

    const timer = setTimeout(() => {
      setDisplayLoading(false)
    }, remaining)

    return () => clearTimeout(timer)
  }, [loading])

  const value: AuthState = {
    session: session ?? null,
    profile: profile ?? null,
    loading: loading || displayLoading,

    refreshProfile,

    signOut: async () => {
      await supabase.auth.signOut()
    },
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)

  if (!ctx) {
    throw new Error('useAuth harus di dalam AuthProvider')
  }

  return ctx
}
