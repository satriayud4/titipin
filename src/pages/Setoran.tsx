import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Download, Info, MessageCircle, Share2 } from 'lucide-react'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { supabase } from '../lib/supabase'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { addDays, todayWIB } from '../lib/dates'
import { useStore } from '../store/StoreContext'
import { csvBlob, downloadBlob, waNumber, waText, type Cell } from '../lib/export'
import { renderSetoranImage } from '../lib/setoranImage'
import SetoranTunggakan from '../components/SetoranTunggakan'
import { promoNoteLines, type PromoNoteRow } from '../lib/promo'
import './Promo.css'
import './Setoran.css'

interface Report {
  supplier_id: number
  supplier_name: string
  sold_qty: number
  sold_cost: number
  rusak_qty: number
  rusak_cost: number
  total_payable: number
  total_paid: number
}
interface Detail {
  product_name: string
  kind: string
  qty: number
  unit_cost: number
  subtotal: number
}
interface Payment {
  amount_paid: number
  paid_at: string
  paid_by_name: string | null
  notes: string | null
}
interface ShareState {
  report: Report
  blob: Blob
  file: File
  url: string
  wa: string | null
  text: string
  canShare: boolean
}

const longDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const time = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })
const fileName = (name: string, date: string) =>
  `setoran-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'supplier'}-${date}.png`

function status(r: Report) {
  const diff = r.total_paid - r.total_payable
  if (r.total_payable === 0 && r.total_paid === 0) return { text: 'Tidak ada tagihan', cls: 'badge-muted' }
  if (r.total_paid === 0) return { text: 'Belum dibayar', cls: 'badge-danger' }
  if (diff === 0) return { text: 'Lunas', cls: 'badge-success' }
  if (diff < 0) return { text: `Kurang ${rupiah(-diff)}`, cls: 'badge-warning' }
  return { text: `Lebih bayar ${rupiah(diff)}`, cls: 'badge-info' }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi-top"><span>{label}</span></div>
      <div className="kpi-value">{value}</div>
    </div>
  )
}

