import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BadgePercent, Info, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { addDays, todayWIB } from '../lib/dates'
import { ALERTS_REFRESH_EVENT } from '../lib/alerts'
import {
  PROMO_SQL_FILE,
  SHARE_OPTIONS,
  isMissingSetup,
  promoCost,
  promoPrice,
  shareLabel,
  shortDate,
  type PromoCampaign,
} from '../lib/promo'
import './Promo.css'

interface BatchRow {
  batch_id: number
  supplier_id: number
  product_id: number
  qty_remaining: number
  cost_price: number
  sell_price: number
  received_date: string
  sellable_until: string
}

const WINDOWS = [
  { days: 0, label: 'Hari ini' },
  { days: 1, label: 'Sampai besok' },
  { days: 3, label: '3 hari' },
  { days: 7, label: '7 hari' },
]
const QUICK = [10, 20, 30, 40, 50]

function expiredLabel(date: string, today: string) {
  if (date === today) return 'Expired hari ini'
  if (date === addDays(today, 1)) return 'Expired besok'
  return `Expired ${shortDate(date)}`
}

function totals(c: PromoCampaign) {
  let sold = 0
  let revenue = 0
  let discount = 0
  let supplier = 0
  let left = 0
  for (const i of c.items) {
    sold += i.qty_sold
    revenue += i.qty_sold * i.promo_price
    discount += i.qty_sold * (i.original_price - i.promo_price)
    supplier += i.qty_sold * (i.original_cost - i.promo_cost)
    if (i.active) left += i.qty_remaining
  }
  return { sold, revenue, discount, supplier, store: discount - supplier, left }
}

