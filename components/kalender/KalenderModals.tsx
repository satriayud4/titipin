import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { addDays } from '../../lib/dates'
import { errText } from '../../lib/errors'
import { useToast } from '../Toast'
import { useConfirm } from '../ConfirmDialog'
import Modal from '../Modal'
import {
  DAY_NAMES,
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  KIND_LABEL,
  STATUS_LABEL,
  WEEK_ORDER,
  fmtRange,
  hhmm,
  longDate,
  toMin,
  weekdayOf,
  type DayInfo,
  type HourRow,
  type OrderKind,
  type OrderRow,
  type OrderStatus,
  type OverrideRow,
  type ShiftRow,
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
              Di tanggal ini masih ada {shiftCount > 0 ? `${shiftCount} shift` : ''}
              {shiftCount > 0 && orderCount > 0 ? ' dan ' : ''}
              {orderCount > 0 ? `${orderCount} pesanan` : ''}. Datanya tidak dihapus.
            </span>
          </div>
        )}
      </form>
    </Modal>
  )
}

/* ============ Shift karyawan ============ */
const REPEAT = [
  { weeks: 1, label: 'Tidak diulang' },
  { weeks: 4, label: 'Tiap minggu, 4 minggu' },
  { weeks: 8, label: 'Tiap minggu, 8 minggu' },
  { weeks: 12, label: 'Tiap minggu, 12 minggu' },
]

