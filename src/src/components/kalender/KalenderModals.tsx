import { useState, type FormEvent } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { errText } from '../../lib/errors'
import { useToast } from '../Toast'
import { useConfirm } from '../ConfirmDialog'
import Modal from '../Modal'
import {
  DAY_NAMES,
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  STATUS_LABEL,
  WEEK_ORDER,
  fmtRange,
  fmtTime,
  hhmm,
  longDate,
  orderUrgency,
  nowWIB,
  toMin,
  weekdayOf,
  type DayInfo,
  type HourRow,
  type OrderRow,
  type OrderStatus,
  type OverrideRow,
} from '../../lib/kalender'

/* ============ Jam buka mingguan ============ */
export function HoursModal({ hours, onClose, onSaved }: { hours: HourRow[]; onClose: () => void; onSaved: () => void }) {
  const notify = useToast()
  const [rows, setRows] = useState<HourRow[]>(() =>
    Array.from({ length: 7 }, (_, weekday) => {
      const h = hours.find((x) => x.weekday === weekday)
      return {
        weekday,
        is_open: h?.is_open ?? true,
        open_time: hhmm(h?.open_time) || DEFAULT_OPEN,
        close_time: hhmm(h?.close_time) || DEFAULT_CLOSE,
      }
    }),
  )
  const [busy, setBusy] = useState(false)

  const patch = (weekday: number, p: Partial<HourRow>) =>
    setRows((cur) => cur.map((r) => (r.weekday === weekday ? { ...r, ...p } : r)))

  function copyMonday() {
    const mon = rows.find((r) => r.weekday === 1)
    if (!mon) return
    setRows((cur) => cur.map((r) => (r.weekday === 1 ? r : { ...r, is_open: mon.is_open, open_time: mon.open_time, close_time: mon.close_time })))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const bad = rows.find((r) => r.is_open && toMin(r.close_time) <= toMin(r.open_time))
    if (bad) {
      notify(`${DAY_NAMES[bad.weekday]}: jam tutup harus setelah jam buka.`, 'error')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('store_hours').upsert(rows, { onConflict: 'weekday' })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify('Jam buka mingguan disimpan.')
    onSaved()
  }

  return (
    <Modal
      title="Jam buka mingguan"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>Batal</button>
          <button type="submit" form="kal-hours-form" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </>
      }
    >
      <form id="kal-hours-form" className="form-stack" onSubmit={save}>
        <p className="hint" style={{ margin: 0, color: 'var(--muted)' }}>
          Jadwal dasar yang berlaku tiap minggu. Untuk libur atau jam khusus di satu tanggal, ubah dari kalender.
        </p>
        <div className="kal-hours">
          {WEEK_ORDER.map((d) => {
            const r = rows[d]
            return (
              <div className={`kal-hours-row${r.is_open ? '' : ' off'}`} key={d}>
                <label className="kal-check">
                  <input type="checkbox" checked={r.is_open} onChange={(e) => patch(d, { is_open: e.target.checked })} />
                  <span>{DAY_NAMES[d]}</span>
                </label>
                {r.is_open ? (
                  <div className="kal-time-pair">
                    <input
                      type="time"
                      required
                      value={r.open_time}
                      aria-label={`Jam buka ${DAY_NAMES[d]}`}
                      onChange={(e) => patch(d, { open_time: e.target.value })}
                    />
                    <input
                      type="time"
                      required
                      value={r.close_time}
                      aria-label={`Jam tutup ${DAY_NAMES[d]}`}
                      onChange={(e) => patch(d, { close_time: e.target.value })}
                    />
                  </div>
                ) : (
                  <span className="kal-off-text">Tutup</span>
                )}
              </div>
            )
          })}
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={copyMonday}>
          Samakan semua hari dengan Senin
        </button>
      </form>
    </Modal>
  )
}

/* ============ Buka / tutup di satu tanggal ============ */
type DayMode = 'normal' | 'custom' | 'closed'

