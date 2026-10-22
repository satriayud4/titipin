import type { CSSProperties } from 'react'
import { fmtRange, fmtTime, minToHHMM, staffHue, toMin, type CashierShift } from '../../lib/kalender'

interface Props {
  open: string | null
  close: string | null
  shifts: CashierShift[]
  /** menit sejak 00.00 untuk garis "sekarang"; null = jangan tampilkan (bukan hari ini) */
  nowMin: number | null
}

/** Lintasan satu hari: jam buka toko di lajur pertama, lalu satu lajur untuk tiap shift kasir. */
export default function DayTimeline({ open, close, shifts, nowMin }: Props) {
  const starts = [open, ...shifts.map((s) => s.start_time)].filter((x): x is string => !!x).map(toMin)
  const ends = [close, ...shifts.map((s) => s.end_time)].filter((x): x is string => !!x).map(toMin)
  if (starts.length === 0 || ends.length === 0) return null

  let lo = Math.floor(Math.min(...starts) / 60) * 60
  let hi = Math.min(24 * 60, Math.ceil(Math.max(...ends) / 60) * 60)
  if (hi - lo < 6 * 60) hi = Math.min(24 * 60, lo + 6 * 60)
  if (hi - lo < 6 * 60) lo = Math.max(0, hi - 6 * 60)
  const span = hi - lo

  const pct = (m: number) => Math.min(100, Math.max(0, ((m - lo) / span) * 100))
  const place = (a: string, b: string): CSSProperties => ({
    left: `${pct(toMin(a))}%`,
    width: `${Math.max(0, pct(toMin(b)) - pct(toMin(a)))}%`,
  })

  const hourStep = span / 60 > 12 ? 2 : 1
  const ticks: number[] = []
  for (let m = lo; m <= hi; m += 60 * hourStep) ticks.push(m)

  const showNow = nowMin !== null && nowMin >= lo && nowMin <= hi

  return (
    <div className="tl">
      <div className="tl-axis" aria-hidden="true">
        {ticks.map((m) => (
          <span key={m} style={{ left: `${pct(m)}%` }}>
            {String(m / 60).padStart(2, '0')}
          </span>
        ))}
      </div>

      <div className={`tl-body${showNow ? ' has-now' : ''}`}>
        <div className="tl-overlay" aria-hidden="true">
          {ticks.map((m) => (
            <i key={m} className="tl-grid" style={{ left: `${pct(m)}%` }} />
          ))}
          {showNow && (
            <i className="tl-now" style={{ left: `${pct(nowMin)}%` }}>
              <b>{fmtTime(minToHHMM(nowMin))}</b>
            </i>
          )}
        </div>

        {open && close && (
          <div className="tl-lane">
            <span className="tl-who">Toko buka</span>
            <div className="tl-track">
              <span className="tl-bar tl-bar-store" style={{ ...place(open, close), '--i': 0 } as CSSProperties}>
                {fmtRange(open, close)}
              </span>
            </div>
          </div>
        )}

        {shifts.map((s, i) => (
          <div className="tl-lane" key={s.id}>
            <span className="tl-who">{s.staff_name}</span>
            <div className="tl-track">
              <span
                role="img"
                className={`tl-bar tl-bar-shift${s.active ? ' active' : ''}`}
                aria-label={`Shift kasir ${s.staff_name}, ${fmtRange(s.start_time, s.end_time)}${s.active ? ', belum ditutup' : ''}`}
                style={{ ...place(s.start_time, s.end_time), '--h': staffHue(s.staff_name), '--i': i + 1 } as CSSProperties}
              >
                {s.active ? `${fmtTime(s.start_time)} · berjalan` : fmtRange(s.start_time, s.end_time)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
