import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Banknote,
  CircleCheck,
  Copy,
  Grid2X2,
  Landmark,
  List,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import CartDock from '../components/CartDock'
import EmptyState from '../components/EmptyState'
import ViewOptions, { type OptionGroup } from '../components/ViewOptions'
import { useStoredState } from '../lib/prefs'
import { imageUrl } from '../lib/image'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { todayWIB } from '../lib/dates'
import { LOW_STOCK } from '../lib/alerts'

interface Item {
  batch_id: number
  supplier_id: number
  product_id: number
  qty_remaining: number
  sell_price: number
}
interface Product {
  name: string
  image_path: string | null
  category_id: number | null
}
interface PayAccount {
  id: number
  type: 'transfer' | 'qris'
  name: string
  account_number: string | null
  account_holder: string | null
  image_path: string | null
}
type Method = 'tunai' | 'transfer' | 'qris'
interface Done {
  id: number
  total: number
  change: number
  method: Method
}

const METHODS: { value: Method; label: string; icon: LucideIcon }[] = [
  { value: 'tunai', label: 'Tunai', icon: Banknote },
  { value: 'transfer', label: 'Transfer', icon: Landmark },
  { value: 'qris', label: 'QRIS', icon: QrCode },
]

/** Pilihan tampilan Kasir. Tersimpan per perangkat, jadi HP dan PC bisa berbeda. */
const VIEW_DEFAULTS = {
  view: 'grid', // grid | list | compact
  size: 'm', // s | m | l
  density: 'comfy', // comfy | tight
  sort: 'name', // name | price-asc | price-desc | stock-desc | stock-asc
  showImage: true,
  showSupplier: true,
  showStock: true,
  cart: 'right', // right | left
  cartWidth: 'normal', // narrow | normal | wide
}

const VIEW_GROUPS: OptionGroup[] = [
  {
    type: 'seg',
    key: 'view',
    label: 'Bentuk daftar produk',
    choices: [
      { value: 'grid', label: 'Kartu', icon: Grid2X2 },
      { value: 'list', label: 'Daftar', icon: List },
      { value: 'compact', label: 'Ringkas' },
    ],
  },
  {
    type: 'seg',
    key: 'size',
    label: 'Ukuran kartu',
    choices: [
      { value: 's', label: 'Kecil' },
      { value: 'm', label: 'Sedang' },
      { value: 'l', label: 'Besar' },
    ],
  },
  {
    type: 'seg',
    key: 'density',
    label: 'Kerapatan',
    choices: [
      { value: 'comfy', label: 'Lega' },
      { value: 'tight', label: 'Padat' },
    ],
  },
  {
    type: 'seg',
    key: 'sort',
    label: 'Urutkan produk',
    choices: [
      { value: 'name', label: 'A–Z' },
      { value: 'price-asc', label: 'Termurah' },
      { value: 'price-desc', label: 'Termahal' },
      { value: 'stock-desc', label: 'Stok banyak' },
      { value: 'stock-asc', label: 'Stok sedikit' },
    ],
  },
  { type: 'toggle', key: 'showImage', label: 'Tampilkan gambar' },
  { type: 'toggle', key: 'showSupplier', label: 'Tampilkan nama supplier' },
  { type: 'toggle', key: 'showStock', label: 'Tampilkan sisa stok' },
  {
    type: 'seg',
    key: 'cart',
    label: 'Posisi keranjang (layar lebar)',
    choices: [
      { value: 'right', label: 'Kanan' },
      { value: 'left', label: 'Kiri' },
    ],
  },
  {
    type: 'seg',
    key: 'cartWidth',
    label: 'Lebar keranjang (layar lebar)',
    choices: [
      { value: 'narrow', label: 'Sempit' },
      { value: 'normal', label: 'Normal' },
      { value: 'wide', label: 'Lebar' },
    ],
  },
]

