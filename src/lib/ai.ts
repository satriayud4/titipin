import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { todayWIB } from './dates'

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean
  /** Topik data yang dipakai AI untuk menjawab (ditampilkan kecil di bawah jawaban). */
  used?: string[]
}

export const AI_OPEN_EVENT = 'saraga:ai-open'
/** Buka panel asisten dari mana saja. Isi `ask` bila ingin langsung mengirim pertanyaan. */
export const openAssistant = (ask?: string) => window.dispatchEvent(new CustomEvent(AI_OPEN_EVENT, { detail: { ask } }))

const TOPIC_LABEL: Record<string, string> = {
  ringkasan: 'penjualan',
  produk: 'produk',
  waktu: 'jam & hari',
  banding: 'perbandingan',
  konsinyasi: 'konsinyasi',
  stok: 'stok',
  setoran: 'setoran',
}
export const topicLabel = (t: string) => TOPIC_LABEL[t] ?? t

/** Pesan galat yang ramah, termasuk saat server AI belum dipasang. */
async function failText(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: Response }
  if (e?.context && typeof e.context.json === 'function') {
    try {
      const j = (await e.context.clone().json()) as { error?: string }
      if (j?.error) return j.error
    } catch {
      /* abaikan */
    }
  }
  const msg = e?.message ?? ''
  if (/not found|404/i.test(msg)) return 'Asisten AI belum dipasang di server (fungsi asisten-ai belum di-deploy).'
  if (/failed to send|fetch/i.test(msg)) return 'Tidak bisa terhubung ke asisten AI. Periksa koneksi internet.'
  return msg || 'Asisten AI sedang bermasalah, coba lagi.'
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('asisten-ai', { body })
  if (error) throw new Error(await failText(error))
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) throw new Error(String((data as { error: string }).error))
  return data as T
}

export const askAssistant = (history: ChatMsg[], storeName: string) =>
  call<{ reply: string; used?: string[] }>({
    mode: 'chat',
    storeName,
    messages: history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
  })

export const askBrief = (period: 'harian' | 'mingguan', storeName: string) =>
  call<{ reply: string; used?: string[] }>({ mode: 'brief', period, storeName })

// ---------------------------------------------------------------- riwayat chat sementara (hanya selama sesi tab aktif)
const chatKey = (uid: string) => `saraga:ai-chat:${uid}`
export function loadChat(uid: string): ChatMsg[] {
  try {
    const raw = sessionStorage.getItem(chatKey(uid))
    const arr = raw ? (JSON.parse(raw) as ChatMsg[]) : []
    return Array.isArray(arr) ? arr.slice(-60) : []
  } catch {
    return []
  }
}
export function saveChat(uid: string, msgs: ChatMsg[]) {
  try {
    sessionStorage.setItem(chatKey(uid), JSON.stringify(msgs.slice(-60)))
  } catch {
    /* penyimpanan penuh atau diblokir: riwayat tetap ada di memori */
  }
}
export function clearAllAiStorage() {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('saraga:ai-')) sessionStorage.removeItem(k)
    for (const k of Object.keys(localStorage)) if (k.startsWith('saraga:ai-greeting')) localStorage.removeItem(k)
  } catch {
    /* abaikan */
  }
}

// ---------------------------------------------------------------- sapaan dashboard
export interface Greeting {
  judul: string
  pesan: string
  ikon: string
}
const GREETING_TTL = 3 * 60 * 60 * 1000 // 3 jam, lalu dibuat ulang

const daypart = () => {
  const h = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }))
  return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam'
}

/**
 * Sapaan dashboard dari AI. Dipanggil sekali per bagian hari (pagi/siang/sore/malam) dan disimpan 3 jam,
 * supaya hemat biaya. Bila gagal, mengembalikan null dan dashboard memakai teks bawaan.
 */
export function useAiGreeting(uid: string | undefined, storeName: string, enabled: boolean) {
  const [greeting, setGreeting] = useState<Greeting | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!uid || !enabled) return
    const key = `saraga:ai-greeting:${uid}`
    const stamp = `${todayWIB()}|${daypart()}`
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const c = JSON.parse(raw) as { stamp: string; at: number; data: Greeting }
        if (c.stamp === stamp && Date.now() - c.at < GREETING_TTL) {
          setGreeting(c.data)
          return
        }
      }
    } catch {
      /* cache rusak: abaikan */
    }
    let cancelled = false
    setLoading(true)
    void call<Greeting>({ mode: 'greeting', storeName })
      .then((g) => {
        if (cancelled) return
        setGreeting(g)
        try {
          localStorage.setItem(key, JSON.stringify({ stamp, at: Date.now(), data: g }))
        } catch {
          /* abaikan */
        }
      })
      .catch(() => {
        /* diam: dashboard memakai teks bawaan */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uid, storeName, enabled])

  return { greeting, loading }
}
