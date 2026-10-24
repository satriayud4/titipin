import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { RotateCcw, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'

export interface Choice {
  value: string
  label: string
  icon?: LucideIcon
}

export type OptionGroup =
  | { type: 'seg'; key: string; label: string; choices: Choice[]; hint?: string; hidden?: boolean }
  | { type: 'toggle'; key: string; label: string; hint?: string; hidden?: boolean }

interface Props {
  groups: OptionGroup[]
  values: Record<string, string | boolean | number>
  onChange: (key: string, value: string | boolean) => void
  onReset?: () => void
  title?: string
  /** teks tombol; disembunyikan di layar sempit */
  label?: string
  footer?: ReactNode
}

/** Tombol "Tampilan" + panel pilihan layout. Popover di PC, lembar bawah di HP. */
export default function ViewOptions({ groups, values, onChange, onReset, title = 'Tampilan & layout', label = 'Tampilan', footer }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="vo" ref={wrap}>
      <button
        type="button"
        className={`vo-btn${open ? ' on' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal size={17} />
        <span className="vo-label">{label}</span>
      </button>

      {open && <div className="vo-scrim" onClick={() => setOpen(false)} />}
      {open && (
        <div className="vo-panel" id={id} role="dialog" aria-label={title}>
          <div className="vo-head">
            <strong>{title}</strong>
            <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Tutup">
              <X size={18} />
            </button>
          </div>

          <div className="vo-body">
            {groups
              .filter((g) => !g.hidden)
              .map((g) =>
                g.type === 'seg' ? (
                  <div className="vo-group" key={g.key}>
                    <div className="vo-title">{g.label}</div>
                    <div className="vo-seg" role="radiogroup" aria-label={g.label}>
                      {g.choices.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          role="radio"
                          aria-checked={values[g.key] === c.value}
                          className={values[g.key] === c.value ? 'on' : ''}
                          onClick={() => onChange(g.key, c.value)}
                        >
                          {c.icon && <c.icon size={15} />}
                          {c.label}
                        </button>
                      ))}
                    </div>
                    {g.hint && <div className="vo-hint">{g.hint}</div>}
                  </div>
                ) : (
                  <label className="vo-toggle" key={g.key}>
                    <span>
                      {g.label}
                      {g.hint && <small>{g.hint}</small>}
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={!!values[g.key]}
                      onChange={(e) => onChange(g.key, e.target.checked)}
                    />
                  </label>
                ),
              )}
            {footer}
          </div>

          {onReset && (
            <div className="vo-foot">
              <button type="button" className="btn-ghost btn-sm btn-icon" onClick={onReset}>
                <RotateCcw size={14} /> Kembalikan bawaan
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(false)}>
                Selesai
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
