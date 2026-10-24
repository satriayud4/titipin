
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { imageUrl } from '../lib/image'
import { rupiah } from '../lib/format'
import { errText } from '../lib/errors'

interface Product {
  id: number
  name: string
  unit: string
  category_id: number | null
  image_path: string | null
  is_active: boolean
}

interface Category {
  id: number
  name: string
}

interface SelectedItem {
  productId: number
  quantity: number
}

type ViewMode = 'grid' | 'list'
type CardSize = 'small' | 'medium' | 'large'
type DiscountType = 'amount' | 'percent'

export default function BuatPaket() {
  const navigate = useNavigate()
  const { id } = useParams()
  const editId = id ? Number(id) : null
  const isEdit = editId !== null && Number.isFinite(editId)
  const notify = useToast()
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'kasir'

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [prices, setPrices] = useState<Map<number, number>>(new Map())
  const [costPrices, setCostPrices] = useState<Map<number, number>>(new Map())
  const [selected, setSelected] = useState<SelectedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [view, setView] = useState<ViewMode>('grid')
  const [cardSize, setCardSize] = useState<CardSize>('medium')
  const [columns, setColumns] = useState('3')
  const [showFilters, setShowFilters] = useState(false)

  const [discountType, setDiscountType] = useState<DiscountType>('percent')
  const [discountInput, setDiscountInput] = useState('10')

  

const load = useCallback(async () => {
  setLoading(true)

  try {
    const [
      productResult,
      categoryResult,
      priceResult,
      costResult,
    ] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, unit, category_id, image_path, is_active')
        .order('name'),

      supabase
        .from('categories')
        .select('id, name')
        .order('name'),

      supabase
        .from('stock_batches')
        .select('product_id, sell_price, id')
        .order('id', { ascending: false })
        .limit(5000),

      supabase
        .from('stock_batches')
        .select('product_id, cost_price, id')
        .order('id', { ascending: false })
        .limit(5000),
    ])

    const error =
      productResult.error ||
      categoryResult.error ||
      priceResult.error ||
      costResult.error

    if (error) throw error

    const priceMap = new Map<number, number>()
    const costPriceMap = new Map<number, number>()

    // Data diurutkan dari barang masuk terbaru.
    for (const row of priceResult.data ?? []) {
      if (!priceMap.has(row.product_id)) {
        priceMap.set(row.product_id, Number(row.sell_price))
      }
    }

    for (const row of costResult.data ?? []) {
      if (!costPriceMap.has(row.product_id)) {
        costPriceMap.set(row.product_id, Number(row.cost_price))
      }
    }

    if (isEdit) {
      const [pk, it] = await Promise.all([
        supabase.from('packages').select('*').eq('id', editId).maybeSingle(),
        supabase
          .from('package_items')
          .select('product_id, quantity, sort_order')
          .eq('package_id', editId)
          .order('sort_order'),
      ])
      if (pk.error || it.error) throw pk.error || it.error
      if (!pk.data) {
        notify('Paket tidak ditemukan.', 'error')
        navigate('/paket')
        return
      }

      const rows = (it.data ?? []).filter((r) => r.product_id !== null)
      const pickedItems = rows.map((r) => ({
        productId: Number(r.product_id),
        quantity: Math.max(1, Math.round(Number(r.quantity)) || 1),
      }))
      const normal = pickedItems.reduce(
        (sum, r) => sum + (priceMap.get(r.productId) ?? 0) * r.quantity,
        0,
      )
      const pkg = pk.data as {
        name: string
        description: string | null
        price: number
        is_active: boolean
        discount_type: DiscountType | null
        discount_value: number | null
      }

      setName(pkg.name)
      setDescription(pkg.description ?? '')
      setIsActive(pkg.is_active)
      setSelected(pickedItems)
      if (pkg.discount_type && pkg.discount_value !== null) {
        setDiscountType(pkg.discount_type)
        setDiscountInput(String(pkg.discount_value))
      } else {
        // paket lama tanpa data diskon: turunkan dari selisih harga normal dan harga paket
        setDiscountType('amount')
        setDiscountInput(String(Math.max(0, normal - Number(pkg.price))))
      }
    }

    setProducts((productResult.data ?? []) as Product[])
    setCategories((categoryResult.data ?? []) as Category[])
    setPrices(priceMap)
    setCostPrices(costPriceMap)
  } catch (error) {
    notify(errText(error), 'error')
  } finally {
    setLoading(false)
  }
}, [notify, navigate, isEdit, editId])



  useEffect(() => {
    void load()
  }, [load])

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )

  const selectedIds = useMemo(
    () => new Set(selected.map((item) => item.productId)),
    [selected],
  )

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()

    return products.filter((product) => {
      if (!product.is_active && !selectedIds.has(product.id)) return false
      const matchesSearch = product.name.toLowerCase().includes(query)
      const matchesCategory =
        !categoryId || String(product.category_id ?? '') === categoryId

      return matchesSearch && matchesCategory
    })
  }, [products, search, categoryId, selectedIds])

  const totals = useMemo(() => {
  return selected.reduce(
    (result, item) => {
      const product = productById.get(item.productId)
      const unitPrice = prices.get(item.productId) ?? 0
      const unitCost = costPrices.get(item.productId) ?? 0

      return {
        quantity: result.quantity + item.quantity,
        normalPrice: result.normalPrice + unitPrice * item.quantity,
        totalCost: result.totalCost + unitCost * item.quantity,
        missingPrice:
          result.missingPrice || !product || !prices.has(item.productId),
        missingCost:
          result.missingCost || !product || !costPrices.has(item.productId),
      }
    },
    {
      quantity: 0,
      normalPrice: 0,
      totalCost: 0,
      missingPrice: false,
      missingCost: false,
    },
  )
}, [selected, productById, prices, costPrices])

