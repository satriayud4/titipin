import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { rupiah } from '../lib/format'
import { discountLabel, shareLabel, shortDate, type DiscountType } from '../lib/promo'

interface Row {
  id: number
  name: string
  discount_percent: number
  discount_type?: DiscountType
  discount_value?: number
  supplier_share: number
  started_on: string
  qty: number
  revenue: number
  discount: number
  supplier_absorb: number
  store_absorb: number
}
interface Report {
  summary: { campaigns: number; qty: number; revenue: number; discount: number; supplier_absorb: number; store_absorb: number }
  rows: Row[]
}

/** Ringkasan penjualan promo expired pada periode laporan. Tidak tampil bila SQL promo belum dijalankan. */
export default function PromoReport({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Report | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // promo baru dan promo lama digabung; salah satunya boleh belum dipasang
      const [a, b] = await Promise.all([
        supabase.rpc('promo_rule_report', { p_from: from, p_to: to }),
        supabase.rpc('promo_report', { p_from: from, p_to: to }),
      ])
      if (cancelled) return
      const parts = [a, b].filter((x) => !x.error && x.data).map((x) => x.data as Report)
      if (parts.length === 0) return setData(null)
      const sum = (k: keyof Report['summary']) => parts.reduce((n, p) => n + Number(p.summary[k] ?? 0), 0)
      setData({
        summary: {
          campaigns: sum('campaigns'),
          qty: sum('qty'),
          revenue: sum('revenue'),
          discount: sum('discount'),
          supplier_absorb: sum('supplier_absorb'),
          store_absorb: sum('store_absorb'),
        },
        rows: parts.flatMap((p) => p.rows).sort((x, y) => (y.started_on > x.started_on ? 1 : y.started_on < x.started_on ? -1 : 0)),
      })
    })()
    return () => {
      cancelled = true
    }
  }, [from, to])

  if (!data) return null
  const s = data.summary

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Promo & diskon</h2>
          <div className="panel-sub">Penjualan dengan potongan harga pada periode ini.</div>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <div className="empty">Belum ada penjualan promo pada periode ini.</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi"><div className="kpi-top"><span>Terjual promo</span></div><div className="kpi-value">{s.qty} pcs</div></div>
            <div className="kpi"><div className="kpi-top"><span>Omzet promo</span></div><div className="kpi-value">{rupiah(s.revenue)}</div></div>
            <div className="kpi"><div className="kpi-top"><span>Total potongan</span></div><div className="kpi-value">{rupiah(s.discount)}</div></div>
            <div className="kpi"><div className="kpi-top"><span>Ditanggung toko</span></div><div className="kpi-value">{rupiah(s.store_absorb)}</div></div>
            <div className="kpi"><div className="kpi-top"><span>Ditanggung supplier</span></div><div className="kpi-value">{rupiah(s.supplier_absorb)}</div></div>
          </div>

          <div className="table-wrap">
            <table className="tbl" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Promo</th>
                  <th className="num">Diskon</th>
                  <th className="num">Terjual</th>
                  <th className="num">Omzet</th>
                  <th className="num">Potongan</th>
                  <th className="num">Toko</th>
                  <th className="num">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td>
                      {r.name}
                      <div className="page-sub">mulai {shortDate(r.started_on)} · {shareLabel(r.supplier_share)}</div>
                    </td>
                    <td className="num">{discountLabel(r.discount_type ?? 'percent', r.discount_value ?? r.discount_percent)}</td>
                    <td className="num">{r.qty}</td>
                    <td className="num">{rupiah(r.revenue)}</td>
                    <td className="num">{rupiah(r.discount)}</td>
                    <td className="num">{rupiah(r.store_absorb)}</td>
                    <td className="num">{rupiah(r.supplier_absorb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="page-sub" style={{ margin: '10px 0 0' }}>
            Angka omzet, modal, dan laba di atas sudah memakai harga promo. Potongan yang ditanggung toko otomatis mengurangi laba.
          </p>
        </>
      )}
    </section>
  )
}
