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
  /** Ada isian yang belum disimpan: menutup jendela meminta konfirmasi lebih dulu. */
  dirty?: boolean
}

/** Pertanyaan "buang perubahan?" saat jendela berisi isian ditutup. Menangani Esc sendiri agar tidak menutup jendela di bawahnya. */
function DiscardPrompt({ onStay, onDiscard }: { onStay: () => void; onDiscard: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onStay()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onStay])
  return createPortal(
    <div className="dialog-scrim" style={{ zIndex: 95 }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="dialog dialog-sm" role="alertdialog" aria-modal="true" aria-label="Perubahan belum disimpan">
        <div className="dialog-head"><h2>Perubahan belum disimpan</h2></div>
        <div className="dialog-body"><p style={{ margin: 0, color: 'var(--muted)' }}>Jika jendela ditutup sekarang, isian yang sudah kamu ubah akan hilang.</p></div>
        <div className="dialog-foot">
          <button type="button" autoFocus onClick={onStay}>Lanjut mengisi</button>
          <button type="button" className="btn-danger-solid" onClick={onDiscard}>Buang perubahan</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function Modal({ title, onClose, children, footer, size = 'md', dirty = false }: Props) {
  const [asking, setAsking] = useState(false)
  const dirtyRef = useRef(dirty)
  const askingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    dirtyRef.current = dirty
    onCloseRef.current = onClose
    askingRef.current = asking
  })
  const closeRef = useRef(() => {
    if (askingRef.current) return
    if (dirtyRef.current) setAsking(true)
    else onCloseRef.current()
  })

  useEffect(() => {
    const id = {}
    stack.push(id)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    const unlock = lockScroll()
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(id), 1)
      unlock()
    }
  }, [])

  return createPortal(
    <div className="dialog-scrim" onPointerDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div className={`dialog dialog-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={() => closeRef.current()} aria-label="Tutup">
            <X size={20} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
      {asking && <DiscardPrompt onStay={() => setAsking(false)} onDiscard={() => { setAsking(false); onClose() }} />}
    </div>,
    document.body,
  )
}