import { useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { todayWIB } from '../lib/dates'
import Popover from './Popover'
import MonthCalendar, { formatDateLong, shiftDate } from './MonthCalendar'
import './Pickers.css'

export { formatDateLong }

interface Props {
  /** YYYY-MM-DD, atau kosong. */
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  /** Tombol cepat di dalam kalender: days dihitung dari hari ini. */
  presets?: { label: string; days: number }[]
  className?: string
}

/** Kalender sendiri (pengganti input type="date" bawaan browser) dengan gaya aplikasi. */
export default function DatePicker({ value, onChange, min, max, placeholder = 'Pilih tanggal', disabled, ariaLabel, presets, className }: Props) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const today = todayWIB()
  const blocked = (v: string) => (!!min && v < min) || (!!max && v > max)
  const pick = (v: string) => {
    if (blocked(v)) return
    onChange(v)
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`dp-trigger${value ? '' : ' empty'}${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={17} />
        <span>{value ? formatDateLong(value) : placeholder}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={trigger} width={316} height={presets?.length ? 410 : 368} label="Pilih tanggal">
        <MonthCalendar today={today} value={value} min={min} max={max} onPick={pick} />
        {presets && presets.length > 0 && (
          <div className="dp-presets">
            {presets.map((p) => {
              const v = shiftDate(today, p.days)
              return (
                <button key={p.label} type="button" className="dp-chip" disabled={blocked(v)} onClick={() => pick(v)}>
                  {p.label}
                </button>
              )
            })}
          </div>
        )}
        <div className="dp-foot">
          <button type="button" className="dp-link" disabled={blocked(today)} onClick={() => pick(today)}>Hari ini</button>
          <button type="button" className="dp-link muted" onClick={() => setOpen(false)}>Tutup</button>
        </div>
      </Popover>
    </>
  )
}