export function DayStatusModal({
  date,
  weekly,
  override,
  shiftCount,
  orderCount,
  onClose,
  onSaved,
}: {
  date: string
  weekly: DayInfo
  override: OverrideRow | undefined
  shiftCount: number
  orderCount: number
  onClose: () => void
  onSaved: () => void
}) {
  const notify = useToast()
  const [mode, setMode] = useState<DayMode>(override ? (override.is_closed ? 'closed' : 'custom') : 'normal')
  const [open, setOpen] = useState(hhmm(override?.open_time) || weekly.open || DEFAULT_OPEN)
  const [close, setClose] = useState(hhmm(override?.close_time) || weekly.close || DEFAULT_CLOSE)
  const [note, setNote] = useState(override?.note ?? '')
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (mode === 'custom' && toMin(close) <= toMin(open)) {
      notify('Jam tutup harus setelah jam buka.', 'error')
      return
    }
    setBusy(true)
    const { error } =
      mode === 'normal'
        ? await supabase.from('day_overrides').delete().eq('day', date)
        : await supabase.from('day_overrides').upsert(
            {
              day: date,
              is_closed: mode === 'closed',
              open_time: mode === 'custom' ? open : null,
              close_time: mode === 'custom' ? close : null,
              note: note.trim() || null,
            },
            { onConflict: 'day' },
          )
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify(mode === 'normal' ? 'Kembali ke jadwal mingguan.' : mode === 'closed' ? 'Toko ditandai tutup.' : 'Jam khusus disimpan.')
    onSaved()
  }

  const choices: { id: DayMode; label: string }[] = [
    { id: 'normal', label: 'Jadwal biasa' },
    { id: 'custom', label: 'Jam khusus' },
    { id: 'closed', label: 'Tutup' },
  ]

  return (
    <Modal
      title="Buka atau tutup"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>Batal</button>
          <button type="submit" form="kal-day-form" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </>
      }
    >
      <form id="kal-day-form" className="form-stack" onSubmit={save}>
        <p style={{ margin: 0, fontWeight: 700 }}>{longDate(date)}</p>

        <div className="pills" role="radiogroup" aria-label="Status hari ini">
          {choices.map((c) => (
            <button
              type="button"
              key={c.id}
              role="radio"
              aria-checked={mode === c.id}
              className={`pill${mode === c.id ? ' on' : ''}`}
              onClick={() => setMode(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {mode === 'normal' && (
          <p className="hint" style={{ margin: 0, color: 'var(--muted)' }}>
            Mengikuti jadwal hari {DAY_NAMES[weekdayOf(date)]}:{' '}
            {weekly.closed ? 'tutup' : `buka ${fmtRange(weekly.open ?? DEFAULT_OPEN, weekly.close ?? DEFAULT_CLOSE)}`}.
          </p>
        )}

        {mode === 'custom' && (
          <div className="kal-time-pair">
            <label className="field">
              Buka
              <input type="time" required value={open} onChange={(e) => setOpen(e.target.value)} />
            </label>
            <label className="field">
              Tutup
              <input type="time" required value={close} onChange={(e) => setClose(e.target.value)} />
            </label>
          </div>
        )}

        {mode !== 'normal' && (
          <label className="field">
            {mode === 'closed' ? 'Keterangan tutup' : 'Keterangan'}
            <input
              value={note}
              maxLength={120}
              placeholder={mode === 'closed' ? 'Mis. libur Maulid Nabi, renovasi dapur' : 'Mis. tutup lebih awal, ada acara'}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="hint">Keterangan ini tampil di kalender dan kartu hari ini.</span>
          </label>
        )}

        {mode === 'closed' && (shiftCount > 0 || orderCount > 0) && (
          <div className="notice notice-warning">
            <span>
              Di tanggal ini masih ada {shiftCount > 0 ? `${shiftCount} shift kasir` : ''}
              {shiftCount > 0 && orderCount > 0 ? ' dan ' : ''}
              {orderCount > 0 ? `${orderCount} pesanan` : ''}. Datanya tidak dihapus.
            </span>
          </div>
        )}
      </form>
    </Modal>
  )
}

/* ============ Pesanan (dibuat dari Pembelian Paket, di sini hanya dirapikan) ============ */
export function OrderModal({
  order,
  canDelete,
  onClose,
  onSaved,
}: {
  order: OrderRow
  canDelete: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const notify = useToast()
  const confirm = useConfirm()
  const [dueTime, setDueTime] = useState(hhmm(order.due_time))
  const [details, setDetails] = useState(order.details ?? '')
  const [status, setStatus] = useState<OrderStatus>(order.status)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase
      .from('scheduled_orders')
      .update({ due_time: dueTime || null, details: details.trim() || null, status })
      .eq('id', order.id)
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify('Pesanan diperbarui.')
    onSaved()
  }

  async function remove() {
    const ok = await confirm({
      title: 'Hapus pesanan ini dari kalender?',
      message: order.title,
      confirmText: 'Ya, hapus',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('scheduled_orders').delete().eq('id', order.id)
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify('Pesanan dihapus.')
    onSaved()
  }

  return (
    <Modal
      title="Pesanan supplier"
      onClose={onClose}
      footer={
        <>
          {canDelete && (
            <button type="button" className="btn-danger" onClick={() => void remove()} disabled={busy} style={{ marginRight: 'auto' }}>
              <Trash2 size={16} /> Hapus
            </button>
          )}
          <button type="button" onClick={onClose}>Batal</button>
          <button type="submit" form="kal-order-form" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </>
      }
    >
      <form id="kal-order-form" className="form-stack" onSubmit={save}>
        <div>
          <strong>{order.title}</strong>
          <p className="page-sub" style={{ margin: '2px 0 0' }}>
            {longDate(order.due_date)} · dari halaman Pembelian Paket
          </p>
        </div>

        <label className="field">
          Jam dibutuhkan <span className="hint">(opsional)</span>
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </label>

        <label className="field">
          Rincian
          <textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>

        <label className="field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((st) => (
              <option key={st} value={st}>{STATUS_LABEL[st]}</option>
            ))}
          </select>
        </label>
      </form>
    </Modal>
  )
}

/* ============ Rincian pesanan (hanya lihat) ============ */
const STATUS_TONE: Record<OrderStatus, string> = { pending: 'info', processing: 'warning', done: 'success', cancelled: 'muted' }

/** "- Roti: 10 pcs" → { name: 'Roti', qty: '10 pcs' }; baris tanpa titik dua tetap ditampilkan apa adanya. */
function parseLines(details: string | null) {
  return (details ?? '')
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.lastIndexOf(': ')
      return i > 0 ? { name: l.slice(0, i), qty: l.slice(i + 2) } : { name: l, qty: '' }
    })
}

