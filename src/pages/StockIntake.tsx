import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Grid2X2, List, PackagePlus, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import NewProductModal from '../components/NewProductModal'
import ViewOptions, { type OptionGroup } from '../components/ViewOptions'
import { useStoredState } from '../lib/prefs'
import CartDock from '../components/CartDock'
import { errText } from '../lib/errors'
import { imageUrl } from '../lib/image'
import { rupiah } from '../lib/format'
import './BarangMasuk.css'

const LAST_SUPPLIER_KEY = 'titipin:barangmasuk:supplier'

/** Pilihan tampilan katalog. Kuncinya sama dengan Kasir, jadi memakai gaya yang sama. */
const VIEW_DEFAULTS = {
  view: 'grid',
  size: 'm',
  density: 'comfy',
  sort: 'usual',
  showImage: true,
  cart: 'right',
  cartWidth: 'normal',
}
const VIEW_GROUPS: OptionGroup[] = [
  { type: 'seg', key: 'view', label: 'Bentuk daftar produk', choices: [{ value: 'grid', label: 'Kartu', icon: Grid2X2 }, { value: 'list', label: 'Daftar', icon: List }, { value: 'compact', label: 'Ringkas' }] },
  { type: 'seg', key: 'size', label: 'Ukuran kartu', choices: [{ value: 's', label: 'Kecil' }, { value: 'm', label: 'Sedang' }, { value: 'l', label: 'Besar' }] },
  { type: 'seg', key: 'density', label: 'Kerapatan', choices: [{ value: 'comfy', label: 'Lega' }, { value: 'tight', label: 'Padat' }] },
  { type: 'seg', key: 'sort', label: 'Urutkan produk', choices: [{ value: 'usual', label: 'Biasa dititip dulu' }, { value: 'name', label: 'A–Z' }] },
  { type: 'toggle', key: 'showImage', label: 'Tampilkan gambar' },
  { type: 'seg', key: 'cart', label: 'Posisi daftar (layar lebar)', choices: [{ value: 'right', label: 'Kanan' }, { value: 'left', label: 'Kiri' }] },
  { type: 'seg', key: 'cartWidth', label: 'Lebar daftar (layar lebar)', choices: [{ value: 'narrow', label: 'Sempit' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Lebar' }] },
]

interface Product {
  id: number
  name: string
  category_id: number | null
  image_path: string | null
}
interface Hist {
  cost: number
  sell: number
}
interface Entry {
  productId: number
  qty: string
  cost: string
  sell: string
}

export default function StockIntake() {
  const notify = useToast()
  const confirm = useConfirm()
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [supplierId, setSupplierId] = useState('')
  const [history, setHistory] = useState<Map<number, Hist>>(new Map())
  const [entries, setEntries] = useState<Entry[]>([])
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('') // '' = semua, 'biasa' = biasa dititip, selain itu = id kategori
  const [sheet, setSheet] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recent, setRecent] = useState<Map<number, { rank: number; products: number }>>(new Map())
  const [prefs, setPrefs, resetPrefs] = useStoredState('titipin:barangmasuk:tampilan:v1', VIEW_DEFAULTS)

  const loadLists = useCallback(async () => {
    const [s, c, p, r] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('products').select('id, name, category_id, image_path').eq('is_active', true).order('name'),
      supabase.from('stock_batches').select('supplier_id, product_id').order('id', { ascending: false }).limit(600),
    ])
    // supplier yang paling baru menitip tampil paling depan
    const rec = new Map<number, { rank: number; products: Set<number> }>()
    for (const row of (r.data ?? []) as { supplier_id: number; product_id: number }[]) {
      const cur = rec.get(row.supplier_id) ?? { rank: rec.size, products: new Set<number>() }
      cur.products.add(row.product_id)
      rec.set(row.supplier_id, cur)
    }
    setRecent(new Map([...rec].map(([id, v]) => [id, { rank: v.rank, products: v.products.size }])))
    if (s.error) notify(errText(s.error), 'error')
    setSuppliers((s.data ?? []) as { id: number; name: string }[])
    setCategories((c.data ?? []) as { id: number; name: string }[])
    setProducts((p.data ?? []) as Product[])
    setLoading(false)
  }, [notify])

  // harga terakhir yang dipakai untuk setiap produk dari supplier ini
  const loadHistory = useCallback(
    async (sid: string) => {
      if (!sid) {
        setHistory(new Map())
        return undefined
      }
      const { data, error } = await supabase
        .from('stock_batches')
        .select('product_id, cost_price, sell_price')
        .eq('supplier_id', Number(sid))
        .order('id', { ascending: false })
        .limit(1000)
      if (error) {
        notify(errText(error), 'error')
        return undefined
      }
      const m = new Map<number, Hist>()
      for (const r of (data ?? []) as { product_id: number; cost_price: number; sell_price: number }[]) {
        if (!m.has(r.product_id)) m.set(r.product_id, { cost: r.cost_price, sell: r.sell_price })
      }
      setHistory(m)
      return m
    },
    [notify],
  )

  useEffect(() => {
    void loadLists()
  }, [loadLists])

  useEffect(() => {
    void (async () => {
      const m = await loadHistory(supplierId)
      setCat(m && m.size > 0 ? 'biasa' : '')
    })()
  }, [supplierId, loadHistory])

  /** Daftar supplier untuk dipilih: yang paling baru menitip di depan. */
  const rail = useMemo(
    () => [...suppliers].sort((a, b) => (recent.get(a.id)?.rank ?? 1e6) - (recent.get(b.id)?.rank ?? 1e6) || a.name.localeCompare(b.name)),
    [suppliers, recent],
  )

  // langsung buka supplier terakhir yang dipakai (atau yang paling baru menitip), tanpa harus memilih dulu
  useEffect(() => {
    if (loading || supplierId || rail.length === 0) return
    let saved = ''
    try {
      saved = localStorage.getItem(LAST_SUPPLIER_KEY) ?? ''
    } catch {
      /* abaikan */
    }
    setSupplierId(rail.some((x) => String(x.id) === saved) ? saved : String(rail[0].id))
  }, [loading, supplierId, rail])

  useEffect(() => {
    if (!supplierId) return
    try {
      localStorage.setItem(LAST_SUPPLIER_KEY, supplierId)
    } catch {
      /* abaikan */
    }
  }, [supplierId])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const supplierName = suppliers.find((s) => String(s.id) === supplierId)?.name ?? ''
  const usualCount = products.filter((p) => history.has(p.id)).length
  const selectedIds = new Set(entries.map((e) => e.productId))

  const q = search.trim().toLowerCase()
  const visible = products
    .filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (cat === 'biasa') return history.has(p.id)
      if (cat !== '') return String(p.category_id) === cat
      return true
    })
    .sort((a, b) => (prefs.sort === 'usual' ? Number(history.has(b.id)) - Number(history.has(a.id)) : 0) || a.name.localeCompare(b.name))

  const totals = entries.reduce(
    (t, e) => {
      const n = Number(e.qty) || 0
      return { qty: t.qty + n, cost: t.cost + n * (Number(e.cost) || 0), sell: t.sell + n * (Number(e.sell) || 0) }
    },
    { qty: 0, cost: 0, sell: 0 },
  )

  const blank = (id: number): Entry => {
    const h = history.get(id)
    return { productId: id, qty: '', cost: h ? String(h.cost) : '', sell: h ? String(h.sell) : '' }
  }

  function toggle(p: Product) {
    setEntries((es) => (es.some((e) => e.productId === p.id) ? es.filter((e) => e.productId !== p.id) : [...es, blank(p.id)]))
  }

  function addUsual() {
    setEntries((es) => {
      const have = new Set(es.map((e) => e.productId))
      return [...es, ...products.filter((p) => history.has(p.id) && !have.has(p.id)).map((p) => blank(p.id))]
    })
    setSheet(true)
  }

  function patch(productId: number, field: 'qty' | 'cost' | 'sell', value: string) {
    setEntries((es) => es.map((e) => (e.productId === productId ? { ...e, [field]: value } : e)))
  }

  async function changeSupplier(v: string) {
    if (v === supplierId) return
    if (entries.length > 0) {
      const ok = await confirm({
        title: 'Ganti supplier?',
        message: 'Daftar barang yang sudah dipilih akan dikosongkan.',
        confirmText: 'Ya, ganti',
      })
      if (!ok) return
    }
    setEntries([])
    setSheet(false)
    setSearch('')
    setSupplierId(v)
  }

  async function clearEntries() {
    const ok = await confirm({ title: 'Kosongkan daftar?', message: 'Semua produk yang dipilih akan dihapus dari daftar.', confirmText: 'Ya, kosongkan', tone: 'danger' })
    if (ok) {
      setEntries([])
      setSheet(false)
    }
  }

  function validate(): string {
    if (!supplierId) return 'Supplier wajib dipilih.'
    if (entries.length === 0) return 'Pilih minimal satu produk.'
    for (const e of entries) {
      const nm = productById.get(e.productId)?.name ?? 'Produk'
      const qty = Number(e.qty)
      const cost = Number(e.cost)
      const sell = Number(e.sell)
      if (e.qty.trim() === '' || !Number.isInteger(qty) || qty <= 0) return `${nm}: stok wajib diisi dan harus lebih dari 0.`
      if (e.cost.trim() === '' || !Number.isInteger(cost) || cost < 0) return `${nm}: harga supplier wajib diisi (angka bulat, minimal 0).`
      if (e.sell.trim() === '' || !Number.isInteger(sell) || sell < 0) return `${nm}: harga jual wajib diisi (angka bulat, minimal 0).`
    }
    return ''
  }

  async function save() {
    const msg = validate()
    if (msg) {
      notify(msg, 'error')
      return
    }
    const bad = entries.filter((e) => Number(e.sell) < Number(e.cost)).map((e) => productById.get(e.productId)?.name ?? 'Produk')
    if (bad.length > 0) {
      const ok = await confirm({
        title: 'Harga jual di bawah harga supplier',
        message: `${bad.join(', ')}. Barang ini akan dijual rugi. Tetap simpan?`,
        confirmText: 'Ya, tetap simpan',
        tone: 'danger',
      })
      if (!ok) return
    }

    const items = []
    for (const e of entries) {
      const p = productById.get(e.productId)
      if (!p) continue
      items.push({
        name: p.name,
        category: catName.get(p.category_id ?? -1) ?? '',
        qty: Number(e.qty),
        cost_price: Number(e.cost),
        sell_price: Number(e.sell),
        image_path: null,
      })
    }

    setBusy(true)
    const { error } = await supabase.rpc('add_stock_batches', { p_supplier_id: Number(supplierId), p_items: items })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify(`${items.length} produk dari ${supplierName} dicatat. Harganya diingat untuk input berikutnya.`)
    setEntries([])
    setSheet(false)
    await loadHistory(supplierId)
  }

  const dockBody = entries.map((e) => {
    const p = productById.get(e.productId)
    if (!p) return null
    const h = history.get(e.productId)
    const cost = Number(e.cost)
    const sell = Number(e.sell)
    const hasPrices = e.cost !== '' && e.sell !== ''
    const margin = sell - cost
    const changed = !!h && hasPrices && (cost !== h.cost || sell !== h.sell)
    return (
      <div className="entry" key={e.productId}>
        <div className="entry-top">
          {p.image_path ? <img className="cl-img" src={imageUrl(p.image_path)} alt="" /> : <div className="cl-img" />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="cl-name">{p.name}</div>
            <div className="page-sub">{h ? `Terakhir: ${rupiah(h.cost)} / ${rupiah(h.sell)}` : 'Belum pernah dititip supplier ini'}</div>
          </div>
          <button className="icon-btn" style={{ minHeight: 34, minWidth: 34 }} onClick={() => toggle(p)} aria-label={`Hapus ${p.name} dari daftar`}>
            <Trash2 size={16} />
          </button>
        </div>
        <div className="entry-fields">
          <label>
            Stok
            <input type="number" min={1} inputMode="numeric" value={e.qty} onChange={(ev) => patch(e.productId, 'qty', ev.target.value)} />
          </label>
          <label>
            Harga supplier
            <input type="number" min={0} inputMode="numeric" value={e.cost} onChange={(ev) => patch(e.productId, 'cost', ev.target.value)} />
          </label>
          <label>
            Harga jual
            <input type="number" min={0} inputMode="numeric" value={e.sell} onChange={(ev) => patch(e.productId, 'sell', ev.target.value)} />
          </label>
        </div>
        {hasPrices && (
          <span className={`hint${margin < 0 ? ' warn' : ''}`}>
            {margin < 0 ? `Rugi ${rupiah(-margin)} per pcs` : `Untung ${rupiah(margin)} per pcs${sell > 0 ? ` (${Math.round((margin / sell) * 100)}%)` : ''}`}
          </span>
        )}
        {changed && h && <span className="hint warn">Berbeda dari harga terakhir ({rupiah(h.cost)} / {rupiah(h.sell)})</span>}
      </div>
    )
  })

  const dockFoot = (
    <>
      <div>
        <div className="sum-row"><span>Total barang</span><b>{totals.qty}</b></div>
        <div className="sum-row"><span>Nilai supplier</span><b>{rupiah(totals.cost)}</b></div>
        <div className="sum-row"><span>Potensi omzet</span><b>{rupiah(totals.sell)}</b></div>
        <div className="sum-row total">
          <span>Potensi laba</span>
          <span style={{ color: totals.sell - totals.cost < 0 ? 'var(--danger)' : 'var(--success)' }}>{rupiah(totals.sell - totals.cost)}</span>
        </div>
      </div>
      <button className="btn-primary pay-btn" onClick={() => void save()} disabled={busy || entries.length === 0}>
        {busy ? 'Menyimpan…' : 'Simpan barang masuk'}
      </button>
    </>
  )

  return (
    <div>
      <PageHeader title="Barang Masuk" subtitle="Pilih supplier, pilih produk yang dititip, lalu isi stok dan harga." />

      {!loading && rail.length > 0 && (
        <div className="bm-rail" role="group" aria-label="Pilih supplier">
          {rail.map((sp) => {
            const on = String(sp.id) === supplierId
            const n = recent.get(sp.id)?.products
            return (
              <button key={sp.id} type="button" className={`bm-sup${on ? ' on' : ''}`} aria-pressed={on} onClick={() => void changeSupplier(String(sp.id))}>
                <span className="bm-avatar">{sp.name.trim().charAt(0).toUpperCase()}</span>
                <span className="bm-sup-main">
                  <strong>{sp.name}</strong>
                  <small>{n ? `${n} produk biasa` : 'Belum pernah menitip'}</small>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="skeleton" style={{ height: 260, borderRadius: 14 }} />
      ) : suppliers.length === 0 ? (
        <EmptyState title="Belum ada supplier aktif" text="Tambahkan supplier di menu Supplier (atau aktifkan yang ada), lalu kembali ke sini untuk mencatat barang masuk." />
      ) : !supplierId ? (
        <div className="skeleton" style={{ height: 260, borderRadius: 14 }} />
      ) : products.length === 0 ? (
        <EmptyState
          title="Belum ada produk"
          text="Buat produk pertama Anda, lalu pilih untuk dicatat."
          action={<button className="btn-primary" onClick={() => setNewOpen(true)}>Produk baru</button>}
        />
      ) : (
        <div className="pos" data-cart={prefs.cart} data-cartw={prefs.cartWidth} data-density={prefs.density}>
          <div className="pos-main">
            <div className="toolbar pos-toolbar" style={{ marginBottom: 0 }}>
              <div className="search" style={{ maxWidth: 'none' }}>
                <Search size={18} />
                <input placeholder="Cari produk…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="btn-icon" onClick={() => setNewOpen(true)}>
                <Plus size={16} /> <span className="bm-new-label">Produk baru</span>
              </button>
              <ViewOptions groups={VIEW_GROUPS} values={prefs} onChange={(k, v) => setPrefs({ [k]: v } as Partial<typeof prefs>)} onReset={resetPrefs} />
            </div>

            <div className="pills-scroll">
              {usualCount > 0 && (
                <button type="button" className={`pill${cat === 'biasa' ? ' on' : ''}`} onClick={() => setCat('biasa')}>
                  Biasa dititip ({usualCount})
                </button>
              )}
              <button type="button" className={`pill${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>Semua</button>
              {categories.map((c) => (
                <button key={c.id} type="button" className={`pill${cat === String(c.id) ? ' on' : ''}`} onClick={() => setCat(String(c.id))}>
                  {c.name}
                </button>
              ))}
            </div>

            {cat === 'biasa' && usualCount > 0 && (
              <div className="notice notice-info" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span>Produk yang biasa dititip {supplierName}. Harga terakhir terisi otomatis.</span>
                <button type="button" className="btn-sm" onClick={addUsual}>Pilih semua ({usualCount})</button>
              </div>
            )}

            {visible.length === 0 ? (
              <EmptyState
                title="Tidak ada produk"
                text={cat === 'biasa' ? 'Belum ada riwayat titipan dari supplier ini.' : 'Coba ubah pencarian atau kategori. Produk yang belum ada bisa dibuat lewat tombol Produk baru.'}
              />
            ) : (
              <div className="pos-grid" data-view={prefs.view} data-size={prefs.size} data-img={prefs.showImage ? 'on' : 'off'}>
                {visible.map((p) => {
                  const sel = selectedIds.has(p.id)
                  const h = history.get(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`tile${sel ? ' in-cart' : ''}`}
                      onClick={() => toggle(p)}
                      aria-pressed={sel}
                      aria-label={`${sel ? 'Batalkan' : 'Pilih'} ${p.name}`}
                    >
                      {p.image_path ? <img className="tile-img" src={imageUrl(p.image_path)} alt="" loading="lazy" /> : <span className="tile-img" />}
                      {h && <span className="tile-price">{rupiah(h.sell)}</span>}
                      {sel && <span className="tile-qty"><Check size={16} /></span>}
                      <span className="tile-body">
                        <span className="tile-name">{p.name}</span>
                        <span className="tile-sup">{catName.get(p.category_id ?? -1) ?? '-'}</span>
                        {h && <span className="badge badge-info">Biasa dititip</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <CartDock
            title="Barang masuk"
            subtitle={`${entries.length} produk · ${totals.qty} barang`}
            hasItems={entries.length > 0}
            emptyText="Ketuk produk di katalog untuk menambahkannya ke daftar ini."
            open={sheet}
            onOpenChange={setSheet}
            onClear={() => void clearEntries()}
            bar={
              <>
                <span><PackagePlus size={18} /> {entries.length} produk</span>
                <strong>{totals.qty} barang</strong>
                <span>Isi stok &amp; harga</span>
              </>
            }
            body={dockBody}
            foot={dockFoot}
          />
        </div>
      )}

      {newOpen && (
        <NewProductModal
          categories={categories}
          onClose={() => setNewOpen(false)}
          onCreated={async (id) => {
            setNewOpen(false)
            await loadLists()
            setEntries((es) => (es.some((e) => e.productId === id) ? es : [...es, blank(id)]))
            setCat('')
            setSheet(true)
          }}
        />
      )}
    </div>
  )
}