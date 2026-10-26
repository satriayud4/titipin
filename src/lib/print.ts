/**
 * Cetak halaman. mode "page": seluruh isi halaman tanpa menu (laporan). mode "receipt": hanya jendela yang terbuka
 * (bukti transaksi), dengan lebar struk.
 */
export function printPage(mode: 'page' | 'receipt' = 'page') {
  const root = document.documentElement
  root.dataset.print = mode
  const done = () => {
    delete root.dataset.print
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  // beri waktu browser menerapkan gaya cetak sebelum dialog cetak dibuka
  window.setTimeout(() => window.print(), 50)
}
