import { useCallback, useState } from 'react'

/**
 * State yang tersimpan di perangkat (localStorage). Nilai yang rusak atau tidak dikenal diabaikan,
 * dan localStorage yang diblokir (mode privat) tidak membuat halaman error.
 */
export function useStoredState<T extends Record<string, string | boolean | number>>(key: string, defaults: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return defaults
      const saved = JSON.parse(raw) as Record<string, unknown>
      const next = { ...defaults }
      for (const k of Object.keys(defaults)) {
        if (typeof saved?.[k] === typeof defaults[k]) (next as Record<string, unknown>)[k] = saved[k]
      }
      return next
    } catch {
      return defaults
    }
  })

  const persist = (v: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* penyimpanan tidak tersedia: preferensi hanya berlaku selama sesi */
    }
  }

  const patch = useCallback(
    (changes: Partial<T>) => {
      setValue((cur) => {
        const next = { ...cur, ...changes }
        persist(next)
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  const reset = useCallback(() => {
    setValue(defaults)
    persist(defaults)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [value, patch, reset] as const
}
