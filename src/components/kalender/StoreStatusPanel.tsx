import { useCallback, useEffect, useState } from 'react'
import { CalendarOff, DoorOpen, Store } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../Toast'
import { useConfirm } from '../ConfirmDialog'
import DatePicker, { formatDateLong } from '../DatePicker'
import { useSubmitLock } from '../../lib/useSubmitLock'
import { addDays, todayWIB } from '../../lib/dates'
import { errText } from '../../lib/errors'
import './StoreStatusPanel.css'

interface Closure {
  day: string
  note: string | null
}

/**
 * Menandai toko tutup: bisa dari hari sebelumnya (mis. malam ini menandai besok tutup) atau tanggal mana pun,
 * termasuk hari yang sudah lewat. Kasir akan diberi tahu bila toko ditandai tutup.
 */
export default function StoreStatusPanel({ onChanged }: { onChanged: () => void }) {
  const notify = useToast()
  const confirm = useConfirm()
  const submit = useSubmitLock()
  const today = todayWIB()
  const [list, setList] = useState<Closure[]>([])
  const [day, setDay] = useState(addDays(today, 1))
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('day_overrides')
      .select('day, note')
      .eq('is_closed', true)
      .gte('day', addDays(today, -14))
      .order('day', { ascending: true })
    setList((data ?? []) as Closure[])
  }, [today])

  useEffect(() => {
    void load()
  }, [load])

  const already = list.find((c) => c.day === day)

  function close() {
    void submit.run(async () => {
      const past = day < today
      if (past) {
        const ok = await confirm({
          title: 'Tandai tutup di tanggal yang sudah lewat?',
          message: `${formatDateLong(day)} akan ditandai tutup. Transaksi dan shift yang sudah tercatat di tanggal itu tidak dihapus.`,
          confirmText: 'Ya, tandai tutup',
        })
        if (!ok) return
      }
      const { error } = await supabase
        .from('day_overrides')
        .upsert({ day, is_closed: true, open_time: null, close_time: null, note: note.trim() || null }, { onConflict: 'day' })
      if (error) return notify(errText(error), 'error')
      notify(`Toko ditandai tutup pada ${formatDateLong(day)}.`)
      setNote('')
      await load()
      onChanged()
    })
  }

  function reopen(c: Closure) {
    void submit.run(async () => {
      const ok = await confirm({
        title: 'Buka kembali toko?',
        message: `${formatDateLong(c.day)} kembali mengikuti jadwal mingguan.`,
        confirmText: 'Ya, buka kembali',
      })
      if (!ok) return
      const { error } = await supabase.from('day_overrides').delete().eq('day', c.day)
      if (error) return notify(errText(error), 'error')
      notify('Status tutup dihapus.')
      await load()
      onChanged()
    })
  }

  const upcoming = list.filter((c) => c.day >= today)
  const past = list.filter((c) => c.day < today)

  return (
    <section className="card sst" aria-label="Status operasional toko">
      <header className="sst-head">
        <Store size={18} />
        <div>
          <h2>Status operasional toko</h2>
          <p>Tandai toko tutup lebih awal, misalnya malam ini untuk besok, atau catat hari yang sudah lewat.</p>
        </div>
      </header>

      <div className="sst-form">
        <div className="sst-quick">
          <button type="button" className={`pm-chip${day === addDays(today, 1) ? ' on' : ''}`} onClick={() => setDay(addDays(today, 1))}>Besok</button>
          <button type="button" className={`pm-chip${day === today ? ' on' : ''}`} onClick={() => setDay(today)}>Hari ini</button>
          <button type="button" className={`pm-chip${day === addDays(today, -1) ? ' on' : ''}`} onClick={() => setDay(addDays(today, -1))}>Kemarin</button>
        </div>
        <div className="sst-fields">
          <DatePicker value={day} onChange={setDay} ariaLabel="Tanggal toko tutup" />
          <input value={note} maxLength={120} placeholder="Keterangan (mis. libur, renovasi)" onChange={(e) => setNote(e.target.value)} aria-label="Keterangan tutup" />
          <button type="button" className="btn-primary btn-icon" onClick={close} disabled={submit.locked}>
            <CalendarOff size={16} /> {already ? 'Perbarui keterangan' : 'Tandai tutup'}
          </button>
        </div>
      </div>

      {list.length > 0 && (
        <ul className="sst-list">
          {[...upcoming, ...past.reverse()].map((c) => (
            <li key={c.day} className={c.day < today ? 'past' : ''}>
              <span className="sst-day">{formatDateLong(c.day)}{c.day === today ? ' · hari ini' : c.day === addDays(today, 1) ? ' · besok' : ''}</span>
              <span className="sst-note">{c.note ?? 'Tutup'}</span>
              <button type="button" className="btn-sm btn-icon" onClick={() => reopen(c)} disabled={submit.locked}>
                <DoorOpen size={14} /> Buka kembali
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
