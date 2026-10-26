import { supabase } from './supabase'
import { todayWIB } from './dates'

export interface DayStatus {
  closed: boolean
  note: string | null
  /** "override" = ditandai khusus di tanggal itu; "weekly" = mengikuti jadwal mingguan. */
  source: 'override' | 'weekly'
}

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

/** Status buka/tutup toko pada satu tanggal (pengecualian tanggal lebih kuat dari jadwal mingguan). Null bila belum bisa dibaca. */
export async function fetchDayStatus(day: string = todayWIB()): Promise<DayStatus | null> {
  const [o, h] = await Promise.all([
    supabase.from('day_overrides').select('is_closed, note').eq('day', day).maybeSingle(),
    supabase.from('store_hours').select('is_open').eq('weekday', weekdayOf(day)).maybeSingle(),
  ])
  if (o.error && h.error) return null
  if (o.data) return { closed: !!o.data.is_closed, note: (o.data.note as string | null) ?? null, source: 'override' }
  if (h.data && h.data.is_open === false) return { closed: true, note: null, source: 'weekly' }
  return { closed: false, note: null, source: 'weekly' }
}
