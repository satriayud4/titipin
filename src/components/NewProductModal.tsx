import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Camera, ImagePlus, RefreshCw, Store, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { imageUrl, removeImage, uploadProductImage } from '../lib/image'
import { useToast } from './Toast'
import Modal from './Modal'
import { errText } from '../lib/errors'
import './NewProductModal.css'

export interface EditableProduct {
  id: number
  name: string
  category_id: number | null
  image_path: string | null
  unit: string | null
}

interface Props {
  supplierId: number
  supplierName?: string
  categories: { id: number; name: string }[]
  onClose: () => void
  /** Dipanggil setelah produk baru dibuat. */
  onCreated?: (productId: number) => void | Promise<void>
  /** Isi untuk mode ubah: form terisi data produk ini dan gambar boleh tidak diganti. */
  product?: EditableProduct
  onSaved?: (productId: number) => void | Promise<void>
}

const UNITS = ['pcs', 'pack', 'bungkus', 'botol', 'box', 'kg', 'porsi']

export default function NewProductModal({ supplierId, supplierName, categories, onClose, onCreated, product, onSaved }: Props) {
  const notify = useToast()
  const editing = !!product
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(() => categories.find((c) => c.id === product?.category_id)?.name ?? '')
  const [unit, setUnit] = useState(product?.unit ?? 'pcs')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [siblings, setSiblings] = useState<{ id: number; name: string }[]>([])
  const previewRef = useRef<string | null>(null)
  previewRef.current = preview

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  // nama barang yang sudah dimiliki supplier ini, untuk peringatan duplikat
  useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    void supabase
      .from('products')
      .select('id, name')
      .eq('supplier_id', supplierId)
      .then(({ data }) => {
        if (!cancelled) setSiblings((data ?? []) as { id: number; name: string }[])
      })
    return () => {
      cancelled = true
    }
  }, [supplierId])

  function pick(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      notify('File harus berupa gambar (JPG, PNG, atau WebP).', 'error')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDrag(false)
    pick(e.dataTransfer.files?.[0] ?? null)
  }

  const catChips = useMemo(() => {
    const q = category.trim().toLowerCase()
    const list = categories.filter((c) => q === '' || c.name.toLowerCase().includes(q))
    return list.slice(0, 10)
  }, [categories, category])
  const catIsNew = category.trim() !== '' && !categories.some((c) => c.name.toLowerCase() === category.trim().toLowerCase())

  const dup = siblings.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase() && s.id !== product?.id)
  const initialCategory = categories.find((c) => c.id === product?.category_id)?.name ?? ''
  const dirty = name !== (product?.name ?? '') || category !== initialCategory || unit !== (product?.unit ?? 'pcs') || file !== null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (name.trim() === '') return notify('Nama produk wajib diisi.', 'error')
    if (dup) return notify(`Barang "${dup.name}" sudah ada${supplierName ? ` untuk ${supplierName}` : ''}. Pilih barang itu di daftar, atau gunakan nama lain.`, 'error')
    if (category.trim() === '') return notify('Kategori wajib diisi.', 'error')
    if (unit.trim() === '') return notify('Satuan wajib diisi.', 'error')
    if (!editing && !file) return notify('Gambar produk wajib diunggah. Ambil foto atau pilih gambar terlebih dahulu.', 'error')
    if (editing && !file && !product?.image_path) return notify('Gambar produk wajib ada. Ambil foto atau pilih gambar terlebih dahulu.', 'error')
    if (!editing && !supplierId) return notify('Pilih supplier terlebih dahulu.', 'error')

    setBusy(true)
    try {
      const image = file ? await uploadProductImage(file) : (product?.image_path as string)

      // kategori: pakai yang sudah ada, atau buat baru
      let catId = categories.find((c) => c.name.toLowerCase() === category.trim().toLowerCase())?.id
      if (catId === undefined) {
        const { data, error } = await supabase.from('categories').insert({ name: category.trim() }).select('id').single()
        if (error) throw error
        catId = data.id as number
      }

      if (product) {
        const { error } = await supabase
          .from('products')
          .update({ name: name.trim(), category_id: catId, unit: unit.trim(), image_path: image })
          .eq('id', product.id)
        if (error) throw error
        if (file && product.image_path && product.image_path !== image) void removeImage(product.image_path, 'product-images').catch(() => undefined)
        notify('Produk diperbarui.')
        await onSaved?.(product.id)
        return
      }

      const { data: prod, error } = await supabase
        .from('products')
        .insert({ name: name.trim(), category_id: catId, unit: unit.trim(), image_path: image, supplier_id: supplierId })
        .select('id')
        .single()
      if (error) throw error

      notify('Produk baru ditambahkan.')
      await onCreated?.(prod.id as number)
    } catch (err) {
      notify(errText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      dirty={dirty}
      title={editing ? 'Ubah produk' : 'Produk baru'}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>Batal</button>
          <button type="submit" form="np-form" className="btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan produk'}</button>
        </>
      }
    >
      <form id="np-form" noValidate onSubmit={(e) => void save(e)} className="np-form">
        {!editing && supplierName && (
          <div className="np-owner">
            <Store size={16} />
            <span>Milik supplier <b>{supplierName}</b></span>
          </div>
        )}

        <div className="np-photo-wrap">
          <div
            className={`np-drop${drag ? ' drag' : ''}${preview || product?.image_path ? ' has' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            {preview || product?.image_path ? (
              <img src={preview ?? imageUrl(product!.image_path!)} alt="Pratinjau gambar produk" />
            ) : (
              <div className="np-drop-empty">
                <ImagePlus size={34} />
                <b>Foto produk <span className="req">*</span></b>
                <small>Wajib, hanya diminta sekali</small>
              </div>
            )}
          </div>
          <div className="np-photo-actions">
            <label className="np-btn">
              <Camera size={17} /> {preview || product?.image_path ? 'Foto ulang' : 'Ambil foto'}
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = '' }} />
            </label>
            <label className="np-btn">
              {preview || product?.image_path ? <RefreshCw size={17} /> : <Upload size={17} />} {preview || product?.image_path ? 'Ganti gambar' : 'Pilih gambar'}
              <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = '' }} />
            </label>
          </div>
        </div>

        <label className="field">
          <span>Nama produk <span className="req">*</span></span>
          <input value={name} placeholder="Contoh: Keripik Singkong Pedas" autoFocus onChange={(e) => setName(e.target.value)} />
          {dup && (
            <span className="hint" style={{ color: 'var(--warning)' }}>
              Barang ini sudah ada{supplierName ? ` untuk ${supplierName}` : ''}. Pilih dari daftar barang, atau gunakan nama lain.
            </span>
          )}
        </label>

        <div className="field">
          <span>Kategori <span className="req">*</span></span>
          <input value={category} placeholder="Pilih di bawah atau ketik kategori baru" onChange={(e) => setCategory(e.target.value)} aria-label="Kategori" />
          {(catChips.length > 0 || catIsNew) && (
            <div className="np-chips" role="group" aria-label="Pilihan kategori">
              {catChips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`np-chip${c.name.toLowerCase() === category.trim().toLowerCase() ? ' on' : ''}`}
                  onClick={() => setCategory(c.name)}
                >
                  {c.name}
                </button>
              ))}
              {catIsNew && <span className="np-chip new">+ Kategori baru: {category.trim()}</span>}
            </div>
          )}
        </div>

        <div className="field">
          <span>Satuan <span className="req">*</span></span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Satuan" />
          <div className="np-chips" role="group" aria-label="Pilihan satuan">
            {UNITS.map((u) => (
              <button key={u} type="button" className={`np-chip${unit.trim().toLowerCase() === u ? ' on' : ''}`} onClick={() => setUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}
