import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import './Paket2.css'

/** Membagi daftar menjadi halaman. Kembali ke halaman 1 saat resetKey (filter/pencarian) berubah. */
export function usePaged<T>(items: T[], resetKey: string, defaultSize = 24) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(defaultSize)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const cur = Math.min(page, pages)

  useEffect(() => {
    setPage(1)
  }, [resetKey, size])

  const slice = useMemo(() => items.slice((cur - 1) * size, cur * size), [items, cur, size])
  return { page: cur, pages, size, setPage, setSize, slice, total: items.length }
}

type Paged = ReturnType<typeof usePaged<unknown>>

function pageList(cur: number, pages: number): (number | '…')[] {
  const set = new Set([1, pages, cur - 1, cur, cur + 1])
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}

export default function Pagination({ paged, sizes = [12, 24, 48, 96] }: { paged: Pick<Paged, 'page' | 'pages' | 'size' | 'total' | 'setPage' | 'setSize'>; sizes?: number[] }) {
  const { page, pages, size, total, setPage, setSize } = paged
  if (total <= Math.min(...sizes)) return null
  const from = (page - 1) * size + 1
  const to = Math.min(page * size, total)
  const go = (n: number) => {
    setPage(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <nav className="pg" aria-label="Halaman">
      <div className="pg-info">
        Menampilkan {from.toLocaleString('id-ID')}–{to.toLocaleString('id-ID')} dari {total.toLocaleString('id-ID')}
      </div>
      <div className="pg-nav">
        <button type="button" className="pg-btn" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">
          <ChevronLeft size={18} />
        </button>
        {pageList(page, pages).map((n, i) =>
          n === '…' ? (
            <span key={`g${i}`} className="pg-gap pg-num">…</span>
          ) : (
            <button key={n} type="button" className="pg-btn pg-num" aria-current={n === page ? 'page' : undefined} onClick={() => go(n)}>
              {n}
            </button>
          ),
        )}
        <span className="pg-cur">Hal. {page} / {pages}</span>
        <button type="button" className="pg-btn" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Halaman berikutnya">
          <ChevronRight size={18} />
        </button>
      </div>
      <label className="pg-size">
        Per halaman
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {sizes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
    </nav>
  )
}
