import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackagePlus, PackageX, Pencil, Search, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import RusakPanel from '../components/RusakPanel'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { addDays, shortDay, todayWIB } from '../lib/dates'
import { imageUrl } from '../lib/image'
import { LOW_STOCK } from '../lib/alerts'

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

const usedQty = (b: Batch) => b.qty_sold + b.qty_rusak + b.qty_retur

export default function StockPage() {
  const notify = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [batches, setBatches] = useState<Batch[]>([])
  const [suppliers, setSuppliers] = useState<Map<number, string>>(new Map())
  const [products, setProducts] = useState<Map<number, { name: string; image_path: string | null }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('semua')
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState<EditState | null>(null)
  const [rusakBatch, setRusakBatch] = useState<Batch | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [b, s, p] = await Promise.all([
      supabase.from('batch_stock').select('*').gt('qty_remaining', 0).order('received_date', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('products').select('id, name, image_path'),
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
        (p.data ?? []).map((x) => [x.id as number, { name: x.name as string, image_path: x.image_path as string | null }]),
      ),
    )
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
  const shown = batches.filter((b) => {
    if (q && !nameOf(b).toLowerCase().includes(q)) return false
    if (filter === 'jual') return isSelling(b)
    if (filter === 'menipis') return isLow(b)
    if (filter === 'retur') return isWaiting(b)
    return true
  })

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
          {shown.map((b, i) => {
            const img = products.get(b.product_id)?.image_path
            const locked = usedQty(b) > 0
            return (
              <article key={b.batch_id} className="stock-card" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <div className="stock-top">
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
        <Modal title="Ubah stok" onClose={() => !busy && setEdit(null)}>
          <form noValidate onSubmit={(ev) => void saveEdit(ev)} className="form-stack">
            <div>
              <strong>{nameOf(edit.batch)}</strong>
              <div className="page-sub">Masuk {edit.batch.received_date}</div>
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

            <label className="field">
              <span>Supplier <span className="req">*</span></span>
              <select value={edit.supplierId} disabled onChange={(e) => setEdit({ ...edit, supplierId: e.target.value })}>
                <option value="">— pilih supplier —</option>
                {[...suppliers.entries()].map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tanggal expired <span className="req">*</span></span>
              <input type="date" min={edit.batch.received_date} value={edit.expired} onChange={(e) => setEdit({ ...edit, expired: e.target.value })} />
              <span className="hint">Barang dijual sampai tanggal ini. Retur boleh kapan saja sebelum lewat tanggal ini.</span>
            </label>
            <label className="field">
              <span>Jumlah stok masuk <span className="req">*</span></span>
              <input type="number" min={Math.max(1, used)} inputMode="numeric" value={edit.qty} onChange={(e) => setEdit({ ...edit, qty: e.target.value })} />
            </label>
            <label className="field">
              <span>Harga supplier (Rp) <span className="req">*</span></span>
              <input type="number" min={0} inputMode="numeric" disabled={used > 0} value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} />
            </label>
            <label className="field">
              <span>Harga jual (Rp) <span className="req">*</span></span>
              <input type="number" min={0} inputMode="numeric" value={edit.sell} onChange={(e) => setEdit({ ...edit, sell: e.target.value })} />
              {edit.cost !== '' && edit.sell !== '' && (
                <span className="hint">
                  Untung per pcs: {rupiah(Number(edit.sell) - Number(edit.cost))}
                  {Number(edit.sell) < Number(edit.cost) ? ' (di bawah harga supplier)' : ''}
                </span>
              )}
            </label>

            <div className="form-actions">
              <button type="button" onClick={() => setEdit(null)} disabled={busy}>Batal</button>
              <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}