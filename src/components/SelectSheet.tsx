import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import Popover from './Popover'
import './Pickers.css'
import './ui.css'

export interface SelectOption {
  value: string | number
  label: string
  hint?: string
}

interface Props {
  value: string | number
  onChange: (v: string | number) => void
  options: SelectOption[]
  /** Judul panel (muncul di HP). */
  label: string
  placeholder?: string
  disabled?: boolean
  compact?: boolean
  className?: string
  /** Tampilkan kolom cari. Otomatis aktif bila pilihan lebih dari 8. */
  searchable?: boolean
}

/**
 * Pengganti <select>: di desktop berupa popover, di HP berupa bottom sheet yang mudah dijangkau jempol.
 */
export default function SelectSheet({ value, onChange, options, label, placeholder = 'Pilih…', disabled, compact, className, searchable }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const current = options.find((o) => String(o.value) === String(value))
  const withSearch = searchable ?? options.length > 8
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options
  }, [options, q])
  const h = Math.min(420, 90 + Math.min(shown.length, 7) * 46 + (withSearch ? 56 : 0))

  function pick(v: string | number) {
    onChange(v)
    setOpen(false)
    setQ('')
    trigger.current?.focus()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`dp-trigger ss-trigger${compact ? ' compact' : ''}${current ? '' : ' empty'}${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span>{current?.label ?? placeholder}</span>
        <ChevronDown size={16} className="ss-caret" />
      </button>
      <Popover open={open} onClose={() => { setOpen(false); setQ('') }} anchor={trigger} width={Math.max(240, trigger.current?.offsetWidth ?? 240)} height={h} label={label}>
        <div className="ss-head">{label}</div>
        {withSearch && (
          <label className="ss-search">
            <Search size={16} />
            <input autoFocus placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
        <div className="ss-list" role="listbox" aria-label={label}>
          {shown.length === 0 ? (
            <p className="ss-empty">Tidak ada pilihan yang cocok.</p>
          ) : (
            shown.map((o) => {
              const on = String(o.value) === String(value)
              return (
                <button key={String(o.value)} type="button" role="option" aria-selected={on} className={`ss-opt${on ? ' on' : ''}`} onClick={() => pick(o.value)}>
                  <span className="ss-opt-main">
                    {o.label}
                    {o.hint && <small>{o.hint}</small>}
                  </span>
                  {on && <Check size={17} />}
                </button>
              )
            })
          )}
        </div>
      </Popover>
    </>
  )
}
