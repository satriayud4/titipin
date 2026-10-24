import { rupiah } from './format'
import { profit, type ReportData } from './report'

export type Cell = string | number

function esc(v: Cell) {
  let s = String(v)
  // teks yang diawali = + - @ diberi tanda kutip agar tidak dibaca Excel sebagai rumus
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Pemisah titik koma + BOM agar terbuka rapi di Excel dengan pengaturan regional Indonesia
export const csvBlob = (rows: Cell[][]) =>
  new Blob(['\uFEFF' + rows.map((r) => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 0812xxxx / 812xxxx / +62812xxxx -> 62812xxxx (format wa.me). null jika tidak valid.
export function waNumber(phone: string | null | undefined) {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('0')) d = '62' + d.slice(1)
  else if (d.startsWith('8')) d = '62' + d
  return d.startsWith('62') && d.length >= 10 && d.length <= 15 ? d : null
}

export function waText(o: {
  appName: string
  supplier: string
  dateLabel: string
  soldQty: number
  payable: number
  paid: number
  promoLines?: string[]
}) {
  const rest = Math.max(o.payable - o.paid, 0)
  return [
    `Halo ${o.supplier}, berikut rekap setoran ${o.appName} tanggal ${o.dateLabel}.`,
    '',
    `Barang terjual: ${o.soldQty}`,
    `Total tagihan: ${rupiah(o.payable)}`,
    `Sudah dibayar: ${rupiah(o.paid)}`,
    rest > 0 ? `Sisa tagihan: ${rupiah(rest)}` : 'Status: Lunas',
    ...(o.promoLines && o.promoLines.length > 0 ? ['', 'Catatan promo:', ...o.promoLines] : []),
    '',
    'Terima kasih.',
  ].join('\n')
}

// Cetak selalu memakai tema terang agar hemat tinta, lalu tema dikembalikan
export function printInLightMode() {
  const root = document.documentElement
  const prev = root.dataset.theme
  root.dataset.theme = 'light'
  const restore = () => {
    if (prev) root.dataset.theme = prev
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  window.print()
}

  export function reportCsv(data: ReportData, from: string, to: string, storeName: string): Cell[][] {
  const s = data.summary
  const gross = s.omzet - s.cogs
  const net = profit(s)
  const margin = s.omzet > 0 ? (net / s.omzet) * 100 : 0
  return [
    ['Laporan Penjualan', storeName],
    ['Periode', `${from} s/d ${to}`],
    [],
    ['RINGKASAN'],
    ['Omzet (total penjualan)', s.omzet],
    ['Modal barang terjual', s.cogs],
    ['Laba kotor', gross],
    ['Rugi barang rusak (ditanggung toko)', s.rusak_cost],
    ['Laba bersih (estimasi)', net],
    ['Margin', `${margin.toFixed(1).replace('.', ',')}%`],
    ['Jumlah transaksi', s.transactions],
    ['Barang terjual', s.items_sold],
    ['Tunai', s.tunai],
    ['Transfer', s.transfer],
    ['QRIS', s.qris],
    [],
    ['PENJUALAN PER HARI'],
    ['Tanggal', 'Omzet', 'Modal barang terjual', 'Rusak ditanggung toko', 'Laba bersih', 'Transaksi'],
    ...data.daily.map((d) => [d.day, d.omzet, d.cogs, d.rusak_cost, d.omzet - d.cogs - d.rusak_cost, d.transactions]),
    [],
    ['PER SUPPLIER'],
    ['Supplier', 'Terjual', 'Omzet', 'Modal (setoran)', 'Laba', 'Rusak toko'],
    ...data.suppliers.map((r) => [r.name, r.qty, r.omzet, r.cogs, r.omzet - r.cogs, r.rusak_cost]),
    [],
    ['PRODUK TERLARIS'],
    ['Produk', 'Terjual', 'Omzet', 'Laba'],
    ...data.products.map((r) => [r.name, r.qty, r.omzet, r.omzet - r.cogs]),
  ]
}