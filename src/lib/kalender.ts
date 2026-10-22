import { addDays } from './dates'

/* ---------- Tipe data ---------- */
export interface HourRow {
  weekday: number // 0 = Minggu ... 6 = Sabtu
  is_open: boolean
  open_time: string
  close_time: string
}
export interface OverrideRow {
  day: string
  is_closed: boolean
  open_time: string | null
  close_time: string | null
  note: string | null
}
/** Baris mentah dari fungsi calendar_cashier_shifts (tabel `shifts` yang dibuka kasir di halaman Kasir). */
export interface CashierShiftRow {
  id: number
  cashier_id: string | null
  cashier_name: string | null
  opened_at: string
  closed_at: string | null
}
/** Shift kasir yang sudah dipetakan ke tanggal & jam WIB, siap ditampilkan. */
export interface CashierShift {
  id: number
  day: string
  staff_name: string
  start_time: string
  end_time: string
  /** true = kasir belum menutup shift */
  active: boolean
}
export type OrderKind = 'customer' | 'supplier'
export type OrderStatus = 'pending' | 'processing' | 'done' | 'cancelled'
export interface OrderRow {
  id: number
  kind: OrderKind
  title: string
  party: string | null
  due_date: string
  due_time: string | null
  details: string | null
  status: OrderStatus
  source: string | null
  supplier_id: number | null
}

/** Penanda pesanan yang dibuat dari halaman Pembelian Paket. Hanya pesanan ini yang tampil di kalender. */
export const ORDER_SOURCE = 'pembelian_paket'

/** Rincian pesanan dijadikan satu baris pendek: "Roti: 10 pcs, Susu: 5 liter". */
export const detailsPreview = (d: string | null | undefined) =>
  (d ?? '')
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .join(', ')

export const KIND_LABEL: Record<OrderKind, string> = { customer: 'Pelanggan', supplier: 'Supplier' }
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Baru',
  processing: 'Diproses',
  done: 'Selesai',
  cancelled: 'Dibatalkan',
}

/* ---------- Nama hari & format ---------- */
export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] // tampilan Senin → Minggu
export const WEEK_HEAD = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

export const DEFAULT_OPEN = '08:00'
export const DEFAULT_CLOSE = '21:00'

export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
export const toMin = (t: string) => {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m)
}
export const minToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const fmtTime = (t: string | null | undefined) => hhmm(t).replace(':', '.')
export const fmtRange = (a: string, b: string) => `${fmtTime(a)}–${fmtTime(b)}`

export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
export const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
export const monthLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', month: 'long', year: 'numeric' })

export const diffDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

const wibParts = (iso: string) => {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  const [h, m] = d
    .toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .split(':')
  return { date, min: Number(h) * 60 + Number(m) }
}

/**
 * Ubah shift kasir (waktu UTC dari database) jadi tanggal & jam WIB.
 * Shift yang masih terbuka berakhir di "sekarang"; shift yang melewati tengah malam dipotong di 24.00
 * supaya tetap tergambar di hari ia dibuka.
 */
export function toCashierShift(r: CashierShiftRow, now: { date: string; min: number }): CashierShift {
  const start = wibParts(r.opened_at)
  let end: number
  if (r.closed_at) {
    const c = wibParts(r.closed_at)
    end = c.date === start.date ? c.min : 24 * 60
  } else {
    end = start.date === now.date ? now.min : 24 * 60
  }
  end = Math.min(24 * 60, Math.max(end, start.min + 1)) // minimal 1 menit agar batang tetap terlihat
  return {
    id: r.id,
    day: start.date,
    staff_name: r.cashier_name?.trim() || 'Kasir',
    start_time: minToHHMM(start.min),
    end_time: minToHHMM(end),
    active: !r.closed_at,
  }
}

/** Tanggal & menit sejak 00.00 saat ini, dalam WIB. */
export function nowWIB() {
  const d = new Date()
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  const [h, m] = d
    .toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .split(':')
  return { date, min: Number(h) * 60 + Number(m) }
}
export type Now = ReturnType<typeof nowWIB>

