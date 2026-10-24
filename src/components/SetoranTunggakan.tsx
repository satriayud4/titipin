import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { useConfirm } from './ConfirmDialog'
import Modal from './Modal'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { todayWIB } from '../lib/dates'

interface Row {
  supplier_id: number
  supplier_name: string
  tgl: string
  payable: number
  paid: number
}
interface Group {
  id: number
  name: string
  total: number
  days: { tgl: string; payable: number; paid: number; sisa: number }[]
}

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

interface Props {
  /** Berubah setiap kali halaman Setoran memuat ulang, supaya panel ikut segar. */
  refreshKey: number
  /** Lihat rincian satu supplier pada hari tertentu. */
  onPickDate: (date: string, supplierId: number) => void
  /** Dipanggil setelah pembayaran tercatat; halaman induk memuat ulang dan menaikkan refreshKey. */
  onPaid: () => void
}

/** Tagihan supplier yang belum dibayar dari semua hari: boleh dibayar kapan saja, tidak harus harian. */
export default function SetoranTunggakan({ refreshKey, onPickDate, onPaid }: Props) {
  const notify = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)
  const [payFor, setPayFor] = useState<Group | null>(null)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('supplier_outstanding_days')
    if (error) notify(errText(error), 'error')
    else setRows((data ?? []) as Row[])
    setLoading(false)
  }, [notify])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const groups = useMemo(() => {
    const m = new Map<number, Group>()
    for (const r of rows) {
      const sisa = r.payable - r.paid
      if (sisa <= 0) continue
      const g = m.get(r.supplier_id) ?? { id: r.supplier_id, name: r.supplier_name, total: 0, days: [] }
      g.total += sisa
      g.days.push({ tgl: r.tgl, payable: r.payable, paid: r.paid, sisa })
      m.set(r.supplier_id, g)
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [rows])

  const grand = groups.reduce((n, g) => n + g.total, 0)
  const today = todayWIB()

  function startPay(g: Group) {
    setPayFor(g)
    setAmount(String(g.total))
    setNotes('')
  }

  async function pay(e: FormEvent) {
    e.preventDefault()
    if (!payFor) return
    const n = Number(amount)
    if (amount.trim() === '' || !Number.isInteger(n) || n <= 0) return notify('Jumlah pembayaran wajib diisi (angka bulat lebih dari 0).', 'error')
    if (n > payFor.total) return notify(`Jumlah melebihi tagihan yang belum dibayar (${rupiah(payFor.total)}).`, 'error')
    const ok = await confirm({
      title: 'Catat pembayaran?',
      message: `${rupiah(n)} ke ${payFor.name}. Dilunasi dari hari yang paling lama dulu. Pembayaran yang sudah dicatat tidak bisa diedit.`,
      confirmText: 'Ya, catat',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('settle_supplier_outstanding', {
      p_supplier_id: payFor.id,
      p_amount: n,
      p_notes: notes.trim() || null,
    })
    setBusy(false)
    if (error) return notify(errText(error), 'error')
    notify(`Pembayaran ${rupiah(n)} ke ${payFor.name} berhasil dicatat.`)
    setPayFor(null)
    onPaid()
  }

  if (loading) return <div className="skeleton" style={{ height: 70, borderRadius: 14, marginBottom: 14 }} />

  return (
    <section className="st-tunggakan" aria-label="Belum disetor">
      <div className="st-tg-head">
        <div>
          <strong>Belum disetor (semua hari)</strong>
          <div className="page-sub">Setoran tidak harus tiap hari. Hanya hari yang ada penjualan supplier yang dihitung.</div>
        </div>
        <b className="st-tg-total">{rupiah(grand)}</b>
      </div>

      {groups.length === 0 ? (
        <div className="page-sub" style={{ padding: '4px 2px 2px' }}>Tidak ada tagihan yang belum dibayar.</div>
      ) : (
        <div className="st-tg-list">
          {groups.map((g) => {
            const open = openId === g.id
            return (
              <div className="st-tg-item" key={g.id}>
                <div className="st-tg-row">
                  <button type="button" className="btn-ghost st-tg-toggle" onClick={() => setOpenId(open ? null : g.id)} aria-expanded={open}>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>{g.name}</span>
                    <small>{g.days.length} hari</small>
                  </button>
                  <b>{rupiah(g.total)}</b>
                  <button type="button" className="btn-sm" onClick={() => startPay(g)}>Bayar</button>
                </div>
                {open && (
                  <ul className="st-tg-days">
                    {g.days.map((d) => (
                      <li key={d.tgl}>
                        <span>
                          {dayLabel(d.tgl)}
                          {d.tgl === today && <small> · masih berjalan</small>}
                        </span>
                        <span>
                          {rupiah(d.sisa)}
                          {d.paid > 0 && <small> (dibayar {rupiah(d.paid)} dari {rupiah(d.payable)})</small>}
                        </span>
                        <button type="button" className="btn-sm btn-ghost" onClick={() => onPickDate(d.tgl, g.id)}>Lihat</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {payFor && (
        <Modal title={`Bayar ${payFor.name}`} onClose={() => !busy && setPayFor(null)}>
          <form noValidate onSubmit={(e) => void pay(e)} className="form-stack">
            <small>Belum dibayar {rupiah(payFor.total)} dari {payFor.days.length} hari. Pembayaran dilunasi dari hari yang paling lama.</small>
            <label className="field">
              <span>Jumlah dibayar (Rp) <span className="req">*</span></span>
              <input type="number" min={1} max={payFor.total} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="field">
              <span>Catatan</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="form-actions">
              <button type="button" onClick={() => setPayFor(null)} disabled={busy}>Batal</button>
              <button disabled={busy}>{busy ? 'Menyimpan…' : 'Catat pembayaran'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
