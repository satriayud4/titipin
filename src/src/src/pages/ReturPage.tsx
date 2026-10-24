import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Copy, Minus, Package, Plus, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { errText } from '../lib/errors'
import { imageUrl } from '../lib/image'
import { shortDay, todayWIB } from '../lib/dates'
import './Retur.css'

interface BatchRow {
  batch_id: number
  supplier_id: number
  received_date: string
  sellable_until: string
  return_due_date: string
  product_id: number
  qty_remaining: number
}

/** Urutan urgensi: yang paling mendesak tampil paling atas. */
type Phase = 'late' | 'today' | 'soon' | 'selling'
const PHASES: Phase[] = ['late', 'today', 'soon', 'selling']
const PHASE_META: Record<Phase, { group: string; badge: string; cls: string }> = {
  late: { group: 'Terlambat retur', badge: 'Terlambat', cls: 'badge-danger' },
  today: { group: 'Retur hari ini', badge: 'Hari ini', cls: 'badge-warning' },
  soon: { group: 'Belum jatuh tempo', badge: 'Siap retur', cls: 'badge-info' },
  selling: { group: 'Masih dijual', badge: 'Masih dijual', cls: 'badge-success' },
}

function phaseOf(b: BatchRow, today: string): Phase {
  if (b.sellable_until >= today && b.received_date <= today) return 'selling'
  if (b.return_due_date < today) return 'late'
  if (b.return_due_date === today) return 'today'
  return 'soon'
}

