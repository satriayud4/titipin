import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ImagePlus, Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import { errText } from '../lib/errors'
import { imageUrl, removeImage, uploadQrisImage } from '../lib/image'

type Type = 'transfer' | 'qris'
interface Account {
  id: number
  type: Type
  name: string
  account_number: string | null
  account_holder: string | null
  image_path: string | null
  is_active: boolean
}

function Section({ type }: { type: Type }) {
  const notify = useToast()
  const confirm = useConfirm()
  const isTf = type === 'transfer'
  const [rows, setRows] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<'new' | number | null>(null)
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [holder, setHolder] = useState('')
  const [active, setActive] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [existing, setExisting] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('payment_accounts').select('*').eq('type', type).order('id')
    if (error) notify(errText(error), 'error')
    else setRows((data ?? []) as Account[])
    setLoading(false)
  }, [type, notify])

  useEffect(() => {
    void load()
  }, [load])

  function resetFile() {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
  }

  function closeForm() {
    resetFile()
    setExisting('')
    setEditing(null)
  }

  function startNew() {
    resetFile()
    setName('')
    setNumber('')
    setHolder('')
    setActive(true)
    setExisting('')
    setEditing('new')
  }

  function startEdit(a: Account) {
    resetFile()
    setName(a.name)
    setNumber(a.account_number ?? '')
    setHolder(a.account_holder ?? '')
    setActive(a.is_active)
    setExisting(a.image_path ?? '')
    setEditing(a.id)
  }

  function pick(f: File | null) {
    if (f && !f.type.startsWith('image/')) {
      notify('File harus berupa gambar (JPG, PNG, atau WebP).', 'error')
      return
    }
    resetFile()
    if (f) {
      setFile(f)
      setPreview(URL.createObjectURL(f))
    }
  }

  function validate(): string {
    if (name.trim() === '') return isTf ? 'Nama bank wajib diisi.' : 'Nama QRIS wajib diisi.'
    if (isTf) {
      if (number.trim() === '') return 'Nomor rekening wajib diisi.'
      if (!/^\d{5,}$/.test(number.replace(/[\s.-]/g, ''))) return 'Nomor rekening hanya boleh berisi angka (minimal 5 digit).'
      if (holder.trim() === '') return 'Nama pemilik rekening wajib diisi.'
    } else if (!file && !existing) {
      return 'Gambar QRIS wajib diunggah. Pilih gambar terlebih dahulu.'
    }
    return ''
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (editing === null) return
    const msg = validate()
    if (msg) {
      notify(msg, 'error')
      return
    }
    setBusy(true)
    try {
      const payload: Record<string, unknown> = { name: name.trim(), is_active: active }
      if (isTf) {
        payload.account_number = number.replace(/[\s.-]/g, '')
        payload.account_holder = holder.trim()
      }
      if (!isTf && file) payload.image_path = await uploadQrisImage(file)

      if (editing === 'new') {
        const { error } = await supabase.from('payment_accounts').insert({ ...payload, type })
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('payment_accounts').update(payload).eq('id', editing).select('id')
        if (error) throw error
        if (!data || data.length === 0) throw new Error('Perubahan ditolak. Hanya admin yang boleh mengubah data pembayaran.')
        if (!isTf && file && existing) await removeImage(existing, 'payment-images')
      }
      notify(editing === 'new' ? 'Berhasil ditambahkan.' : 'Perubahan berhasil disimpan.')
      closeForm()
      await load()
    } catch (err) {
      notify(errText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(a: Account) {
    const label = isTf ? `rekening ${a.name} (${a.account_number})` : `QRIS "${a.name}"`
    const ok = await confirm({
      title: 'Hapus data pembayaran?',
      message: `${label} akan dihapus permanen. Kalau hanya ingin menyembunyikannya dari halaman Kasir, pakai Ubah lalu nonaktifkan.`,
      confirmText: 'Ya, hapus',
      tone: 'danger',
    })
    if (!ok) return
    const { data, error } = await supabase.from('payment_accounts').delete().eq('id', a.id).select('id')
    if (error) {
      notify(errText(error), 'error')
      return
    }
    if (!data || data.length === 0) {
      notify('Penghapusan ditolak.', 'error')
      return
    }
    if (a.image_path) await removeImage(a.image_path, 'payment-images')
    notify('Berhasil dihapus.')
    await load()
  }

  return (
    <section>
      <div className="section-head">
        <h2>{isTf ? 'Rekening Transfer' : 'QRIS'}</h2>
        <button className="btn-primary btn-sm btn-icon" onClick={startNew}>
          <Plus size={16} /> {isTf ? 'Tambah rekening' : 'Tambah QRIS'}
        </button>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 76, borderRadius: 14 }} />
      ) : rows.length === 0 ? (
        <div className="panel empty">
          {isTf ? 'Belum ada rekening. Tambahkan agar muncul saat pembeli memilih Transfer di Kasir.' : 'Belum ada QRIS. Unggah gambar QRIS agar muncul saat pembeli memilih QRIS di Kasir.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((a) => (
            <div key={a.id} className={`urow${a.is_active ? '' : ' off'}`}>
              {isTf ? (
                <span className="avatar"><Landmark size={18} /></span>
              ) : a.image_path ? (
                <img className="qr-thumb" src={imageUrl(a.image_path, 'payment-images')} alt={a.name} />
              ) : null}
              <div className="urow-main">
                <div style={{ fontWeight: 700 }}>{a.name}</div>
                {isTf && (
                  <>
                    <div className="acct-no">{a.account_number}</div>
                    <div className="page-sub">a.n. {a.account_holder}</div>
                  </>
                )}
                <div className="tags" style={{ marginTop: 6 }}>
                  <span className={`badge ${a.is_active ? 'badge-success' : 'badge-muted'}`}>{a.is_active ? 'Aktif' : 'Nonaktif'}</span>
                </div>
              </div>
              <div className="urow-actions">
                <button className="btn-sm btn-icon" onClick={() => startEdit(a)}><Pencil size={15} /> Ubah</button>
                <button className="btn-sm btn-icon btn-danger" onClick={() => void remove(a)}><Trash2 size={15} /> Hapus</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <Modal
          title={`${editing === 'new' ? 'Tambah' : 'Ubah'} ${isTf ? 'rekening' : 'QRIS'}`}
          onClose={() => !busy && closeForm()}
        >
          <form noValidate onSubmit={(e) => void save(e)} className="form-stack">
            <small>Tanda <span className="req">*</span> wajib diisi.</small>
            <label className="field">
              <span>{isTf ? 'Nama bank / e-wallet' : 'Nama QRIS'} <span className="req">*</span></span>
              <input placeholder={isTf ? 'Contoh: BCA' : 'Contoh: QRIS Toko'} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {isTf ? (
              <>
                <label className="field">
                  <span>Nomor rekening <span className="req">*</span></span>
                  <input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
                </label>
                <label className="field">
                  <span>Atas nama <span className="req">*</span></span>
                  <input value={holder} onChange={(e) => setHolder(e.target.value)} />
                </label>
              </>
            ) : (
              <div className="field">
                <span>Gambar QRIS <span className="req">*</span></span>
                <div className="upload">
                  {preview || existing ? (
                    <img className="upload-preview" style={{ objectFit: 'contain', background: '#fff' }} src={preview ?? imageUrl(existing, 'payment-images')} alt="Gambar QRIS" />
                  ) : (
                    <div className="upload-preview"><ImagePlus size={30} /></div>
                  )}
                  <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                  <span className="hint">
                    {preview ? 'Gambar baru dipilih.' : existing ? 'Gambar lama dipertahankan. Pilih file baru untuk menggantinya.' : 'Belum ada gambar dipilih.'}
                  </span>
                </div>
              </div>
            )}
            <label className="check">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Status: {active ? 'Aktif (tampil di halaman Kasir)' : 'Nonaktif (disembunyikan)'}
            </label>
            <div className="form-actions">
              <button type="button" onClick={closeForm} disabled={busy}>Batal</button>
              <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default function PaymentSettings() {
  return (
    <div style={{ display: 'grid', gap: 28, maxWidth: 820 }}>
      <PageHeader title="Pengaturan Pembayaran" subtitle="Rekening dan QRIS yang tampil di halaman Kasir saat pembeli memilih Transfer atau QRIS." />
      <Section type="transfer" />
      <Section type="qris" />
    </div>
  )
}