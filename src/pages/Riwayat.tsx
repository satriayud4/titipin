import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import SaleDetailModal, { trxLabel } from '../components/SaleDetailModal'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { addDays, monthStart, todayWIB } from '../lib/dates'

type Method = 'tunai' | 'transfer' | 'qris'
type StatusFilter = 'semua' | 'selesai' | 'diubah' | 'dibatalkan'

interface SaleRow {
  id: number
  sale_date: string
  created_at: string
  cashier_name: string | null
  payment_method: Method
  total: number
  item_qty: number
  status: 'selesai' | 'dibatalkan'
  edited: boolean
  can_edit: boolean
}

const METHOD: Record<Method, { label: string; cls: string }> = {
  tunai: { label: 'Tunai', cls: 'badge-success' },
  transfer: { label: 'Transfer', cls: 'badge-info' },
  qris: { label: 'QRIS', cls: 'badge-purple' },
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export default function Riwayat() {
  const notify = useToast()
  const today = todayWIB()
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [rows, setRows] = useState<SaleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [method, setMethod] = useState<'' | Method>('')
  const [status, setStatus] = useState<StatusFilter>('semua')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    if (!from || !to) return
    if (from > to) {
      notify('Tanggal "dari" tidak boleh setelah tanggal "sampai".', 'error')
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase.rpc('list_sales', { p_from: from, p_to: to })
      if (cancelled) return
      if (error) notify(errText(error), 'error')
      else setRows((data ?? []) as SaleRow[])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [from, to, reload, notify])

  const presets = [
    { label: 'Hari ini', from: today, to: today },
    { label: 'Kemarin', from: addDays(today, -1), to: addDays(today, -1) },
    { label: '7 hari', from: addDays(today, -6), to: today },
    { label: 'Bulan ini', from: monthStart(today), to: today },
  ]

  const q = search.trim().toLowerCase()
  const shown = rows.filter((r) => {
    if (method && r.payment_method !== method) return false
    if (status === 'selesai' && r.status !== 'selesai') return false
    if (status === 'dibatalkan' && r.status !== 'dibatalkan') return false
    if (status === 'diubah' && !(r.edited && r.status === 'selesai')) return false
    if (q && !`${trxLabel(r.id)} ${r.cashier_name ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })

  const done = shown.filter((r) => r.status === 'selesai')
  const omzet = done.reduce((n, r) => n + r.total, 0)
  const voided = shown.length - done.length

  const groups: { date: string; rows: SaleRow[] }[] = []
  for (const r of shown) {
    const g = groups[groups.length - 1]
    if (g && g.date === r.sale_date) g.rows.push(r)
    else groups.push({ date: r.sale_date, rows: [r] })
  }

  const statusPills: { key: StatusFilter; label: string }[] = [
    { key: 'semua', label: 'Semua' },
    { key: 'selesai', label: 'Selesai' },
    { key: 'diubah', label: 'Diubah' },
    { key: 'dibatalkan', label: 'Dibatalkan' },
  ]

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader title="Riwayat Transaksi" subtitle="Lihat transaksi, koreksi kalau ada salah catat, atau batalkan. Semua perubahan tercatat." />

      <div className="toolbar">
        <div className="pills">
          {presets.map((p) => (
            <button key={p.label} type="button" className={`pill${from === p.from && to === p.to ? ' on' : ''}`} onClick={() => { setFrom(p.from); setTo(p.to) }}>
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

      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input placeholder="Cari nomor TRX atau kasir…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select value={method} onChange={(e) => setMethod(e.target.value as '' | Method)} aria-label="Filter metode pembayaran">
          <option value="">Semua metode</option>
          <option value="tunai">Tunai</option>
          <option value="transfer">Transfer</option>
          <option value="qris">QRIS</option>
        </select>
        <div className="pills">
          {statusPills.map((p) => (
            <button key={p.key} type="button" className={`pill${status === p.key ? ' on' : ''}`} onClick={() => setStatus(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && rows.length > 0 && (
        <p className="page-sub" style={{ margin: '0 0 4px' }}>
          {done.length} transaksi selesai · omzet <b>{rupiah(omzet)}</b>
          {voided > 0 ? ` · ${voided} dibatalkan` : ''}
        </p>
      )}

      {loading ? (
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 68, borderRadius: 14 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Belum ada transaksi" text="Tidak ada transaksi pada rentang tanggal ini. Coba pilih rentang lain." />
      ) : shown.length === 0 ? (
        <EmptyState title="Tidak ada yang cocok" text="Coba ubah pencarian atau filter." />
      ) : (
        groups.map((g) => {
          const dayDone = g.rows.filter((r) => r.status === 'selesai')
          return (
            <section key={g.date}>
              <div className="day-head">
                <h2>{dayLabel(g.date)}</h2>
                <span className="page-sub">{dayDone.length} transaksi · {rupiah(dayDone.reduce((n, r) => n + r.total, 0))}</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {g.rows.map((r) => (
                  <button key={`${r.id}-${r.status}`} type="button" className={`trx${r.status === 'dibatalkan' ? ' void' : ''}`} onClick={() => setOpenId(r.id)}>
                    <div className="trx-main">
                      <div style={{ fontWeight: 800 }}>{trxLabel(r.id)}</div>
                      <div className="page-sub">{timeOf(r.created_at)} · {r.cashier_name || '-'} · {r.item_qty} item</div>
                    </div>
                    <div className="trx-end">
                      <b style={r.status === 'dibatalkan' ? { textDecoration: 'line-through' } : undefined}>{rupiah(r.total)}</b>
                      <span className="tags" style={{ justifyContent: 'flex-end' }}>
                        <span className={`badge ${METHOD[r.payment_method].cls}`}>{METHOD[r.payment_method].label}</span>
                        {r.status === 'dibatalkan' ? (
                          <span className="badge badge-danger">Dibatalkan</span>
                        ) : (
                          r.edited && <span className="badge badge-warning">Diubah</span>
                        )}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )
        })
      )}

      {openId !== null && (
        <SaleDetailModal saleId={openId} onClose={() => setOpenId(null)} onChanged={() => setReload((n) => n + 1)} />
      )}
    </div>
  )
}