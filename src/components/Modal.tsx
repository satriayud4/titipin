import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { lockScroll } from '../lib/scrollLock'

const stack: object[] = [] // jendela paling atas yang menanggapi tombol Esc

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
  /** Ada isian yang belum disimpan: menutup jendela (X, Esc, klik luar) meminta konfirmasi dulu. */
  dirty?: boolean
}

export default function Modal({ title, onClose, children, footer, size = 'md', dirty = false }: Props) {
  const [asking, setAsking] = useState(false)
  const closeRef = useRef(onClose)
  const dirtyRef = useRef(dirty)
  const askingRef = useRef(false)
  useEffect(() => {
    closeRef.current = onClose
    dirtyRef.current = dirty
    askingRef.current = asking
  })

  function requestClose() {
    if (dirtyRef.current) setAsking(true)
    else closeRef.current()
  }
  const requestRef = useRef(requestClose)
  requestRef.current = requestClose

  useEffect(() => {
    const id = {}
    stack.push(id)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== id) return
      if (askingRef.current) setAsking(false)
      else requestRef.current()
    }
    window.addEventListener('keydown', onKey)
    const unlock = lockScroll()
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(id), 1)
      unlock()
    }
  }, [])

  // tutup tab atau muat ulang saat ada isian belum tersimpan
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return createPortal(
    <div className="dialog-scrim" onPointerDown={(e) => e.target === e.currentTarget && !asking && requestRef.current()}>
      <div className={`dialog dialog-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={() => requestRef.current()} aria-label="Tutup">
            <X size={20} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
      {asking && (
        <div className="dialog-scrim" style={{ zIndex: 1 }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="dialog dialog-sm" role="alertdialog" aria-modal="true" aria-label="Perubahan belum disimpan">
            <div className="dialog-head">
              <h2>Perubahan belum disimpan</h2>
            </div>
            <div className="dialog-body">
              <p style={{ margin: 0, color: 'var(--muted)' }}>Isian yang sudah diketik akan hilang jika jendela ini ditutup.</p>
            </div>
            <div className="dialog-foot">
              <button type="button" autoFocus onClick={() => setAsking(false)}>Lanjut mengisi</button>
              <button type="button" className="btn-danger-solid" onClick={() => closeRef.current()}>Buang perubahan</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
