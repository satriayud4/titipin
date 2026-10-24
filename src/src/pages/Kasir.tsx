import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Clock, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { ShopScene } from '../components/Illustration'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { todayWIB } from '../lib/dates'
import Pos from './Pos'

interface Shift {
  id: number
  opened_at: string
  opening_cash: number
}
interface Summary {
  opening_cash: number
  sales_tunai: number
  sales_transfer: number
  sales_qris: number
  expected_cash: number
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })
const dayWIB = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

function CloseShiftModal({ shift, onClosed, onClose }: { shift: Shift; onClosed: () => void; onClose: () => void }) {
  const notify = useToast()
  const confirm = useConfirm()
  const [sum, setSum] = useState<Summary | null>(null)
  const [cash, setCash] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('shift_summary')
        .select('opening_cash, sales_tunai, sales_transfer, sales_qris, expected_cash')
        .eq('shift_id', shift.id)
        .single()
      if (error) notify(errText(error), 'error')
      else setSum(data as Summary)
    })()
  }, [shift.id, notify])

  const counted = Number(cash || 0)
  const diff = sum ? counted - sum.expected_cash : 0

  async function close(e: FormEvent) {
    e.preventDefault()
    if (!sum) return
    if (cash.trim() === '' || !Number.isInteger(counted) || counted < 0) {
      notify('Uang tunai di laci wajib diisi (angka bulat, minimal 0).', 'error')
      return
    }
    const info = diff === 0 ? 'Kas sesuai.' : diff < 0 ? `Kas kurang ${rupiah(-diff)}.` : `Kas lebih ${rupiah(diff)}.`
    const ok = await confirm({
      title: 'Tutup shift sekarang?',
      message: `${info} Setelah ditutup, shift tidak bisa dibuka lagi.`,
      confirmText: 'Ya, tutup shift',
    })
    if (!ok) return
    setBusy(true)
    const { data, error } = await supabase
      .from('shifts')
      .update({ closed_at: new Date().toISOString(), closing_cash: counted, notes: notes.trim() || null })
      .eq('id', shift.id)
      .is('closed_at', null)
      .select('id')
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    if (!data || data.length === 0) {
      notify('Shift ini sudah ditutup sebelumnya.', 'error')
      return
    }
    notify('Shift berhasil ditutup.')
    onClosed()
  }

  return (
    <Modal title="Tutup shift" onClose={() => !busy && onClose()}>
      {!sum ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : (
        <form noValidate onSubmit={(e) => void close(e)} className="form-stack">
          <div>
            <div className="sum-row"><span>Kas awal</span><span>{rupiah(sum.opening_cash)}</span></div>
            <div className="sum-row"><span>Penjualan tunai</span><span>{rupiah(sum.sales_tunai)}</span></div>
            <div className="sum-row"><span>Penjualan transfer</span><span>{rupiah(sum.sales_transfer)}</span></div>
            <div className="sum-row"><span>Penjualan QRIS</span><span>{rupiah(sum.sales_qris)}</span></div>
            <div className="sum-row total"><span>Seharusnya ada di laci</span><span>{rupiah(sum.expected_cash)}</span></div>
          </div>

          <label className="field">
            <span>Uang tunai di laci (hitung fisik) <span className="req">*</span></span>
            <input type="number" min={0} inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} />
          </label>

          {cash.trim() !== '' && (
            <div className={`change${diff === 0 ? '' : ' bad'}`}>
              <span>Selisih kas</span>
              <span>{diff === 0 ? 'Sesuai' : diff < 0 ? `Kurang ${rupiah(-diff)}` : `Lebih ${rupiah(diff)}`}</span>
            </div>
          )}

          <label className="field">
            <span>Catatan <span className="hint">(opsional)</span></span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={busy}>Batal</button>
            <button disabled={busy}>{busy ? 'Menutup…' : 'Tutup shift'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export default function Kasir() {
  const notify = useToast()
  const { session } = useAuth()
  const userId = session?.user.id
  const [shift, setShift] = useState<Shift | null | undefined>(undefined)
  const [openingCash, setOpeningCash] = useState('')
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadShift = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('shifts')
      .select('id, opened_at, opening_cash')
      .eq('cashier_id', userId)
      .is('closed_at', null)
      .maybeSingle()
    if (error) {
      notify(errText(error), 'error')
      return
    }
    setShift((data as Shift | null) ?? null)
  }, [userId, notify])

  useEffect(() => {
    void loadShift()
  }, [loadShift])

  async function openShift(e: FormEvent) {
    e.preventDefault()
    const n = Number(openingCash)
    if (openingCash.trim() === '' || !Number.isInteger(n) || n < 0) {
      notify('Kas awal wajib diisi (angka bulat, minimal 0).', 'error')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('shifts').insert({ cashier_id: userId, opening_cash: n })
    setBusy(false)
    if (error) {
      notify(error.code === '23505' ? 'Anda sudah punya shift yang terbuka.' : errText(error), 'error')
      await loadShift()
      return
    }
    notify('Shift berhasil dibuka. Selamat berjualan!')
    setOpeningCash('')
    await loadShift()
  }

  if (shift === undefined) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="skeleton" style={{ height: 64, borderRadius: 14 }} />
        <div className="skeleton" style={{ height: 320, borderRadius: 14 }} />
      </div>
    )
  }

  if (shift === null) {
    return (
      <div className="center-card">
        <ShopScene className="center-ill" />
        <h1>Buka shift</h1>
        <p className="page-sub" style={{ margin: '0 0 18px' }}>
          Hitung uang di laci, lalu isi sebagai kas awal sebelum mulai berjualan.
        </p>
        <form noValidate onSubmit={(e) => void openShift(e)} className="form-stack" style={{ textAlign: 'left' }}>
          <label className="field">
            <span>Kas awal (Rp) <span className="req">*</span></span>
            <input type="number" min={0} inputMode="numeric" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
          </label>
          <button disabled={busy}>{busy ? 'Membuka…' : 'Buka shift'}</button>
        </form>
      </div>
    )
  }

  const stale = dayWIB(shift.opened_at) !== todayWIB()

  return (
    <div>
      <div className="shift-bar">
        <div>
          <span className="badge badge-success">Shift terbuka</span>
          <div className="page-sub" style={{ marginTop: 4 }}>
            Dibuka {dateTime(shift.opened_at)} · kas awal {rupiah(shift.opening_cash)}
          </div>
        </div>
        <button className="btn-icon" onClick={() => setClosing(true)}>
          <Lock size={16} /> Tutup shift
        </button>
      </div>

      {stale && (
        <div className="notice notice-warning" style={{ marginBottom: 14 }}>
          <Clock size={18} />
          <span>Shift ini dibuka di hari sebelumnya. Sebaiknya tutup dulu, lalu buka shift baru.</span>
        </div>
      )}

      <Pos />

      {closing && (
        <CloseShiftModal
          shift={shift}
          onClose={() => setClosing(false)}
          onClosed={() => {
            setClosing(false)
            setShift(null)
          }}
        />
      )}
    </div>
  )
}