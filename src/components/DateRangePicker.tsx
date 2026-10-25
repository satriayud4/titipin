import { useMemo, useRef, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { todayWIB } from '../lib/dates'
import Popover from './Popover'
import MonthCalendar, { formatDateShort, parseDate, isoDate, shiftDate } from './MonthCalendar'
import './Pickers.css'

interface Props {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  max?: string
  className?: string
}

function monthBounds(offset: number, today: string) {
  const p = parseDate(today)!
  const first = new Date(Date.UTC(p.y, p.m + offset, 1))
  const last = new Date(Date.UTC(p.y, p.m + offset + 1, 0))
  return {
    from: isoDate(first.getUTCFullYear(), first.getUTCMonth(), 1),
    to: isoDate(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()),
  }
}

/** Satu tombol untuk memilih rentang tanggal: pilih awal lalu akhir, atau pakai pilihan cepat. */
export default function DateRangePicker({ from, to, onChange, max, className }: Props) {
  const today = todayWIB()
  const limit = max ?? today
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from, to })
  const [hover, setHover] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const presets = useMemo(() => {
    const lastMonth = monthBounds(-1, today)
    const thisMonth = monthBounds(0, today)
    const clamp = (d: string) => (d > limit ? limit : d)
    return [
      { label: 'Hari ini', from: today, to: today },
      { label: 'Kemarin', from: shiftDate(today, -1), to: shiftDate(today, -1) },
      { label: '7 hari', from: shiftDate(today, -6), to: today },
      { label: '30 hari', from: shiftDate(today, -29), to: today },
      { label: 'Bulan ini', from: thisMonth.from, to: clamp(thisMonth.to) },
      { label: 'Bulan lalu', from: lastMonth.from, to: lastMonth.to },
    ]
  }, [today, limit])

  const label = from === to ? formatDateShort(from) : `${formatDateShort(from)} – ${formatDateShort(to)}`
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1

  function openIt() {
    setDraft({ from, to })
    setHover(null)
    setOpen(true)
  }
  function apply(f: string, t: string) {
    onChange(f, t)
    setOpen(false)
    trigger.current?.focus()
  }
  function pick(v: string) {
    // klik pertama menentukan awal; klik kedua menentukan akhir (otomatis ditukar bila terbalik)
    if (!draft.from || draft.to) {
      setDraft({ from: v, to: '' })
      return
    }
    const [a, b] = v < draft.from ? [v, draft.from] : [draft.from, v]
    apply(a, b)
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`dp-trigger dp-range${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => (open ? setOpen(false) : openIt())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Pilih rentang tanggal"
      >
        <CalendarRange size={17} />
        <span>{label}</span>
        <small>{days} hari</small>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={trigger} width={344} height={470} label="Pilih rentang tanggal">
        <div className="dr-presets">
          {presets.map((p) => (
            <button key={p.label} type="button" className={`dp-chip${from === p.from && to === p.to ? ' on' : ''}`} onClick={() => apply(p.from, p.to)}>
              {p.label}
            </button>
          ))}
        </div>
        <MonthCalendar today={today} range={draft} hover={hover} max={limit} initial={from} onPick={pick} onHover={setHover} />
        <div className="dr-hint">
          {draft.from && !draft.to ? (
            <span>Pilih tanggal akhir <b>(mulai {formatDateShort(draft.from)})</b></span>
          ) : (
            <span>Klik tanggal awal, lalu tanggal akhir</span>
          )}
          <button type="button" className="dp-link muted" onClick={() => setOpen(false)}>Tutup</button>
        </div>
      </Popover>
    </>
  )
}
