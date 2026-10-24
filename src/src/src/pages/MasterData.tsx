import { useEffect, useState } from 'react'
import CrudPage from '../components/CrudPage'
import { supabase } from '../lib/supabase'

export function CategoriesPage() {
  return (
    <CrudPage
      title="Kategori"
      subtitle="Kelompok untuk memudahkan mencari produk."
      noun="kategori"
      table="categories"
      relation={{ table: 'products', fk: 'category_id', render: (n) => (n === 0 ? 'Belum ada produk' : `${n} produk`), sortLabel: 'Produk terbanyak' }}
      fields={[{ key: 'name', label: 'Nama kategori', type: 'text', required: true, placeholder: 'Contoh: Kue Basah' }]}
    />
  )
}

export function SuppliersPage() {
  return (
    <CrudPage
      title="Supplier"
      subtitle="Penitip barang ke toko. Nomor HP dipakai untuk mengirim rekap setoran lewat WhatsApp."
      noun="supplier"
      table="suppliers"
      relation={{ table: 'batch_stock', fk: 'supplier_id', sumColumn: 'qty_remaining', positiveOnly: true, render: (n) => (n === 0 ? 'Tidak ada stok' : `${n} barang tersisa`), sortLabel: 'Stok terbanyak' }}
      fields={[
        { key: 'name', label: 'Nama supplier', type: 'text', required: true },
        { key: 'phone', label: 'No. HP', type: 'text', required: true, placeholder: 'Contoh: 081234567890' },
        { key: 'notes', label: 'Catatan', type: 'text' },
        { key: 'is_active', label: 'Status', type: 'checkbox' },
      ]}
    />
  )
}

export function ProductsPage() {
  const [categories, setCategories] = useState<{ value: number; label: string }[]>([])

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCategories((data ?? []).map((c) => ({ value: c.id as number, label: c.name as string }))))
  }, [])

  return (
    <CrudPage
      title="Produk"
      subtitle="Katalog produk toko. Stok dan harga dicatat lewat Barang Masuk."
      noun="produk"
      table="products"
      layout="grid"
      relation={{ table: 'batch_stock', fk: 'product_id', sumColumn: 'qty_remaining', positiveOnly: true, render: (n) => (n === 0 ? 'Stok kosong' : `Stok ${n}`), sortLabel: 'Stok terbanyak' }}
      fields={[
        { key: 'name', label: 'Nama produk', type: 'text', required: true },
        { key: 'category_id', label: 'Kategori', type: 'select', required: true, options: categories },
        { key: 'unit', label: 'Satuan', type: 'text', defaultValue: 'pcs', required: true },
        { key: 'image_path', label: 'Gambar produk', type: 'image', required: true },
        { key: 'is_active', label: 'Status', type: 'checkbox' },
      ]}
    />
  )
}