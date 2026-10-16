import { useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { GROUPS, canSee } from '../lib/nav'

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const role = profile?.role ?? 'kasir'
  const isSuper = !!profile?.is_superadmin
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GROUPS.flatMap((g) =>
      g.items.filter((i) => canSee(i, role, isSuper)).map((i) => ({ ...i, group: g.title })),
    ).filter((i) => i.label.toLowerCase().includes(q))
  }, [role, isSuper, query])

  function go(to: string) {
    onClose()
    navigate(to)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && items[sel]) {
      go(items[sel].to)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label="Cari halaman" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-head">
          <Search size={18} />
          <input
            className="palette-input"
            autoFocus
            placeholder="Cari halaman…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
            }}
            onKeyDown={onKey}
          />
        </div>
        <div className="palette-list">
          {items.length === 0 && <div className="empty">Tidak ada halaman yang cocok.</div>}
          {items.map((it, i) => (
            <button
              type="button"
              key={it.to}
              className={`palette-item${i === sel ? ' sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(it.to)}
            >
              <it.icon size={18} />
              <span>{it.label}</span>
              <small>{it.group}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}