export function ShiftModal({
  date,
  shift,
  info,
  staff,
  onClose,
  onSaved,
}: {
  date: string
  shift?: ShiftRow
  info: DayInfo
  staff: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const notify = useToast()
  const confirm = useConfirm()
  const [name, setName] = useState(shift?.staff_name ?? '')
  const [start, setStart] = useState(hhmm(shift?.start_time) || info.open || DEFAULT_OPEN)
  const [end, setEnd] = useState(hhmm(shift?.end_time) || '15:00')
  const [note, setNote] = useState(shift?.note ?? '')
  const [weeks, setWeeks] = useState(1)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const who = name.trim()
    if (!who) {
      notify('Nama karyawan wajib diisi.', 'error')
      return
    }
    if (toMin(end) <= toMin(start)) {
      notify('Jam selesai harus setelah jam mulai.', 'error')
      return
    }
    const match = staff.find((s) => s.name.trim().toLowerCase() === who.toLowerCase())
    const base = { staff_name: who, user_id: match?.id ?? null, start_time: start, end_time: end, note: note.trim() || null }

    setBusy(true)
    const { error } = shift
      ? await supabase.from('work_shifts').update(base).eq('id', shift.id)
      : await supabase.from('work_shifts').insert(Array.from({ length: weeks }, (_, i) => ({ ...base, day: addDays(date, i * 7) })))
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify(shift ? 'Shift diperbarui.' : weeks > 1 ? `${weeks} shift ditambahkan.` : 'Shift ditambahkan.')
    onSaved()
  }

  async function remove() {
    if (!shift) return
    const ok = await confirm({
      title: 'Hapus shift ini?',
      message: `${shift.staff_name}, ${fmtRange(shift.start_time, shift.end_time)}.`,
      confirmText: 'Ya, hapus',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('work_shifts').delete().eq('id', shift.id)
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify('Shift dihapus.')
    onSaved()
  }

  return (
    <Modal
      title={shift ? 'Ubah shift' : 'Tambah shift'}
      onClose={onClose}
      footer={
        <>
          {shift && (
            <button type="button" className="btn-danger" onClick={() => void remove()} disabled={busy} style={{ marginRight: 'auto' }}>
              <Trash2 size={16} /> Hapus
            </button>
          )}
          <button type="button" onClick={onClose}>Batal</button>
          <button type="submit" form="kal-shift-form" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </>
      }
    >
      <form id="kal-shift-form" className="form-stack" onSubmit={save}>
        <p style={{ margin: 0, fontWeight: 700 }}>{longDate(shift?.day ?? date)}</p>

        <label className="field">
          Karyawan <span className="req">*</span>
          <input value={name} list="kal-staff" autoComplete="off" placeholder="Ketik atau pilih nama" onChange={(e) => setName(e.target.value)} />
          <datalist id="kal-staff">
            {staff.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </label>

        <div className="kal-time-pair">
          <label className="field">
            Mulai
            <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            Selesai
            <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        {!info.closed && info.open && info.close && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            style={{ justifySelf: 'start' }}
            onClick={() => {
              setStart(info.open ?? DEFAULT_OPEN)
              setEnd(info.close ?? DEFAULT_CLOSE)
            }}
          >
            Isi sesuai jam buka ({fmtRange(info.open, info.close)})
          </button>
        )}

        <label className="field">
          Catatan
          <input value={note} maxLength={120} placeholder="Mis. jaga kasir, produksi kue" onChange={(e) => setNote(e.target.value)} />
        </label>

        {!shift && (
          <label className="field">
            Ulangi
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {REPEAT.map((r) => (
                <option key={r.weeks} value={r.weeks}>{r.label}</option>
              ))}
            </select>
            {weeks > 1 && (
              <span className="hint">
                Dibuat tiap hari {DAY_NAMES[weekdayOf(date)]} sampai {longDate(addDays(date, (weeks - 1) * 7))}.
              </span>
            )}
          </label>
        )}
      </form>
    </Modal>
  )
}

/* ============ Pesanan ============ */
export function OrderModal({
  date,
  order,
  canDelete,
  onClose,
  onSaved,
}: {
  date: string
  order?: OrderRow
  canDelete: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const notify = useToast()
  const confirm = useConfirm()
  const [kind, setKind] = useState<OrderKind>(order?.kind ?? 'customer')
  const [title, setTitle] = useState(order?.title ?? '')
  const [party, setParty] = useState(order?.party ?? '')
  const [dueDate, setDueDate] = useState(order?.due_date ?? date)
  const [dueTime, setDueTime] = useState(hhmm(order?.due_time))
  const [details, setDetails] = useState(order?.details ?? '')
  const [status, setStatus] = useState<OrderStatus>(order?.status ?? 'pending')
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      notify('Judul pesanan wajib diisi.', 'error')
      return
    }
    if (!dueDate) {
      notify('Tanggal tenggat wajib diisi.', 'error')
      return
    }
    const payload = {
      kind,
      title: title.trim(),
      party: party.trim() || null,
      due_date: dueDate,
      due_time: dueTime || null,
      details: details.trim() || null,
      status,
    }
    setBusy(true)
    const { error } = order
      ? await supabase.from('scheduled_orders').update(payload).eq('id', order.id)
      : await supabase.from('scheduled_orders').insert(payload)
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify(order ? 'Pesanan diperbarui.' : 'Pesanan ditambahkan.')
    onSaved()
  }

  async function remove() {
    if (!order) return
    const ok = await confirm({
      title: 'Hapus pesanan ini?',
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
      title={order ? 'Ubah pesanan' : 'Pesanan baru'}
      onClose={onClose}
      footer={
        <>
          {order && canDelete && (
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
        <div className="pills" role="radiogroup" aria-label="Jenis pesanan">
          {(Object.keys(KIND_LABEL) as OrderKind[]).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              className={`pill${kind === k ? ' on' : ''}`}
              onClick={() => setKind(k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <label className="field">
          Judul <span className="req">*</span>
          <input
            value={title}
            maxLength={120}
            placeholder={kind === 'customer' ? 'Mis. Kue ulang tahun 2 tingkat' : 'Mis. Pesan paket snack ke supplier'}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="field">
          {kind === 'customer' ? 'Nama pelanggan' : 'Nama supplier'}
          <input value={party} maxLength={80} onChange={(e) => setParty(e.target.value)} />
        </label>

        <div className="kal-time-pair">
          <label className="field">
            Tanggal <span className="req">*</span>
            <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="field">
            Jam
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </label>
        </div>

        <label className="field">
          Rincian
          <textarea rows={3} value={details} placeholder="Isi pesanan, jumlah, tulisan di kue, alamat antar…" onChange={(e) => setDetails(e.target.value)} />
        </label>

        {order && (
          <label className="field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
              {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
        )}
      </form>
    </Modal>
  )
}
