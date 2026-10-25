import { useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import Sheet from './Sheet'
import { useMediaQuery } from '../lib/useMediaQuery'
import './Paket2.css'

export interface SelectOption {
  value: string
  label: string
  hint?: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  /** Judul sheet dan label aksesibilitas, mis. "Supplier". */
  label: string
  /** Teks untuk pilihan kosong, mis. "Semua supplier". Kosongkan bila pilihan kosong tidak boleh. */
  emptyLabel?: string
  className?: string
}

/** Dropdown biasa di komputer; di HP berubah menjadi bottom sheet yang nyaman disentuh. */
export default function SelectSheet({ value, onChange, options, label, emptyLabel, className }: Props) {
  const mobile = useMediaQuery('(max-width: 720px)')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const all = useMemo(() => (emptyLabel !== undefined ? [{ value: '', label: emptyLabel }, ...options] : options), [emptyLabel, options])
  const current = all.find((o) => o.value === value)
  const shown = q.trim() ? all.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : all

  if (!mobile) {
    return (
      <select className={className} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {all.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    setQ('')
  }

  return (
    <>
      <button type="button" className={`ss-btn ${className ?? ''}${current && current.value !== '' ? '' : ' placeholder'}`} aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span>{current?.label ?? '— pilih —'}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <Sheet label={label} onClose={() => { setOpen(false); setQ('') }}>
          <div className="ss-head">
            <h2>{label}</h2>
            <button type="button" className="btn-sm" onClick={() => { setOpen(false); setQ('') }}>Tutup</button>
          </div>
          {all.length > 8 && <input className="ss-search" placeholder={`Cari ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="ss-list" role="listbox" aria-label={label}>
            {shown.length === 0 && <div className="page-sub" style={{ padding: 12 }}>Tidak ada yang cocok.</div>}
            {shown.map((o) => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} className="ss-opt" onClick={() => pick(o.value)}>
                <span>
                  {o.label}
                  {o.hint && <small> · {o.hint}</small>}
                </span>
                {o.value === value && <Check size={18} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
