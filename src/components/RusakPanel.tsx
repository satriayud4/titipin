import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from './Toast'
import { useConfirm } from './ConfirmDialog'
import { errText } from '../lib/errors'

interface Props {
  batchId: number
  productName: string
  supplierName: string
  remaining: number
  onCancel: () => void
  onSaved: () => void
}

export default function RusakPanel({ batchId, productName, supplierName, remaining, onCancel, onSaved }: Props) {
  const notify = useToast()
  const confirm = useConfirm()
  const { session } = useAuth()
  const [qty, setQty] = useState('')
  const [cause, setCause] = useState<'' | 'toko' | 'supplier'>('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = Number(qty)
    if (qty.trim() === '' || !Number.isInteger(n) || n <= 0) {
      notify('Jumlah barang rusak wajib diisi (angka bulat lebih dari 0).', 'error')
      return
    }
    if (n > remaining) {
      notify(`Jumlah melebihi sisa stok (${remaining}).`, 'error')
      return
    }
    if (!cause) {
      notify('Pilih penyebab: rusak di toko atau rusak dari supplier.', 'error')
      return
    }
    if (reason.trim() === '') {
      notify('Alasan wajib diisi.', 'error')
      return
    }
    const info =
      cause === 'toko'
        ? 'Barang tetap dibayar ke supplier dan dihitung sebagai kerugian toko.'
        : 'Barang tidak ditagihkan oleh supplier.'
    const ok = await confirm({
      title: 'Catat barang rusak?',
      message: `${n} ${productName} akan dicatat sebagai rusak. ${info} Catatan ini tidak bisa dihapus.`,
      confirmText: 'Ya, catat',
    })
    if (!ok) return

    setBusy(true)
    const { error } = await supabase.from('stock_adjustments').insert({
      batch_id: batchId,
      type: 'rusak',
      qty: n,
      borne_by: cause,
      reason: reason.trim(),
      created_by: session?.user.id,
    })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify(`${n} ${productName} dicatat sebagai barang rusak.`)
    onSaved()
  }

  const option = (value: 'toko' | 'supplier', title: string, desc: string) => (
    <label
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        border: cause === value ? '2px solid var(--primary)' : '1px solid var(--border)',
        background: cause === value ? 'var(--primary-soft)' : 'transparent',
        borderRadius: 12,
        padding: 10,
        cursor: 'pointer',
        fontWeight: 400,
      }}
    >
      <input type="radio" name="cause" checked={cause === value} onChange={() => setCause(value)} style={{ marginTop: 3 }} />
      <span>
        <strong>{title}</strong>
        <br />
        <small>{desc}</small>
      </span>
    </label>
  )

  return (
    <form noValidate onSubmit={(e) => void save(e)} className="form-stack">
      <div>
        <strong>{productName}</strong>
        <div className="page-sub">{supplierName} · sisa {remaining}</div>
      </div>

      <label className="field">
        <span>Jumlah rusak <span className="req">*</span></span>
        <input type="number" min={1} max={remaining} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>

      <div className="field">
        <span>Penyebab <span className="req">*</span></span>
        {option('toko', 'Rusak di toko', 'Ditanggung toko: tetap dibayar ke supplier, tercatat sebagai kerugian.')}
        {option('supplier', 'Rusak dari supplier', 'Sudah rusak saat datang. Ditanggung supplier: tidak ditagihkan.')}
      </div>

      <label className="field">
        <span>Alasan <span className="req">*</span></span>
        <input placeholder="Contoh: jatuh saat ditata / basi / kemasan bocor" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>

      <div className="form-actions">
        <button type="button" onClick={onCancel} disabled={busy}>Batal</button>
        <button disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </form>
  )
}