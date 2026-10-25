import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import Popover from './Popover'
import './Pickers.css'

interface Props {
  /** HH:MM (24 jam), atau kosong. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
  /** Pilihan cepat, mis. ['08:00', '12:00', '15:00']. */
  presets?: string[]
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

/** Pemilih jam (24 jam, menit per 5) dengan gaya aplikasi. */
export default function TimePicker({ value, onChange, placeholder = 'Pilih jam', ariaLabel, disabled, className, presets }: Props) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const hRef = useRef<HTMLDivElement>(null)
  const mRef = useRef<HTMLDivElement>(null)
  const [hh, mm] = /^\d{2}:\d{2}$/.test(value) ? value.split(':') : ['', '']

  // gulir kolom ke nilai terpilih saat dibuka
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      hRef.current?.querySelector('.on')?.scrollIntoView({ block: 'center' })
      mRef.current?.querySelector('.on')?.scrollIntoView({ block: 'center' })
    }, 0)
    return () => window.clearTimeout(t)
  }, [open])

  const set = (h: string, m: string) => onChange(`${h || '12'}:${m || '00'}`)

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
        <Clock size={17} />
        <span>{value ? `${value.replace(':', '.')} WIB` : placeholder}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={trigger} width={248} height={presets?.length ? 330 : 280} label="Pilih jam">
        <div className="tp-cols">
          <div className="tp-col" ref={hRef} role="listbox" aria-label="Jam">
            {HOURS.map((h) => (
              <button key={h} type="button" className={`tp-opt${h === hh ? ' on' : ''}`} onClick={() => set(h, mm)}>{h}</button>
            ))}
          </div>
          <span className="tp-sep">:</span>
          <div className="tp-col" ref={mRef} role="listbox" aria-label="Menit">
            {MINUTES.map((m) => (
              <button key={m} type="button" className={`tp-opt${m === mm ? ' on' : ''}`} onClick={() => set(hh, m)}>{m}</button>
            ))}
          </div>
        </div>
        {presets && presets.length > 0 && (
          <div className="dp-presets">
            {presets.map((p) => (
              <button key={p} type="button" className={`dp-chip${p === value ? ' on' : ''}`} onClick={() => { onChange(p); setOpen(false) }}>
                {p.replace(':', '.')}
              </button>
            ))}
          </div>
        )}
        <div className="dp-foot">
          <button type="button" className="dp-link" onClick={() => setOpen(false)} disabled={!value}>Selesai</button>
        </div>
      </Popover>
    </>
  )
}
