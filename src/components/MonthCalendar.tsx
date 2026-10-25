import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const WEEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
export function parseDate(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null
}
export function shiftDate(v: string, days: number) {
  const p = parseDate(v)!
  const t = new Date(Date.UTC(p.y, p.m, p.d + days))
  return isoDate(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}
export function formatDateLong(v: string) {
  const p = parseDate(v)
  if (!p) return ''
  const dow = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay()
  return `${DAYS_SHORT[dow]}, ${p.d} ${MONTHS_SHORT[p.m]} ${p.y}`
}
export function formatDateShort(v: string) {
  const p = parseDate(v)
  return p ? `${p.d} ${MONTHS_SHORT[p.m]} ${p.y}` : ''
}

interface Props {
  today: string
  /** Mode satu tanggal. */
  value?: string
  /** Mode rentang: from/to boleh kosong saat baru memilih. */
  range?: { from: string; to: string }
  hover?: string | null
  min?: string
  max?: string
  initial?: string
  onPick: (v: string) => void
  onHover?: (v: string | null) => void
}

/** Kisi kalender satu bulan, dipakai oleh DatePicker dan DateRangePicker. */
export default function MonthCalendar({ today, value, range, hover, min, max, initial, onPick, onHover }: Props) {
  const [view, setView] = useState(() => {
    const p = parseDate(initial || value || range?.from || today) ?? parseDate(today)!
    return { y: p.y, m: p.m }
  })
  const [dir, setDir] = useState<'next' | 'prev'>('next')

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1))
    const lead = (first.getUTCDay() + 6) % 7 // Senin = kolom pertama
    const count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
    const out: (number | null)[] = Array(lead).fill(null)
    for (let d = 1; d <= count; d++) out.push(d)
    while (out.length % 7) out.push(null)
    return out
  }, [view])

  const blocked = (v: string) => (!!min && v < min) || (!!max && v > max)
  const step = (delta: number) => {
    setDir(delta > 0 ? 'next' : 'prev')
    setView((v) => {
      const t = new Date(Date.UTC(v.y, v.m + delta, 1))
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() }
    })
  }

  // batas rentang yang sedang digambar (saat memilih ujung kedua, ikuti kursor)
  let lo = ''
  let hi = ''
  if (range) {
    if (range.from && range.to) [lo, hi] = [range.from, range.to]
    else if (range.from) {
      const h = hover && !blocked(hover) ? hover : range.from
      ;[lo, hi] = h < range.from ? [h, range.from] : [range.from, h]
    }
  }

  return (
    <div className="mc">
      <div className="dp-head">
        <button type="button" className="dp-nav" onClick={() => step(-1)} aria-label="Bulan sebelumnya">
          <ChevronLeft size={18} />
        </button>
        <strong key={`${view.y}-${view.m}`} className={`mc-title ${dir}`}>{MONTHS[view.m]} {view.y}</strong>
        <button type="button" className="dp-nav" onClick={() => step(1)} aria-label="Bulan berikutnya">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="dp-grid dp-week" aria-hidden="true">
        {WEEK.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div key={`${view.y}-${view.m}`} className={`dp-grid mc-days ${dir}`} role="grid" onPointerLeave={() => onHover?.(null)}>
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />
          const v = isoDate(view.y, view.m, d)
          const isEdge = range ? v === lo || v === hi : v === value
          const inRange = !!range && lo !== '' && v > lo && v < hi
          const cls = ['dp-day', isEdge ? 'on' : '', inRange ? 'in' : '', range && v === lo && hi > lo ? 'edge-l' : '', range && v === hi && hi > lo ? 'edge-r' : '', v === today ? 'today' : ''].filter(Boolean).join(' ')
          return (
            <button key={i} type="button" className={cls} disabled={blocked(v)} onClick={() => onPick(v)} onPointerEnter={() => onHover?.(v)} aria-label={formatDateLong(v)} aria-pressed={isEdge}>
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}
