import { supabase } from './supabase'
import { todayWIB } from './dates'
import { rupiah } from './format'

export interface SaleLine {
  batch_id: number
  name: string
  qty: number
  price: number
}

const MAX_RUPIAH = 1_000_000_000
const isInt = (n: number) => Number.isFinite(n) && Number.isInteger(n)

/** Pemeriksaan nominal dan jumlah di sisi klien sebelum transaksi dikirim. Mengembalikan daftar masalah (kosong = lolos). */
export function validateSaleInput(lines: SaleLine[], method: string, cash: number | null, total: number): string[] {
  const errs: string[] = []
  if (lines.length === 0) errs.push('Keranjang masih kosong.')
  for (const l of lines) {
    if (!isInt(l.qty) || l.qty < 1) errs.push(`Jumlah ${l.name} harus bilangan bulat minimal 1.`)
    if (!isInt(l.price) || l.price < 0) errs.push(`Harga ${l.name} tidak valid.`)
  }
  if (!isInt(total) || total <= 0) errs.push('Total transaksi harus lebih dari Rp 0.')
  else if (total > MAX_RUPIAH) errs.push(`Total transaksi terlalu besar (maksimal ${rupiah(MAX_RUPIAH)}). Periksa kembali jumlah barang.`)
  if (method === 'tunai') {
    if (cash === null || !isInt(cash) || cash < 0) errs.push('Nominal uang diterima tidak valid.')
    else if (cash < total) errs.push(`Uang diterima kurang ${rupiah(total - cash)} dari total.`)
    else if (cash > MAX_RUPIAH) errs.push('Nominal uang diterima terlalu besar.')
  }
  return errs
}

/**
 * Cek ulang ke server tepat sebelum bayar: stok masih cukup, belum expired, dan harga belum berubah
 * (mis. promo baru mulai atau berakhir). Stok bisa berubah karena kasir lain menjual barang yang sama.
 */
export async function checkFreshStock(lines: SaleLine[]): Promise<string[]> {
  if (lines.length === 0) return []
  const ids = lines.map((l) => l.batch_id)
  const { data, error } = await supabase.from('batch_stock').select('batch_id, qty_remaining, sellable_until, sell_price').in('batch_id', ids)
  if (error) return [] // gagal membaca: biarkan server yang memutuskan
  const m = new Map((data ?? []).map((r) => [r.batch_id as number, r as { qty_remaining: number; sellable_until: string; sell_price: number }]))
  const today = todayWIB()
  const errs: string[] = []
  for (const l of lines) {
    const r = m.get(l.batch_id)
    if (!r) errs.push(`${l.name} tidak ditemukan lagi di stok.`)
    else if (r.sellable_until < today) errs.push(`${l.name} sudah expired dan tidak bisa dijual.`)
    else if (r.qty_remaining < l.qty) errs.push(`Stok ${l.name} tinggal ${r.qty_remaining}, di keranjang ${l.qty}.`)
    else if (Number(r.sell_price) !== l.price) errs.push(`Harga ${l.name} berubah menjadi ${rupiah(Number(r.sell_price))}.`)
  }
  return errs
}