const discountValue = Math.max(0, Number(discountInput) || 0)

const discountAmount =
  discountType === 'percent'
    ? Math.min(
        totals.normalPrice,
        Math.round((totals.normalPrice * Math.min(discountValue, 100)) / 100),
      )
    : Math.min(totals.normalPrice, discountValue)

    const finalPrice = Math.max(0, totals.normalPrice - discountAmount)

    const estimatedProfit = finalPrice - totals.totalCost

    const profitMargin =
    finalPrice > 0 ? (estimatedProfit / finalPrice) * 100 : 0

  function toggleProduct(product: Product) {
    setSelected((current) => {
      const existing = current.find((item) => item.productId === product.id)

      if (existing) {
        return current.filter((item) => item.productId !== product.id)
      }

      return [...current, { productId: product.id, quantity: 1 }]
    })
  }

  function changeQuantity(productId: number, amount: number) {
    setSelected((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.max(1, item.quantity + amount) }
          : item,
      ),
    )
  }

  function setQuantity(productId: number, value: string) {
    const n = Math.round(Number(value))
    if (!Number.isFinite(n) || n < 1) return
    setSelected((current) =>
      current.map((item) => (item.productId === productId ? { ...item, quantity: n } : item)),
    )
  }

  function removeSelected(productId: number) {
    setSelected((current) =>
      current.filter((item) => item.productId !== productId),
    )
  }

  async function savePackage() {
    if (!canManage) {
      notify('Akun ini tidak memiliki izin mengelola paket.', 'error')
      return
    }

    if (!name.trim()) {
      notify('Nama paket wajib diisi.', 'error')
      return
    }

    if (selected.length === 0) {
      notify('Pilih minimal satu produk untuk paket ini.', 'error')
      return
    }

    if (totals.missingPrice) {
      notify(
        'Ada produk yang belum memiliki riwayat harga jual. Catat harga lewat Barang Masuk terlebih dahulu.',
        'error',
      )
      return
    }

    if (discountType === 'percent' && discountValue > 100) {
      notify('Diskon persentase maksimal 100%.', 'error')
      return
    }

    if (discountInput.trim() === '' || !Number.isFinite(Number(discountInput))) {
      notify('Masukkan nilai diskon yang valid.', 'error')
      return
    }

    setSaving(true)

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        original_price: totals.normalPrice,
        discount_type: discountType,
        discount_value: discountValue,
        price: finalPrice,
        is_active: isEdit ? isActive : true,
      }

      let packageId: number

      if (isEdit) {
        packageId = editId as number
        const { data, error } = await supabase
          .from('packages')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', packageId)
          .select('id')
        if (error) throw error
        if (!data?.length) throw new Error('Perubahan ditolak. Periksa izin akses di Supabase.')
      } else {
        const { data, error } = await supabase.from('packages').insert(payload).select('id').single()
        if (error) throw error
        packageId = Number(data.id)
      }

      // menu lama baru dihapus setelah menu baru berhasil disimpan, supaya tidak ada paket kosong bila gagal
      let oldIds: number[] = []
      if (isEdit) {
        const { data, error } = await supabase.from('package_items').select('id').eq('package_id', packageId)
        if (error) throw error
        oldIds = (data ?? []).map((r) => Number(r.id))
      }

      const itemPayload = selected.map((item, index) => {
        const product = productById.get(item.productId)!
        return {
          package_id: packageId,
          product_id: product.id,
          item_name: product.name,
          quantity: item.quantity,
          unit: product.unit || 'pcs',
          notes: null,
          sort_order: index,
        }
      })

      const { error: itemsError } = await supabase.from('package_items').insert(itemPayload)

      if (itemsError) {
        if (!isEdit) {
          // Hindari meninggalkan paket tanpa daftar menu jika penyimpanan item gagal.
          const { error: cleanupError } = await supabase.from('packages').delete().eq('id', packageId)
          if (cleanupError) {
            throw new Error(
              `Daftar menu gagal disimpan: ${errText(itemsError)}. Paket utama mungkin masih tersimpan dengan ID ${packageId}.`,
            )
          }
        }
        throw itemsError
      }

      if (oldIds.length > 0) {
        const { error: delError } = await supabase.from('package_items').delete().in('id', oldIds)
        if (delError) throw delError
      }

      notify(isEdit ? 'Paket berhasil diperbarui.' : 'Paket berhasil dibuat.')
      navigate('/paket')
    } catch (error) {
      notify(errText(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const gridColumns = Math.max(2, Math.min(5, Number(columns) || 3))

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', paddingBottom: 32 }}>
      <PageHeader
        title={isEdit ? 'Ubah Paket' : 'Buat Paket'}
        subtitle="Susun isi satu paket atau kotak: pilih beberapa produk, atur jumlah tiap produk, lalu tentukan diskon."
        actions={
          <Link to="/paket" className="btn-icon">
            <ArrowLeft size={17} /> Kembali
          </Link>
        }
      />

      {!canManage && (
        <div className="notice">
          Akun ini tidak memiliki izin untuk membuat paket.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <section style={{ minWidth: 0, display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="form-stack">
              <label className="field">
                Nama paket <span className="req">*</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Contoh: Kotak Snack Rapat"
                  maxLength={100}
                />
              </label>

              <label className="field">
                Keterangan <span className="hint">(opsional)</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Cocok untuk rapat, arisan, atau acara."
                  rows={2}
                  maxLength={500}
                />
              </label>

              {isEdit && (
                <label className="check">
                  <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                  Paket aktif (bisa dipilih di Pembelian Paket)
                </label>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Katalog produk</h2>
                <div className="page-sub">
                  {filteredProducts.length} produk · {selected.length} dipilih
                </div>
              </div>

              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowFilters((value) => !value)}
              >
                <SlidersHorizontal size={17} />
                Filter & tampilan
              </button>
            </div>

            <div className="search" style={{ maxWidth: 'none', marginBottom: 12 }}>
              <Search size={18} />
              <input
                placeholder="Cari nama produk..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Hapus pencarian"
                  onClick={() => setSearch('')}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {showFilters && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 10,
                  marginBottom: 14,
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                }}
              >
                <label className="field">
                  Kategori
                  <select
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="">Semua kategori</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  Tampilan
                  <select
                    value={view}
                    onChange={(event) => setView(event.target.value as ViewMode)}
                  >
                    <option value="grid">Grid</option>
                    <option value="list">List</option>
                  </select>
                </label>

                {view === 'grid' && (
                  <>
                    <label className="field">
                      Ukuran kartu
                      <select
                        value={cardSize}
                        onChange={(event) =>
                          setCardSize(event.target.value as CardSize)
                        }
                      >
                        <option value="small">Kecil</option>
                        <option value="medium">Sedang</option>
                        <option value="large">Besar</option>
                      </select>
                    </label>

                    <label className="field">
                      Jumlah kolom
                      <select
                        value={columns}
                        onChange={(event) => setColumns(event.target.value)}
                      >
                        <option value="2">2 kolom</option>
                        <option value="3">3 kolom</option>
                        <option value="4">4 kolom</option>
                        <option value="5">5 kolom</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <button
                type="button"
                className={`pill${!categoryId ? ' on' : ''}`}
                onClick={() => setCategoryId('')}
              >
                Semua
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`pill${categoryId === String(category.id) ? ' on' : ''}`}
                  onClick={() =>
                    setCategoryId(
                      categoryId === String(category.id) ? '' : String(category.id),
                    )
                  }
                >
                  {category.name}
                </button>
              ))}
            </div>

            {loading ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                  gap: 10,
                }}
              >
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="skeleton"
                    style={{ height: 170, borderRadius: 12 }}
                  />
                ))}
              </div>
            ) : products.length === 0 ? (
              <EmptyState
                title="Belum ada produk aktif"
                text="Tambahkan produk terlebih dahulu di Master Produk."
              />
            ) : filteredProducts.length === 0 ? (
              <EmptyState
                title="Produk tidak ditemukan"
                text="Coba kata pencarian atau kategori lain."
              />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    view === 'list'
                      ? 'minmax(0, 1fr)'
                      : `repeat(auto-fit, minmax(${cardSize === 'small' ? '125px' : cardSize === 'large' ? '210px' : '155px'}, 1fr))`,
                  gap: 10,
                }}
              >
                {filteredProducts.map((product) => {
                  const isSelected = selectedIds.has(product.id)
                  const unitPrice = prices.get(product.id)

                  return (
                    <button
                      key={product.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleProduct(product)}
                      style={{
                        display: 'flex',
                        flexDirection: view === 'list' ? 'row' : 'column',
                        alignItems: view === 'list' ? 'center' : 'stretch',
                        gap: view === 'list' ? 12 : 0,
                        minWidth: 0,
                        overflow: 'hidden',
                        textAlign: 'left',
                        padding: 0,
                        borderRadius: 13,
                        border: `1px solid ${isSelected ? 'var(--success)' : 'var(--border)'}`,
                        background: isSelected ? 'var(--primary-soft)' : 'var(--surface)',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                    >
                      {product.image_path ? (
                        <img
                          src={imageUrl(product.image_path)}
                          alt=""
                          loading="lazy"
                          style={{
                            width: view === 'list' ? 68 : '100%',
                            height: view === 'list' ? 68 : cardSize === 'small' ? 92 : cardSize === 'large' ? 170 : 125,
                            objectFit: 'cover',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            display: 'grid',
                            placeItems: 'center',
                            width: view === 'list' ? 68 : '100%',
                            height: view === 'list' ? 68 : cardSize === 'small' ? 92 : cardSize === 'large' ? 170 : 125,
                            background: 'var(--surface-2)',
                            flexShrink: 0,
                          }}
                        >
                          <ShoppingBag size={27} />
                        </div>
                      )}

                      {isSelected && (
                        <span
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            width: 25,
                            height: 25,
                            borderRadius: 99,
                            display: 'grid',
                            placeItems: 'center',
                            color: 'white',
                            background: 'var(--success)',
                          }}
                        >
                          <Check size={15} />
                        </span>
                      )}

                      <span
                        style={{
                          display: 'grid',
                          gap: 5,
                          minWidth: 0,
                          flex: 1,
                          padding: 10,
                        }}
                      >
                        <strong
                          style={{
                            overflowWrap: 'anywhere',
                            fontSize: cardSize === 'small' ? 12 : 14,
                          }}
                        >
                          {product.name}
                        </strong>
                        <span className="page-sub">
                          {categoryNames.get(product.category_id ?? -1) ?? 'Tanpa kategori'}
                        </span>
                        <strong style={{ fontSize: 13 }}>
                          {unitPrice === undefined
                            ? 'Harga belum tersedia'
                            : `${rupiah(unitPrice)} / ${product.unit || 'pcs'}`}
                        </strong>
                        {isSelected && (
                          <span className="badge badge-success">Dipilih</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <aside
          className="card"
          style={{
            padding: 16,
            display: 'grid',
            gap: 15,
            position: 'sticky',
            top: 16,
            minWidth: 0,
          }}
        >
          <div>
  <h2 style={{ margin: 0, fontSize: 19 }}>Ringkasan paket</h2>
  <div className="page-sub">
    {selected.length} jenis produk · {totals.quantity} item per paket
  </div>
</div>

          {selected.length === 0 ? (
            <div
              style={{
                border: '1px dashed var(--border)',
                borderRadius: 12,
                padding: 24,
                textAlign: 'center',
              }}
            >
              <ShoppingBag size={28} />
              <p style={{ marginBottom: 0 }}>Klik produk di katalog untuk mulai menyusun paket.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {selected.map((item) => {
                const product = productById.get(item.productId)
                if (!product) return null

                const unitPrice = prices.get(item.productId) ?? 0

                return (
                  <div
                    key={item.productId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 8,
                      paddingBottom: 12,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ overflowWrap: 'anywhere' }}>
                        {product.name}
                      </strong>
                      <div className="page-sub">
                        {rupiah(unitPrice)} × {item.quantity}
                      </div>
                      <strong>{rupiah(unitPrice * item.quantity)}</strong>
                    </div>

                    <div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Hapus ${product.name}`}
                        onClick={() => removeSelected(product.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <button
                          type="button"
                          className="btn-sm btn-icon"
                          aria-label={`Kurangi ${product.name}`}
                          onClick={() => changeQuantity(product.id, -1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus size={13} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          aria-label={`Jumlah ${product.name}`}
                          value={item.quantity}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => setQuantity(product.id, event.target.value)}
                          style={{ width: 64, minHeight: 0, padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}
                        />
                        <button
                          type="button"
                          className="btn-sm btn-icon"
                          aria-label={`Tambah ${product.name}`}
                          onClick={() => changeQuantity(product.id, 1)}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            <label className="field">
              Jenis diskon
              <select
                value={discountType}
                onChange={(event) =>
                  setDiscountType(event.target.value as DiscountType)
                }
              >
                <option value="percent">Persentase (%)</option>
                <option value="amount">Nominal (Rp)</option>
              </select>
            </label>

            <label className="field">
              Diskon {discountType === 'percent' ? '(%)' : '(Rp)'}
              <input
                type="number"
                min="0"
                max={discountType === 'percent' ? 100 : undefined}
                step={discountType === 'percent' ? '0.1' : '1'}
                inputMode="decimal"
                value={discountInput}
                onChange={(event) => setDiscountInput(event.target.value)}
              />
            </label>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 9,
              padding: 13,
              borderRadius: 12,
              background: 'var(--surface-2)',
            }}
          >
            <div className="sum-row">
              <span>Harga normal</span>
              <strong>{rupiah(totals.normalPrice)}</strong>
            </div>
            <div className="sum-row">
              <span>Diskon</span>
              <strong style={{ color: 'var(--success)' }}>
                −{rupiah(discountAmount)}
              </strong>
            </div>

            <div className="sum-row">
            <span>Total modal</span>
            <strong>{rupiah(totals.totalCost)}</strong>
            </div>

            <div className="sum-row">
            <span>Laba paket</span>
            <strong
                style={{
                color: estimatedProfit >= 0 ? 'var(--success)' : 'var(--danger)',
                }}
            >
                {rupiah(estimatedProfit)}
            </strong>
            </div>

            <div className="sum-row">
            <span>Margin laba</span>
            <strong>{profitMargin.toFixed(1)}%</strong>
            </div>

            <div className="sum-row total">
              <span>Harga paket</span>
              <strong style={{ color: 'var(--success)', fontSize: 20 }}>
                {rupiah(finalPrice)}
              </strong>
            </div>
          </div>

          {totals.missingCost && (
            <div className="notice">
                Modal beberapa produk belum tersedia. Laba yang tampil belum akurat.
            </div>
            )}

          {totals.missingPrice && (
            <div className="notice">
              Ada produk tanpa harga jual. Catat harga melalui Barang Masuk sebelum menyimpan paket.
            </div>
          )}

          <div style={{ display: 'grid', gap: 9 }}>
            <button
              type="button"
              className="btn-primary btn-icon"
              onClick={() => void savePackage()}
              disabled={
                saving ||
                loading ||
                !canManage ||
                selected.length === 0 ||
                totals.missingPrice
              }
            >
              <Check size={17} />
              {saving ? 'Menyimpan paket...' : isEdit ? 'Simpan Perubahan' : 'Simpan Paket'}
            </button>

            <button
              type="button"
              className="btn-icon"
              onClick={() => {
                setSelected([])
                setDiscountInput('10')
                setDiscountType('percent')
              }}
              disabled={saving || selected.length === 0}
            >
              <Trash2 size={16} /> Kosongkan pilihan
            </button>

            <Link to="/paket" className="btn-icon" style={{ justifyContent: 'center' }}>
              Batal
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
