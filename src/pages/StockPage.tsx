import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BadgePercent, CalendarClock, Eye, Info, PackagePlus, PackageX, Pencil, Search, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import RusakPanel from '../components/RusakPanel'
import DatePicker, { formatDateLong } from '../components/DatePicker'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { addDays, shortDay, todayWIB } from '../lib/dates'
import { imageUrl } from '../lib/image'
import { LOW_STOCK } from '../lib/alerts'
import './StockEdit.css'
import './StockPage.css'
import SelectSheet from '../components/SelectSheet'
import Pagination from '../components/Pagination'
import Drawer, { DetailRow } from '../components/Drawer'
import BulkBar from '../components/BulkBar'
import { usePagination } from '../lib/usePagination'

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

interface EditRow {
  action?: string
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  created_at?: string
  edited_at?: string
  at?: string
}
const stamp = (r: EditRow) => String(r.created_at ?? r.edited_at ?? r.at ?? '')
const FIELD_LABEL: Record<string, string> = {
  qty_in: 'Jumlah masuk',
  cost_price: 'Harga supplier',
  sell_price: 'Harga jual',
  expired_date: 'Expired',
  supplier_id: 'Supplier',
}
const MONEY = new Set(['cost_price', 'sell_price'])

const usedQty = (b: Batch) => b.qty_sold + b.qty_rusak + b.qty_retur

