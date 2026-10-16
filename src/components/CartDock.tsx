import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Trash2 } from 'lucide-react'
import Sheet from './Sheet'
import { useMediaQuery } from '../lib/useMediaQuery'

interface Props {
  title: string
  subtitle: string
  hasItems: boolean
  emptyText: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onClear?: () => void
  bar: ReactNode
  body: ReactNode
  foot: ReactNode
}

// Komputer: panel menempel di samping. HP: bar di bawah layar, lalu lembar bawah saat dibuka.
export default function CartDock({ title, subtitle, hasItems, emptyText, open, onOpenChange, onClear, bar, body, foot }: Props) {
  const isDesktop = useMediaQuery('(min-width: 1100px)')

  useEffect(() => {
    if (isDesktop && open) onOpenChange(false)
  }, [isDesktop, open, onOpenChange])

  const panel = (
    <>
      <div className="cart-head">
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div className="page-sub">{subtitle}</div>
        </div>
        <div className="cart-head-actions">
          {hasItems && onClear && (
            <button type="button" className="btn-ghost btn-sm btn-icon" onClick={onClear}>
              <Trash2 size={15} /> Kosongkan
            </button>
          )}
          {!isDesktop && (
            <button type="button" className="btn-ghost btn-sm btn-icon" onClick={() => onOpenChange(false)}>
              <ChevronDown size={16} /> Tutup
            </button>
          )}
        </div>
      </div>
      <div className="cart-body">
        {hasItems ? body : <div className="empty" style={{ padding: '32px 8px' }}>{emptyText}</div>}
      </div>
      {hasItems && <div className="cart-foot">{foot}</div>}
    </>
  )

  if (isDesktop) return <aside className="cart" aria-label={title}>{panel}</aside>

  return (
    <>
      {open && <Sheet label={title} onClose={() => onOpenChange(false)}>{panel}</Sheet>}
      {hasItems &&
        !open &&
        createPortal(
          <button type="button" className="cart-bar" onClick={() => onOpenChange(true)}>
            {bar}
          </button>,
          document.body,
        )}
    </>
  )
}