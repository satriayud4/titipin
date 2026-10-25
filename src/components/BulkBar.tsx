import type { ReactNode } from 'react'
import './Paket2.css'

/** Bar aksi massal yang menempel di bawah layar saat ada item terpilih. */
export default function BulkBar({ count, children }: { count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className="bulk-bar" role="region" aria-label="Aksi untuk item terpilih">
      <b>{count} dipilih</b>
      {children}
    </div>
  )
}
