import { useEffect, useState, type FormEvent } from 'react'
import { Store, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useStore } from '../store/StoreContext'
import PageHeader from '../components/PageHeader'
import { errText } from '../lib/errors'
import { imageUrl, removeImage, uploadStoreLogo } from '../lib/image'

export default function PengaturanToko() {
  const notify = useToast()
  const store = useStore()
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [existingLogo, setExistingLogo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('store_settings').select('name, tagline, logo_path').eq('id', 1).maybeSingle()
      setName(String(data?.name ?? ''))
      setTagline(String(data?.tagline ?? ''))
      setExistingLogo(String(data?.logo_path ?? ''))
      setReady(true)
    })()
  }, [])

  function clearPick() {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
  }

  function pick(f: File | null) {
    if (f && !f.type.startsWith('image/')) {
      notify('File harus berupa gambar (PNG, JPG, atau WebP).', 'error')
      return
    }
    clearPick()
    if (f) {
      setFile(f)
      setPreview(URL.createObjectURL(f))
      setRemoveLogo(false)
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (name.trim() === '') {
      notify('Nama toko wajib diisi.', 'error')
      return
    }
    setBusy(true)
    try {
      let logoPath: string | null = removeLogo ? null : existingLogo || null
      if (file) logoPath = await uploadStoreLogo(file)

      const { data, error } = await supabase
        .from('store_settings')
        .update({ name: name.trim(), tagline: tagline.trim(), logo_path: logoPath })
        .eq('id', 1)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Perubahan ditolak. Hanya superadmin yang boleh mengubah pengaturan toko.')

      if ((file || removeLogo) && existingLogo) await removeImage(existingLogo, 'payment-images')
      setExistingLogo(logoPath ?? '')
      setRemoveLogo(false)
      clearPick()
      await store.refresh()
      notify('Pengaturan toko berhasil disimpan.')
    } catch (err) {
      notify(errText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const logoSrc = removeLogo ? null : preview ?? (existingLogo ? imageUrl(existingLogo, 'payment-images') : null)

  return (
    <div style={{ maxWidth: 560 }}>
      <PageHeader title="Pengaturan Toko" subtitle="Nama dan logo ini tampil di sidebar, halaman login, nota rekap untuk supplier, dan laporan." />

      {!ready ? (
        <div className="skeleton" style={{ height: 320, borderRadius: 14 }} />
      ) : (
        <form noValidate onSubmit={(e) => void save(e)} className="panel form-stack">
          <label className="field">
            <span>Nama toko <span className="req">*</span></span>
            <input maxLength={60} placeholder="Contoh: Toko Kue Bu Sari" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Tagline <span className="hint">(opsional)</span></span>
            <input maxLength={80} placeholder="Contoh: Kue Basah & Camilan" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </label>

          <div className="field">
            <span>Logo toko <span className="hint">(opsional)</span></span>
            <div className="upload">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              <span className="hint">Gambar persegi paling cocok (PNG dengan latar transparan hasilnya paling bagus). Ukuran dikecilkan otomatis.</span>
              {logoSrc && (
                <button
                  type="button"
                  className="btn-sm btn-danger btn-icon"
                  onClick={() => {
                    clearPick()
                    setRemoveLogo(true)
                  }}
                >
                  <Trash2 size={15} /> Hapus logo
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="page-sub" style={{ marginBottom: 6 }}>Pratinjau</div>
            <div className="brand-preview">
              <span className={`brand-logo${logoSrc ? ' has-img' : ''}`}>
                {logoSrc ? <img src={logoSrc} alt="" /> : <Store size={22} />}
              </span>
              <span className="brand-text">
                <span className="brand-name">{name.trim() || 'Nama toko'}</span>
                {tagline.trim() && <span className="brand-sub">{tagline.trim()}</span>}
              </span>
            </div>
          </div>

          <div className="form-actions">
            <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
          </div>
        </form>
      )}
    </div>
  )
}