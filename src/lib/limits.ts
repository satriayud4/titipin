/** Batas wajar untuk nominal dan jumlah, supaya salah ketik angka (misal tambah nol) tertangkap sebelum disimpan. */
export const MAX_RUPIAH = 100_000_000
export const MAX_QTY = 100_000

export const rupiahTooBig = (n: number) => n > MAX_RUPIAH
export const qtyTooBig = (n: number) => n > MAX_QTY

/** Kunci unik per percobaan transaksi; dipakai ulang saat kirim ulang agar tidak tersimpan dua kali. */
export function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`
}

export const isMissingFunction = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? ''))
