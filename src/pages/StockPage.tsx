import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, PackagePlus, PackageX, Pencil, Search, Trash2, TriangleAlert, Undo2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import RusakPanel from '../components/RusakPanel'
import DatePicker, { formatDateLong } from '../components/DatePicker'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import Pagination, { usePaged } from '../components/Pagination'
import BulkBar from '../components/BulkBar'
import SelectSheet from '../components/SelectSheet'
import Drawer from '../components/Drawer'
import { csvBlob, downloadBlob } from '../lib/export'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { addDays, shortDay, todayWIB } from '../lib/dates'
import { MAX_QTY, MAX_RUPIAH } from '../lib/limits'
import { imageUrl } from '../lib/image'
import { LOW_STOCK } from '../lib/alerts'
import './StockEdit.css'

interface Batch {
  batch_id: number
  received_date: string
  sellable_until: string
  return_due_date: string
  supplier_id: number
  product_id: number
  qty_in: number
  qty_sold: number
  qty_rusak: number
  qty_retur: number
  qty_remaining: number
  cost_price: number
  sell_price: number
}
interface EditState {
  batch: Batch
  supplierId: string
  qty: string
  cost: string
  sell: string
  expired: string
}
type Filter = 'semua' | 'jual' | 'menipis' | 'retur'
interface EditLog {
  id?: number
  batch_id: number
  action: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  edited_by: string | null
  [k: string]: unknown
}
const LOG_LABEL: Record<string, string> = {
  supplier_id: 'Supplier',
  qty_in: 'Stok masuk',
  cost_price: 'Harga supplier',
  sell_price: 'Harga jual',
  expired_date: 'Expired',
}
const EXP_FILTERS = [
  { value: 'lewat', label: 'Sudah lewat expired' },
  { value: 'h2', label: 'Expired ≤ 2 hari' },
  { value: 'h7', label: 'Expired ≤ 7 hari' },
]
const SORTS = [
  { value: 'baru', label: 'Terbaru masuk' },
  { value: 'expired', label: 'Expired terdekat' },
  { value: 'sedikit', label: 'Stok tersedikit' },
  { value: 'nama', label: 'Nama A–Z' },
]

const usedQty = (b: Batch) => b.qty_sold + b.qty_rusak + b.qty_retur

