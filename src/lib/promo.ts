import { rupiah } from './format'

export type DiscountType = 'percent' | 'nominal'

/** Satu barang di dalam sebuah promo (hasil fungsi promo_rule_list / promo_list). */
export interface PromoItem {
  batch_id: number
  product_name: string
  supplier_name: string
  original_price: number
  promo_price: number
  original_cost: number
  promo_cost: number
  qty_at_start: number | null
  qty_sold: number
  qty_remaining: number
  active: boolean
}

export interface PromoCampaign {
  id: number
  name: string
  discount_type: DiscountType
  discount_value: number
  /** Hanya terisi untuk diskon persen. */
  discount_percent: number
  supplier_share: number
  supplier_note: string | null
  status: 'terjadwal' | 'aktif' | 'selesai'
  started_on: string
  ended_on: string | null
  running: boolean
  start_at?: string
  end_mode?: 'expired' | 'at'
  end_at?: string | null
  /** Promo dari versi lama: hanya bisa dilihat dan dihentikan. */
  legacy?: boolean
  items: PromoItem[]
}

/** Baris hasil fungsi catatan promo: penjualan promo satu supplier pada satu tanggal. */
export interface PromoNoteRow {
  campaign_id: number
  campaign_name: string
  supplier_note: string | null
  discount_percent: number
  discount_type?: DiscountType
  discount_value?: number
  supplier_share: number
  start_at?: string
  end_mode?: 'expired' | 'at'
  end_at?: string | null
  product_name: string
  qty: number
  original_price: number
  promo_price: number
  original_cost: number
  promo_cost: number
}

export const PROMO_SQL_FILE = 'supabase/4-promo-expired.sql'
export const PROMO_V2_SQL_FILE = 'supabase/5-promo-fleksibel.sql'

/** Kode error "fungsi/tabel belum ada" dari Supabase, artinya SQL promo belum dijalankan. */
export const isMissingSetup = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (['PGRST205', 'PGRST202', '42P01', '42703', '42883'].includes(e.code ?? '') || !!e.message?.includes('schema cache'))

/**
 * Harga promo. Persen: dibulatkan ke Rp100 terdekat dan selalu lebih murah dari harga normal.
 * Nominal: harga normal dikurangi potongan (minimal Rp0). Rumusnya sama dengan promo_calc_price di database.
 */
export function promoPrice(price: number, type: DiscountType, value: number) {
  if (type === 'nominal') return Math.max(price - value, 0)
  let v = Math.round((price * (100 - value)) / 10000) * 100
  if (v >= price) v = Math.max(price - 100, 0)
  return Math.max(v, 0)
}

/** Harga setoran ke supplier setelah promo, bila supplier ikut menanggung sebagian potongan. */
export function promoCost(cost: number, price: number, promo: number, supplierShare: number) {
  return Math.max(0, cost - Math.round(((price - promo) * supplierShare) / 100))
}

export const SHARE_OPTIONS = [
  { value: 0, label: 'Toko', hint: 'Potongan ditanggung toko. Harga setoran ke supplier tetap.' },
  { value: 50, label: 'Dibagi dua', hint: 'Supplier menanggung separuh potongan, jadi harga setoran turun separuhnya.' },
  { value: 100, label: 'Supplier', hint: 'Supplier menanggung seluruh potongan, jadi harga setoran turun sebesar potongan.' },
]

export const shareLabel = (share: number) =>
  share <= 0 ? 'ditanggung toko' : share >= 100 ? 'ditanggung supplier' : `dibagi (supplier ${share}%)`

