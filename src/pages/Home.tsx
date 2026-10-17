import { useEffect, useState, type ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  HandCoins,
  Info,
  ShoppingBag,
  TrendingUp,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import SalesChart from '../components/SalesChart'
import { ShopScene } from '../components/Illustration'
import { supabase } from '../lib/supabase'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { addDays, todayWIB } from '../lib/dates'
import { imageUrl } from '../lib/image'
import { fetchReport, profit, type DayRow, type ProductRow } from '../lib/report'
import { LOW_STOCK, type AlertItem } from '../lib/alerts'

type Tone = 'green' | 'purple' | 'orange' | 'blue' | 'red'
type Method = 'tunai' | 'transfer' | 'qris'

interface SettleRow {
  supplier_id: number
  supplier_name: string
  sold_qty: number
  total_payable: number
  total_paid: number
}
interface RecentSale {
  id: number
  created_at: string
  item_qty: number
  total: number
  payment_method: Method
  cashier_name: string | null
}

const METHOD: Record<Method, { label: string; cls: string }> = {
  tunai: { label: 'Tunai', cls: 'badge-success' },
  transfer: { label: 'Transfer', cls: 'badge-info' },
  qris: { label: 'QRIS', cls: 'badge-purple' },
}

const saleTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev <= 0) return <span>Belum ada data kemarin</span>
  const pct = Math.round(((now - prev) / prev) * 100)
  if (pct === 0) return <span>Sama dengan kemarin</span>
  return (
    <>
      <span className={pct > 0 ? 'delta-up' : 'delta-down'}>
        {pct > 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
        {Math.abs(pct)}%
      </span>
      <span>dari kemarin</span>
    </>
  )
}

function Kpi({ tone, icon: Icon, label, value, loading, children }: { tone: Tone; icon: LucideIcon; label: string; value: string; loading: boolean; children: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className={`kpi-ico tone-${tone}`}><Icon size={19} /></span>
        <span>{label}</span>
      </div>
      <div className="kpi-value">{loading ? <div className="skeleton" style={{ height: 26, width: '70%' }} /> : value}</div>
      <div className="kpi-sub">{loading ? <div className="skeleton" style={{ height: 12, width: '50%' }} /> : children}</div>
      <Icon className={`kpi-deco deco-${tone}`} size={72} />
    </div>
  )
}

const alertIcon = (k: AlertItem['kind']) =>
  k === 'danger' ? <CircleAlert size={18} /> : k === 'warning' ? <TriangleAlert size={18} /> : <Info size={18} />

function settleBadge(r: SettleRow) {
  if (r.total_paid === 0) return <span className="badge badge-danger">Belum dibayar</span>
  if (r.total_paid < r.total_payable) return <span className="badge badge-warning">Kurang</span>
  return <span className="badge badge-success">Lunas</span>
}