export default function ReturPage() {
  const notify = useToast()
  const [params] = useSearchParams()
  const preBatch = useRef(Number(params.get('batch')) || 0)

  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [products, setProducts] = useState<Map<number, { name: string; image_path: string | null }>>(new Map())
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '')
  const [qty, setQty] = useState<Record<number, number>>({})
  const [search, setSearch] = useState('')
  const [summary, setSummary] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [s, p, b] = await Promise.all([
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('products').select('id, name, image_path'),
      supabase
        .from('batch_stock')
        .select('batch_id, supplier_id, received_date, sellable_until, return_due_date, product_id, qty_remaining')
        .gt('qty_remaining', 0)
        .order('received_date'),
    ])
    if (b.error) {
      notify(errText(b.error), 'error')
      setLoading(false)
      return
    }
    const rows = (b.data ?? []) as BatchRow[]
    setSuppliers((s.data ?? []) as { id: number; name: string }[])
    setProducts(
      new Map(
        (p.data ?? []).map((x) => [x.id as number, { name: x.name as string, image_path: x.image_path as string | null }]),
      ),
    )
    setBatches(rows)

    // dari tombol Retur di halaman Stok: supplier terpilih dan batch itu langsung terisi seluruh sisanya
    const pre = rows.find((r) => r.batch_id === preBatch.current)
    if (pre) {
      setSupplierId(String(pre.supplier_id))
      setQty({ [pre.batch_id]: pre.qty_remaining })
    }
    preBatch.current = 0
    setLoading(false)
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  const today = todayWIB()
  const nameOf = (id: number) => products.get(id)?.name ?? '-'

  const bySupplier = useMemo(() => {
    const m = new Map<number, BatchRow[]>()
    for (const b of batches) m.set(b.supplier_id, [...(m.get(b.supplier_id) ?? []), b])
    return m
  }, [batches])

  /** Supplier yang punya barang untuk diretur, yang paling mendesak di atas. */
  const rail = useMemo(
    () =>
      suppliers
        .filter((s) => bySupplier.has(s.id))
        .map((s) => {
          const list = bySupplier.get(s.id)!
          const worst = Math.min(...list.map((b) => PHASES.indexOf(phaseOf(b, today))))
          return {
            ...s,
            products: list.length,
            units: list.reduce((n, b) => n + b.qty_remaining, 0),
            phase: PHASES[worst],
            picked: list.filter((b) => (qty[b.batch_id] ?? 0) > 0).length,
          }
        })
        .sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.name.localeCompare(b.name)),
    [suppliers, bySupplier, qty, today],
  )

  // langsung buka supplier paling mendesak, tanpa harus memilih dulu
  useEffect(() => {
    if (loading || rail.length === 0) return
    if (!rail.some((r) => String(r.id) === supplierId)) setSupplierId(String(rail[0].id))
  }, [loading, rail, supplierId])

  const supplierName = suppliers.find((s) => String(s.id) === supplierId)?.name ?? ''
  const current = useMemo(() => bySupplier.get(Number(supplierId)) ?? [], [bySupplier, supplierId])
  const query = search.trim().toLowerCase()
  const groups = PHASES.map((phase) => ({
    phase,
    rows: current.filter((b) => phaseOf(b, today) === phase && (!query || nameOf(b.product_id).toLowerCase().includes(query))),
  })).filter((g) => g.rows.length > 0)

  const lines = current.map((b) => ({ ...b, q: qty[b.batch_id] ?? 0 })).filter((l) => l.q > 0)
  const totalQty = lines.reduce((n, l) => n + l.q, 0)
  const notSelling = current.filter((b) => phaseOf(b, today) !== 'selling')
  const isFull = (b: BatchRow) => (qty[b.batch_id] ?? 0) >= b.qty_remaining

  function setQ(b: BatchRow, n: number) {
    const v = Math.max(0, Math.min(b.qty_remaining, Math.floor(n) || 0))
    setQty((c) => {
      const next = { ...c }
      if (v <= 0) delete next[b.batch_id]
      else next[b.batch_id] = v
      return next
    })
  }

  /** Pilih seluruh sisa untuk sekumpulan barang, atau batalkan bila semuanya sudah terpilih. */
  function toggleMany(rows: BatchRow[]) {
    const allFull = rows.every(isFull)
    setQty((c) => {
      const next = { ...c }
      for (const b of rows) {
        if (allFull) delete next[b.batch_id]
        else next[b.batch_id] = b.qty_remaining
      }
      return next
    })
  }

  function clearCurrent() {
    setQty((c) => {
      const next = { ...c }
      for (const b of current) delete next[b.batch_id]
      return next
    })
  }

  function rowBadge(b: BatchRow) {
    const ph = phaseOf(b, today)
    const label = ph === 'soon' ? `Retur ${shortDay(b.return_due_date)}` : ph === 'late' ? 'Terlambat retur' : ph === 'today' ? 'Retur hari ini' : 'Masih dijual'
    return <span className={`badge ${PHASE_META[ph].cls}`}>{label}</span>
  }

  async function copyDetail() {
    const text = [
      `Retur ke ${supplierName} (${shortDay(today)})`,
      ...lines.map((l) => `- ${nameOf(l.product_id)}: ${l.q}`),
      `Total: ${totalQty} barang`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      notify('Rincian retur disalin.')
    } catch {
      notify('Gagal menyalin rincian.', 'error')
    }
  }

  async function save() {
    if (lines.length === 0) return
    setBusy(true)
    const { error } = await supabase.rpc('create_return', {
      p_supplier_id: Number(supplierId),
      p_items: lines.map((l) => ({ batch_id: l.batch_id, qty: l.q })),
    })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify(`Retur ${totalQty} barang ke ${supplierName} berhasil disimpan.`)
    setQty((c) => {
      const next = { ...c }
      for (const l of lines) delete next[l.batch_id]
      return next
    })
    setSummary(false)
    await load()
  }

  return (
    <div className="rt-page">
      <PageHeader title="Retur ke Supplier" subtitle="Kembalikan barang yang belum terjual. Stok berkurang dan barang tidak ditagihkan." />

      {loading ? (
        <div className="rt">
          <div className="skeleton" style={{ height: 220, borderRadius: 16 }} />
          <div style={{ display: 'grid', gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 84, borderRadius: 16 }} />
            ))}
          </div>
        </div>
      ) : rail.length === 0 ? (
        <EmptyState title="Tidak ada barang untuk diretur" text="Semua barang dari semua supplier sudah terjual atau sudah diretur." />
      ) : (
        <div className="rt">
          <nav className="rt-rail" aria-label="Pilih supplier">
            {rail.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`rt-sup${String(r.id) === supplierId ? ' on' : ''}`}
                aria-pressed={String(r.id) === supplierId}
                onClick={() => {
                  setSupplierId(String(r.id))
                  setSearch('')
                }}
              >
                <span className="rt-avatar">{r.name.trim().charAt(0).toUpperCase()}</span>
                <span className="rt-sup-main">
                  <strong>{r.name}</strong>
                  <small>
                    {r.products} produk · {r.units} barang
                  </small>
                </span>
                <span className="rt-sup-end">
                  <span className={`badge ${PHASE_META[r.phase].cls}`}>{PHASE_META[r.phase].badge}</span>
                  {r.picked > 0 && <span className="rt-picked">{r.picked} dipilih</span>}
                </span>
              </button>
            ))}
          </nav>

          <section className="rt-main" aria-label={`Barang dari ${supplierName}`}>
            <div className="rt-tools">
              <div className="search">
                <Search size={18} />
                <input placeholder="Cari produk…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {search && (
                  <button type="button" className="icon-btn" aria-label="Hapus pencarian" onClick={() => setSearch('')}>
                    <X size={15} />
                  </button>
                )}
              </div>
              <div className="rt-quick">
                {notSelling.length > 0 && (
                  <button type="button" className="btn-sm" onClick={() => toggleMany(notSelling)}>
                    {notSelling.every(isFull) ? 'Batal pilih yang tidak dijual' : `Pilih yang tidak dijual lagi (${notSelling.length})`}
                  </button>
                )}
                {lines.length > 0 && (
                  <button type="button" className="btn-sm btn-ghost" onClick={clearCurrent}>
                    Kosongkan
                  </button>
                )}
              </div>
            </div>

            {groups.length === 0 ? (
              <EmptyState title="Produk tidak ditemukan" text="Coba kata pencarian lain." />
            ) : (
              groups.map(({ phase, rows }) => (
                <div className="rt-group" key={phase}>
                  <div className="rt-group-head">
                    <h2>
                      {PHASE_META[phase].group} <span>{rows.length}</span>
                    </h2>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => toggleMany(rows)}>
                      {rows.every(isFull) ? 'Batal pilih' : 'Pilih semua'}
                    </button>
                  </div>

                  {rows.map((b) => {
                    const p = products.get(b.product_id)
                    const q = qty[b.batch_id] ?? 0
                    return (
                      <div key={b.batch_id} className={`rt-row${q > 0 ? ' on' : ''}`}>
                        <button
                          type="button"
                          className="rt-pick"
                          aria-pressed={isFull(b)}
                          aria-label={`${isFull(b) ? 'Batal pilih' : 'Pilih semua sisa'} ${nameOf(b.product_id)}`}
                          onClick={() => setQ(b, isFull(b) ? 0 : b.qty_remaining)}
                        >
                          {p?.image_path ? <img src={imageUrl(p.image_path)} alt="" loading="lazy" /> : <Package size={22} />}
                          {q > 0 && (
                            <span className="rt-check">
                              <Check size={14} />
                            </span>
                          )}
                        </button>

                        <div className="rt-info">
                          <strong>{nameOf(b.product_id)}</strong>
                          <small>
                            Masuk {shortDay(b.received_date)} · sisa {b.qty_remaining}
                          </small>
                          {rowBadge(b)}
                        </div>

                        <div className="rt-qty">
                          <button type="button" aria-label="Kurangi" disabled={q <= 0} onClick={() => setQ(b, q - 1)}>
                            <Minus size={15} />
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={b.qty_remaining}
                            inputMode="numeric"
                            placeholder="0"
                            aria-label={`Jumlah retur ${nameOf(b.product_id)}`}
                            value={q || ''}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setQ(b, Number(e.target.value))}
                          />
                          <button type="button" aria-label="Tambah" disabled={q >= b.qty_remaining} onClick={() => setQ(b, q + 1)}>
                            <Plus size={15} />
                          </button>
                          <span className="rt-max">/ {b.qty_remaining}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {lines.length > 0 && (
        <div className="rt-bar" role="region" aria-label="Ringkasan pilihan retur">
          <div className="rt-bar-info">
            <b>{totalQty} barang</b>
            <span>
              dari {lines.length} produk · {supplierName}
            </span>
          </div>
          <button type="button" className="btn-primary" onClick={() => setSummary(true)}>
            Tinjau &amp; retur
          </button>
        </div>
      )}

      {summary && (
        <Modal
          title="Konfirmasi retur"
          onClose={() => !busy && setSummary(false)}
          footer={
            <>
              <button type="button" className="btn-ghost btn-icon" onClick={() => void copyDetail()} disabled={busy} style={{ marginRight: 'auto' }}>
                <Copy size={15} /> Salin
              </button>
              <button type="button" onClick={() => setSummary(false)} disabled={busy}>
                Kembali
              </button>
              <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan retur'}
              </button>
            </>
          }
        >
          <div className="page-sub">Dikembalikan ke</div>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>{supplierName}</div>
          {lines.map((l) => (
            <div key={l.batch_id} className="sum-row">
              <span>
                {nameOf(l.product_id)} <small>(masuk {shortDay(l.received_date)})</small>
              </span>
              <b>{l.q}</b>
            </div>
          ))}
          <div className="sum-row total">
            <span>Total</span>
            <span>
              {totalQty} barang · {lines.length} produk
            </span>
          </div>
          <div className="notice notice-warning" style={{ marginTop: 12 }}>
            <span>Stok berkurang, barang tidak ditagihkan, dan retur tidak bisa dihapus setelah disimpan.</span>
          </div>
        </Modal>
      )}
    </div>
  )
}
