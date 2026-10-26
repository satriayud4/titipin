import { useEffect, useMemo, useState } from 'react'

/** Paginasi di sisi klien: halaman kembali ke 1 saat `resetKey` berubah (mis. filter diganti). */
export function usePagination<T>(items: T[], resetKey: string, initialSize = 25) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialSize)
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, pages)

  useEffect(() => {
    setPage(1)
  }, [resetKey, pageSize])

  const slice = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize])
  return { page: current, pages, pageSize, total: items.length, slice, setPage, setPageSize }
}
