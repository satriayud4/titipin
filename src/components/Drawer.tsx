import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { lockScroll } from '../lib/scrollLock'
import './ui.css'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** Panel detail: muncul dari kanan di desktop, dari bawah (bottom sheet) di HP. Halaman di belakangnya tetap utuh. */
export default function Drawer({ title, subtitle, onClose, children, footer }: Props) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    const unlock = lockScroll()
    const onKey = (e: KeyboardEvent) => {
      // jangan ikut menutup bila ada dialog konfirmasi di atasnya
      if (e.key === 'Escape' && !document.querySelector('.dialog-scrim')) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      unlock()
    }
  }, [])

  return createPortal(
    <div className="dr-scrim" onPointerDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <aside className="dr" role="dialog" aria-modal="true" aria-label={title}>
        <span className="dr-grab" aria-hidden="true" />
        <header className="dr-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={20} />
          </button>
        </header>
        <div className="dr-body">{children}</div>
        {footer && <footer className="dr-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  )
}

/** Baris "label: nilai" untuk isi drawer. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dr-row">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  )
}