export default function StockPage() {
  const notify = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [batches, setBatches] = useState<Batch[]>([])
  const [suppliers, setSuppliers] = useState<Map<number, string>>(new Map())
  const [products, setProducts] = useState<Map<number, { name: string; image_path: string | null; category_id: number | null }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('semua')
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState<EditState | null>(null)
  const [rusakBatch, setRusakBatch] = useState<Batch | null>(null)
  const [busy, setBusy] = useState(false)
  const [categories, setCategories] = useState<Map<number, string>>(new Map())
  const [supFilter, setSupFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [expFilter, setExpFilter] = useState('')
  const [sort, setSort] = useState('baru')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<Batch | null>(null)
  const [logs, setLogs] = useState<EditLog[] | null>(null)
  const [people, setPeople] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    const [b, s, p, c] = await Promise.all([
      supabase.from('batch_stock').select('*').gt('qty_remaining', 0).order('received_date', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('products').select('id, name, image_path, category_id'),
      supabase.from('categories').select('id, name'),
    ])
    if (b.error) {
      notify(errText(b.error), 'error')
      setLoading(false)
      return
    }
    setBatches((b.data ?? []) as Batch[])
    setSuppliers(new Map((s.data ?? []).map((x) => [x.id as number, x.name as string])))
    setProducts(
      new Map(
        (p.data ?? []).map((x) => [x.id as number, { name: x.name as string, image_path: x.image_path as string | null, category_id: x.category_id as number | null }]),
      ),
    )
    setCategories(new Map((c.data ?? []).map((x) => [x.id as number, x.name as string])))
    // buang pilihan untuk stok yang sudah tidak ada (terhapus atau habis)
    const alive = new Set(((b.data ?? []) as Batch[]).map((x) => x.batch_id))
    setPicked((cur) => new Set([...cur].filter((id) => alive.has(id))))
    setLoading(false)
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  const today = todayWIB()
  const nameOf = (b: Batch) => products.get(b.product_id)?.name ?? '-'
  const supplierOf = (b: Batch) => suppliers.get(b.supplier_id) ?? '-'
  const isSelling = (b: Batch) => b.sellable_until >= today
  const isWaiting = (b: Batch) => b.sellable_until < today
  const isLow = (b: Batch) => isSelling(b) && b.qty_remaining <= LOW_STOCK

  const counts = {
    semua: batches.length,
    jual: batches.filter(isSelling).length,
    menipis: batches.filter(isLow).length,
    retur: batches.filter(isWaiting).length,
  }
  const q = search.trim().toLowerCase()
  const filtersOn = supFilter !== '' || catFilter !== '' || expFilter !== '' || sort !== 'baru'
  const shown = useMemo(() => {
    const list = batches.filter((b) => {
      if (q && !nameOf(b).toLowerCase().includes(q)) return false
      if (supFilter && String(b.supplier_id) !== supFilter) return false
      if (catFilter && String(products.get(b.product_id)?.category_id ?? '') !== catFilter) return false
      if (expFilter === 'lewat' && !(b.sellable_until < today)) return false
      if (expFilter === 'h2' && !(b.sellable_until >= today && b.sellable_until <= addDays(today, 2))) return false
      if (expFilter === 'h7' && !(b.sellable_until >= today && b.sellable_until <= addDays(today, 7))) return false
      if (filter === 'jual') return isSelling(b)
      if (filter === 'menipis') return isLow(b)
      if (filter === 'retur') return isWaiting(b)
      return true
    })
    const byName = (a: Batch, b: Batch) => nameOf(a).localeCompare(nameOf(b))
    if (sort === 'expired') list.sort((a, b) => a.sellable_until.localeCompare(b.sellable_until) || byName(a, b))
    else if (sort === 'sedikit') list.sort((a, b) => a.qty_remaining - b.qty_remaining || byName(a, b))
    else if (sort === 'nama') list.sort(byName)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, q, supFilter, catFilter, expFilter, sort, filter, products, today])

  const paged = usePaged(shown, [q, supFilter, catFilter, expFilter, sort, filter].join('|'), 24)

  function resetFilters() {
    setSupFilter('')
    setCatFilter('')
    setExpFilter('')
    setSort('baru')
  }
  function togglePick(id: number) {
    setPicked((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const pageIds = paged.slice.map((b) => b.batch_id)
  const pageAllPicked = pageIds.length > 0 && pageIds.every((id) => picked.has(id))

  const pickedBatches = batches.filter((b) => picked.has(b.batch_id))
  function exportPicked() {
    const rows = [
      ['Produk', 'Supplier', 'Tanggal masuk', 'Expired', 'Masuk', 'Terjual', 'Rusak', 'Retur', 'Sisa', 'Harga supplier', 'Harga jual'],
      ...pickedBatches.map((b) => [nameOf(b), supplierOf(b), b.received_date, b.sellable_until, b.qty_in, b.qty_sold, b.qty_rusak, b.qty_retur, b.qty_remaining, b.cost_price, b.sell_price]),
    ]
    downloadBlob(csvBlob(rows), `stok-terpilih-${today}.csv`)
  }
  async function removePicked() {
    const free = pickedBatches.filter((b) => usedQty(b) === 0)
    const locked = pickedBatches.length - free.length
    if (free.length === 0) {
      notify('Tidak ada yang bisa dihapus: semua stok terpilih sudah ada penjualan, retur, atau barang rusak.', 'error')
      return
    }
    const ok = await confirm({
      title: `Hapus ${free.length} stok?`,
      message: `${locked > 0 ? `${locked} stok yang sudah terpakai akan dilewati. ` : ''}Tindakan ini tidak bisa dibatalkan.`,
      confirmText: 'Ya, hapus',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    let failed = 0
    for (const b of free) {
      const { error } = await supabase.rpc('delete_stock_batch', { p_batch_id: b.batch_id })
      if (error) failed += 1
    }
    setBusy(false)
    setPicked(new Set())
    notify(failed > 0 ? `${free.length - failed} stok dihapus, ${failed} gagal.` : `${free.length} stok dihapus.`, failed > 0 ? 'error' : 'success')
    await load()
  }

  // riwayat perubahan untuk stok yang sedang dilihat
  useEffect(() => {
    if (!detail) {
      setLogs(null)
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from('stock_batch_edits').select('*').eq('batch_id', detail.batch_id)
      if (cancelled) return
      if (error) {
        setLogs([])
        return
      }
      const list = ((data ?? []) as EditLog[]).sort((a, b) => String(b.edited_at ?? b.created_at ?? b.id ?? '').localeCompare(String(a.edited_at ?? a.created_at ?? a.id ?? '')))
      setLogs(list)
      const ids = [...new Set(list.map((l) => l.edited_by).filter((x): x is string => !!x))]
      if (ids.length > 0) {
        const pr = await supabase.from('profiles').select('id, full_name').in('id', ids)
        if (!cancelled) setPeople(new Map((pr.data ?? []).map((x) => [x.id as string, (x.full_name as string) || '-'])))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detail])

  function statusBadge(b: Batch) {
    if (isWaiting(b)) {
      if (b.return_due_date < today) return <span className="badge badge-danger">Terlambat retur</span>
      if (b.return_due_date === today) return <span className="badge badge-warning">Retur hari ini</span>
      return <span className="badge badge-muted">Retur {shortDay(b.return_due_date)}</span>
    }
    if (b.sellable_until <= addDays(today, 2)) return <span className="badge badge-warning">Expired {shortDay(b.sellable_until)}</span>
    if (b.qty_remaining <= LOW_STOCK) return <span className="badge badge-warning">Menipis</span>
    return <span className="badge badge-success">Siap dijual</span>
  }

  function startEdit(b: Batch) {
    setEdit({ batch: b, supplierId: String(b.supplier_id), qty: String(b.qty_in), cost: String(b.cost_price), sell: String(b.sell_price), expired: b.sellable_until })
  }

  const editDirty =
    !!edit &&
    (edit.qty !== String(edit.batch.qty_in) ||
      edit.cost !== String(edit.batch.cost_price) ||
      edit.sell !== String(edit.batch.sell_price) ||
      edit.expired !== edit.batch.sellable_until)

  function validateEdit(e: EditState): string {
    const used = usedQty(e.batch)
    const qty = Number(e.qty)
    if (!e.supplierId) return 'Supplier wajib dipilih.'
    if (e.qty.trim() === '' || !Number.isInteger(qty) || qty <= 0) return 'Jumlah stok wajib diisi dan harus lebih dari 0.'
    if (qty < used) return `Jumlah stok tidak boleh kurang dari yang sudah terpakai (${used}).`
    if (e.cost.trim() === '' || !Number.isInteger(Number(e.cost)) || Number(e.cost) < 0) return 'Harga supplier wajib diisi.'
    if (e.sell.trim() === '' || !Number.isInteger(Number(e.sell)) || Number(e.sell) < 0) return 'Harga jual wajib diisi.'
    if (qty > MAX_QTY) return `Jumlah stok terlalu besar (maksimal ${MAX_QTY.toLocaleString('id-ID')}).`
    if (Number(e.cost) > MAX_RUPIAH || Number(e.sell) > MAX_RUPIAH) return `Harga terlalu besar (maksimal Rp${MAX_RUPIAH.toLocaleString('id-ID')}).`
    if (e.expired === '') return 'Tanggal expired wajib diisi.'
    if (e.expired < e.batch.received_date) return 'Tanggal expired tidak boleh sebelum tanggal masuk.'
    return ''
  }

  async function saveEdit(ev: FormEvent) {
    ev.preventDefault()
    if (!edit) return
    const msg = validateEdit(edit)
    if (msg) {
      notify(msg, 'error')
      return
    }
    if (usedQty(edit.batch) > 0) {
      const ok = await confirm({
        title: 'Simpan perubahan?',
        message: 'Stok ini sudah ada penjualan, retur, atau barang rusak. Pastikan perubahannya sudah benar.',
        confirmText: 'Ya, simpan',
      })
      if (!ok) return
    }
    setBusy(true)
    const { error } = await supabase.rpc('update_stock_batch', {
      p_batch_id: edit.batch.batch_id,
      p_supplier_id: Number(edit.supplierId),
      p_qty_in: Number(edit.qty),
      p_cost_price: Number(edit.cost),
      p_sell_price: Number(edit.sell),
      p_expired_date: edit.expired,
    })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify('Data stok berhasil diubah.')
    setEdit(null)
    await load()
  }

  async function remove(b: Batch) {
    if (usedQty(b) > 0) {
      notify('Tidak bisa dihapus: stok ini sudah ada penjualan, retur, atau barang rusak. Gunakan Retur untuk mengembalikan sisanya ke supplier.', 'error')
      return
    }
    const ok = await confirm({
      title: 'Hapus stok ini?',
      message: `${nameOf(b)} dari ${supplierOf(b)} (masuk ${b.qty_in}). Tindakan ini tidak bisa dibatalkan.`,
      confirmText: 'Ya, hapus',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.rpc('delete_stock_batch', { p_batch_id: b.batch_id })
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify('Data stok berhasil dihapus.')
    await load()
  }

  const used = edit ? usedQty(edit.batch) : 0
  const pills: { key: Filter; label: string }[] = [
    { key: 'semua', label: 'Semua' },
    { key: 'jual', label: 'Dijual hari ini' },
    { key: 'menipis', label: 'Menipis' },
    { key: 'retur', label: 'Perlu retur' },
  ]

  return (
    <div>
      <PageHeader
        title="Stok"
        subtitle="Stok yang masih tersisa dari semua supplier."
        actions={
          <button className="btn-primary btn-icon" onClick={() => navigate('/barang-masuk')}>
            <PackagePlus size={18} /> Barang masuk
          </button>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input placeholder="Cari produk…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pills">
          {pills.map((p) => (
            <button key={p.key} type="button" className={`pill${filter === p.key ? ' on' : ''}`} onClick={() => setFilter(p.key)}>
              {p.label} ({counts[p.key]})
            </button>
          ))}
        </div>
      </div>

      <div className="st-filters" role="group" aria-label="Filter stok">
        <SelectSheet label="Supplier" emptyLabel="Semua supplier" value={supFilter} onChange={setSupFilter} options={[...suppliers.entries()].map(([id, name]) => ({ value: String(id), label: name }))} />
        <SelectSheet label="Kategori" emptyLabel="Semua kategori" value={catFilter} onChange={setCatFilter} options={[...categories.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: String(id), label: name }))} />
        <SelectSheet label="Expired" emptyLabel="Semua tanggal expired" value={expFilter} onChange={setExpFilter} options={EXP_FILTERS} />
        <SelectSheet label="Urutkan" value={sort} onChange={setSort} options={SORTS} />
        {filtersOn && (
          <button type="button" className="btn-sm btn-ghost btn-icon" onClick={resetFilters}>
            <X size={14} /> Atur ulang
          </button>
        )}
      </div>

      {loading ? (
        <div className="stock-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 250, borderRadius: 14 }} />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          title="Belum ada stok"
          text="Catat barang titipan supplier lebih dulu, lalu stoknya akan muncul di sini."
          action={
            <button className="btn-primary" onClick={() => navigate('/barang-masuk')}>
              Catat barang masuk
            </button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Tidak ada yang cocok" text="Coba ubah kata pencarian atau pilih filter lain." />
      ) : (
        <div className="stock-grid">
          {paged.slice.map((b, i) => {
            const img = products.get(b.product_id)?.image_path
            const locked = usedQty(b) > 0
            return (
              <article key={b.batch_id} className={`stock-card${picked.has(b.batch_id) ? ' is-picked' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <label className="sel-box" title="Pilih stok ini">
                  <input type="checkbox" checked={picked.has(b.batch_id)} onChange={() => togglePick(b.batch_id)} aria-label={`Pilih ${nameOf(b)} dari ${supplierOf(b)}`} />
                </label>
                <div
                  className="stock-top st-link"
                  role="button"
                  tabIndex={0}
                  aria-label={`Lihat detail ${nameOf(b)}`}
                  onClick={() => setDetail(b)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      setDetail(b)
                    }
                  }}
                >
                  {img ? <img className="stock-img" src={imageUrl(img)} alt="" loading="lazy" /> : <div className="stock-img" />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="stock-name">{nameOf(b)}</div>
                    <div className="page-sub">{supplierOf(b)}</div>
                    <div style={{ marginTop: 4 }}>{statusBadge(b)}</div>
                  </div>
                </div>

                <div className="stats">
                  <div className="stat"><b>{b.qty_in}</b><span>Masuk</span></div>
                  <div className="stat"><b>{b.qty_sold}</b><span>Terjual</span></div>
                  <div className="stat"><b style={{ color: b.qty_remaining <= LOW_STOCK ? 'var(--warning)' : 'var(--primary)' }}>{b.qty_remaining}</b><span>Sisa</span></div>
                </div>
                <div className="bar"><i style={{ width: `${(b.qty_sold / b.qty_in) * 100}%` }} /></div>

                <div className="stock-meta">
                  <span>Modal {rupiah(b.cost_price)}</span>
                  <span>Jual {rupiah(b.sell_price)}</span>
                  <span>Masuk {shortDay(b.received_date)}</span>
                </div>

                <div className="card-actions">
                  <button className="btn-sm btn-icon" onClick={() => navigate(`/retur?supplier=${b.supplier_id}&batch=${b.batch_id}`)}>
                    <Undo2 size={15} /> Retur
                  </button>
                  <button className="btn-sm btn-icon" onClick={() => setRusakBatch(b)}>
                    <PackageX size={15} /> Rusak
                  </button>
                  <button className="btn-sm btn-icon" onClick={() => startEdit(b)}>
                    <Pencil size={15} /> Ubah
                  </button>
                  <button
                    className="btn-sm btn-icon btn-danger"
                    style={{ opacity: locked ? 0.5 : 1 }}
                    title={locked ? 'Sudah terpakai, tidak bisa dihapus' : 'Hapus stok'}
                    onClick={() => void remove(b)}
                  >
                    <Trash2 size={15} /> Hapus
                  </button>
                </div>
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
          <button type="button" className="btn-sm" onClick={() => setPicked(new Set(shown.map((b) => b.batch_id)))}>
            Pilih semua hasil ({shown.length})
          </button>
        )}
        <button type="button" className="btn-sm btn-icon" onClick={exportPicked}>
          <Download size={15} /> Ekspor CSV
        </button>
        <button type="button" className="btn-sm btn-icon btn-danger" disabled={busy} onClick={() => void removePicked()}>
          <Trash2 size={15} /> Hapus
        </button>
        <button type="button" className="btn-sm btn-ghost" onClick={() => setPicked(new Set())}>Batal</button>
      </BulkBar>

      {detail && (() => {
        const d = batches.find((x) => x.batch_id === detail.batch_id) ?? detail
        const img = products.get(d.product_id)?.image_path
        const cat = categories.get(products.get(d.product_id)?.category_id ?? -1)
        const locked = usedQty(d) > 0
        const margin = d.sell_price - d.cost_price
        return (
          <Drawer
            title="Detail stok"
            onClose={() => setDetail(null)}
            footer={
              <>
                <button className="btn-sm btn-icon" onClick={() => { setDetail(null); navigate(`/retur?supplier=${d.supplier_id}&batch=${d.batch_id}`) }}>
                  <Undo2 size={15} /> Retur
                </button>
                <button className="btn-sm btn-icon" onClick={() => { setDetail(null); setRusakBatch(d) }}>
                  <PackageX size={15} /> Rusak
                </button>
                <button className="btn-sm btn-icon" onClick={() => { setDetail(null); startEdit(d) }}>
                  <Pencil size={15} /> Ubah
                </button>
                <button className="btn-sm btn-icon btn-danger" style={{ opacity: locked ? 0.5 : 1 }} onClick={() => { setDetail(null); void remove(d) }}>
                  <Trash2 size={15} /> Hapus
                </button>
              </>
            }
          >
            <div className="dr-top">
              {img ? <img src={imageUrl(img)} alt="" /> : <div className="dr-noimg" />}
              <div style={{ minWidth: 0 }}>
                <div className="stock-name">{nameOf(d)}</div>
                <div className="page-sub">{supplierOf(d)}{cat ? ` · ${cat}` : ''}</div>
                <div style={{ marginTop: 4 }}>{statusBadge(d)}</div>
              </div>
            </div>

            <div className="dr-stats">
              <div><b>{d.qty_in}</b><span>Masuk</span></div>
              <div><b>{d.qty_sold}</b><span>Terjual</span></div>
              <div><b>{d.qty_rusak}</b><span>Rusak</span></div>
              <div><b>{d.qty_retur}</b><span>Retur</span></div>
              <div><b style={{ color: d.qty_remaining <= LOW_STOCK ? 'var(--warning)' : 'var(--primary)' }}>{d.qty_remaining}</b><span>Sisa</span></div>
            </div>

            <dl className="dr-list">
              <div><dt>Tanggal masuk</dt><dd>{formatDateLong(d.received_date)}</dd></div>
              <div><dt>Expired</dt><dd>{formatDateLong(d.sellable_until)}</dd></div>
              <div><dt>Batas retur</dt><dd>{formatDateLong(d.return_due_date)}</dd></div>
              <div><dt>Harga supplier</dt><dd>{rupiah(d.cost_price)}</dd></div>
              <div><dt>Harga jual</dt><dd>{rupiah(d.sell_price)}</dd></div>
              <div><dt>Laba per barang</dt><dd style={{ color: margin < 0 ? 'var(--danger)' : undefined }}>{rupiah(margin)}</dd></div>
              <div><dt>Nilai sisa (harga jual)</dt><dd>{rupiah(d.qty_remaining * d.sell_price)}</dd></div>
            </dl>

            <section className="dr-sec">
              <h3>Riwayat perubahan</h3>
              {logs === null ? (
                <div className="skeleton" style={{ height: 52, borderRadius: 10 }} />
              ) : logs.length === 0 ? (
                <div className="page-sub">Belum pernah diubah.</div>
              ) : (
                <div className="dr-hist">
                  {logs.map((l, i) => {
                    const when = String(l.edited_at ?? l.created_at ?? '')
                    const keys = Object.keys(LOG_LABEL).filter((k) => l.new_values && l.old_values && String(l.old_values[k] ?? '') !== String(l.new_values[k] ?? ''))
                    const show = (k: string, v: unknown) => (k === 'supplier_id' ? suppliers.get(Number(v)) ?? String(v) : k.endsWith('price') ? rupiah(Number(v)) : String(v ?? '-'))
                    return (
                      <div className="dr-hist-item" key={l.id ?? i}>
                        <strong>{l.action === 'hapus' ? 'Dihapus' : 'Diubah'}</strong>
                        {keys.map((k) => (
                          <span key={k}>{LOG_LABEL[k]}: {show(k, l.old_values?.[k])} → {show(k, l.new_values?.[k])}</span>
                        ))}
                        <small>
                          {l.edited_by ? people.get(l.edited_by) ?? '-' : '-'}
                          {when ? ` · ${new Date(when).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })}` : ''}
                        </small>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </Drawer>
        )
      })()}

      {rusakBatch && (
        <Modal title="Catat barang rusak" onClose={() => setRusakBatch(null)}>
          <RusakPanel
            batchId={rusakBatch.batch_id}
            productName={nameOf(rusakBatch)}
            supplierName={supplierOf(rusakBatch)}
            remaining={rusakBatch.qty_remaining}
            onCancel={() => setRusakBatch(null)}
            onSaved={() => {
              setRusakBatch(null)
              void load()
            }}
          />
        </Modal>
      )}

      {edit && (
        <Modal
          title="Ubah stok"
          dirty={editDirty}
          onClose={() => !busy && setEdit(null)}
          footer={
            <>
              <button type="button" onClick={() => setEdit(null)} disabled={busy}>Batal</button>
              <button type="submit" form="se-form" className="btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>
            </>
          }
        >
          <form id="se-form" noValidate onSubmit={(ev) => void saveEdit(ev)} className="se-form">
            <div className="se-product">
              {products.get(edit.batch.product_id)?.image_path ? (
                <img src={imageUrl(products.get(edit.batch.product_id)!.image_path!)} alt="" />
              ) : (
                <div className="se-noimg" />
              )}
              <div className="se-product-info">
                <strong>{nameOf(edit.batch)}</strong>
                <span>{supplierOf(edit.batch)}</span>
                <small>Masuk {formatDateLong(edit.batch.received_date)} · terpakai {used} dari {edit.batch.qty_in}</small>
              </div>
            </div>

            {used > 0 && (
              <div className="notice notice-warning">
                <TriangleAlert size={18} />
                <span>
                  Stok ini sudah ada penjualan, retur, atau barang rusak ({used}). Supplier dan harga supplier dikunci,
                  jumlah tidak boleh kurang dari {used}, dan hanya admin yang bisa menyimpan perubahan.
                </span>
              </div>
            )}

            <section className="se-section">
              <h3>Masa jual</h3>
              <div className="field">
                <span>Tanggal expired <span className="req">*</span></span>
                <DatePicker
                  value={edit.expired}
                  min={edit.batch.received_date}
                  onChange={(v) => setEdit({ ...edit, expired: v })}
                  ariaLabel="Tanggal expired"
                  presets={[
                    { label: 'Besok', days: 1 },
                    { label: '+3 hari', days: 3 },
                    { label: '+1 minggu', days: 7 },
                    { label: '+2 minggu', days: 14 },
                    { label: '+1 bulan', days: 30 },
                  ]}
                />
                <span className="hint">Barang dijual sampai tanggal ini. Retur boleh kapan saja sebelum lewat tanggal ini.</span>
              </div>
            </section>

            <section className="se-section">
              <h3>Jumlah &amp; harga</h3>
              <label className="field">
                <span>Jumlah stok masuk <span className="req">*</span></span>
                <div className="se-input">
                  <input type="number" min={Math.max(1, used)} inputMode="numeric" value={edit.qty} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setEdit({ ...edit, qty: e.target.value })} />
                  <i>pcs</i>
                </div>
              </label>
              <div className="se-two">
                <label className="field">
                  <span>Harga supplier <span className="req">*</span></span>
                  <div className={`se-input${used > 0 ? ' locked' : ''}`}>
                    <i>Rp</i>
                    <input type="number" min={0} inputMode="numeric" disabled={used > 0} value={edit.cost} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} />
                  </div>
                </label>
                <label className="field">
                  <span>Harga jual <span className="req">*</span></span>
                  <div className="se-input">
                    <i>Rp</i>
                    <input type="number" min={0} inputMode="numeric" value={edit.sell} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setEdit({ ...edit, sell: e.target.value })} />
                  </div>
                </label>
              </div>
              {edit.cost !== '' && edit.sell !== '' && (
                <div className={`se-profit${Number(edit.sell) < Number(edit.cost) ? ' loss' : ''}`}>
                  <span>Untung per pcs</span>
                  <b>{rupiah(Number(edit.sell) - Number(edit.cost))}</b>
                  {Number(edit.sell) < Number(edit.cost) && <small>di bawah harga supplier</small>}
                </div>
              )}
            </section>
          </form>
        </Modal>
      )}
    </div>
  )
}