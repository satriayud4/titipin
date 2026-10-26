import { useMemo, useRef } from 'react'
import { supabase } from './supabase'

export const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

/**
 * Kunci permintaan untuk satu transaksi. Selama isi transaksi sama (fingerprint sama), kunci yang sama dipakai,
 * jadi mengirim ulang setelah timeout atau koneksi putus tidak mencatat transaksi dua kali. Setelah transaksi
 * berhasil atau isinya berubah, kunci baru dibuat.
 */
export function useRequestKey() {
  const ref = useRef<{ id: string; fp: string } | null>(null)
  return useMemo(
    () => ({
      get(fp: string) {
        if (!ref.current || ref.current.fp !== fp) ref.current = { id: newRequestId(), fp }
        return ref.current.id
      },
      reset() {
        ref.current = null
      },
    }),
    [],
  )
}

export const REQUEST_TIMEOUT_MS = 20000

/** Panggil RPC dengan batas waktu. Bila lewat, hasilnya `timedOut: true` (transaksi mungkin sudah tersimpan). */
export async function rpcWithTimeout<T = unknown>(fn: string, args: Record<string, unknown>, ms = REQUEST_TIMEOUT_MS) {
  const ac = new AbortController()
  const timer = window.setTimeout(() => ac.abort(), ms)
  try {
    const res = await supabase.rpc(fn, args).abortSignal(ac.signal)
    return { data: res.data as T | null, error: res.error, timedOut: false }
  } catch (e) {
    const aborted = ac.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')
    return { data: null as T | null, error: { message: aborted ? 'Waktu tunggu habis' : e instanceof Error ? e.message : 'Koneksi bermasalah', code: 'CLIENT_NET' } as { message: string; code?: string }, timedOut: true }
  } finally {
    window.clearTimeout(timer)
  }
}

/** Galat jaringan (bukan penolakan dari server): aman dicoba lagi dengan kunci yang sama. */
export const isNetworkError = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (e.code === 'CLIENT_NET' || /failed to fetch|networkerror|load failed|network request failed/i.test(e.message ?? ''))