export default function Promo() {
  const notify = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || !!profile?.is_superadmin
  const today = todayWIB()

  const [batches, setBatches] = useState<BatchRow[]>([])
  const [products, setProducts] = useState<Map<number, string>>(new Map())
  const [suppliers, setSuppliers] = useState<Map<number, string>>(new Map())
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [busy, setBusy] = useState(false)

  const [windowDays, setWindowDays] = useState(1)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [percent, setPercent] = useState('30')
  const [share, setShare] = useState(0)
  const [name, setName] = useState(`Promo expired ${shortDate(today)}`)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const t = todayWIB()
    const [b, p, s, c] = await Promise.all([
      supabase
        .from('batch_stock')
        .select('batch_id, supplier_id, product_id, qty_remaining, cost_price, sell_price, received_date, sellable_until')
        .gt('qty_remaining', 0)
        .lte('received_date', t)
        .gte('sellable_until', t)
        .order('sellable_until'),
      supabase.from('products').select('id, name'),
      supabase.from('suppliers').select('id, name'),
      supabase.rpc('promo_list'),
    ])
    if (c.error) {
      if (isMissingSetup(c.error)) setSetupNeeded(true)
      else notify(errText(c.error), 'error')
      setLoading(false)
      return
    }
    if (b.error) notify(errText(b.error), 'error')
    setSetupNeeded(false)
    setBatches((b.data ?? []) as BatchRow[])
    setProducts(new Map((p.data ?? []).map((x) => [x.id as number, x.name as string])))
    setSuppliers(new Map((s.data ?? []).map((x) => [x.id as number, x.name as string])))
    setCampaigns((c.data ?? []) as PromoCampaign[])
    setLoading(false)
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  // stok yang sudah ikut promo berjalan tidak ditawarkan lagi
  const onPromo = new Set<number>()
  for (const c of campaigns) for (const i of c.items) if (i.active) onPromo.add(i.batch_id)

  const limit = addDays(today, windowDays)
  const candidates = batches.filter((b) => b.sellable_until <= limit && !onPromo.has(b.batch_id))
  const pickedRows = candidates.filter((b) => picked.has(b.batch_id))

  const pct = Number(percent)
  const pctOk = percent.trim() !== '' && Number.isInteger(pct) && pct >= 1 && pct <= 90
  const preview = pctOk
    ? pickedRows.map((b) => {
        const pp = promoPrice(b.sell_price, pct)
        const pc = promoCost(b.cost_price, b.sell_price, pp, share)
        return { b, pp, pc, margin: pp - pc }
      })
    : []
  const losing = preview.filter((r) => r.margin < 0).length

  function toggle(id: number) {
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const allPicked = candidates.length > 0 && candidates.every((b) => picked.has(b.batch_id))
  function toggleAll() {
    setPicked(allPicked ? new Set() : new Set(candidates.map((b) => b.batch_id)))
  }

  async function start(e: FormEvent) {
    e.preventDefault()
    if (pickedRows.length === 0) {
      notify('Pilih minimal satu barang untuk dipromokan.', 'error')
      return
    }
    if (!pctOk) {
      notify('Diskon harus angka bulat antara 1 sampai 90.', 'error')
      return
    }
    if (name.trim() === '') {
      notify('Nama promo wajib diisi.', 'error')
      return
    }
    const ok = await confirm({
      title: 'Mulai promo?',
      message: `${pickedRows.length} barang didiskon ${pct}% (${shareLabel(share)}). Harga di Kasir langsung berubah.${
        losing > 0 ? ` ${losing} barang akan dijual di bawah harga setoran.` : ''
      }`,
      confirmText: 'Ya, mulai promo',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('promo_start', {
      p_name: name.trim(),
      p_percent: pct,
      p_supplier_share: share,
      p_note: note.trim() || null,
      p_batch_ids: pickedRows.map((b) => b.batch_id),
    })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      await load()
      return
    }
    notify('Promo dimulai. Harga di Kasir sudah berubah.')
    setPicked(new Set())
    setNote('')
    window.dispatchEvent(new Event(ALERTS_REFRESH_EVENT))
    await load()
  }

  async function stop(c: PromoCampaign) {
    const ok = await confirm({
      title: 'Hentikan promo?',
      message: `Harga barang di promo "${c.name}" dikembalikan ke harga normal. Penjualan yang sudah terjadi tidak berubah.`,
      confirmText: 'Ya, hentikan',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('promo_stop', { p_campaign_id: c.id })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify('Promo dihentikan dan harga dikembalikan.')
    await load()
  }

  if (setupNeeded) {
    return (
      <div className="promo">
        <PageHeader title="Promo Expired" />
        <div className="card">
          <h2>Fitur promo belum dipasang</h2>
          <p>
            Buka Supabase → SQL Editor, tempel isi file <code>{PROMO_SQL_FILE}</code>, lalu jalankan. Setelah itu muat ulang halaman ini.
          </p>
        </div>
      </div>
    )
  }

  const shareHint = SHARE_OPTIONS.find((o) => o.value === share)?.hint

  return (
    <div className="promo">
      <PageHeader
        title="Promo Expired"
        subtitle="Beri potongan harga untuk barang yang hampir expired supaya tidak terbuang atau diretur."
      />

      {loading ? (
        <div className="card">Memuat…</div>
      ) : (
        <>
          {isAdmin ? (
            <form noValidate onSubmit={(e) => void start(e)} className="panel promo-form">
              <div className="panel-head">
                <div>
                  <h2>Buat promo baru</h2>
                  <div className="panel-sub">Pilih barang, tentukan diskon, lalu mulai. Harga di Kasir berubah otomatis.</div>
                </div>
              </div>

              <div className="promo-step">
                <strong>1. Barang yang mau expired</strong>
                <div className="chips">
                  {WINDOWS.map((w) => (
                    <button
                      type="button"
                      key={w.days}
                      className={`promo-chip${windowDays === w.days ? ' on' : ''}`}
                      onClick={() => setWindowDays(w.days)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>

                {candidates.length === 0 ? (
                  <p className="page-sub" style={{ margin: 0 }}>
                    Tidak ada barang yang expired dalam rentang ini (atau semuanya sudah ikut promo).
                  </p>
                ) : (
                  <>
                    <label className="promo-all">
                      <input type="checkbox" checked={allPicked} onChange={toggleAll} /> Pilih semua ({candidates.length})
                    </label>
                    <div className="promo-list">
                      {candidates.map((b) => (
                        <label key={b.batch_id} className={`promo-pick${picked.has(b.batch_id) ? ' on' : ''}`}>
                          <input type="checkbox" checked={picked.has(b.batch_id)} onChange={() => toggle(b.batch_id)} />
                          <span className="promo-pick-main">
                            <strong>{products.get(b.product_id) ?? '-'}</strong>
                            <small>
                              {suppliers.get(b.supplier_id) ?? '-'} · sisa {b.qty_remaining} · {rupiah(b.sell_price)}
                            </small>
                          </span>
                          <span className={`badge ${b.sellable_until <= addDays(today, 1) ? 'badge-danger' : 'badge-warning'}`}>
                            {expiredLabel(b.sellable_until, today)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="promo-step">
                <strong>2. Besar diskon</strong>
                <div className="chips">
                  {QUICK.map((q) => (
                    <button
                      type="button"
                      key={q}
                      className={`promo-chip${percent === String(q) ? ' on' : ''}`}
                      onClick={() => setPercent(String(q))}
                    >
                      {q}%
                    </button>
                  ))}
                </div>
                <label className="field promo-narrow">
                  <span>Atau ketik sendiri (%)</span>
                  <input type="number" min={1} max={90} inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} />
                </label>
              </div>

              <div className="promo-step">
                <strong>3. Siapa yang menanggung potongan?</strong>
                <div className="seg">
                  {SHARE_OPTIONS.map((o) => (
                    <button type="button" key={o.value} className={share === o.value ? 'on' : ''} onClick={() => setShare(o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <span className="page-sub">{shareHint}</span>
                {share > 0 && (
                  <div className="notice notice-info">
                    <Info size={18} />
                    <span>Pastikan supplier sudah setuju. Catatan promo ini otomatis muncul di rekap setoran dan pesan WhatsApp ke supplier.</span>
                  </div>
                )}
              </div>

              <div className="promo-step">
                <strong>4. Nama dan catatan</strong>
                <label className="field">
                  <span>Nama promo <span className="req">*</span></span>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="field">
                  <span>Catatan untuk supplier <span className="hint">(opsional)</span></span>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Contoh: barang dipromokan karena expired besok, sudah disepakati lewat WhatsApp."
                  />
                </label>
              </div>

              {preview.length > 0 && (
                <div className="promo-step">
                  <strong>Ringkasan harga</strong>
                  <div className="table-wrap">
                    <table className="tbl" style={{ minWidth: 520 }}>
                      <thead>
                        <tr>
                          <th>Barang</th>
                          <th className="num">Normal</th>
                          <th className="num">Promo</th>
                          <th className="num">Harga setoran</th>
                          <th className="num">Untung/pcs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map(({ b, pp, pc, margin }) => (
                          <tr key={b.batch_id}>
                            <td>{products.get(b.product_id) ?? '-'}</td>
                            <td className="num">{rupiah(b.sell_price)}</td>
                            <td className="num"><b>{rupiah(pp)}</b></td>
                            <td className="num">{rupiah(pc)}</td>
                            <td className={`num${margin < 0 ? ' promo-neg' : ''}`}>{rupiah(margin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {losing > 0 && (
                    <div className="notice notice-warning">
                      <TriangleAlert size={18} />
                      <span>{losing} barang dijual di bawah harga setoran, jadi toko rugi per pcs. Naikkan bagian supplier atau kecilkan diskon bila tidak mau rugi.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="form-actions">
                <button className="btn-primary btn-icon" disabled={busy || pickedRows.length === 0}>
                  <BadgePercent size={16} /> {busy ? 'Memproses…' : `Mulai promo${pickedRows.length > 0 ? ` (${pickedRows.length} barang)` : ''}`}
                </button>
              </div>
            </form>
          ) : (
            <div className="notice notice-info" style={{ marginBottom: 16 }}>
              <Info size={18} />
              <span>Hanya admin yang bisa membuat atau menghentikan promo. Promo yang berjalan tetap otomatis berlaku di Kasir.</span>
            </div>
          )}

          <section className="panel" style={{ marginTop: 16 }}>
            <div className="panel-head">
              <h2>Promo berjalan dan riwayat</h2>
            </div>
            {campaigns.length === 0 ? (
              <EmptyState title="Belum ada promo" text="Promo yang kamu buat akan muncul di sini beserta hasil penjualannya." />
            ) : (
              <div className="promo-cards">
                {campaigns.map((c) => {
                  const t = totals(c)
                  return (
                    <article className="promo-card" key={c.id}>
                      <div className="promo-card-head">
                        <div>
                          <strong>{c.name}</strong>
                          <div className="page-sub">
                            Diskon {c.discount_percent}% · {shareLabel(c.supplier_share)} · mulai {shortDate(c.started_on)}
                            {c.ended_on ? ` · selesai ${shortDate(c.ended_on)}` : ''}
                          </div>
                        </div>
                        <span className={`badge ${c.running ? 'badge-success' : 'badge-muted'}`}>{c.running ? 'Berjalan' : 'Selesai'}</span>
                      </div>

                      <div className="promo-stats">
                        <div><span>Terjual</span><b>{t.sold} pcs</b></div>
                        <div><span>Omzet promo</span><b>{rupiah(t.revenue)}</b></div>
                        <div><span>Total potongan</span><b>{rupiah(t.discount)}</b></div>
                        <div><span>Ditanggung toko</span><b>{rupiah(t.store)}</b></div>
                        <div><span>Ditanggung supplier</span><b>{rupiah(t.supplier)}</b></div>
                        {c.status === 'aktif' && <div><span>Sisa stok promo</span><b>{t.left} pcs</b></div>}
                      </div>

                      {c.supplier_note && <div className="page-sub">Catatan untuk supplier: {c.supplier_note}</div>}

                      <div className="table-wrap">
                        <table className="tbl" style={{ minWidth: 480 }}>
                          <thead>
                            <tr>
                              <th>Barang</th>
                              <th>Supplier</th>
                              <th className="num">Normal → promo</th>
                              <th className="num">Terjual</th>
                              <th className="num">Sisa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.items.map((i) => (
                              <tr key={i.batch_id}>
                                <td>{i.product_name}</td>
                                <td>{i.supplier_name}</td>
                                <td className="num">{rupiah(i.original_price)} → <b>{rupiah(i.promo_price)}</b></td>
                                <td className="num">{i.qty_sold}</td>
                                <td className="num">{i.active ? i.qty_remaining : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {isAdmin && c.status === 'aktif' && (
                        <div className="form-actions">
                          <button type="button" className="btn-sm btn-danger" onClick={() => void stop(c)} disabled={busy}>
                            Hentikan promo
                          </button>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
