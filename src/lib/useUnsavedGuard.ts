import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConfirm } from '../components/ConfirmDialog'

/**
 * Peringatan perubahan belum disimpan untuk halaman penuh: menutup tab/memuat ulang memunculkan peringatan browser,
 * dan menekan tautan menu menampilkan dialog konfirmasi lebih dulu.
 */
export function useUnsavedGuard(dirty: boolean) {
  const confirm = useConfirm()
  const navigate = useNavigate()

  useEffect(() => {
    if (!dirty) return
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname + url.search === window.location.pathname + window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      void confirm({
        title: 'Perubahan belum disimpan',
        message: 'Jika pindah halaman sekarang, perubahan yang belum disimpan akan hilang.',
        confirmText: 'Pindah halaman',
        cancelText: 'Tetap di sini',
        tone: 'danger',
      }).then((ok) => {
        if (ok) navigate(url.pathname + url.search + url.hash)
      })
    }
    window.addEventListener('beforeunload', onBefore)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBefore)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty, confirm, navigate])
}
