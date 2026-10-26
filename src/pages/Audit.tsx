import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import DateRangePicker from '../components/DateRangePicker'
import SelectSheet from '../components/SelectSheet'
import Pagination from '../components/Pagination'
import Drawer, { DetailRow } from '../components/Drawer'
import PrintButton from '../components/PrintButton'
import { errText } from '../lib/errors'
import { addDays, todayWIB } from '../lib/dates'
import { isMissingSetup } from '../lib/promo'
import './Audit.css'

interface AuditRow {
  id: number
  at: string
  user_id: string | null
  user_email: string | null
  table_name: string
  row_id: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed: Record<string, { dari: unknown; jadi: unknown }> | null
}

const TABLES: Record<string, string> = {
  products: 'Produk',
  categories: 'Kategori',
  suppliers: 'Supplier',
  stock_batches: 'Stok',
  stock_adjustments: 'Barang rusak/penyesuaian',
  sales: 'Transaksi',
  promo_rules: 'Promo',
  day_overrides: 'Kalender (buka/tutup)',
  store_hours: 'Jam buka mingguan',
  payment_accounts: 'Rekening pembayaran',
  profiles: 'Pengguna',
  store_settings: 'Pengaturan toko',
  packages: 'Paket',
  supplier_payments: 'Pembayaran supplier',
}
const ACTIONS: Record<string, { label: string; cls: string }> = {
  INSERT: { label: 'Ditambah', cls: 'badge-success' },
  UPDATE: { label: 'Diubah', cls: 'badge-info' },
  DELETE: { label: 'Dihapus', cls: 'badge-danger' },
}
const tableLabel = (t: string) => TABLES[t] ?? t
const humanize = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  return s.length > 90 ? `${s.slice(0, 90)}…` : s
}
const fmtTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })

function summary(r: AuditRow): string {
  if (r.action === 'UPDATE' && r.changed) {
    return Object.entries(r.changed)
      .slice(0, 3)
      .map(([k, v]) => `${humanize(k)}: ${fmtVal(v.dari)} → ${fmtVal(v.jadi)}`)
      .join(' · ')
  }
  const d = r.new_data ?? r.old_data ?? {}
  const name = (d.name ?? d.title ?? d.note ?? d.day ?? '') as string
  return name ? String(name) : `ID ${r.row_id ?? '-'}`
}

const PAGE_SIZES = [25, 50, 100]

