import { rupiah } from '../lib/format'

export default function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 110px', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <span>{r.label}</span>
          <div style={{ background: '#eee', borderRadius: 4, height: 14 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: '#1b7f3b', borderRadius: 4 }} />
          </div>
          <span style={{ textAlign: 'right' }}>{rupiah(r.value)}</span>
        </div>
      ))}
    </div>
  )
}