import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, PackageCheck, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import './Paket.css'

interface PackageItem {
  name: string
  quantity: number
  unit: string
}

interface PackageRow {
  id: number
  name: string
  description: string | null
  price: number
  original_price: number | null
  is_active: boolean
  items: PackageItem[]
}

type Filter = 'all' | 'active' | 'off'
const PREVIEW = 4

const qty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(n)

export default function PackagesPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'kasir'
  const notify = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const [packages, setPackages] = useState<PackageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [pk, it] = await Promise.all([
      supabase.from('packages').select('*').order('name'),
      supabase.from('package_items').select('package_id, item_name, quantity, unit, sort_order').order('sort_order'),
    ])
    const error = pk.error || it.error
    if (error) {
      notify(errText(error), 'error')
      setLoading(false)
      return
    }

    const byPackage = new Map<number, PackageItem[]>()
    for (const r of (it.data ?? []) as { package_id: number; item_name: string; quantity: number; unit: string }[]) {
      const list = byPackage.get(r.package_id) ?? []
      list.push({ name: r.item_name, quantity: Number(r.quantity), unit: r.unit })
      byPackage.set(r.package_id, list)
    }
    setPackages(
      ((pk.data ?? []) as Omit<PackageRow, 'items'>[]).map((p) => ({ ...p, items: byPackage.get(p.id) ?? [] })),
    )
    setLoading(false)
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  async function removePackage(pkg: PackageRow) {
    if (!canManage) return
    const ok = await confirm({
      title: 'Hapus paket ini?',
      message: `Paket "${pkg.name}" dan daftar isinya akan dihapus permanen.`,
      confirmText: 'Ya, hapus',
      tone: 'danger',
    })
    if (!ok) return

    const { data, error } = await supabase.from('packages').delete().eq('id', pkg.id).select('id')
    if (error) {
      notify(errText(error), 'error')
      return
    }
    if (!data?.length) {
      notify('Penghapusan ditolak. Periksa izin akses di Supabase.', 'error')
      return
    }
    notify('Paket berhasil dihapus.')
    await load()
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return packages.filter((p) => {
      if (filter === 'active' && !p.is_active) return false
      if (filter === 'off' && p.is_active) return false
      return `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q)
    })
  }, [packages, search, filter])

  const counts = useMemo(
    () => ({ all: packages.length, active: packages.filter((p) => p.is_active).length, off: packages.filter((p) => !p.is_active).length }),
    [packages],
  )

  return (
    <div className="pk">
      <PageHeader
        title="Master Paket"
        subtitle="Satu paket (kotak) bisa berisi beberapa produk berbeda. Dipakai di Pembelian Paket."
        actions={
          canManage ? (
            <button className="btn-primary btn-icon" onClick={() => navigate('/paket/buat')}>
              <Plus size={18} /> Buat Paket
            </button>
          ) : undefined
        }
      />

      <div className="pk-toolbar">
        <div className="search">
          <Search size={18} />
          <input placeholder="Cari nama paket..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pk-filter" role="group" aria-label="Filter status">
          {(
            [
              ['all', 'Semua'],
              ['active', 'Aktif'],
              ['off', 'Nonaktif'],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={`pill${filter === key ? ' on' : ''}`}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label} <span className="pk-count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="pk-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 260, borderRadius: 16 }} />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <EmptyState title="Belum ada paket" text="Buat paket pertama: pilih beberapa produk, atur jumlahnya, lalu simpan." />
      ) : shown.length === 0 ? (
        <EmptyState title="Paket tidak ditemukan" text="Coba kata pencarian atau filter lain." />
      ) : (
        <div className="pk-grid">
          {shown.map((pkg) => {
            const totalQty = pkg.items.reduce((sum, i) => sum + i.quantity, 0)
            const saving = pkg.original_price && pkg.original_price > pkg.price ? pkg.original_price - pkg.price : 0
            const percent = saving > 0 && pkg.original_price ? Math.round((saving / pkg.original_price) * 100) : 0
            const hidden = Math.max(0, pkg.items.length - PREVIEW)

            return (
              <article key={pkg.id} className={`pk-card${pkg.is_active ? '' : ' off'}`}>
                <header className="pk-head">
                  <span className="pk-icon" aria-hidden="true">
                    <PackageCheck size={22} />
                  </span>
                  <div className="pk-title">
                    <h2>{pkg.name}</h2>
                    <span className={`badge ${pkg.is_active ? 'badge-success' : 'badge-muted'}`}>
                      {pkg.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                </header>

                {pkg.description && <p className="pk-desc">{pkg.description}</p>}

                <div className="pk-price">
                  <strong>{rupiah(Number(pkg.price))}</strong>
                  <span>/ paket</span>
                  {saving > 0 && (
                    <>
                      <s>{rupiah(Number(pkg.original_price))}</s>
                      <span className="badge badge-success">Hemat {percent}%</span>
                    </>
                  )}
                </div>

                <div className="pk-items">
                  <div className="pk-items-head">
                    <Package size={14} />
                    {pkg.items.length === 0
                      ? 'Belum ada isi'
                      : `Isi paket · ${pkg.items.length} produk, ${qty(totalQty)} item`}
                  </div>
                  <ul>
                    {pkg.items.slice(0, PREVIEW).map((item, i) => (
                      <li key={i}>
                        <span>{item.name}</span>
                        <b>
                          {qty(item.quantity)} {item.unit}
                        </b>
                      </li>
                    ))}
                  </ul>
                  {hidden > 0 && <div className="pk-more">+{hidden} produk lainnya</div>}
                </div>

                {canManage && (
                  <div className="pk-actions">
                    <button className="btn-sm btn-icon" onClick={() => navigate(`/paket/${pkg.id}/ubah`)}>
                      <Pencil size={15} /> Ubah
                    </button>
                    <button className="btn-sm btn-icon btn-danger" onClick={() => void removePackage(pkg)}>
                      <Trash2 size={15} /> Hapus
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
