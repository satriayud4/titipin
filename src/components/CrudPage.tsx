import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { ImagePlus, MessageCircle, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from './Toast'
import { useConfirm } from './ConfirmDialog'
import Modal from './Modal'
import PageHeader from './PageHeader'
import EmptyState from './EmptyState'
import ViewOptions, { type OptionGroup } from './ViewOptions'
import { useStoredState } from '../lib/prefs'
import Pagination, { usePaged } from './Pagination'
import BulkBar from './BulkBar'
import SelectSheet from './SelectSheet'
import { imageUrl, uploadProductImage } from '../lib/image'
import { errText } from '../lib/errors'
import './CrudPage.css'

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
  /** Angka pendamping dari tabel lain, mis. jumlah produk per kategori atau stok per produk. */
  relation?: {
    table: string
    fk: string
    /** jumlahkan kolom ini; kosong = hitung baris */
    sumColumn?: string
    /** hanya baris dengan sumColumn > 0 */
    positiveOnly?: boolean
    render: (n: number) => string
    sortLabel?: string
  }
}

type Row = Record<string, unknown>
type FormState = Record<string, string | boolean>

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type Status = 'all' | 'on' | 'off'
const VIEW_DEFAULTS = { view: 'cards', size: 'm', sort: 'name' }

/** 0812… → 62812… untuk tautan WhatsApp */
const waNumber = (raw: string) => {
  const d = raw.replace(/\D/g, '')
  return d.startsWith('0') ? `62${d.slice(1)}` : d
}

