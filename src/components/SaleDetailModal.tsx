import { useCallback, useEffect, useRef, useState } from 'react'
import { Banknote, Landmark, Minus, Plus, Printer, QrCode, TriangleAlert, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { useConfirm } from './ConfirmDialog'
import Modal from './Modal'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { printPage } from '../lib/print'
import { useStore } from '../store/StoreContext'

type Method = 'tunai' | 'transfer' | 'qris'
const METHODS: { value: Method; label: string; icon: LucideIcon }[] = [
  { value: 'tunai', label: 'Tunai', icon: Banknote },
  { value: 'transfer', label: 'Transfer', icon: Landmark },
  { value: 'qris', label: 'QRIS', icon: QrCode },
]
const methodLabel = (m: string) => METHODS.find((x) => x.value === m)?.label ?? m

interface AuditEntry {
  action: 'ubah' | 'batal'
  reason: string
  acted_at: string
  by: string | null
}
interface SaleItem {
  item_id?: number
  product_name: string
  supplier_name: string
  qty: number
  unit_price: number
  max_qty?: number
}
interface SaleDetail {
  id: number
  voided: boolean
  void_reason?: string
  void_at?: string
  void_by?: string | null
  sale_date: string
  created_at: string
  payment_method: Method
  total: number
  cash_received: number | null
  cashier_name: string | null
  can_edit: boolean
  is_today: boolean
  items: SaleItem[]
  audit: AuditEntry[]
}

export const trxLabel = (id: number) => `TRX-${String(id).padStart(3, '0')}`
const when = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

interface Props {
  saleId: number
  onClose: () => void
  onChanged: () => void
}

export default function SaleDetailModal({ saleId, onClose, onChanged }: Props) {
  const store = useStore()
  const notify = useToast()
  const confirm = useConfirm()
  const [sale, setSale] = useState<SaleDetail | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'void'>('view')
  const [qty, setQty] = useState<Record<number, number>>({})
  const [method, setMethod] = useState<Method>('tunai')
  const [cash, setCash] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_sale', { p_id: saleId })
    if (error) {
      notify(errText(error), 'error')
      closeRef.current()
      return
    }
    setSale(data as SaleDetail)
  }, [saleId, notify])

  useEffect(() => {
    void load()
  }, [load])

  if (!sale) {
    return (
      <Modal title={trxLabel(saleId)} onClose={onClose}>
        <div className="skeleton" style={{ height: 220 }} />
      </Modal>
    )
  }

  const itemQty = (i: SaleItem) => qty[i.item_id ?? 0] ?? i.qty
  const maxOf = (i: SaleItem) => (sale.is_today ? (i.max_qty ?? i.qty) : i.qty)
  const newTotal = sale.items.reduce((n, i) => n + itemQty(i) * i.unit_price, 0)
  const kept = sale.items.filter((i) => itemQty(i) > 0).length
  const cashN = Number(cash)

  function startEdit() {
    if (!sale) return
    setQty(Object.fromEntries(sale.items.map((i) => [i.item_id ?? 0, i.qty])))
    setMethod(sale.payment_method)
    setCash(sale.cash_received != null ? String(sale.cash_received) : '')
    setReason('')
    setMode('edit')
  }

  function setItemQty(i: SaleItem, q: number) {
    setQty((prev) => ({ ...prev, [i.item_id ?? 0]: Math.max(0, Math.min(q, maxOf(i))) }))
  }

  async function saveEdit() {
    if (!sale) return
    if (kept === 0) {
      notify('Minimal satu barang harus tersisa. Gunakan Batalkan transaksi untuk membatalkan seluruhnya.', 'error')
      return
    }
    if (method === 'tunai' && (cash.trim() === '' || !Number.isInteger(cashN) || cashN < newTotal)) {
      notify('Uang diterima kurang dari total.', 'error')
      return
    }
    if (reason.trim() === '') {
      notify('Alasan perubahan wajib diisi.', 'error')
      return
    }
    const changed =
      sale.items.some((i) => itemQty(i) !== i.qty) ||
      method !== sale.payment_method ||
      (method === 'tunai' && cashN !== sale.cash_received)
    if (!changed) {
      notify('Belum ada yang diubah.', 'error')
      return
    }
    const ok = await confirm({
      title: 'Simpan perubahan transaksi?',
      message: `${trxLabel(sale.id)}: total ${rupiah(sale.total)} menjadi ${rupiah(newTotal)}. Stok, tagihan supplier, dan kas shift ikut berubah. Perubahan ini tercatat permanen.`,
      confirmText: 'Ya, simpan perubahan',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('edit_sale', {
      p_id: sale.id,
      p_method: method,
      p_cash: method === 'tunai' ? cashN : null,
      p_items: sale.items.map((i) => ({ item_id: i.item_id, qty: itemQty(i) })),
      p_reason: reason.trim(),
    })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify('Transaksi berhasil diubah.')
    onChanged()
    await load()
    setMode('view')
  }

  async function saveVoid() {
    if (!sale) return
    if (reason.trim() === '') {
      notify('Alasan pembatalan wajib diisi.', 'error')
      return
    }
    const ok = await confirm({
      title: 'Batalkan transaksi ini?',
      message: `${trxLabel(sale.id)} senilai ${rupiah(sale.total)} akan dibatalkan. Stok dikembalikan dan transaksi tidak dihitung di laporan dan setoran. Catatan pembatalan tetap tersimpan.`,
      confirmText: 'Ya, batalkan transaksi',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('void_sale', { p_id: sale.id, p_reason: reason.trim() })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify('Transaksi dibatalkan.')
    onChanged()
    onClose()
  }

  const footer =
    mode === 'view' ? (
      sale.can_edit && !sale.voided ? (
        <>
          <button type="button" className="btn-icon" onClick={() => printPage('receipt')}><Printer size={16} /> Cetak struk</button>
          <button className="btn-danger" onClick={() => { setReason(''); setMode('void') }}>Batalkan transaksi</button>
          <button className="btn-primary" onClick={startEdit}>Ubah transaksi</button>
        </>
      ) : (
        <>
          <button type="button" className="btn-icon" onClick={() => printPage('receipt')}><Printer size={16} /> Cetak struk</button>
          <button onClick={onClose}>Tutup</button>
        </>
      )
    ) : mode === 'edit' ? (
      <>
        <button onClick={() => setMode('view')} disabled={busy}>Batal</button>
        <button className="btn-primary" onClick={() => void saveEdit()} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>
      </>
    ) : (
      <>
        <button onClick={() => setMode('view')} disabled={busy}>Kembali</button>
        <button className="btn-danger-solid" onClick={() => void saveVoid()} disabled={busy}>{busy ? 'Memproses…' : 'Batalkan transaksi'}</button>
      </>
    )

  return (
    <Modal title={`${trxLabel(sale.id)}${mode === 'edit' ? ' · Ubah' : mode === 'void' ? ' · Batalkan' : ''}`} onClose={() => !busy && onClose()} footer={footer}>
      {mode === 'view' && (
        <div className="form-stack">
          <div className="print-only" style={{ textAlign: 'center', marginBottom: 8 }}>
            <b style={{ fontSize: '1.1em' }}>{store.name}</b>
            <div>Bukti transaksi {trxLabel(sale.id)}</div>
            <div style={{ borderBottom: '1px dashed #000', marginTop: 6 }} />
          </div>
          {sale.voided && (
            <div className="notice notice-error">
              <TriangleAlert size={18} />
              <span>
                Transaksi ini dibatalkan{sale.void_at ? ` pada ${when(sale.void_at)}` : ''}
                {sale.void_by ? ` oleh ${sale.void_by}` : ''}. Alasan: {sale.void_reason}
              </span>
            </div>
          )}

          <div className="mini-stats">
            <div className="mini"><span>Tanggal</span><b>{dayLabel(sale.sale_date)}</b></div>
            <div className="mini"><span>Waktu · Kasir</span><b>{when(sale.created_at)} · {sale.cashier_name || '-'}</b></div>
            <div className="mini"><span>Metode</span><b>{methodLabel(sale.payment_method)}</b></div>
          </div>

          <div>
            {sale.items.map((i, idx) => (
              <div className="irow" key={idx}>
                <div>
                  <div style={{ fontWeight: 700 }}>{i.product_name}</div>
                  <div className="page-sub">{i.supplier_name} · {i.qty} × {rupiah(i.unit_price)}</div>
                </div>
                <b>{rupiah(i.qty * i.unit_price)}</b>
              </div>
            ))}
            <div className="sum-row total"><span>Total</span><span>{rupiah(sale.total)}</span></div>
            {sale.payment_method === 'tunai' && sale.cash_received != null && (
              <>
                <div className="sum-row"><span>Uang diterima</span><span>{rupiah(sale.cash_received)}</span></div>
                <div className="sum-row"><span>Kembalian</span><span>{rupiah(sale.cash_received - sale.total)}</span></div>
              </>
            )}
          </div>

          {!sale.can_edit && !sale.voided && (
            <div className="notice notice-info">
              Transaksi ini hanya bisa diubah oleh admin, karena shift sudah ditutup atau ini bukan transaksi Anda.
            </div>
          )}

          {sale.audit.length > 0 && (
            <div>
              <strong>Riwayat perubahan</strong>
              {sale.audit.map((a, idx) => (
                <div className="audit" key={idx}>
                  <b>{a.action === 'batal' ? 'Dibatalkan' : 'Diubah'}</b> · {when(a.acted_at)} · oleh {a.by || '-'}
                  <div className="page-sub">Alasan: {a.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'edit' && (
        <div className="form-stack">
          <div className="notice notice-warning">
            <TriangleAlert size={18} />
            <span>
              Perubahan ikut mengubah stok, tagihan supplier tanggal {dayLabel(sale.sale_date)}, dan kas shift. Harga barang tidak bisa diubah.
              {!sale.is_today && ' Karena bukan hari transaksi, jumlah hanya bisa dikurangi.'}
            </span>
          </div>

          <div>
            {sale.items.map((i, idx) => {
              const q = itemQty(i)
              return (
                <div className={`irow${q === 0 ? ' gone' : ''}`} key={idx}>
                  <div>
                    <div className="iname" style={{ fontWeight: 700 }}>{i.product_name}</div>
                    <div className="page-sub">{i.supplier_name} · {rupiah(i.unit_price)}{q === 0 ? ' · akan dihapus' : ''}</div>
                    <div className="stepper">
                      <button type="button" onClick={() => setItemQty(i, q - 1)} disabled={q <= 0} aria-label="Kurangi"><Minus size={14} /></button>
                      <b>{q}</b>
                      <button type="button" onClick={() => setItemQty(i, q + 1)} disabled={q >= maxOf(i)} aria-label="Tambah"><Plus size={14} /></button>
                    </div>
                  </div>
                  <b>{rupiah(q * i.unit_price)}</b>
                </div>
              )
            })}
            <div className="sum-row total">
              <span>Total baru</span>
              <span>{rupiah(newTotal)}{newTotal !== sale.total ? ` (semula ${rupiah(sale.total)})` : ''}</span>
            </div>
          </div>

          <div className="field">
            <span>Metode pembayaran</span>
            <div className="seg">
              {METHODS.map((m) => (
                <button key={m.value} type="button" className={method === m.value ? 'on' : ''} onClick={() => setMethod(m.value)}>
                  <m.icon size={16} /> {m.label}
                </button>
              ))}
            </div>
          </div>

          {method === 'tunai' && (
            <label className="field">
              <span>Uang diterima (Rp)</span>
              <input type="number" min={0} inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} />
              {cash.trim() !== '' && (
                <span className={`hint${cashN < newTotal ? ' warn' : ''}`}>
                  {cashN >= newTotal ? `Kembalian ${rupiah(cashN - newTotal)}` : 'Uang kurang dari total'}
                </span>
              )}
            </label>
          )}

          <label className="field">
            <span>Alasan perubahan <span className="req">*</span></span>
            <input placeholder="Contoh: salah ketik jumlah / salah pilih metode bayar" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
      )}

      {mode === 'void' && (
        <div className="form-stack">
          <div className="notice notice-warning">
            <TriangleAlert size={18} />
            <span>
              Stok dikembalikan, dan transaksi {rupiah(sale.total)} ini tidak lagi dihitung di laporan, setoran supplier, dan kas shift.
              Catatan pembatalan tetap tersimpan di Riwayat.
            </span>
          </div>
          <label className="field">
            <span>Alasan pembatalan <span className="req">*</span></span>
            <input placeholder="Contoh: pembeli batal / transaksi dobel" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
      )}
    </Modal>
  )
}