export function OrderDetailModal({
  order,
  onClose,
  onEdit,
  onDone,
}: {
  order: OrderRow
  onClose: () => void
  onEdit: () => void
  onDone: () => void
}) {
  const lines = parseLines(order.details)
  const open = order.status === 'pending' || order.status === 'processing'
  const u = orderUrgency(order, nowWIB())
  return (
    <Modal
      title="Rincian pesanan"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} style={{ marginRight: 'auto' }}>Tutup</button>
          <button type="button" className="btn-icon" onClick={onEdit}>
            <Pencil size={16} /> Ubah
          </button>
          {open && (
            <button type="button" className="btn-primary btn-icon" onClick={onDone}>
              <Check size={16} /> Tandai selesai
            </button>
          )}
        </>
      }
    >
      <div className="form-stack">
        <div>
          <strong style={{ fontSize: '1.1rem' }}>{order.title}</strong>
          <p className="page-sub" style={{ margin: '2px 0 0' }}>Pesanan supplier · dari Pembelian Paket</p>
        </div>

        <div>
          <div className="sum-row"><span>Dibutuhkan</span><span>{longDate(order.due_date)}</span></div>
          <div className="sum-row"><span>Jam</span><span>{order.due_time ? fmtTime(order.due_time) : 'Belum ditentukan'}</span></div>
          <div className="sum-row">
            <span>Status</span>
            <span className={`kal-tag ${STATUS_TONE[order.status]}`}>
              {open && u.label ? u.label : STATUS_LABEL[order.status]}
            </span>
          </div>
        </div>

        <div>
          <strong>Isi pesanan</strong>
          {lines.length === 0 ? (
            <p className="page-sub">Belum ada rincian.</p>
          ) : (
            <div style={{ marginTop: 6 }}>
              {lines.map((l, i) => (
                <div className="sum-row" key={i}>
                  <span>{l.name}</span>
                  <span style={{ fontWeight: 700 }}>{l.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
