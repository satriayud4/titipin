import { ChevronLeft, ChevronRight } from 'lucide-react'
import SelectSheet from './SelectSheet'
import './ui.css'

interface Props {
  page: number
  pages: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  onPageSize?: (n: number) => void
  sizes?: number[]
}

function windowPages(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const a = Math.max(2, page - 1)
  const b = Math.min(pages - 1, page + 1)
  if (a > 2) out.push('…')
  for (let i = a; i <= b; i++) out.push(i)
  if (b < pages - 1) out.push('…')
  out.push(pages)
  return out
}

/** Kontrol halaman: ringkasan "1–25 dari 312", nomor halaman, dan pilihan jumlah baris. */
export default function Pagination({ page, pages, pageSize, total, onPage, onPageSize, sizes = [10, 25, 50, 100] }: Props) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  if (pages <= 1 && !onPageSize) return null
  return (
    <nav className="pg no-print" aria-label="Halaman data">
      <span className="pg-info">
        {from}–{to} dari {total}
      </span>
      <div className="pg-nums">
        <button type="button" className="pg-btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">
          <ChevronLeft size={17} />
        </button>
        <span className="pg-compact">Hal {page}/{pages}</span>
        {windowPages(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="pg-gap">…</span>
          ) : (
            <button key={p} type="button" className={`pg-btn num${p === page ? ' on' : ''}`} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined} aria-label={`Halaman ${p}`}>
              {p}
            </button>
          ),
        )}
        <button type="button" className="pg-btn" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Halaman berikutnya">
          <ChevronRight size={17} />
        </button>
      </div>
      {onPageSize && (
        <div className="pg-size">
          <SelectSheet
            label="Baris per halaman"
            value={pageSize}
            onChange={(v) => onPageSize(Number(v))}
            options={sizes.map((s) => ({ value: s, label: `${s} / halaman` }))}
            compact
          />
        </div>
      )}
    </nav>
  )
}
