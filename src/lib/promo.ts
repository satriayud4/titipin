import { rupiah } from './format'

/** Satu barang di dalam sebuah promo (hasil fungsi promo_list). */
export interface PromoItem {
  batch_id: number
  product_name: string
  supplier_name: string
  original_price: number
  promo_price: number
  original_cost: number
  promo_cost: number
  qty_at_start: number
  qty_sold: number
  qty_remaining: number
  active: boolean
}

export interface PromoCampaign {
  id: number
  name: string
  discount_percent: number
  supplier_share: number
  supplier_note: string | null
  status: 'aktif' | 'selesai'
  started_on: string
  ended_on: string | null
  running: boolean
  items: PromoItem[]
}

/** Baris hasil fungsi supplier_promo_notes: penjualan promo satu supplier pada satu tanggal. */
export interface PromoNoteRow {
  campaign_id: number
  campaign_name: string
  supplier_note: string | null
  discount_percent: number
  supplier_share: number
  product_name: string
  qty: number
  original_price: number
  promo_price: number
  original_cost: number
  promo_cost: number
}

export const PROMO_SQL_FILE = 'supabase/4-promo-expired.sql'

/** Kode error "fungsi/tabel belum ada" dari Supabase, artinya SQL promo belum dijalankan. */
export const isMissingSetup = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (['PGRST205', 'PGRST202', '42P01', '42703', '42883'].includes(e.code ?? '') || !!e.message?.includes('schema cache'))

/**
 * Harga promo. Dibulatkan ke Rp100 terdekat dan selalu lebih murah dari harga normal.
 * Rumusnya sama dengan fungsi promo_start di database.
 */
export function promoPrice(price: number, percent: number) {
  let v = Math.round((price * (100 - percent)) / 10000) * 100
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
      out.push(`Promo "${r.campaign_name}": diskon ${r.discount_percent}%, ${shareLabel(r.supplier_share)}.`)
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
