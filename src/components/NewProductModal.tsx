import { useState, type FormEvent } from 'react'
import { ImagePlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { uploadProductImage } from '../lib/image'
import { useToast } from './Toast'
import Modal from './Modal'
import { errText } from '../lib/errors'

interface Props {
  categories: { id: number; name: string }[]
  onClose: () => void
  onCreated: (productId: number) => void | Promise<void>
}

export default function NewProductModal({ categories, onClose, onCreated }: Props) {
  const notify = useToast()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('pcs')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function pick(f: File | null) {
    if (f && !f.type.startsWith('image/')) {
      notify('File harus berupa gambar (JPG, PNG, atau WebP).', 'error')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (name.trim() === '') return notify('Nama produk wajib diisi.', 'error')
    if (category.trim() === '') return notify('Kategori wajib diisi.', 'error')
    if (unit.trim() === '') return notify('Satuan wajib diisi.', 'error')
    if (!file) return notify('Gambar produk wajib diunggah. Pilih gambar terlebih dahulu.', 'error')

    setBusy(true)
    try {
      const image = await uploadProductImage(file)

      // kategori: pakai yang sudah ada, atau buat baru
      let catId = categories.find((c) => c.name.toLowerCase() === category.trim().toLowerCase())?.id
      if (catId === undefined) {
        const { data, error } = await supabase.from('categories').insert({ name: category.trim() }).select('id').single()
        if (error) throw error
        catId = data.id as number
      }

      const { data: prod, error } = await supabase
        .from('products')
        .insert({ name: name.trim(), category_id: catId, unit: unit.trim(), image_path: image })
        .select('id')
        .single()
      if (error) throw error

      notify('Produk baru ditambahkan.')
      if (preview) URL.revokeObjectURL(preview)
      await onCreated(prod.id as number)
    } catch (err) {
      notify(errText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Produk baru" onClose={() => !busy && onClose()}>
      <form noValidate onSubmit={(e) => void save(e)} className="form-stack">
        <small>Tanda <span className="req">*</span> wajib diisi. Gambar hanya diminta sekali, saat produk dibuat.</small>
        <label className="field">
          <span>Nama produk <span className="req">*</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Kategori <span className="req">*</span></span>
          <input list="np-cats" placeholder="Pilih atau ketik kategori baru" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="np-cats">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </label>
        <label className="field">
          <span>Satuan <span className="req">*</span></span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <div className="field">
          <span>Gambar produk <span className="req">*</span></span>
          <div className="upload">
            {preview ? <img className="upload-preview" src={preview} alt="" /> : <div className="upload-preview"><ImagePlus size={30} /></div>}
            <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={busy}>Batal</button>
          <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan produk'}</button>
        </div>
      </form>
    </Modal>
  )
}