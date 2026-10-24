import { supabase } from './supabase'

export type Bucket = 'product-images' | 'payment-images'

export async function compressImage(file: File, maxSize = 800, quality = 0.8, png = false): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Gagal memproses gambar')
  if (!png) {
    ctx.fillStyle = '#fff' // latar putih agar PNG transparan tidak berubah jadi hitam
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar'))), png ? 'image/png' : 'image/jpeg', quality),
  )
}

export const imageUrl = (path: string, bucket: Bucket = 'product-images') =>
  supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl

async function upload(file: File, bucket: Bucket, maxSize: number, quality: number, png = false) {
  const blob = await compressImage(file, maxSize, quality, png)
  const path = `${crypto.randomUUID()}.${png ? 'png' : 'jpg'}`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: png ? 'image/png' : 'image/jpeg' })
  if (error) throw error
  return path
}

export const uploadProductImage = (file: File) => upload(file, 'product-images', 800, 0.8)
export const uploadQrisImage = (file: File) => upload(file, 'payment-images', 1400, 0.92)
export const uploadStoreLogo = (file: File) => upload(file, 'payment-images', 512, 0.9, true)

export async function removeImage(path: string, bucket: Bucket) {
  await supabase.storage.from(bucket).remove([path])
}