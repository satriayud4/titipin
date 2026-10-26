import { useCallback, useRef, useState } from 'react'

/**
 * Mencegah aksi simpan/bayar berjalan dua kali. Klik kedua saat yang pertama belum selesai diabaikan,
 * dan pemeriksaannya memakai ref sehingga langsung berlaku (tidak menunggu render ulang).
 */
export function useSubmitLock() {
  const flag = useRef(false)
  const [locked, setLocked] = useState(false)
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (flag.current) return undefined
    flag.current = true
    setLocked(true)
    try {
      return await fn()
    } finally {
      flag.current = false
      setLocked(false)
    }
  }, [])
  return { locked, run }
}
