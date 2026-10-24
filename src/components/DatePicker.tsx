import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { todayWIB } from '../lib/dates'
import './DatePicker.css'

interface Props {
  /** YYYY-MM-DD, atau kosong. */
  value: string
  onChange: (value: string) => void
  /** Tanggal paling awal yang boleh dipilih (YYYY-MM-DD). */
  min?: string
  /** Tanggal paling akhir yang boleh dipilih (YYYY-MM-DD). */
  max?: string
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  /** Tampilkan tombol cepat (+7 hari, dst) di dalam kalender. */
  presets?: { label: string; days: number }[]
  className?: string
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const WEEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

const POP_W = 312
const POP_H = 372

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
function parse(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null
}
function shift(v: string, days: number) {
  const p = parse(v)!
  const t = new Date(Date.UTC(p.y, p.m, p.d + days))
  return iso(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}
export function formatDateLong(v: string) {
  const p = parse(v)
  if (!p) return ''
  const dow = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay()
  return `${DAYS_SHORT[dow]}, ${p.d} ${MONTHS_SHORT[p.m]} ${p.y}`
}

/** Kalender sendiri (pengganti input type="date" bawaan browser) dengan gaya aplikasi. */
export default function DatePicker({ value, onChange, min, max, placeholder = 'Pilih tanggal', disabled, ariaLabel, presets, className }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const p = parse(value) ?? parse(todayWIB())!
    return { y: p.y, m: p.m }
  })
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const [sheet, setSheet] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const today = todayWIB()

  const openIt = () => {
    if (disabled) return
    const p = parse(value) ?? parse(today)!
    setView({ y: p.y, m: p.m })
    setOpen(true)
  }

  const place = useCallback(() => {
    const el = trigger.current
    if (!el) return
    const narrow = window.innerWidth < 640
    setSheet(narrow)
    if (narrow) return
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8))
    const below = window.innerHeight - r.bottom
    if (below < POP_H + 12 && r.top > below) setPos({ bottom: window.innerHeight - r.top + 6, left })
    else setPos({ top: r.bottom + 6, left })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // jangan ikut menutup jendela form di belakangnya
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (pop.current?.contains(t) || trigger.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1))
    const lead = (first.getUTCDay() + 6) % 7 // Senin = kolom pertama
    const count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
    const out: (number | null)[] = Array(lead).fill(null)
    for (let d = 1; d <= count; d++) out.push(d)
    while (out.length % 7) out.push(null)
    return out
  }, [view])

  const blocked = (v: string) => (min !== undefined && min !== '' && v < min) || (max !== undefined && max !== '' && v > max)
  const step = (delta: number) =>
    setView((v) => {
      const t = new Date(Date.UTC(v.y, v.m + delta, 1))
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() }
    })
  const pick = (v: string) => {
    if (blocked(v)) return
    onChange(v)
    setOpen(false)
    trigger.current?.focus()
  }

  const popover = open
    ? createPortal(
        <>
          {sheet && <div className="dp-scrim" onPointerDown={() => setOpen(false)} />}
          <div
            ref={pop}
            className={`dp-pop${sheet ? ' dp-sheet' : ''}`}
            style={sheet ? undefined : { position: 'fixed', width: POP_W, left: pos?.left ?? 0, top: pos?.top, bottom: pos?.bottom, visibility: pos ? 'visible' : 'hidden' }}
            role="dialog"
            aria-label="Pilih tanggal"
          >
            <div className="dp-head">
              <button type="button" className="dp-nav" onClick={() => step(-1)} aria-label="Bulan sebelumnya">
                <ChevronLeft size={18} />
              </button>
              <strong>{MONTHS[view.m]} {view.y}</strong>
              <button type="button" className="dp-nav" onClick={() => step(1)} aria-label="Bulan berikutnya">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="dp-grid dp-week" aria-hidden="true">
              {WEEK.map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className="dp-grid" role="grid">
              {cells.map((d, i) => {
                if (d === null) return <span key={i} />
                const v = iso(view.y, view.m, d)
                const cls = ['dp-day', v === value ? 'on' : '', v === today ? 'today' : ''].filter(Boolean).join(' ')
                return (
                  <button key={i} type="button" className={cls} disabled={blocked(v)} onClick={() => pick(v)} aria-label={formatDateLong(v)} aria-pressed={v === value}>
                    {d}
                  </button>
                )
              })}
            </div>
            {presets && presets.length > 0 && (
              <div className="dp-presets">
                {presets.map((p) => {
                  const v = shift(today, p.days)
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
              <button type="button" className="dp-link" onClick={() => setOpen(false)}>Tutup</button>
            </div>
          </div>
        </>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`dp-trigger${value ? '' : ' empty'}${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => (open ? setOpen(false) : openIt())}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={17} />
        <span>{value ? formatDateLong(value) : placeholder}</span>
      </button>
      {popover}
    </>
  )
}