export const shortDate = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`

/** "30%" atau "Rp 2.000". */
export const discountLabel = (type: DiscountType, value: number) => (type === 'percent' ? `${value}%` : rupiah(value))

// ---------- waktu (selalu WIB) ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
function wibParts(iso: string) {
  const o: Record<string, string> = {}
  for (const p of partsFmt.formatToParts(new Date(iso))) o[p.type] = p.value
  return { date: `${o.year}-${o.month}-${o.day}`, hh: o.hour, mm: o.minute, day: Number(o.day), month: Number(o.month) - 1 }
}
/** "15.30" */
export const wibTime = (iso: string) => {
  const p = wibParts(iso)
  return `${p.hh}.${p.mm}`
}
/** "25 Okt 15.30" */
export const wibStamp = (iso: string) => {
  const p = wibParts(iso)
  return `${p.day} ${MONTHS[p.month]} ${p.hh}.${p.mm}`
}
export const wibDateOf = (iso: string) => wibParts(iso).date
/** Gabungkan tanggal (YYYY-MM-DD) dan jam (HH:MM) WIB menjadi waktu ISO dengan zona +07:00. */
export const wibIso = (date: string, time: string) => `${date}T${time}:00+07:00`

/** Kalimat singkat tentang kapan promo berlaku. */
export function windowLabel(c: Pick<PromoCampaign, 'end_mode' | 'start_at' | 'end_at' | 'status'>): string {
  if (!c.end_mode) return 'sampai expired'
  const startFuture = c.status === 'terjadwal' && c.start_at
  if (c.end_mode === 'expired') {
    return startFuture ? `mulai ${wibStamp(c.start_at!)}, sampai expired` : 'sampai expired'
  }
  if (!c.start_at || !c.end_at) return ''
  const a = wibStamp(c.start_at)
  const sameDay = wibDateOf(c.start_at) === wibDateOf(c.end_at)
  return sameDay ? `${a} – ${wibTime(c.end_at)}` : `${a} – ${wibStamp(c.end_at)}`
}

const pcs = (n: number) => `${n} pcs`

/**
 * Kalimat catatan promo untuk supplier. Dipakai di rincian setoran, gambar rekap, dan pesan WhatsApp,
 * jadi supplier tahu kenapa harga setoran barangnya berbeda.
 */
export function promoNoteLines(rows: PromoNoteRow[]): string[] {
  const out: string[] = []
  const seen = new Set<number>()
  for (const r of rows) {
    if (!seen.has(r.campaign_id)) {
      seen.add(r.campaign_id)
      const type: DiscountType = r.discount_type ?? 'percent'
      const value = r.discount_value ?? r.discount_percent
      const when = r.end_mode ? ` Berlaku ${windowLabel({ end_mode: r.end_mode, start_at: r.start_at, end_at: r.end_at, status: 'aktif' })}.` : ''
      out.push(`Promo "${r.campaign_name}": diskon ${discountLabel(type, value)}${type === 'nominal' ? ' per pcs' : ''}, ${shareLabel(r.supplier_share)}.${when}`)
      if (r.supplier_note) out.push(`Catatan: ${r.supplier_note}`)
    }
    const costInfo =
      r.promo_cost !== r.original_cost
        ? `harga setoran ${rupiah(r.original_cost)} jadi ${rupiah(r.promo_cost)}`
        : `harga setoran tetap ${rupiah(r.promo_cost)}`
    out.push(`- ${r.product_name}: ${pcs(Number(r.qty))} terjual ${rupiah(r.promo_price)} (normal ${rupiah(r.original_price)}), ${costInfo}.`)
  }
  return out
}

/** Ubah satu baris promo versi lama menjadi bentuk yang sama dengan promo baru. */
export function fromLegacy(c: Partial<PromoCampaign> & { id: number; items: PromoItem[] }): PromoCampaign {
  return {
    name: '',
    discount_percent: 0,
    supplier_share: 0,
    supplier_note: null,
    started_on: '',
    ended_on: null,
    ...c,
    discount_type: 'percent',
    discount_value: c.discount_percent ?? 0,
    status: c.status === 'aktif' ? 'aktif' : 'selesai',
    running: !!c.running,
    legacy: true,
  } as PromoCampaign
}
