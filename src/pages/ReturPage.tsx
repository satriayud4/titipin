import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { errText } from '../lib/errors'
import { imageUrl } from '../lib/image'
import { shortDay, todayWIB } from '../lib/dates'

interface BatchRow {
  batch_id: number
  received_date: string
  sellable_until: string
  return_due_date: string
  product_id: number
  qty_remaining: number
}

export default function ReturPage() {
  const notify = useToast()
  const confirm = useConfirm()
  const [params] = useSearchParams()
  const preBatch = useRef(Number(params.get('batch')) || 0)

  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [products, setProducts] = useState<Map<number, { name: string; image_path: string | null }>>(new Map())
  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '')
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [qty, setQty] = useState<Record<number, string>>({})
  const [loadingB, setLoadingB] = useState(false)
  const [summary, setSummary] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const [s, p] = await Promise.all([
        supabase.from('suppliers').select('id, name').order('name'),
        supabase.from('products').select('id, name, image_path'),
      ])
      setSuppliers((s.data ?? []) as { id: number; name: string }[])
      setProducts(
        new Map(
          (p.data ?? []).map((x) => [x.id as number, { name: x.name as string, image_path: x.image_path as string | null }]),
        ),
      )
    })()
  }, [])

  const loadBatches = useCallback(
    async (sid: string) => {
      if (!sid) {
        setBatches([])
        return
      }
      setLoadingB(true)
      const { data, error } = await supabase
        .from('batch_stock')
        .select('batch_id, received_date, sellable_until, return_due_date, product_id, qty_remaining')
        .eq('supplier_id', Number(sid))
        .gt('qty_remaining', 0)
        .order('received_date')
      setLoadingB(false)
      if (error) {
        notify(errText(error), 'error')
        return
      }
      const rows = (data ?? []) as BatchRow[]
      setBatches(rows)
      // dari tombol Retur di halaman Stok: batch itu langsung terisi seluruh sisanya
      const pre = rows.find((r) => r.batch_id === preBatch.current)
      if (pre) setQty({ [pre.batch_id]: String(pre.qty_remaining) })
      preBatch.current = 0
    },
    [notify],
  )

  useEffect(() => {
    void loadBatches(supplierId)
  }, [supplierId, loadBatches])

  const today = todayWIB()
  const supplierName = suppliers.find((s) => String(s.id) === supplierId)?.name ?? ''
  const nameOf = (id: number) => products.get(id)?.name ?? '-'
  const lines = batches.map((b) => ({ ...b, q: Number(qty[b.batch_id] || 0) })).filter((l) => l.q > 0)
  const totalQty = lines.reduce((n, l) => n + l.q, 0)

  function statusBadge(b: BatchRow) {
    if (b.sellable_until >= today && b.received_date <= today) return <span className="badge badge-success">Masih dijual</span>
    if (b.return_due_date < today) return <span className="badge badge-danger">Terlambat retur</span>
    if (b.return_due_date === today) return <span className="badge badge-warning">Retur hari ini</span>
    return <span className="badge badge-muted">Retur {shortDay(b.return_due_date)}</span>
  }

  function validate(): string {
    for (const b of batches) {
      const q = Number(qty[b.batch_id] || 0)
      if (!Number.isInteger(q) || q < 0) return `Jumlah retur ${nameOf(b.product_id)} harus bilangan bulat, minimal 0.`
      if (q > b.qty_remaining) return `Jumlah retur ${nameOf(b.product_id)} melebihi sisa stok (${b.qty_remaining}).`
    }
    if (lines.length === 0) return 'Isi jumlah retur minimal untuk satu barang.'
    return ''
  }

  function toSummary() {
    const msg = validate()
    if (msg) notify(msg, 'error')
    else setSummary(true)
  }

  async function save() {
    const ok = await confirm({
      title: 'Simpan retur?',
      message: `${totalQty} barang akan dikembalikan ke ${supplierName}. Stok berkurang, barang tidak ditagihkan, dan retur tidak bisa dihapus.`,
      confirmText: 'Ya, simpan retur',
    })
    if (!ok) return
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
    setQty({})
    setSummary(false)
    await loadBatches(supplierId)
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Retur ke Supplier" subtitle="Kembalikan barang yang belum terjual. Stok berkurang dan barang tidak ditagihkan." />

      <div className="toolbar">
        <label className="field" style={{ minWidth: 240 }}>
          <span>Supplier</span>
          <select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value)
              setQty({})
            }}
          >
            <option value="">— pilih supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        {batches.length > 0 && (
          <div className="head-actions" style={{ alignSelf: 'flex-end' }}>
            <button type="button" onClick={() => setQty(Object.fromEntries(batches.map((b) => [b.batch_id, String(b.qty_remaining)])))}>
              Retur semua sisa
            </button>
            <button type="button" onClick={() => setQty({})}>Kosongkan</button>
          </div>
        )}
      </div>

      {!supplierId ? (
        <EmptyState title="Pilih supplier" text="Pilih supplier untuk melihat barang yang masih tersisa dan bisa diretur." />
      ) : loadingB ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 78, borderRadius: 14 }} />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <EmptyState title="Tidak ada stok tersisa" text="Semua barang dari supplier ini sudah terjual atau sudah diretur." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {batches.map((b) => {
            const p = products.get(b.product_id)
            const on = Number(qty[b.batch_id] || 0) > 0
            return (
              <div key={b.batch_id} className={`rcard${on ? ' on' : ''}`}>
                {p?.image_path ? <img className="rcard-img" src={imageUrl(p.image_path)} alt="" loading="lazy" /> : <div className="rcard-img"><Package size={22} /></div>}
                <div className="rcard-main">
                  <div style={{ fontWeight: 700 }}>{nameOf(b.product_id)}</div>
                  <div className="page-sub">Masuk {shortDay(b.received_date)} · sisa {b.qty_remaining}</div>
                  <div style={{ marginTop: 4 }}>{statusBadge(b)}</div>
                </div>
                <div className="rcard-qty">
                  <input
                    className="qty-input"
                    type="number"
                    min={0}
                    max={b.qty_remaining}
                    inputMode="numeric"
                    placeholder="0"
                    aria-label={`Jumlah retur ${nameOf(b.product_id)}`}
                    value={qty[b.batch_id] ?? ''}
                    onChange={(e) => setQty({ ...qty, [b.batch_id]: e.target.value })}
                  />
                  <button type="button" className="btn-sm" onClick={() => setQty({ ...qty, [b.batch_id]: String(b.qty_remaining) })}>
                    Semua
                  </button>
                </div>
              </div>
            )
          })}

          <div className="summary-bar">
            <div className="summary-items">
              <div><b>{totalQty} barang</b>dari {lines.length} produk</div>
            </div>
            <button type="button" className="btn-primary" onClick={toSummary} disabled={lines.length === 0}>
              Lihat ringkasan
            </button>
          </div>
        </div>
      )}

      {summary && (
        <Modal
          title="Ringkasan retur"
          onClose={() => !busy && setSummary(false)}
          footer={
            <>
              <button type="button" onClick={() => setSummary(false)} disabled={busy}>Kembali</button>
              <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan retur'}
              </button>
            </>
          }
        >
          <div className="page-sub">Supplier</div>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>{supplierName}</div>
          {lines.map((l) => (
            <div key={l.batch_id} className="sum-row">
              <span>{nameOf(l.product_id)} <small>(masuk {shortDay(l.received_date)})</small></span>
              <b>{l.q}</b>
            </div>
          ))}
          <div className="sum-row total">
            <span>Total</span>
            <span>{totalQty} barang · {lines.length} produk</span>
          </div>
        </Modal>
      )}
    </div>
  )
}