export default function CrudPage({ title, subtitle, noun, table, fields, relation }: Props) {
  const notify = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const titleKey = fields.find((f) => f.type === 'text')?.key ?? 'name'
  const imageField = fields.find((f) => f.type === 'image')
  const activeField = fields.find((f) => f.type === 'checkbox')
  const selectField = fields.find((f) => f.type === 'select')
  const phoneField = fields.find((f) => f.key === 'phone')
  // satu-satunya isian wajib hanyalah nama (mis. Kategori): cukup ketik di kolom tambah cepat
  const quickAdd = !imageField && fields.filter((f) => f.required).length === 1 && fields.find((f) => f.required)?.key === titleKey

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<'new' | Row | null>(null)
  const [form, setForm] = useState<FormState>({})
  const [newFile, setNewFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [existingPath, setExistingPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>('all')
  const [pick, setPick] = useState('')
  const [stat, setStat] = useState<Map<number, number>>(new Map())
  const [quickName, setQuickName] = useState('')
  const [initialForm, setInitialForm] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const quickRef = useRef<HTMLInputElement>(null)
  const [prefs, setPrefs, resetPrefs] = useStoredState(`titipin:${table}:tampilan:v1`, VIEW_DEFAULTS)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from(table).select('*').order('id')
    if (error) notify(errText(error), 'error')
    else setRows(data ?? [])
    setLoading(false)

    if (relation) {
      let query = supabase
        .from(relation.table)
        .select(relation.sumColumn ? `${relation.fk}, ${relation.sumColumn}` : relation.fk)
        .limit(5000)
      if (relation.sumColumn && relation.positiveOnly) query = query.gt(relation.sumColumn, 0)
      const r = await query
      if (!r.error) {
        const m = new Map<number, number>()
        for (const x of (r.data ?? []) as unknown as Record<string, number | null>[]) {
          const k = x[relation.fk]
          if (k == null) continue
          m.set(Number(k), (m.get(Number(k)) ?? 0) + (relation.sumColumn ? Number(x[relation.sumColumn] ?? 0) : 1))
        }
        setStat(m)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setInitialForm(JSON.stringify(f))
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
    setInitialForm(JSON.stringify(f))
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
    if (dupRow) {
      notify(`${cap(noun)} "${String(form[titleKey] ?? '').trim()}" sudah ada. Gunakan nama lain atau ubah data yang sudah ada.`, 'error')
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

  async function toggleActive(row: Row) {
    if (!activeField) return
    const next = !row[activeField.key]
    setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, [activeField.key]: next } : r)))
    const { data, error } = await supabase.from(table).update({ [activeField.key]: next }).eq('id', row.id as number).select('id')
    if (error || !data || data.length === 0) {
      setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, [activeField.key]: !next } : r)))
      notify(error ? errText(error) : 'Perubahan ditolak. Hanya admin yang boleh mengubah data.', 'error')
      return
    }
    notify(`${String(row[titleKey] ?? '')} ${next ? 'diaktifkan' : 'dinonaktifkan'}.`)
  }

  async function addQuick(e: FormEvent) {
    e.preventDefault()
    const name = quickName.trim()
    if (!name) return
    if (rows.some((r) => String(r[titleKey] ?? '').trim().toLowerCase() === name.toLowerCase())) {
      notify(`${cap(noun)} "${name}" sudah ada.`, 'error')
      return
    }
    setBusy(true)
    const payload: Row = { [titleKey]: name }
    fields.forEach((fl) => {
      if (fl.type === 'checkbox') payload[fl.key] = fl.defaultValue ?? true
    })
    const { error } = await supabase.from(table).insert(payload)
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    setQuickName('')
    notify(`${cap(noun)} "${name}" ditambahkan.`)
    await load()
    quickRef.current?.focus()
  }

  const q = search.trim().toLowerCase()
  const statOf = (r: Row) => stat.get(r.id as number) ?? 0
  const counts = useMemo(
    () => ({
      all: rows.length,
      on: activeField ? rows.filter((r) => Boolean(r[activeField.key])).length : 0,
      off: activeField ? rows.filter((r) => !r[activeField.key]).length : 0,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  )
  const pickCounts = useMemo(() => {
    const m = new Map<string, number>()
    if (selectField) for (const r of rows) m.set(String(r[selectField.key] ?? ''), (m.get(String(r[selectField.key] ?? '')) ?? 0) + 1)
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])
  const shown = rows
    .filter((r) => !q || String(r[titleKey] ?? '').toLowerCase().includes(q))
    .filter((r) => status === 'all' || (activeField && (status === 'on') === Boolean(r[activeField.key])))
    .filter((r) => !pick || !selectField || String(r[selectField.key] ?? '') === pick)
    .sort((a, b) => {
      if (prefs.sort === 'new') return Number(b.id) - Number(a.id)
      if (prefs.sort === 'stat' && relation) return statOf(b) - statOf(a) || String(a[titleKey] ?? '').localeCompare(String(b[titleKey] ?? ''))
      return String(a[titleKey] ?? '').localeCompare(String(b[titleKey] ?? ''))
    })

  const paged = usePaged(shown, [q, status, pick, prefs.sort].join('|'), 24)
  const pageIds = paged.slice.map((r) => r.id as number)
  const pageAllPicked = pageIds.length > 0 && pageIds.every((id) => picked.has(id))
  const pickedRows = rows.filter((r) => picked.has(r.id as number))
  const togglePick = (id: number) =>
    setPicked((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function bulkActive(on: boolean) {
    if (!activeField || pickedRows.length === 0) return
    setBusy(true)
    const { data, error } = await supabase.from(table).update({ [activeField.key]: on }).in('id', pickedRows.map((r) => r.id as number)).select('id')
    setBusy(false)
    if (error || !data || data.length === 0) {
      notify(error ? errText(error) : 'Perubahan ditolak. Hanya admin yang boleh mengubah data.', 'error')
      return
    }
    notify(`${data.length} ${noun} ${on ? 'diaktifkan' : 'dinonaktifkan'}.`)
    setPicked(new Set())
    await load()
  }

  async function bulkRemove() {
    if (pickedRows.length === 0) return
    const ok = await confirm({
      title: `Hapus ${pickedRows.length} ${noun}?`,
      message: `Yang sudah dipakai di data lain akan ditolak dan dilewati. Sebaiknya nonaktifkan saja jika masih dipakai.`,
      confirmText: 'Ya, hapus',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    let done = 0
    for (const r of pickedRows) {
      const { data, error } = await supabase.from(table).delete().eq('id', r.id as number).select('id')
      if (!error && data && data.length > 0) done += 1
    }
    setBusy(false)
    const failed = pickedRows.length - done
    notify(failed > 0 ? `${done} ${noun} dihapus, ${failed} ditolak (masih dipakai atau tidak diizinkan).` : `${done} ${noun} dihapus.`, failed > 0 ? 'error' : 'success')
    setPicked(new Set())
    await load()
  }

  const viewGroups: OptionGroup[] = [
    { type: 'seg', key: 'view', label: 'Tampilan', choices: [{ value: 'cards', label: 'Kartu' }, { value: 'list', label: 'Daftar' }] },
    {
      type: 'seg',
      key: 'size',
      label: 'Ukuran kartu',
      hidden: !imageField || prefs.view !== 'cards',
      choices: [{ value: 's', label: 'Kecil' }, { value: 'm', label: 'Sedang' }, { value: 'l', label: 'Besar' }],
    },
    {
      type: 'seg',
      key: 'sort',
      label: 'Urutkan',
      choices: [
        { value: 'name', label: 'A–Z' },
        { value: 'new', label: 'Terbaru' },
        ...(relation ? [{ value: 'stat', label: relation.sortLabel ?? 'Terbanyak' }] : []),
      ],
    },
  ]

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

  const statChip = (row: Row) => {
    if (!relation) return null
    const n = statOf(row)
    return <span className={`cp-stat${n === 0 ? ' zero' : ''}`}>{relation.render(n)}</span>
  }

  const actions = (row: Row, cls: string) => {
    const phone = phoneField ? String(row[phoneField.key] ?? '') : ''
    return (
      <div className={cls}>
        {phone && (
          <a className="btn-sm btn-icon cp-wa" href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${String(row[titleKey] ?? '')}`}>
            <MessageCircle size={15} /> WhatsApp
          </a>
        )}
        {isAdmin && (
          <>
            {activeField && (
              <button
                type="button"
                className="cp-switch"
                role="switch"
                aria-checked={Boolean(row[activeField.key])}
                aria-label={`${Boolean(row[activeField.key]) ? 'Nonaktifkan' : 'Aktifkan'} ${String(row[titleKey] ?? '')}`}
                title={Boolean(row[activeField.key]) ? 'Aktif. Ketuk untuk menonaktifkan' : 'Nonaktif. Ketuk untuk mengaktifkan'}
                onClick={() => void toggleActive(row)}
              />
            )}
            <button className="btn-sm btn-icon" onClick={() => openEdit(row)}>
              <Pencil size={15} /> Ubah
            </button>
            <button className="btn-sm btn-icon btn-danger" onClick={() => void remove(row)} aria-label={`Hapus ${String(row[titleKey] ?? '')}`}>
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    )
  }

  const noneYet = rows.length === 0
  // peringatan dini: nama sudah dipakai data lain (tanpa membedakan huruf besar/kecil)
  const typedName = String(form[titleKey] ?? '').trim().toLowerCase()
  const dupRow =
    editing !== null && typedName !== ''
      ? rows.find((r) => String(r[titleKey] ?? '').trim().toLowerCase() === typedName && (editing === 'new' || r !== editing && r.id !== (editing as Row).id))
      : undefined
  const formDirty = editing !== null && (JSON.stringify(form) !== initialForm || newFile !== null)
  const imgCards = Boolean(imageField) && prefs.view === 'cards'

  return (
    <div className="cp">
      <PageHeader
        title={title}
        subtitle={subtitle ?? `${rows.length} ${noun}`}
        actions={
          <button className="btn-primary btn-icon" onClick={quickAdd ? () => quickRef.current?.focus() : openNew}>
            <Plus size={18} /> Tambah {noun}
          </button>
        }
      />

      <div className="cp-tools">
        <div className="search">
          <Search size={18} />
          <input placeholder={`Cari ${noun}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button type="button" className="icon-btn" aria-label="Hapus pencarian" onClick={() => setSearch('')}>
              <X size={15} />
            </button>
          )}
        </div>
        <ViewOptions groups={viewGroups} values={prefs} onChange={(k, v) => setPrefs({ [k]: v } as Partial<typeof prefs>)} onReset={resetPrefs} />
      </div>

      {!noneYet && (activeField || (selectField && pickCounts.size > 1)) && (
        <div className="cp-filters">
          {activeField && (
            <div className="pills-scroll pills-wrap" role="group" aria-label="Filter status">
              {(
                [
                  ['all', 'Semua', counts.all],
                  ['on', 'Aktif', counts.on],
                  ['off', 'Nonaktif', counts.off],
                ] as [Status, string, number][]
              ).map(([key, label, n]) => (
                <button key={key} type="button" className={`pill${status === key ? ' on' : ''}`} aria-pressed={status === key} onClick={() => setStatus(key)}>
                  {label} <span className="cp-n">{n}</span>
                </button>
              ))}
            </div>
          )}
          {selectField && pickCounts.size > 1 && (
            <div className="pills-scroll pills-wrap" role="group" aria-label={`Filter ${selectField.label}`}>
              <button type="button" className={`pill${pick === '' ? ' on' : ''}`} aria-pressed={pick === ''} onClick={() => setPick('')}>
                Semua {selectField.label.toLowerCase()}
              </button>
              {(selectField.options ?? [])
                .filter((o) => pickCounts.has(String(o.value)))
                .map((o) => (
                  <button key={o.value} type="button" className={`pill${pick === String(o.value) ? ' on' : ''}`} aria-pressed={pick === String(o.value)} onClick={() => setPick(pick === String(o.value) ? '' : String(o.value))}>
                    {o.label} <span className="cp-n">{pickCounts.get(String(o.value))}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {quickAdd && (
        <form className="cp-quick" onSubmit={(e) => void addQuick(e)}>
          <input ref={quickRef} placeholder={`Ketik nama ${noun} baru, lalu Enter`} value={quickName} onChange={(e) => setQuickName(e.target.value)} maxLength={80} aria-label={`Nama ${noun} baru`} />
          <button type="submit" className="btn-primary btn-icon" disabled={busy || !quickName.trim()}>
            <Plus size={16} /> Tambah
          </button>
        </form>
      )}

      {loading ? (
        <div className={imgCards ? 'catalog cp-grid' : 'cp-list'} data-size={prefs.size}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: imgCards ? 250 : 84, borderRadius: 16 }} />
          ))}
        </div>
      ) : noneYet ? (
        <EmptyState
          title={`Belum ada ${noun}`}
          text={`Tambahkan ${noun} pertama Anda.`}
          action={quickAdd ? undefined : <button className="btn-primary" onClick={openNew}>Tambah {noun}</button>}
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Tidak ada yang cocok" text="Coba ubah kata pencarian atau filter." />
      ) : imgCards ? (
        <div className="catalog cp-grid" data-size={prefs.size}>
          {paged.slice.map((row) => {
            const img = imageField ? (row[imageField.key] as string | null) : null
            return (
              <article key={row.id as number} className={`pcard cp-card${isOff(row) ? ' off' : ''}${picked.has(row.id as number) ? ' is-picked' : ''}`}>
                {isAdmin && (
                  <label className="sel-box" title="Pilih">
                    <input type="checkbox" checked={picked.has(row.id as number)} onChange={() => togglePick(row.id as number)} aria-label={`Pilih ${String(row[titleKey] ?? '')}`} />
                  </label>
                )}
                <div className="cp-media">
                  {img ? <img src={imageUrl(img)} alt="" loading="lazy" /> : <Package size={34} />}
                  {statChip(row)}
                </div>
                <div className="pcard-body">
                  <div className="pcard-title">{String(row[titleKey] ?? '')}</div>
                  <div className="tags">{badges(row)}</div>
                  {metaLines(row)}
                </div>
                {actions(row, 'cp-actions')}
              </article>
            )
          })}
        </div>
      ) : (
        <div className={`cp-list${prefs.view === 'list' ? ' single' : ''}`}>
          {paged.slice.map((row) => {
            const img = imageField ? (row[imageField.key] as string | null) : null
            return (
              <article key={row.id as number} className={`cp-item${isOff(row) ? ' off' : ''}${picked.has(row.id as number) ? ' is-picked' : ''}`}>
                {isAdmin && (
                  <label className="sel-box cp-sel" title="Pilih">
                    <input type="checkbox" checked={picked.has(row.id as number)} onChange={() => togglePick(row.id as number)} aria-label={`Pilih ${String(row[titleKey] ?? '')}`} />
                  </label>
                )}
                {imageField ? (
                  img ? <img className="cp-thumb" src={imageUrl(img)} alt="" loading="lazy" /> : <span className="cp-thumb"><Package size={20} /></span>
                ) : (
                  <span className="avatar">{String(row[titleKey] ?? '?').trim().charAt(0).toUpperCase() || '?'}</span>
                )}
                <div className="cp-item-main">
                  <strong>{String(row[titleKey] ?? '')}</strong>
                  {metaLines(row)}
                  <div className="tags">
                    {badges(row)}
                    {statChip(row)}
                  </div>
                </div>
                {actions(row, 'cp-actions')}
              </article>
            )
          })}
        </div>
      )}

      {!loading && shown.length > 0 && <Pagination paged={paged} sizes={[12, 24, 48, 96]} />}

      <BulkBar count={picked.size}>
        <button type="button" className="btn-sm" onClick={() => setPicked((cur) => { const n = new Set(cur); pageIds.forEach((id) => (pageAllPicked ? n.delete(id) : n.add(id))); return n })}>
          {pageAllPicked ? 'Batal pilih halaman ini' : `Pilih halaman ini (${pageIds.length})`}
        </button>
        {shown.length > pageIds.length && (
          <button type="button" className="btn-sm" onClick={() => setPicked(new Set(shown.map((r) => r.id as number)))}>
            Pilih semua hasil ({shown.length})
          </button>
        )}
        {activeField && (
          <>
            <button type="button" className="btn-sm" disabled={busy} onClick={() => void bulkActive(true)}>Aktifkan</button>
            <button type="button" className="btn-sm" disabled={busy} onClick={() => void bulkActive(false)}>Nonaktifkan</button>
          </>
        )}
        <button type="button" className="btn-sm btn-icon btn-danger" disabled={busy} onClick={() => void bulkRemove()}>
          <Trash2 size={15} /> Hapus
        </button>
        <button type="button" className="btn-sm btn-ghost" onClick={() => setPicked(new Set())}>Batal</button>
      </BulkBar>

      {editing !== null && (
        <Modal title={editing === 'new' ? `Tambah ${noun}` : `Ubah ${noun}`} dirty={formDirty} onClose={() => !busy && closeForm()}>
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
                  <div key={fl.key} className="field">
                    {label}
                    <SelectSheet
                      label={fl.label}
                      emptyLabel="— pilih —"
                      value={String(form[fl.key] ?? '')}
                      onChange={(v) => setForm({ ...form, [fl.key]: v })}
                      options={(fl.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))}
                    />
                  </div>
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
                  {fl.key === titleKey && dupRow && (
                    <span className="hint" style={{ color: 'var(--warning)' }}>
                      {cap(noun)} dengan nama ini sudah ada{dupRow.is_active === false ? ' (nonaktif)' : ''}. Gunakan nama lain.
                    </span>
                  )}
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