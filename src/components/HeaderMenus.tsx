import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, CircleAlert, Info, LogOut, TriangleAlert } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import type { AlertItem } from '../lib/alerts'
import ThemeToggle from './ThemeToggle'

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, setOpen, ref }
}

const alertIcon = (kind: AlertItem['kind']) =>
  kind === 'danger' ? <CircleAlert size={18} /> : kind === 'warning' ? <TriangleAlert size={18} /> : <Info size={18} />

export function NotificationsMenu({ alerts }: { alerts: AlertItem[] }) {
  const { open, setOpen, ref } = usePopover()
  const navigate = useNavigate()

  return (
    <div className="pop-wrap" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Notifikasi" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bell size={20} />
        {alerts.length > 0 && <span className="dot-badge">{alerts.length > 9 ? '9+' : alerts.length}</span>}
      </button>
      {open && (
        <div className="popover">
          <div className="popover-title">Notifikasi</div>
          {alerts.length === 0 && <div className="empty" style={{ padding: '20px 12px' }}>Semua beres. Tidak ada yang perlu ditindaklanjuti.</div>}
          {alerts.map((a) => (
            <button
              type="button"
              key={a.id}
              className="alert-item"
              onClick={() => {
                setOpen(false)
                navigate(a.to)
              }}
            >
              <span className={`alert-ico ${a.kind}`}>{alertIcon(a.kind)}</span>
              <span>
                <strong>{a.title}</strong>
                <small>{a.detail}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function UserMenu() {
  const { profile, signOut } = useAuth()
  const { open, setOpen, ref } = usePopover()
  const name = profile?.full_name || 'Pengguna'
  const role = profile?.is_superadmin ? 'Superadmin' : profile?.role === 'admin' ? 'Admin' : 'Kasir'
  const initial = name.trim().charAt(0).toUpperCase()

  return (
    <div className="pop-wrap" ref={ref}>
      <button type="button" className="user-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar">{initial}</span>
        <span className="user-meta">
          <span className="user-name">{name}</span>
          <span className="user-role">{role}</span>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="popover">
          <div className="popover-head">
            <div className="user-name">{name}</div>
            <div className="user-role">{role}</div>
          </div>
          <ThemeToggle withLabel />
          <button type="button" className="btn-ghost" onClick={() => void signOut()}>
            <LogOut size={16} /> Keluar
          </button>
        </div>
      )}
    </div>
  )
}