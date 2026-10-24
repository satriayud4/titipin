import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { rupiah } from '../lib/format'
import { shortDay } from '../lib/dates'
import type { DayRow } from '../lib/report'

function niceScale(v: number, integer: boolean) {
  const raw = Math.max(v, 1) / 4
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow
  if (integer) step = Math.max(1, Math.ceil(step))
  return { step, max: step * 4 }
}

const compact = (n: number) =>
  n >= 1_000_000
    ? `${+(n / 1_000_000).toFixed(1)} jt`.replace('.', ',')
    : n >= 1000
      ? `${+(n / 1000).toFixed(1)} rb`.replace('.', ',')
      : String(n)

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export default function SalesChart({ data }: { data: DayRow[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const H = 260
  const pad = { l: 46, r: 34, t: 12, b: 28 }
  const W = Math.max(width, 280)
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const n = data.length
  const sO = niceScale(Math.max(0, ...data.map((d) => d.omzet)), false)
  const sT = niceScale(Math.max(0, ...data.map((d) => d.transactions)), true)

  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1))
  const yO = (v: number) => pad.t + ih - (v / sO.max) * ih
  const yT = (v: number) => pad.t + ih - (v / sT.max) * ih
  const path = (f: (d: DayRow) => number, y: (v: number) => number) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(f(d)).toFixed(1)}`).join(' ')
  const base = pad.t + ih
  const area = `${path((d) => d.omzet, yO)} L${x(n - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - rect.left - pad.l) / iw) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  const h = hover !== null ? data[hover] : null
  const tipLeft = hover !== null ? Math.min(W - 80, Math.max(80, x(hover))) : 0
  const tipTop = h ? Math.max(yO(h.omzet) - 10, 76) : 0
  const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString('id-ID', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="chart" ref={ref} style={{ height: H }}>
      {width > 0 && (
        <svg width={W} height={H} role="img" aria-label="Grafik penjualan dan jumlah transaksi 7 hari terakhir" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.25 }} />
              <stop offset="100%" style={{ stopColor: 'var(--primary)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3, 4].map((k) => (
            <g key={k}>
              <line x1={pad.l} x2={W - pad.r} y1={yO(sO.step * k)} y2={yO(sO.step * k)} style={{ stroke: 'var(--border-soft)' }} />
              <text x={pad.l - 8} y={yO(sO.step * k) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--muted)' }}>
                {compact(sO.step * k)}
              </text>
              <text x={W - pad.r + 8} y={yT(sT.step * k) + 4} fontSize="11" style={{ fill: 'var(--muted)' }}>
                {sT.step * k}
              </text>
            </g>
          ))}

          {data.map((d, i) =>
            W >= 480 || i % 2 === 0 ? (
              <text key={d.day} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" style={{ fill: 'var(--muted)' }}>
                {shortDay(d.day)}
              </text>
            ) : null,
          )}

          <path d={area} className="area-in" style={{ fill: 'url(#sales-fill)' }} />
          <path d={path((d) => d.transactions, yT)} pathLength={1} className="draw" fill="none" strokeWidth="2" strokeLinejoin="round" style={{ stroke: 'var(--purple)' }} />
          <path d={path((d) => d.omzet, yO)} pathLength={1} className="draw" fill="none" strokeWidth="2.5" strokeLinejoin="round" style={{ stroke: 'var(--primary)' }} />

          {data.map((d, i) => (
            <g key={d.day}>
              <circle cx={x(i)} cy={yT(d.transactions)} r={hover === i ? 4.5 : 3} style={{ fill: 'var(--surface)', stroke: 'var(--purple)' }} strokeWidth="2" />
              <circle cx={x(i)} cy={yO(d.omzet)} r={hover === i ? 5 : 3.5} style={{ fill: 'var(--surface)', stroke: 'var(--primary)' }} strokeWidth="2.5" />
            </g>
          ))}

          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={base} strokeDasharray="4 4" style={{ stroke: 'var(--border)' }} />}
        </svg>
      )}
      {h && (
        <div className="chart-tip" style={{ left: tipLeft, top: tipTop }}>
          <strong>{dayLabel(h.day)}</strong>
          <div>Penjualan {rupiah(h.omzet)}</div>
          <div>Transaksi {h.transactions}</div>
        </div>
      )}
    </div>
  )
}