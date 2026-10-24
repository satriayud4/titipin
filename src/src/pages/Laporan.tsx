import { useEffect, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useToast } from '../components/Toast'
import BarList from '../components/BarList'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { addDays, monthStart, prevMonth, shortDay, todayWIB } from '../lib/dates'
import { fetchReport, profit, type ReportData } from '../lib/report'
import { csvBlob, downloadBlob, printInLightMode, reportCsv } from '../lib/export'
import { useStore } from '../store/StoreContext'

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-top"><span>{label}</span></div>
      <div className="kpi-value" style={{ color }}>{value}</div>
    </div>
  )
}

export default function Laporan() {
  const notify = useToast()
  const store = useStore()
  const today = todayWIB()
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!from || !to) return
    if (from > to) {
      notify('Tanggal "dari" tidak boleh setelah tanggal "sampai".', 'error')
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const d = await fetchReport(from, to)
        if (!cancelled) setData(d)
      } catch (err) {
        notify(errText(err), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [from, to, notify])

  const presets = [
    { label: 'Hari ini', from: today, to: today },
    { label: 'Kemarin', from: addDays(today, -1), to: addDays(today, -1) },
    { label: '7 hari', from: addDays(today, -6), to: today },
    { label: 'Bulan ini', from: monthStart(today), to: today },
    { label: 'Bulan lalu', ...prevMonth(today) },
  ]

  const s = data?.summary
  const gross = s ? s.omzet - s.cogs : 0
  const net = s ? profit(s) : 0
  const margin = s && s.omzet > 0 ? (net / s.omzet) * 100 : 0
  const avg = s && s.transactions > 0 ? Math.round(s.omzet / s.transactions) : 0
  const empty = !!s && s.transactions === 0 && s.rusak_cost === 0

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader
        title="Laporan Penjualan"
        subtitle="Omzet, laba, dan margin berdasarkan rentang tanggal."
        actions={
          <div className="no-print head-actions">
            <button
              className="btn-icon"
              disabled={!data}
              onClick={() => data && downloadBlob(csvBlob(reportCsv(data, from, to, store.name)), `laporan-${from}_sd_${to}.csv`)}
            >
              <Download size={18} /> Unduh CSV
            </button>
            <button className="btn-icon" disabled={!data} onClick={printInLightMode}>
              <Printer size={18} /> Cetak / PDF
            </button>
          </div>
        }
      />

      <div className="print-only">
        <h2>{store.name} · Laporan Penjualan</h2>
        <div>Periode {from} s/d {to}</div>
      </div>

      <div className="toolbar no-print">
        <div className="pills">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`pill${from === p.from && to === p.to ? ' on' : ''}`}
              onClick={() => {
                setFrom(p.from)
                setTo(p.to)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Dari <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Sampai <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {loading && !data && <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />}

      {data && s && (
        <div style={{ display: 'grid', gap: 16, opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          {empty ? (
            <EmptyState title="Belum ada penjualan" text="Tidak ada transaksi pada rentang tanggal ini. Coba pilih rentang lain." />
          ) : (
            <>
              <div className="kpi-grid" style={{ margin: 0 }}>
                <Stat label="Omzet (total penjualan)" value={rupiah(s.omzet)} />
                <Stat label="Modal barang terjual" value={rupiah(s.cogs)} />
                <Stat label="Laba kotor" value={rupiah(gross)} />
                <Stat label="Rugi barang rusak (ditanggung toko)" value={rupiah(s.rusak_cost)} color={s.rusak_cost > 0 ? 'var(--danger)' : undefined} />
                <Stat label="Laba bersih (estimasi)" value={rupiah(net)} color={net >= 0 ? 'var(--success)' : 'var(--danger)'} />
                <Stat label="Margin" value={`${margin.toFixed(1).replace('.', ',')}%`} />
              </div>

              <div className="kpi-grid" style={{ margin: 0 }}>
                <Stat label="Jumlah transaksi" value={String(s.transactions)} />
                <Stat label="Barang terjual" value={String(s.items_sold)} />
                <Stat label="Rata-rata per transaksi" value={rupiah(avg)} />
              </div>

              <section className="panel">
                <h2>Metode pembayaran</h2>
                <div className="mini-stats">
                  <div className="mini"><span>Tunai</span><b>{rupiah(s.tunai)}</b></div>
                  <div className="mini"><span>Transfer</span><b>{rupiah(s.transfer)}</b></div>
                  <div className="mini"><span>QRIS</span><b>{rupiah(s.qris)}</b></div>
                </div>
              </section>

              <section className="panel">
                <h2>Penjualan per hari</h2>
                <BarList rows={data.daily.map((d) => ({ label: shortDay(d.day), value: d.omzet }))} />
              </section>

              <section className="panel">
                <h2>Per supplier</h2>
                {data.suppliers.length === 0 ? (
                  <div className="empty">Belum ada data.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="tbl" style={{ minWidth: 520 }}>
                      <thead>
                        <tr>
                          <th>Supplier</th>
                          <th className="num">Terjual</th>
                          <th className="num">Omzet</th>
                          <th className="num">Modal (setoran)</th>
                          <th className="num">Laba</th>
                          <th className="num">Rusak toko</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.suppliers.map((r) => (
                          <tr key={r.name}>
                            <td>{r.name}</td>
                            <td className="num">{r.qty}</td>
                            <td className="num">{rupiah(r.omzet)}</td>
                            <td className="num">{rupiah(r.cogs)}</td>
                            <td className="num">{rupiah(r.omzet - r.cogs)}</td>
                            <td className="num">{r.rusak_cost > 0 ? rupiah(r.rusak_cost) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="panel">
                <h2>Produk terlaris (20 teratas)</h2>
                {data.products.length === 0 ? (
                  <div className="empty">Belum ada data.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="tbl" style={{ minWidth: 400 }}>
                      <thead>
                        <tr>
                          <th>Produk</th>
                          <th className="num">Terjual</th>
                          <th className="num">Omzet</th>
                          <th className="num">Laba</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.products.map((r) => (
                          <tr key={r.name}>
                            <td>{r.name}</td>
                            <td className="num">{r.qty}</td>
                            <td className="num">{rupiah(r.omzet)}</td>
                            <td className="num">{rupiah(r.omzet - r.cogs)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <p className="page-sub" style={{ margin: 0 }}>
                Laba bersih = omzet − modal barang terjual − rugi barang rusak yang ditanggung toko. Barang yang diretur
                ke supplier tidak dihitung karena tidak dibayar. Angka laba bersifat estimasi.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}