export function durationText(min: number) {
  if (min < 1) return 'kurang dari 1 mnt'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} mnt`
  if (m === 0) return `${h} jam`
  return `${h} jam ${m} mnt`
}

/* ---------- Kalender bulanan ---------- */
export const monthOf = (date: string) => `${date.slice(0, 7)}-01`

export function shiftMonth(anchor: string, delta: number) {
  const d = new Date(`${anchor}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + delta, 1)
  return d.toISOString().slice(0, 10)
}

/** 6 minggu penuh, mulai Senin. */
export function gridRange(anchor: string) {
  const offset = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7
  const from = addDays(anchor, -offset)
  return { from, to: addDays(from, 41), days: Array.from({ length: 42 }, (_, i) => addDays(from, i)) }
}

/* ---------- Jam operasional per tanggal ---------- */
export interface DayInfo {
  closed: boolean
  open: string | null
  close: string | null
  note: string | null
  custom: boolean // true = ada pengecualian khusus tanggal ini
}

export function weeklyInfo(date: string, hours: HourRow[]): DayInfo {
  const h = hours.find((x) => x.weekday === weekdayOf(date))
  if (!h) return { closed: false, open: DEFAULT_OPEN, close: DEFAULT_CLOSE, note: null, custom: false }
  if (!h.is_open) return { closed: true, open: null, close: null, note: null, custom: false }
  return { closed: false, open: hhmm(h.open_time), close: hhmm(h.close_time), note: null, custom: false }
}

export function resolveDay(date: string, hours: HourRow[], overrides: OverrideRow[]): DayInfo {
  const o = overrides.find((x) => x.day === date)
  if (!o) return weeklyInfo(date, hours)
  if (o.is_closed) return { closed: true, open: null, close: null, note: o.note, custom: true }
  const base = weeklyInfo(date, hours)
  return {
    closed: false,
    open: hhmm(o.open_time) || base.open || DEFAULT_OPEN,
    close: hhmm(o.close_time) || base.close || DEFAULT_CLOSE,
    note: o.note,
    custom: true,
  }
}

/* ---------- Pesanan mepet ---------- */
export type Urgency = 'overdue' | 'soon' | 'today' | 'tomorrow' | 'later' | 'none'
export const SOON_MINUTES = 180 // kurang dari 3 jam dianggap mepet

export function orderUrgency(
  o: Pick<OrderRow, 'status' | 'due_date' | 'due_time'>,
  now: Now,
): { level: Urgency; label: string } {
  if (o.status === 'done' || o.status === 'cancelled') return { level: 'none', label: '' }

  if (o.due_date < now.date) {
    const days = diffDays(o.due_date, now.date)
    return { level: 'overdue', label: days === 1 ? 'Terlewat kemarin' : `Terlewat ${days} hari` }
  }
  if (o.due_date === now.date) {
    if (!o.due_time) return { level: 'today', label: 'Hari ini' }
    const diff = toMin(o.due_time) - now.min
    if (diff < 0) return { level: 'overdue', label: `Terlewat ${durationText(-diff)}` }
    if (diff <= SOON_MINUTES) return { level: 'soon', label: `${durationText(diff)} lagi` }
    return { level: 'today', label: `Hari ini ${fmtTime(o.due_time)}` }
  }
  if (o.due_date === addDays(now.date, 1)) {
    return { level: 'tomorrow', label: o.due_time ? `Besok ${fmtTime(o.due_time)}` : 'Besok' }
  }
  return { level: 'later', label: '' }
}

export type Tone = 'danger' | 'warning' | 'info' | 'muted' | 'success'
export const urgencyTone = (u: Urgency): Tone =>
  u === 'overdue' || u === 'soon' ? 'danger' : u === 'today' ? 'warning' : u === 'tomorrow' ? 'info' : 'muted'

export const byDueTime = (a: OrderRow, b: OrderRow) =>
  (a.due_time ?? '99:99').localeCompare(b.due_time ?? '99:99') || a.id - b.id

/* ---------- Warna per orang ---------- */
const HUES = [160, 210, 265, 330, 25, 45, 190, 100]
export function staffHue(name: string) {
  let h = 0
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 997
  return HUES[h % HUES.length]
}
export const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || '?'
