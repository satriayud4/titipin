import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLElement | null>
  width: number
  /** Perkiraan tinggi, dipakai untuk memilih buka ke atas atau ke bawah. */
  height: number
  label: string
  children: ReactNode
}

/** Popover untuk desktop, panel dari bawah untuk HP. Dipakai kalender, rentang tanggal, dan jam. */
export default function Popover({ open, onClose, anchor, width, height, label, children }: Props) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const [sheet, setSheet] = useState(false)
  const pop = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  const place = useCallback(() => {
    const el = anchor.current
    if (!el) return
    const narrow = window.innerWidth < 640
    setSheet(narrow)
    if (narrow) return
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const below = window.innerHeight - r.bottom
    if (below < height + 12 && r.top > below) setPos({ bottom: window.innerHeight - r.top + 8, left })
    else setPos({ top: r.bottom + 8, left })
  }, [anchor, width, height])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // jangan ikut menutup jendela form di belakangnya
        closeRef.current()
        anchor.current?.focus()
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (pop.current?.contains(t) || anchor.current?.contains(t)) return
      closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open, anchor])

  if (!open) return null
  return createPortal(
    <>
      {sheet && <div className="dp-scrim" onPointerDown={() => onClose()} />}
      <div
        ref={pop}
        className={`dp-pop${sheet ? ' dp-sheet' : ''}`}
        style={sheet ? undefined : { position: 'fixed', width, left: pos?.left ?? 0, top: pos?.top, bottom: pos?.bottom, visibility: pos ? 'visible' : 'hidden' }}
        role="dialog"
        aria-label={label}
      >
        {sheet && <span className="dp-grab" aria-hidden="true" />}
        {children}
      </div>
    </>,
    document.body,
  )
}