export default function Audit() {
  const notify = useToast()
  const today = todayWIB()
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [table, setTable] = useState('')
  const [action, setAction] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [users, setUsers] = useState<Map<string, string>>(new Map())
  const [detail, setDetail] = useState<AuditRow | null>(null)

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('id, full_name')
      .then(({ data }) => setUsers(new Map((data ?? []).map((u) => [u.id as string, u.full_name as string]))))
  }, [])

  // filter berubah -> kembali ke halaman 1
  useEffect(() => {
    setPage(1)
  }, [from, to, table, action, q, pageSize])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .gte('at', `${from}T00:00:00+07:00`)
      .lte('at', `${to}T23:59:59.999+07:00`)
      .order('at', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (table) query = query.eq('table_name', table)
    if (action) query = query.eq('action', action)
    const t = q.trim()
    if (t) query = query.or(`row_id.eq.${t.replace(/[,()]/g, '')},user_email.ilike.%${t.replace(/[,()%]/g, '')}%`)
    const { data, error, count } = await query
    setLoading(false)
    if (error) {
      if (isMissingSetup(error)) setSetupNeeded(true)
      else notify(errText(error), 'error')
      return
    }
    setSetupNeeded(false)
    setRows((data ?? []) as AuditRow[])
    setTotal(count ?? 0)
  }, [from, to, table, action, q, page, pageSize, notify])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [load, q])

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const who = (r: AuditRow) => (r.user_id && users.get(r.user_id)) || r.user_email || 'Sistem'
  const tableOptions = useMemo(() => [{ value: '', label: 'Semua data' }, ...Object.entries(TABLES).map(([value, label]) => ({ value, label }))], [])

  if (setupNeeded) {
    return (
      <div>
        <PageHeader title="Riwayat Perubahan" />
        <div className="pm-setup">
          <History size={22} />
          <h2>Riwayat perubahan belum dipasang</h2>
          <p>Buka Supabase → SQL Editor, jalankan file <code>supabase/6-transaksi-aman-dan-audit.sql</code>, lalu muat ulang halaman ini.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="audit">
      <PageHeader
        title="Riwayat Perubahan"
        subtitle="Siapa mengubah apa dan kapan. Catatan ini otomatis dan tidak bisa diubah dari aplikasi."
        actions={<PrintButton />}
      />

      <div className="audit-filters no-print">
        <DateRangePicker from={from} to={to} max={today} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <SelectSheet label="Jenis data" value={table} onChange={(v) => setTable(String(v))} options={tableOptions} />
        <SelectSheet
          label="Jenis perubahan"
          value={action}
          onChange={(v) => setAction(String(v))}
          options={[{ value: '', label: 'Semua perubahan' }, { value: 'INSERT', label: 'Ditambah' }, { value: 'UPDATE', label: 'Diubah' }, { value: 'DELETE', label: 'Dihapus' }]}
        />
        <label className="search" style={{ maxWidth: 'none' }}>
          <Search size={18} />
          <input placeholder="Cari ID data atau email pengguna" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <div className="print-only audit-print-head">
        Riwayat perubahan {from} s.d. {to}
      </div>

      {loading ? (
        <div className="audit-list">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 68, borderRadius: 14 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Tidak ada perubahan" text="Tidak ada catatan perubahan pada rentang dan filter ini." />
      ) : (
        <div className="audit-list">
          {rows.map((r, i) => (
            <button key={r.id} type="button" className="audit-row" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }} onClick={() => setDetail(r)}>
              <span className={`badge ${ACTIONS[r.action].cls}`}>{ACTIONS[r.action].label}</span>
              <span className="audit-main">
                <strong>{tableLabel(r.table_name)} <small>#{r.row_id ?? '-'}</small></strong>
                <span className="audit-sum">{summary(r)}</span>
              </span>
              <span className="audit-meta">
                <b>{who(r)}</b>
                <small>{fmtTime(r.at)}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <Pagination page={page} pages={pages} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} sizes={PAGE_SIZES} />
      )}

      {detail && (
        <Drawer title={`${ACTIONS[detail.action].label}: ${tableLabel(detail.table_name)}`} subtitle={`ID ${detail.row_id ?? '-'} · ${fmtTime(detail.at)}`} onClose={() => setDetail(null)}>
          <section className="dr-sec">
            <h3>Pelaku</h3>
            <DetailRow label="Pengguna">{who(detail)}</DetailRow>
            {detail.user_email && <DetailRow label="Email">{detail.user_email}</DetailRow>}
          </section>
          <section className="dr-sec">
            <h3>{detail.action === 'UPDATE' ? 'Yang berubah' : detail.action === 'INSERT' ? 'Data yang ditambahkan' : 'Data yang dihapus'}</h3>
            {detail.action === 'UPDATE' && detail.changed ? (
              <div className="audit-diff">
                {Object.entries(detail.changed).map(([k, v]) => (
                  <div key={k} className="audit-diff-row">
                    <span>{humanize(k)}</span>
                    <s>{fmtVal(v.dari)}</s>
                    <b>{fmtVal(v.jadi)}</b>
                  </div>
                ))}
              </div>
            ) : (
              Object.entries((detail.new_data ?? detail.old_data ?? {}) as Record<string, unknown>).map(([k, v]) => (
                <DetailRow key={k} label={humanize(k)}>{fmtVal(v)}</DetailRow>
              ))
            )}
          </section>
        </Drawer>
      )}
    </div>
  )
}