export default function StockPage() {
  const notify = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [batches, setBatches] = useState<Batch[]>([])
  const [suppliers, setSuppliers] = useState<Map<number, string>>(new Map())
  const [products, setProducts] = useState<Map<number, { name: string; image_path: string | null; category_id: number | null }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [params] = useSearchParams()
  const paramFilter = params.get('filter')
  const [filter, setFilter] = useState<Filter>(paramFilter === 'menipis' || paramFilter === 'jual' || paramFilter === 'retur' ? paramFilter : 'semua')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [edit, setEdit] = useState<EditState | null>(null)
  const [rusakBatch, setRusakBatch] = useState<Batch | null>(null)
  const [busy, setBusy] = useState(false)
  const [categories, setCategories] = useState<Map<number, string>>(new Map())
  const [supplierF, setSupplierF] = useState('')
  const [categoryF, setCategoryF] = useState('')
  const [expiryF, setExpiryF] = useState<'' | 'today' | '3d' | '7d' | 'expired'>('')
  const [sort, setSort] = useState<'masuk' | 'expired' | 'nama' | 'sisa-asc' | 'sisa-desc'>('masuk')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [detail, setDetail] = useState<Batch | null>(null)
  const [history, setHistory] = useState<EditRow[] | null>(null)
  const [onPromo, setOnPromo] = useState<Set<number>>(new Set())
  const [bulkExpiry, setBulkExpiry] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [b, s, p, c, pr] = await Promise.all([
      supabase.from('batch_stock').select('*').gt('qty_remaining', 0).order('received_date', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('products').select('id, name, image_path, category_id'),
      supabase.from('categories').select('id, name').order('name'),
      supabase.rpc('promo_active_prices'),
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
        (p.data ?? []).map((x) => [x.id as number, { name: x.name as string, image_path: x.image_path as string | null, category_id: (x.category_id as number | null) ?? null }]),
      ),
    )
    setCategories(new Map((c.data ?? []).map((x) => [x.id as number, x.name as string])))
    setOnPromo(new Set(pr.error ? [] : ((pr.data ?? []) as { batch_id: number }[]).map((x) => x.batch_id)))
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
  const filtered = batches.filter((b) => {
    if (q && !nameOf(b).toLowerCase().includes(q) && !supplierOf(b).toLowerCase().includes(q)) return false
    if (supplierF && String(b.supplier_id) !== supplierF) return false
    if (categoryF && String(products.get(b.product_id)?.category_id ?? '') !== categoryF) return false
    if (expiryF === 'expired' && !(b.sellable_until < today)) return false
    if (expiryF === 'today' && b.sellable_until !== today) return false
    if (expiryF === '3d' && !(b.sellable_until >= today && b.sellable_until <= addDays(today, 3))) return false
    if (expiryF === '7d' && !(b.sellable_until >= today && b.sellable_until <= addDays(today, 7))) return false
    if (filter === 'jual') return isSelling(b)
    if (filter === 'menipis') return isLow(b)
    if (filter === 'retur') return isWaiting(b)
    return true
  })
  const shown = [...filtered].sort((a, b) => {
    if (sort === 'expired') return a.sellable_until.localeCompare(b.sellable_until) || nameOf(a).localeCompare(nameOf(b))
    if (sort === 'nama') return nameOf(a).localeCompare(nameOf(b))
    if (sort === 'sisa-asc') return a.qty_remaining - b.qty_remaining
    if (sort === 'sisa-desc') return b.qty_remaining - a.qty_remaining
    return b.received_date.localeCompare(a.received_date) || b.batch_id - a.batch_id
  })
  const activeFilters = [supplierF, categoryF, expiryF].filter(Boolean).length
  const pg = usePagination(shown, `${filter}|${q}|${supplierF}|${categoryF}|${expiryF}|${sort}`, 12)
  const pageIds = pg.slice.map((b) => b.batch_id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => sel.has(id))
  const selected = batches.filter((b) => sel.has(b.batch_id))

  function toggleSel(id: number) {
    setSel((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function toggleAllOnPage() {
    setSel((cur) => {
      const n = new Set(cur)
      if (allOnPage) pageIds.forEach((id) => n.delete(id))
      else pageIds.forEach((id) => n.add(id))
      return n
    })
  }
  function resetFilters() {
    setSupplierF('')
    setCategoryF('')
    setExpiryF('')
    setSort('masuk')
    setFilter('semua')
    setSearch('')
  }

  // rincian satu stok: riwayat perubahan dimuat saat panel dibuka
  useEffect(() => {
    if (!detail) {
      setHistory(null)
      return
    }
    let cancelled = false
    void supabase
      .from('stock_batch_edits')
      .select('*')
      .eq('batch_id', detail.batch_id)
      .then(({ data, error }) => {
        if (cancelled) return
        const rows = (error ? [] : (data ?? [])) as EditRow[]
        rows.sort((a, b) => stamp(b).localeCompare(stamp(a)))
        setHistory(rows)
      })
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

  function validateEdit(e: EditState): string {
    const used = usedQty(e.batch)
    const qty = Number(e.qty)
    if (!e.supplierId) return 'Supplier wajib dipilih.'
    if (e.qty.trim() === '' || !Number.isInteger(qty) || qty <= 0) return 'Jumlah stok wajib diisi dan harus lebih dari 0.'
    if (qty < used) return `Jumlah stok tidak boleh kurang dari yang sudah terpakai (${used}).`
    if (e.cost.trim() === '' || !Number.isInteger(Number(e.cost)) || Number(e.cost) < 0) return 'Harga supplier wajib diisi.'
    if (e.sell.trim() === '' || !Number.isInteger(Number(e.sell)) || Number(e.sell) < 0) return 'Harga jual wajib diisi.'
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

  async function bulkDelete() {
    if (busy) return
    const free = selected.filter((b) => usedQty(b) === 0)
    const skipped = selected.length - free.length
    if (free.length === 0) {
      notify('Semua stok yang dipilih sudah terpakai (ada penjualan, retur, atau rusak), jadi tidak bisa dihapus.', 'error')
      return
    }
    const ok = await confirm({
      title: `Hapus ${free.length} stok?`,
      message: `${free.slice(0, 4).map(nameOf).join(', ')}${free.length > 4 ? `, dan ${free.length - 4} lainnya` : ''} akan dihapus permanen.${skipped > 0 ? ` ${skipped} stok lain dilewati karena sudah terpakai.` : ''} Tindakan ini tidak bisa dibatalkan.`,
      confirmText: `Ya, hapus ${free.length}`,
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    let done = 0
    let failed = 0
    for (const b of free) {
      const { error } = await supabase.rpc('delete_stock_batch', { p_batch_id: b.batch_id })
      if (error) failed++
      else done++
    }
    setBusy(false)
    notify(`${done} stok dihapus${failed > 0 ? `, ${failed} gagal` : ''}${skipped > 0 ? `, ${skipped} dilewati` : ''}.`, failed > 0 ? 'error' : 'success')
    setSel(new Set())
    await load()
  }

  async function bulkSetExpiry(date: string) {
    if (busy) return
    setBusy(true)
    let done = 0
    let failed = 0
    let firstError = ''
    for (const b of selected) {
      const { error } = await supabase.rpc('update_stock_batch', {
        p_batch_id: b.batch_id,
        p_supplier_id: b.supplier_id,
        p_qty_in: b.qty_in,
        p_cost_price: b.cost_price,
        p_sell_price: b.sell_price,
        p_expired_date: date,
      })
      if (error) {
        failed++
        firstError ||= errText(error)
      } else done++
    }
    setBusy(false)
    setBulkExpiry(null)
    notify(`Expired ${done} stok diubah${failed > 0 ? `, ${failed} gagal (${firstError})` : ''}.`, failed > 0 ? 'error' : 'success')
    setSel(new Set())
    await load()
  }

  const used = edit ? usedQty(edit.batch) : 0
  const editDirty = !!edit && (edit.qty !== String(edit.batch.qty_in) || edit.cost !== String(edit.batch.cost_price) || edit.sell !== String(edit.batch.sell_price) || edit.expired !== edit.batch.sellable_until)
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
          <input placeholder="Cari produk atau supplier…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pills">
          {pills.map((p) => (
            <button key={p.key} type="button" className={`pill${filter === p.key ? ' on' : ''}`} onClick={() => setFilter(p.key)}>
              {p.label} ({counts[p.key]})
            </button>
          ))}
        </div>
      </div>

      <div className="stk-filters no-print">
        <SelectSheet
          label="Supplier"
          value={supplierF}
          onChange={(v) => setSupplierF(String(v))}
          placeholder="Semua supplier"
          options={[{ value: '', label: 'Semua supplier' }, ...[...suppliers].map(([id, name]) => ({ value: String(id), label: name }))]}
        />
        <SelectSheet
          label="Kategori"
          value={categoryF}
          onChange={(v) => setCategoryF(String(v))}
          placeholder="Semua kategori"
          options={[{ value: '', label: 'Semua kategori' }, ...[...categories].map(([id, name]) => ({ value: String(id), label: name }))]}
        />
        <SelectSheet
          label="Masa expired"
          value={expiryF}
          onChange={(v) => setExpiryF(String(v) as typeof expiryF)}
          placeholder="Semua masa expired"
          options={[
            { value: '', label: 'Semua masa expired' },
            { value: 'today', label: 'Expired hari ini' },
            { value: '3d', label: 'Expired ≤ 3 hari' },
            { value: '7d', label: 'Expired ≤ 7 hari' },
            { value: 'expired', label: 'Sudah lewat expired' },
          ]}
        />
        <SelectSheet
          label="Urutkan"
          value={sort}
          onChange={(v) => setSort(String(v) as typeof sort)}
          options={[
            { value: 'masuk', label: 'Terbaru masuk' },
            { value: 'expired', label: 'Expired terdekat' },
            { value: 'nama', label: 'Nama A–Z' },
            { value: 'sisa-asc', label: 'Sisa paling sedikit' },
            { value: 'sisa-desc', label: 'Sisa paling banyak' },
          ]}
        />
        {(activeFilters > 0 || sort !== 'masuk' || filter !== 'semua' || search) && (
          <button type="button" className="stk-reset" onClick={resetFilters}>Reset filter</button>
        )}
      </div>

      {!loading && shown.length > 0 && (
        <label className="stk-selectall no-print">
          <input type="checkbox" className="rowcheck" checked={allOnPage} onChange={toggleAllOnPage} />
          Pilih semua di halaman ini ({pageIds.length})
        </label>
      )}

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
          {pg.slice.map((b, i) => {
            const img = products.get(b.product_id)?.image_path
            const locked = usedQty(b) > 0
            return (
              <article key={b.batch_id} className={`stock-card${sel.has(b.batch_id) ? ' selected' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <input type="checkbox" className="rowcheck stk-check" checked={sel.has(b.batch_id)} onChange={() => toggleSel(b.batch_id)} aria-label={`Pilih ${nameOf(b)}`} />
                <div className="stock-top">
                  {img ? <img className="stock-img" src={imageUrl(img)} alt="" loading="lazy" /> : <div className="stock-img" />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <button type="button" className="stock-name stk-link" onClick={() => setDetail(b)}>{nameOf(b)}</button>
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
                  <button className="btn-sm btn-icon" onClick={() => setDetail(b)}>
                    <Eye size={15} /> Detail
                  </button>
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

      {!loading && shown.length > 0 && (
        <Pagination page={pg.page} pages={pg.pages} pageSize={pg.pageSize} total={pg.total} onPage={pg.setPage} onPageSize={pg.setPageSize} sizes={[12, 24, 48, 96]} />
      )}

      <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
        <button type="button" disabled={busy} onClick={() => setBulkExpiry(addDays(today, 1))}>
          <CalendarClock size={16} /> Ubah expired
        </button>
        <button type="button" disabled={busy} onClick={() => navigate(`/promo?batch=${selected.map((b) => b.batch_id).join(',')}`)}>
          <BadgePercent size={16} /> Promokan
        </button>
        <button type="button" className="danger" disabled={busy} onClick={() => void bulkDelete()}>
          <Trash2 size={16} /> Hapus
        </button>
      </BulkBar>

      {bulkExpiry !== null && (
        <Modal
          size="sm"
          title={`Ubah expired ${selected.length} stok`}
          onClose={() => !busy && setBulkExpiry(null)}
          footer={
            <>
              <button type="button" onClick={() => setBulkExpiry(null)} disabled={busy}>Batal</button>
              <button type="button" className="btn-primary" disabled={busy || !bulkExpiry} onClick={() => void bulkSetExpiry(bulkExpiry)}>
                {busy ? 'Menyimpan…' : 'Terapkan'}
              </button>
            </>
          }
        >
          <div className="se-form">
            <p style={{ margin: 0, color: 'var(--muted)' }}>Tanggal expired baru berlaku untuk semua stok yang dipilih. Jumlah dan harga tidak berubah.</p>
            <DatePicker
              value={bulkExpiry}
              min={selected.reduce((m, b) => (b.received_date > m ? b.received_date : m), '')}
              onChange={setBulkExpiry}
              ariaLabel="Tanggal expired baru"
              presets={[{ label: 'Besok', days: 1 }, { label: '+3 hari', days: 3 }, { label: '+1 minggu', days: 7 }, { label: '+2 minggu', days: 14 }]}
            />
          </div>
        </Modal>
      )}

      {detail && (
        <Drawer
          title={nameOf(detail)}
          subtitle={`${supplierOf(detail)} · masuk ${formatDateLong(detail.received_date)}`}
          onClose={() => setDetail(null)}
          footer={
            <>
              <button type="button" className="btn-icon" onClick={() => { const b = detail; setDetail(null); startEdit(b) }}>
                <Pencil size={15} /> Ubah
              </button>
              <button type="button" className="btn-icon" onClick={() => navigate(`/retur?supplier=${detail.supplier_id}&batch=${detail.batch_id}`)}>
                <Undo2 size={15} /> Retur
              </button>
              <button type="button" className="btn-icon" onClick={() => { const b = detail; setDetail(null); setRusakBatch(b) }}>
                <PackageX size={15} /> Rusak
              </button>
            </>
          }
        >
          <div className="dr-hero">
            {products.get(detail.product_id)?.image_path ? <img src={imageUrl(products.get(detail.product_id)!.image_path!)} alt="" /> : <div className="dr-noimg" />}
            <div style={{ display: 'grid', gap: 6 }}>
              <span>{statusBadge(detail)}</span>
              {onPromo.has(detail.batch_id) && <span className="badge badge-info">Sedang promo</span>}
              <small style={{ color: 'var(--muted)' }}>{categories.get(products.get(detail.product_id)?.category_id ?? -1) ?? 'Tanpa kategori'}</small>
            </div>
          </div>
          <section className="dr-sec">
            <h3>Stok</h3>
            <DetailRow label="Masuk">{detail.qty_in}</DetailRow>
            <DetailRow label="Terjual">{detail.qty_sold}</DetailRow>
            <DetailRow label="Rusak">{detail.qty_rusak}</DetailRow>
            <DetailRow label="Diretur">{detail.qty_retur}</DetailRow>
            <DetailRow label="Sisa">{detail.qty_remaining}</DetailRow>
            <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${(detail.qty_sold / detail.qty_in) * 100}%` }} /></div>
          </section>
          <section className="dr-sec">
            <h3>Harga</h3>
            <DetailRow label="Harga supplier">{rupiah(detail.cost_price)}</DetailRow>
            <DetailRow label="Harga jual">{rupiah(detail.sell_price)}</DetailRow>
            <DetailRow label="Untung per pcs">{rupiah(detail.sell_price - detail.cost_price)}</DetailRow>
            <DetailRow label="Nilai sisa (modal)">{rupiah(detail.qty_remaining * detail.cost_price)}</DetailRow>
            <DetailRow label="Potensi omzet sisa">{rupiah(detail.qty_remaining * detail.sell_price)}</DetailRow>
          </section>
          <section className="dr-sec">
            <h3>Tanggal</h3>
            <DetailRow label="Masuk">{formatDateLong(detail.received_date)}</DetailRow>
            <DetailRow label="Dijual sampai">{formatDateLong(detail.sellable_until)}</DetailRow>
            <DetailRow label="Batas retur">{formatDateLong(detail.return_due_date)}</DetailRow>
          </section>
          <section className="dr-sec">
            <h3>Riwayat perubahan</h3>
            {history === null ? (
              <p className="hint" style={{ margin: 0 }}>Memuat…</p>
            ) : history.length === 0 ? (
              <p className="hint" style={{ margin: 0, color: 'var(--muted)' }}>Belum ada perubahan data pada stok ini.</p>
            ) : (
              <ul className="hist">
                {history.map((h, i) => {
                  const keys = Object.keys(h.new_values ?? {}).filter((k) => JSON.stringify(h.new_values?.[k]) !== JSON.stringify(h.old_values?.[k]))
                  const fmt = (k: string, v: unknown) => (v == null ? '-' : MONEY.has(k) ? rupiah(Number(v)) : k === 'expired_date' ? formatDateLong(String(v)) : k === 'supplier_id' ? (suppliers.get(Number(v)) ?? String(v)) : String(v))
                  return (
                    <li key={i}>
                      <b>{h.action === 'ubah' || !h.action ? 'Diubah' : h.action}</b>
                      {stamp(h) && <small>{new Date(stamp(h)).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}</small>}
                      {keys.length === 0 ? <small>Tanpa perubahan nilai.</small> : keys.map((k) => (
                        <small key={k}>{FIELD_LABEL[k] ?? k}: {fmt(k, h.old_values?.[k])} → <b>{fmt(k, h.new_values?.[k])}</b></small>
                      ))}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </Drawer>
      )}

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

            {onPromo.has(edit.batch.batch_id) && (
              <div className="notice notice-info">
                <Info size={18} />
                <span>Stok ini sedang promo, jadi harga yang tampil adalah harga promo. Perubahan harga akan kembali ke harga normal saat promo selesai.</span>
              </div>
            )}

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