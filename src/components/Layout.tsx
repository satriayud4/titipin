import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Info, Menu, Search, X } from 'lucide-react'
import { useAuth, type Role } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { GROUPS, TABS, canSee } from '../lib/nav'
import { useAlerts } from '../lib/alerts'
import { NotificationsMenu, UserMenu } from './HeaderMenus'
import CommandPalette from './CommandPalette'
import BrandMark from './BrandMark'

export default function Layout() {
  const { profile } = useAuth()
  const store = useStore()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const role: Role = profile?.role ?? 'kasir'
  const isSuper = !!profile?.is_superadmin
  const alerts = useAlerts(location.pathname)
  const close = () => setOpen(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const linkClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`
  const tabClass = ({ isActive }: { isActive: boolean }) => `tab${isActive ? ' active' : ''}`

  return (
    <div className="app">
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Menu utama">
        <div className="brand">
          <Link to="/" className="brand-link" onClick={close} aria-label={`Ke dashboard ${store.name}`}>
            <BrandMark size={22} />
            <span className="brand-text">
              <span className="brand-name">{store.name}</span>
              {store.tagline && <span className="brand-sub">{store.tagline}</span>}
            </span>
          </Link>
          <button type="button" className="icon-btn drawer-close" onClick={close} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-scroll">
          {GROUPS.map((g) => {
            const items = g.items.filter((it) => canSee(it, role, isSuper))
            if (items.length === 0) return null
            return (
              <div key={g.title} className="nav-group">
                <div className="nav-group-title">{g.title}</div>
                {items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.to === '/'} className={linkClass} onClick={close}>
                    <it.icon size={18} />
                    {it.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
      </aside>

      <div className={`scrim${open ? ' show' : ''}`} onClick={close} />

      <div className="content">
        <header className="header">
          <Link to="/" className="brand-mini" aria-label={`Ke dashboard ${store.name}`}>
            <BrandMark size={18} />
            <span className="brand-name">{store.name}</span>
          </Link>
          <button type="button" className="search-btn" onClick={() => setPaletteOpen(true)} aria-label="Cari halaman">
            <Search size={18} />
            <span className="search-text">Cari halaman…</span>
            <span className="kbd">Ctrl K</span>
          </button>
          <span className="spacer" />
          <NotificationsMenu alerts={alerts} />
          <UserMenu />
        </header>

        <main className="main">
          <div className="page" key={location.pathname}>
            {isSuper && store.loaded && !store.isSet && (
              <div className="notice notice-info" style={{ marginBottom: 14 }}>
                <Info size={18} />
                <span>Nama toko belum diatur. <Link to="/pengaturan">Atur sekarang</Link></span>
              </div>
            )}
            <Outlet context={{ alerts }} />
          </div>
        </main>
      </div>

      <nav className="tabbar" aria-label="Navigasi cepat">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={tabClass}>
            <t.icon size={22} />
            <span>{t.label}</span>
          </NavLink>
        ))}
        <button type="button" className="tab" onClick={() => setOpen(true)}>
          <Menu size={22} />
          <span>Menu</span>
        </button>
      </nav>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}