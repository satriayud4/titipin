import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { ImagePlus, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from './Toast'
import { useConfirm } from './ConfirmDialog'
import Modal from './Modal'
import PageHeader from './PageHeader'
import EmptyState from './EmptyState'
import { imageUrl, uploadProductImage } from '../lib/image'
import { errText } from '../lib/errors'

export interface Field {
  key: string
  label: string
  type: 'text' | 'checkbox' | 'select' | 'image'
  required?: boolean
  defaultValue?: string | boolean
  placeholder?: string
  options?: { value: number; label: string }[] // untuk type 'select'
}

interface Props {
  title: string
  subtitle?: string
  noun: string // contoh: "produk", dipakai di tombol dan pesan
  table: string
  fields: Field[]
  layout?: 'list' | 'grid'
}

type Row = Record<string, unknown>
type FormState = Record<string, string | boolean>

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function CrudPage({ title, subtitle, noun, table, fields, layout = 'list' }: Props) {
  const notify = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const titleKey = fields.find((f) => f.type === 'text')?.key ?? 'name'
  const imageField = fields.find((f) => f.type === 'image')
  const activeField = fields.find((f) => f.type === 'checkbox')

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<'new' | Row | null>(null)
  const [form, setForm] = useState<FormState>({})
  const [newFile, setNewFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [existingPath, setExistingPath] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from(table).select('*').order('id')
    if (error) notify(errText(error), 'error')
    else setRows(data ?? [])
    setLoading(false)
  }, [table, notify])

  useEffect(() => {
    void load()
  }, [load])

  function resetImage() {
    if (preview) URL.revokeObjectURL(preview)
    setNewFile(null)
    setPreview(null)
  }

  function closeForm() {
    resetImage()
    setExistingPath('')
    setEditing(null)
  }

  function openNew() {
    const f: FormState = {}
    fields.forEach((fl) => {
      f[fl.key] = fl.defaultValue ?? (fl.type === 'checkbox' ? true : '')
    })
    resetImage()
    setForm(f)
    setExistingPath('')
    setEditing('new')
  }

  function openEdit(row: Row) {
    const f: FormState = {}
    fields.forEach((fl) => {
      const v = row[fl.key]
      f[fl.key] = fl.type === 'checkbox' ? Boolean(v) : v == null ? '' : String(v)
    })
    resetImage()
    setForm(f)
    setExistingPath(imageField ? String(row[imageField.key] ?? '') : '')
    setEditing(row)
  }

  function pickFile(file: File | null) {
    if (file && !file.type.startsWith('image/')) {
      notify('File harus berupa gambar (JPG, PNG, atau WebP).', 'error')
      return
    }
    resetImage()
    if (file) {
      setNewFile(file)
      setPreview(URL.createObjectURL(file))
    }
  }

  function validate(): string {
    for (const fl of fields) {
      if (!fl.required) continue
      if (fl.type === 'image') {
        if (!newFile && !existingPath) return `${fl.label} wajib diunggah. Pilih gambar terlebih dahulu.`
      } else if (fl.type === 'select') {
        if (String(form[fl.key] ?? '') === '') return `${fl.label} wajib dipilih.`
      } else if (fl.type === 'text') {
        if (String(form[fl.key] ?? '').trim() === '') return `${fl.label} wajib diisi.`
      }
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
      const payload: Row = {}
      for (const fl of fields) {
        const v = form[fl.key]
        if (fl.type === 'checkbox') payload[fl.key] = v
        else if (fl.type === 'select') payload[fl.key] = v === '' ? null : Number(v)
        else if (fl.type === 'text') payload[fl.key] = String(v).trim() === '' ? null : String(v).trim()
      }
      if (imageField && newFile) payload[imageField.key] = await uploadProductImage(newFile)

      if (editing === 'new') {
        const { error } = await supabase.from(table).insert(payload)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from(table).update(payload).eq('id', editing.id as number).select('id')
        if (error) throw error
        if (!data || data.length === 0) throw new Error('Perubahan ditolak. Hanya admin yang boleh mengubah data.')
      }
      notify(editing === 'new' ? `${cap(noun)} berhasil ditambahkan.` : 'Perubahan berhasil disimpan.')
      closeForm()
      await load()
    } catch (err) {
      notify(errText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(row: Row) {
    const ok = await confirm({
      title: `Hapus ${noun} ini?`,
      message: `"${String(row[titleKey] ?? '')}" akan dihapus permanen. Jika sudah dipakai di data lain, penghapusan ditolak dan sebaiknya dinonaktifkan saja.`,
      confirmText: 'Ya, hapus',
      tone: 'danger',
    })
    if (!ok) return
    const { data, error } = await supabase.from(table).delete().eq('id', row.id as number).select('id')
    if (error) {
      notify(errText(error), 'error')
      return
    }
    if (!data || data.length === 0) {
      notify('Penghapusan ditolak. Hanya admin yang boleh menghapus data.', 'error')
      return
    }
    notify(`${cap(noun)} berhasil dihapus.`)
    await load()
  }

  const q = search.trim().toLowerCase()
  const shown = rows
    .filter((r) => !q || String(r[titleKey] ?? '').toLowerCase().includes(q))
    .sort((a, b) => String(a[titleKey] ?? '').localeCompare(String(b[titleKey] ?? '')))

  // lencana (kategori, status) dan baris keterangan tambahan tiap data
  function badges(row: Row) {
    const out: ReactElement[] = []
    for (const fl of fields) {
      if (fl.type === 'select') {
        const label = fl.options?.find((o) => o.value === row[fl.key])?.label
        if (label) out.push(<span key={fl.key} className="badge badge-info">{label}</span>)
      }
    }
    if (activeField) {
      const on = Boolean(row[activeField.key])
      out.push(<span key="active" className={`badge ${on ? 'badge-success' : 'badge-muted'}`}>{on ? 'Aktif' : 'Nonaktif'}</span>)
    }
    return out
  }
  const metaLines = (row: Row) =>
    fields
      .filter((fl) => fl.type === 'text' && fl.key !== titleKey && row[fl.key])
      .map((fl) => (
        <div key={fl.key} className="page-sub" style={{ overflowWrap: 'anywhere' }}>
          {fl.label}: {String(row[fl.key])}
        </div>
      ))
  const isOff = (row: Row) => (activeField ? !row[activeField.key] : false)

  const actions = (row: Row, cls: string) =>
    isAdmin && (
      <div className={cls}>
        <button className="btn-sm btn-icon" onClick={() => openEdit(row)}>
          <Pencil size={15} /> Ubah
        </button>
        <button className="btn-sm btn-icon btn-danger" onClick={() => void remove(row)}>
          <Trash2 size={15} /> Hapus
        </button>
      </div>
    )

  return (
    <div style={{ maxWidth: layout === 'grid' ? 1100 : 860 }}>
      <PageHeader
        title={title}
        subtitle={subtitle ?? `${rows.length} ${noun}`}
        actions={
          <button className="btn-primary btn-icon" onClick={openNew}>
            <Plus size={18} /> Tambah {noun}
          </button>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input placeholder={`Cari ${noun}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className={layout === 'grid' ? 'catalog' : ''} style={layout === 'grid' ? undefined : { display: 'grid', gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: layout === 'grid' ? 240 : 76, borderRadius: 14 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={`Belum ada ${noun}`}
          text={`Tambahkan ${noun} pertama Anda.`}
          action={<button className="btn-primary" onClick={openNew}>Tambah {noun}</button>}
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Tidak ada yang cocok" text="Coba ubah kata pencarian." />
      ) : layout === 'grid' ? (
        <div className="catalog">
          {shown.map((row, i) => {
            const img = imageField ? (row[imageField.key] as string | null) : null
            return (
              <article key={row.id as number} className={`pcard${isOff(row) ? ' off' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                {img ? <img className="pcard-img" src={imageUrl(img)} alt="" loading="lazy" /> : <div className="pcard-img"><Package size={34} /></div>}
                <div className="pcard-body">
                  <div className="pcard-title">{String(row[titleKey] ?? '')}</div>
                  <div className="tags">{badges(row)}</div>
                  {metaLines(row)}
                </div>
                {actions(row, 'card-actions')}
              </article>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {shown.map((row) => (
            <div key={row.id as number} className={`urow${isOff(row) ? ' off' : ''}`}>
              <span className="avatar">{String(row[titleKey] ?? '?').trim().charAt(0).toUpperCase() || '?'}</span>
              <div className="urow-main">
                <div style={{ fontWeight: 700 }}>{String(row[titleKey] ?? '')}</div>
                {metaLines(row)}
                <div className="tags" style={{ marginTop: 6 }}>{badges(row)}</div>
              </div>
              {actions(row, 'urow-actions')}
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <Modal title={editing === 'new' ? `Tambah ${noun}` : `Ubah ${noun}`} onClose={() => !busy && closeForm()}>
          <form noValidate onSubmit={(e) => void save(e)} className="form-stack">
            <small>Tanda <span className="req">*</span> wajib diisi.</small>
            {fields.map((fl) => {
              const label = (
                <span>
                  {fl.label}
                  {fl.type !== 'checkbox' && (fl.required ? <span className="req"> *</span> : <span className="hint"> (opsional)</span>)}
                </span>
              )
              if (fl.type === 'checkbox') {
                return (
                  <label key={fl.key} className="check">
                    <input type="checkbox" checked={Boolean(form[fl.key])} onChange={(e) => setForm({ ...form, [fl.key]: e.target.checked })} />
                    {fl.label}: {form[fl.key] ? 'Aktif' : 'Nonaktif'}
                  </label>
                )
              }
              if (fl.type === 'select') {
                return (
                  <label key={fl.key} className="field">
                    {label}
                    <select value={String(form[fl.key] ?? '')} onChange={(e) => setForm({ ...form, [fl.key]: e.target.value })}>
                      <option value="">— pilih —</option>
                      {fl.options?.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                )
              }
              if (fl.type === 'image') {
                return (
                  <div key={fl.key} className="field">
                    {label}
                    <div className="upload">
                      {preview || existingPath ? (
                        <img className="upload-preview" src={preview ?? imageUrl(existingPath)} alt="Gambar produk" />
                      ) : (
                        <div className="upload-preview"><ImagePlus size={30} /></div>
                      )}
                      <input type="file" accept="image/*" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                      <span className="hint">
                        {preview
                          ? 'Gambar baru dipilih.'
                          : existingPath
                            ? 'Gambar lama dipertahankan. Pilih file baru untuk menggantinya.'
                            : 'Belum ada gambar dipilih.'}
                      </span>
                    </div>
                  </div>
                )
              }
              return (
                <label key={fl.key} className="field">
                  {label}
                  <input placeholder={fl.placeholder} value={String(form[fl.key] ?? '')} onChange={(e) => setForm({ ...form, [fl.key]: e.target.value })} />
                </label>
              )
            })}
            <div className="form-actions">
              <button type="button" onClick={closeForm} disabled={busy}>Batal</button>
              <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}