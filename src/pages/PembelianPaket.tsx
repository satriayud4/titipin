import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  PackageCheck,
  RefreshCw,
  ShoppingBasket,
  Truck,
  LayoutGrid,
  List,
  Minus,
  Plus,
  Check,
  CheckCircle2,
  AlertCircle,
  Package,
  MessageCircle,
  Search,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ORDER_SOURCE } from '../lib/kalender'
import { ALERTS_REFRESH_EVENT } from '../lib/alerts'
import { errText } from '../lib/errors'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'

interface PackageRow {
  id: number
  name: string
  is_active: boolean
}

interface PackageItemRow {
  id: number
  package_id: number
  product_id: number | null
  item_name: string
  quantity: number
  unit: string
}

interface SupplierRow {
  id: number
  name: string
  phone: string | null
  is_active: boolean
  sapaan: string | null
}

interface StockRow {
  product_id: number | null
  supplier_id: number | null
}

interface ProductNeed {
  productId: number | null
  name: string
  unit: string
  quantity: number
}

interface SupplierChoice {
  supplierId: number
  name: string
  phone: string | null
  isActive: boolean
}

type LayoutMode = 'grid' | 'list'
type ViewMode = 'comfortable' | 'compact'

const numberFormat = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 3,
  }).format(value)

export default function PembelianPaket() {
  const notify = useToast()
  const dateFieldRef = useRef<HTMLDivElement>(null)
  const packageFieldRef = useRef<HTMLDivElement>(null)
  const [packageOpen, setPackageOpen] = useState(false)
  const [neededDate, setNeededDate] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [items, setItems] = useState<PackageItemRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [stockRows, setStockRows] = useState<StockRow[]>([])
  const [products, setProducts] = useState<
    { id: number; name: string; unit: string }[]
  >([])

  const [layout, setLayout] = useState<LayoutMode>('grid')
  const [view, setView] = useState<ViewMode>('comfortable')
  const [packageId, setPackageId] = useState('')
  const [packageCount, setPackageCount] = useState('1')
  const [productSearch, setProductSearch] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])
  const [allocations, setAllocations] = useState<
    Record<string, Record<string, number>>
  >({})
  const [expandedSuppliers, setExpandedSuppliers] = useState<
    Record<string, boolean>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingOrder, setSavingOrder] = useState(false)
  const [savedSig, setSavedSig] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError('')

      const [
        packageResult,
        itemResult,
        supplierResult,
        stockResult,
        productResult,
      ] = await Promise.all([
        supabase
          .from('packages')
          .select('id,name,is_active')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('package_items')
          .select('id,package_id,product_id,item_name,quantity,unit')
          .order('id'),
        supabase
          .from('suppliers')
          .select('id,name,phone,is_active,sapaan')
          .order('name'),
        supabase
          .from('stock_batches')
          .select('product_id,supplier_id')
          .not('supplier_id', 'is', null)
          .limit(5000),
        supabase
          .from('products')
          .select('id,name,unit')
          .order('name'),
      ])

      if (cancelled) return

      const failed = [
        packageResult.error,
        itemResult.error,
        supplierResult.error,
        stockResult.error,
        productResult.error,
      ].find(Boolean)

      if (failed) {
        setError(failed.message)
        setLoading(false)
        return
      }

      setPackages((packageResult.data ?? []) as PackageRow[])
      setItems((itemResult.data ?? []) as PackageItemRow[])
      setSuppliers((supplierResult.data ?? []) as SupplierRow[])
      setStockRows((stockResult.data ?? []) as StockRow[])
      setProducts(
        (productResult.data ?? []) as {
          id: number
          name: string
          unit: string
        }[],
      )
      setLoading(false)
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [])

  // Tutup kalender saat klik di luar atau tekan Escape
  useEffect(() => {
    if (!calendarOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (
        dateFieldRef.current &&
        !dateFieldRef.current.contains(event.target as Node)
      ) {
        setCalendarOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCalendarOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [calendarOpen])

  useEffect(() => {
  if (!packageOpen) return

  const onPointerDown = (event: MouseEvent) => {
    if (
      packageFieldRef.current &&
      !packageFieldRef.current.contains(event.target as Node)
    ) {
      setPackageOpen(false)
    }
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setPackageOpen(false)
  }

  document.addEventListener('mousedown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  return () => {
    document.removeEventListener('mousedown', onPointerDown)
    document.removeEventListener('keydown', onKeyDown)
  }
}, [packageOpen])

  const selectedPackage = packages.find(
    (item) => String(item.id) === packageId,
  )

  const todayLocal = new Date()
  todayLocal.setHours(0, 0, 0, 0)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1,
    )
    const startOffset = (firstDay.getDay() + 6) % 7
    const start = new Date(
      firstDay.getFullYear(),
      firstDay.getMonth(),
      1 - startOffset,
    )
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [calendarMonth])

  const formatDateValue = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const displayNeededDate = neededDate
    ? new Date(`${neededDate}T12:00:00`).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

  const packageItems = useMemo(
    () => items.filter((item) => String(item.package_id) === packageId),
    [items, packageId],
  )

  const needs = useMemo<ProductNeed[]>(() => {
    const count = Math.max(1, Math.floor(Number(packageCount) || 1))
    const grouped = new Map<string, ProductNeed>()

    for (const item of packageItems) {
      const key =
        item.product_id !== null
          ? `product-${item.product_id}`
          : `item-${item.item_name}-${item.unit}`

      const product = products.find((p) => p.id === item.product_id)
      const existing = grouped.get(key)

      if (existing) {
        existing.quantity += Number(item.quantity || 0) * count
      } else {
        grouped.set(key, {
          productId: item.product_id,
          name: product?.name ?? item.item_name,
          unit: product?.unit || item.unit,
          quantity: Number(item.quantity || 0) * count,
        })
      }
    }

    return Array.from(grouped.values())
  }, [packageItems, packageCount, products])

  const availableProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase()

    return needs.filter((need) => need.name.toLowerCase().includes(query))
  }, [needs, productSearch])

  const supplierOptions = useMemo(() => {
    const result = new Map<number, SupplierChoice[]>()

    for (const need of needs) {
      if (need.productId === null) continue

      const supplierIds = new Set(
        stockRows
          .filter((row) => row.product_id === need.productId)
          .map((row) => row.supplier_id)
          .filter((id): id is number => id !== null),
      )

      const choices = suppliers
        .filter((supplier) => supplierIds.has(supplier.id))
        .map((supplier) => ({
          supplierId: supplier.id,
          name: supplier.name,
          phone: supplier.phone,
          isActive: supplier.is_active,
        }))
        .sort(
          (a, b) =>
            Number(b.isActive) - Number(a.isActive) ||
            a.name.localeCompare(b.name),
        )

      result.set(need.productId, choices)
    }

    return result
  }, [needs, stockRows, suppliers])

  function selectPackage(id: string) {
  setPackageId(id)
  setSelectedProductIds([])
  setAllocations({})
  setProductSearch('')
  setPackageOpen(false)
}

  function toggleProduct(productId: number) {
    setSelectedProductIds((current) => {
      const alreadySelected = current.includes(productId)

      if (alreadySelected) {
        setAllocations((previous) => {
          const next = { ...previous }
          delete next[String(productId)]
          return next
        })

        return current.filter((id) => id !== productId)
      }

      return [...current, productId]
    })
  }

  function updateAllocation(
    productId: number,
    supplierId: number,
    quantity: number,
  ) {
    setAllocations((current) => {
      const key = String(productId)
      const productAllocation = { ...(current[key] ?? {}) }

      if (quantity <= 0) {
        delete productAllocation[String(supplierId)]
      } else {
        productAllocation[String(supplierId)] = quantity
      }

      return { ...current, [key]: productAllocation }
    })
  }

  function fillFromPrimarySupplier(productId: number, quantity: number) {
  const primary = (supplierOptions.get(productId) ?? []).find(
    (supplier) => supplier.isActive,
  )

  if (!primary) {
    alert('Belum ada supplier aktif untuk produk ini.')
    return
  }

  setAllocations((current) => ({
    ...current,
    [String(productId)]: {
      [String(primary.supplierId)]: quantity,
    },
  }))
}

  const supplierSummary = useMemo(() => {
    const grouped = new Map<
      number,
      {
        supplier: SupplierRow
        items: {
          productId: number
          name: string
          quantity: number
          unit: string
        }[]
      }
    >()

    for (const need of needs) {
      if (
        need.productId === null ||
        !selectedProductIds.includes(need.productId)
      ) {
        continue
      }

      const productAllocation = allocations[String(need.productId)] ?? {}

      for (const [supplierId, quantity] of Object.entries(productAllocation)) {
        if (quantity <= 0) continue

        const supplier = suppliers.find(
          (item) => String(item.id) === supplierId && item.is_active,
        )

        if (!supplier) continue

        const entry = grouped.get(supplier.id) ?? {
          supplier,
          items: [],
        }

        entry.items.push({
          productId: need.productId,
          name: need.name,
          quantity,
          unit: need.unit,
        })

        grouped.set(supplier.id, entry)
      }
    }

    return Array.from(grouped.values()).sort((a, b) =>
      a.supplier.name.localeCompare(b.supplier.name),
    )
  }, [needs, allocations, suppliers, selectedProductIds])

  const allocationStats = useMemo(() => {
    let fulfilled = 0
    let incomplete = 0
    let excess = 0

    const selectedNeeds = needs.filter(
      (need) =>
        need.productId !== null && selectedProductIds.includes(need.productId),
    )

    for (const need of selectedNeeds) {
      if (need.productId === null) continue

      const allocation = allocations[String(need.productId)] ?? {}
      const total = Object.values(allocation).reduce(
        (sum, quantity) => sum + Math.max(0, quantity),
        0,
      )

      if (Math.abs(total - need.quantity) < 0.000001) {
        fulfilled++
      } else if (total < need.quantity) {
        incomplete++
      } else {
        excess++
      }
    }

    return {
      fulfilled,
      incomplete,
      excess,
      total: selectedNeeds.length,
    }
  }, [needs, allocations, selectedProductIds])

  // penanda isi rekap saat ini, untuk tahu apakah pesanan di kalender sudah sama dengan yang tampil
  const orderSig = JSON.stringify([
    neededDate,
    supplierSummary.map(({ supplier, items: list }) => [
      supplier.id,
      list.map((item) => [item.productId, item.quantity]),
    ]),
  ])
  const orderSaved = savedSig === orderSig

  /** Catat rekap ini ke kalender: satu pesanan per supplier per tanggal (menekan lagi = memperbarui). */
  async function saveOrders() {
    if (!neededDate) {
      notify('Pilih tanggal kebutuhan terlebih dahulu.', 'error')
      return
    }
    if (supplierSummary.length === 0) {
      notify('Alokasikan produk ke supplier terlebih dahulu.', 'error')
      return
    }

    setSavingOrder(true)
    const rows = supplierSummary.map(({ supplier, items: list }) => ({
      source: ORDER_SOURCE,
      supplier_id: supplier.id,
      kind: 'supplier',
      title: supplier.name,
      party: supplier.name,
      due_date: neededDate,
      details: list
        .map((item) => `- ${item.name}: ${numberFormat(item.quantity)} ${item.unit}`)
        .join('\n'),
      status: 'pending',
    }))
    const { error } = await supabase
      .from('scheduled_orders')
      .upsert(rows, { onConflict: 'source,supplier_id,due_date' })
    setSavingOrder(false)

    if (error) {
      notify(`Pesanan gagal ditambahkan: ${errText(error)}`, 'error')
      return
    }
    setSavedSig(orderSig)
    notify(
      rows.length === 1
        ? 'Pesanan ditambahkan ke kalender.'
        : `${rows.length} pesanan supplier ditambahkan ke kalender.`,
    )
    window.dispatchEvent(new Event(ALERTS_REFRESH_EVENT))
  }

  function contactSupplierWhatsApp(
    supplier: SupplierRow,
    supplierItems: {
      name: string
      quantity: number
      unit: string
    }[],
  ) {
    if (!neededDate) {
      alert('Pilih tanggal kebutuhan terlebih dahulu.')
      return
    }

    if (!supplier.phone?.trim()) {
      alert('Nomor telepon supplier belum tersedia.')
      return
    }

    const hour = new Date().getHours()
    const greeting =
      hour >= 4 && hour < 11
        ? 'Selamat pagi'
        : hour >= 11 && hour < 15
          ? 'Selamat siang'
          : hour >= 15 && hour < 18
            ? 'Selamat sore'
            : 'Selamat malam'

    const salutation = supplier.sapaan?.trim() || 'Pak/Bu'
    const formattedDate = new Date(`${neededDate}T12:00:00`).toLocaleDateString(
      'id-ID',
      { day: 'numeric', month: 'long', year: 'numeric' },
    )

    const orderLines = supplierItems.map(
      (item) => `- ${item.name}: ${numberFormat(item.quantity)} ${item.unit}`,
    )

    const orderText =
  supplierItems.length === 1
    ? `Saya mau pesan ${supplierItems[0].name} ${numberFormat(supplierItems[0].quantity)} ${supplierItems[0].unit} untuk tanggal ${formattedDate}.`
    : `Saya mau pesan produk berikut untuk tanggal ${formattedDate}:\n${orderLines.join('\n')}`

const message = [
  `${greeting}, ${salutation}.`,
  orderText,
  `Kira-kira tersedia nggak, ya, ${salutation}?`,
  'Boleh info harga dan konfirmasi ketersediaannya? Terima kasih',
].join('\n\n')

        let phone = supplier.phone.replace(/\D/g, '')
    if (phone.startsWith('00')) phone = phone.slice(2)
    if (phone.startsWith('0')) phone = `62${phone.slice(1)}`
    else if (phone.startsWith('8')) phone = `62${phone}`

    if (phone.length < 9) {
      alert('Nomor telepon supplier tidak valid.')
      return
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    const popup = window.open(url, '_blank')

    if (popup) {
      popup.opener = null
    } else {
      // Pop-up diblokir, buka di tab yang sama
      window.location.href = url
    }
  }

  function resetAllocations() {
    setAllocations({})
  }

  return (
    <div className="page purchase-page">
      <style>{`

/* ───────── Dropdown paket ───────── */
.pp-select-trigger { min-height: 48px; }
.pp-select-menu {
  position: absolute; z-index: 50; top: calc(100% + 9px); left: 0; right: 0;
  max-height: 260px; overflow-y: auto; padding: 6px;
  border: 1px solid var(--purchase-line); border-radius: 14px;
  background: var(--purchase-panel); color: var(--purchase-text);
  box-shadow: var(--pp-pop);
  transform-origin: top left; animation: purchase-pop .24s var(--pp-ease);
}
.pp-select-option {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; padding: 10px 12px; border: 0; border-radius: 10px;
  background: transparent; color: var(--purchase-text); font-size: 13px;
  text-align: left; cursor: pointer;
}
.pp-select-option:hover { background: var(--purchase-panel-soft); }
.pp-select-option.is-active { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
.pp-select-option svg { flex-shrink: 0; }
.pp-select-empty { margin: 0; padding: 10px 12px; font-size: 13px; color: var(--purchase-muted); }



        /* ───────── Token ───────── */
        .purchase-page {
          --purchase-panel: var(--surface);
          --purchase-panel-soft: var(--surface-2);
          --purchase-line: var(--border);
          --purchase-text: var(--text);
          --purchase-muted: var(--muted);
          --pp-accent: var(--primary);
          --pp-line-strong: color-mix(in srgb, var(--primary) 45%, var(--border));
          --pp-a06: color-mix(in srgb, var(--primary) 6%, transparent);
          --pp-a10: color-mix(in srgb, var(--primary) 10%, transparent);
          --pp-a14: color-mix(in srgb, var(--primary) 16%, transparent);
          --pp-a45: color-mix(in srgb, var(--primary) 45%, transparent);
          --pp-faint: color-mix(in srgb, var(--muted) 55%, transparent);
          --pp-pop: var(--shadow-md);
          --pp-ease: cubic-bezier(.22, 1, .36, 1);
          --pp-spring: cubic-bezier(.34, 1.56, .64, 1);
          -webkit-tap-highlight-color: transparent;
        }

        /* ───────── Animasi dasar ───────── */
        @keyframes pp-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pp-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pp-pop { 0% { transform: scale(.55); opacity: 0; } 60% { transform: scale(1.18); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes pp-shimmer { 0% { background-position: -420px 0; } 100% { background-position: 420px 0; } }
        @keyframes pp-spin { to { transform: rotate(360deg); } }
        @keyframes purchase-pop { from { opacity: 0; transform: translateY(-6px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .pp-enter { animation: pp-rise .5s var(--pp-ease) backwards; }
        .pp-stagger { animation: pp-rise .45s var(--pp-ease) backwards; animation-delay: calc(var(--i, 0) * 38ms); }
        .pp-pop { animation: pp-pop .38s var(--pp-spring); }
        .pp-fade { animation: pp-fade .28s ease-out; }

        /* ───────── Card ───────── */
        .purchase-page .card {
          border: 1px solid var(--purchase-line);
          border-radius: 18px;
          box-shadow: var(--shadow-sm);
          transition: box-shadow .3s var(--pp-ease), border-color .3s var(--pp-ease);
        }
        .purchase-page .card:hover { border-color: var(--pp-line-strong); box-shadow: var(--shadow-md); }
        .purchase-page .card h2 { letter-spacing: -.01em; }

        /* ───────── Input & select ───────── */
        .purchase-page input:not([type=checkbox]), .purchase-page select {
          min-height: 44px; border-radius: 12px; border: 1px solid var(--purchase-line);
          background-color: var(--purchase-panel); color: var(--purchase-text);
          padding: 10px 13px; outline: none;
          transition: border-color .2s var(--pp-ease), box-shadow .2s var(--pp-ease), background .2s var(--pp-ease), transform .2s var(--pp-ease);
        }
        .purchase-page input:not([type=checkbox]):hover:not(:disabled), .purchase-page select:hover { border-color: var(--pp-line-strong); }
        .purchase-page input:not([type=checkbox]):focus, .purchase-page select:focus { border-color: var(--primary); box-shadow: 0 0 0 4px var(--pp-a14); }
        .purchase-page input:disabled { cursor: not-allowed; }
        .purchase-page select { cursor: pointer; padding-right: 38px; }
        .purchase-page select option { background: var(--purchase-panel); color: var(--purchase-text); padding: 10px; }
        .purchase-page input[type=checkbox] { width: 18px; height: 18px; flex-shrink: 0; accent-color: var(--primary); cursor: pointer; transition: transform .2s var(--pp-spring); }
        .purchase-page input[type=checkbox]:active:not(:disabled) { transform: scale(.82); }
        .purchase-page input[type=checkbox]:disabled { cursor: not-allowed; }
        .pp-count::-webkit-outer-spin-button, .pp-count::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .pp-count { -moz-appearance: textfield; font-weight: 600; font-variant-numeric: tabular-nums; }

        /* ───────── Tombol ───────── */
        .purchase-page button { transition: transform .22s var(--pp-ease), border-color .2s var(--pp-ease), background .2s var(--pp-ease), box-shadow .2s var(--pp-ease), opacity .2s var(--pp-ease); -webkit-user-select: none; user-select: none; }
        .purchase-page button:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
        .purchase-page button:disabled { cursor: not-allowed; }
        .purchase-page .btn { cursor: pointer; }
        .purchase-page .btn:hover:not(:disabled) { transform: translateY(-1px); border-color: var(--pp-line-strong); box-shadow: var(--shadow-sm); }
        .purchase-page .btn:active:not(:disabled) { transform: translateY(0) scale(.96); box-shadow: none; transition-duration: .08s; }
        .purchase-page .btn[aria-pressed=true] { border-color: var(--primary); background: var(--primary-soft); box-shadow: inset 0 0 0 1px var(--pp-a45); }
        .purchase-page .btn svg { transition: transform .35s var(--pp-ease); }
        .purchase-page .btn:hover:not(:disabled) svg { transform: scale(1.1); }
        .pp-refresh:hover:not(:disabled) svg { transform: rotate(180deg) !important; }

        /* ───────── Skeleton loading ───────── */
        .pp-skeleton { display: grid; gap: 14px; }
        .pp-skeleton span { display: block; height: 16px; border-radius: 8px; background: linear-gradient(90deg, var(--purchase-panel-soft) 0%, color-mix(in srgb, var(--primary) 10%, var(--purchase-panel-soft)) 50%, var(--purchase-panel-soft) 100%); background-size: 840px 100%; animation: pp-shimmer 1.4s linear infinite; }
        .pp-spinner { display: inline-block; animation: pp-spin 1s linear infinite; }

        /* ───────── Tanggal & kalender ───────── */
        .purchase-date-field { position: relative; min-width: 0; }
        .purchase-field-label { display: block; margin-bottom: 8px; }
        .purchase-date-trigger { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 62px; padding: 11px 13px; border: 1px solid var(--purchase-line); border-radius: 13px; color: var(--purchase-text); background: linear-gradient(135deg, var(--purchase-panel-soft), var(--purchase-panel)); text-align: left; cursor: pointer; }
        .purchase-date-trigger:hover { border-color: var(--pp-line-strong); box-shadow: var(--shadow-md); transform: translateY(-1px); }
        .purchase-date-trigger:active { transform: scale(.985); transition-duration: .08s; }
        .purchase-date-trigger[aria-expanded=true] { border-color: var(--primary); box-shadow: 0 0 0 4px var(--pp-a14); }
        .purchase-date-trigger > svg:first-child { flex-shrink: 0; color: var(--primary); transition: transform .35s var(--pp-spring); }
        .purchase-date-trigger:hover > svg:first-child { transform: scale(1.12) rotate(-6deg); }
        .purchase-date-copy { display: grid; gap: 4px; flex: 1; min-width: 0; }
        .purchase-date-copy strong { font-size: 13px; font-weight: 600; }
        .purchase-date-copy small { color: var(--purchase-muted); font-size: 11px; }
        .purchase-date-arrow { color: var(--purchase-muted); transition: transform .3s var(--pp-ease); }
        .purchase-date-trigger[aria-expanded=true] .purchase-date-arrow { transform: rotate(90deg); }
        .purchase-calendar { position: absolute; z-index: 50; top: calc(100% + 9px); left: 0; width: min(330px, calc(100vw - 56px)); padding: 15px; border: 1px solid var(--purchase-line); border-radius: 17px; background: var(--purchase-panel); color: var(--purchase-text); box-shadow: var(--pp-pop); transform-origin: top left; animation: purchase-pop .24s var(--pp-ease); }
        .purchase-calendar-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 17px; }
        .purchase-calendar-head > div:first-child { display: grid; gap: 4px; }
        .purchase-calendar-head strong { font-size: 15px; }
        .purchase-calendar-head small { color: var(--purchase-muted); font-size: 11px; }
        .purchase-calendar-nav { display: flex; gap: 6px; }
        .purchase-calendar-nav button { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--purchase-line); border-radius: 9px; color: var(--purchase-text); background: var(--purchase-panel-soft); cursor: pointer; }
        .purchase-calendar-nav button:hover { background: var(--primary-soft); border-color: var(--pp-line-strong); transform: translateY(-1px); }
        .purchase-calendar-nav button:active { transform: scale(.9); transition-duration: .08s; }
        .purchase-calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
        .purchase-calendar-weekdays { margin-bottom: 7px; }
        .purchase-calendar-weekdays span { display: grid; place-items: center; height: 25px; color: var(--purchase-muted); font-size: 10px; font-weight: 700; }
        .purchase-calendar-day { display: grid; place-items: center; min-width: 0; aspect-ratio: 1; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--purchase-text); font-size: 12px; cursor: pointer; font-variant-numeric: tabular-nums; }
        .purchase-calendar-day:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--pp-line-strong); transform: scale(1.1); }
        .purchase-calendar-day:active:not(:disabled) { transform: scale(.9); transition-duration: .08s; }
        .purchase-calendar-day.outside { color: var(--pp-faint); }
        .purchase-calendar-day.today { border-color: var(--primary); }
        .purchase-calendar-day.selected { background: var(--primary); color: var(--on-primary); border-color: var(--primary); font-weight: 800; box-shadow: 0 4px 14px var(--pp-a45); animation: pp-pop .32s var(--pp-spring); }
        .purchase-calendar-day:disabled { color: var(--pp-faint); opacity: .55; cursor: not-allowed; }
        .purchase-calendar-foot { display: flex; justify-content: space-between; gap: 10px; margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--purchase-line); }
        .purchase-calendar-foot button { border: 0; background: transparent; color: var(--primary); font-size: 12px; font-weight: 600; cursor: pointer; padding: 6px 8px; border-radius: 8px; }
        .purchase-calendar-foot button:hover { background: var(--primary-soft); }
        .purchase-calendar-foot button:active { transform: scale(.94); transition-duration: .08s; }

        /* ───────── Tile produk ───────── */
        .pp-tile { cursor: pointer; }
        .pp-tile:hover:not(:disabled) { transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .pp-tile:active:not(:disabled) { transform: scale(.975); box-shadow: var(--shadow-sm); transition-duration: .08s; }
        .pp-tile.is-selected { box-shadow: 0 0 0 3px var(--pp-a14); }
        .pp-tile:disabled { opacity: .5; }
        .pp-tile-icon { transition: background .25s var(--pp-ease), transform .3s var(--pp-spring); }
        .pp-tile:hover:not(:disabled) .pp-tile-icon { transform: scale(1.06); }
        .pp-tile-icon svg { display: block; }

        /* ───────── Panel alokasi & rekap ───────── */
        .pp-panel { border: 1px solid var(--border); border-radius: 14px; transition: border-color .3s var(--pp-ease), box-shadow .3s var(--pp-ease); }
        .pp-panel:hover { border-color: var(--pp-line-strong); }
        .pp-panel.is-done { border-color: color-mix(in srgb, var(--success) 55%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 10%, transparent); }

        .pp-supplier-row { padding: 8px 10px; margin: 0 -10px; border-radius: 12px; transition: background .25s var(--pp-ease); }
        .pp-supplier-row:hover:not(.is-off) { background: var(--pp-a06); }
        .pp-supplier-row.is-on { background: var(--pp-a10); }
        .pp-supplier-row input[type=number] { transition: border-color .2s var(--pp-ease), box-shadow .2s var(--pp-ease), background .2s var(--pp-ease); font-variant-numeric: tabular-nums; }

        .pp-bar { position: relative; height: 6px; border-radius: 999px; overflow: hidden; background: var(--purchase-panel-soft); }
        .pp-bar > span { position: absolute; inset: 0 auto 0 0; display: block; border-radius: 999px; transition: width .55s var(--pp-ease), background .3s var(--pp-ease); }

        /* ───────── Lipat/buka rekap ───────── */
        .pp-collapse { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .4s var(--pp-ease), opacity .3s var(--pp-ease); }
        .pp-collapse.open { grid-template-rows: 1fr; opacity: 1; }
        .pp-collapse-inner { min-height: 0; overflow: hidden; }
        .pp-toggle { cursor: pointer; border-radius: 10px; }
        .pp-toggle:hover .pp-chev { background: var(--purchase-panel-soft); }
        .pp-toggle:active { transform: scale(.985); transition-duration: .08s; }
        .pp-chev { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0; transition: background .2s var(--pp-ease); }
        .pp-chev svg { transition: transform .35s var(--pp-ease); }
        .pp-toggle[aria-expanded=true] .pp-chev svg { transform: rotate(90deg); }

        .pp-summary-card { transition: transform .3s var(--pp-ease), box-shadow .3s var(--pp-ease), border-color .3s var(--pp-ease); }
        .pp-summary-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }

        @media (max-width: 640px) { .purchase-page .card { border-radius: 15px; } .purchase-calendar { left: 0; } }

        /* ───────── Hormati preferensi kurangi gerakan ───────── */
        @media (prefers-reduced-motion: reduce) {
          .purchase-page *, .purchase-page *::before, .purchase-page *::after { animation: none !important; transition: none !important; }
        }
      `}</style>
      <PageHeader
        title="Pembelian Paket"
        subtitle="Pilih produk yang dibutuhkan, lalu atur pembelian ke satu atau beberapa supplier."
      />

      {error && (
        <div
          className="card pp-enter"
          role="alert"
          style={{ marginBottom: 20 }}
        >
          <p>Gagal memuat data: {error}</p>
          <button
            type="button"
            className="btn btn-secondary pp-refresh"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={16} /> Muat ulang
          </button>
        </div>
      )}

      {loading ? (
        <div className="card" aria-busy="true">
          <p style={{ marginTop: 0 }}>
            <RefreshCw
              size={15}
              className="pp-spinner"
              style={{ verticalAlign: 'middle', marginRight: 8 }}
            />
            Memuat data paket, produk, dan supplier...
          </p>
          <div className="pp-skeleton">
            <span style={{ width: '72%' }} />
            <span style={{ width: '90%' }} />
            <span style={{ width: '54%' }} />
          </div>
        </div>
      ) : (
        <>
          <section className="card pp-enter" style={{ marginBottom: 20 }}>
            <h2 style={{ marginTop: 0 }}>
              <PackageCheck size={20} style={{ verticalAlign: 'middle' }} />{' '}
              Siapkan Paket
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              <div className="purchase-date-field" ref={packageFieldRef}>
  <span className="purchase-field-label">Pilih paket</span>
  <button
    type="button"
    className="purchase-date-trigger pp-select-trigger"
    aria-expanded={packageOpen}
    aria-haspopup="listbox"
    onClick={() => setPackageOpen((open) => !open)}
  >
    <PackageCheck size={18} />
    <span className="purchase-date-copy">
      <strong>{selectedPackage?.name ?? 'Pilih paket'}</strong>
    </span>
    <ChevronRight size={17} className="purchase-date-arrow" />
  </button>

  {packageOpen && (
    <div className="pp-select-menu" role="listbox" aria-label="Pilih paket">
      {packages.length === 0 ? (
        <p className="pp-select-empty">Belum ada paket aktif.</p>
      ) : (
        packages.map((item) => {
          const active = String(item.id) === packageId
          return (
            <button
              type="button"
              key={item.id}
              role="option"
              aria-selected={active}
              className={`pp-select-option ${active ? 'is-active' : ''}`}
              onClick={() => selectPackage(String(item.id))}
            >
              <span>{item.name}</span>
              {active && <Check size={16} />}
            </button>
          )
        })
      )}
    </div>
  )}
</div>

              <div>
                <span style={{ display: 'block', marginBottom: 8 }}>
                  Jumlah paket
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    aria-label="Kurangi jumlah paket"
                    disabled={Number(packageCount) <= 1}
                    onClick={() =>
                      setPackageCount(
                        String(Math.max(1, Number(packageCount || 1) - 1)),
                      )
                    }
                  >
                    <Minus size={16} />
                  </button>

                  <input
                    type="number"
                    className="pp-count"
                    min="1"
                    step="1"
                    value={packageCount}
                    onChange={(event) =>
                      setPackageCount(
                        event.target.value === ''
                          ? ''
                          : String(
                              Math.max(
                                1,
                                Math.floor(Number(event.target.value) || 1),
                              ),
                            ),
                      )
                    }
                    onBlur={() =>
                      setPackageCount(
                        String(
                          Math.max(1, Math.floor(Number(packageCount) || 1)),
                        ),
                      )
                    }
                    style={{
                      width: '100%',
                      minWidth: 0,
                      textAlign: 'center',
                    }}
                  />

                  <button
                    type="button"
                    className="btn btn-secondary"
                    aria-label="Tambah jumlah paket"
                    onClick={() =>
                      setPackageCount(
                        String(Math.max(1, Number(packageCount) || 1) + 1),
                      )
                    }
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="purchase-date-field" ref={dateFieldRef}>
                <span className="purchase-field-label">Tanggal dibutuhkan</span>
                <button
                  type="button"
                  className={`purchase-date-trigger ${neededDate ? 'has-value' : ''}`}
                  aria-expanded={calendarOpen}
                  aria-haspopup="dialog"
                  onClick={() => setCalendarOpen((open) => !open)}
                >
                  <CalendarDays size={18} />
                  <span className="purchase-date-copy">
                    <strong>
                      {displayNeededDate || 'Pilih tanggal pesanan'}
                    </strong>
                    <small>
                      {neededDate
                        ? 'Tanggal pesanan dipilih'
                        : 'Tentukan kapan produk dibutuhkan'}
                    </small>
                  </span>
                  <ChevronRight size={17} className="purchase-date-arrow" />
                </button>
                {calendarOpen && (
                  <div
                    className="purchase-calendar"
                    role="dialog"
                    aria-label="Pilih tanggal kebutuhan"
                  >
                    <div className="purchase-calendar-head">
                      <div>
                        <strong key={formatDateValue(calendarMonth)} className="pp-fade">
                          {calendarMonth.toLocaleDateString('id-ID', {
                            month: 'long',
                            year: 'numeric',
                          })}
                        </strong>
                        <small>Pilih tanggal kebutuhan</small>
                      </div>
                      <div className="purchase-calendar-nav">
                        <button
                          type="button"
                          aria-label="Bulan sebelumnya"
                          onClick={() =>
                            setCalendarMonth(
                              (month) =>
                                new Date(
                                  month.getFullYear(),
                                  month.getMonth() - 1,
                                  1,
                                ),
                            )
                          }
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <button
                          type="button"
                          aria-label="Bulan berikutnya"
                          onClick={() =>
                            setCalendarMonth(
                              (month) =>
                                new Date(
                                  month.getFullYear(),
                                  month.getMonth() + 1,
                                  1,
                                ),
                            )
                          }
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="purchase-calendar-grid purchase-calendar-weekdays">
                      {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(
                        (day) => (
                          <span key={day}>{day}</span>
                        ),
                      )}
                    </div>
                    <div
                      className="purchase-calendar-grid pp-fade"
                      key={formatDateValue(calendarMonth)}
                    >
                      {calendarDays.map((date) => {
                        const value = formatDateValue(date)
                        const disabled = date < todayLocal
                        const selected = value === neededDate
                        const currentMonth =
                          date.getMonth() === calendarMonth.getMonth()
                        const isToday = value === formatDateValue(todayLocal)
                        return (
                          <button
                            type="button"
                            key={value}
                            disabled={disabled}
                            className={`purchase-calendar-day ${selected ? 'selected' : ''} ${!currentMonth ? 'outside' : ''} ${isToday ? 'today' : ''}`}
                            onClick={() => {
                              setNeededDate(value)
                              setCalendarOpen(false)
                            }}
                          >
                            {date.getDate()}
                          </button>
                        )
                      })}
                    </div>
                    <div className="purchase-calendar-foot">
                      <button
                        type="button"
                        onClick={() => {
                          setNeededDate('')
                          setCalendarOpen(false)
                        }}
                      >
                        Hapus tanggal
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNeededDate(formatDateValue(todayLocal))
                          setCalendarOpen(false)
                        }}
                      >
                        Hari ini
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {selectedPackage && (
            <>
              <section
                className="card pp-enter"
                key={`produk-${selectedPackage.id}`}
                style={{ marginBottom: 20 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>
                      <ShoppingBasket
                        size={20}
                        style={{ verticalAlign: 'middle' }}
                      />{' '}
                      Pilih Produk
                    </h2>
                    <p style={{ opacity: 0.7, margin: '6px 0 0', fontSize: 13 }}>
                      Pilih produk yang ingin dialokasikan ke supplier.
                    </p>
                  </div>

                  <span
                    key={selectedProductIds.length}
                    className={selectedProductIds.length > 0 ? 'pp-pop' : ''}
                    style={{
                      fontSize: 13,
                      opacity: 0.75,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {selectedProductIds.length} dari {needs.length} dipilih
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  <Search size={18} style={{ flexShrink: 0, opacity: 0.65 }} />
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Cari produk dalam paket..."
                    aria-label="Cari produk dalam paket"
                    style={{ width: '100%', minWidth: 0 }}
                  />
                  {productSearch && (
                    <button
                      type="button"
                      className="btn btn-secondary pp-pop"
                      aria-label="Hapus pencarian"
                      onClick={() => setProductSearch('')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {needs.length === 0 ? (
                  <p>
                    Paket ini belum memiliki daftar produk. Periksa isi paket
                    di menu Master Paket.
                  </p>
                ) : availableProducts.length === 0 ? (
                  <p className="pp-fade">
                    Produk tidak ditemukan. Coba kata kunci lain.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        layout === 'grid'
                          ? 'repeat(auto-fit, minmax(200px, 1fr))'
                          : 'minmax(0, 1fr)',
                      gap: view === 'comfortable' ? 12 : 6,
                    }}
                  >
                    {availableProducts.map((need, index) => {
                      const selected =
                        need.productId !== null &&
                        selectedProductIds.includes(need.productId)

                      return (
                        <button
                          key={`${need.productId}-${need.name}-${index}`}
                          type="button"
                          aria-pressed={selected}
                          disabled={need.productId === null}
                          className={`pp-tile pp-stagger ${selected ? 'is-selected' : ''}`}
                          onClick={() => {
                            if (need.productId !== null) {
                              toggleProduct(need.productId)
                            }
                          }}
                          style={
                            {
                              '--i': Math.min(index, 14),
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: view === 'comfortable' ? 14 : 9,
                              borderRadius: 12,
                              border: selected
                                ? '1px solid var(--primary)'
                                : '1px solid var(--border)',
                              background: selected
                                ? 'var(--surface-2)'
                                : 'transparent',
                              color: 'inherit',
                              minWidth: 0,
                            } as CSSProperties
                          }
                        >
                          <span
                            className="pp-tile-icon"
                            style={{
                              display: 'grid',
                              placeItems: 'center',
                              width: 38,
                              height: 38,
                              flexShrink: 0,
                              borderRadius: 10,
                              background: 'var(--surface-2)',
                            }}
                          >
                            {selected ? (
                              <span className="pp-pop" key="on">
                                <CheckCircle2 size={20} />
                              </span>
                            ) : (
                              <Package size={20} />
                            )}
                          </span>

                          <span style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ display: 'block' }}>
                              {need.name}
                            </strong>
                            <span
                              style={{
                                display: 'block',
                                opacity: 0.7,
                                fontSize: 12,
                                marginTop: 4,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              Kebutuhan: {numberFormat(need.quantity)}{' '}
                              {need.unit}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-pressed={layout === 'grid'}
                      onClick={() => setLayout('grid')}
                    >
                      <LayoutGrid size={16} /> Grid
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-pressed={layout === 'list'}
                      onClick={() => setLayout('list')}
                    >
                      <List size={16} /> List
                    </button>
                    <select
                      aria-label="Kepadatan tampilan"
                      value={view}
                      onChange={(event) =>
                        setView(event.target.value as ViewMode)
                      }
                    >
                      <option value="comfortable">Nyaman</option>
                      <option value="compact">Ringkas</option>
                    </select>
                  </div>

                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    Klik produk untuk memilih atau membatalkan.
                  </span>
                </div>
              </section>

              {selectedProductIds.length > 0 && (
                <section className="card pp-enter" style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <h2 style={{ margin: 0 }}>
                        <Truck size={20} style={{ verticalAlign: 'middle' }} />{' '}
                        Alokasi Supplier
                      </h2>
                      <p
                        style={{
                          opacity: 0.7,
                          fontSize: 13,
                          margin: '6px 0 0',
                        }}
                      >
                        Bagikan kebutuhan ke satu atau beberapa supplier.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary pp-refresh"
                      onClick={resetAllocations}
                    >
                      <RefreshCw size={15} /> Reset alokasi
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: 16 }}>
                    {needs
                      .filter(
                        (need) =>
                          need.productId !== null &&
                          selectedProductIds.includes(need.productId),
                      )
                      .map((need) => {
                        const productId = need.productId!
                        const options = supplierOptions.get(productId) ?? []
                        const current = allocations[String(productId)] ?? {}
                        const allocated = Object.values(current).reduce(
                          (sum, quantity) => sum + Math.max(0, quantity),
                          0,
                        )
                        const difference = need.quantity - allocated
                        const complete = Math.abs(difference) < 0.000001
                        const percent =
                          need.quantity > 0
                            ? Math.min(100, (allocated / need.quantity) * 100)
                            : 0
                        const barColor = complete
                          ? 'var(--success)'
                          : difference < 0
                            ? 'var(--warning)'
                            : 'var(--primary)'
                        const statusText = complete
                          ? 'Terpenuhi'
                          : difference > 0
                            ? `Kurang ${numberFormat(difference)} ${need.unit}`
                            : `Lebih ${numberFormat(-difference)} ${need.unit}`

                        return (
                          <article
                            key={productId}
                            className={`pp-panel pp-enter ${complete ? 'is-done' : ''}`}
                            style={{
                              padding: view === 'comfortable' ? 16 : 10,
                              display: 'grid',
                              gap: 12,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 10,
                                flexWrap: 'wrap',
                              }}
                            >
                              <div>
                                <strong>{need.name}</strong>
                                <div
                                  style={{
                                    fontSize: 12,
                                    opacity: 0.7,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  Kebutuhan: {numberFormat(need.quantity)}{' '}
                                  {need.unit}
                                </div>
                              </div>

                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() =>
                                  fillFromPrimarySupplier(
                                    productId,
                                    need.quantity,
                                  )
                                }
                              >
                                <CheckCircle2 size={15} /> Penuhi otomatis
                              </button>
                            </div>

                            <div
                              className="pp-bar"
                              role="progressbar"
                              aria-label={`Progres alokasi ${need.name}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(percent)}
                            >
                              <span
                                style={{
                                  width: `${percent}%`,
                                  background: barColor,
                                }}
                              />
                            </div>

                            {options.length === 0 ? (
                              <p style={{ margin: 0 }}>
                                Belum ada riwayat supplier untuk produk ini.
                              </p>
                            ) : (
                              <div style={{ display: 'grid', gap: 4 }}>
                                {options.map((supplier) => {
                                  const quantity =
                                    current[String(supplier.supplierId)] ?? 0

                                  return (
                                    <div
                                      key={supplier.supplierId}
                                      className={`pp-supplier-row ${quantity > 0 ? 'is-on' : ''} ${!supplier.isActive ? 'is-off' : ''}`}
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns:
                                          'minmax(0, 1fr) 100px',
                                        alignItems: 'center',
                                        gap: 12,
                                        opacity: supplier.isActive ? 1 : 0.5,
                                      }}
                                    >
                                      <label
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 10,
                                          minWidth: 0,
                                          cursor: supplier.isActive
                                            ? 'pointer'
                                            : 'not-allowed',
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={quantity > 0}
                                          disabled={!supplier.isActive}
                                          onChange={(event) => {
                                            const allocatedOthers =
                                              Object.entries(current).reduce(
                                                (sum, [id, value]) =>
                                                  id ===
                                                  String(supplier.supplierId)
                                                    ? sum
                                                    : sum + value,
                                                0,
                                              )

                                            const remaining = Math.max(
                                              0,
                                              need.quantity - allocatedOthers,
                                            )

                                            updateAllocation(
                                              productId,
                                              supplier.supplierId,
                                              event.target.checked
                                                ? remaining
                                                : 0,
                                            )
                                          }}
                                        />
                                        <span
                                          style={{
                                            minWidth: 0,
                                            overflowWrap: 'anywhere',
                                          }}
                                        >
                                          <strong>{supplier.name}</strong>
                                          <small
                                            style={{
                                              display: 'block',
                                              opacity: 0.7,
                                            }}
                                          >
                                            {supplier.isActive
                                              ? 'Aktif'
                                              : 'Tidak aktif'}
                                          </small>
                                        </span>
                                      </label>

                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={quantity || ''}
                                        placeholder="0"
                                        disabled={!supplier.isActive}
                                        aria-label={`Jumlah ${need.name} dari ${supplier.name}`}
                                        onChange={(event) =>
                                          updateAllocation(
                                            productId,
                                            supplier.supplierId,
                                            Math.max(
                                              0,
                                              Number(event.target.value) || 0,
                                            ),
                                          )
                                        }
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            <div
                              style={{
                                borderTop: '1px solid var(--border)',
                                paddingTop: 10,
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                                flexWrap: 'wrap',
                                fontSize: 13,
                              }}
                            >
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                Dialokasikan: {numberFormat(allocated)}{' '}
                                {need.unit}
                              </span>

                              <strong
                                key={statusText}
                                className="pp-fade"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  color: complete
                                    ? 'var(--success)'
                                    : 'var(--warning)',
                                }}
                              >
                                {complete ? (
                                  <span
                                    className="pp-pop"
                                    style={{ display: 'inline-flex' }}
                                  >
                                    <CheckCircle2 size={14} />
                                  </span>
                                ) : (
                                  <AlertCircle size={14} />
                                )}
                                {statusText}
                              </strong>
                            </div>
                          </article>
                        )
                      })}
                  </div>

                  <p style={{ opacity: 0.7, fontSize: 12, marginBottom: 0 }}>
                    Supplier berasal dari riwayat barang masuk. Supplier
                    nonaktif tetap ditampilkan, tetapi tidak dapat dipilih.
                  </p>
                </section>
              )}

              {selectedProductIds.length > 0 && (
                <section className="card pp-enter">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <h2 style={{ margin: 0 }}>
                        <Truck size={20} style={{ verticalAlign: 'middle' }} />{' '}
                        Rekap per Supplier
                      </h2>
                      <p
                        style={{
                          opacity: 0.7,
                          fontSize: 13,
                          margin: '6px 0 0',
                        }}
                      >
                        Rangkuman jumlah yang dialokasikan.
                      </p>
                    </div>

                    <span
                      key={allocationStats.fulfilled}
                      className="pp-pop"
                      style={{
                        fontSize: 13,
                        opacity: 0.8,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {allocationStats.fulfilled}/{allocationStats.total}{' '}
                      produk terpenuhi
                    </span>
                  </div>

                  {supplierSummary.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12,
                        margin: '0 0 16px',
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void saveOrders()}
                        disabled={savingOrder || !neededDate || orderSaved}
                      >
                        {orderSaved ? <Check size={16} /> : <CalendarDays size={16} />}{' '}
                        {savingOrder
                          ? 'Menambahkan…'
                          : orderSaved
                            ? 'Pesanan sudah di kalender'
                            : savedSig
                              ? 'Perbarui pesanan'
                              : 'Tambahkan pesanan'}
                      </button>
                      <span style={{ fontSize: 13, opacity: 0.75 }}>
                        {!neededDate
                          ? 'Pilih tanggal kebutuhan dulu supaya pesanan masuk kalender.'
                          : 'Pesanan tiap supplier masuk ke kalender. Tombol WhatsApp hanya jika ingin langsung menghubungi supplier.'}
                      </span>
                    </div>
                  )}

                  {supplierSummary.length === 0 ? (
                    <p>
                      Alokasikan jumlah produk ke supplier aktif untuk
                      menampilkan rekap pesanan.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          layout === 'grid'
                            ? 'repeat(auto-fit, minmax(240px, 1fr))'
                            : 'minmax(0, 1fr)',
                        gap: view === 'comfortable' ? 14 : 8,
                      }}
                    >
                      {supplierSummary.map(
                        ({ supplier, items: supplierItems }, index) => {
                          const expanded =
                            expandedSuppliers[String(supplier.id)] ?? true

                          return (
                            <article
                              key={supplier.id}
                              className="pp-panel pp-summary-card pp-stagger"
                              style={
                                {
                                  '--i': Math.min(index, 10),
                                  padding: view === 'comfortable' ? 16 : 10,
                                  minWidth: 0,
                                  alignSelf: 'start',
                                } as CSSProperties
                              }
                            >
                              <button
                                type="button"
                                className="pp-toggle"
                                aria-expanded={expanded}
                                onClick={() =>
                                  setExpandedSuppliers((current) => ({
                                    ...current,
                                    [String(supplier.id)]: !expanded,
                                  }))
                                }
                                style={{
                                  display: 'flex',
                                  width: '100%',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: 8,
                                  background: 'transparent',
                                  border: 0,
                                  color: 'inherit',
                                  textAlign: 'left',
                                  padding: 0,
                                }}
                              >
                                <span style={{ minWidth: 0 }}>
                                  <strong>{supplier.name}</strong>
                                  <span
                                    style={{
                                      display: 'block',
                                      fontSize: 12,
                                      opacity: 0.7,
                                      marginTop: 4,
                                    }}
                                  >
                                    {supplierItems.length} jenis produk
                                  </span>
                                </span>

                                <span className="pp-chev">
                                  <ChevronRight size={16} />
                                </span>
                              </button>

                              <div
                                className={`pp-collapse ${expanded ? 'open' : ''}`}
                                aria-hidden={!expanded}
                              >
                                <div className="pp-collapse-inner">
                                  <ul
                                    style={{
                                      paddingLeft: 20,
                                      margin: '16px 0',
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    {supplierItems.map((item) => (
                                      <li
                                        key={`${item.productId}-${item.name}`}
                                        style={{ marginBottom: 7 }}
                                      >
                                        {item.name}: {numberFormat(item.quantity)}{' '}
                                        {item.unit}
                                      </li>
                                    ))}
                                  </ul>

                                  {supplier.phone && (
                                    <p
                                      style={{
                                        fontSize: 13,
                                        opacity: 0.8,
                                        marginBottom: 12,
                                      }}
                                    >
                                      Telepon: {supplier.phone}
                                    </p>
                                  )}

                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    tabIndex={expanded ? 0 : -1}
                                    onClick={() =>
                                      contactSupplierWhatsApp(
                                        supplier,
                                        supplierItems,
                                      )
                                    }
                                  >
                                    <MessageCircle size={15} /> Hubungi via
                                    WhatsApp
                                  </button>
                                </div>
                              </div>
                            </article>
                          )
                        },
                      )}
                    </div>
                  )}

                  {allocationStats.incomplete > 0 && (
                    <p
                      className="pp-fade"
                      style={{
                        color: 'var(--warning)',
                        fontSize: 13,
                        marginBottom: 0,
                      }}
                    >
                      <AlertCircle
                        size={15}
                        style={{ verticalAlign: 'middle' }}
                      />{' '}
                      {allocationStats.incomplete} produk belum terpenuhi.
                    </p>
                  )}

                  {allocationStats.excess > 0 && (
                    <p
                      className="pp-fade"
                      style={{
                        color: 'var(--warning)',
                        fontSize: 13,
                        marginBottom: 0,
                      }}
                    >
                      <AlertCircle
                        size={15}
                        style={{ verticalAlign: 'middle' }}
                      />{' '}
                      Alokasi melebihi kebutuhan pada {allocationStats.excess}{' '}
                      produk.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}