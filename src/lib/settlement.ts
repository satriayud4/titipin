import { supabase } from './supabase'
import { addDays } from './dates'

/** Satu baris laporan setoran dari database (per supplier, per hari). */
export interface SettleBase {
  supplier_id: number
  supplier_name: string
  sold_qty: number
  sold_cost: number
  rusak_qty: number
  rusak_cost: number
  total_payable: number
  total_paid: number
}

export interface SettleDay {
  date: string
  payable: number
  paid: number
  sold: number
}

/** Tagihan satu supplier yang dijumlahkan selama satu periode, lengkap dengan rinciannya per hari. */
export interface Settlement extends SettleBase {
  days: SettleDay[]
}

export const MAX_DAYS = 92

export const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * Jumlahkan laporan setoran harian selama satu periode. Setoran tidak harus dibayar tiap hari:
 * tagihan menumpuk per supplier dan bisa dibayar kapan saja.
 */
export async function fetchSettlement(from: string, to: string) {
  const days = daysBetween(from, to)
  const map = new Map<number, Settlement>()
  let error: { message?: string; code?: string } | null = null

  for (let i = 0; i < days.length; i += 8) {
    const chunk = days.slice(i, i + 8)
    const res = await Promise.all(chunk.map((d) => supabase.rpc('supplier_settlement_report', { p_date: d })))
    res.forEach((r, j) => {
      if (r.error) {
        error = error ?? r.error
        return
      }
      for (const x of (r.data ?? []) as SettleBase[]) {
        const cur =
          map.get(x.supplier_id) ??
          ({ supplier_id: x.supplier_id, supplier_name: x.supplier_name, sold_qty: 0, sold_cost: 0, rusak_qty: 0, rusak_cost: 0, total_payable: 0, total_paid: 0, days: [] } as Settlement)
        cur.sold_qty += Number(x.sold_qty) || 0
        cur.sold_cost += Number(x.sold_cost) || 0
        cur.rusak_qty += Number(x.rusak_qty) || 0
        cur.rusak_cost += Number(x.rusak_cost) || 0
        cur.total_payable += Number(x.total_payable) || 0
        cur.total_paid += Number(x.total_paid) || 0
        cur.days.push({ date: chunk[j], payable: Number(x.total_payable) || 0, paid: Number(x.total_paid) || 0, sold: Number(x.sold_qty) || 0 })
        map.set(x.supplier_id, cur)
      }
    })
  }

  const data = [...map.values()]
    .map((s) => ({ ...s, days: s.days.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name))
  return { data, error }
}

/**
 * Bagi satu pembayaran ke hari-hari yang masih punya sisa tagihan, dari yang paling lama.
 * Kelebihan bayar ditaruh di hari terakhir yang punya tagihan.
 */
export function allocatePayment(days: SettleDay[], amount: number, fallbackDate: string) {
  const out: { date: string; amount: number }[] = []
  let left = amount
  for (const d of days) {
    const due = Math.max(d.payable - d.paid, 0)
    if (due > 0 && left > 0) {
      const a = Math.min(due, left)
      out.push({ date: d.date, amount: a })
      left -= a
    }
  }
  if (left > 0) {
    const last = [...days].reverse().find((d) => d.payable > 0)?.date ?? fallbackDate
    const ex = out.find((o) => o.date === last)
    if (ex) ex.amount += left
    else out.push({ date: last, amount: left })
  }
  return out
}
