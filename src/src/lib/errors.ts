export function errText(err: unknown): string {
  const e = err as { message?: string; code?: string } | null
  const msg = e?.message ?? ''
  if (msg.includes('products_image_required')) return 'Gambar produk wajib diunggah.'
  if (msg.includes('products_category_required')) return 'Kategori wajib dipilih.'
  if (msg.includes('suppliers_phone_required')) return 'No. HP supplier wajib diisi.'
  if (msg.includes('_not_blank')) return 'Kolom wajib tidak boleh kosong.'
  if (e?.code === '23505') return 'Data dengan nama itu sudah ada.'
  if (e?.code === '23503') return 'Data ini masih dipakai di tempat lain, jadi tidak bisa dihapus.'
  if (e?.code === '23502') return 'Ada kolom wajib yang belum diisi.'
  return msg || 'Terjadi kesalahan, coba lagi.'
}