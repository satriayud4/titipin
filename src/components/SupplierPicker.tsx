import { useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import Modal from './Modal'
import './SupplierPicker.css'

export interface PickerItem {
  id: string
  name: string
  sub?: string
  badge?: ReactNode
  /** jumlah isian/pilihan yang menunggu di supplier ini */
  count?: number
}

interface Props {
  items: PickerItem[]
  value: string
  onChange: (id: string) => void
  /** tampilan layar lebar (daftar samping, dsb). Di HP selalu diganti tombol + daftar vertikal. */
  desktop?: ReactNode
  title?: string
}

/**
 * Pemilih supplier tanpa geser samping. Di HP: satu tombol berisi supplier terpilih yang membuka daftar
 * vertikal (dengan kolom cari). Di layar lebar: memakai tampilan `desktop` bila ada.
 */
export default function SupplierPicker({ items, value, onChange, desktop, title = 'Pilih supplier' }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const current = items.find((i) => i.id === value)
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? items.filter((i) => i.name.toLowerCase().includes(k)) : items
  }, [items, q])
  const elsewhere = items.reduce((n, i) => n + (i.id === value ? 0 : (i.count ?? 0)), 0)
  const initial = (name?: string) => (name ?? '?').trim().charAt(0).toUpperCase() || '?'

  function close() {
    setOpen(false)
    setQ('')
  }

  return (
    <>
      <div className={`sp-mobile${desktop ? '' : ' all'}`}>
        <button type="button" className="sp-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
          <span className="sp-avatar">{initial(current?.name)}</span>
          <span className="sp-main">
            <small>Supplier · {items.length} tersedia</small>
            <strong>{current?.name ?? 'Pilih supplier'}</strong>
            {current?.sub && <em>{current.sub}</em>}
          </span>
          {current?.badge}
          {elsewhere > 0 && <span className="sp-count" title="Isian di supplier lain">+{elsewhere}</span>}
          <ChevronDown size={18} className="sp-chev" />
        </button>
      </div>

      {desktop && <div className="sp-desktop">{desktop}</div>}

      {open && (
        <Modal title={title} onClose={close}>
          {items.length > 6 && (
            <div className="search" style={{ maxWidth: 'none' }}>
              <Search size={18} />
              <input autoFocus placeholder="Cari supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <div className="sp-list" role="listbox" aria-label={title}>
            {shown.length === 0 && <p className="page-sub">Supplier tidak ditemukan.</p>}
            {shown.map((i) => (
              <button
                key={i.id}
                type="button"
                role="option"
                aria-selected={i.id === value}
                className={`sp-item${i.id === value ? ' on' : ''}`}
                onClick={() => {
                  onChange(i.id)
                  close()
                }}
              >
                <span className="sp-avatar">{initial(i.name)}</span>
                <span className="sp-main">
                  <strong>{i.name}</strong>
                  {i.sub && <em>{i.sub}</em>}
                </span>
                {i.badge}
                {!!i.count && <span className="sp-count">{i.count}</span>}
                {i.id === value && <Check size={18} className="sp-check" />}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
