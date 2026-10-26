import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import './ui.css'

/** Bilah aksi massal yang melayang di bawah layar saat ada item terpilih. */
export default function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className="bulk no-print" role="toolbar" aria-label="Aksi untuk item terpilih">
      <span className="bulk-count">{count} dipilih</span>
      <div className="bulk-actions">{children}</div>
      <button type="button" className="bulk-x" onClick={onClear} aria-label="Batalkan pilihan">
        <X size={18} />
      </button>
    </div>
  )
}