export default function Setoran() {
  const notify = useToast()
  const confirm = useConfirm()
  const store = useStore()
  const [params] = useSearchParams()
  const [date, setDate] = useState(() => {
    const q = params.get('tanggal')
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayWIB()
  })
  const [promoRows, setPromoRows] = useState<PromoNoteRow[]>([])
  const [rows, setRows] = useState<Report[]>([])
  const [phones, setPhones] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)
  const [details, setDetails] = useState<Detail[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [payFor, setPayFor] = useState<Report | null>(null)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState<number | null>(null)
  const [share, setShare] = useState<ShareState | null>(null)
  const [filter, setFilter] = useState<'all' | 'due' | 'done'>('all')
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const [rep, sup] = await Promise.all([
      supabase.rpc('supplier_settlement_report', { p_date: date }),
      supabase.from('suppliers').select('id, phone'),
    ])
    if (rep.error) notify(errText(rep.error), 'error')
    else setRows((rep.data ?? []) as Report[])
    setPhones(new Map((sup.data ?? []).map((x) => [x.id as number, (x.phone as string | null) ?? ''])))
    setLoading(false)
    setTick((t) => t + 1)
  }, [date, notify])

  useEffect(() => {
    void load()
  }, [load])

  function changeDate(d: string) {
    if (!d) return
    setDate(d)
    setOpen(null)
  }

  async function fetchDetail(supplierId: number) {
    const [d, p, n] = await Promise.all([
      supabase.rpc('supplier_settlement_detail', { p_date: date, p_supplier_id: supplierId }),
      supabase.rpc('supplier_payments', { p_date: date, p_supplier_id: supplierId }),
      supabase.rpc('supplier_promo_notes', { p_date: date, p_supplier_id: supplierId }),
    ])
    if (d.error) throw d.error
    if (p.error) throw p.error
    // SQL promo belum dijalankan -> rincian setoran tetap jalan tanpa catatan promo
    const promo = n.error ? [] : ((n.data ?? []) as PromoNoteRow[])
    return { details: (d.data ?? []) as Detail[], payments: (p.data ?? []) as Payment[], promo }
  }

  async function toggleDetail(id: number) {
    if (open === id) {
      setOpen(null)
      return
    }
    try {
      const r = await fetchDetail(id)
      setDetails(r.details)
      setPayments(r.payments)
      setPromoRows(r.promo)
      setOpen(id)
    } catch (err) {
      notify(errText(err), 'error')
    }
  }

  // ---------- gambar rekap & WhatsApp ----------
  async function openShare(r: Report) {
    setPreparing(r.supplier_id)
    try {
      const { details: d, payments: p, promo } = await fetchDetail(r.supplier_id)
      const promoLines = promoNoteLines(promo)
      const blob = await renderSetoranImage({
        appName: store.name,
        tagline: store.tagline,
        logoUrl: store.logoUrl,
        supplierName: r.supplier_name,
        dateLabel: longDate(date),
        rows: d.map((x) => ({ name: x.product_name, kind: x.kind, qty: x.qty, unitCost: x.unit_cost, subtotal: x.subtotal })),
        payable: r.total_payable,
        paid: r.total_paid,
        payments: p.map((x) => ({ amount: x.amount_paid, when: time(x.paid_at), by: x.paid_by_name || '-' })),
        promoNotes: promoLines,
        generatedAt: time(new Date().toISOString()),
      })
      const file = new File([blob], fileName(r.supplier_name, date), { type: 'image/png' })
      setShare({
        report: r,
        blob,
        file,
        url: URL.createObjectURL(blob),
        wa: waNumber(phones.get(r.supplier_id)),
        text: waText({
          appName: store.name,
          supplier: r.supplier_name,
          dateLabel: longDate(date),
          soldQty: r.sold_qty,
          payable: r.total_payable,
          paid: r.total_paid,
          promoLines,
        }),
        canShare: typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }),
      })
    } catch (err) {
      notify(errText(err), 'error')
    } finally {
      setPreparing(null)
    }
  }

  function closeShare() {
    if (share) URL.revokeObjectURL(share.url)
    setShare(null)
  }

  async function shareNative() {
    if (!share) return
    try {
      await navigator.share({ files: [share.file], title: `Rekap setoran ${share.report.supplier_name}`, text: share.text })
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') notify('Gagal membuka menu bagikan. Coba tombol Unduh gambar.', 'error')
    }
  }

  async function copyImage() {
    if (!share) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': share.blob })])
      notify('Gambar disalin. Buka chat WhatsApp lalu tempel dengan Ctrl+V.')
    } catch {
      notify('Browser tidak mengizinkan menyalin gambar. Gunakan tombol Unduh gambar.', 'error')
    }
  }

  function openChat() {
    if (!share?.wa) return
    window.open(`https://wa.me/${share.wa}?text=${encodeURIComponent(share.text)}`, '_blank', 'noopener')
  }

  // ---------- pembayaran ----------
  function startPay(r: Report) {
    setPayFor(r)
    setAmount(String(Math.max(r.total_payable - r.total_paid, 0) || ''))
    setNotes('')
  }

  async function pay(e: FormEvent) {
    e.preventDefault()
    if (!payFor) return
    const n = Number(amount)
    if (amount.trim() === '' || !Number.isInteger(n) || n <= 0) {
      notify('Jumlah pembayaran wajib diisi (angka bulat lebih dari 0).', 'error')
      return
    }
    const sisa = payFor.total_payable - payFor.total_paid
    const ok = await confirm({
      title: 'Catat pembayaran?',
      message: `${rupiah(n)} ke ${payFor.supplier_name} untuk tanggal ${date}.${n > sisa ? ` Jumlah ini melebihi sisa tagihan (${rupiah(Math.max(sisa, 0))}).` : ''} Pembayaran yang sudah dicatat tidak bisa diedit.`,
      confirmText: 'Ya, catat',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('settle_supplier', {
      p_date: date,
      p_supplier_id: payFor.supplier_id,
      p_amount: n,
      p_notes: notes.trim() || null,
    })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify(`Pembayaran ${rupiah(n)} ke ${payFor.supplier_name} berhasil dicatat.`)
    setPayFor(null)
    setOpen(null)
    await load()
  }

  function exportCsv() {
    const out: Cell[][] = [
      ['Rekap Setoran Supplier', store.name],
      ['Tanggal', date],
      [],
      ['Supplier', 'Barang terjual', 'Nilai terjual', 'Rusak ditanggung toko', 'Total tagihan', 'Sudah dibayar', 'Sisa'],
      ...rows.map((r) => [r.supplier_name, r.sold_qty, r.sold_cost, r.rusak_cost, r.total_payable, r.total_paid, Math.max(r.total_payable - r.total_paid, 0)]),
    ]
    downloadBlob(csvBlob(out), `setoran-${date}.csv`)
  }

  const totalPayable = rows.reduce((n, r) => n + r.total_payable, 0)
  const totalPaid = rows.reduce((n, r) => n + r.total_paid, 0)
  const isToday = date === todayWIB()
  const dueOf = (r: Report) => Math.max(r.total_payable - r.total_paid, 0)
  const dueCount = rows.filter((r) => dueOf(r) > 0).length
  // yang masih harus dibayar (nilai terbesar) di atas, yang sudah beres di bawah
  const shownRows = [...rows]
    .filter((r) => filter === 'all' || (filter === 'due') === (dueOf(r) > 0))
    .sort((a, b) => dueOf(b) - dueOf(a) || a.supplier_name.localeCompare(b.supplier_name))
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayWIB(), -i))
  const dayLabel = (d: string, i: number) =>
    i === 0 ? 'Hari ini' : i === 1 ? 'Kemarin' : new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'short', day: 'numeric' })

  return (
    <div className="st-page">
      <PageHeader
        title="Setoran Supplier"
        subtitle="Tagihan dihitung per hari dari barang yang terjual. Boleh dibayar kapan saja, yang belum dibayar terkumpul di Belum disetor."
        actions={
          <button className="btn-icon" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={18} /> Unduh CSV
          </button>
        }
      />

      <SetoranTunggakan refreshKey={tick} onPickDate={(d) => { changeDate(d); window.scrollTo({ top: 0, behavior: 'smooth' }) }} onPaid={() => void load()} />

      <div className="toolbar">
        <button className="btn-icon" onClick={() => changeDate(addDays(date, -1))} aria-label="Hari sebelumnya">
          <ChevronLeft size={18} />
        </button>
        <input type="date" value={date} max={todayWIB()} onChange={(e) => changeDate(e.target.value)} />
        <button className="btn-icon" onClick={() => changeDate(addDays(date, 1))} disabled={isToday} aria-label="Hari berikutnya">
          <ChevronRight size={18} />
        </button>
        <span className="st-date">{longDate(date)}</span>
      </div>

      <div className="pills-scroll pills-wrap st-days" role="group" aria-label="Pilih hari">
        {days.map((d, i) => (
          <button key={d} type="button" className={`pill${d === date ? ' on' : ''}`} aria-pressed={d === date} onClick={() => changeDate(d)}>
            {dayLabel(d, i)}
          </button>
        ))}
      </div>

      {isToday && (
        <div className="notice notice-warning" style={{ marginBottom: 14 }}>
          <Info size={18} />
          <span>Penjualan hari ini masih berjalan, jadi total tagihan bisa bertambah. Sebaiknya catat pembayaran dan kirim rekap setelah toko tutup.</span>
        </div>
      )}

      <div className="kpi-grid">
        <Stat label="Total tagihan" value={rupiah(totalPayable)} />
        <Stat label="Sudah dibayar" value={rupiah(totalPaid)} />
        <Stat label="Sisa" value={rupiah(totalPayable - totalPaid)} />
        <Stat label="Supplier perlu dibayar" value={`${dueCount} dari ${rows.length}`} />
      </div>

      {rows.length > 0 && (
        <div className="pills-scroll pills-wrap st-filter" role="group" aria-label="Filter status pembayaran">
          {(
            [
              ['all', 'Semua', rows.length],
              ['due', 'Perlu dibayar', dueCount],
              ['done', 'Sudah beres', rows.length - dueCount],
            ] as ['all' | 'due' | 'done', string, number][]
          ).map(([key, label, n]) => (
            <button key={key} type="button" className={`pill${filter === key ? ' on' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} <span className="st-n">{n}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {[0, 1].map((i) => (
            <div key={i} className="skeleton" style={{ height: 150, borderRadius: 14 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Belum ada tagihan" text="Tidak ada penjualan atau tagihan supplier pada tanggal ini." />
      ) : shownRows.length === 0 ? (
        <EmptyState title="Tidak ada yang cocok" text="Ubah filter untuk melihat supplier lain." />
      ) : (
        <div className="st-grid">
          {shownRows.map((r) => {
            const st = status(r)
            const due = dueOf(r)
            const pct = r.total_payable > 0 ? Math.min(100, Math.round((r.total_paid / r.total_payable) * 100)) : 0
            return (
              <section key={r.supplier_id} className={`panel st-card${open === r.supplier_id ? ' open' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0 }}>{r.supplier_name}</h2>
                  <span className={`badge ${st.cls}`}>{st.text}</span>
                </div>

                <div className="st-due">
                  <div className="st-due-top">
                    <span>{due > 0 ? 'Sisa harus dibayar' : 'Total tagihan'}</span>
                    <b>{rupiah(due > 0 ? due : r.total_payable)}</b>
                  </div>
                  <div className="st-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Pembayaran ${r.supplier_name}`}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <small>
                    Dibayar {rupiah(r.total_paid)} dari {rupiah(r.total_payable)}
                  </small>
                </div>

                <div className="mini-stats">
                  <div className="mini"><span>Terjual</span><b>{r.sold_qty} barang</b></div>
                  <div className="mini"><span>Nilai terjual</span><b>{rupiah(r.sold_cost)}</b></div>
                  {r.rusak_qty > 0 && <div className="mini"><span>Rusak (ditanggung toko)</span><b>{rupiah(r.rusak_cost)}</b></div>}
                </div>

                <div className="card-actions">
                  <button
                    className={`btn-sm btn-icon${due > 0 ? '' : ' btn-primary'}`}
                    onClick={() => void openShare(r)}
                    disabled={preparing === r.supplier_id}
                  >
                    <MessageCircle size={15} /> {preparing === r.supplier_id ? 'Menyiapkan…' : 'Kirim ke WhatsApp'}
                  </button>
                  <button className="btn-sm" onClick={() => void toggleDetail(r.supplier_id)}>
                    {open === r.supplier_id ? 'Tutup rincian' : 'Rincian'}
                  </button>
                  <button className={`btn-sm${due > 0 ? ' btn-primary' : ''}`} onClick={() => startPay(r)}>Catat pembayaran</button>
                </div>

                {open === r.supplier_id && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div className="table-wrap">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Produk</th>
                            <th>Jenis</th>
                            <th className="num">Jumlah</th>
                            <th className="num">Harga supplier</th>
                            <th className="num">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.map((d, i) => (
                            <tr key={i}>
                              <td>{d.product_name}</td>
                              <td>{d.kind}</td>
                              <td className="num">{d.qty}</td>
                              <td className="num">{rupiah(d.unit_cost)}</td>
                              <td className="num">{rupiah(d.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {promoRows.length > 0 && (
                      <div className="promo-note">
                        <strong>Catatan promo (ikut terkirim ke supplier)</strong>
                        {promoNoteLines(promoRows).map((t, i) => (
                          <p key={i}>{t}</p>
                        ))}
                      </div>
                    )}
                    <div>
                      <strong>Riwayat pembayaran</strong>
                      {payments.length === 0 && <div className="page-sub">Belum ada pembayaran.</div>}
                      {payments.map((p, i) => (
                        <div key={i} className="page-sub" style={{ padding: '3px 0' }}>
                          {rupiah(p.amount_paid)} · {time(p.paid_at)} · oleh {p.paid_by_name || '-'}
                          {p.notes ? ` · ${p.notes}` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {payFor && (
        <Modal title={`Catat pembayaran: ${payFor.supplier_name}`} onClose={() => !busy && setPayFor(null)}>
          <form noValidate onSubmit={(e) => void pay(e)} className="form-stack">
            <div className="page-sub">
              Tanggal {date} · tagihan {rupiah(payFor.total_payable)} · sudah dibayar {rupiah(payFor.total_paid)}
            </div>
            <label className="field">
              <span>Jumlah dibayar (Rp) <span className="req">*</span></span>
              <input type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="field">
              <span>Catatan <span className="hint">(opsional)</span></span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="form-actions">
              <button type="button" onClick={() => setPayFor(null)} disabled={busy}>Batal</button>
              <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pembayaran'}</button>
            </div>
          </form>
        </Modal>
      )}

      {share && (
        <Modal
          title="Kirim rekap ke supplier"
          onClose={closeShare}
          footer={
            <>
              {share.canShare && (
                <button className="btn-primary btn-icon" onClick={() => void shareNative()}>
                  <Share2 size={18} /> Bagikan (pilih WhatsApp)
                </button>
              )}
              <button className={share.canShare ? 'btn-icon' : 'btn-primary btn-icon'} onClick={() => void copyImage()}>
                <Copy size={18} /> Salin gambar
              </button>
              <button className="btn-icon" onClick={openChat} disabled={!share.wa}>
                <MessageCircle size={18} /> Buka chat WhatsApp
              </button>
              <button className="btn-icon" onClick={() => downloadBlob(share.blob, share.file.name)}>
                <Download size={18} /> Unduh gambar
              </button>
            </>
          }
        >
          <div className="notice notice-info">
            <Info size={18} />
            <span>
              {share.canShare
                ? `Pilih WhatsApp lalu kontak ${share.report.supplier_name} di menu yang muncul. Gambarnya langsung terlampir.`
                : 'Di komputer: klik Salin gambar, klik Buka chat WhatsApp, lalu tempel (Ctrl+V) di kolom pesan dan kirim.'}
              {!share.wa && ' Nomor HP supplier belum diisi atau tidak valid, perbaiki di menu Supplier.'}
            </span>
          </div>
          <img className="share-img" src={share.url} alt="Pratinjau rekap setoran" />
        </Modal>
      )}
    </div>
  )
}