export default function Home() {
  const { profile } = useAuth()
  const notify = useToast()
  const { alerts } = useOutletContext<{ alerts: AlertItem[] }>()

  const [loading, setLoading] = useState(true)
  const [daily, setDaily] = useState<DayRow[]>([])
  const [top, setTop] = useState<ProductRow[]>([])
  const [images, setImages] = useState<Map<string, string>>(new Map())
  const [stockTypes, setStockTypes] = useState(0)
  const [lowCount, setLowCount] = useState(0)
  const [settle, setSettle] = useState<SettleRow[]>([])
  const [recent, setRecent] = useState<RecentSale[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const t = todayWIB()
      try {
        const [rep, stock, settleRes, recentRes, prod] = await Promise.all([
          fetchReport(addDays(t, -6), t),
          supabase.from('batch_stock').select('product_id, qty_remaining').gt('qty_remaining', 0).lte('received_date', t).gte('sellable_until', t),
          supabase.rpc('supplier_settlement_report', { p_date: t }),
          supabase.rpc('recent_sales', { p_limit: 5 }),
          supabase.from('products').select('name, image_path'),
        ])
        if (stock.error) throw stock.error
        if (settleRes.error) throw settleRes.error
        if (recentRes.error) throw recentRes.error
        if (cancelled) return

        const byProduct = new Map<number, number>()
        for (const x of (stock.data ?? []) as { product_id: number; qty_remaining: number }[]) {
          byProduct.set(x.product_id, (byProduct.get(x.product_id) ?? 0) + x.qty_remaining)
        }

        setDaily(rep.daily)
        setTop(rep.products.slice(0, 5))
        setImages(
          new Map(
            ((prod.data ?? []) as { name: string; image_path: string | null }[])
              .filter((x) => x.image_path)
              .map((x) => [x.name, x.image_path as string]),
          ),
        )
        setStockTypes(byProduct.size)
        setLowCount([...byProduct.values()].filter((q) => q <= LOW_STOCK).length)
        setSettle((settleRes.data ?? []) as SettleRow[])
        setRecent((recentRes.data ?? []) as RecentSale[])
      } catch (err) {
        notify(errText(err), 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [notify])

  const today = daily.length > 0 ? daily[daily.length - 1] : null
  const yesterday = daily.length > 1 ? daily[daily.length - 2] : null
  const first = (profile?.full_name || '').trim().split(' ')[0]
  const dateLabel = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const unpaid = settle.reduce((n, r) => n + Math.max(r.total_payable - r.total_paid, 0), 0)
  const unpaidCount = settle.filter((r) => r.total_payable > r.total_paid).length
  const totalPayable = settle.reduce((n, r) => n + r.total_payable, 0)
  const maxQty = Math.max(1, ...top.map((p) => p.qty))
  const hasSales = daily.some((d) => d.omzet > 0)
  const better = !!today && !!yesterday && today.omzet > yesterday.omzet
  const settleRows = [...settle].sort((a, b) => b.total_payable - b.total_paid - (a.total_payable - a.total_paid)).slice(0, 4)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Selamat datang kembali{first ? `, ${first}` : ''}. Berikut ringkasan aktivitas toko hari ini.
          </p>
        </div>
        <span className="chip"><CalendarDays size={16} /> {dateLabel}</span>
      </div>

      <div className="kpi-grid">
        <Kpi tone="green" icon={Wallet} label="Penjualan Hari Ini" value={rupiah(today?.omzet ?? 0)} loading={loading}>
          <Delta now={today?.omzet ?? 0} prev={yesterday?.omzet ?? 0} />
        </Kpi>
        <Kpi tone="purple" icon={ShoppingBag} label="Jumlah Transaksi" value={String(today?.transactions ?? 0)} loading={loading}>
          <Delta now={today?.transactions ?? 0} prev={yesterday?.transactions ?? 0} />
        </Kpi>
        <Kpi tone="orange" icon={TrendingUp} label="Laba (estimasi)" value={rupiah(today ? profit(today) : 0)} loading={loading}>
          <Delta now={today ? profit(today) : 0} prev={yesterday ? profit(yesterday) : 0} />
        </Kpi>
        <Kpi tone="blue" icon={Boxes} label="Stok Siap Dijual" value={`${stockTypes} jenis`} loading={loading}>
          <span>{stockTypes === 0 ? 'Belum ada stok hari ini' : lowCount > 0 ? `${lowCount} produk menipis` : 'Semua stok aman'}</span>
        </Kpi>
        <Kpi tone="red" icon={HandCoins} label="Setoran Belum Dibayar" value={rupiah(unpaid)} loading={loading}>
          <span>{totalPayable === 0 ? 'Belum ada tagihan hari ini' : unpaid === 0 ? 'Semua sudah lunas' : `${unpaidCount} supplier`}</span>
        </Kpi>
      </div>

      <div className="dash-grid">
        <section className="panel" style={{ gridArea: 'chart' }}>
          <div className="panel-head">
            <div>
              <h2>Grafik Penjualan</h2>
              <div className="panel-sub">7 hari terakhir</div>
            </div>
            <div className="legend">
              <span><i style={{ background: 'var(--primary)' }} />Penjualan (Rp)</span>
              <span><i style={{ background: 'var(--purple)' }} />Jumlah transaksi</span>
            </div>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 260 }} />
          ) : hasSales ? (
            <SalesChart data={daily} />
          ) : (
            <div className="empty">Belum ada penjualan dalam 7 hari terakhir.</div>
          )}
        </section>

        <section className="panel" style={{ gridArea: 'top' }}>
          <div className="panel-head">
            <div>
              <h2>Produk Terlaris</h2>
              <div className="panel-sub">Berdasarkan jumlah terjual, 7 hari terakhir</div>
            </div>
            <Link className="link-more" to="/laporan">Laporan <ChevronRight size={14} /></Link>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : top.length === 0 ? (
            <div className="empty">Belum ada penjualan.</div>
          ) : (
            top.map((p, i) => {
              const img = images.get(p.name)
              return (
                <div className="rank" key={p.name}>
                  <span className="rank-no">{i + 1}</span>
                  {img ? <img className="rank-img" src={imageUrl(img)} alt="" loading="lazy" /> : <div className="rank-img" />}
                  <div className="rank-body">
                    <div className="rank-name">{p.name}</div>
                    <div className="panel-sub">{p.qty} pcs</div>
                    <div className="bar"><i style={{ width: `${(p.qty / maxQty) * 100}%` }} /></div>
                  </div>
                </div>
              )
            })
          )}
        </section>

        <div className="side" style={{ gridArea: 'side' }}>
          <section className="panel hero">
            <ShopScene />
            <h3>Semangat hari ini!</h3>
            <div className="panel-sub">
              {better ? 'Penjualan hari ini lebih tinggi dari kemarin. Pertahankan!' : 'Setiap kue yang terjual adalah langkah kecil menuju mimpi besar.'}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Notifikasi Penting</h2>
              {alerts.length > 0 && <span className="badge badge-danger">{alerts.length}</span>}
            </div>
            {alerts.length === 0 && <div className="empty" style={{ padding: '16px 8px' }}>Semua beres. Tidak ada yang perlu ditindaklanjuti.</div>}
            {alerts.slice(0, 4).map((a) => (
              <Link key={a.id} to={a.to} className="alert-item">
                <span className={`alert-ico ${a.kind}`}>{alertIcon(a.kind)}</span>
                <span>
                  <strong>{a.title}</strong>
                  <small>{a.detail}</small>
                </span>
              </Link>
            ))}
            {alerts.length > 4 && <div className="panel-sub" style={{ padding: '6px 10px' }}>+{alerts.length - 4} notifikasi lainnya di lonceng</div>}
          </section>
        </div>

        <section className="panel" style={{ gridArea: 'trx' }}>
          <div className="panel-head">
            <div>
              <h2>Transaksi Terbaru</h2>
              <div className="panel-sub">5 transaksi terakhir</div>
            </div>
            <Link className="link-more" to="/kasir">Kasir <ChevronRight size={14} /></Link>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 180 }} />
          ) : recent.length === 0 ? (
            <div className="empty">Belum ada transaksi.</div>
          ) : (
            recent.map((r) => (
              <div className="list-row" key={r.id}>
                <div className="list-main">
                  <div className="list-title">TRX-{String(r.id).padStart(3, '0')}</div>
                  <div className="panel-sub">{saleTime(r.created_at)} · {r.cashier_name || '-'}</div>
                </div>
                <div className="panel-sub">{r.item_qty} item</div>
                <div className="list-end">
                  <strong>{rupiah(r.total)}</strong>
                  <span className={`badge ${METHOD[r.payment_method].cls}`}>{METHOD[r.payment_method].label}</span>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="panel" style={{ gridArea: 'setor' }}>
          <div className="panel-head">
            <div>
              <h2>Setoran Supplier</h2>
              <div className="panel-sub">Tagihan hari ini</div>
            </div>
            <Link className="link-more" to="/setoran">Lihat semua <ChevronRight size={14} /></Link>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 180 }} />
          ) : settleRows.length === 0 ? (
            <div className="empty">Belum ada tagihan hari ini.</div>
          ) : (
            settleRows.map((r) => (
              <div className="list-row" key={r.supplier_id}>
                <div className="list-main">
                  <div className="list-title">{r.supplier_name}</div>
                  <div className="panel-sub">{r.sold_qty} barang terjual</div>
                </div>
                <div className="list-end">
                  <strong>{rupiah(Math.max(r.total_payable - r.total_paid, 0))}</strong>
                  {settleBadge(r)}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  )
}