export default function Pos() {
  const [prefs, setPrefs, resetPrefs] = useStoredState('titipin:kasir:tampilan:v1', VIEW_DEFAULTS)
  const notify = useToast()
  const confirm = useConfirm()
  const [items, setItems] = useState<Item[]>([])
  const [products, setProducts] = useState<Map<number, Product>>(new Map())
  const [suppliers, setSuppliers] = useState<Map<number, string>>(new Map())
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [accounts, setAccounts] = useState<PayAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState<Record<number, number>>({})
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('')
  const [method, setMethod] = useState<Method>('tunai')
  const [cash, setCash] = useState('')
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [done, setDone] = useState<Done | null>(null)

  const load = useCallback(async () => {
    const today = todayWIB()
    const [b, p, s, c, a] = await Promise.all([
      supabase
        .from('batch_stock')
        .select('batch_id, supplier_id, product_id, qty_remaining, sell_price')
        .gt('qty_remaining', 0)
        .lte('received_date', today)
        .gte('sellable_until', today),
      supabase.from('products').select('id, name, image_path, category_id'),
      supabase.from('suppliers').select('id, name'),
      supabase.from('categories').select('id, name').order('name'),
      supabase
        .from('payment_accounts')
        .select('id, type, name, account_number, account_holder, image_path')
        .eq('is_active', true)
        .order('id'),
    ])
    if (b.error) {
      notify(errText(b.error), 'error')
      setLoading(false)
      return
    }
    setItems((b.data ?? []) as Item[])
    setProducts(
      new Map(
        (p.data ?? []).map((x) => [
          x.id as number,
          { name: x.name as string, image_path: x.image_path as string | null, category_id: x.category_id as number | null },
        ]),
      ),
    )
    setSuppliers(new Map((s.data ?? []).map((x) => [x.id as number, x.name as string])))
    setCategories((c.data ?? []) as { id: number; name: string }[])
    setAccounts((a.data ?? []) as PayAccount[])
    setLoading(false)
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  const itemById = useMemo(() => new Map(items.map((i) => [i.batch_id, i])), [items])

  function add(id: number) {
    const it = itemById.get(id)
    if (!it) return
    setCart((c) => {
      const q = c[id] ?? 0
      return q >= it.qty_remaining ? c : { ...c, [id]: q + 1 }
    })
  }

  function setQty(id: number, q: number) {
    const max = itemById.get(id)?.qty_remaining ?? q
    setCart((c) => {
      const next = { ...c }
      if (q <= 0) delete next[id]
      else next[id] = Math.min(q, max)
      return next
    })
  }

  const lines: { it: Item; q: number }[] = []
  for (const [id, q] of Object.entries(cart)) {
    const it = itemById.get(Number(id))
    if (it && q > 0) lines.push({ it, q: Math.min(q, it.qty_remaining) })
  }
  const total = lines.reduce((n, l) => n + l.q * l.it.sell_price, 0)
  const count = lines.reduce((n, l) => n + l.q, 0)
  const received = Number(cash || 0)
  const nameOf = (id: number) => products.get(id)?.name ?? '-'

  const visible = items
    .filter((it) => {
      const p = products.get(it.product_id)
      if (!p) return false
      if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      if (cat && String(p.category_id) !== cat) return false
      return true
    })
    .sort((a, b) => {
      switch (prefs.sort) {
        case 'price-asc':
          return a.sell_price - b.sell_price || nameOf(a.product_id).localeCompare(nameOf(b.product_id))
        case 'price-desc':
          return b.sell_price - a.sell_price || nameOf(a.product_id).localeCompare(nameOf(b.product_id))
        case 'stock-desc':
          return b.qty_remaining - a.qty_remaining || nameOf(a.product_id).localeCompare(nameOf(b.product_id))
        case 'stock-asc':
          return a.qty_remaining - b.qty_remaining || nameOf(a.product_id).localeCompare(nameOf(b.product_id))
        default:
          return nameOf(a.product_id).localeCompare(nameOf(b.product_id))
      }
    })

  async function clearCart() {
    const ok = await confirm({ title: 'Kosongkan keranjang?', message: 'Semua barang di keranjang akan dihapus.', confirmText: 'Ya, kosongkan', tone: 'danger' })
    if (ok) {
      setCart({})
      setSheet(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      notify('Nomor rekening disalin.')
    } catch {
      notify('Gagal menyalin. Salin nomornya secara manual.', 'error')
    }
  }

  async function pay() {
    if (lines.length === 0) {
      notify('Keranjang masih kosong.', 'error')
      return
    }
    if (method === 'tunai' && (cash.trim() === '' || received < total)) {
      notify('Uang diterima kurang dari total belanja.', 'error')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_sale', {
      p_method: method,
      p_cash_received: method === 'tunai' ? received : null,
      p_items: lines.map((l) => ({ batch_id: l.it.batch_id, qty: l.q })),
    })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      await load() // stok mungkin sudah berubah (dijual kasir lain)
      return
    }
    setDone({ id: Number(data), total, change: method === 'tunai' ? received - total : 0, method })
    setCart({})
    setCash('')
    setSheet(false)
    await load()
  }

  const quick = [...new Set([total, 20000, 50000, 100000])].filter((n) => n >= total && n > 0)
  const transfers = accounts.filter((a) => a.type === 'transfer')
  const qrisList = accounts.filter((a) => a.type === 'qris')

  const cartBody = (
    <>
      {lines.map(({ it, q }) => {
        const img = products.get(it.product_id)?.image_path
        return (
          <div className="cl" key={it.batch_id}>
            {img ? <img className="cl-img" src={imageUrl(img)} alt="" /> : <div className="cl-img" />}
            <div style={{ minWidth: 0 }}>
              <div className="cl-name">{nameOf(it.product_id)}</div>
              <div className="page-sub">{suppliers.get(it.supplier_id) ?? '-'} · {rupiah(it.sell_price)}</div>
              <div className="stepper">
                <button onClick={() => setQty(it.batch_id, q - 1)} aria-label="Kurangi"><Minus size={14} /></button>
                <b>{q}</b>
                <button onClick={() => setQty(it.batch_id, q + 1)} disabled={q >= it.qty_remaining} aria-label="Tambah"><Plus size={14} /></button>
              </div>
            </div>
            <div className="cl-end"><b>{rupiah(q * it.sell_price)}</b></div>
          </div>
        )
      })}

      <div className="pay-section">
        <div className="seg">
          {METHODS.map((m) => (
            <button key={m.value} type="button" className={method === m.value ? 'on' : ''} onClick={() => setMethod(m.value)}>
              <m.icon size={16} /> {m.label}
            </button>
          ))}
        </div>

        {method === 'tunai' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <label className="field">
              <span>Uang diterima (Rp)</span>
              <input type="number" min={0} inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} />
            </label>
            <div className="chips">
              {quick.map((n, i) => (
                <button key={n} className="btn-sm" onClick={() => setCash(String(n))}>
                  {i === 0 && n === total ? 'Uang pas' : rupiah(n)}
                </button>
              ))}
            </div>
            <div className={`change${cash.trim() !== '' && received < total ? ' bad' : ''}`}>
              <span>Kembalian</span>
              <span>{cash.trim() === '' ? '-' : received >= total ? rupiah(received - total) : 'Uang kurang'}</span>
            </div>
          </div>
        )}

        {method === 'transfer' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {transfers.map((a) => (
              <div key={a.id} className="acct">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{a.name}</div>
                  <div className="acct-no">{a.account_number}</div>
                  <div className="page-sub">a.n. {a.account_holder}</div>
                </div>
                <button className="btn-sm btn-icon" onClick={() => void copy(a.account_number ?? '')}>
                  <Copy size={15} /> Salin
                </button>
              </div>
            ))}
            {transfers.length === 0 && (
              <div className="notice notice-warning">Belum ada rekening. Minta admin menambahkannya di menu Pembayaran.</div>
            )}
          </div>
        )}

        {method === 'qris' && (
          <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
            {qrisList.map((a) => (
              <div key={a.id} style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{a.name}</div>
                {a.image_path && <img className="qris-img" src={imageUrl(a.image_path, 'payment-images')} alt={a.name} />}
              </div>
            ))}
            {qrisList.length === 0 && (
              <div className="notice notice-warning">Belum ada QRIS. Minta admin mengunggahnya di menu Pembayaran.</div>
            )}
          </div>
        )}
      </div>
    </>
  )

  const cartFoot = (
    <>
      <div className="total-row">
        <span>Total</span>
        <strong>{rupiah(total)}</strong>
      </div>
      <button className="btn-primary pay-btn" onClick={() => void pay()} disabled={busy || lines.length === 0}>
        {busy ? 'Memproses…' : `Bayar ${rupiah(total)}`}
      </button>
    </>
  )

  return (
    <div className="pos" data-cart={prefs.cart} data-cartw={prefs.cartWidth} data-density={prefs.density}>
      <div className="pos-main">
        <div className="toolbar pos-toolbar" style={{ marginBottom: 0 }}>
          <div className="search" style={{ maxWidth: 'none' }}>
            <Search size={18} />
            <input placeholder="Cari produk…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ViewOptions
            groups={VIEW_GROUPS}
            values={prefs}
            onChange={(key, value) => setPrefs({ [key]: value } as Partial<typeof prefs>)}
            onReset={resetPrefs}
          />
        </div>
        <div className="pills-scroll">
          <button type="button" className={`pill${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>Semua</button>
          {categories.map((c) => (
            <button key={c.id} type="button" className={`pill${cat === String(c.id) ? ' on' : ''}`} onClick={() => setCat(String(c.id))}>
              {c.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="pos-grid" data-view={prefs.view} data-size={prefs.size}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton" style={{ height: 210, borderRadius: 14 }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Belum ada produk yang bisa dijual" text="Catat barang titipan hari ini di menu Barang Masuk, lalu produknya muncul di sini." />
        ) : visible.length === 0 ? (
          <EmptyState title="Tidak ada yang cocok" text="Coba ubah kata pencarian atau pilih kategori lain." />
        ) : (
          <div className="pos-grid" data-view={prefs.view} data-size={prefs.size} data-img={prefs.showImage ? 'on' : 'off'}>
            {visible.map((it, index) => {
              const p = products.get(it.product_id)
              const inCart = cart[it.batch_id] ?? 0
              const left = it.qty_remaining - inCart
              const full = left <= 0
              return (
                <button
                  key={it.batch_id}
                  type="button"
                  className={`tile${inCart > 0 ? ' in-cart' : ''}`}
                  style={{ '--i': Math.min(index, 14) } as CSSProperties}
                  onClick={() => add(it.batch_id)}
                  disabled={full}
                  aria-label={`Tambah ${p?.name ?? 'produk'}`}
                >
                  {p?.image_path ? <img className="tile-img" src={imageUrl(p.image_path)} alt="" loading="lazy" /> : <span className="tile-img" />}
                  <span className="tile-price">{rupiah(it.sell_price)}</span>
                  {inCart > 0 && <span className="tile-qty">{inCart}</span>}
                  <span className="tile-body">
                    <span className="tile-name">{p?.name}</span>
                    {prefs.showSupplier && <span className="tile-sup">{suppliers.get(it.supplier_id) ?? '-'}</span>}
                    {(prefs.showStock || full) && (
                      <span className={`badge ${full ? 'badge-muted' : left <= LOW_STOCK ? 'badge-warning' : 'badge-success'}`}>
                        {full ? 'Maks. di keranjang' : `Sisa ${left}`}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <CartDock
        title="Keranjang"
        subtitle={`${count} barang`}
        hasItems={lines.length > 0}
        emptyText="Belum ada barang. Ketuk produk untuk menambahkan."
        open={sheet}
        onOpenChange={setSheet}
        onClear={() => void clearCart()}
        bar={
          <>
            <span><ShoppingBag size={18} /> {count} barang</span>
            <strong>{rupiah(total)}</strong>
            <span>Lihat keranjang</span>
          </>
        }
        body={cartBody}
        foot={cartFoot}
      />

      {done && (
        <Modal
          size="sm"
          title="Transaksi berhasil"
          onClose={() => setDone(null)}
          footer={<button className="btn-primary" autoFocus onClick={() => setDone(null)}>Transaksi baru</button>}
        >
          <div className="done">
            <span className="done-ico"><CircleCheck size={36} /></span>
            <div className="page-sub">
              TRX-{String(done.id).padStart(3, '0')} · {METHODS.find((m) => m.value === done.method)?.label}
            </div>
            <div className="done-total">{rupiah(done.total)}</div>
            {done.method === 'tunai' && (
              <div className="change" style={{ width: '100%' }}>
                <span>Kembalian</span>
                <span>{rupiah(done.change)}</span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}