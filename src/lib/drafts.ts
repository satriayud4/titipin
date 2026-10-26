import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'

const PREFIX = 'titipin:draft:'
const MAX_AGE = 24 * 60 * 60 * 1000

interface Stored<T> {
  v: 1
  at: number
  data: T
}

export function readDraft<T>(key: string | null): { data: T; at: number } | null {
  if (!key) return null
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const s = JSON.parse(raw) as Stored<T>
    if (s.v !== 1 || Date.now() - s.at > MAX_AGE) {
      localStorage.removeItem(PREFIX + key)
      return null
    }
    return { data: s.data, at: s.at }
  } catch {
    return null
  }
}

export function writeDraft<T>(key: string | null, data: T) {
  if (!key) return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: 1, at: Date.now(), data } satisfies Stored<T>))
  } catch {
    /* penyimpanan penuh atau diblokir: draft dilewati saja */
  }
}

export function clearDraft(key: string | null) {
  if (!key) return
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* abaikan */
  }
}

/** Kunci draft per pengguna, supaya draft satu kasir tidak muncul di akun kasir lain. */
export function useDraftKey(name: string) {
  const { profile } = useAuth()
  return profile ? `${name}:${profile.id}` : null
}

/**
 * Menyimpan data ke draft secara otomatis (tertunda 500 ms) selama `enabled`,
 * dan langsung menyimpan versi terbaru saat halaman ditinggalkan.
 */
export function useAutosave<T>(key: string | null, data: T, enabled: boolean, delay = 500) {
  const latest = useRef({ key, data, enabled })
  useEffect(() => {
    latest.current = { key, data, enabled }
  })
  useEffect(() => {
    if (!enabled || !key) return
    const t = window.setTimeout(() => writeDraft(key, data), delay)
    return () => window.clearTimeout(t)
  }, [key, data, enabled, delay])
  useEffect(
    () => () => {
      const l = latest.current
      if (l.enabled && l.key) writeDraft(l.key, l.data)
    },
    [],
  )
}

export function timeAgo(at: number) {
  const m = Math.round((Date.now() - at) / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.round(m / 60)
  return `${h} jam lalu`
}
