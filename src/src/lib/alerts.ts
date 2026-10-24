import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { addDays, todayWIB } from './dates'
import { rupiah } from './format'
import { ORDER_SOURCE, nowWIB, orderUrgency, urgencyTone, type OrderRow } from './kalender'

export interface AlertItem {
  id: string
  kind: 'danger' | 'warning' | 'info'
  title: string
  detail: string
  to: string
}

/** Kirim event ini (window.dispatchEvent) supaya lonceng notifikasi langsung memuat ulang. */
export const ALERTS_REFRESH_EVENT = 'saraga:alerts-refresh'
const RECHECK_MS = 5 * 60 * 1000 // periksa ulang tiap 5 menit agar pesanan mepet tidak terlewat

export const LOW_STOCK = 3 // sisa stok sebanyak ini atau kurang dianggap menipis

interface BatchLite {
  product_id: number
  qty_remaining: number
  received_date: string
  sellable_until: string
  return_due_date: string
}
interface SettleRow {
  total_payable: number
  total_paid: number
}

export function useAlerts(refreshKey: string) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    const id = window.setInterval(bump, RECHECK_MS)
    window.addEventListener(ALERTS_REFRESH_EVENT, bump)
    return () => {
      window.clearInterval(id)
      window.removeEventListener(ALERTS_REFRESH_EVENT, bump)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const today = todayWIB()
      const [b, p, s, o] = await Promise.all([
        supabase
          .from('batch_stock')
          .select('product_id, qty_remaining, received_date, sellable_until, return_due_date')
          .gt('qty_remaining', 0),
        supabase.from('products').select('id, name'),
        supabase.rpc('supplier_settlement_report', { p_date: addDays(today, -1) }),
        supabase
          .from('scheduled_orders')
          .select('id, title, party, due_date, due_time, status')
          .eq('source', ORDER_SOURCE)
          .in('status', ['pending', 'processing'])
          .lte('due_date', addDays(today, 1)),
      ])
      if (cancelled || b.error) return

      const names = new Map((p.data ?? []).map((x) => [x.id as number, x.name as string]))
      const rows = (b.data ?? []) as BatchLite[]
      const list: AlertItem[] = []

      // stok menipis (barang yang masih boleh dijual hari ini)
      rows
        .filter((x) => x.received_date <= today && x.sellable_until >= today && x.qty_remaining <= LOW_STOCK)
        .slice(0, 5)
        .forEach((x, i) =>
          list.push({
            id: `low-${i}`,
            kind: 'warning',
            title: `Stok ${names.get(x.product_id) ?? 'produk'} menipis`,
            detail: `Tersisa ${x.qty_remaining} pcs`,
            to: '/stok',
          }),
        )

      // barang yang perlu diretur
      const waiting = rows.filter((x) => x.sellable_until < today)
      if (waiting.length > 0) {
        const late = waiting.filter((x) => x.return_due_date < today).length
        const qty = waiting.reduce((n, x) => n + x.qty_remaining, 0)
        list.push({
          id: 'retur',
          kind: late > 0 ? 'danger' : 'warning',
          title: `${qty} barang perlu diretur`,
          detail: late > 0 ? `${late} stok sudah lewat batas retur` : 'Batas retur jatuh hari ini',
          to: '/retur',
        })
      }

      // setoran kemarin yang belum lunas
      if (!s.error) {
        const settle = (s.data ?? []) as SettleRow[]
        const unpaid = settle.reduce((n, x) => n + Math.max(x.total_payable - x.total_paid, 0), 0)
        const count = settle.filter((x) => x.total_payable > x.total_paid).length
        if (unpaid > 0) {
          list.push({
            id: 'setoran',
            kind: 'danger',
            title: 'Setoran kemarin belum lunas',
            detail: `${rupiah(unpaid)} · ${count} supplier`,
            to: '/setoran',
          })
        }
      }

      // pesanan yang tenggatnya mepet (tabel kalender belum dibuat → dilewati begitu saja)
      if (!o.error) {
        const now = nowWIB()
        ;((o.data ?? []) as Pick<OrderRow, 'id' | 'title' | 'party' | 'due_date' | 'due_time' | 'status'>[])
          .map((x) => ({ x, u: orderUrgency(x, now) }))
          .filter(({ u }) => u.level !== 'later' && u.level !== 'none')
          .sort((a, b) => a.x.due_date.localeCompare(b.x.due_date) || (a.x.due_time ?? '').localeCompare(b.x.due_time ?? ''))
          .slice(0, 6)
          .forEach(({ x, u }) => {
            const tone = urgencyTone(u.level)
            list.push({
              id: `order-${x.id}`,
              kind: tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'info',
              title: `Pesanan ${x.title}`,
              detail: x.party ? `${u.label} · ${x.party}` : u.label,
              to: `/kalender?tanggal=${x.due_date}`,
            })
          })
      }

      const order = { danger: 0, warning: 1, info: 2 }
      list.sort((x, y) => order[x.kind] - order[y.kind])
      if (!cancelled) setAlerts(list)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey, tick])

  return alerts
}